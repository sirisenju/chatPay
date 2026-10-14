import { AppError, ErrorCode } from '../types/errors.js';

interface HorizonErrorData {
  extras?: {
    result_codes?: {
      transaction?: string;
      operations?: string[];
    };
  };
  status?: number;
  title?: string;
  detail?: string;
}

export function mapHorizonError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const errObj = err as { response?: { data?: HorizonErrorData; status?: number }; message?: string };
  const data = errObj.response?.data;
  const status = errObj.response?.status;
  const txCode = data?.extras?.result_codes?.transaction;
  const opCodes = data?.extras?.result_codes?.operations || [];

  // 1. Specific operation error codes
  if (opCodes.includes('op_no_trust')) {
    return new AppError('NO_TRUSTLINE', 'Recipient has not enabled USDC trustline', 400, { opCodes });
  }

  if (opCodes.includes('op_no_destination')) {
    return new AppError('DESTINATION_UNFUNDED', 'Recipient account is not funded on Stellar Testnet', 400, { opCodes });
  }

  if (opCodes.includes('op_underfunded')) {
    return new AppError('INSUFFICIENT_FUNDS', 'Not enough USDC balance to complete this payment', 400, { opCodes });
  }

  // 2. Specific transaction error codes
  if (txCode === 'tx_bad_seq') {
    return new AppError('PREVIEW_EXPIRED', 'Payment preview went stale due to account sequence mismatch; please request a new preview', 400, { txCode });
  }

  if (txCode === 'tx_insufficient_balance') {
    return new AppError('INSUFFICIENT_FUNDS', 'Not enough XLM for network fee and minimum base reserve', 400, { txCode });
  }

  if (txCode === 'tx_too_late') {
    return new AppError('PREVIEW_EXPIRED', 'Transaction time bounds expired before submission', 400, { txCode });
  }

  // 3. Network Timeouts or 5xx
  if (status && status >= 500) {
    return new AppError('SUBMIT_FAILED', 'Stellar Horizon service is temporarily unavailable or timed out; please verify transaction status by hash', 502, { status });
  }

  // 4. Default fallback
  const message = data?.detail || errObj.message || 'Payment submission failed on Stellar Testnet';
  return new AppError('SUBMIT_FAILED', message, 400, { data });
}
