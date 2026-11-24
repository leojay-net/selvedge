# API contracts

All HTTP bodies are JSON and validated at the boundary. Errors use one envelope:

```json
{ "error": { "code": "spec_invalid", "message": "human readable", "details": { } } }
```

## Studio service (`services/studio`, Python, default port 8710)

| Method and path | Purpose |
|---|---|
| `GET /v1/health` | `{ "status": "ok", "version": "..." }` |
| `GET /v1/pricing` | Pricing table: every operation id with `microUsdcPerUnit`, `unit`, `minimumMicroUsdc`. USDC has 6 decimals; all amounts are integers in micro-USDC. |
| `POST /v1/quote` | Body `{ "spec": StudioSpec }`. Returns `{ "specHash", "totalMicroUsdc", "lineItems": [...] }`. Pure, no side effects. |
| `POST /v1/direct` | Body `{ "request": "text" }`. The director turns text into a validated `StudioSpec` (model adapter seam; deterministic fake available for tests). Returns `{ "spec", "quote" }`. |
| `POST /v1/jobs` | Internal. Requires header `X-Selvedge-Internal-Token`. Body `{ "spec": StudioSpec, "paymentReference": "string", "paidMicroUsdc": 123 }`. Rejects with `payment_insufficient` when the computed price exceeds `paidMicroUsdc`. Idempotent per `paymentReference`: the same reference returns the same job. Returns 202 `{ "jobId" }`. |
| `GET /v1/jobs/{jobId}` | Status `queued, running, succeeded, failed`, progress 0..1, error if failed. |
| `GET /v1/jobs/{jobId}/events` | Server-sent events with progress. |
| `GET /v1/jobs/{jobId}/result` | The rendered media file with its content type. |

`StudioSpec` is versioned (`"version": 1`) and defined by the JSON Schema exported at `services/studio/schema/studio-spec.v1.json`. The model never executes anything: it proposes a spec, the engine validates it, prices it and renders it.

## Paid gateway (`packages/paid-gateway`, Node, default port 8720)

Resource server and self-hosted x402 facilitator.

| Method and path | Purpose |
|---|---|
| `POST /studio/jobs` | Paid. Without payment returns 402 with x402 `PaymentRequired` (scheme `exact`, network `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, asset the devnet USDC mint, `payTo` the gateway's merchant wallet, amount = quoted price, `extra.memo` = payment reference). With a valid `PAYMENT-SIGNATURE` header the gateway verifies, settles, creates the studio job and returns 202 `{ "jobId", "settlement": { "transaction": "base58 signature" } }`. |
| `GET /studio/jobs/{jobId}` and `/result` | Free reads, proxied to the studio service. |
| `POST /studio/quote` | Free quote. |
| `GET /health` | Liveness. |

## Agent runtime API (`packages/agent-runtime`, Node, default port 8730)

| Method and path | Purpose |
|---|---|
| `GET /agents` | Agents with mandate address, status, spend. |
| `POST /agents` | Body `{ "template": "studio" | "security" | "payments", "limits": { ... } }` spawn plan. The owner signs the mandate creation. |
| `POST /agents/{id}/runs` | Start a run with a user request. |
| `GET /agents/{id}/runs/{runId}` | Steps, tool calls, refusals with the gate that stopped each. |
| `GET /containment` | Containment log: every blocked attempt with the gate and a plain-English reason. |
| `POST /review` | Body `{ "transactionBase64": "..." }`. Returns decode, simulation deltas, risk findings, verdict and explanation. Used by the dashboard and the Android app. |

## Engine types (TypeScript, `packages/engine`)

`ReviewResult { decoded, simulation, findings: RiskFinding[], score, verdict: "safe" | "caution" | "danger", explanation, rulesetVersion }`. `RiskFinding { ruleId, severity: "info" | "warning" | "critical", title, detail, evidence }`. The schema is exported as JSON Schema and mirrored by the Kotlin engine.
