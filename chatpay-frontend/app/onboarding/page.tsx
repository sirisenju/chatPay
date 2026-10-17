"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Brand from "../components/brand";
import Arrow from "../components/arrow";
import styles from "./page.module.css";

const screens = [
  {
    title: ["Payments, in", "your own words."],
    description: "Just tell ChatPay who to pay and how much. We turn your message into a clear payment preview.",
    image: "/onboarding-conversation.png",
    width: 1027,
    height: 908,
    alt: "A silver face speaking with floating Stellar coins",
  },
  {
    title: ["Your Wallet.", "Your Final Say."],
    description: "Check the recipient, asset and amount first. Only you can approve a payment in your own wallet.",
    image: "/onboarding-wallet.png",
    width: 825,
    height: 676,
    alt: "A transparent emerald wallet surrounded by Stellar coins",
  },
  {
    title: ["Clarity, from", "send to settled"],
    description: "Follow each payment in chat and Activity. Check the transaction hash and verify it on the Testnet explorer.",
    image: "/onboarding-settled.png",
    width: 823,
    height: 823,
    alt: "A green confirmation check surrounded by coins and circular green arrows",
  },
] as const;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const screen = screens[step];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function navigateTo(next: number) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <div className={styles.onboarding}>
      <a href="#onboarding-content" className="skip-link">Skip to content</a>
      <header className={styles.header}>
        <nav className={`navigation ${styles.navigation}`} aria-label="Onboarding navigation">
          <Brand />
          <div className={styles.headerActions}>
            <button className={styles.skip} onClick={() => step < 2 ? navigateTo(2) : router.push("/connect-wallet")}>Skip</button>
            <span className={styles.counter} role="status" aria-live="polite" aria-label={`Step ${step + 1} of 3`}>0{step + 1} / 03</span>
          </div>
        </nav>
      </header>

      <main id="onboarding-content" className={styles.main}>
        <div className={styles.inner}>
          <div className={styles.copy}>
            <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>{screen.title[0]}<br />{screen.title[1]}</h1>
            <p className={styles.description}>{screen.description}</p>
            <nav className={styles.progress} aria-label="Onboarding steps">
              {screens.map((item, index) => (
                <button key={item.image} className={`${styles.progressButton} ${step === index ? styles.active : ""}`} onClick={() => navigateTo(index)} aria-label={`Go to step ${index + 1}: ${item.title.join(" ")}`} aria-current={step === index ? "step" : undefined}>
                  <span />
                </button>
              ))}
            </nav>
            <button className={`button button-primary ${styles.continue}`} onClick={() => step < 2 ? navigateTo(step + 1) : router.push("/connect-wallet")}>
              {step === 2 ? "Connect wallet" : "Continue"} <Arrow />
            </button>
          </div>

          <div className={`${styles.artwork} ${step === 0 ? styles.conversation : ""}`}>
            {screens.map((item, index) => (
              <Image key={item.image} src={item.image} alt={item.alt} width={item.width} height={item.height} sizes="(max-width: 700px) 88vw, (max-width: 1100px) 84vw, (min-width: 1440px) 1037px, 72vw" preload={index === 0} loading={index === 0 ? undefined : "eager"} className={styles.image} hidden={step !== index} />
            ))}
          </div>
        </div>
      </main>

    </div>
  );
}
