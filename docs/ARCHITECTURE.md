# Architecture

Selvedge: every agent acts only within an on-chain mandate, and security agents explain and veto risky actions before the user signs.

## Principle: spec, then engine

The model emits a small structured intent. Deterministic code validates it against a versioned schema, builds the transaction or studio spec, simulates, decodes, scores risk and applies policy. The model never builds raw transactions, never signs, never executes shell or code. Invalid intents come back as typed errors for a bounded number of retries.

## Three gates before value leaves a wallet

1. **Engine policy pre-check** (`packages/engine`, mirrors the program's logic, fast feedback).
2. **Mandate program** (`programs/mandate`, the authority: cap, period, allowlists, expiry, revocation, nonce).
3. **Biometric confirmation through the Seed Vault** (Android app) for anything the risk engine marks high.

Compromising the model defeats none of them: gate 1 is code, gate 2 is on-chain, gate 3 needs the person.

## Components

```
                 +--------------------+
  user ---------> apps/android (MWA     |  decode, simulate, risk, biometric veto,
                 |  wallet + Seed Vault)|  signs via Seed Vault
                 +----------+---------+
                            | RPC (devnet)
 +-------------+   +--------v---------+   +----------------------+
 | apps/web    |<->| Solana devnet    |<->| programs/mandate     |
 | dashboard   |   | mandate accounts |   | logic/ (Kani-proved) |
 +------+------+   +--------^---------+   +----------------------+
        |                   |
 +------v-----------+  +----+--------------------+
 | packages/        |  | packages/agent-runtime  |
 | engine (TS)      |<-| orchestrator, agents,   |
 | decode, simulate,|  | tool registry, model    |
 | risk, policy     |  | adapters, security agent|
 +------------------+  +----+--------------------+
                            | x402 (402 -> pay -> retry)
                     +------v-----------+       +--------------------+
                     | packages/        |------>| services/studio    |
                     | paid-gateway     |       | validated specs,   |
                     | resource server  |       | deterministic ops, |
                     | + facilitator    |       | priced in USDC     |
                     +------------------+       +--------------------+
```

## Mandate account

PDA seeds `["mandate", owner, mandate_id_le_u64]`, stored bump. Fields: version, bump, mandate_id, owner, agent, security_authority, mint, period_cap, period_seconds, period_start, spent_in_period, expiry, revoked, nonce, allowed_programs (4), allowed_payees (4), allowed_tools (8).

Instructions: `create_mandate`, `update_limits` (owner), `revoke_mandate` (owner or security authority), `rotate_agent` (owner), `spend` (agent signs; token CPI signed by the mandate PDA as delegate), `close_mandate` (owner). Events: MandateCreated, LimitsUpdated, MandateRevoked, SpendAuthorized, AgentRotated, MandateClosed. Typed errors: see `programs/mandate/src/error.rs`.

Funds model: the owner keeps USDC in their own token account and approves the mandate PDA as delegate for at most the amount they are willing to expose. The program caps per period inside that allowance.

## Agent types

- **Studio agent:** request to studio spec (validated), price computed from the single pricing table, x402 payment authorised by a mandate `spend`, studio renders, result returned.
- **Security agent:** consumes mandate events and pending transactions; decodes, simulates, scores, explains; can call `revoke_mandate` as the designated security authority.
- **Payments agent:** transfers and swaps as intents under a mandate.
- **Orchestrator:** spawns an agent from a template (creates the mandate), observes it, tears it down on revoke or expiry.

## Engine

`decode` (legacy and v0 with lookup tables; System, SPL Token, Token-2022, Associated Token, Compute Budget, Memo, mandate program; unknown programs flagged) then `simulate` (RPC `simulateTransaction`, net deltas from pre and post state) then `risk` (versioned rules, pure function of decode plus simulation) then `explain` (templates filled with decoded facts; an optional model may only rephrase and cannot alter facts, score or verdict).

Policy math, decoder cases and risk rules are specified once as JSON vectors in `vectors/` and both the TypeScript engine and the Kotlin on-device engine must pass them.

## x402 payment path

Agent calls the gateway, receives HTTP 402 with `exact` SVM requirements, builds a transaction whose single matching transfer is emitted by the mandate program's `spend` CPI, signs as the agent key, the gateway's facilitator verifies by simulation (mandate program is on its smart-wallet allowlist), settles with its fee payer, and forwards the paid request to the studio service. The studio refuses a spec whose computed price exceeds the paid amount; jobs are idempotent per payment reference.

## Android

Selvedge for Android is an MWA wallet (walletlib 2.2.1). Dapps request signing; the app decodes, simulates and scores; high risk shows a red screen requiring biometric override; approved transactions are signed through the Seed Vault Wallet SDK (0.4.0). On an emulator the Seed Vault simulator is the key store and is labelled as such.

## Data and state

Mandate state is on-chain. Agent runs, logs and containment events are persisted as JSON files by the orchestrator (file store, atomic writes). The dashboard reads chain state through RPC and the containment log through the runtime API.
