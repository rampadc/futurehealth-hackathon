# Future Health — business and hackathon plans

**Research refreshed: 3 November 2026.** A consolidated plan replaces the earlier separate business briefs, pitch notes, and battlecards. It combines research with distribution and channels, customer acquisition, sales and delivery, financial scenarios, and a practical prototype, evidence and pitch plan for the hackathon.

| Focus area | Read the complete plan | Central commercial question |
|---|---|---|
| Population Health — climate-resilient worker health | [Heat-Safe Crew](01_population-health_climate-worker/business/OPPORTUNITY_PLAN.md) | Will a contractor pay for better heat-control execution and evidence on its sites? |

For the recommended competition choice, commercial comparison and execution calendar, read the [business and hackathon strategy](00_cross-cutting/FHDIC_Ideation_Assessment_Business_Plans.md).

These are researched opportunity hypotheses, not validated customer demand. Public announcements, vendor claims, and procurement notices are labelled according to what they establish. Proposed prices and revenue scenarios are assumptions to test, not market forecasts. No buyer interviews or partner commitments are implied.

## Run Heat-Safe locally

Use Python 3.13 with `uv`, Node.js 22.12+ and npm. Configure the private local `.env` with your Google project and Application Default Credentials, following the [application guide](01_population-health_climate-worker/README.md). From the repository root:

```sh
cd 01_population-health_climate-worker
uv run --env-file .env python tools/dev_local.py --setup
```

For subsequent runs, omit `--setup`. The launcher starts the app on **http://127.0.0.1:5174/** (supervisor web, with site, worker and kiosk screens at `/site`, `/worker` and `/kiosk`; the original desktop app is at `/classic`), the application/ADK backend on port 8001 and the operational solver on port 8765. Open **http://127.0.0.1:5174/demo-control** directly to start a case and inspect executions. Named workspaces contain operational actions; presenter controls stay on their separate route.

Cases, human evidence, calculations and assistant conversations persist in ignored worktree-local SQLite files. Solver proposals are freshly calculated from the case event ledger. Live Gemini uses server-side credentials. Named persona selection is for local development; it is not production authentication.

See the [desktop guide](01_population-health_climate-worker/supervisor-ui/README.md), [verification record](01_population-health_climate-worker/supervisor-ui/LIVE_VERIFICATION.md) and [scenario dossier](01_population-health_climate-worker/demo/README.md). Christine’s standalone `adk web` planning agent remains available independently.

## Supporting material

The `ideation/` folders preserve the original concepts. The `research/` and `rfqs/` folders retain the earlier source archive; refreshed citations are in the plans themselves. The former business briefs and pitch files remain available with superseded notices for traceability. They are not additional required reading.

[Future Health Digital Innovation Challenge](https://hack2skill.com/event/futurehealthchallenge/): the official page currently lists registration closing **10 November 2026** and working prototypes due **20 November 2026**. These dates are challenge milestones, not evidence of buyer urgency.
