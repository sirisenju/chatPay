import Link from "next/link";

export default function Brand() {
  return (
    <Link className="brand" href="/" aria-label="ChatPay home">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="9" fill="#00CF98" />
        <path d="M10 9h20v20H19l-8 6v-9h-1V9Z" fill="#00392A" />
        <path d="m16 23 9-9m-8 0h8v8" stroke="#00E7AA" strokeWidth="4" />
      </svg>
      <span>ChatPay</span>
    </Link>
  );
}
