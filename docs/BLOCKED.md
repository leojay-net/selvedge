# Blocked items

## Certora prover run (needs owner)

- What: `certoraSolanaProver programs/mandate/certora/rules.conf`.
- Error: `The environment variable CERTORAKEY does not contain a Certora key.`
- Tried: installed `cargo-certora-sbf` 0.3.5 and `certora-cli` 8.20.3, built the rule crate with Certora's platform tools successfully.
- Needs: a free key from https://www.certora.com/signup, set as `CERTORAKEY`. Kani results stand independently.
