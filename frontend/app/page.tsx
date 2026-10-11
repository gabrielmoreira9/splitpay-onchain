"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "../components/shell";
import { StatusPill } from "../components/status-pill";
import { CopyAddress } from "../components/copy-address";
import { DashboardSkeleton } from "../components/skeleton";
import { formatTokenAmount, getProgramAccounts, SplitAccount } from "../lib/solana";
import { SOLANA_NETWORK, TOKEN_LABEL } from "../lib/constants";

export default function DashboardPage() {
  const [splits, setSplits] = useState<SplitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getProgramAccounts().then(setSplits).catch((err) => setError(err instanceof Error ? err.message : `Unable to read ${SOLANA_NETWORK}`)).finally(() => setLoading(false));
  }, []);

  const pending = splits.reduce((sum, split) => sum + split.participants.filter((participant) => !participant.paid).length, 0);
  const committed = splits.reduce((sum, split) => sum + split.participants.filter((participant) => participant.paid).length, 0);

  return <Shell>
    <section className="grid gap-12 pb-14 pt-4 lg:grid-cols-[1fr_340px] lg:items-end">
      <div>
        <p className="mb-5 text-[11px] font-bold uppercase tracking-[.22em] text-[#a3ff68]">Shared expenses · Solana {SOLANA_NETWORK}</p>
        <h1 className="max-w-3xl text-5xl font-bold leading-[.98] tracking-[-.065em] text-white md:text-7xl">Split the cost.<br /><span className="text-[#707887]">Keep the trust.</span></h1>
        <p className="mt-7 max-w-lg text-[15px] leading-7 text-[#8d96a5]">A transparent way to coordinate group spending and settle every share directly on-chain.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/create" className="rounded-xl bg-[#a3ff68] px-5 py-3.5 text-sm font-extrabold text-[#090b10] transition hover:-translate-y-0.5 hover:brightness-110">Create a split <span className="ml-3">↗</span></Link>
          <span className="text-xs text-[#596170]">No custody. No spreadsheets.</span>
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.08] bg-[#11151c]/80 p-5 shadow-2xl shadow-black/20">
        <div className="mb-8 flex items-center justify-between"><span className="text-xs font-semibold text-[#7d8695]">Protocol overview</span><span className="rounded-md bg-[#a3ff68]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#a3ff68]">Live</span></div>
        <div className="grid grid-cols-2 gap-5"><Stat label="Expenses" value={String(splits.length)} /><Stat label="Open shares" value={String(pending)} /><Stat label="Settled" value={String(committed)} /><Stat label="Network" value={SOLANA_NETWORK} /></div>
        <div className="mt-7 border-t border-white/[0.07] pt-4 text-xs text-[#596170]">Data read directly from the deployed SplitPay program · {TOKEN_LABEL}</div>
      </div>
    </section>
    <section className="border-t border-white/[0.08] pt-8">
      <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#596170]">Your workspace</p><h2 className="mt-2 text-xl font-bold tracking-tight">Recent splits</h2></div><span className="text-xs text-[#596170]">{splits.length} on-chain</span></div>
      {loading && <DashboardSkeleton />}
      {!loading && error && <div className="rounded-2xl border border-[#f06a6a]/20 bg-[#f06a6a]/[0.06] p-5 text-sm text-[#ff9292]">Solana {SOLANA_NETWORK} unavailable: {error}</div>}
      {!loading && !error && splits.length === 0 && <div className="rounded-2xl border border-dashed border-white/[0.12] px-6 py-16 text-center"><p className="font-bold">Nothing here yet</p><p className="mt-2 text-sm text-[#707887]">Create your first split to see live on-chain activity.</p></div>}
      {!loading && !error && <div className="space-y-3">{splits.map((split) => <SplitCard key={split.publicKey.toBase58()} split={split} />)}</div>}
    </section>
  </Shell>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-[#596170]">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p></div>;
}

function SplitCard({ split }: { split: SplitAccount }) {
  const href = `/expense/${split.publicKey.toBase58()}`;
  return <div className="group grid gap-5 rounded-2xl border border-white/[0.08] bg-[#11151c]/70 p-5 transition hover:border-[#a3ff68]/30 hover:bg-[#151a22] md:grid-cols-[1fr_auto] md:items-center">
    <div>
      <Link href={href} className="block">
        <div className="flex flex-wrap items-center gap-3"><h3 className="font-bold">Split #{split.splitId.toString().slice(-6)}</h3><StatusPill paid={split.participants.every((participant) => participant.paid)} /></div>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-4"><CopyAddress address={split.publicKey} label="PDA" /><span className="text-xs text-[#596170]">{split.participants.length} participants</span></div>
    </div>
    <Link href={href} className="flex items-center justify-between gap-8 md:justify-end" aria-label={`Open split ${split.splitId.toString()}`}>
      <div className="text-left md:text-right"><p className="text-lg font-bold">{formatTokenAmount(split.totalAmount)} <span className="text-xs font-medium text-[#707887]">tokens</span></p><p className="mt-1 text-xs text-[#596170]">Total allocation</p></div><span className="text-xl text-[#596170] transition group-hover:translate-x-1 group-hover:text-[#a3ff68]">→</span>
    </Link>
  </div>;
}
