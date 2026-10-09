# SplitPay Onchain

SplitPay is an on-chain foundation for shared-expense accounts on Solana. The project models a split expense as a PDA-owned Anchor account containing the creator, recipient, total amount, and participant allocations.

> **Current status:** The implemented flow creates and validates split-expense accounts on Solana localnet. USDC transfers and the frontend are not implemented yet.

## Implemented

- Anchor program deployed for localnet development.
- `create_split` instruction for creating a split-expense account.
- PDA derivation using the `split` seed, creator public key, and split ID.
- Validation for participant count, positive amounts, duplicate wallets, unpaid participants, and total allocation.
- TypeScript localnet script that submits a split creation transaction and verifies the created account.
- Rust workspace and Anchor-compatible project layout.

## Under development

- USDC mint and token-account integration.
- Participant payment and settlement instructions.
- Payment status updates and split completion handling.
- Frontend application and wallet connection.
- Automated end-to-end coverage for the complete payment flow.
- Deployment configuration for a public Solana cluster.

## Architecture

- **Solana:** The execution and account layer.
- **Anchor:** Rust framework for instruction handlers, account constraints, serialization, and IDL generation.
- **Program:** `programs/splitpay-onchain` contains the on-chain logic and state definitions.
- **State:** `SplitAccount` stores the creator, recipient, mint placeholder, split ID, total amount, participant list, and PDA bump.
- **Client script:** `scripts/test-create-split.ts` uses `@coral-xyz/anchor` and `@solana/web3.js` to create a split on a local validator.

The current implementation records allocation data on-chain. It does not move USDC or other SPL tokens; `mint` is currently initialized as the default public key until token settlement is added.

## Prerequisites

Install the Rust toolchain, Solana CLI, Anchor CLI, Node.js, and Yarn. A Solana keypair is expected at the standard local CLI path `~/.config/solana/id.json`; this file must remain outside the repository.

## Local development

```bash
# Install JavaScript dependencies
yarn install

# Build the Anchor program
anchor build

# Start a local validator in another terminal
solana-test-validator

# Configure the local Solana CLI when needed
solana config set --url localhost

# Deploy to localnet
anchor deploy

# Run the Rust test suite
cargo test

# Create and verify a sample split account on localnet
npx ts-node scripts/test-create-split.ts
```

The TypeScript script reads the local wallet from `HOME/.config/solana/id.json`, loads the generated IDL from `target/idl/splitpay_onchain.json`, and connects to `http://127.0.0.1:8899`.

## Project layout

```text
programs/splitpay-onchain/  Anchor smart contract
scripts/                    Localnet client scripts
tests/                      Rust test workspace
Anchor.toml                 Anchor configuration
Cargo.toml                  Rust workspace manifest
package.json                TypeScript client dependencies
```

## Security and repository hygiene

Never commit private keys, seed phrases, wallet JSON files, `.env` files, or credentials. The repository ignore rules cover common Solana wallet/keypair paths, environment files, logs, build output, and IDE metadata. Use a dedicated local development wallet and verify `git status` before committing.

## License

MIT
