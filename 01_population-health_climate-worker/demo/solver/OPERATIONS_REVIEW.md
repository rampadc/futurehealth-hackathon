# Independent operational solver review

Reviewed on 10 November 2026.

Independent reviewer: `gpt-6.1-sol`, working in a separate review subagent from the implementation lead.

**What this change does:** The v2 API evaluates heat controls, protective actions, timed workshop work and recovery, and evidence for human restart review. It proposes decisions from a supplied fictional snapshot and returns `applied: false`; it does not perform site actions or release held tasks.

## Scope and verdict

I read the operational contracts, cross-field validation, decision functions, planner, independent proposal checker, HTTP adapters, policy, fixtures, tests, and API documentation. I exercised adversarial inputs independently, reported defects to the implementation lead, and rechecked the corrections. I changed only this review document.

**Verdict: Ship the fictional demo.** No unresolved concrete correctness finding remains in the reviewed Python implementation. This verdict covers the fixed C02–C12 workshop scenario, its stated timing assumptions, and the tested request contracts. It does not establish real occupational or medical suitability.

## Findings resolved during review

| Finding | Concrete failure before correction | Rechecked result |
| --- | --- | --- |
| Recovery debt could disappear | Fifteen workshop minutes, one welfare minute, then six cooled minutes allowed another immediate workshop tour. | The prior tour remains relevant; nine further cooled minutes are owed and immediate work is rejected. |
| Record fragmentation changed elapsed time | Twelve consecutive thirty-second cooling records counted differently from one six-minute record; short work records could each round upward. | Contiguous durations are accumulated before conservative rounding. Six observed cooled minutes count as six. |
| Partial-minute windows authorized a whole slot | A shelter available only until 08:11:30 was accepted for an 08:11–08:12 recovery interval. | A resource window must cover the complete minute. The proposal is rejected. |
| Missing monitor state caused a server error | Removing `t1` from `sensor_status` produced HTTP 500. | The closed sensor-state contract rejects the input with typed v2 HTTP 422 JSON. |
| Restart checks could precede later facts | Checks at 08:10 were accepted despite a recovery record at 08:11. | Checks must follow the latest relevant recovery, readiness, acknowledgment, or incident-response fact. |
| Rest-tail checking could crash | A proposal ending in work, without windows for its owed recovery, exceeded the checker's prepared tail. | It returns `rest_tail_unreserved` without an exception or accepted allocation. |
| Tail preparation overconstrained valid plans | Every plan required fifteen extra window minutes; a workshop becoming unavailable after the work horizon could eliminate otherwise valid work and cooled recovery. | No extra tail is required when none is owed. Unused workshop/welfare availability does not block a cooled tail. |
| Room preassignments distorted the movement objective | Changing shelter capacity forced two room moves where one sufficed. A constant placement could also move an idle worker unnecessarily when a working person could later recover in the other shelter. | Changing or initially disruptive room choices are left to the optimizer. Both regression cases pass with the avoidable moves removed. |
| Unknown useful staffing needed an explicit outcome | `staffing_demand.maximum: null` could reach arithmetic intended for an integer. | It returns `missing_information` and `useful_staffing_limit_unknown` before invoking optimization. |

The review also checked that symptoms remain exclusions, fresh readings do not automatically clear recorded holds, wrong-zone or stale readings cannot clear exposed work, and missing readiness or history does not become invented evidence. Protective actions and escalation are computed independently of planner success. A planner failure in the composite endpoint preserves those results.

## Verification evidence

Using `/tmp/heat-safe-allocation-python312/bin/python` from this directory:

- This reviewer's `python -m unittest discover -q`: **83 tests passed** in 27.111 seconds, including legacy dataset/allocation/API coverage and the new operational tests.
- After the final evidence-ID/assumption response additions, this reviewer reran the **11 affected HTTP/status tests**, all passing, and directly checked the evidence-ID set and explicit planning assumptions.
- This reviewer ran the **two added artifact tests**, both passing. They match all nine exported schemas to the Python models, validate twelve examples, and check all 27 captured typed responses, fingerprints, and feasible schedules. The integration lead separately reports a final **85-test full-suite pass** in 27.840 seconds.
- The operational decision, planning, status, and HTTP suites passed together. The final room-placement regression passed separately after its correction.
- Reduced exhaustive tests use a separate run-length oracle for a sixteen-minute single-worker problem and a three-minute two-worker capacity/tie problem. They compare the useful-work, movement, early-work, and stable-ID objective tiers without importing the planner's automaton.
- Additional direct reproductions verified interrupted recovery debt, fragmented duration accounting, partial-slot windows, typed missing-sensor errors, later-fact restart checks, unreserved tails, and changing room capacity.
- All twelve exported route request/response examples validated against their standalone Draft 2020-12 schemas with `FormatChecker` during review.

Canonical planning produces 120 useful worker-minutes: C05–C08 work 08:11–08:26, recover 08:26–08:41, work 08:41–08:56, and recover through 09:11. Eight ready workers can cover all four workshop seats for 240 worker-minutes and reserve the last group's recovery through 09:26. The API tests check the complete cohort, preserved civil hold, typed responses, proposal feasibility, input immutability, and retained v1 error versioning.

## Interpretation and remaining limits

The planner uses one CP-SAT worker, seed zero, and a shared approximately five-second planning budget. `FEASIBLE` means a valid incumbent was found; it does **not** prove the full preferred schedule, minimum movements, earliest work pattern, or stable-ID preference is globally optimal. The captured canonical and eight-ready examples correctly report `FEASIBLE` with `optimal: false`. Their useful-work totals meet the simple fixture bounds, but this is not a proof of every secondary objective for arbitrary windows. `UNKNOWN`, `INFEASIBLE`, and `MODEL_INVALID` return no proposed intervals. The short repeated/reordered-input test passes; exact repeatability of every time-limited incumbent is not established.

The production proposal checker runs independently of CP-SAT but shares policy-state definitions with the planner. The separate reduced enumeration and adversarial inputs provide an additional check; this review does not exhaust every possible 120-minute window/history combination.

Response provenance now includes the supplied evidence IDs, policy versions, snapshot, decision time, and fingerprint. Planning responses expose the policy assumptions, instantaneous minute-boundary moves, fixed workshop occupants, external supervision, and retained commitments. Future intervals require revalidation. `ready_for_human_review` preserves held tasks and still requires the named human owner.

**Not checked by this reviewer:** Browser rendering, the capture process's live HTTP transport, deployment, real sensor integration, and real-world validation of the fictional six/fifteen-minute policy. The integration lead separately reports passing original-source checks, all 27 live HTTP captures and feasible-plan checks, and the v1/v2 browser walkthrough checks.
