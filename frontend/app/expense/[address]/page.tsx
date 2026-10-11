"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { QRCodeSVG } from "qrcode.react";
import { Shell } from "../../../components/shell";
import { StatusPill } from "../../../components/status-pill";
import { CopyAddress } from "../../../components/copy-address";
import { connection, formatTokenAmount, getExpenseActivity, getProgramAccounts, getTokenAccount, getTokenBalance, payShare, shortAddress, SplitAccount } from "../../../lib/solana";
import { RPC_URL, SOLANA_NETWORK, TOKEN_DECIMALS, TOKEN_LABEL } from "../../../lib/constants";

type PaymentState = "idle" | "awaiting" | "submitted" | "confirming" | "confirmed" | "failed";
type Activity = Awaited<ReturnType<typeof getExpenseActivity>>[number];

export default function ExpensePage() {
  const params = useParams<{ address: string }>();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const [split, setSplit] = useState<SplitAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [copied, setCopied] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    setPaymentUrl(`${window.location.origin}/expense/${params.address}`);
    setName(localStorage.getItem(`splitpay:name:${params.address}`) || "");
  }, [params.address]);

  useEffect(() => {
    getProgramAccounts().then(async (items) => {
      const found = items.find((item) => item.publicKey.toBase58() === params.address) || null;
      setSplit(found);
      if (found) setActivity(await getExpenseActivity(found.publicKey));
    }).catch((error) => setMessage(error instanceof Error ? error.message : `Unable to read ${SOLANA_NETWORK}`)).finally(() => setLoading(false));
  }, [params.address]);

  const due = useMemo(() => split?.participants.find((participant) => publicKey && participant.wallet.equals(publicKey) && !participant.paid), [split, publicKey]);
  const paid = split?.participants.filter((participant) => participant.paid).length || 0;
  const progress = split?.participants.length ? Math.round((paid / split.participants.length) * 100) : 0;
  const payerHasEnough = due && tokenBalance !== null ? tokenBalance >= BigInt(due.amount.toString()) : null;
  const eligible = Boolean(due && payerHasEnough !== false);

  useEffect(() => {
    if (!publicKey || !split) {
      setTokenBalance(null);
      return;
    }
    getTokenAccount(publicKey, split.mint).then((account) => account ? getTokenBalance(account).then((value) => setTokenBalance(BigInt(value.toString()))) : setTokenBalance(BigInt(0))).catch(() => setTokenBalance(null));
  }, [publicKey, split]);

  async function copyLink() {
    await navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function explorerUrl(tx: string) {
    return `https://explorer.solana.com/tx/${tx}?cluster=${SOLANA_NETWORK}`;
  }

  async function pay() {
    if (!split || !publicKey || !signTransaction || !signAllTransactions || !due || payerHasEnough === false) return;
    try {
      setMessage("");
      setPaymentState("awaiting");
      const payerToken = await getTokenAccount(publicKey, split.mint);
      const recipientToken = await getTokenAccount(split.recipient, split.mint);
      if (!payerToken || !recipientToken) throw new Error("A compatible SPL token account was not found for this wallet.");
      setPaymentState("submitted");
      const tx = await payShare({ publicKey, signTransaction, signAllTransactions } as never, split, payerToken, recipientToken);
      setSignature(tx);
      setPaymentState("confirming");
      await connection.confirmTransaction(tx, "confirmed");
      setPaymentState("confirmed");
      setMessage("Payment confirmed on-chain.");
      const refreshed = await getProgramAccounts();
      const fresh = refreshed.find((item) => item.publicKey.equals(split.publicKey)) || split;
      setSplit(fresh);
      setActivity(await getExpenseActivity(fresh.publicKey));
    } catch (error) {
      setPaymentState("failed");
      setMessage(error instanceof Error ? error.message : "Payment failed.");
    }
  }

  if (loading) return <Shell><BackLink /><div className="mt-8 grid gap-4"><div className="skeleton h-44" /><div className="skeleton h-72" /></div></Shell>;
  if (!split) return <Shell><BackLink /><div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#11151c] p-12 text-center"><p className="font-bold">Expense unavailable</p><p className="mt-2 text-sm text-[#707887]">{message || `This account was not found on ${SOLANA_NETWORK}.`}</p></div></Shell>;

  const settled = split.participants.filter((p) => p.paid).reduce((sum, p) => sum.add(p.amount), new BN(0));
  return <Shell><BackLink /><section className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start"><div><div className="flex flex-wrap items-center gap-3"><span className="text-[11px] font-bold uppercase tracking-[.2em] text-[#a3ff68]">Expense detail · {SOLANA_NETWORK}</span><StatusPill paid={progress === 100} /></div><h1 className="mt-5 text-5xl font-bold tracking-[-.06em]">{name || `Split #${split.splitId.toString().slice(-6)}`}</h1><div className="mt-4 flex flex-wrap items-center gap-4"><CopyAddress address={split.publicKey} label="PDA" /><CopyAddress address={split.recipient} label="Recipient" /></div><div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#11151c] p-6 md:p-8"><div className="flex items-end justify-between"><div><p className="text-xs text-[#707887]">Total allocation</p><p className="mt-2 text-4xl font-bold tracking-tight">{formatTokenAmount(split.totalAmount)} <span className="text-sm font-medium text-[#707887]">{TOKEN_LABEL}</span></p></div><p className="text-sm font-semibold text-[#a3ff68]">{progress}% settled</p></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-[#252b36]"><div className="h-full rounded-full bg-[#a3ff68] transition-all duration-700" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex justify-between text-xs text-[#596170]"><span>{paid} paid · {split.participants.length - paid} pending</span><span>{formatTokenAmount(settled)} settled</span></div></div></div><aside className="rounded-2xl border border-white/[0.09] bg-[#151923] p-6 shadow-2xl shadow-black/20"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#596170]">Your share</p><p className="mt-4 text-4xl font-bold tracking-[-.05em]">{due ? formatTokenAmount(due.amount) : "—"} <span className="text-sm font-medium text-[#707887]">tokens</span></p><p className="mt-3 text-sm leading-6 text-[#8d96a5]">{due ? "Your wallet is an unpaid participant." : publicKey ? "No unpaid share found for this wallet." : "Connect the participant wallet to see your amount due."}</p>{tokenBalance !== null && due && <p className={`mt-3 text-xs ${payerHasEnough ? "text-[#a3ff68]" : "text-[#ff9292]"}`}>Balance: {formatTokenAmount(tokenBalance)} tokens{!payerHasEnough && " · insufficient balance"}</p>}<button onClick={pay} disabled={paymentState === "awaiting" || paymentState === "submitted" || paymentState === "confirming" || !eligible} className="mt-7 w-full rounded-xl bg-[#a3ff68] px-5 py-4 text-sm font-extrabold text-[#090b10] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{paymentState === "awaiting" ? "Awaiting wallet signature…" : paymentState === "submitted" ? "Transaction submitted…" : paymentState === "confirming" ? "Confirming on-chain…" : paymentState === "confirmed" ? "Payment confirmed" : "Pay my share ↗"}</button>{paymentState === "failed" && <p className="mt-4 rounded-xl border border-[#f06a6a]/20 bg-[#f06a6a]/[0.06] p-3 text-xs leading-5 text-[#ff9292]">{message}</p>}{signature && <a href={explorerUrl(signature)} target="_blank" rel="noreferrer" className="mt-4 block break-all text-xs text-[#a3ff68] hover:underline">View transaction ↗<br />{signature}</a>}{!publicKey && <p className="mt-4 text-center text-xs text-[#596170]">Connect a wallet to enable payment.</p>}</aside></section><section className="mt-8 grid gap-8 lg:grid-cols-[1fr_260px]"><div><div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#596170]">Settlement</p><h2 className="mt-2 text-xl font-bold">Participants</h2></div><CopyAddress address={split.mint} label={`Mint · ${TOKEN_DECIMALS} decimals`} /></div><div className="grid gap-2">{split.participants.map((participant) => <div key={participant.wallet.toBase58()} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#11151c] p-4"><div className="flex min-w-0 items-center gap-3"><span className={`h-2 w-2 shrink-0 rounded-full ${participant.paid ? "bg-[#a3ff68]" : "bg-[#f7c76d]"}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{shortAddress(participant.wallet)}{publicKey && participant.wallet.equals(publicKey) && <span className="ml-2 text-[10px] font-bold uppercase text-[#a3ff68]">You</span>}</p><p className="mt-1 text-xs text-[#596170]">{participant.paid ? "Share settled on-chain" : "Awaiting payment"}</p></div></div><div className="flex items-center gap-4"><p className="text-sm font-bold">{formatTokenAmount(participant.amount)}</p><StatusPill paid={participant.paid} /></div></div>)}</div></div><aside className="rounded-2xl border border-white/[0.08] bg-[#11151c] p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#596170]">Share expense</p><div className="mt-4 flex justify-center rounded-xl bg-white p-3"><QRCodeSVG value={paymentUrl} size={170} /></div><button onClick={copyLink} className="mt-4 w-full rounded-xl border border-[#a3ff68]/30 px-4 py-3 text-xs font-bold text-[#a3ff68] transition hover:bg-[#a3ff68]/10">{copied ? "Link copied" : "Copy payment link"}</button><div className="mt-3 grid grid-cols-2 gap-2"><a href={`https://wa.me/?text=${encodeURIComponent(`Pay your SplitPay share: ${paymentUrl}`)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/[0.08] px-2 py-2 text-center text-[11px] font-bold text-[#7d8695] hover:text-white">WhatsApp</a><a href={`https://t.me/share/url?url=${encodeURIComponent(paymentUrl)}&text=${encodeURIComponent("Pay your SplitPay share")}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/[0.08] px-2 py-2 text-center text-[11px] font-bold text-[#7d8695] hover:text-white">Telegram</a></div>{paymentUrl.includes("localhost") && <p className="mt-4 text-[11px] leading-5 text-[#f7c76d]">Localhost link: only devices on this machine can open it.</p>}</aside></section><section className="mt-10 border-t border-white/[0.08] pt-8"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#596170]">Activity</p><h2 className="mt-2 text-xl font-bold">Transaction history</h2>{activity.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/[0.1] p-5 text-sm text-[#707887]">No transaction activity is available for this expense yet.</p> : <div className="mt-4 space-y-2">{activity.map((entry) => <a key={entry.signature} href={explorerUrl(entry.signature)} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#11151c] p-4 text-xs hover:border-[#a3ff68]/30"><span className="text-[#a3ff68]">{shortAddress(entry.signature)}</span><span className="text-[#7d8695]">{entry.status}</span><span className="text-[#596170]">{entry.timestamp?.toLocaleString() || "Time unavailable"}</span></a>)}</div>}</section></Shell>;
}

function BackLink() { return <Link href="/" className="text-xs font-bold text-[#a3ff68]">← Dashboard</Link>; }
