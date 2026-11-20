# Heat-Safe Crew

Heat-Safe Crew helps construction supervisors coordinate heat controls, worker check-ins, task reassignment and handover evidence for outdoor crews in Abu Dhabi. This is the working prototype for the Future Health Digital Innovation Challenge.

The application combines a deterministic heat-risk and scheduling core with a Gemini/ADK assistant grounded in safety guidance. Worker, supervisor, site and kiosk views share a case event ledger. Human confirmations record operational actions; an assistant answer or solver proposal does not authorize work.

## For judges

- [Application walkthrough](01_population-health_climate-worker/supervisor-ui/README.md): screens, roles and the elapsed case.
- [Scenario dossier](01_population-health_climate-worker/demo/README.md): ten scenarios, expected decisions and evidence.
- [Architecture and implementation](01_population-health_climate-worker/doc/heat-safe-crew-agent-plan.md): risk model, agent, data and system design.
- [Evaluation guide](01_population-health_climate-worker/evals/README.md): golden scenarios and adversarial checks.
- [Business and opportunity plan](01_population-health_climate-worker/business/OPPORTUNITY_PLAN.md): researched hypotheses, proposed economics and validation plan.

Hosted access details are supplied separately by the presenters. Repository access does not provide cloud credentials or application access codes.

## Run locally

Install Python 3.13, [uv](https://docs.astral.sh/uv/), Node.js 22.12+ and npm. From the repository root:

```sh
cd 01_population-health_climate-worker
cp .env.example .env
# Configure your own Google Cloud project and ADC path in .env.
uv run --env-file .env python tools/dev_local.py --setup
```

See the [application setup guide](01_population-health_climate-worker/README.md#credentials) for credentials and cloud prerequisites. Live Gemini, guidance search and telemetry require configured Google Cloud services and permissions; cloning this repository does not provision them.

Open **http://127.0.0.1:5174/**. Site, worker and kiosk views are at `/site`, `/worker` and `/kiosk`. Open `/demo-control` to start a case and inspect executions. The backend runs on port 8001 and the operational solver on 8765. Later runs can omit `--setup`; Ctrl+C stops the launcher.

Local cases and assistant conversations persist in ignored SQLite files under `.local/`. Named persona selection is for local development and provides no production authentication. The demonstration uses fictional crew personas and synthetic case events alongside public environmental data. It sends no SMS and provides no clinical or field safety approval.

## Verify

From `01_population-health_climate-worker/`:

```sh
uv sync --locked
uv run --locked pytest -q
cd supervisor-ui
npm ci
npm test
npm run build
```

Unit tests run without cloud credentials. Integration tests with additional service requirements are described in the component guides and CI workflow.

## Repository map

| Path | Contents |
|---|---|
| `01_population-health_climate-worker/src/`, `agents/` | Risk core, application API and assistant |
| `01_population-health_climate-worker/supervisor-ui/` | React application |
| `01_population-health_climate-worker/demo/solver/` | Operational solver and its tests |
| `01_population-health_climate-worker/data/` | Public source provenance, replay data and synthetic fixtures |
| `01_population-health_climate-worker/cloud/` | Current Cloud Run deployment template and CI trust checks |
| `01_population-health_climate-worker/infra/` | Earlier standalone agent deployment |
| `00_cross-cutting/`, application `business/`, `research/`, `pitches/` | Supporting research and planning archive |

Public data and reference documents retain their source terms; see the [data provenance and attribution notes](01_population-health_climate-worker/data/README.md#source-and-licensing-references). Archived plans are research hypotheses, not validated customer demand or partner commitments.
