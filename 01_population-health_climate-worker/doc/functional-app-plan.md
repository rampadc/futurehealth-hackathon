# Making Heat-Safe Crew functional

Plan written 15 November 2026 for the 19 November team submission (20 November is the official deadline). It follows the team's end-to-end view: assess → hold and confirm action → replan → coordinate → preserve evidence, with welfare able to interrupt any stage.

**"Functional" here means:** one replayed shift runs end to end on the screens, without the classic app, and every number on screen comes from code that already exists: the risk core, the operational solver or the grounded agent. Nothing is typed into the UI by hand. It does **not** mean field-ready. Real authentication, live sensors, SMS, wearables and health-data isolation remain out of scope and are labelled as such.

Acceptance story: heat alert (scenario 02) → feasible alternative work (03) → delivery coordination (04) → handover (10). The sensor-failure (06), symptom (08) and restart (09) countercases must also run.

## Where it stands

| Layer | State | Evidence |
|---|---|---|
| Screens | All 26 built on live case data and real case commands; screen codes removed from the UI and URLs. Branding moved into Admin settings | `supervisor-ui/SCREENS.md`, 84 UI tests |
| Case service and ledger | Real: commands, owners, versioning, SQLite/PostgreSQL, restart recovery | `src/heat_safe/application/`, `LIVE_VERIFICATION.md` |
| Operational solver | Real, called by the ADK workflow on every case version; proposals stay `applied: false`. Handoff index in `demo/solver/INDEX.md` | `demo/solver/`, 109 solver tests |
| Planning Agent (`/api/chat`) | Real Gemini with case tools plus the supervisor tools (forecast, TWL, guidance search with citations). Ask screens list the tools behind each answer | `src/heat_safe/live_assistant.py`, `screens/ask.tsx` |
| Trust log | Real: solver runs, human commands, agent answers with tool names; filter by kind | `platform_api.py`, `screens/web/monitor.tsx` |
| Heat exposure (risk core) | **Connected for context.** `GET /api/case/conditions` returns the hourly TWL for Mussafah on 4 Aug 2025 from the ERA5 replay; shown on Squad Monitoring and Heat controls. Local readings still come from the case; the conditions never clear a hold | `platform_api.py`, `screens/conditions.tsx` |
| Countercases | Presenter controls inject a valid, invalid or stale reading, and presets 02, 06, 08 and 09 set the clock and that reading. People still record the instruction, headcount and symptom report | `DemoControl.tsx`, `scenarioPresets.ts` |
| Agent → solver | **Done.** `what_if_crew_plan` (supervisors and responders only) sends a changed copy of the case evidence to `/v2/crew-rest/solve`. Checked against the running solver on 15 Nov: C05 unavailable gives 90 instead of 120 useful worker-minutes; C05 unavailable with C09 ready restores 120 | `application/what_if.py`, `tests/test_what_if.py` (opt-in live test) |
| Hosting | Not verified. Cloud Run bootstrap stops at missing IAM grants | `LIVE_VERIFICATION.md`, `cloud/README.md` |

## Workstreams

IDs match the delivery map (AS = application service, C0/A2/U2/D1 = delivery tasks).

### 1. Exposure assessment: connect the risk core (AS01, "connect existing") · done

- Done: `GET /api/case/conditions` returns the replay TWL zone per hour for the case site from `compute_heat_stress`, with its source. It is read-only and never clears a hold.
- Done: shown on Squad Monitoring (compact) and Heat controls, labelled "ERA5 replay" or "Forecast" and "Not a local measurement · never clears a hold".
- **Decided: keep 4 Aug 2025** as the case day, so the case, solver fixtures and verification record stay valid. `compute_heat_stress('mussafah', '2025-08-04')` works from `data/heat_safe/raw/weather/era5_summer_2025.csv`, which is in git and ships in the Cloud Run image (`COPY data/heat_safe/`).
- Optional, not started: feed `get_site_sensor` rows into the presenter's reading injection so readings replay rather than being typed.

### 2. Countercases from presenter controls (AS02/AS05) · done

- Done: presenter controls inject "sensor fault" (`quality: invalid`) and "stale reading" (measured 10 minutes before the case clock).
- Done: scenario presets 02, 06, 08 and 09 reset the case and set the clock and reading (`scenarioPresets.ts`). They never record a person's action.
- Still to check in rehearsal: each countercase shows the expected hold or block on the screens.

