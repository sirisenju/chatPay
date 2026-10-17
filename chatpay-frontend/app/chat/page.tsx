import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { backendFetch, SESSION_COOKIE } from '../../lib/server-api';
import Workspace from './workspace';
import type { WalletBalance } from '../../lib/contracts';
async function AuthorizedWorkspace() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/connect-wallet');
  let response: Response;
  try { response = await backendFetch('me/wallet', { headers: { Authorization: `Bearer ${token}` } }); }
  catch { return <div style={{ padding: 40, background: '#f6faf7', color: '#15352c', minHeight: '100svh' }}>The Testnet backend is unavailable. <a href="/chat">Try again</a> or <a href="/connect-wallet">return to your wallet</a>.</div>; }
  if (response.status === 401 || response.status === 403) redirect('/connect-wallet');
  if (!response.ok) return <div style={{ padding: 40, color: '#15352c', background: '#fff' }}>Unable to load your wallet. <a href="/chat">Try again</a>.</div>;
  const wallet: WalletBalance = await response.json();
  if (!wallet.publicKey) redirect('/connect-wallet');
  return <Workspace initialWallet={wallet} />;
}
export default function ChatPage() { return <Suspense fallback={<div style={{ minHeight: '100svh', background: '#f6faf7', color: '#15352c', padding: 40 }}>Verifying your wallet session…</div>}><AuthorizedWorkspace /></Suspense>; }
