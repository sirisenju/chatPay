import {
  Asset,
  Memo,
  Operation,
  StrKey,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { Decimal } from 'decimal.js';
import { STELLAR_CONFIG } from '../config/stellar.js';
import { stellarClient } from './client.js';
import { AppError } from '../types/errors.js';

export interface BuildPaymentParams {
  sourcePublicKey: string;
  destinationPublicKey: string;
  amount: string;
  assetCode?: string;
  assetIssuer?: string;
  memoText?: string | null;
  timeoutSeconds?: number;
}

export interface BuildPaymentResult {
  unsignedXdr: string;
  txHashExpected: string;
  sourceSeq: string;
  expiresAt: Date;
  fee: string;
}

export async function buildUnsignedPaymentTransaction(
  params: BuildPaymentParams
): Promise<BuildPaymentResult> {
  const {
    sourcePublicKey,
    destinationPublicKey,
    amount,
    assetCode = STELLAR_CONFIG.usdc.code,
    assetIssuer = STELLAR_CONFIG.usdc.issuer,
    memoText,
    timeoutSeconds = STELLAR_CONFIG.transactionTimeoutSeconds
  } = params;

  // 1. Validate public keys
  if (!StrKey.isValidEd25519PublicKey(sourcePublicKey)) {
    throw new AppError('VALIDATION_FAILED', 'Invalid sender Stellar public key');
  }

  if (!StrKey.isValidEd25519PublicKey(destinationPublicKey)) {
    throw new AppError('VALIDATION_FAILED', 'Invalid destination Stellar public key');
  }

  if (sourcePublicKey === destinationPublicKey) {
    throw new AppError('SELF_TRANSFER_NOT_ALLOWED', 'Cannot send payment to your own wallet address');
  }

  // 2. Validate amount precision and cap
  let dec: Decimal;
  try {
    dec = new Decimal(amount);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Invalid payment amount decimal format');
  }

  if (dec.lte(0)) {
    throw new AppError('AMOUNT_OUT_OF_RANGE', 'Payment amount must be greater than zero');
  }

  if (dec.decimalPlaces() > 7) {
    throw new AppError('AMOUNT_OUT_OF_RANGE', 'Stellar supports a maximum of 7 decimal places');
  }

  const maxCap = new Decimal(STELLAR_CONFIG.maxPaymentCap);
  if (dec.gt(maxCap)) {
    throw new AppError(
      'AMOUNT_OUT_OF_RANGE',
      `Payment amount exceeds the maximum per-transaction cap of ${STELLAR_CONFIG.maxPaymentCap} ${assetCode}`
    );
  }

  // 3. Load account from Horizon for sequence number
  const sourceAccount = await stellarClient.loadAccount(sourcePublicKey);

  // 4. Resolve Asset
  const asset =
    assetCode === 'XLM'
      ? Asset.native()
      : new Asset(assetCode, assetIssuer);

  // 5. Compute time bounds
  const nowUnix = Math.floor(Date.now() / 1000);
  const maxTime = nowUnix + timeoutSeconds;
  const expiresAt = new Date(maxTime * 1000);

  // 6. Fetch base fee
  const baseFee = await stellarClient.fetchBaseFee();

  // 7. Format memo if provided
  let memo: Memo = Memo.none();
  if (memoText && memoText.trim().length > 0) {
    const cleanMemo = memoText.trim();
    if (Buffer.byteLength(cleanMemo, 'utf8') > 28) {
      memo = Memo.text(cleanMemo.slice(0, 28));
    } else {
      memo = Memo.text(cleanMemo);
    }
  }

  // 8. Construct Transaction
  const tx = new TransactionBuilder(sourceAccount, {
    fee: baseFee,
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
    timebounds: {
      minTime: 0,
      maxTime
    }
  })
    .addOperation(
      Operation.payment({
        destination: destinationPublicKey,
        asset,
        amount: dec.toFixed(7)
      })
    )
    .addMemo(memo)
    .build();

  return {
    unsignedXdr: tx.toXDR(),
    txHashExpected: tx.hash().toString('hex'),
    sourceSeq: sourceAccount.sequence,
    expiresAt,
    fee: tx.fee
  };
}
