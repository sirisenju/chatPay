export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_FAILED'
  | 'AMBIGUOUS_RECIPIENT'
  | 'UNKNOWN_RECIPIENT'
  | 'UNSUPPORTED_ASSET'
  | 'AMOUNT_OUT_OF_RANGE'
  | 'SELF_TRANSFER_NOT_ALLOWED'
  | 'NO_TRUSTLINE'
  | 'DESTINATION_UNFUNDED'
  | 'INSUFFICIENT_FUNDS'
  | 'PREVIEW_EXPIRED'
  | 'XDR_MISMATCH'
  | 'SUBMIT_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
