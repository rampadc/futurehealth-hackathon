# Operational demo API (v2 routes, schema 2.1)

This API evaluates a **fictional, fixed Sandline scenario**. It returns advisory decisions and schedules; it never issues instructions, changes a site system, confirms that anyone acted, or establishes occupational or medical safety. Every successful response has `applied: false`.

## Run and capture

From this directory, install `requirements.txt` and start the app with `uvicorn api:app --host 127.0.0.1 --port 8765`. The six routes below accept JSON `POST` requests. `/openapi.json` exposes their live OpenAPI descriptions. The developer capture command is `python build_operational_demo.py`; it exports standalone JSON Schemas to `operations/schemas/`, captures every `operations.fixtures.cases()` request through the running HTTP server in `operational-results.json`, rechecks each feasible schedule through `/v2/crew-rest/check`, and writes complete route examples to `operations/examples/`. Use `--schemas-only` to export contracts without contacting the server. Each schema carries its own `$defs` and uses JSON Schema Draft 2020-12. Capture validates requests and returned JSON with `jsonschema` and `FormatChecker`. If `walkthrough.html` contains a script with `id="operational-data"`, capture replaces only that script's JSON content.

## Input contract

The common [`request.schema.json`](operations/schemas/request.schema.json) requires `schema_version: "2.1"`, request and snapshot IDs, `profile_id: "sandline_operational_demo_v1"`, a timezone-aware `decision_at`, supplied `locations` and `task_locations`, and an explicit `snapshot`. The snapshot supplies readings and monitor states, held tasks, instruction/acknowledgment, cessation and recovery records, the exact C02–C12 cohort, observed activity history, workshop prerequisites, availability windows, and incidents. `planning` and `restart` may be null. The [check request](operations/schemas/check.request.schema.json) adds `proposed_intervals`.

Schema 2.1 replaces the earlier demo's bare readiness flags and fixed location IDs. Older operational 2.0 bodies must be migrated; the `/v2` URLs are unchanged. The separate `/v1/allocations/*` schema and behavior remain unchanged.

The optional root `timing_policy` object adds caller-supplied work/rest durations to schema 2.1. Existing requests that select the registered policy by ID still work. The response echoes the effective numeric policy and identifies whether it was supplied or registered.

Fields are closed: unknown properties are rejected. The server also checks cross-field facts that a JSON Schema cannot express, including the fixed cohort, registered sensors, evidence chronology, nonoverlapping and continuous history, resource windows, known occupants, and actor attribution. All demo timestamps must use `+04:00` on 4 August 2025. A planning start must be the decision time rounded **up** to the next minute boundary. Invalid JSON, invalid fields, or invalid cross-field facts return HTTP 422 with the [versioned error contract](operations/schemas/error.response.schema.json); internal failures return HTTP 500 without exposing private exception details.

`planning.work_not_before` optionally marks the first minute when projected workshop work may begin. It must be minute-aligned, on the demo date with `+04:00`, and no earlier than `planning.starts_at`. The planning start still follows the decision time; the optional boundary does not change it. Before that boundary, every non-excluded worker is projected to recover in their supplied current cooled location. These projected minutes occupy the room and advance the work/rest policy, but they are not recorded observations. An unknown current location is rejected; a known noncooled location blocks planning. The checker rejects work or a move to another room during that lead-in. A boundary at or after the horizon end produces a recovery-only allocation if capacity and other constraints permit. Omitted fields keep the legacy request fingerprint; a supplied boundary changes it.

## Supplied location catalogue

`locations` contains one to thirty-two records, each with a unique `id`, human-readable `label`, integer `capacity`, and a nonempty list of capabilities. Supported capability meanings are `exposed_civil`, `exposed_electrical`, `yard`, `light_work` (covered workshop task), `cooled_recovery`, and `first_aid_support`. Capacity can be zero. These are caller-supplied site assertions, not measured or approved by the API.

`task_locations` binds each registered task (`civil_heavy`, `civil_light`, `workshop_prep`) to a supplied location. The two civil tasks share the affected exposed civil area in this scenario. Workshop preparation needs a covered light-work location. The planner uses the bound workshop, all supplied cooled-recovery locations, and first-aid-support locations. It schedules one workshop task; this is not multiple-workshop or full-site task optimization.

All worker locations, readings, recovery records, incident destinations, histories, zone windows and proposed intervals must reference supplied IDs. Capabilities determine suitability; the solver does not depend on names such as `shelter_a` or `welfare`. Location capacities come from this request, not the original replay catalogue. Task windows and zone windows remain separate: a place may be open while its permit or supervision is unavailable. Existing P07/P08 commitments must remain at the bound workshop.

For example, these are valid catalogue records (an excerpt, not a complete request):

