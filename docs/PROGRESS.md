# Progress

Status 2026-11-24, tag v0.1.0 released at https://github.com/leojay-net/selvedge/releases/tag/v0.1.0 (APK sha256 eacb6111...8b74, tutorial video 168.6 s).

## Definition of Done
- [x] Program on devnet, deployment tx 4jzVfdb1... verified by `pnpm verify:evidence` (20 signatures).
- [x] 37 program tests, 10 Kani proofs (docs/VERIFICATION.md). Certora attempted; prover blocked on account key (docs/BLOCKED.md).
- [x] Engine vectors pass in TypeScript (345 tests) and Kotlin (324 vector cases). Property tests in packages/engine.
- [x] Runtime adversarial suite (24 tests), every refusal attributed to a gate.
- [x] x402 payment settled as a mandate spend on devnet (README).
- [x] PROVENANCE.md and scans clean; gitleaks clean.
- [x] Dashboard live, Playwright 360/1280 with axe (30 tests).
- [~] Android: release APK built and installed on an emulator, 8 emulator tests pass; Seed Vault and MWA paths untested, software Test Wallet labelled.
- [x] Devnet scenarios with signatures in README.
- [x] README, docs, .env.example, LICENSE, banner, logo, favicon.
- [x] Tutorial video 168.6 s (ffprobe): live site walkthrough plus the release APK on an Android emulator, voice-over and burned captions; release asset selvedge-tutorial.mp4.
- [x] Public repo pushed from leojay-net.
- [ ] A further hardening pass after the final push.

## Owner steps
Dev3pack dashboard acceptance, upload the video, submit the form, optional Certora key.
