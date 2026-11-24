# Blocked items


## Certora prover run (needs owner)

- What: `certoraSolanaProver programs/mandate/certora/rules.conf`.
- Error: `The environment variable CERTORAKEY does not contain a Certora key.`
- Tried: installed `cargo-certora-sbf` 0.3.5 and `certora-cli` 8.20.3, built the rule crate with Certora's platform tools successfully.
- Needs: a free key from https://www.certora.com/signup, set as `CERTORAKEY`. Kani results stand independently.

## Android

1. **Seed Vault and the Seed Vault simulator were not run.** The simulator lives in `solana-mobile/seed-vault-sdk` and was not built or installed on the emulator, so `SeedVaultBackend` compiles but has never signed anything. The emulator used the labelled test wallet.
2. **MWA was not exercised end to end.** No dapp was run against `MwaActivity`, so the `solana-wallet:` association and the `signTransactions` path are untested. `walletlib` 2.2.1 resolves and the code compiles.
3. **The real biometric prompt cannot be screenshotted.** `adb screencap` returns a black image for the system prompt. The prompt was shown and cancelled by hand, and `docs/screens/09-override-cancelled.png` shows the result.
4. **The emulator instrumented tests use a fake biometric authenticator.** Fingerprint enrolment was done by hand for the manual check only.
5. **Mandates are not submitted on-chain from the app.** The app validates and stores them with the mirrored policy logic.
6. **Address lookup tables are not fetched on the device.** Transactions that use them show the SV-010 warning.
7. **Paparazzi was not used.** Screenshot tests are Compose instrumented tests. See DECISIONS 18.

