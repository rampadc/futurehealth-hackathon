# Heat-Safe Crew app

The app presents the Sandline operational case on four surfaces built from `../ui_wireframes/`: supervisor web (`/`, `/web`), site app (`/site`), worker app (`/worker`) and the Shelter A kiosk (`/kiosk`). See [SCREENS.md](SCREENS.md). The original nine-workspace desktop app stays at `/classic`. Organisation branding and people are under Admin settings (`/web/settings`), and Squad Monitoring and Heat controls show the site's hourly heat conditions from the risk core. React calls the local application API; the backend owns cases, tasks, evidence, command validation, ADK execution and solver integration. Named sign-in/sign-out is local persona selection, not production authentication.

## Run locally

From the repository’s `01_population-health_climate-worker` directory:

```sh
uv run --env-file .env python tools/dev_local.py --setup  # first run
uv run --env-file .env python tools/dev_local.py          # later runs
```

The launcher (macOS, Linux and Windows) starts the [app](http://127.0.0.1:5174/), the application/ADK backend on port 8001 and the isolated operational solver on port 8765. Open [presenter controls](http://127.0.0.1:5174/demo-control) to drive the case (see [Presenter controls](#presenter-controls)). Presenter controls are separate from persona workspaces. The case clock advances with real elapsed time, and the presenter can move it on the timeline. Ctrl+C stops all three services; logs are in `.local/logs/`.

## Live elapsed case

Start a fresh case in Demo controls. It begins at **08:00 GST, 4 August 2025** and runs for 150 real minutes, ending at **10:30 GST**. The clock continues while you work or change browser tabs. Use separate tabs for the people in the walkthrough; each tab has its own persona selection. For example, use Maya (P03) in a web tab, Huda (C01) in a site tab, Rana (C05) in a worker tab, and Mina (P10) in another web tab. You can open the main app in each tab and choose the persona there.

1. In Maya’s tab, issue the stop-work instruction. In Huda’s tab, acknowledge it and confirm heavy work has stopped. In Rana’s tab, record her shelter arrival. Return to Huda’s tab and confirm the affected crew’s recovery headcount after checking everyone’s location.
2. In Mina’s tab, open **Heat and rest coverage** (`/web/heat-rest`). Verify the C02–C12 employer roster, enter the basis or any unresolved item, and record the review. This is an employer coverage record; it does not authorize work or replace the foreman’s safety actions.
3. In Huda’s tab, confirm individual worker readiness after speaking with each person. Record observed activity through the current case time, including who is working and who remains in recovery. The solver needs this current, human-observed activity before it can make a crew proposal.
4. Review the solver’s workshop schedule in **Proposal review** (`/site/proposal`). The schedule is a proposal. Confirm the supervised assignment separately, then wait for the proposed workshop start time to arrive. At that time, Huda must confirm the observed recovery and prerequisites and record the actual start of work. A proposal or assignment alone does not mean anyone has started working; heavy trench work remains held.

The scenario advances at one case minute per real minute. An alert not acknowledged within two case minutes is escalated automatically. Moving case time on the Demo controls timeline jumps forward; moving to an earlier time starts a new 08:00 case and moves it forward, so recorded actions are cleared.

See [the application setup](../README.md) for the server’s local Google configuration. Google credentials and Gemini calls stay on the backend. Browser requests go through Vite’s `/api` proxy to port 8001; the browser does not invoke ADK or Gemini directly.

## Presenter controls

`/demo-control` is the judge-facing control room. Every change reaches open persona windows within five seconds.

- **Timeline.** 08:00–10:30 with hour bands, recorded actions, sensor readings and escalations. Click the bar, use the arrow keys, or the +1/+5/+15/+30 min and hour buttons to move case time (`POST /api/demo/clock`). An earlier time asks first, then starts a new case at 08:00 and moves it forward.
- **Reset to start of day** starts a new case at 08:00 and restores the default site settings. **Restart at 08:00, keep settings** keeps the edited values.
- **Site map.** Zones, sensors and everyone on site at the case time, coloured by heat-risk band. Civil crew locations come from the case snapshot; other squads and staff are a site fixture. Select a person for their band, supervisor action and reasons, health conditions and screen links; select a sensor to set it live, stale or offline.
- **Thermal Work Limit by hour.** Editable TWL per squad sensor for 08:00, 09:00 and 10:00, with a sensor state per row. T1 feeds the live case: an edit, or a stale or offline state, records a `sensor_reading` signal at the case clock now and again at the start of each hour. Unedited, the scenario's own 08:00 reading stands and nothing is recorded. T2, T3 and M1 drive the fixture squads on Squad Monitoring, Site setup and the other squad screens (`GET /api/case/site-sensors`).
- **Worker health conditions.** New to the heat, heat-sensitive condition or medicine, low fluid intake, feeling unwell, and red-flag symptoms. Each raises the worker's heat-risk band in `crew_risk` (red-flag sets Emergency). Supervisors see the band and action only; the worker sees the reasons. Conditions never record a symptom report, clear a hold or reach the solver.
- **Personas.** Each card opens that persona's own device (`/site`, `/worker`, `/web` or `/kiosk` with `?persona=ID`) in a new window, signed in. Each window keeps its own tab identity.

Site settings are stored in the `demo_settings` table (`GET/PUT /api/demo/site`, `POST /api/demo/site/defaults`, presenter only). To run this beside another checkout, set `HEAT_UI_PORT` and `HEAT_API_URL` for Vite and `HEAT_SOLVER_URL` and `HEAT_SAFE_LOCAL_DIR` for the backend.

## Development checks

`npm test` runs UI tests; `npm run build` checks TypeScript and builds with Vite. The app uses the shared MUI theme in `src/theme.ts`. Runtime API interfaces are in `src/live.ts`.

Cases, commands, events and solver runs persist under ignored `.local/heat-safe/` SQLite files. Assistant history and ADK sessions persist separately there. Google credentials remain in the server’s ignored local environment configuration. Named sign-in/sign-out is local persona selection, not production authentication; the loopback presenter API is a trusted development facility.

Runtime proposals come from the existing operational solver. Its `applied: false` results are kept separate from human observations and confirmations. The app records supplier coordination without sending messages and records review without authorising field restart. Clinical notes remain outside the shared operations record.

See [LIVE_VERIFICATION.md](LIVE_VERIFICATION.md) for the executed cross-persona journey, live Gemini checks, solver branches and restart proof.

## Hosted runtime

The Cloud Run image serves this build from FastAPI on the same origin. Browser requests use `/api`; Vite is only for local development. The hosted entry code is separate from named persona selection: the viewer code permits the product story, while the presenter code additionally permits `/demo-control` and all presenter APIs. Lock access ends the entry session; ordinary Sign out still switches personas. Codes never enter the frontend build.

Cloud Run requires PostgreSQL and bundled static files, and always enables the code gate. Access cookies expire after eight hours; rotating either configured code digest revokes existing access sessions. Local development keeps SQLite and does not require a code unless `HEAT_REQUIRE_ACCESS=true`.

Cloud configuration accepts `DATABASE_URL`, or `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`. PostgreSQL application tables use schema `app`; ADK sessions use `adk`. `ADK_DATABASE_URL` can override the derived ADK connection. Existing local SQLite databases are not uploaded or imported automatically.

The separate [CI/CD PR #6](https://github.com/rampadc/futurehealth-hackathon/pull/6) supplies `Dockerfile.cloudrun`, deployment workflows and the owner-run bootstrap under `cloud/`. It must merge and complete bootstrap before PR previews can deploy.
