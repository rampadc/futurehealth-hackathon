# Future Health — business and hackathon plans

**Research refreshed: 3 November 2026.** Three consolidated plans replace the earlier separate business briefs, pitch notes, and battlecards. Each now combines research with distribution and channels, customer acquisition, sales and delivery, financial scenarios, and a practical prototype, evidence and pitch plan for the hackathon.

| Focus area | Read the complete plan | Central commercial question |
|---|---|---|
| Population Health — climate-resilient worker health | [Heat-Safe Crew](01_population-health_climate-worker/business/OPPORTUNITY_PLAN.md) | Will a contractor pay for better heat-control execution and evidence on its sites? |
| Wellbeing — sustaining healthy behaviours | [Physical Health Companion](02_wellbeing_sustaining-behaviors/business/OPPORTUNITY_PLAN.md) | Can a physical companion improve sustained participation enough to justify its full cost? |
| Fertility — male reproductive health | [Sitr](03_fertility/business/OPPORTUNITY_PLAN.md) | Can a trusted intake and navigation service improve appropriate care access beyond the clinic’s current process? |

For the recommended competition choice, commercial comparison and execution calendar, read the [business and hackathon strategy](00_cross-cutting/FHDIC_Ideation_Assessment_Business_Plans.md).

These are researched opportunity hypotheses, not validated customer demand. Public announcements, vendor claims, and procurement notices are labelled according to what they establish. Proposed prices and revenue scenarios are assumptions to test, not market forecasts. No buyer interviews or partner commitments are implied.

## Run the Heat-Safe demo

Use Node.js 22.12+ and npm. From the repository root:

```sh
cd 01_population-health_climate-worker/ui
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** for the team-facing workspace and **http://127.0.0.1:5173/presenter** in a separate tab for presenter controls. Use the same browser and origin for both tabs. The app stays on port 5173; if it is occupied, stop the existing server first.

The demo runs entirely in the browser with the checked-in Project Sandline fixtures. No API keys, backend or hardware are needed. Local browser storage retains progress; use the presenter reset to start again.

See the [UI guide](01_population-health_climate-worker/ui/README.md) for replay and verification, and the [scenario dossier](01_population-health_climate-worker/demo/README.md) for the ten scenarios and shared context. Keep `ui/` and `demo/` together: the UI imports those fixtures at build time.

## Supporting material

The `ideation/` folders preserve the original concepts. The `research/` and `rfqs/` folders retain the earlier source archive; refreshed citations are in the plans themselves. The former business briefs and pitch files remain available with superseded notices for traceability. They are not additional required reading.

[Future Health Digital Innovation Challenge](https://hack2skill.com/event/futurehealthchallenge/): the official page currently lists registration closing **10 November 2026** and working prototypes due **20 November 2026**. These dates are challenge milestones, not evidence of buyer urgency.
