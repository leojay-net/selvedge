# Selvedge Studio

The deterministic media engine behind Selvedge's studio agent. The model proposes a small, versioned spec; this service validates it, prices it in USDC micro-units, and renders it only after payment. Ported and reworked from the owner's earlier project Atelier (see `../../docs/PROVENANCE.md`).

## What it does

- **Spec then engine.** A `StudioSpec` is either explicit `steps` plus `outputs`, or one `recipe`. It may declare `generators` (a flat-colour `canvas`, a pure `tone`) so an agent can start from nothing. Specs carry no asset handles, paths, URLs or check overrides.
- **Deterministic operations.** Image, audio, video, PDF, Word, Excel and PowerPoint operations run in sandboxed worker processes, results are cached by content hash. Only operations reachable from the generators are exposed; debug operations never are.
- **Priced before it runs.** `pricing.py` is the single table. A spec's price is a pure function of the spec (generator size or length plus a flat price per step).
- **Paid jobs.** `POST /v1/jobs` is internal (token header), refuses when the price exceeds `paidMicroUsdc`, and is idempotent per `paymentReference`.

HTTP contract: `../../docs/API.md` (Studio service). JSON Schema: `schema/studio-spec.v1.json`.

## Run

Requires Python 3.12 or 3.13, [uv](https://docs.astral.sh/uv/) and `ffmpeg` on `PATH`. LibreOffice (`soffice`) is optional and only needed for Office conversion operations.

```
cd services/studio
uv sync
export SELVEDGE_STUDIO_INTERNAL_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
uv run python -m selvedge_studio serve
```

Settings are read from environment variables (see `.env.example`). The director (`POST /v1/direct`) is off unless `SELVEDGE_STUDIO_DIRECTOR_PROVIDER` is `openai_compatible` (for example Vultr Serverless Inference) or `anthropic`; its key comes from the environment only.

Regenerate the schema after changing the spec model:

```
uv run python -m selvedge_studio export-schema schema/studio-spec.v1.json
```

## Test

```
uv run pytest
uv run ruff check src tests
uv run mypy
```

`tests/unit` holds the engine tests kept from Atelier; `tests/service` covers pricing, quote determinism, payment refusal, idempotency, schema validation, rate and size limits, and the director including injection-style requests.

## Layout

```
src/selvedge_studio/
  spec/ engine/ ops/ av/ docs/ checks/ presets/ recipes/   engine, ported from Atelier
  service/                                                   HTTP API, pricing, jobs, director
assets/                                                      fonts (SIL OFL 1.1) and sRGB profile
schema/studio-spec.v1.json                                   exported JSON Schema
```
