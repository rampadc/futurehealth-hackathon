# Population Health — climate-resilient worker health

Heat-Safe Crew: site heat-control execution, worker trust, supervisor action, and auditable records.

**Downloaded data:** [public data archive and usage notes](data/README.md), with UAE weather, air quality and station observations, NASA cross-checks, US occupation proxies, and safety references. [The combined manifest](data/manifest.json) records provenance, checksums and download gaps.

**Start with the [complete business and hackathon plan](business/OPPORTUNITY_PLAN.md), refreshed 3 November 2026.** It combines research, market analysis, buyer strategy, why now, the reason to act, economics, distribution, sales, objection handling, and the hackathon demo and execution plan in one document.

The `research/`, `rfqs/`, and any `ideation/` files preserve supporting material. [SOURCES.md](SOURCES.md) indexes the original archive; the new plan carries refreshed citations. The earlier `business/BUSINESS_OPPORTUNITY.md` and `pitches/` briefs are superseded and retained only for traceability.


# Heat-Safe Crew Agent

Heat-stress early warning and shift planning for outdoor construction crews in Abu Dhabi.
Plan and architecture: `doc/heat-safe-crew-agent-plan.md`.

## Setup

```bash
uv sync                                        # Python deps into .venv
uv run python tools/download_data.py           # public data into data/ (gitignored)
uv run --env-file .env python tools/load_bigquery.py   # raw tables into BigQuery
uv run --env-file .env python tools/build_corpus.py    # guidance PDFs -> embeddings -> vectors.guidance_chunks
uv run pytest                                  # unit tests, no cloud access needed
```

## Credentials

This repo runs on the personal GCP project `future-health-513202`. The machine's default gcloud
credentials belong to a different (work) account, so **every command that calls GCP must load
`.env`**:

```bash
uv run --env-file .env python tools/ask_supervisor.py "Plan tomorrow for a roofing crew at site A"
uv run --env-file .env python evals/run_evals.py
uv run --env-file .env adk web agents
```

`.env` (gitignored) sets `GOOGLE_APPLICATION_CREDENTIALS` to a separate ADC file,
`~/.config/gcloud-heat-safe/application_default_credentials.json`, plus project, region and the
gcloud configuration. Without it, Google libraries fall back to the default ADC and every call
returns 403. `heat_safe.gcp.check_credentials` catches this at startup and says so in one line.

To avoid typing `--env-file`, either run `export UV_ENV_FILE=.env` once per terminal, or install
direnv (`brew install direnv`) and add an `.envrc` containing `dotenv`, so it loads whenever you
`cd` into the repo.

If the separate ADC expires, renew it without touching the work one:

```bash
CLOUDSDK_CONFIG=$HOME/.config/gcloud-heat-safe gcloud auth application-default login
```

## Layout

| Path | What |
|---|---|
| `src/heat_safe/` | Risk core (TWL, rules, scheduler, grounding), guidance search (RAG) and the agent's tool wrappers; RAG reading order and learning notes in `src/heat_safe/README_RAG.md` |
| `agents/supervisor/` | Supervisor planning agent (ADK, Gemini) |
| `evals/` | Golden scenarios, scorer, runner; learning notes in `evals/README.md` |
| `tests/` | Unit tests |
| `tools/` | Data download, BigQuery load, corpus build (`build_corpus.py`), terminal client |
| `infra/`, `Dockerfile`, `.gcloudignore` | Short-lived public team demo on Cloud Run with the ADK dev UI (Terraform); commands, risks and learning notes in `infra/README.md` |
| `data/` | Downloaded data (gitignored) and `README.md` inventory |
