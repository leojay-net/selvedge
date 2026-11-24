# Progress

Status at usage-limit stop, 2026-11-24. Read this first when resuming.

## Done, with evidence
- Mandate program on devnet DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd, deployment tx 4jzVfdb1... (README). 37 LiteSVM tests pass. 10 Kani harnesses pass (docs/VERIFICATION.md).
- Certora: rule crate builds, prover blocked on account key (docs/BLOCKED.md).
- Engine (345 tests), SDK (8), paid gateway (8), agent runtime (24), web unit (21) pass. `pnpm verify:evidence` re-checks 20 devnet signatures.
- x402 payment through the mandate settled on devnet; injection refused at engine policy and at the mandate program; security agent revoked (docs/devnet-agent-run.json).
- Studio service merged (PROVENANCE.md), web dashboard merged and deployed at https://selvedge-dashboard.vercel.app, Android branch merged up to commit 3d2b3d6.
- README written with verified facts.

## Not done
- Android: emulator instrumented tests, accessibility checks, signed release APK, README facts. The Android agent (ada72ea0ef95199a0) may still be running in .claude/worktrees; merge its branch worktree-agent-ada72ea0ef95199a0 when it commits.
- Demo video: demo/script.txt, voice-over (106 s), film builder and plan exist; run build-film.mjs, tools/record-demo.mjs demo/plan.json, tools/mux-demo.sh, then ffprobe. Needs an Android clip for scene 3.
- docs/SUBMISSION-CHECKLIST.md, DEMO-SCRIPT.md, CHANGELOG.
- README run commands: program tests need target/deploy/selvedge_mandate.so built first (build command not documented yet).
- Hardening loop final pass, clean-checkout full test rerun after the IDL fix, studio full pytest result (docs/logs/studio-pytest.log).
- Push to public leojay-net/selvedge (run gh auth status first), tag v0.1.0, release with APK.
