
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Shell } from "../../components/shell";
import {
  SOLANA_NETWORK,
  TOKEN_DECIMALS,
  TOKEN_LABEL,
  TOKEN_MINT,
} from "../../lib/constants";
import {
  connection,
  createSplit,
  parseTokenAmount,
  type Participant,
  shortAddress,
  SplitTransactionError,
} from "../../lib/solana";

type Row = {
  id: string;
  wallet: string;
  amount: string;
  error?: string;
};

const newRow = (id?: string): Row => ({
  id: id ?? crypto.randomUUID(),
  wallet: "",
  amount: "",
});

const textValue = (value: string | undefined): string => value ?? "";

const normalizeRow = (
    row: Partial<Row> & Pick<Row, "id">
): Row => ({
  id: row.id,
  wallet: textValue(row.wallet),
  amount: textValue(row.amount),
  error: row.error,
});

export default function CreatePage() {
  const router = useRouter();
  const {
    publicKey,
    signTransaction,
    signAllTransactions,
  } = useWallet();

  const [recipient, setRecipient] = useState("");
  const [name, setName] = useState("");
  const [equalSplit, setEqualSplit] = useState(true);
  const [totalInput, setTotalInput] = useState("");

  const [rows, setRows] = useState<Row[]>([
    newRow("participant-1"),
    newRow("participant-2"),
  ]);

  const [state, setState] = useState<
      "idle" | "working" | "success" | "error"
  >("idle");

  const [message, setMessage] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [creatorBalance, setCreatorBalance] =
      useState<number | null>(null);

  const validation = useMemo(
      () => validateRows(rows, totalInput, equalSplit),
      [rows, totalInput, equalSplit]
  );

  const displayedRows =
      equalSplit && validation.total
          ? equalAmounts(rows, validation.total)
          : rows;

  const recipientValue = textValue(recipient);

  const recipientError = recipientValue.trim()
      ? (() => {
        try {
          new PublicKey(recipientValue.trim());
          return "";
        } catch {
          return "Enter a valid Solana recipient address.";
        }
      })()
      : "";

  const walletError = !publicKey
      ? "Connect a Solana wallet to create a split."
      : "";

  const signingError =
      publicKey && (!signTransaction || !signAllTransactions)
          ? "The connected wallet cannot sign transactions. Reconnect it and try again."
          : "";

  const blockingReasons = [
    walletError,
    signingError,
    recipientError,
    validation.totalError,
    ...Array.from(validation.errors.values()),
  ].filter(
      (reason, index, reasons) =>
          reason && reasons.indexOf(reason) === index
  );

  useEffect(() => {
    if (!publicKey) {
      setCreatorBalance(null);
      return;
    }

    let active = true;

    connection
        .getBalance(publicKey, "confirmed")
        .then((lamports) => {
          if (active) {
            setCreatorBalance(lamports / 1e9);
          }
        })
        .catch(() => {
          if (active) setCreatorBalance(null);
        });

    return () => {
      active = false;
    };
  }, [publicKey]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((current) =>
        current.map((row) =>
            row.id === id
                ? normalizeRow({
                  ...row,
                  ...patch,
                  wallet: patch.wallet ?? row.wallet,
                  amount: patch.amount ?? row.amount,
                  error: undefined,
                })
                : normalizeRow(row)
        )
    );

    setShowSummary(false);
  }

  function addRow() {
    setRows((current) =>
        current.length < 10
            ? [...current.map(normalizeRow), newRow()]
            : current
    );

    setShowSummary(false);
  }

  function removeRow(id: string) {
    setRows((current) =>
        current.length > 1
            ? current.filter((row) => row.id !== id)
            : current
    );

    setShowSummary(false);
  }

  function prepare(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");

    const next = validateRows(
        rows,
        totalInput,
        equalSplit
    );

    setRows((current) =>
        current.map((row) => ({
          ...row,
          error: next.errors.get(row.id),
        }))
    );

    if (!publicKey || !signTransaction || !signAllTransactions) {
      setMessage(walletError || signingError);
      return;
    }

    if (recipientError) {
      setMessage(recipientError);
      return;
    }

    if (!next.valid) return;

    setShowSummary(true);
  }

  async function submit() {
    if (
        state === "working" ||
        !publicKey ||
        !signTransaction ||
        !signAllTransactions
    ) {
      return;
    }

    try {
      setShowSummary(false);
      setState("working");
      setMessage("");

      // Revalidate the current form before constructing
      // any transaction.
      const latest = validateRows(
          rows,
          totalInput,
          equalSplit
      );

      if (!latest.valid) {
        throw new Error(
            "Please check the participant addresses and amounts."
        );
      }

      const recipientAddress =
          recipientValue.trim() || publicKey.toBase58();

      let recipientKey: PublicKey;

      try {
        recipientKey = new PublicKey(recipientAddress);
      } catch {
        throw new Error(
            "Invalid recipient wallet address."
        );
      }

      const amounts = equalSplit
          ? equalAmounts(rows, latest.total)
          : null;

      // Use the same rows for validation and submission.
      const participants: Participant[] = rows.map(
          (row, index) => {
            const normalized = normalizeRow(row);
            const address = normalized.wallet.trim();

            let wallet: PublicKey;

            try {
              wallet = new PublicKey(address);
            } catch {
              throw new Error(
                  `Invalid wallet address for participant ${
                      index + 1
                  }. Please check the address and try again.`
              );
            }

            const amount = amounts
                ? amounts[index]
                : parseTokenAmount(normalized.amount);

            return {
              wallet,
              amount,
              paid: false,
            };
          }
      );

      if (process.env.NODE_ENV === "development") {
        console.info(
            "[SplitPay create_split] validated input",
            {
              participants: participants.map(
                  (participant, index) => ({
                    index: index + 1,
                    wallet: participant.wallet.toBase58(),
                    amount: participant.amount.toString(),
                  })
              ),
              recipient: recipientKey.toBase58(),
            }
        );
      }

      const result = await createSplit(
          {
            publicKey,
            signTransaction,
            signAllTransactions,
          } as never,
          latest.total,
          participants,
          recipientKey,
          TOKEN_MINT
      );

      const expenseName = textValue(name).trim();

      if (expenseName) {
        localStorage.setItem(
            `splitpay:name:${result.split.toBase58()}`,
            expenseName
        );
      }

      setState("success");
      setMessage(
          `Confirmed on ${SOLANA_NETWORK} · ${result.signature}`
      );

      router.push(
          `/expense/${result.split.toBase58()}`
      );
    } catch (error) {
      setState("error");

      if (
          error instanceof SplitTransactionError &&
          error.signature
      ) {
        try {
          const accountInfo =
              await connection.getAccountInfo(
                  error.split,
                  "confirmed"
              );

          if (accountInfo) {
            setState("success");
            setMessage(
                `Transaction ${error.signature} is confirmed on ${SOLANA_NETWORK}. Opening the expense…`
            );

            router.push(
                `/expense/${error.split.toBase58()}`
            );

            return;
          }
        } catch (lookupError) {
          if (process.env.NODE_ENV === "development") {
            console.error(
                "[SplitPay create_split] account lookup failed",
                lookupError
            );
          }
        }

        setMessage(
            `${error.message} Signature: ${error.signature}`
        );

        if (process.env.NODE_ENV === "development") {
          console.error(
              "[SplitPay create_split] signature requires verification",
              {
                signature: error.signature,
                split: error.split.toBase58(),
                stage: error.stage,
              }
          );
        }

        return;
      }

      const detail =
          error instanceof Error
              ? error.message
              : "Unable to create split.";

      const stage =
          error instanceof SplitTransactionError
              ? ` (${error.stage})`
              : "";

      setMessage(`${detail}${stage}`);

      if (process.env.NODE_ENV === "development") {
        console.error(
            "[SplitPay create_split] failed",
            {
              error,
              stage:
                  error instanceof SplitTransactionError
                      ? error.stage
                      : "unknown",
              signature:
                  error instanceof SplitTransactionError
                      ? error.signature
                      : null,
            }
        );
      }
    }
  }

  return (
      <Shell>
        <div className="mx-auto max-w-5xl">
          <Link
              href="/"
              className="text-xs font-bold text-[#a3ff68]"
          >
            ← Dashboard
          </Link>

          <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_380px]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#a3ff68]">
                New expense · {SOLANA_NETWORK}
              </p>

              <h1 className="mt-4 text-5xl font-bold tracking-[-.06em]">
                Create a split.
              </h1>

              <p className="mt-5 max-w-md text-sm leading-7 text-[#8d96a5]">
                Add the wallets that owe a share. The exact
                participant list and integer token amounts are
                sent to the program after you confirm.
              </p>

              <div className="mt-10 text-xs text-[#596170]">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#a3ff68]" />
                {TOKEN_LABEL} · {shortAddress(TOKEN_MINT)} ·{" "}
                {TOKEN_DECIMALS} decimals
              </div>
            </div>

            <form
                onSubmit={prepare}
                className="rounded-2xl border border-white/[0.09] bg-[#11151c] p-6 shadow-2xl shadow-black/20 md:p-7"
            >
              <Field label="Expense name (local only)">
                <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setShowSummary(false);
                    }}
                    placeholder="e.g. Weekend trip"
                    className="input"
                />

                <p className="mt-2 text-[11px] text-[#596170]">
                  Not stored in the current on-chain account;
                  saved locally on this device.
                </p>
              </Field>

              <div className="mt-6">
                <Field label="Recipient wallet">
                  <input
                      value={recipient}
                      onChange={(e) => {
                        setRecipient(e.target.value);
                        setShowSummary(false);
                      }}
                      placeholder={
                        publicKey
                            ? publicKey.toBase58()
                            : "Defaults to connected wallet"
                      }
                      className={`input ${
                          recipientError
                              ? "border-[#ff7070]"
                              : ""
                      }`}
                  />

                  {recipientError && (
                      <p className="mt-1 text-[11px] text-[#ff9292]">
                        {recipientError}
                      </p>
                  )}
                </Field>

                <Field label="Total amount">
                  <input
                      required
                      value={totalInput}
                      onChange={(e) => {
                        setTotalInput(e.target.value);
                        setShowSummary(false);
                      }}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="input"
                  />

                  {validation.totalError && (
                      <p className="mt-1 text-[11px] text-[#ff9292]">
                        {validation.totalError}
                      </p>
                  )}
                </Field>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0d1016] p-3">
                <div>
                  <p className="text-sm font-bold">
                    Equal split
                  </p>

                  <p className="mt-1 text-[11px] text-[#596170]">
                    Distribute integer base units evenly
                  </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                      setEqualSplit((value) => !value);
                      setShowSummary(false);
                    }}
                    className={`h-6 w-11 rounded-full p-1 transition ${
                        equalSplit
                            ? "bg-[#a3ff68]"
                            : "bg-[#303744]"
                    }`}
                >
                <span
                    className={`block h-4 w-4 rounded-full bg-[#090b10] transition ${
                        equalSplit ? "translate-x-5" : ""
                    }`}
                />
                </button>
              </div>

              <div className="mt-7">
                <div className="mb-3 flex items-center justify-between">
                  <label className="label mb-0">
                    Participants · {rows.length}/10
                  </label>

                  <button
                      type="button"
                      onClick={addRow}
                      disabled={rows.length >= 10}
                      className="text-xs font-bold text-[#a3ff68] disabled:opacity-40"
                  >
                    + Add wallet
                  </button>
                </div>

                <div className="space-y-3">
                  {rows.map((row, index) => (
                      <div key={row.id}>
                        <div className="grid grid-cols-[1fr_112px_34px] gap-2">
                          <input
                              required
                              value={row.wallet}
                              onChange={(e) =>
                                  updateRow(row.id, {
                                    wallet: e.target.value,
                                  })
                              }
                              placeholder={`Wallet ${index + 1}`}
                              className={`input ${
                                  row.error
                                      ? "border-[#ff7070]"
                                      : ""
                              }`}
                          />

                          <input
                              required={!equalSplit}
                              disabled={equalSplit}
                              min="0"
                              step="0.000001"
                              type="number"
                              value={
                                equalSplit
                                    ? formatInputAmount(
                                        equalAmounts(
                                            rows,
                                            validation.total
                                        )[index]
                                    )
                                    : row.amount
                              }
                              onChange={(e) =>
                                  updateRow(row.id, {
                                    amount: e.target.value,
                                  })
                              }
                              placeholder="Amount"
                              className="input disabled:cursor-not-allowed disabled:opacity-50"
                          />

                          <button
                              type="button"
                              onClick={() =>
                                  removeRow(row.id)
                              }
                              disabled={rows.length <= 1}
                              aria-label={`Remove wallet ${
                                  index + 1
                              }`}
                              className="grid h-full place-items-center rounded-xl border border-white/[0.08] text-lg text-[#7d8695] transition hover:border-[#ff7070]/50 hover:text-[#ff9292] disabled:cursor-not-allowed disabled:opacity-25"
                          >
                            ×
                          </button>
                        </div>

                        {row.error && (
                            <p className="mt-1 text-[11px] text-[#ff9292]">
                              {row.error}
                            </p>
                        )}
                      </div>
                  ))}
                </div>
              </div>

              <div className="mt-7 border-t border-white/[0.08] pt-5">
                <div className="flex items-center justify-between">
                <span className="text-sm text-[#7d8695]">
                  Allocation
                </span>

                  <span
                      className={`text-xl font-bold ${
                          validation.valid
                              ? "text-white"
                              : "text-[#ff9292]"
                      }`}
                  >
                  {formatInputAmount(validation.total)}{" "}
                    <span className="text-xs text-[#596170]">
                    {TOKEN_LABEL}
                  </span>
                </span>
                </div>

                <p className="mt-2 text-right text-[11px] text-[#596170]">
                  {rows.length} wallets ·{" "}
                  {equalSplit ? "equal" : "manual"} amounts
                </p>
              </div>

              {creatorBalance !== null && (
                  <p
                      className={`mt-3 text-right text-[11px] ${
                          creatorBalance > 0
                              ? "text-[#596170]"
                              : "text-[#ff9292]"
                      }`}
                  >
                    Creator balance:{" "}
                    {creatorBalance.toFixed(4)} SOL · Devnet
                    SOL is required for fees and account rent.
                  </p>
              )}

              {blockingReasons.length > 0 && (
                  <div className="mt-5 rounded-xl border border-[#f7c76d]/20 bg-[#f7c76d]/[0.06] p-4 text-xs leading-5 text-[#f7d58f]">
                    <p className="font-bold">
                      Complete these items before continuing:
                    </p>

                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {blockingReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
              )}

              {message && (
                  <div
                      className={`mt-5 break-words rounded-xl border p-4 text-xs leading-5 ${
                          state === "error"
                              ? "border-[#f06a6a]/20 bg-[#f06a6a]/[0.06] text-[#ff9292]"
                              : "border-[#a3ff68]/20 bg-[#a3ff68]/[0.06] text-[#c9ffa9]"
                      }`}
                  >
                    {message}
                  </div>
              )}

              {showSummary && (
                  <div className="mt-5 rounded-xl border border-[#a3ff68]/20 bg-[#a3ff68]/[0.05] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#a3ff68]">
                      Confirm before signing
                    </p>

                    <p className="mt-2 text-sm">
                      {rows.length} participants ·{" "}
                      {formatInputAmount(validation.total)}{" "}
                      {TOKEN_LABEL}
                    </p>

                    <p className="mt-1 text-xs text-[#7d8695]">
                      Only the wallets currently listed
                      above will be included.
                    </p>

                    <div className="mt-4 flex gap-2">
                      <button
                          type="button"
                          onClick={() =>
                              setShowSummary(false)
                          }
                          className="flex-1 rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-bold text-[#a6adba]"
                      >
                        Edit
                      </button>

                      <button
                          type="button"
                          onClick={submit}
                          disabled={state === "working"}
                          className="flex-1 rounded-lg bg-[#a3ff68] px-3 py-2 text-xs font-extrabold text-[#090b10] disabled:opacity-40"
                      >
                        Sign transaction
                      </button>
                    </div>
                  </div>
              )}

              <button
                  disabled={
                      state === "working" ||
                      blockingReasons.length > 0
                  }
                  className="mt-6 w-full rounded-xl bg-[#a3ff68] px-5 py-3.5 text-sm font-extrabold text-[#090b10] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state === "working"
                    ? "Confirming transaction…"
                    : showSummary
                        ? "Review above"
                        : "Review and create split ↗"}
              </button>
            </form>
          </div>
        </div>
      </Shell>
  );
}

