# Heat-Safe Crew app

The app presents the Sandline operational case on four surfaces built from `../ui_wireframes/`: supervisor web (`/`, `/web`), site app (`/site`), worker app (`/worker`) and the Shelter A kiosk (`/kiosk`). See [SCREENS.md](SCREENS.md). The original nine-workspace desktop app stays at `/classic`. Organisation branding and people are under Admin settings (`/web/settings`), and Squad Monitoring and Heat controls show the site's hourly heat conditions from the risk core. React calls the local application API; the backend owns cases, tasks, evidence, command validation, ADK execution and solver integration. Named sign-in/sign-out is local persona selection, not production authentication.

## Run locally

From the repository’s `01_population-health_climate-worker` directory:

```sh
uv run --env-file .env python tools/dev_local.py --setup  # first run
uv run --env-file .env python tools/dev_local.py          # later runs
```

The launcher (macOS, Linux and Windows) starts the [app](http://127.0.0.1:5174/), the application/ADK backend on port 8001 and the isolated operational solver on port 8765. Open [presenter controls](http://127.0.0.1:5174/demo-control) to start or reset a case and inspect executions. Presenter controls are separate from persona workspaces. The case clock advances automatically with real elapsed time; it cannot be manually advanced. Ctrl+C stops all three services; logs are in `.local/logs/`.

## Live elapsed case

Start a fresh case in Demo controls. It begins at **08:00 GST, 4 August 2025** and runs for 150 real minutes, ending at **10:30 GST**. The clock continues while you work or change browser tabs. Use separate tabs for the people in the walkthrough; each tab has its own persona selection. For example, use Maya (P03) in a web tab, Huda (C01) in a site tab, Rana (C05) in a worker tab, and Mina (P10) in another web tab. You can open the main app in each tab and choose the persona there.

1. In Maya’s tab, issue the stop-work instruction. In Huda’s tab, acknowledge it, confirm heavy work has stopped, record Rana’s shelter check-in, and confirm the affected crew’s recovery headcount.
2. In Mina’s tab, open **Heat and rest coverage** (`/web/heat-rest`). Verify the C02–C12 employer roster, enter the basis or any unresolved item, and record the review. This is an employer coverage record; it does not authorize work or replace the foreman’s safety actions.
3. In Huda’s tab, confirm individual worker readiness after speaking with each person. Record observed activity through the current case time, including who is working and who remains in recovery. The solver needs this current, human-observed activity before it can make a crew proposal.
4. Review the solver’s workshop schedule in **Proposal review** (`/site/proposal`). The schedule is a proposal. Confirm the supervised assignment separately, then wait for the proposed workshop start time to arrive. At that time, Huda must confirm the observed recovery and prerequisites and record the actual start of work. A proposal or assignment alone does not mean anyone has started working; heavy trench work remains held.

The scenario advances at one case minute per real minute. An alert not acknowledged within two case minutes is escalated automatically. The clock is not controlled from Demo controls, and resetting the active case starts a new 08:00 rehearsal.

See [the application setup](../README.md) for the server’s local Google configuration. Google credentials and Gemini calls stay on the backend. Browser requests go through Vite’s `/api` proxy to port 8001; the browser does not invoke ADK or Gemini directly.

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
