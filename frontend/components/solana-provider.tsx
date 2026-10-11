"use client";

import { useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { RPC_URL } from "../lib/constants";
import "@solana/wallet-adapter-react-ui/styles.css";

export function SolanaProvider({ children }: { children: ReactNode }) {
  const endpoint = RPC_URL;
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  const Connection = ConnectionProvider as ComponentType<{ endpoint: string; children: ReactNode }>;
  const Wallets = WalletProvider as ComponentType<{ wallets: typeof wallets; autoConnect: boolean; children: ReactNode }>;
  const Modal = WalletModalProvider as ComponentType<{ children: ReactNode }>;

  return (
    <Connection endpoint={endpoint}>
      <Wallets wallets={wallets} autoConnect>
        <Modal>{children}</Modal>
      </Wallets>
    </Connection>
  );
}