function validateRows(
    rows: Row[],
    totalInput: string,
    equal: boolean
) {
  const errors = new Map<string, string>();
  const seen = new Set<string>();

  let requested = new BN(0);
  let totalError = "";

  const normalizedTotal = textValue(totalInput);

  try {
    requested = parseTokenAmount(normalizedTotal);
  } catch {
    totalError = normalizedTotal.trim()
        ? `Enter a valid amount with up to ${TOKEN_DECIMALS} decimals.`
        : "Enter a total amount greater than zero.";
  }

  let sum = new BN(0);

  if (rows.length < 1 || rows.length > 10) {
    rows.forEach((row) =>
        errors.set(
            row.id,
            "Add between 1 and 10 participants."
        )
    );
  }

  rows.forEach((rawRow) => {
    const row = normalizeRow(rawRow);

    try {
      const key = new PublicKey(
          row.wallet.trim()
      ).toBase58();

      if (seen.has(key)) {
        errors.set(row.id, "Duplicate wallet.");
      }

      seen.add(key);
    } catch {
      errors.set(
          row.id,
          "Enter a valid Solana wallet address."
      );
    }

    if (!equal) {
      try {
        const amount = parseTokenAmount(
            row.amount
        );

        if (amount.lte(new BN(0))) {
          errors.set(
              row.id,
              "Amount must be greater than zero."
          );
        } else {
          sum = sum.add(amount);
        }
      } catch {
        errors.set(
            row.id,
            "Enter a valid amount."
        );
      }
    }
  });

  if (requested.lte(new BN(0))) {
    totalError =
        "Enter a total amount greater than zero.";
  }

  if (
      !equal &&
      requested.gt(new BN(0)) &&
      !requested.eq(sum)
  ) {
    totalError =
        "Participant amounts must equal the total.";
  }

  const total = equal ? requested : sum;

  return {
    valid:
        errors.size === 0 &&
        !totalError &&
        rows.length >= 1 &&
        rows.length <= 10 &&
        requested.gt(new BN(0)) &&
        (equal || requested.eq(sum)),
    errors,
    total,
    totalError,
  };
}

function equalAmounts(rows: Row[], total: BN) {
  if (!rows.length || total.lte(new BN(0))) {
    return rows.map(() => new BN(0));
  }

  const base = total.div(
      new BN(rows.length)
  );

  const remainder = total
      .mod(new BN(rows.length))
      .toNumber();

  return rows.map((_, index) =>
      base.add(
          new BN(index < remainder ? 1 : 0)
      )
  );
}

function formatInputAmount(amount: BN) {
  return (
      Number(amount.toString()) /
      10 ** TOKEN_DECIMALS
  )
      .toFixed(TOKEN_DECIMALS)
      .replace(/\.?0+$/, "") || "0";
}

function Field({
                 label,
                 children,
               }: {
  label: string;
  children: React.ReactNode;
}) {
  return (
      <div>
        <label className="label">
          {label}
        </label>
        {children}
      </div>
  );
}
