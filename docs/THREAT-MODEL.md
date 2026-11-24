# Threat model

## Assets

Funds in the owner's token account; the owner's signing key (Seed Vault); the agent key; mandate integrity; user trust in what the review screen says.

## Actors

Owner; agent (model plus runtime); security agent; malicious dapp or counterparty; prompt-injecting content (web, media, tool output); network attacker (RPC); supply chain.

## Trust boundaries

Model output is untrusted. Tool results and fetched content are data, never instructions. RPC responses are checked against what the transaction itself declares. The on-chain program trusts only signers and account data it validates.

## Attack scenarios and controls

| Scenario | Control | Residual risk |
|---|---|---|
| Prompt injection makes the agent try to send funds elsewhere | Payee allowlist in mandate (gate 2); engine rejects before building (gate 1); adversarial suite attributes each refusal to a gate | An owner who allowlists a hostile payee |
| Agent tries to widen its own mandate | `update_limits` requires the owner signature; the agent key cannot sign as owner; no tool exposes it | Owner key compromise |
| Agent calls a disallowed tool | Tool allowlist in both the registry and the mandate (tool id) | None known |
| Malicious dapp submits a drainer transaction to the wallet | Decode, simulate, risk rules, red screen and biometric veto | A drainer pattern no rule covers; mitigated by the unknown-program rule |
| Compromised agent key | Cap per period and token allowance bound loss; security agent or owner revokes; rotation | Loss up to one period cap before detection |
| Replayed spend | Nonce increments on every spend and rotation; blockhash expiry | None known |
| Closed or revoked mandate reuse | Revocation is final; closed account loses its discriminator | None known |
| RPC lies about simulation | Final authority is the program at execution; the review shows the transaction's own decoded instructions as well as the simulation; second RPC option | A lying RPC can hide effects of an unknown program until execution; unknown programs are flagged regardless |
| Model rephrase changes an explanation | Facts, score and verdict come from the engine; a test asserts identical verdicts with the model disabled | A misleading rephrasing of identical facts |
| x402 duplicate settlement | Gateway keeps a 120 s payload cache; studio jobs idempotent per payment reference | None known |
| Fee payer drain | Facilitator rejects any transaction referencing the fee payer outside the fee role | None known |
| Supply chain | Exact pinned versions, lockfiles committed, no install scripts run beyond the package managers' defaults, secret scan before push | Upstream compromise of a pinned release |
| Secret leak | Secrets only from env or untracked key files; structured logs with redaction tested | Operator error |

## Out of scope

Seed Vault hardware attacks; Solana consensus failures; the owner approving a transaction after reading and understanding a red warning.
