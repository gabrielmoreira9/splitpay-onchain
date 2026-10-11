import type { Metadata } from "next";
import { SolanaProvider } from "../components/solana-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SplitPay — shared expenses, settled simply",
  description: "A non-custodial expense splitting dashboard for Solana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
