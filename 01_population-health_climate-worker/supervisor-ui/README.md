# Heat-Safe Crew desktop app

The desktop app presents the Sandline operational case through nine named workspaces. React calls the local application API; the backend owns cases, tasks, evidence, command validation, ADK execution and solver integration. Named sign-in/sign-out is local persona selection, not production authentication.

## Run locally

From the repository’s `01_population-health_climate-worker` directory:

```sh
uv run --env-file .env python tools/dev_local.py --setup  # first run
uv run --env-file .env python tools/dev_local.py          # later runs
```

The launcher starts the [desktop app](http://127.0.0.1:5174/), the application/ADK backend on port 8001 and the isolated operational solver on port 8765. Open [presenter controls](http://127.0.0.1:5174/demo-control) directly to start a case, advance the controlled clock and inspect executions. Presenter controls are separate from persona workspaces. Ctrl+C stops all three services; logs are in `.local/logs/`.

See [the application setup](../README.md) for the server’s local Google configuration. Google credentials and Gemini calls stay on the backend. Browser requests go through Vite’s `/api` proxy to port 8001; the browser does not invoke ADK or Gemini directly.

## Development checks

`npm test` runs UI tests; `npm run build` checks TypeScript and builds with Vite. The app uses the shared MUI theme in `src/theme.ts`. Runtime API interfaces are in `src/live.ts`.

Cases, commands, events and solver runs persist under ignored `.local/heat-safe/` SQLite files. Assistant history and ADK sessions persist separately there. Google credentials remain in the server’s ignored local environment configuration. Named sign-in/sign-out is local persona selection, not production authentication; the loopback presenter API is a trusted development facility.

Runtime proposals come from the existing operational solver. Its `applied: false` results are kept separate from human observations and confirmations. The app records supplier coordination without sending messages and records review without authorising field restart. Clinical notes remain outside the shared operations record.

See [LIVE_VERIFICATION.md](LIVE_VERIFICATION.md) for the executed cross-persona journey, live Gemini checks, solver branches and restart proof.
