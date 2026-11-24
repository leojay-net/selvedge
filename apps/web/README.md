# Selvedge web dashboard

The dashboard for Selvedge, a mandate-bound agent platform on Solana. It reads mandate accounts straight from devnet, reviews transactions with the Selvedge engine, and lets an owner revoke a mandate from a wallet-standard wallet after seeing the decoded transaction.

Live: https://selvedge-dashboard.vercel.app (public, no login).

## Pages

| Route | What it shows |
| --- | --- |
| `/` | Live program status, mandate counts and the three gates |
| `/agents` | Every mandate account of program `DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd` with spend meters |
| `/mandates/[address]` | Parties, allowlists, period and expiry, and the kill switch |
| `/activity` | Paste-a-transaction reviewer and recent mandate transactions with engine verdicts |
| `/containment` | Refusals read from `${SELVEDGE_RUNTIME_URL}/containment` |
| `/proofs` | `docs/VERIFICATION.md` rendered at build time, plus the commands that reproduce each check |

Without a connected wallet everything is read-only. The kill switch builds a `revoke_mandate` transaction, sends it through `/api/review`, shows the decoded review, and only then asks the wallet to sign and send.

## Run it

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm -C apps/web dev
```

Variables (see `.env.example`):

- `SOLANA_RPC_URL`: server-side RPC, defaults to public devnet.
- `SELVEDGE_RUNTIME_URL`: runtime that serves `/containment`. Unset shows the designed empty state.
- `NEXT_PUBLIC_SOLANA_CHAIN`, `NEXT_PUBLIC_EXPLORER_CLUSTER`: chain id and explorer cluster.

No secret reaches the browser. The RPC URL is only read in server code.

## Verify it

```bash
pnpm -C apps/web typecheck
pnpm -C apps/web test            # 6 files, 20 tests, includes a live devnet read of the program account
pnpm -C apps/web build
pnpm -C apps/web exec playwright test      # 30 tests: 360px and 1280px, axe, fixture RPC, wallet-standard signing
SELVEDGE_LIVE_URL=https://selvedge-dashboard.vercel.app pnpm -C apps/web exec playwright test -c playwright.live.config.ts
```

The end-to-end suite starts a fixture RPC and runtime (`tests/fixtures/rpcServer.ts`) on port 8899 and the built app on port 3100. Build first.

## Notes

- The engine and SDK use `.js` import specifiers on TypeScript sources. Turbopack does not alias them, so the app builds with `next build --webpack` and an `extensionAlias` in `next.config.ts`.
- Route handlers validate input with zod, cap request bodies at 4096 bytes and rate limit per client IP. The limiter is in memory, so on serverless it is per instance, not global.
- `prebuild` copies `docs/VERIFICATION.md` into `apps/web/content/`. If the file does not exist the proofs page shows its empty state.

## Deploy

The Vercel project `selvedge-dashboard` (team `zerroais-projects`) uses root directory `apps/web` with source files outside the root enabled, so the workspace packages resolve. Deploy from the repository root:

```bash
vercel deploy --prod --scope zerroais-projects
```
