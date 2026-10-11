import * as anchor from "@coral-xyz/anchor";
import anchorPackage from "@coral-xyz/anchor";
import { readFileSync } from "fs";

const { BN } = anchorPackage;
const RPC_URL = "http://127.0.0.1:8899";
const PROGRAM_ID = new anchor.web3.PublicKey(
    "Akpk2C1ADPSGhECkh3Ejwh7Sk17qzDAA2wY7sqPz76AZ"
);
const MINT = new anchor.web3.PublicKey(
    "8HGTnjBhZq3f6xPKjAqZZESNkVYguBLuCbZn1Rm9kCAt"
);
const RECIPIENT = new anchor.web3.PublicKey(
    "G3QaqrSDzZY3FYZesqhQpXgL1Bmtd7T594bv9uxjFquj"
);
const PARTICIPANT = new anchor.web3.PublicKey(
    "GNna9zGZbNqdLtUG4Qj3SUcmzkj4Bt6QG1xphHKb3MfF"
);
const RECIPIENT_TOKEN = new anchor.web3.PublicKey(
    "FWMtnu2tajQPvAKyXv4XpUkAJTxX9b5vZCRZxjmFvS2V"
);
const PARTICIPANT_TOKEN = new anchor.web3.PublicKey(
    "92GkoAphGCWxRwVaxpxzWbAko7th1Z9roFvpdqfyVvRT"
);
const PAYMENT_AMOUNT = 10_000_000;

function readKeypair(path: string): anchor.web3.Keypair {
    const secretKey = JSON.parse(readFileSync(path, "utf8"));
    return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function tokenAmount(
    connection: anchor.web3.Connection,
    account: anchor.web3.PublicKey
): Promise<bigint> {
    const balance = await connection.getTokenAccountBalance(account, "confirmed");
    return BigInt(balance.value.amount);
}

async function main() {
    const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
    const creator = readKeypair(`${process.env.HOME}/.config/solana/id.json`);
    const payer = readKeypair("/tmp/splitpay-payer.json");

    if (!payer.publicKey.equals(PARTICIPANT)) {
        throw new Error("Participant keypair does not match the configured participant");
    }

    const provider = new anchor.AnchorProvider(
        connection,
        new anchor.Wallet(creator),
        { commitment: "confirmed" }
    );
    anchor.setProvider(provider);

    const idl = JSON.parse(
        readFileSync("target/idl/splitpay_onchain.json", "utf8")
    );
    if (!PROGRAM_ID.equals(new anchor.web3.PublicKey(idl.address))) {
        throw new Error("IDL program address does not match configured program");
    }
    const program = new anchor.Program(idl, provider);
    const splitId = new BN(Date.now());
    const participants = [
        {
            wallet: PARTICIPANT,
            amount: new BN(PAYMENT_AMOUNT),
            paid: false,
        },
        {
            wallet: anchor.web3.Keypair.generate().publicKey,
            amount: new BN(10_000_000),
            paid: false,
        },
        {
            wallet: anchor.web3.Keypair.generate().publicKey,
            amount: new BN(10_000_000),
            paid: false,
        },
    ];

    const [splitPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("split"),
            creator.publicKey.toBuffer(),
            splitId.toArrayLike(Buffer, "le", 8),
        ],
        PROGRAM_ID
    );

    const createSignature = await program.methods
        .createSplit(splitId, new BN(30_000_000), participants)
        .accounts({
            split: splitPda,
            creator: creator.publicKey,
            recipient: RECIPIENT,
            mint: MINT,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    console.log("Create signature:", createSignature);
    console.log("Split PDA:", splitPda.toBase58());

    const splitData = await (program.account as any).splitAccount.fetch(splitPda);
    if (!splitData.creator.equals(creator.publicKey)) {
        throw new Error("Split creator does not match");
    }
    if (!splitData.recipient.equals(RECIPIENT)) {
        throw new Error("Split recipient does not match");
    }
    if (!splitData.mint.equals(MINT)) {
        throw new Error("Split mint does not match");
    }
    if (splitData.participants.length !== 3 ||
        !splitData.totalAmount.eq(new BN(30_000_000))) {
        throw new Error("Split participant or total amount validation failed");
    }
    const participant = splitData.participants.find((entry: any) =>
        entry.wallet.equals(PARTICIPANT)
    );
    if (!participant || !participant.amount.eq(new BN(PAYMENT_AMOUNT)) ||
        participant.paid) {
        throw new Error("Funded participant was not initialized unpaid");
    }
    if (!(await connection.getAccountInfo(splitPda))) {
        throw new Error("Split PDA account was not created");
    }

    const payerBefore = await tokenAmount(connection, PARTICIPANT_TOKEN);
    const recipientBefore = await tokenAmount(connection, RECIPIENT_TOKEN);
    const paymentSignature = await program.methods
        .payShare()
        .accounts({
            split: splitPda,
            payer: payer.publicKey,
            payerToken: PARTICIPANT_TOKEN,
            recipientToken: RECIPIENT_TOKEN,
            mint: MINT,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();
    console.log("Payment signature:", paymentSignature);

    const payerAfter = await tokenAmount(connection, PARTICIPANT_TOKEN);
    const recipientAfter = await tokenAmount(connection, RECIPIENT_TOKEN);
    if (payerBefore - payerAfter !== BigInt(PAYMENT_AMOUNT)) {
        throw new Error("Payer balance did not decrease by exactly 10 tokens");
    }
    if (recipientAfter - recipientBefore !== BigInt(PAYMENT_AMOUNT)) {
        throw new Error("Recipient balance did not increase by exactly 10 tokens");
    }

    const paidSplit = await (program.account as any).splitAccount.fetch(splitPda);
    const paidParticipant = paidSplit.participants.find((entry: any) =>
        entry.wallet.equals(PARTICIPANT)
    );
    if (!paidParticipant || !paidParticipant.paid) {
        throw new Error("Participant paid flag was not updated");
    }

    let duplicateFailed = false;
    try {
        await program.methods
            .payShare()
            .accounts({
                split: splitPda,
                payer: payer.publicKey,
                payerToken: PARTICIPANT_TOKEN,
                recipientToken: RECIPIENT_TOKEN,
                mint: MINT,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            })
            .signers([payer])
            .rpc();
    } catch (error) {
        duplicateFailed = true;
        console.log("Duplicate payment rejected:", error instanceof Error ? error.message : error);
    }
    if (!duplicateFailed) {
        throw new Error("Duplicate payment unexpectedly succeeded");
    }

    const payerAfterDuplicate = await tokenAmount(connection, PARTICIPANT_TOKEN);
    const recipientAfterDuplicate = await tokenAmount(connection, RECIPIENT_TOKEN);
    if (payerAfterDuplicate !== payerAfter || recipientAfterDuplicate !== recipientAfter) {
        throw new Error("Duplicate payment transferred additional tokens");
    }

    console.log("All pay_share assertions passed.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
