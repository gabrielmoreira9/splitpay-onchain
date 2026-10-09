
import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";

async function main() {
    const connection = new anchor.web3.Connection(
        "http://127.0.0.1:8899",
        "confirmed"
    );

    const secretKey = JSON.parse(
        readFileSync(
            `${process.env.HOME}/.config/solana/id.json`,
            "utf8"
        )
    );

    const creator = anchor.web3.Keypair.fromSecretKey(
        Uint8Array.from(secretKey)
    );

    const wallet = new anchor.Wallet(creator);

    const provider = new anchor.AnchorProvider(
        connection,
        wallet,
        { commitment: "confirmed" }
    );

    anchor.setProvider(provider);

    const idl = JSON.parse(
        readFileSync("target/idl/splitpay_onchain.json", "utf8")
    );

    const program = new anchor.Program(idl, provider);

    const splitId = new anchor.BN(Date.now());

    const participants = [
        {
            wallet: anchor.web3.Keypair.generate().publicKey,
            amount: new anchor.BN(10_000_000),
            paid: false,
        },
        {
            wallet: anchor.web3.Keypair.generate().publicKey,
            amount: new anchor.BN(10_000_000),
            paid: false,
        },
        {
            wallet: anchor.web3.Keypair.generate().publicKey,
            amount: new anchor.BN(10_000_000),
            paid: false,
        },
    ];

    const [splitPda] =
        anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("split"),
                creator.publicKey.toBuffer(),
                splitId.toArrayLike(Buffer, "le", 8),
            ],
            program.programId
        );

    const signature = await program.methods
        .createSplit(
            splitId,
            new anchor.BN(30_000_000),
            participants
        )
        .accounts({
            split: splitPda,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    console.log("Transação:", signature);
    console.log("PDA:", splitPda.toBase58());

    const account = await connection.getAccountInfo(splitPda);

    if (!account) {
        throw new Error("A conta da despesa não foi criada");
    }

    console.log("Despesa criada on-chain!");
    console.log(
        "Tamanho da conta:",
        account.data.length,
        "bytes"
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