```json
[
  {"id":"annex_7","label":"Annex workshop","capacity":6,"capabilities":["light_work"]},
  {"id":"cool_room_3","label":"Cooled rest room","capacity":24,"capabilities":["cooled_recovery"]},
  {"id":"aid_point_2","label":"First-aid point","capacity":8,"capabilities":["first_aid_support"]}
]
```

The caller should obtain this catalogue from authorised site configuration. The API checks consistency and references; it does not authenticate the configuration or independently inspect the rooms. Personnel, task definitions, supervisor permissions and the demo timing policy remain registered server-side.

## Auditable task-readiness confirmations

Every worker has `readiness: null` (unknown) or one supplied confirmation for the workshop task. This is a status, not a numeric score. A fixture confirmation looks like:

```json
{
  "status":"ready",
  "task_id":"workshop_prep",
  "confirmed_by":"C01",
  "confirmed_at":"2025-08-04T08:10:30+04:00",
  "valid_until":"2025-08-04T10:30:00+04:00",
  "evidence_id":"readiness-C08",
  "basis":"Supervisor confirmed suitability for the light workshop task under the fictional demo arrangement.",
  "source":"synthetic_fixture"
}
```

`status` is `ready` or `not_ready`. C01 is the authorised supervisor for this fixed demo task; a different actor, unsupported task, future confirmation, invalid validity interval, duplicate/blank evidence ID or blank basis is rejected. An expired confirmation is a valid historical input, but cannot support productive work. Each proposed work minute must fit within the confirmation's validity period. Recovery completion never creates or renews a confirmation. Qualifications, availability, symptoms, timing and task prerequisites remain independent gates.

The response's `evidence_ids` includes the readiness records; its fingerprint covers the full supplied catalogue and confirmation contents. A consumer can audit the named actor, task, basis and validity against the retained request. The API is stateless: the caller must retain its audit records. An actor ID is an assertion, not a verified login or electronic signature; this service does not authenticate supervisors or prove the underlying assessment.

A symptom report excludes the worker even if an earlier readiness record remains `ready`. Supervisor acknowledgment and confirmation of removal/contact are separate from diagnosis. Unconfirmed protective actions block scheduling; first-aid contact never supplies medical clearance. Another person's readiness confirmation permits considering that person as a replacement and does not adjudicate the incident.

## Operations and output contracts

| Route | Purpose | Success schema | Complete HTTP example |
| --- | --- | --- | --- |
| `/v2/heat-controls/evaluate` | Evaluate heat controls, held tasks, and clearance blockers | [heat response](operations/schemas/heat.response.schema.json) | [request](operations/examples/heat-controls.evaluate.request.json) · [response](operations/examples/heat-controls.evaluate.response.json) |
| `/v2/protective-response/evaluate` | Identify protective actions, excluded workers, and planning blockers | [protective response](operations/schemas/protective.response.schema.json) | [request](operations/examples/protective-response.evaluate.request.json) · [response](operations/examples/protective-response.evaluate.response.json) |
| `/v2/crew-rest/solve` | Propose minute-grid work and cooled-recovery intervals | [crew-rest response](operations/schemas/crew-rest.response.schema.json) | [request](operations/examples/crew-rest.solve.request.json) · [response](operations/examples/crew-rest.solve.response.json) |
| `/v2/crew-rest/check` | Test a caller's intervals against hard constraints | [check response](operations/schemas/check.response.schema.json) | [request](operations/examples/crew-rest.check.request.json) · [response](operations/examples/crew-rest.check.response.json) |
| `/v2/restart/evaluate` | Review restart evidence while preserving held-task state | [restart response](operations/schemas/restart.response.schema.json) | [request](operations/examples/restart.evaluate.request.json) · [response](operations/examples/restart.evaluate.response.json) |
| `/v2/response-plans/solve` | Compose all four decisions from one validated snapshot | [composite response](operations/schemas/response-plan.response.schema.json) | [request](operations/examples/response-plans.solve.request.json) · [response](operations/examples/response-plans.solve.response.json) |

Responses echo the request and snapshot IDs, decision time, profile, policy versions, evidence IDs and an input fingerprint. The composite response contains `heat`, `protective_response`, `crew_rest`, and `restart`. A planning component failure is represented as `model_invalid` in the composite result so independently computed protective findings remain visible.

## Read the schedule, then its totals

The complete schedule is `crew_rest.intervals`, not `useful_worker_minutes`. Each interval supplies `person_id`, `kind`, `task_id`, `zone_id`, `starts_at`, `ends_at`, and `requires_revalidation`. Filter by person and order by `starts_at` to display that person's work, recovery and unavailable periods. The separate `occupancy` array supplies projected room usage over time; `carry_forward_rest` records recovery still owed at the requested horizon boundary.

In the canonical captured plan, each of C05–C08 works 08:11–08:26, recovers 08:26–08:41, works 08:41–08:56, then recovers through 09:11. That is **sixty elapsed minutes**, **thirty workshop minutes per person**, and **four × thirty = 120 workshop worker-minutes**. The other seven affected workers remain in recovery. Recovery and fixed occupants P07/P08 do not contribute to useful workshop worker-minutes. Four useful places × sixty minutes is 240 worker-minutes of demand; the unfilled balance is 120. It is not a task completion-time estimate.

