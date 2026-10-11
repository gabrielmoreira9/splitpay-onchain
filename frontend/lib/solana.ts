import * as anchor from "@coral-xyz/anchor";
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import idl from "../src/idl/splitpay_onchain.json";
import { PROGRAM_ID, RPC_URL, TOKEN_DECIMALS, TOKEN_MINT } from "./constants";

export type Participant = { wallet: PublicKey; amount: anchor.BN; paid: boolean };
export type SplitAccount = {
  publicKey: PublicKey;
  creator: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  splitId: anchor.BN;
  totalAmount: anchor.BN;
  participants: Participant[];
};

type DecodedParticipant = {
  wallet: PublicKey;
  amount: anchor.BN;
  paid: boolean;
};

type DecodedSplitAccount = {
  creator: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  split_id: anchor.BN;
  total_amount: anchor.BN;
  participants: DecodedParticipant[];
  bump: number;
};

export const connection = new Connection(RPC_URL, "confirmed");

function diagnostic(stage: string, details: Record<string, string | number>) {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[SplitPay create_split] ${stage}`, details);
  }
}

export class SplitTransactionError extends Error {
  constructor(
    message: string,
    readonly signature: string | null,
    readonly split: PublicKey,
    readonly stage: string,
  ) {
    super(message);
    this.name = "SplitTransactionError";
  }
}

export function parseTokenAmount(value: string): anchor.BN {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Enter a valid token amount.");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > TOKEN_DECIMALS) throw new Error(`Amounts support up to ${TOKEN_DECIMALS} decimals.`);
  return new anchor.BN(`${whole}${fraction.padEnd(TOKEN_DECIMALS, "0")}`);
}

export function formatTokenAmount(amount: anchor.BN | bigint | number) {
  const value = typeof amount === "number" ? amount : BigInt(amount.toString());
  return (Number(value) / 10 ** TOKEN_DECIMALS).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortAddress(address: PublicKey | string) {
  const value = typeof address === "string" ? address : address.toBase58();
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function getProgramAccounts(): Promise<SplitAccount[]> {
  const coder = new anchor.BorshAccountsCoder(idl as anchor.Idl);
  const accounts = await connection.getProgramAccounts(PROGRAM_ID);
  return accounts.map(({ pubkey, account }) => {
    try {
      const decoded = coder.decode("SplitAccount", account.data) as DecodedSplitAccount;
      if (
        !decoded ||
        !(decoded.creator instanceof PublicKey) ||
        !(decoded.recipient instanceof PublicKey) ||
        !(decoded.mint instanceof PublicKey) ||
        !(decoded.split_id instanceof anchor.BN) ||
        !(decoded.total_amount instanceof anchor.BN) ||
        !Array.isArray(decoded.participants) ||
        !decoded.participants.every(
          (participant) =>
            participant.wallet instanceof PublicKey &&
            participant.amount instanceof anchor.BN &&
            typeof participant.paid === "boolean",
        )
      ) {
        throw new Error("decoded fields do not match the SplitAccount IDL");
      }

      return {
        publicKey: pubkey,
        creator: decoded.creator,
        recipient: decoded.recipient,
        mint: decoded.mint,
        splitId: decoded.split_id,
        totalAmount: decoded.total_amount,
        participants: decoded.participants,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown decode error";
      throw new Error(`Unable to decode SplitAccount ${pubkey.toBase58()}: ${detail}`);
    }
  });
}

export function deriveSplitPda(creator: PublicKey, splitId: anchor.BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("split"), creator.toBuffer(), splitId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  )[0];
}

export async function getTokenAccount(owner: PublicKey, mint = TOKEN_MINT) {
  const accounts = await connection.getTokenAccountsByOwner(owner, { mint });
  if (!accounts.value[0]) return null;
  return accounts.value[0].pubkey;
}

export async function getTokenBalance(account: PublicKey) {
  const balance = await connection.getTokenAccountBalance(account, "confirmed");
  return new anchor.BN(balance.value.amount);
}

export async function getExpenseActivity(address: PublicKey) {
  const signatures = await connection.getSignaturesForAddress(address, { limit: 20 }, "confirmed");
  return signatures.map((entry) => ({
    signature: entry.signature,
    status: entry.err ? "failed" : entry.confirmationStatus || "confirmed",
    timestamp: entry.blockTime ? new Date(entry.blockTime * 1000) : null,
  }));
}

export async function payShare(
  wallet: anchor.Wallet,
  split: SplitAccount,
  payerToken: PublicKey,
  recipientToken: PublicKey,
) {
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const transaction = await program.methods.payShare().accountsStrict({
    split: split.publicKey,
    payer: wallet.publicKey,
    payerToken,
    recipientToken,
    mint: split.mint,
    tokenProgram: TOKEN_PROGRAM_ID,
  }).transaction();
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  return signature;
}

export async function createSplit(
  wallet: anchor.Wallet,
  totalAmount: anchor.BN,
  participants: Participant[],
  recipient: PublicKey,
  mint = TOKEN_MINT,
) {
  if (!(wallet.publicKey instanceof PublicKey)) throw new Error("Wallet public key is unavailable.");
  if (!(recipient instanceof PublicKey)) throw new Error("Recipient public key is invalid.");
  if (!(mint instanceof PublicKey)) throw new Error("Token mint public key is invalid.");
  for (const participant of participants) {
    if (!(participant.wallet instanceof PublicKey)) throw new Error("A participant public key is invalid.");
  }

  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const splitId = new anchor.BN(Date.now());
  const split = deriveSplitPda(wallet.publicKey, splitId);
  diagnostic("building", {
    creator: wallet.publicKey.toBase58(),
    recipient: recipient.toBase58(),
    mint: mint.toBase58(),
    split: split.toBase58(),
    splitId: splitId.toString(),
    participants: participants.length,
    totalAmount: totalAmount.toString(),
  });

  let transaction: Transaction;
  let latest: Awaited<ReturnType<typeof connection.getLatestBlockhash>>;
  try {
    transaction = await program.methods.createSplit(splitId, totalAmount, participants).accountsStrict({
      split,
      creator: wallet.publicKey,
      recipient,
      mint,
      systemProgram: SystemProgram.programId,
    }).transaction();
    transaction.feePayer = wallet.publicKey;
    latest = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = latest.blockhash;
    transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
    diagnostic("awaiting_signature", { split: split.toBase58() });
  } catch (error) {
    throw new SplitTransactionError(
      error instanceof Error ? `Transaction construction failed: ${error.message}` : "Transaction construction failed.",
      null,
      split,
      "construction",
    );
  }

  let signed: Transaction;
  try {
    signed = await wallet.signTransaction(transaction);
    diagnostic("signed", { split: split.toBase58() });
  } catch (error) {
    throw new SplitTransactionError(
      error instanceof Error ? `Wallet signing failed: ${error.message}` : "Wallet signing failed.",
      null,
      split,
      "signing",
    );
  }

  let signature: string;
  try {
    const currentBlockHeight = await connection.getBlockHeight("confirmed");
    diagnostic("before_broadcast", {
      split: split.toBase58(),
      currentBlockHeight,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    });
    if (currentBlockHeight > latest.lastValidBlockHeight) {
      throw new Error(
        "The transaction blockhash expired before broadcast. Please sign a newly constructed transaction.",
      );
    }
    const rawTransaction = signed.serialize();
    signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Transaction broadcast failed.";
    const message = /blockhash not found/i.test(detail)
      ? "Devnet rejected the transaction because its blockhash is no longer valid. Please sign a newly constructed transaction."
      : detail;
    throw new SplitTransactionError(
      `Transaction broadcast failed: ${message}`,
      null,
      split,
      "broadcast",
    );
  }
  diagnostic("broadcast", { signature, split: split.toBase58() });
  try {
    await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }, "confirmed");
  } catch (error) {
    throw new SplitTransactionError(
      error instanceof Error ? `Transaction confirmation failed: ${error.message}` : "Transaction confirmation failed.",
      signature,
      split,
      "confirmation",
    );
  }
  diagnostic("confirmed", { signature, split: split.toBase58() });

  const accountInfo = await connection.getAccountInfo(split, "confirmed");
  if (!accountInfo) {
    throw new SplitTransactionError(
      `Transaction ${signature} confirmed, but SplitAccount ${split.toBase58()} was not found.`,
      signature,
      split,
      "account_lookup",
    );
  }
  diagnostic("account_available", { signature, split: split.toBase58() });
  return { signature, split, splitId };
}

export { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID };
