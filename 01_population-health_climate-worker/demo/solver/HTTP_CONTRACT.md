# Allocation HTTP JSON contract · version 1.0

The primary interface is a JSON document sent to an HTTP endpoint, followed by a JSON response. The server validates the request, builds the allocation problem, invokes the existing solver, validates the response, and returns a proposal. No CLI invocation, preset case name, LLM, or visual interface is needed for an allocation call.

The [HTML scenario walkthrough](http://127.0.0.1:8765/walkthrough) explains twelve verified outcomes and lets callers inspect or execute complete JSON requests. The [standalone HTML file](walkthrough.html) includes captured responses for offline reading; live execution uses the local API origin.

## Endpoints and machine-readable schemas

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /v1/allocations/solve` | [Solve request schema](schemas/solve.request.schema.json) | [Solve response schema](schemas/solve.response.schema.json) |
| `POST /v1/allocations/check` | [Check request schema](schemas/check.request.schema.json) | [Check response schema](schemas/check.response.schema.json) |
| Either endpoint, invalid request | HTTP 422 | [Error response schema](schemas/error.response.schema.json) |
| Either endpoint, internal failure | HTTP 500 | The same error response schema |
| `GET /openapi.json` | No body | Complete OpenAPI contract, including request and response models |
| `GET /health` | No body | `{"status":"ok"}` |

Each model forbids unrecognised fields. Types, required fields, enum values and nullable fields are explicit. Domain validation additionally checks references, worker uniqueness, occupancy, incident consistency and replay chronology. Interactive documentation pages are disabled.

Complete, runnable examples: [solve input](examples/solve.request.json) → [actual solve output](examples/solve.response.json); [whole-crew check input](examples/check.request.json) → [actual check output](examples/check.response.json).

## What the caller supplies

All fields below are required, including empty `incidents` and nullable `civil_measurement`. The check endpoint adds `proposed_worker_ids`.

| Field | Type and meaning |
| --- | --- |
| `schema_version` | Literal `"1.0"`. |
| `request_id` | Caller-supplied nonempty string, at most 100 characters, echoed in the response. It is a correlation ID, not an idempotent write key. |
| `profile_id` | Literal `"sandline_demo_v1"`. Identifies the server-owned fictional site constraints. |
| `decision_at` | RFC 3339 string on the demo date, 4 August 2025, with `+04:00` offset; no earlier than the original 08:04 recovery record. |
| `workers` | Exactly eleven records, one for each C02–C12. Each has `person_id`, `readiness` (`ready`, `not_ready`, `unknown`) and `availability` (`available`, `unavailable`). Readiness is specific to `workshop_prep`. |
| `workshop.fixed_occupant_ids` | Unique current workshop occupants, including P07/P08. They consume its six-person capacity. Additional occupants must be known people without existing task reservations. |
| `workshop.staffing_demand` | `minimum` is the integer `1`; `maximum` is a positive integer or `null` when useful staffing demand is unknown. An empty allocation remains permitted. |
| `workshop.permit_status` | `valid`, `unavailable` or `unknown`. Only `valid` permits workshop assignment. |
| `workshop.resource_status` | `available`, `unavailable` or `unknown`. |
| `workshop.supervision_status` | The same availability enum. This concerns the approved shared external C01 arrangement; unavailable shared coverage does not withdraw C01 from the existing new-starter task. |
| `incidents` | One record per unavailable worker, with `person_id`, `location_id: "welfare"`, `responder_id: "P06"` and `responder_status: "contacted"`. No diagnosis or return-to-work clearance. |
| `civil_measurement` | `null` retains the source reading. Otherwise supply `sensor_id: "t1"`, `zone_id: "civil_exposed"`, finite `twl` between 0 and 500, `measured_at`, `unit: "W/m²"`, and `quality: "valid"`. A replacement reading must be between the source cutoff and decision time. It never clears the hold. |
| `proposed_worker_ids` | Check endpoint only: unique known worker IDs to test for hard feasibility. An empty, smaller or equivalent alternative proposal can be valid. |

Caller facts are point-in-time assertions, not authenticated human evidence. `ready` must not be inferred merely from shelter attendance. Unknown readiness and unknown prerequisites do not grant productive assignments.

## What the server supplies

The profile loads the original scenario 02 recovery state, qualifications, acclimatisation restrictions, task requirements, supervisor identity, six-person workshop capacity, existing assignments and heavy-work hold. It does not read synthetic case expectations or scenario 03's future assignment. The caller therefore supplies changing facts without repeating the immutable personnel and task catalogues.

This is deliberately the existing fixed demo problem. A different site, worker pool, capacity or task is not supported by changing `profile_id` or adding arbitrary JSON fields. The HTTP adapter is independent of the fixture `context` dictionary and preserves the same solver limits.

## What comes back

Both responses echo request metadata and include `input_fingerprint` (SHA-256 of the prepared solver input), `held_task_ids`, `unavailable_worker_ids`, `responder_status`, typed `diagnostics`, and `applied: false`.

The solve response adds:

- `solver`: status, optimality flag, OR-Tools version, one worker, seed zero and five-second time limit.
- `allocation`: target task, selected worker IDs and projected assignments, occupancy and task statuses; or `null` if no feasible allocation was established.

| Solver status | Allocation meaning |
| --- | --- |
| `OPTIMAL` | Preferred allocation proven for this model. It can contain zero workers when prerequisites block work. |
| `FEASIBLE` | Valid allocation found, without proof it is the preferred one. |
| `UNKNOWN` | No allocation established before stopping; `allocation` is null. This does not prove infeasibility. |
| `INFEASIBLE` | Model proven infeasible; `allocation` is null. |
| `MODEL_INVALID` | Invalid internal solver model; `allocation` is null. |

Solver outcomes use HTTP 200; callers must inspect `solver.status`. HTTP 422 means the request was invalid, not that a valid request had no productive allocation. HTTP 500 means an unexpected server failure. Neither produces an operational action.

The check response instead adds `accepted`, `violations`, `optimality: "not_evaluated"`, and an allocation projection. A rejected proposal returns HTTP 200 with `accepted: false` and no proposed workers applied. It does not automatically run a replacement recommendation; call the solve endpoint with the same facts for that.

Diagnostics report missing prerequisites, unassignable workers and binding limits. They may accompany a valid partial allocation. Under the canonical request the selected workers are C05–C08, seven remain in recovery, P07/P08 retain their places, and `civil_heavy` remains held.

## Run and call

The service is a normal local HTTP process. Install `requirements.txt` into a Python 3.12 environment, then start it from this directory with:

```sh
python -m uvicorn api:app --host 127.0.0.1 --port 8765
```

An HTTP caller sends the complete example as the request body. For example, in Python:

```python
import json
from pathlib import Path
import httpx

payload = json.loads(Path("examples/solve.request.json").read_text())
payload["workshop"]["staffing_demand"]["maximum"] = 2
response = httpx.post(
    "http://127.0.0.1:8765/v1/allocations/solve", json=payload, timeout=15
)
response.raise_for_status()
result = response.json()
# result["allocation"]["worker_ids"] == ["C05", "C06"]
```

For a future MCP tool, use the solve/check request schema as its input contract, POST the validated document to the matching endpoint, and return the matching structured response. Preserve HTTP errors and solver/proposal statuses. There is no need to invoke a shell command or parse console output.

The independent [HTTP API review](HTTP_API_REVIEW.md) records contract verification, corrected findings and the fixed-profile limits.