Incident replanning at 08:18 uses actual supplied work history from 08:11–08:18; it does not reset the work clock. The remaining workers can finish eight more minutes before recovery. Its default horizon is now 08:18–09:18, different from the canonical 08:11–09:11 window. Future-only useful worker-minutes are ninety without a ready replacement and 120 with C09 separately confirmed ready; already-worked minutes are not included. Required recovery can continue through 09:33 even though the planning horizon ends at 09:18. Those precise intervals and full request/response bodies are available in the walkthrough.

## Supplied work and recovery rules

To use different timing rules, supply this root object alongside the usual snapshot and planning request. These are hypothetical test values, not field guidance:

```json
{
  "timing_policy": {
    "id": "demo-work-rest-alternate",
    "initial_recovery_minutes": 10,
    "max_work_minutes": 20,
    "between_work_recovery_minutes": 15
  },
  "planning": {
    "starts_at": "2025-08-04T08:11:00+04:00",
    "horizon_minutes": 60
  }
}
```

This excerpt is not a complete POST body. Complete examples are available for [10/20/15](operations/examples/crew-rest.alternate_timing_policy.request.json), [6/15/30](operations/examples/crew-rest.long_recovery_policy.request.json), and [0/20/10](operations/examples/crew-rest.zero_initial_recovery.request.json), with matching `.response.json` files. The standalone [timing-policy schema](operations/schemas/timing-policy.schema.json) defines the supported object. No expressions, scripts or arbitrary new rule types are accepted.

| Field | Meaning | Allowed whole minutes |
| --- | --- | --- |
| `initial_recovery_minutes` | Consecutive cooled recovery before the first workshop period | 0–120 |
| `max_work_minutes` | Maximum continuous workshop work period | 1–120 |
| `between_work_recovery_minutes` | Consecutive cooled recovery after a work period before another | 1–120 |

The policy ID is a nonblank identifier. With a supplied object, `planning.policy_id` may be omitted/null or must match its ID. A different ID is rejected rather than silently choosing one source. Without an object, `planning.policy_id: "demo-work-rest-v1"` selects the server's registered sample. An unknown ID needs its supplied numeric object; an unknown ID alone is invalid. With neither object nor selector, planning returns `missing_policy`.

The planner builds its timing states and constraints from these values. The proposal checker, history counters, conservative rounding and recovery reservations use the resolved policy too. Work history remains observed history when a policy changes: it never resets the clock. If an observed continuous work period already meets or exceeds the new maximum, further work is prohibited until the required recovery is completed; the planner cannot undo past work. A noncooled interruption does not complete cooled recovery.

The effective policy is echoed in `crew_rest.timing_policy`, its ID in `crew_rest.policy_id`, and its origin in `crew_rest.policy_source` (`supplied`, `registered`, or `none`). The fingerprint covers the request and effective numeric policy. Reusing an ID with different values changes the fingerprint. Supplied durations are not authenticated policy approval or a safety assessment.

## Planning interpretation

The registered fallback `demo-work-rest-v1` in [`operations/policy.json`](operations/policy.json) uses six initial cooled minutes, at most fifteen continuous work minutes and fifteen cooled minutes between work tours. Caller-supplied policies can change those three durations. All policies here apply to the affected cohort and light `workshop_prep` only; the one-minute grid and maximum 120-minute requested horizon remain fixed. These numbers are **not** operational thresholds or advice. Readiness, qualifications, availability, permits, resources, supervision, task and zone windows, occupancy, holds and symptom exclusions remain independent requirements. Missing history cannot prove recovery; elapsed recovery cannot establish readiness.

The planning horizon is 1–120 minutes. An unknown `staffing_demand.maximum` yields `missing_information` because useful staffing cannot be computed. Output intervals and occupancy may extend beyond the horizon to reserve actual owed recovery, bounded by the larger of the selected policy's initial and between-work recovery requirements (up to 120 additional minutes). `horizon_end`, `recovery_reservation_end`, and `carry_forward_rest` make that obligation visible. All proposed intervals require future revalidation. The checker reports `accepted`, stable `violations`, and `optimality: "not_evaluated"`; acceptance establishes feasibility under the supplied fictional snapshot, not authorization to execute. `planning_status` distinguishes `planned`, `recovery_only`, `blocked`, `missing_policy`, `missing_information`, `infeasible`, `unknown`, and `model_invalid`. `solver_status` is null when optimization did not run, otherwise one of `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNKNOWN`, or `MODEL_INVALID`; `optimal` tells whether optimality was proven. Restart status is `blocked`, `ready_for_human_review`, or `not_requested`. `ready_for_human_review` never releases a held task automatically.
