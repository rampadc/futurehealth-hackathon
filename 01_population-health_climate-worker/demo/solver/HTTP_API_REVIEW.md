# Independent HTTP API review

What this change does: The service accepts complete JSON facts at HTTP solve/check endpoints and returns validated JSON allocation projections. Callers do not need a CLI command, fixture case name, UI, LLM or MCP adapter.

Reviewed on 2026-11-10 by an independent Sol reviewer using the ponytail-review workflow. Scope: `api.py`, `api_models.py`, `test_api.py`, exported schemas, complete examples and `HTTP_CONTRACT.md`, including their integration with the existing solver/input boundary. Expected load is local requests for the fixed eleven-person fictional recovery pool. The earlier `SOLVER_REVIEW.md` remains unchanged.

## Resolved findings

1. **Internal profile errors could be reported as invalid caller input.** A `ValueError` while loading the frozen source was caught as a request error and its text appeared in HTTP 422. Initial source-validation failures now become internal errors. Rechecked the reproduction: HTTP 500 uses the generic versioned error body and does not disclose the supplied private exception detail.
2. **JSON integer semantics disagreed with the exported schema.** Schema-valid `minimum: 1.0` and `maximum: 4.0` were rejected by strict Python integer parsing. Request validators now normalize finite integral numeric values, while retaining rejection of Boolean, string and fractional values. The canonical allocation still returns C05–C08.
3. **Malformed body encoding bypassed the error contract.** Invalid UTF-8 JSON returned FastAPI's default HTTP 400 `detail` object. These body-parsing failures now return the documented HTTP 422 `INVALID_REQUEST` model. Both a bare invalid byte and an invalid byte inside an object were rechecked.
4. **An explicitly supplied old measurement could bypass chronology checks.** Repeating the identical original 08:00 reading was accepted despite the adapter contract requiring supplied measurements to follow the 08:04 source cutoff. The adapter now checks every non-null measurement against source cutoff and decision time before replacement. Both old and future supplied readings reject; `null` retains the original source reading.
5. **A valid timestamp spelling was rejected.** The parser rejected a lowercase `t` delimiter although the exported date-time schema accepted it. The timestamp parser now accepts lowercase `t`/`z`, and the lowercase-delimiter canonical request succeeds.

## Verification evidence

- Python 3.12 with the pinned dependencies: all **42 tests pass**, comprising the **30 existing core tests** and **12 HTTP tests**.
- Every one of the **12 authored fixture branches** was translated into the external request structure and exercised through solve/check HTTP endpoints. Caller-supplied readiness, availability, occupancy, demand and prerequisite statuses drive the results.
- Complete solve/check example requests and responses validate against their respective saved JSON Schemas. Actual endpoint responses equal the saved response examples exactly, including metadata, fingerprint, diagnostics and projected state. Exported schemas agree with the live Pydantic models, and OpenAPI exposes the request and response contracts.
- An actual Uvicorn server bound temporarily to loopback accepted the solve JSON over a socket and returned the exact saved solve response. It was stopped after verification; no external hosting or publication was performed.
- Independently exercised HTTP `FEASIBLE`, `UNKNOWN`, `INFEASIBLE` and `MODEL_INVALID` outcomes. `FEASIBLE` retains a valid allocation with `optimal: false`; the other three return `allocation: null`. All use the documented HTTP 200 solver-outcome contract. Rare statuses were substituted for this check, rather than claimed to occur naturally in the optional-allocation fixture.
- Domain checks enforce the complete unique C02–C12 pool, known and unreserved fixed occupants, P07/P08 retention, six-seat capacity, exact incident/unavailability correspondence, P06 contact status and source/decision chronology. Server-owned qualifications, task definitions, C01 shared external supervision, existing assignments and the civil-heavy hold remain protected by the existing prepared-input boundary.
- Malformed requests receive the versioned HTTP 422 error model; source and unexpected solver exceptions receive the generic HTTP 500 model. Additional request fields are forbidden. Suboptimal feasible proposals remain valid checks, and the whole-crew check rejects without applying workers or silently invoking a replacement recommendation.

## Limits

The exported schemas specify structural types and closed fields; documented cross-field constraints and chronology are also enforced at runtime. This is the fixed `sandline_demo_v1` profile, not a configurable multi-site task scheduler. Caller readiness and prerequisite statuses are point-in-time assertions, not authenticated approvals or medical evidence. Responses are projections with `applied: false` and create no operational action.

The review covers local synthetic HTTP use. Production deployment, authentication, MCP integration, timed rotations and medical recovery decisions were outside scope. Unknown routes/methods retain normal framework HTTP errors; the versioned invalid-request contract covers the documented allocation operations.

Verdict: Ship within the documented local synthetic scope. No unresolved actionable findings remain from this review.
