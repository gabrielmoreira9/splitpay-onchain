"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { shortAddress } from "../lib/solana";

export function CopyAddress({ address, label }: { address: PublicKey | string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const value = typeof address === "string" ? address : address.toBase58();
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return <button type="button" onClick={copy} title="Copy address" className="inline-flex items-center gap-2 text-left text-xs text-[#7d8695] transition hover:text-white">{label && <span>{label}</span>}<span>{shortAddress(value)}</span><span className="text-[10px] text-[#a3ff68]">{copied ? "Copied" : "Copy"}</span></button>;
}
