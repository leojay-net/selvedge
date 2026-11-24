# Decisions

Each entry: decision, reason.

1. **Repo owner is `leojay-net`.** The master prompt says `web-ghost-dotcom` is not logged in, but `gh auth status` shows all three accounts logged in. `leojay-net` is the account the prompt directs and is active.
2. **Policy logic lives in `programs/mandate/src/logic/` and is compiled into the Kani proof crate with `#[path]`.** The proof therefore covers the exact source that ships, and the proof crate does not pull in anchor-lang.
3. **LiteSVM 0.18.2 is the program test harness.** See RESEARCH.md.
4. **Host Rust 1.99.1, program `rust-version` 1.89.** Platform-tools rustc is 1.95; litesvm needs 1.97.1 on the host.
5. **A spend is a token CPI performed by the mandate PDA acting as the SPL token delegate.** The owner approves the PDA as delegate on a token account. The token program enforces the delegated amount, the mandate program enforces cap, period, allowlists, nonce, expiry and revocation. Two independent ceilings apply. Revoking the mandate stops spends even if the token delegation remains; the engine also issues a token `revoke` when it can.
6. **`allowed_programs` constrains the CPI target program of a spend (the token program), `allowed_payees` constrains the owner of the destination token account.** Payment destinations are wallets, not programs, so both lists exist.
7. **Lowering a cap below the amount already spent in the current period is rejected** (`CapBelowSpent`) so the invariant `spent <= cap` holds after every operation and can be proven. An owner who wants an immediate stop revokes.
8. **Revocation is final.** A revoked mandate cannot be updated or rotated, only closed. Reinstating means creating a new mandate.
9. **Nonce guards replay.** Every spend and rotation increments the nonce; a spend names the nonce it expects.
10. **Anchor 1.2.2, not 2.0.0-rc.** The release candidate is not stable.
11. **Mobile architecture follows the platform.** Selvedge for Android is an MWA wallet that sits between dapps and the Seed Vault, not an interceptor of other wallets (RESEARCH.md).
12. **Self-hosted x402 facilitator inside the gateway** with the mandate program on the smart-wallet allowlist, because third-party facilitators reject unknown wrapper programs.
13. **Commit identity** uses the GitHub noreply address so the owner's email is not published.
