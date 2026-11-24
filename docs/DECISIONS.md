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
14. **Studio is FastAPI, not Django/Ninja.** The studio service has no accounts, organisations or billing; a thin ASGI app with pydantic models is enough and keeps the dependency set small. Atelier's engine is ported unchanged in behaviour.
15. **Studio specs start from generators.** The engine only transforms existing assets and a paid public service must not accept uploads or URLs, so a `StudioSpec` declares a flat-colour `canvas` or a pure `tone` and builds on it. Specs carry no asset handles, paths, URLs or check overrides.
16. **Exposed operations are the ones reachable from generated media.** Computed by fixed-point reachability from image and audio, so no operation is offered that cannot receive an input. `debug.*` is never exposed.
17. **Neural operations dropped.** `video.auto_reframe`, `audio.denoise_speech`, speech transcription and the `auto_captioned_reel` recipe need downloaded model weights and are not reproducible on a fresh deploy.
18. **Pricing is flat and integer.** Micro-USDC per step by tier, canvas by megapixel, tone by second, minimum job price. The price is a pure function of the validated spec (recipes are priced by the steps they expand to), so a quote is deterministic and an agent can budget before paying. One table in `service/pricing.py`.
19. **Job id is derived from the payment reference** (`job_` plus the first 24 hex of its SHA-256). Idempotency needs no lookup table; the same reference with a different spec is refused with 409.
20. **Studio requires Python 3.12 or 3.13.** numpy 2.5 requires 3.12. All dependencies are pinned to exact versions from PyPI in `uv.lock`; pypdf stays at latest 7.1.1 (the 6.x pin was a wrong theory for a failure caused by a rename).
21. **Director is a one-shot text-to-spec call.** The model emits JSON only, validated by the same code as the paid path, with three bounded attempts. The request is wrapped in `<request>` tags as untrusted data. Providers: OpenAI-compatible (Vultr Serverless Inference) and Anthropic, behind a protocol seam with a scripted fake in tests.
22. **Dashboard builds with webpack, not Turbopack.** The engine and SDK import siblings with `.js` specifiers on `.ts` sources; Turbopack in Next 16.4.6 drops those re-exports, webpack resolves them through `resolve.extensionAlias`.
23. **Dashboard rate limit is in memory.** It is per serverless instance. It bounds abuse of the review and RPC proxy routes without adding a datastore; documented in `apps/web/README.md`.
24. **Dashboard deploys as Vercel project `selvedge-dashboard` under `zerroais-projects`** with root directory `apps/web` and source files outside the root enabled. The root `.gitignore` gained `.vercel`.
