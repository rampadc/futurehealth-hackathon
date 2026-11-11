# Independent catalogue and readiness review

Reviewed 11 November 2026 by an independent `gpt-6.1-sol` review subagent. This review covers the schema 2.1 supplied location catalogue, supervisor readiness evidence, their planning effects, and the retained interval evidence. It supplements `OPERATIONS_REVIEW.md` rather than repeating its earlier timing audit.

## Findings and conclusion

The catalogue/readiness implementation passes the bounded review. One new contract discrepancy was found and corrected: a capacity such as `20.0` satisfied the exported JSON Schema integer constraint but was rejected by the HTTP model. The shared operational validator now accepts finite integral numeric values for capacity and still rejects Boolean, string and fractional capacities. I independently reran the added HTTP/schema regression successfully.

The same correction resolves the adjacent pre-existing discrepancy for `PlanningOptions.horizon_minutes`: `60.0` now passes both the exported schema and HTTP model, while Boolean, string and fractional values remain rejected. The expanded regression and both artifact tests passed on an independent final rerun. No unresolved concrete finding remains in this bounded review.

No concrete unsafe acceptance was found in the reviewed catalogue/readiness behavior. This conclusion concerns the supplied fictional model, not authentication of the supervisor, inspection of a location, medical suitability, or real execution.

## Independent adversarial checks

| Input variation | Observed result |
| --- | --- |
| Both cooled shelters have zero capacity | `infeasible`, with no proposed intervals. |
| Remove the second shelter and its windows | A valid plan uses the single supplied shelter; there is no hard-coded two-shelter requirement. |
| One location has light-work, cooled-recovery and first-aid capabilities, capacity thirteen; other shelters have zero capacity | The plan accounts jointly for eleven workers and two fixed occupants without exceeding the shared room capacity; the proposal checker accepts it. |
| A confirmed incident destination has zero capacity | `infeasible`, with no proposed intervals. |
| Readiness expires exactly at planning start | `recovery_only`, with zero productive worker-minutes. |
| Readiness expires partway through a minute | The permanent regression permits only complete work minutes ending before expiry. |
| A symptom incident retains an earlier `ready` confirmation | The worker remains excluded and unavailable at the supplied incident destination. |
| Change catalogue capacity, catalogue label, readiness basis, or readiness source | Each mutation changes the input fingerprint. |

The existing HTTP tests also reject unknown location references, unsuitable task/recovery capabilities, duplicate locations and evidence IDs, unsupported readiness task/actor/source, blank evidence or basis, future confirmation, and invalid confirmation chronology. The renamed-location and additional-shelter regression passes. The civil monitor binds to the supplied civil task location; capabilities and IDs are not inferred from familiar room names.

## Captured schedule and audit evidence

I checked all twenty-nine current `operational-results.json` cases independently of the capture builder. For the composite response and each of its four component responses, the schema version, request/snapshot identifiers, decision time, profile, policy versions, evidence IDs, fingerprint and `applied: false` match the retained request metadata.

Across the captures, all eighty-four productive intervals fit entirely inside a `ready` confirmation's validity, and none assigns productive work to an incident-excluded or unavailable worker. Summing their durations yields 1,170 worker-minutes, agreeing with the individual response totals. I independently reconstructed every occupancy segment minute by minute from the interval ledger plus the matching window's fixed occupants; its count and capacity agree with the supplied catalogue and reported occupancy.

The two artifact tests pass: exported schemas and examples match current models, the captured case set matches current fixtures, and every feasible captured schedule passes the proposal checker. The captured canonical and eight-ready plans retain 120 and 240 useful worker-minutes respectively.

The walkthrough source reconstructs its grouped ledger, selectable per-person history and worker-minute arithmetic from `crew_rest.intervals`. It displays the supplied catalogue and confirmation task, actor, time, validity, basis, evidence ID and source. The API documentation explains retaining the request for audit, distinguishes caller attribution from verified identity, and makes no persistence claim.

## Verification and limits

Using `/tmp/heat-safe-allocation-python312/bin/python`, the planning, decision, HTTP and status suites passed together: forty-five tests before the added numeric-capacity regression. The numeric-capacity regression and two artifact tests then passed together after the correction. The additional adversarial and independent occupancy/provenance checks above also passed.

I changed only this review document. Browser rendering and live HTTP capture transport are being checked separately by the integration lead. I did not exhaust every possible catalogue, window or history combination, and did not validate real-world recovery rules, room conditions or readiness assessments. Time-limited `FEASIBLE` output remains a feasible projection without a claim that all secondary preferences are globally optimal.

Integration lead's final verification (recorded separately from the independent checks above): all 93 Python tests passed in 39.296 seconds; all 29 updated HTTP cases were captured and every feasible projection passed the HTTP checker; original fixture/replay validation passed in a temporary copy. The v1/v2 browser regression passed live calls, stale-response handling, mobile layout and offline reading. The lead also visually inspected the rendered per-worker intervals and worker-minute explanation. The last added HTTP test verifies a renamed first-aid destination is retained in the patient's proposed unavailable intervals.
