"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Brand from '../components/brand';
import { api } from '../../lib/api';
import { verifyWallet } from '../../lib/wallet';
import { approvePayment } from '../../lib/payment-flow';
import { formatFeeStroops } from '../../lib/format-fee';
import type { CommandResult, Payment, PaymentHistory, Preview, Recipient, WalletBalance } from '../../lib/contracts';
import styles from './workspace.module.css';

type View = 'chat' | 'recipients' | 'activity';
type Stage = 'review' | 'approving' | 'submitting' | 'submitted' | 'confirmed' | 'unknown' | 'failed';
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    chat: <path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-6 2 2-6a9 9 0 1 1 17-4Z" />,
    recipients: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5" /></>,
    activity: <path d="M2 12h5l3-9 4 18 3-9h5" />,
    arrow: <path d="M12 20V4m-7 7 7-7 7 7" />,
    check: <path d="m5 12 4 4L20 5" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v12h5" /></>,
    external: <><path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1" /></>,
    wallet: <><path d="M20 8V4H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6" /><path d="M16 12h6v5h-6z" /></>,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
    sparkle: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5ZM20 2v4m-2-2h4" />,
    plus: <path d="M12 4v16M4 12h16" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.check}</svg>;
}
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
const human = (value: string) => value.replaceAll('_', ' ');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function Workspace({ initialWallet }: { initialWallet: WalletBalance }) {
  const router = useRouter();
  const [wallet, setWallet] = useState(initialWallet);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [history, setHistory] = useState<PaymentHistory>({ items: [], total: 0, limit: 20, offset: 0 });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [stage, setStage] = useState<Stage>('review');
  const [composer, setComposer] = useState('');
  const [command, setCommand] = useState('');
  const [reply, setReply] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [walletRequestPending, setWalletRequestPending] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Payment | null>(null);
  const [offset, setOffset] = useState(0);
  const attemptRef = useRef(0);
  const paymentLock = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const signing = stage === 'approving' || stage === 'submitting';
  const inFlight = walletRequestPending || signing || stage === 'submitted' || stage === 'unknown';
  const address = initialWallet.publicKey;

  const load = useCallback(async (pageOffset = 0) => {
    const results = await Promise.allSettled([
      api<Recipient[]>('recipients'), api<PaymentHistory>(`payments?limit=20&offset=${pageOffset}`), api<WalletBalance>('me/wallet'),
    ]);
    if (results[0].status === 'fulfilled') setRecipients(results[0].value);
    if (results[1].status === 'fulfilled') setHistory(results[1].value);
    if (results[2].status === 'fulfilled') setWallet(results[2].value);
    const failure = results.find(r => r.status === 'rejected');
    if (failure?.status === 'rejected') setError(errorMessage(failure.reason));
  }, []);

  useEffect(() => {
    let active = true;
    async function validate() {
      try {
        const freighter = await import('@stellar/freighter-api');
        await verifyWallet(freighter, address);
        if (active) setReady(true);
      } catch {
        if (active) {
          setReady(false);
          attemptRef.current++;
          await api('logout', { method: 'POST' }).catch(() => {});
          router.replace('/connect-wallet'); router.refresh();
        }
      }
    }
    void validate();
    const focus = () => { if (document.visibilityState === 'visible') void validate(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { active = false; attemptRef.current++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [address, router]);

  useEffect(() => { if (ready) void load(offset); }, [ready, load, offset]);

  const reconcile = useCallback(async (id: string) => {
    const payment = await api<Payment>(`payments/${encodeURIComponent(id)}`);
    setReceipt(payment);
    if (payment.status === 'confirmed') { setStage('confirmed'); void load(offset); }
    else if (payment.status === 'submitted') setStage('submitted');
    else if (['failed', 'expired', 'cancelled'].includes(payment.status)) setStage('failed');
    else setStage('unknown');
    return payment;
  }, [load, offset]);

  useEffect(() => {
    const id = preview?.paymentId;
    if (!id || !['submitted', 'unknown'].includes(stage)) return;
    let active = true;
    const timer = setInterval(() => {
      if (active) void reconcile(id).catch(cause => { if (active) setError(errorMessage(cause)); });
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [preview?.paymentId, stage, reconcile]);

  async function logout() {
    if (signing) return;
    setWorking(true);
    try { await api('logout', { method: 'POST' }); attemptRef.current++; router.replace('/connect-wallet'); router.refresh(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setWorking(false); }
  }
  function navigate(next: View) { setView(next); setSearch(''); setNotice(''); }
  function newPayment() {
    if (inFlight) return;
    setPreview(null); setReceipt(null); setReviewed(false); setCommand(''); setReply(''); setStage('review'); setView('chat'); setComposer('');
    composerRef.current?.focus();
  }
  async function sendCommand(event: FormEvent) {
    event.preventDefault();
    if (!composer.trim() || working || inFlight) return;
    setWorking(true); setError(''); setNotice(''); setOptions([]);
    try {
      const freighter = await import('@stellar/freighter-api'); await verifyWallet(freighter, address);
      const text = composer.trim();
      const result = await api<CommandResult>('commands', { method: 'POST', body: JSON.stringify({ text, clientMsgId: crypto.randomUUID() }) });
      setCommand(text); setReply(result.message); setOptions(result.options || []);
      setReceipt(null); setReviewed(false); setStage('review'); setPreview(result.type === 'preview' ? result.preview || null : null);
      setComposer('');
      if (result.type === 'error') setError(result.message);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setWorking(false); }
  }
  async function approve() {
    if (!preview || !reviewed || paymentLock.current || stage !== 'review') return;
    paymentLock.current = true;
    setWalletRequestPending(true);
    const attempt = ++attemptRef.current;
    let submitted = false;
    setStage('approving'); setError('');
    try {
      const freighter = await import('@stellar/freighter-api');
      const result = await approvePayment(preview, address, freighter, async signedXdr => {
        submitted = true; setStage('submitting');
        return api<{ paymentId: string; status: string; txHash: string; explorerUrl: string }>(`payments/${encodeURIComponent(preview.paymentId)}/submit`, { method: 'POST', body: JSON.stringify({ signedXdr }) });
      }, () => attemptRef.current === attempt);
      setReceipt({ id: result.paymentId, recipientAlias: preview.recipientAlias, recipientAddress: preview.recipientAddress, amount: preview.amount, assetCode: preview.asset, status: result.status, txHash: result.txHash, createdAt: new Date().toISOString() });
      setStage(result.status === 'confirmed' ? 'confirmed' : ['failed', 'expired', 'cancelled'].includes(result.status) ? 'failed' : 'submitted');
      void load(offset);
    } catch (cause) {
      if (attemptRef.current !== attempt) return;
      setError(errorMessage(cause));
      if (submitted) {
        // A network error does not prove that submission failed. Never sign again blindly.
        setStage('unknown');
        await reconcile(preview.paymentId).catch(() => {});
      } else setStage('review');
    } finally { paymentLock.current = false; setWalletRequestPending(false); }
  }
  function cancelApproval() { if (stage !== 'approving') return; attemptRef.current++; setStage('review'); setNotice('Wallet request cancelled in ChatPay. Any later signature will not be submitted.'); }
  async function saveRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const alias = String(data.get('alias') || '').trim(); const destination = String(data.get('address') || '').trim();
    if (!alias || !/^G[A-Z2-7]{55}$/.test(destination)) { setError('Enter a recipient name and a full 56-character Stellar public address beginning with G.'); return; }
    setWorking(true); setError(''); setNotice('');
    try {
      const created = await api<Recipient>('recipients', { method: 'POST', body: JSON.stringify({ alias, address: destination }) });
      setRecipients(items => [...items.filter(i => i.id !== created.id), created]); form.reset();
      setNotice(`Saved ${created.alias}.${created.warnings?.length ? ' ' + created.warnings.join(' ') : ''}`);
    } catch (cause) { setError(errorMessage(cause)); } finally { setWorking(false); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice('Copied to clipboard.'); } catch { setError('Copy failed. You can select and copy the full value displayed on screen.'); } }
  const explorer = (hash: string) => /^[a-f0-9]{64}$/i.test(hash) ? `https://stellar.expert/explorer/testnet/tx/${hash}` : null;
  const visiblePayments = history.items.filter(item => (status === 'all' || item.status === status) && `${item.recipientAlias} ${item.recipientAddress} ${item.txHash || ''}`.toLowerCase().includes(search.toLowerCase()));
  const visibleRecipients = recipients.filter(item => `${item.alias} ${item.address}`.toLowerCase().includes(search.toLowerCase()));
  const hasPayment = preview || receipt;
  const title = view === 'recipients' ? 'Recipients' : view === 'activity' ? 'Activity' : !hasPayment ? 'Chat home' : stage === 'review' ? 'Payment preview' : stage === 'confirmed' ? 'Payment confirmation' : stage === 'approving' ? 'Transaction approval' : 'Payment status';

  function recipientForm() {
    return <section className={styles.card}><h2>Add recipient</h2><p>Associate a name with a Stellar address. Saving does not send a payment.</p><form onSubmit={saveRecipient} className={styles.form}>
      <label>Name<input name="alias" maxLength={50} placeholder="Enter recipient name" required disabled={working} /></label>
      <label>Stellar wallet address<input name="address" minLength={56} maxLength={56} pattern="G[A-Z2-7]{55}" placeholder="Paste full Stellar address" required autoComplete="off" spellCheck={false} disabled={working} /></label>
      <div className={styles.hint}><strong>Use the full address</strong><p>A Stellar public address starts with G and has 56 characters. Never enter a secret key. The backend validates the address and Testnet account.</p></div>
      <div className={styles.actions}><button className={styles.primary} disabled={working}><Icon name="recipients" />Save recipient</button><button type="reset" className={styles.secondary} disabled={working}>Cancel</button></div>
    </form></section>;
  }
  function paymentDetails(payment: Preview | Payment) {
    const asset = 'asset' in payment ? payment.asset : payment.assetCode;
    return <dl className={styles.details}><div><dt>Recipient</dt><dd>{payment.recipientAlias}<span className={styles.fullAddress}>{payment.recipientAddress}</span></dd></div><div><dt>Asset</dt><dd>{asset}</dd></div><div><dt>Network</dt><dd>Stellar Testnet</dd></div><div><dt>Available balance</dt><dd>{wallet.usdcBalance} USDC</dd></div>{'estimatedFee' in payment && <div><dt>Estimated network fee</dt><dd>{formatFeeStroops(payment.estimatedFee) !== null ? `${formatFeeStroops(payment.estimatedFee)} XLM` : 'Unavailable'}</dd></div>}{'memo' in payment && payment.memo && <div><dt>Memo</dt><dd>{payment.memo}</dd></div>}</dl>;
  }
  function hashActions(payment: Payment) {
    const link = payment.txHash && explorer(payment.txHash);
    return payment.txHash ? <div className={styles.hint}><strong>Transaction hash</strong><code className={styles.hash}>{payment.txHash}</code><div className={styles.actions}><button className={styles.secondary} onClick={() => copy(payment.txHash!)}><Icon name="copy" />Copy hash</button>{link && <a className={styles.secondary} href={link} target="_blank" rel="noopener noreferrer"><Icon name="external" />Testnet explorer</a>}</div></div> : null;
  }

  if (!ready) return <div className={styles.loading} role="status">Verifying your connected wallet…</div>;
  return <div className={styles.workspace}>
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <aside className={styles.sidebar}>
      <div><Brand /><p className={styles.connection}><span />Connected · {short(address)}</p></div>
      <nav className={styles.nav} aria-label="Workspace navigation">{(['chat', 'recipients', 'activity'] as View[]).map(item => <button key={item} className={view === item ? styles.active : ''} aria-current={view === item ? 'page' : undefined} onClick={() => navigate(item)}><Icon name={item} />{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
      <div className={styles.balance}><small>Test-USDC balance <span>TESTNET</span></small><strong>{wallet.usdcBalance}<em>USDC</em></strong><p>Test assets have no monetary value.</p><small>XLM: {wallet.nativeBalance}</small></div>
      <div className={styles.sidebarBottom}><div className={styles.hint}><strong>Workspace</strong><p>Review payments, save recipients, and approve in your wallet.</p><span className={styles.badge}>Testnet</span></div><button className={styles.disconnect} onClick={logout} disabled={working || signing}>Disconnect wallet</button></div>
    </aside>
    <main className={styles.main} id="workspace-content">
      <header className={styles.header}><div><h1>{title}</h1><p>{view === 'recipients' ? 'Save a name and Stellar wallet address before sending.' : view === 'activity' ? 'Track payment status and review your Testnet receipts.' : 'Review payments, add recipients, and approve from one workspace.'}</p></div><div className={styles.headerActions}><a className={styles.secondary} href="https://help.freighter.app/" target="_blank" rel="noopener noreferrer"><Icon name="help" />Help</a><button className={styles.secondary} onClick={() => copy(address)} title={address}><span className={styles.dot} />{short(address)}</button></div></header>
      {!wallet.exists && <div className={styles.hint}>This wallet has not been funded on Stellar Testnet yet. Fund it before preparing a payment.</div>}
      {wallet.exists && !wallet.hasUsdcTrustline && <div className={styles.hint}>Your wallet has no USDC trustline. Add the Testnet USDC asset in Freighter before sending USDC.</div>}
      {error && <div className={styles.error} role="alert"><span>{error}</span><button onClick={() => { setError(''); void load(offset); }}>Refresh data</button></div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {view === 'chat' && <div className={styles.columns}>
        <div className={styles.stack}>
          {!hasPayment ? <><section className={`${styles.card} ${styles.welcome}`}><span className={styles.bot}><Icon name="sparkle" />CHATPAY</span><h2>Hey there.<br />Who are we paying?</h2><p>Start with a message. I’ll prepare a preview for you to review — nothing sends until you approve in your wallet.</p></section><section className={styles.card}><div className={styles.cardHeader}><h2>Payment example</h2><span className={styles.badge}>Preview</span></div><button className={styles.example} onClick={() => { setComposer('Send 10 USDC to Alex'); composerRef.current?.focus(); }}>Send 10 USDC to Alex <Icon name="arrow" /></button><p>Use the composer below to enter a payment command. Save a recipient first so ChatPay can find them.</p></section></> : <>
            {command && <div className={styles.command}><small>YOU</small><strong>{command}</strong></div>}
            <section className={styles.card}><div className={styles.cardHeader}><span className={styles.bot}><Icon name="sparkle" />CHATPAY</span><span className={`${styles.badge} ${stage === 'approving' ? styles.warning : ''}`}>{stage === 'review' ? 'Not sent yet' : human(stage)}</span></div>
              <h2>{stage === 'review' ? 'Review your payment' : stage === 'approving' ? 'Waiting for wallet approval' : stage === 'confirmed' ? 'Payment confirmed' : stage === 'unknown' ? 'Checking payment status' : stage === 'submitting' ? 'Submitting your payment' : stage === 'failed' ? 'Payment needs attention' : 'Payment submitted'}</h2>
              {stage === 'approving' && <div className={styles.warningBox}>Open Freighter to review. Only your wallet can approve. Nothing has been submitted.</div>}
              {stage === 'unknown' && <div className={styles.warningBox}>The submission result is uncertain. Check status before creating another payment; the transaction may already have been sent.</div>}
              <div className={styles.amount}>{(receipt || preview)?.amount}<span>{receipt?.assetCode || preview?.asset}</span></div>
              <p>Stellar Testnet · {stage === 'confirmed' ? 'Confirmed by the backend' : 'Review the full destination before approving.'}</p>
              {paymentDetails((receipt || preview)!)}
              {preview?.warnings?.map((warning, index) => <p className={styles.warningBox} key={index}>{warning}</p>)}
              {stage === 'review' && preview && <><label className={styles.reviewCheck}><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I have verified the full recipient address, asset, and amount.</label><p>Nothing sends until you approve in Freighter. Verify the destination and fee in your wallet.</p><div className={styles.actions}><button className={styles.primary} onClick={approve} disabled={!reviewed || working || walletRequestPending}><Icon name="wallet" />Approve in your wallet</button><button className={styles.secondary} onClick={newPayment}>Edit payment</button></div></>}
              {stage === 'approving' && <button className={styles.secondary} onClick={cancelApproval}>Cancel payment</button>}
              {['submitted', 'unknown'].includes(stage) && <button className={styles.secondary} onClick={() => preview && void reconcile(preview.paymentId).catch(cause => setError(errorMessage(cause)))}>Check payment status</button>}
              {receipt && hashActions(receipt)}
              {['confirmed', 'failed'].includes(stage) && <div className={styles.actions}><button className={styles.primary} onClick={newPayment}><Icon name="plus" />New payment</button><button className={styles.secondary} onClick={() => { setSelected(receipt); navigate('activity'); }}><Icon name="activity" />View history</button></div>}
            </section>
          </>}
          {reply && !hasPayment && <section className={styles.card}><p>{reply}</p>{options.map(option => <button key={option} className={styles.secondary} onClick={() => setComposer(option)}>{option}</button>)}</section>}
          <form className={styles.composer} onSubmit={sendCommand}><label htmlFor="composer">Composer</label><div><textarea id="composer" ref={composerRef} rows={2} value={composer} onChange={e => setComposer(e.target.value)} placeholder="What would you like to do?" disabled={working || inFlight} maxLength={2000} /><button className={styles.primary} aria-label="Prepare payment preview" disabled={!composer.trim() || working || inFlight}><Icon name="arrow" /></button></div><p>Creates a preview only. Approval happens in your wallet.</p></form>
        </div>
        <aside className={styles.stack}>{hasPayment ? <><section className={styles.card}><h2>Payment progress</h2><ol className={styles.progress}>{['Reviewed', 'Wallet approval', 'Submitted', 'Confirmed'].map((label, index) => <li key={label} className={index <= (stage === 'confirmed' ? 3 : stage === 'submitted' ? 2 : signing ? 1 : 0) ? styles.done : ''}>{label}</li>)}</ol><p>{stage === 'confirmed' ? 'Reviewed → approved in Freighter → submitted → confirmed.' : 'Your payment is confirmed only after the backend verifies it on Testnet.'}</p></section><section className={styles.card}><h2>Before you approve</h2><h3>Confirm the destination</h3><p>Check the full Stellar address in Freighter. Names are labels, not proof of ownership.</p><h3>Use Stellar Testnet</h3><p>Review the network, asset, amount, and fee before signing.</p></section></> : recipientForm()}<section className={styles.card}><h2>You’re in control</h2>{['You enter a payment command in the composer.', 'The workspace previews the payment before you approve.', 'Nothing sends until you confirm in your connected wallet.'].map(text => <p className={styles.checkLine} key={text}><Icon name="check" />{text}</p>)}</section><section className={styles.darkCard}><h2>Workspace summary</h2><p>Payment review, recipient entry, and wallet approval.</p><span className={styles.badge}>Testnet</span><small> Connected wallet: {short(address)}</small></section></aside>
      </div>}
      {view === 'recipients' && <div className={styles.recipientColumns}><div className={styles.stack}><section className={styles.card}><h2>Saved recipients</h2><label className={styles.search}><Icon name="search" /><input aria-label="Search recipients" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipient or address" /></label><p>{visibleRecipients.length} saved recipient{visibleRecipients.length === 1 ? '' : 's'}</p>{visibleRecipients.map(recipient => <div className={styles.recipient} key={recipient.id}><span className={styles.avatar}>{recipient.alias.slice(0, 1).toUpperCase()}</span><div><strong>{recipient.alias}</strong><code className={styles.fullAddress}>{recipient.address}</code></div><button className={styles.primary} disabled={inFlight} onClick={() => { setComposer(`Send 10 USDC to ${recipient.alias}`); navigate('chat'); }}><Icon name="arrow" />Select to pay</button></div>)}{!visibleRecipients.length && <p>No recipients found. Add a name and full Stellar address using the form.</p>}</section><section className={styles.card}><h2>Pay by name</h2><p>Select a saved recipient to prepare a payment in chat, or type a natural-language instruction.</p><div className={styles.hint}>Send 10 USDC to Alex</div><p>Selecting a recipient never sends a payment.</p></section></div><aside className={styles.stack}>{recipientForm()}<section className={styles.darkCard}><h2>Review before you send</h2><p>Saving a recipient does not send a payment. Review the full destination and approve in Freighter.</p></section></aside></div>}
      {view === 'activity' && <div className={styles.stack}><section className={styles.card}><div className={styles.cardHeader}><h2>Transactions</h2><p>{history.total} payment{history.total === 1 ? '' : 's'} · Stellar Testnet</p></div><div className={styles.filters}><label className={styles.search}><Icon name="search" /><input aria-label="Search payments on this page" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search this page by recipient or hash" /></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All</option>{['awaiting_signature', 'submitted', 'confirmed', 'failed', 'expired'].map(s => <option key={s} value={s}>{human(s)}</option>)}</select></label></div><div className={styles.tableScroll}><table><thead><tr><th>Recipient</th><th>Amount</th><th>Status</th><th>Transaction hash</th><th>Receipt</th></tr></thead><tbody>{visiblePayments.map(payment => <tr key={payment.id} className={selected?.id === payment.id ? styles.selectedRow : ''}><td><strong>{payment.recipientAlias}</strong><small>{short(payment.recipientAddress)}</small></td><td>{payment.amount} {payment.assetCode}</td><td><span className={styles.badge}>{human(payment.status)}</span></td><td>{payment.txHash ? short(payment.txHash) : 'Not submitted'}</td><td><button className={styles.textButton} onClick={() => setSelected(payment)}>View receipt ↓</button></td></tr>)}</tbody></table></div>{!visiblePayments.length && <p>No matching payments on this page.</p>}<div className={styles.pagination}><button className={styles.secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button><span>{history.total ? `${offset + 1}–${Math.min(offset + 20, history.total)} of ${history.total}` : 'No payments yet'}</span><button className={styles.secondary} disabled={offset + 20 >= history.total} onClick={() => setOffset(offset + 20)}>Next</button></div></section>{selected && <div className={styles.columns}><section className={styles.card}><div className={styles.cardHeader}><h2>Transaction detail · Receipt</h2><span className={styles.badge}>{human(selected.status)}</span></div><div className={styles.amount}>{selected.amount}<span>{selected.assetCode}</span></div>{paymentDetails(selected)}{selected.failureCode && <p className={styles.warningBox}>{selected.failureCode}</p>}{hashActions(selected)}</section><aside className={styles.stack}><section className={styles.darkCard}><h2>Available balance</h2><div className={styles.amount}>{wallet.usdcBalance}<span>Test-USDC</span></div><p>Current balance reported by the Testnet backend.</p></section><section className={styles.card}><h2>Ready for another payment?</h2><button className={styles.secondary} onClick={() => navigate('chat')}><Icon name="chat" />Back to chat</button></section></aside></div>}</div>}
    </main>
  </div>;
}
