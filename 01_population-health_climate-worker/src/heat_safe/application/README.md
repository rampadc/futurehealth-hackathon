# Local operational case service

`heat_safe.application.api:app` runs on loopback for the fictional Sandline shift. Set `HEAT_SOLVER_URL` to the local operational solver, normally `http://127.0.0.1:8765`. Set `HEAT_SAFE_LOCAL_DIR` or `HEAT_CASE_DB` to keep the SQLite event and run ledger in a private local directory.

`/api/case` and `/api/case/commands` use an opaque cookie for a selected named persona. The service scopes worker case views to that worker's own activity, incident and proposed intervals. Persona selection is a local demonstration control, not production authentication.

`/api/demo/*` is a trusted presenter surface on loopback. It can expose the complete fictional case and solver calls for inspection. Do not publish it as an authenticated multi-user API.

The case ledger stores human observations and actions separately from solver proposals. Each changed version invokes an ADK `Workflow` graph that calls the live stateless `/v2` heat, protection, planning and restart endpoints. A planned schedule is checked through `/v2/crew-rest/check`. The graph's exact requests and responses remain in the SQLite run ledger; proposals never become observed activity. The `capture` in a case view is the latest successful result for that exact case version. If the current evidence is incomplete, the request and task reasons remain visible while the solver response is absent.

If optimization returns `unknown` or a transport/server failure interrupts calculation, an operational lead (P02, P03 or C01) can POST `/api/case/retry` with `{"expected_version": <current version>}`. This runs the same recorded evidence through the graph again and adds a run record. It does not advance the case version or create a human evidence event. The case view exposes `retry_available` for the selected persona.

Run the opt-in end-to-end check with a local solver running:

```sh
RUN_LIVE_APPLICATION=1 uv run pytest -q tests/test_application_live_journey.py
```

For hosted deployment, set `STATIC_DIR` to the built frontend directory and supply PostgreSQL via `DATABASE_URL` or the `DATABASE_HOST/NAME/USER/PASSWORD` components. The app retains SQLite for local use. Shared-code access is automatically required on Cloud Run; its digests are `HEAT_ACCESS_CODE_SHA256` and `HEAT_PRESENTER_CODE_SHA256`. `GET/POST/DELETE /api/access` manages the eight-hour perimeter session; presenter APIs require the presenter role independently of the selected persona.

`/api/health` is a public liveness endpoint; `/api/ready` additionally checks the database and loopback solver. API routes do not fall through to the SPA, and the private presenter guide is never served. The runtime supervisor starts the solver in its isolated Python environment and terminates both processes if either exits.