### 3. Constraint-based planning: agent → real solver (A2 Christine, AS03) · done, eval partial

- Done: `what_if_crew_plan` calls `/v2/crew-rest/solve` with a changed copy of the case evidence and returns a draft (`applied: false`, `recorded: false`). Checked against the running solver.
- Done: the agent run detail records each tool call, so the trust log and the Ask screens show `what_if_crew_plan`.
- Partial: `tests/test_live_assistant.py` checks that workers don't get the tool and that the instruction says nothing is applied. A live golden eval of a what-if answer needs a case-agent eval runner (`evals/run_evals.py` only covers the standalone supervisor agent).

### 4. Solver handoff bundle (C0 Cong) · done

- Done: [`demo/solver/INDEX.md`](../demo/solver/INDEX.md) gives the schema version, how to run it, the canonical requests and responses, the countercases and which reviews are historical. Linked from the solver README.

### 5. Website → agent and visible state (U2 Josh, AS04/AS06) · mostly done

- Done: Ask screens list the tools behind each answer; what-if answers are marked "Hypothetical · not recorded".
- Done: System & trust filters by All, Solver, People and Agent.
- Not started: open a solver run to see its request and response. This needs a supervisor-only run endpoint, because `/api/demo/runs` is presenter-only.
- Not started: the old UX review items that still apply to the new screens: a case orientation for first-time users and an explicit 90 vs 120 worker-minute consequence (`JOSH-UX-REVIEW.md`). The eligibility funnel is already on Crew & workshop.

### 6. Acceptance (D1 Josh)

- Re-run the browser journey on the new screens and refresh `LIVE_VERIFICATION.md`. The current record (13 Nov) exercised the classic workspaces.
- Keep a demo checklist and rehearsal result, with each defect assigned to a person.

### 7. Hosting (owner action)

- The project owner grants the IAM roles listed by the bootstrap preflight. Then run the bootstrap, deploy `main` and smoke-test `/api/ready`.
- Fallback: demo from the local launcher and record the video locally.

## Suggested order

| Day | Work | Done when |
|---|---|---|
| Sun 15 | Workstreams 2 and 4; decide the replay day (done: 4 Aug 2025) | Countercases run from presenter controls |
| Mon 16 | Workstream 1; start 3 | Conditions panel live on two screens |
| Tue 17 | Finish 3 and 5; IAM grants | Agent what-if answer shows in the trust log |
| Wed 18 | Workstream 6: full rehearsal, fix defects, record the video | Accepted journey |
| Thu 19 | Submit | Submitted |

## Out of scope for the demo (say so on screen and in the pitch)

Live sensor adapters, worker-risk aggregation and wearables, SMS/voice sending and receipts, real authentication and roles, durable shared audit, health-data isolation, native-speaker translation review, full-summer backtest. `compute_worker_risk` is specified but not built (`src/heat_safe/README_WORKER_RISK.md`).

## Documentation gaps found

| Doc | Gap |
|---|---|
| `doc/heat-safe-crew-agent-plan.md` | Fixed: week 2–4 checklists updated on 15 Nov (voice check-in, offline queuing, consent and trust log are built) |
| `supervisor-ui/JOSH-UX-REVIEW.md` | Fixed: notes that it reviews `/classic` and lists which gaps the new screens close |
| `supervisor-ui/LIVE_VERIFICATION.md` | No verification of the 26 new screens or the platform endpoints (Josh, workstream 6) |
| Submission docs | Added [`assumptions-and-limitations.md`](assumptions-and-limitations.md) and [`challenge-fit.md`](challenge-fit.md). Still missing: an architecture diagram for the current app (`doc/architecture.png` predates the case service); the team needs to name an owner |
| `demo/solver/` | Fixed: [`INDEX.md`](../demo/solver/INDEX.md) says which documents are current |
| Folder 04 | The team diagram refers to "folders 01 + 04", but the repository has only `01_population-health_climate-worker`. The heat-safe code was moved into 01. A stray untracked `04_heat_safe/` in the main checkout should be checked and removed |
| `evals/README.md` | No eval covers the case agent (`case_planner`); the evals cover the standalone supervisor agent only |
