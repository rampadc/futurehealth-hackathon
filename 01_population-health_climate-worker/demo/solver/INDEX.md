# Solver handoff index

Start here. This page says which solver documents are current, how to run the solver, and where the canonical request, response and countercases are. The solver is deterministic Python (OR-Tools CP-SAT) behind a JSON HTTP API. It has no LLM, and every response carries `applied: false`.

## Current version

The operational API (`/v2` routes) uses **schema 2.1**. Earlier 2.0 requests must be migrated. The `/v1` allocation routes are the earlier immediate-allocation API and remain for the walkthrough.

| What | Where |
|---|---|
| Operational API contract (current) | [OPERATIONS_API.md](OPERATIONS_API.md) |
| Allocation HTTP contract (`/v1`) | [HTTP_CONTRACT.md](HTTP_CONTRACT.md) |
| JSON Schemas (Draft 2020-12) | [operations/schemas/](operations/schemas/) |
| Overview, replay contract and fixture cases | [README.md](README.md) |
| Plain-language walkthrough | [walkthrough.html](walkthrough.html), or `/walkthrough` on the running server |

## Run it

From this directory, with Python 3.12:

```sh
python -m pip install -r requirements.txt
uvicorn api:app --host 127.0.0.1 --port 8765
```

The local launcher (`tools/dev_local.py` in the app folder) starts it for you. The case service reaches it at `HEAT_SOLVER_URL` (default `http://127.0.0.1:8765`). Live OpenAPI descriptions are at `/openapi.json`.

On every case version the application's ADK workflow (`src/heat_safe/application/workflow.py`) calls the component routes in turn: heat controls, protective response, crew-rest solve, restart, then crew-rest check on the proposed plan. The Planning Agent's what-if tool calls `POST /v2/crew-rest/solve` on a changed copy of the case evidence and records nothing. The composed `/v2/response-plans/solve` route is for other callers.

## Canonical request and response

All in [operations/examples/](operations/examples/), captured from the running server by `python build_operational_demo.py`.

| Route | Request | Response |
|---|---|---|
| `POST /v2/response-plans/solve` (composed) | [request](operations/examples/response-plans.solve.request.json) | [response](operations/examples/response-plans.solve.response.json) |
| `POST /v2/crew-rest/solve` | [request](operations/examples/crew-rest.solve.request.json) | [response](operations/examples/crew-rest.solve.response.json) |
| `POST /v2/crew-rest/check` | [request](operations/examples/crew-rest.check.request.json) | [response](operations/examples/crew-rest.check.response.json) |
| `POST /v2/heat-controls/evaluate` | [request](operations/examples/heat-controls.evaluate.request.json) | [response](operations/examples/heat-controls.evaluate.response.json) |
| `POST /v2/protective-response/evaluate` | [request](operations/examples/protective-response.evaluate.request.json) | [response](operations/examples/protective-response.evaluate.response.json) |
| `POST /v2/restart/evaluate` | [request](operations/examples/restart.evaluate.request.json) | [response](operations/examples/restart.evaluate.response.json) |

Alternative timing policies: [alternate](operations/examples/crew-rest.alternate_timing_policy.request.json), [long recovery](operations/examples/crew-rest.long_recovery_policy.request.json), [zero initial recovery](operations/examples/crew-rest.zero_initial_recovery.request.json), each with its response.

## Countercases

All 32 operational cases, with complete requests and responses, are in [operational-results.json](operational-results.json), keyed by case id. They are built in [operations/fixtures.py](operations/fixtures.py). The ones the demo depends on:

| Scenario | Case ids | Expected result |
|---|---|---|
| 06 Sensor failure | `failed_sensor`, `wrong_zone` | Civil conditions unknown; a failed instrument or another zone's reading cannot clear the hold |
| 08 Symptom report | `symptoms_without_heat_hold`, `incident_no_substitute`, `incident_substitute`, `removal_unconfirmed` | The symptom triggers removal and first aid regardless of the band; replanning waits for both records |
| 09 Restart review | `restart_ready`, `restart_stale`, `restart_missing_check`, `restart_midday`, `restart_future` | Only `restart_ready` reaches human review; stale, missing-check, midday and future restarts are blocked |

In the app, the presenter controls (`/demo-control`) have presets for scenarios 02, 06, 08 and 09.

## Historical reviews

These record independent reviews at the time of each change. They are kept for traceability; the documents above are current where they differ.

| Review | Covers |
|---|---|
| [REVIEW.md](REVIEW.md) | The synthetic allocation dataset (10 Nov) |
| [SOLVER_REVIEW.md](SOLVER_REVIEW.md) | The CP-SAT allocation solver and proposal checking |
| [HTTP_API_REVIEW.md](HTTP_API_REVIEW.md) | The `/v1` HTTP API |
| [OPERATIONS_REVIEW.md](OPERATIONS_REVIEW.md) | The `/v2` operational solver (10 Nov) |
| [TIMING_POLICY_REVIEW.md](TIMING_POLICY_REVIEW.md) | Caller-supplied timing policies (11 Nov) |
| [CATALOGUE_READINESS_REVIEW.md](CATALOGUE_READINESS_REVIEW.md) | Schema 2.1 location catalogue and readiness evidence (11 Nov) |
| [WALKTHROUGH_REVIEW.md](WALKTHROUGH_REVIEW.md) | The HTML walkthrough |
| [STORY_REVIEW.md](STORY_REVIEW.md) | The walkthrough story and pitch |

[AGENTS.md](AGENTS.md) holds the writing convention for walkthrough edits.
