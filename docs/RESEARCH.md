# Research log

Dates are 2026-11-24 unless stated. Versions come from the registries (crates.io, npm, Maven Central, `avm list`), not memory.

## Toolchain on the build machine (Apple M1 Pro, macOS)

| Tool | Version | Source |
|---|---|---|
| Rust (host, pinned in `rust-toolchain.toml`) | 1.99.1 | `rustc --version` |
| Solana platform-tools rustc used by `cargo build-sbf` | 1.95.0-dev | Anchor build output |
| Agave / Solana CLI | 3.0.10 | `solana --version` |
| Anchor CLI and `anchor-lang`, `anchor-spl` | 1.2.2 | `avm list` (latest), crates.io `max_stable_version` |
| Kani | 0.68.0 | crates.io `kani-verifier`; installs and runs on Apple Silicon |
| LiteSVM, litesvm-token | 0.18.2 | crates.io |
| Node | 24.10.0 | `node --version` |
| pnpm | 10.32.1 | `pnpm --version` |
| Java | OpenJDK 17.0.17 | `java -version` |
| Android emulator | 36.2.12.0, image android-36.1 google_apis_playstore | `emulator -version` |
| ffmpeg | 8.1.2 | `ffmpeg -version` |

## Program test harness

Options: Anchor test stack with a local validator, Mollusk 0.17.1, LiteSVM 0.18.2.
Choice: **LiteSVM**. It runs in-process, so the 36 positive and negative tests finish in about 0.3 s, supports clock overrides (period rollover and expiry), arbitrary account writes, and has a token helper crate. A local validator is slower and cannot warp the clock cheaply. Mollusk is instruction-level and weaker for multi-instruction flows with token CPIs.

Anchor 1.x constraint: SBF builds use platform-tools rustc 1.95, so `rust-version` for the program package stays at 1.89 while the host toolchain is 1.99.1 (needed because litesvm 0.18 requires rustc 1.97.1 for dev builds, and `anchor build` also runs the IDL build with the host compiler).

## Formal verification

- Kani 0.68.0: installed with `cargo install --locked kani-verifier --version 0.68.0` and `cargo kani setup`; setup completed on Apple Silicon without a container. `#[kani::unwind]` requires a literal; array equality on 32-byte keys is itself a loop, so harnesses use unwind 34.
- Certora Solana Prover: `cargo-certora-sbf` 0.3.5 on crates.io, `certora-cli` 8.20.3 on PyPI. The attempt and outcome are recorded in `docs/VERIFICATION.md` and `docs/BLOCKED.md`.

## Solana Mobile platform

Sources: github.com/solana-mobile/seed-vault-sdk README, github.com/solana-mobile/mobile-wallet-adapter README, Maven Central metadata.

- Seed Vault Wallet SDK (`com.solanamobile:seedvault-wallet-sdk:0.4.0`, published 2025-10-06) is "primarily intended for consumption by developers of Android wallet apps". The repository ships a simulator that implements the Seed Vault interfaces; the repository states it "makes zero guarantees about security" and must only hold test accounts.
- Mobile Wallet Adapter (clientlib-ktx and walletlib 2.2.1, published 2026-11-09). `walletlib` lets a wallet app answer MWA requests from dapps.
- Consequence for Selvedge: a third-party app cannot silently intercept another wallet's Seed Vault prompt. What it can be is the **wallet**: an MWA wallet (walletlib) that receives `sign_transactions` and `sign_and_send_transactions` requests from any dapp, runs decode, simulation and risk review, applies the biometric veto, and only then signs through the Seed Vault Wallet SDK. The earlier notes that claim interception of other wallets' Seed Vault flow are not supported by the platform and are not used.
- On an emulator the Seed Vault simulator stands in for hardware. The README and app label this.

## x402 on Solana

Source: github.com/coinbase/x402 `specs/schemes/exact/scheme_exact_svm.md`; npm `@x402/core`, `@x402/svm`, `@x402/express`, `@x402/fetch` all 2.32.0.

- The `exact` scheme requires an on-chain `TransferChecked` of at least the required amount to the `payTo` associated token account. The transfer may be a top-level instruction or a CPI emitted by another program; exactly one matching transfer must exist across the full CPI trace.
- Smart-wallet (CPI) payments are verified by simulation (Path 2) and only for programs on the facilitator's allowlist (`smartWalletAllowedPrograms`). The mandate program is therefore allowlisted in a self-hosted facilitator, which is the documented route, instead of relying on a third-party facilitator that would reject an unknown program.
- Fee payer isolation, compute budget caps and duplicate-settlement mitigation (120 s payload cache) are required of the sponsor and are implemented in the gateway's facilitator configuration.

## Package versions pinned (npm, 2026-11-24)

next 16.4.6, react 19.3.1, typescript 7.0.2, zod 4.6.7, vitest 5.1.1, playwright 1.65.1, @solana/kit 8.6.0, @solana-program/token 0.18.0, @solana-program/token-2022 0.20.1, codama 1.11.0, @codama/renderers-js 2.9.1, @x402/* 2.32.0, @anthropic-ai/sdk 1.13.0. `@solana/web3.js` 3.2.1 exists but the project uses `@solana/kit` for new code because the x402 SVM package is built on it.

## Prior art and what is borrowed or rejected

Source for the May 2026 results: `07-dev3pack-global/research/transcripts/2026-05-closing-ceremony.txt` (organizer spoken results). Winners named there: main track Afterlife (Costa Rica), pos01 (France), comeits (Ghana); best x402 bonus prize Zerix 402 Warden (Chile), an x402 payment guard; Solana Mobile track winners included Today Chain, Kumupe and O drop; the ElevenLabs track went to Graphin, described as security related.

What this tells the design:

- A bonus prize for x402 went to a guard that sits in front of payments. Selvedge borrows the idea and moves the guard on-chain: the payment cap is enforced by the mandate program, not only by a policy server.
- Mobile track winners were judged on real Solana Mobile integration. Selvedge therefore ships a real MWA wallet implementation on top of the Seed Vault Wallet SDK instead of a mock.
- Judges said "landing page but no app" is the most common mistake. Every dashboard page reads live devnet state.

Borrowed (concepts, no code): transaction simulation and balance-delta presentation as used by mainstream wallets; the allowlist-before-simulate pattern from the x402 SVM reference facilitator; Kani bounded model checking applied to pure policy logic, as practised for Rust smart-contract components.
Rejected: LLM-only transaction explanation (non-deterministic and spoofable by prompt injection; here explanations are templates over decoded facts); interception of another wallet's Seed Vault prompt (not a platform capability); Squads or Swig as the spending-limit layer (a purpose-built mandate keeps the verified surface small enough to prove).
