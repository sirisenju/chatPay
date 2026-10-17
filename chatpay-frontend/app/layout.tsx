import type { Metadata } from "next";
import { Bricolage_Grotesque, Poppins } from "next/font/google";
import "./tailwind.css";
import "./globals.css";

const poppins = Poppins({
  weight: "500",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
});

const bricolage = Bricolage_Grotesque({
  weight: "700",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: "ChatPay — A Conversation. A Payment.",
  description: "Just tell ChatPay who to pay and how much. We turn your message into a clear payment preview. Built on Stellar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
