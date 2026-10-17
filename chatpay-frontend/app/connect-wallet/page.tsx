"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useEffect, useRef, useState } from "react";
import Brand from "../components/brand";
import Arrow from "../components/arrow";
import { connectFreighter, verifyWallet } from "../../lib/wallet";
import styles from "./page.module.css";

function Icon({ kind }: { kind: "wallet" | "link" | "check" | "copy" | "shield" | "lock" | "chat" }) {
  const paths = {
    wallet: <><path d="M20 8V5H5a2 2 0 0 0 0 4h15v11H5a2 2 0 0 1-2-2V7" /><path d="M16 12h6v5h-6z" /></>,
    link: <><path d="M9 7H7a5 5 0 0 0 0 10h2m6-10h2a5 5 0 0 1 0 10h-2M8 12h8" /></>,
    check: <path d="m5 12 4 4L20 5" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v12h5" /></>,
    shield: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
    chat: <path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-6 2 2-6a9 9 0 1 1 17-4Z" />,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function ConnectWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const connectingRef = useRef(false);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [address]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!address) return;
    let active = true;
    async function recheck() {
      if (document.visibilityState !== "visible") return;
      try {
        const api = await import("@stellar/freighter-api");
        await verifyWallet(api, address!);
      } catch (cause) {
        if (active) {
          void api("logout", { method: "POST" }).catch(() => setError("Please disconnect again to clear your sign-in."));
          setCopied(false);
          setAddress(null);
          setError(cause instanceof Error ? cause.message : "Please reconnect your wallet.");
        }
      }
    }
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      active = false;
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [address]);

  async function connect() {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setCopied(false);
    try {
      const api = await import("@stellar/freighter-api");
      setAddress(await connectFreighter(api));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect. Please unlock Freighter and try again.");
    } finally {
      connectingRef.current = false;
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try { await api("logout", { method: "POST" }); }
    catch { setError("Could not clear your session. Please try disconnecting again."); setBusy(false); return; }
    setBusy(false);
    setAddress(null);
    setCopied(false);
    setError("");
    setNotice("ChatPay connection cleared. Select Testnet in Freighter before reconnecting.");
  }

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setError(`Copy failed. Your wallet address is: ${address}`);
    }
  }

  async function continueToChat() {
    if (!address) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const apiWallet = await import("@stellar/freighter-api");
      await verifyWallet(apiWallet, address);
      const challenge = await api<{ challenge: string; nonce: string; expiresAt: string }>("auth/challenge", { method: "POST", body: JSON.stringify({ publicKey: address }) });
      if (Date.parse(challenge.expiresAt) <= Date.now()) throw new Error("Sign-in challenge expired. Please try again.");
      const signed = await apiWallet.signMessage(challenge.challenge, { address, networkPassphrase: "Test SDF Network ; September 2015" });
      if (signed.error) throw new Error(signed.error.message);
      if (!signed.signedMessage || signed.signerAddress !== address) throw new Error("Sign-in was not approved by your connected wallet.");
      const signature = typeof signed.signedMessage === "string" ? signed.signedMessage : btoa(String.fromCharCode(...signed.signedMessage));
      await verifyWallet(apiWallet, address);
      const verified = await api<{ user: { publicKey: string } }>("auth/verify", { method: "POST", body: JSON.stringify({ publicKey: address, signature, nonce: challenge.nonce }) });
      if (verified.user.publicKey !== address) { await api("logout", { method: "POST" }); throw new Error("The authenticated wallet did not match. Please reconnect."); }
      router.push("/chat");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please reconnect your wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <a href="#wallet-content" className="skip-link">Skip to content</a>
      <header className={styles.header}>
        <nav className="navigation" aria-label="Main navigation">
          <Brand />
          <div className={styles.headerActions}>
            <span className={styles.badge}>Testnet</span>
            <a className={styles.help} href="https://help.freighter.app/" target="_blank" rel="noopener noreferrer">Help Center</a>
          </div>
        </nav>
      </header>
      <main id="wallet-content" className={styles.main}>
        <div className={styles.inner}>
          <div className={`${styles.artwork} ${address ? styles.connectedArtwork : ""}`}>
            <Image src={address ? "/onboarding-settled.png" : "/onboarding-wallet.png"} width={address ? 823 : 825} height={address ? 823 : 676} alt={address ? "A green confirmation check with coins and circular arrows" : "Emerald glass wallet with floating Stellar coins"} sizes="(max-width: 700px) 88vw, (max-width: 1100px) 74vw, 48vw" preload />
          </div>
          <section className={styles.content} aria-labelledby="wallet-heading">
            <div className={`${styles.intro} ${address ? styles.connectedIntro : ""}`}>
              {address ? (
                <div className={styles.successOrbit} aria-hidden="true"><div><span><Icon kind="check" /></span></div><i /></div>
              ) : (
                <div className={styles.connectionGraphic} aria-hidden="true">
                  <span className={styles.appMark}><svg width="56" height="56" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="9" fill="#00CF98" /><path d="M9 8h22v22H19l-8 6v-9H9Z" fill="#113329" /><path d="m16 24 9-10m-9 0h9v9" stroke="#00CF98" strokeWidth="4" /></svg></span>
                  <Icon kind="link" /><span className={styles.walletMark}><Icon kind="wallet" /></span>
                </div>
              )}
              <div>
                <h1 id="wallet-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>{address ? <>Connected.<br />You’re in control.</> : <>Connect your<br />wallet to begin.</>}</h1>
                <p className={styles.description}>{address ? "Your wallet is connected to ChatPay. You’re ready to explore payments on Stellar Testnet." : "Your wallet is your sign-in. Connect a Stellar wallet to try conversational payments on Testnet."}</p>
              </div>
            </div>

            {address ? (
              <>
                <div className={styles.connectedCard}>
                  <div className={styles.cardRow}><strong><Icon kind="wallet" /> Freighter</strong><span className={styles.badge}>Connected</span></div>
                  <div className={styles.addressRow}><code title={address}>{address.slice(0, 4)}…{address.slice(-4)}</code><button className={styles.copy} onClick={copyAddress}><span><Icon kind="copy" /></span>{copied ? "Copied!" : "Copy Address"}</button></div>
                  <div className={styles.cardFooter}>
                    <p className={styles.cardCaption}>Stellar wallet · Testnet</p>
                    <button type="button" className={styles.disconnect} onClick={disconnect} disabled={busy}>Disconnect wallet</button>
                  </div>
                </div>
                <div className={styles.assurance}><Icon kind="shield" /><p>Connecting doesn’t send a payment. Every transaction still needs your approval.</p></div>
              </>
            ) : (
              <>
                <p className={styles.eyebrow}>Proposed MVP wallet</p>
                <div className={styles.walletCard}><span className={styles.freighterIcon}><Icon kind="wallet" /></span><div><strong>Freighter</strong><p>Stellar wallet · Testnet</p></div><span className={styles.selected}><Icon kind="check" /></span></div>
                <div className={styles.resetRow}>
                  <button type="button" className={styles.disconnect} onClick={disconnect} disabled={busy}>Disconnect wallet</button>
                </div>
                <div className={styles.installCard}><strong>Don’t have Freighter?</strong><p>Install the browser extension and switch to Testnet. Then return here to connect.</p><a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer">Get Freighter ↗</a></div>
                <p className={styles.privacy}><Icon kind="lock" />We never hold your funds or private keys.</p>
              </>
            )}
            {error && <p className={styles.error} role="alert">{error}</p>}
            {notice && <p className={styles.notice} role="status">{notice}</p>}
            <button className={`button button-primary ${styles.primary}`} disabled={busy} aria-busy={busy} onClick={address ? continueToChat : connect}>
              {busy ? (address ? "Checking wallet…" : "Connecting…") : (address ? "Let’s Chat" : "Connect Freighter")}{address ? <Icon kind="chat" /> : <Arrow />}
            </button>
            <span className={styles.srOnly} role="status">{copied ? "Wallet address copied to clipboard" : ""}</span>
            {!address && <p className={styles.footnote}>Test assets have no monetary value.</p>}
          </section>
        </div>
      </main>
    </div>
  );
}
