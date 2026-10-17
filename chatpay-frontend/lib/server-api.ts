import 'server-only';
import { resolveBackendBaseUrl } from './backend-config';

export const SESSION_COOKIE = 'chatpay_session';
export function backendUrl(path: string) {
  const base = resolveBackendBaseUrl(process.env.CHATPAY_API_URL, process.env.NODE_ENV);
  return `${base}/${path.replace(/^\/+/, '')}`;
}
export async function backendFetch(path: string, options: RequestInit = {}) {
  return fetch(backendUrl(path), { ...options, cache: 'no-store', signal: AbortSignal.timeout(60000) });
}
