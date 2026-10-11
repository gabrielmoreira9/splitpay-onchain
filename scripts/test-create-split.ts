
import * as anchor from "@coral-xyz/anchor";
import anchorPackage from "@coral-xyz/anchor";
import { readFileSync } from "fs";

const { BN } = anchorPackage;
const MINT = new anchor.web3.PublicKey(
    "8HGTnjBhZq3f6xPKjAqZZESNkVYguBLuCbZn1Rm9kCAt"
);
const FUNDED_PARTICIPANT = new anchor.web3.PublicKey(
    "GNna9zGZbNqdLtUG4Qj3SUcmzkj4Bt6QG1xphHKb3MfF"
);

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

    const splitId = new BN(Date.now());

    const participants = [
        {
            wallet: FUNDED_PARTICIPANT,
            amount: new BN(10_000_000),
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
            new BN(30_000_000),
            participants
        )
        .accounts({
            split: splitPda,
            creator: wallet.publicKey,
            recipient: wallet.publicKey,
            mint: MINT,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    console.log("Transação:", signature);
    console.log("PDA:", splitPda.toBase58());

    const splitData = await (program.account as any)["splitAccount"].fetch(
        splitPda
    );

    console.log("\n=== SPLITPAY ===");
    console.log("Criador:", splitData.creator.toBase58());
    console.log("Recebedor:", splitData.recipient.toBase58());
    console.log("Valor total:", splitData.totalAmount.toString());
    console.log("Participantes:", splitData.participants.length);

    for (const participant of splitData.participants) {
        console.log({
            wallet: participant.wallet.toBase58(),
            amount: participant.amount.toString(),
            paid: participant.paid,
        });
    }

    if (splitData.participants.length !== 3) {
        throw new Error("Quantidade incorreta de participantes");
    }

    if (!splitData.totalAmount.eq(new BN(30_000_000))) {
        throw new Error("Valor total incorreto");
    }

    console.log("Validação da PDA concluída com sucesso!");


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
