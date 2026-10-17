const LOCAL_API = 'http://localhost:4000';
const HOSTED_API = 'https://chatpay-7anj.onrender.com';

export function resolveBackendBaseUrl(override: string | undefined, mode: string | undefined): string {
  const value = override?.trim() || (mode === 'production' ? HOSTED_API : LOCAL_API);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('CHATPAY_API_URL must be an HTTP(S) backend URL without credentials, query parameters, or fragments.');
  }
  return url.toString().replace(/\/+$/, '');
}
