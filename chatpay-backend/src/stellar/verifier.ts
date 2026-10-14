import {
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { Decimal } from 'decimal.js';
import { STELLAR_CONFIG } from '../config/stellar.js';
import { AppError } from '../types/errors.js';

export interface VerifySignedXdrParams {
  signedXdr: string;
  expectedSourcePublicKey: string;
  expectedDestinationPublicKey: string;
  expectedAmount: string;
  expectedAssetCode?: string;
  expectedAssetIssuer?: string;
  expectedMemo?: string | null;
  expectedExpiresAt: Date;
}

export interface VerifySignedXdrResult {
  transaction: Transaction;
  txHash: string;
}

export function verifySignedTransaction(params: VerifySignedXdrParams): VerifySignedXdrResult {
  const {
    signedXdr,
    expectedSourcePublicKey,
    expectedDestinationPublicKey,
    expectedAmount,
    expectedAssetCode = STELLAR_CONFIG.usdc.code,
    expectedAssetIssuer = STELLAR_CONFIG.usdc.issuer,
    expectedMemo,
    expectedExpiresAt
  } = params;

  // 1. Decode transaction envelope
  let tx: Transaction;
  try {
    const parsed = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);
    if (!(parsed instanceof Transaction)) {
      throw new AppError('XDR_MISMATCH', 'Fee bump transactions are not supported');
    }
    tx = parsed;
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    throw new AppError('XDR_MISMATCH', 'Failed to decode signed transaction XDR');
  }

  // 2. Validate source account matches authenticated sender
  if (tx.source !== expectedSourcePublicKey) {
    throw new AppError(
      'XDR_MISMATCH',
      `Transaction source account does not match authenticated user (expected ${expectedSourcePublicKey}, got ${tx.source})`
    );
  }

  // 3. Strictly ensure exactly one operation and it's a payment
  if (!tx.operations || tx.operations.length !== 1) {
    throw new AppError(
      'XDR_MISMATCH',
      `Transaction must contain strictly 1 operation (found ${tx.operations?.length || 0})`
    );
  }

  const op = tx.operations[0];
  if (op.type !== 'payment') {
    throw new AppError(
      'XDR_MISMATCH',
      `Transaction operation type must be 'payment' (found '${op.type}')`
    );
  }

  const paymentOp = op as Operation.Payment;

  // 4. Validate destination
  if (paymentOp.destination !== expectedDestinationPublicKey) {
    throw new AppError(
      'XDR_MISMATCH',
      `Payment destination does not match preview (expected ${expectedDestinationPublicKey}, got ${paymentOp.destination})`
    );
  }

  // 5. Validate asset code and issuer
  if (expectedAssetCode === 'XLM') {
    if (!paymentOp.asset.isNative()) {
      throw new AppError('XDR_MISMATCH', 'Expected native XLM asset in payment operation');
    }
  } else {
    if (paymentOp.asset.isNative()) {
      throw new AppError('XDR_MISMATCH', `Expected asset ${expectedAssetCode}, but found native XLM`);
    }
    const assetCode = paymentOp.asset.getCode();
    const assetIssuer = paymentOp.asset.getIssuer();
    if (assetCode !== expectedAssetCode || assetIssuer !== expectedAssetIssuer) {
      throw new AppError(
        'XDR_MISMATCH',
        `Asset mismatch (expected ${expectedAssetCode}:${expectedAssetIssuer}, got ${assetCode}:${assetIssuer})`
      );
    }
  }

  // 6. Validate amount string
  const expectedDec = new Decimal(expectedAmount).toFixed(7);
  const actualDec = new Decimal(paymentOp.amount).toFixed(7);
  if (expectedDec !== actualDec) {
    throw new AppError(
      'XDR_MISMATCH',
      `Payment amount mismatch (expected ${expectedDec}, got ${actualDec})`
    );
  }

  // 7. Validate memo if expected
  if (expectedMemo && expectedMemo.trim().length > 0) {
    const actualMemoValue = tx.memo.value ? tx.memo.value.toString() : '';
    if (actualMemoValue !== expectedMemo.trim().slice(0, 28)) {
      throw new AppError(
        'XDR_MISMATCH',
        `Transaction memo mismatch (expected '${expectedMemo.slice(0, 28)}', got '${actualMemoValue}')`
      );
    }
  }

  // 8. Validate time bounds and expiration
  const nowUnix = Math.floor(Date.now() / 1000);
  const maxTimeUnix = tx.timeBounds?.maxTime ? Number(tx.timeBounds.maxTime) : 0;
  const expectedMaxUnix = Math.floor(expectedExpiresAt.getTime() / 1000);

  if (maxTimeUnix === 0 || maxTimeUnix !== expectedMaxUnix) {
    throw new AppError(
      'XDR_MISMATCH',
      `Transaction time bound maxTime mismatch (expected ${expectedMaxUnix}, got ${maxTimeUnix})`
    );
  }

  if (nowUnix > maxTimeUnix) {
    throw new AppError('PREVIEW_EXPIRED', 'Transaction expired before submission');
  }

  // 9. Cryptographically verify signature
  if (!tx.signatures || tx.signatures.length === 0) {
    throw new AppError('XDR_MISMATCH', 'Transaction does not contain any signatures');
  }

  const txHash = tx.hash();
  const keypair = Keypair.fromPublicKey(expectedSourcePublicKey);

  let hasValidSourceSignature = false;
  for (const sig of tx.signatures) {
    try {
      const signatureBuffer = sig.signature();
      if (keypair.verify(txHash, signatureBuffer)) {
        hasValidSourceSignature = true;
        break;
      }
    } catch {
      // Continue checking other signatures if present
    }
  }

  if (!hasValidSourceSignature) {
    throw new AppError(
      'XDR_MISMATCH',
      'Transaction signature is invalid or not signed by the source account'
    );
  }

  return {
    transaction: tx,
    txHash: txHash.toString('hex')
  };
}
