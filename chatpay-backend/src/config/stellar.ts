import { Networks } from '@stellar/stellar-sdk';
import { config } from './index.js';

export const STELLAR_CONFIG = {
  horizonUrl: config.STELLAR_HORIZON_URL,
  networkPassphrase: config.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET,
  usdc: {
    code: config.USDC_ASSET_CODE,
    issuer: config.USDC_ISSUER
  },
  testIssuerPublicKey: config.TEST_ISSUER_PUBLIC_KEY,
  maxPaymentCap: config.MAX_PAYMENT_CAP,
  transactionTimeoutSeconds: config.TRANSACTION_TIMEOUT_SECONDS,
  baseFee: '100', // stroops default
  explorerBaseUrl: 'https://stellar.expert/explorer/testnet/tx'
} as const;
