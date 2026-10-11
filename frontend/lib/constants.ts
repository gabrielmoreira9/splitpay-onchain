import { PublicKey } from "@solana/web3.js";

export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "Akpk2C1ADPSGhECkh3Ejwh7Sk17qzDAA2wY7sqPz76AZ",
);
export const TOKEN_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_TOKEN_MINT || "DTwF3XATViQeR3WBJbVx7wuXqwTSqBnAi1Y8Awrb4zKL",
);
export const TOKEN_DECIMALS = 6;
export const TOKEN_LABEL = process.env.NEXT_PUBLIC_TOKEN_LABEL || "SplitPay Test Token (TEST)";
