"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import Brand from "./components/brand";
import Arrow from "./components/arrow";

export default function Home() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div className="landing">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="site-header">
        <nav className="navigation" aria-label="Main navigation">
          <Brand />
          <div className="nav-actions">
            <Link className="button button-primary nav-start" href="/onboarding">Get started <Arrow /></Link>
            <button className="button button-outline" onClick={() => dialogRef.current?.showModal()}>Get the app</button>
          </div>
        </nav>
      </header>
      <main className="hero" id="main-content">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="status-pill">Built on Stellar · Testnet</span>
            <h1>A Conversation.<br />A Payment.</h1>
            <p>Just tell ChatPay who to pay and how much. We turn your message into a clear payment preview.</p>
            <Link className="button button-primary hero-cta" href="/onboarding">Get started <Arrow /></Link>
          </div>
          <div className="hero-artwork">
            <Image src="/chatpay-hero.png" alt="Green ChatPay chat icon surrounded by silver payment arrows, a dollar ribbon, and a gold Stellar coin" width={500} height={500} sizes="(max-width: 700px) 88vw, (max-width: 1100px) 67vw, (min-width: 1600px) 804px, 53vw" preload className="hero-image" />
          </div>
        </div>
      </main>
      <dialog ref={dialogRef} className="launch-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description" onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}>
        <div className="dialog-content">
          <span className="status-pill">ChatPay · Testnet</span>
          <h2 id="dialog-title">ChatPay, wherever you go.</h2>
          <p id="dialog-description">The app download isn’t available yet. You’ll be able to access it here when it’s ready.</p>
          <form method="dialog"><button className="button button-primary">Got it <Arrow /></button></form>
        </div>
      </dialog>
    </div>
  );
}
