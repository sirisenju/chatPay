import { Horizon } from '@stellar/stellar-sdk';
import { STELLAR_CONFIG } from '../config/stellar.js';
import { AppError } from '../types/errors.js';

export class StellarClient {
  public readonly server: Horizon.Server;

  constructor() {
    this.server = new Horizon.Server(STELLAR_CONFIG.horizonUrl, {
      allowHttp: STELLAR_CONFIG.horizonUrl.startsWith('http://')
    });
  }

  /**
   * Loads a Stellar account by its ed25519 public key.
   */
  async loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    try {
      return await this.server.loadAccount(publicKey);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { status?: number } }).response;
        if (resp?.status === 404) {
          throw new AppError('DESTINATION_UNFUNDED', 'Account does not exist on Stellar Testnet', 400);
        }
      }
      throw err;
    }
  }

  /**
   * Reads XLM and USDC balances along with trustline status for an account.
   */
  async getAccountBalances(publicKey: string): Promise<{
    exists: boolean;
    nativeBalance: string;
    usdcBalance: string;
    hasUsdcTrustline: boolean;
  }> {
    try {
      const account = await this.server.loadAccount(publicKey);
      let nativeBalance = '0';
      let usdcBalance = '0';
      let hasUsdcTrustline = false;

      for (const balance of account.balances) {
        if (balance.asset_type === 'native') {
          nativeBalance = balance.balance;
        } else if (
          'asset_code' in balance &&
          'asset_issuer' in balance &&
          balance.asset_code === STELLAR_CONFIG.usdc.code &&
          balance.asset_issuer === STELLAR_CONFIG.usdc.issuer
        ) {
          usdcBalance = balance.balance;
          hasUsdcTrustline = true;
        }
      }

      return {
        exists: true,
        nativeBalance,
        usdcBalance,
        hasUsdcTrustline
      };
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { status?: number } }).response;
        if (resp?.status === 404) {
          return {
            exists: false,
            nativeBalance: '0',
            usdcBalance: '0',
            hasUsdcTrustline: false
          };
        }
      }
      throw err;
    }
  }

  /**
   * Fetches the current base fee recommended by Horizon fee stats.
   */
  async fetchBaseFee(): Promise<string> {
    try {
      const feeStats = await this.server.feeStats();
      if (feeStats && feeStats.fee_charged && feeStats.fee_charged.mode) {
        return Math.max(100, Number(feeStats.fee_charged.mode)).toString();
      }
    } catch {
      // Fall back to default base fee
    }
    return STELLAR_CONFIG.baseFee;
  }

  /**
   * Looks up a transaction on Horizon by its transaction hash.
   */
  async getTransaction(hash: string): Promise<Horizon.ServerApi.TransactionRecord | null> {
    try {
      return await this.server.transactions().transaction(hash).call();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const resp = (err as { response?: { status?: number } }).response;
        if (resp?.status === 404) {
          return null;
        }
      }
      throw err;
    }
  }
}

export const stellarClient = new StellarClient();
