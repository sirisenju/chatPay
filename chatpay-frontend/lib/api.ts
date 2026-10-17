export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = '') { super(message); this.status = status; this.code = code; }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/chatpay/${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers }, signal: options.signal ?? AbortSignal.timeout(65000) }); }
  catch { throw new ApiError('Cannot reach ChatPay. Please check your connection and try again.', 0); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname === '/chat') window.location.replace('/connect-wallet');
    throw new ApiError(data?.message || 'The request could not be completed. Please try again.', response.status, data?.code || '');
  }
  return data as T;
}
