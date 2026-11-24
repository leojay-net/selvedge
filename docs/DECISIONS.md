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
14. **Android: AGP 8.13.2 with Gradle 8.14.3, compile SDK 37.** AGP 9.x forces the new DSL and a Gradle that is not cached locally. walletlib 2.2.1 requires compile SDK 37, so the 37.0 platform was installed with sdkmanager and `android.suppressUnsupportedCompileSdk=37.0` silences the AGP 8 notice. Target SDK stays 36.
15. **Android: AndroidX is pinned one generation behind the newest release.** Compose BOM 2026.11.01, core-ktx 1.19.1, lifecycle 2.11.1 and activity-compose 1.13.0 all require AGP 9.1 or newer (reported by `checkDebugAarMetadata`). The pins are Compose BOM 2025.12.01, core-ktx 1.17.0, lifecycle 2.10.0, activity-compose 1.12.4, fragment 1.8.9 and appcompat 1.7.1.
16. **Android: the Kotlin engine is a pure JVM module that mirrors the TypeScript engine and is held to it by the shared vectors.** It reads `vectors/` through a Gradle path (`selvedge.vectors` system property), with no copies.
17. **Android: minimum SDK 33.** The test wallet uses the platform Ed25519 provider, and Saga ships Android 13.
18. **Android: screenshot tests are Compose instrumented tests (`captureToImage`) on the emulator, not Paparazzi.** Paparazzi renders with layoutlib, which does not load variable fonts the way the device does, so it would not show the real typography.
19. **Android: Selvedge is an MWA wallet.** It cannot intercept another wallet's Seed Vault prompt. Dapps reach it over the `solana-wallet:` association URI, and it signs through the Seed Vault Wallet SDK.
20. **Android: a clean verdict without a simulation is shown as caution.** Balance changes are unknown without simulation, so the app never labels such a transaction safe.
21. **Android: the biometric override accepts strong biometrics only.** There is no device-credential fallback, so a danger verdict cannot be bypassed with a PIN. If no biometric is enrolled the transaction stays blocked.
22. **Android: mandates are stored on the device and validated with the mirrored policy logic. The app does not submit them to Solana.** The agent list says so on screen.
