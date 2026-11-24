# Progress

Single source of truth. Read this first when resuming.

## Current phase

Phase 0: bootstrap.

## Tasks

- [x] Repo initialised at `projects/selvedge`, MIT licence, gitignore
- [ ] Toolchain recorded in RESEARCH.md
- [ ] Phase 1 docs: ARCHITECTURE, THREAT-MODEL, API, vectors format
- [ ] Phase 2 mandate program, tests, Kani, devnet deploy
- [ ] Phase 3 engine and vectors
- [ ] Phase 4 agent runtime
- [ ] Phase 5 studio port and x402 gateway
- [ ] Phase 6 web dashboard
- [ ] Phase 7 Android app
- [ ] Phase 8 devnet end-to-end scenarios
- [ ] Phase 9 brand and docs
- [ ] Phase 10 demo video
- [ ] Phase 11 hardening loop

## Next actions

1. Record toolchain versions in docs/RESEARCH.md.
2. Write ARCHITECTURE.md and THREAT-MODEL.md.
3. Implement `programs/mandate/src/logic`.

## Open risks

- Devnet SOL balance on the deploy wallet is limited (airdrop rate-limited).

## Studio service (services/studio)

- [x] Atelier engine ported (spec, engine, ops, av, docs, checks, presets, recipes), renamed to `selvedge_studio`, provenance in PROVENANCE.md
- [x] Generators, reachable-operation catalogue, single pricing table, JSON Schema export
- [x] FastAPI service: health, pricing, quote, direct, jobs, status, SSE events, result; token guard, idempotency, payment refusal, body and rate limits
- [x] Director with provider seam and scripted fake
- [x] Tests: ported engine tests plus service tests; ruff and mypy strict clean
- [ ] LibreOffice is not installed on this machine, so `doc.convert` style operations are untested here

## Phase 6 and 9 (web dashboard, brand)

- [x] Brand assets: logo, favicon set, banner, self-hosted fonts
- [x] Dashboard: overview, agents, mandate detail, activity reviewer, containment, proofs, kill switch
- [x] Tests: 20 vitest (including live devnet program read), 30 Playwright at 360 and 1280 with axe, 12 live checks against the deployment
- [x] Deployed: https://selvedge-dashboard.vercel.app
