"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { SOLANA_NETWORK } from "../lib/constants";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((module) => module.WalletMultiButton),
  {
    ssr: false,
    loading: () => (
      <button type="button" className="wallet-adapter-button wallet-adapter-button-trigger" disabled>
        Connect Wallet
      </button>
    ),
  },
);

export function Header() {
  const pathname = usePathname();
  return (
    <header className="relative z-20 border-b border-white/[0.07] bg-[#090b10]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between gap-5 px-5 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#a3ff68] text-lg font-black text-[#090b10]">S</span>
          <span className="text-[17px] font-bold tracking-[-.04em]">SplitPay</span>
        </Link>
        <nav className="hidden items-center gap-1 rounded-xl border border-white/[0.07] bg-[#0f1218] p-1 md:flex">
          <NavLink href="/" active={pathname === "/"}>Dashboard</NavLink>
          <NavLink href="/create" active={pathname.startsWith("/create")}>Create split</NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <div title={`Connect your wallet on ${SOLANA_NETWORK}`} className="hidden items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-[#a6adba] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a3ff68] shadow-[0_0_10px_#a3ff68]" />
            {SOLANA_NETWORK}
          </div>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-[#242b36] text-white" : "text-[#727b8c] hover:text-white"}`}>{children}</Link>;
}
