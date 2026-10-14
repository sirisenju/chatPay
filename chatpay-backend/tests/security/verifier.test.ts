import { describe, it, expect } from 'vitest';
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { verifySignedTransaction } from '../../src/stellar/verifier.js';
import { STELLAR_CONFIG } from '../../src/config/stellar.js';

describe('Security Unit Tests: XDR Verifier', () => {
  const senderKeypair = Keypair.random();
  const recipientKeypair = Keypair.random();
  const attackerKeypair = Keypair.random();

  const senderAccount = new Account(senderKeypair.publicKey(), '1000');
  const nowUnix = Math.floor(Date.now() / 1000);
  const maxTime = nowUnix + 300;
  const expiresAt = new Date(maxTime * 1000);

  const asset = new Asset(STELLAR_CONFIG.usdc.code, STELLAR_CONFIG.usdc.issuer);
  const validAmount = '10.0000000';
  const validMemo = 'chatpay:test1234';

  function createSignedTx(options?: {
    source?: Account;
    destination?: string;
    amount?: string;
    assetOverride?: Asset;
    memo?: Memo;
    timebounds?: { minTime: number; maxTime: number };
    network?: string;
    signer?: Keypair;
  }) {
    const acc = options?.source || senderAccount;
    const net = options?.network || STELLAR_CONFIG.networkPassphrase;
    const signer = options?.signer || senderKeypair;

    const builder = new TransactionBuilder(acc, {
      fee: '100',
      networkPassphrase: net,
      timebounds: options?.timebounds || { minTime: 0, maxTime }
    })
      .addOperation(
        Operation.payment({
          destination: options?.destination || recipientKeypair.publicKey(),
          asset: options?.assetOverride || asset,
          amount: options?.amount || validAmount
        })
      )
      .addMemo(options?.memo || Memo.text(validMemo));

    const tx = builder.build();
    tx.sign(signer);
    return tx.toXDR();
  }

  it('accepts a valid signed transaction matching the stored preview', () => {
    const signedXdr = createSignedTx();

    const result = verifySignedTransaction({
      signedXdr,
      expectedSourcePublicKey: senderKeypair.publicKey(),
      expectedDestinationPublicKey: recipientKeypair.publicKey(),
      expectedAmount: validAmount,
      expectedAssetCode: STELLAR_CONFIG.usdc.code,
      expectedAssetIssuer: STELLAR_CONFIG.usdc.issuer,
      expectedMemo: validMemo,
      expectedExpiresAt: expiresAt
    });

    expect(result.txHash).toBeDefined();
    expect(result.txHash.length).toBe(64);
  });

  it('rejects a transaction when destination is tampered', () => {
    const tamperedXdr = createSignedTx({
      destination: attackerKeypair.publicKey()
    });

    expect(() =>
      verifySignedTransaction({
        signedXdr: tamperedXdr,
        expectedSourcePublicKey: senderKeypair.publicKey(),
        expectedDestinationPublicKey: recipientKeypair.publicKey(),
        expectedAmount: validAmount,
        expectedExpiresAt: expiresAt
      })
    ).toThrowError(/Payment destination does not match preview/);
  });

  it('rejects a transaction when amount is tampered/inflated', () => {
    const tamperedXdr = createSignedTx({
      amount: '500.0000000'
    });

    expect(() =>
      verifySignedTransaction({
        signedXdr: tamperedXdr,
        expectedSourcePublicKey: senderKeypair.publicKey(),
        expectedDestinationPublicKey: recipientKeypair.publicKey(),
        expectedAmount: '10.0000000',
        expectedExpiresAt: expiresAt
      })
    ).toThrowError(/Payment amount mismatch/);
  });

  it('rejects a transaction when asset issuer is tampered', () => {
    const fakeAsset = new Asset('USDC', attackerKeypair.publicKey());
    const tamperedXdr = createSignedTx({
      assetOverride: fakeAsset
    });

    expect(() =>
      verifySignedTransaction({
        signedXdr: tamperedXdr,
        expectedSourcePublicKey: senderKeypair.publicKey(),
        expectedDestinationPublicKey: recipientKeypair.publicKey(),
        expectedAmount: validAmount,
        expectedAssetCode: 'USDC',
        expectedAssetIssuer: STELLAR_CONFIG.usdc.issuer,
        expectedExpiresAt: expiresAt
      })
    ).toThrowError(/Asset mismatch/);
  });

  it('rejects a transaction signed by an attacker instead of the source account', () => {
    const tamperedXdr = createSignedTx({
      signer: attackerKeypair
    });

    expect(() =>
      verifySignedTransaction({
        signedXdr: tamperedXdr,
        expectedSourcePublicKey: senderKeypair.publicKey(),
        expectedDestinationPublicKey: recipientKeypair.publicKey(),
        expectedAmount: validAmount,
        expectedExpiresAt: expiresAt
      })
    ).toThrowError(/Transaction signature is invalid/);
  });

  it('rejects a transaction with altered memo', () => {
    const tamperedXdr = createSignedTx({
      memo: Memo.text('malicious_memo')
    });

    expect(() =>
      verifySignedTransaction({
        signedXdr: tamperedXdr,
        expectedSourcePublicKey: senderKeypair.publicKey(),
        expectedDestinationPublicKey: recipientKeypair.publicKey(),
        expectedAmount: validAmount,
        expectedMemo: validMemo,
        expectedExpiresAt: expiresAt
      })
    ).toThrowError(/Transaction memo mismatch/);
  });

  it('rejects a transaction when timebounds are tampered or expired', () => {
    const expiredMaxTime = nowUnix - 10;
    const tamperedXdr = createSignedTx({
      timebounds: { minTime: 0, maxTime: expiredMaxTime }
    });

    expect(() =>
      verifySignedTransaction({
        signedXdr: tamperedXdr,
        expectedSourcePublicKey: senderKeypair.publicKey(),
        expectedDestinationPublicKey: recipientKeypair.publicKey(),
        expectedAmount: validAmount,
        expectedExpiresAt: new Date(expiredMaxTime * 1000)
      })
    ).toThrowError(/Transaction expired before submission/);
  });

  it('rejects a transaction constructed for Mainnet network passphrase', () => {
    const mainnetXdr = createSignedTx({
      network: Networks.PUBLIC
    });

    expect(() =>
      verifySignedTransaction({
        signedXdr: mainnetXdr,
        expectedSourcePublicKey: senderKeypair.publicKey(),
        expectedDestinationPublicKey: recipientKeypair.publicKey(),
        expectedAmount: validAmount,
        expectedExpiresAt: expiresAt
      })
    ).toThrowError();
  });
});
