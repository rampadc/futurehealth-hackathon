# Caller-supplied timing policy review

Reviewed on 11 November 2026 by an independent review subagent configured as `gpt-6.1-sol`.

**What this change does:** The operational 2.1 request can supply a named timing policy with numeric initial recovery, maximum work and between-tour recovery minutes. Planning and proposal checking use those values, and planning responses expose the effective policy and whether it came from the caller or the registered fallback.

**Verdict: Ship the fictional demo.** No unresolved concrete correctness finding remains in the reviewed Python implementation. This review assumes the existing eleven-worker workshop demonstration, a one-minute grid, a horizon of at most 120 minutes and timing values within the published bounds. It does not establish real operational or medical suitability.

## Corrections checked during review

Source review caught an extra-minute recovery transition while the timing kernel was being implemented. The first projected recovery minute now advances to the same state as one observed cooled minute. The independent comparisons below verify one-minute rests as well as longer rests, including initial recovery zero.

Source review also caught inconsistent provenance when a request carried a policy object but `planning` was null. That response now consistently returns `policy_id: null`, `timing_policy: null` and `policy_source: "none"` because there is no effective planning policy.

Neither issue remains in the reviewed source. The reviewer changed only this report and used temporary scripts outside the repository for additional checks.

## Independent verification

Using `/tmp/heat-safe-allocation-python312/bin/python` from this directory:

- `python -m unittest -q test_operational_api test_operational_planning test_operational_statuses`: **47 tests passed** in 84.181 seconds. These cover supplied-policy validation and provenance, registered fallback, invalid policy IDs, contradictory selectors, same-ID parameter changes, canonical plans, long recovery reservations, stricter-policy rejection, status handling and existing API behavior.
- After final regeneration, `python -m unittest -q test_operational_artifacts`: **three tests passed** in 0.202 seconds. The ten exported schemas match their Python models, all eighteen request/response examples validate against the exported schemas, and all 32 captured composite responses have matching fingerprints and checker-accepted feasible schedules. The three additional custom-policy examples also echo their exact supplied values and pass proposal checking. The two final regressions for registered-policy fingerprint changes and no-planning provenance passed separately.
- A separate run-length oracle checked **3,456 six-minute trajectories** against the production proposal checker. It varied initial recovery across 0, 2 and 9 minutes; maximum work across 1, 2 and 5; between-tour recovery across 1, 3 and 8; and observed initial recovery across 1 and 7. It built complete proposed worker intervals and calculated the required recovery tail without using the production timing-state methods. All expected acceptances and rejections matched.
- Four boundary-policy solves were all `OPTIMAL`, round-tripped successfully through the checker and respected room capacities. The 0/1/1 policy produced three useful minutes in a six-minute horizon. With 120/120/120 and seven observed cooled minutes, work began at 10:04, contributed seven useful minutes through the 10:11 horizon and reserved recovery through 12:11. The 0/120/120 policy produced 120 useful minutes and also reserved recovery through 12:11. The 120/1/120 policy with a one-minute horizon returned recovery only, reserving the remaining initial recovery through 10:04.
- Direct history checks verified that seven observed work minutes under a newly supplied maximum of three create an immediate four-minute recovery debt; incomplete recovery followed by welfare interruption retains the required debt; completed recovery remains complete after later welfare activity; and six consecutive thirty-second cooling records count as three elapsed cooled minutes. A subsequent one-minute observed recovery reduced a four-minute debt to three across a replanning boundary, with first new work still beginning at 08:15.
- A decision at 08:11:30 with seven minutes thirty seconds of observed recovery, a ten-minute initial requirement and an 08:12 planning boundary first allowed work at 08:15. Partial observed minutes and the unobserved gap therefore did not create early work.
- At the largest supported horizon and recovery tail, the objective weights preserve useful worker-minutes, then movements, then early work, then stable worker-ID preference. Their conservative summed upper bound remains below the signed 64-bit integer limit used by CP-SAT.

The canonical policy remains six initial cooled minutes, fifteen maximum work minutes and fifteen between-tour cooled minutes. The tests retain the canonical 120 useful worker-minutes and the eight-ready-worker 240 useful worker-minutes. The supplied 10/20/15 fixture, starting from seven observed cooled minutes, begins work at 08:14.

## Interpretation and limits

The production checker is independent of CP-SAT search but deliberately shares the policy-state kernel and history interpretation with the planner. The separate run-length oracle above provides an independent check of those state transitions. The history cases add checks for interruption, conservative rounding and debt carried into another request.

The solver retains its approximately five-second budget, one search worker and fixed seed. `FEASIBLE` establishes a checked proposal, not proof that every objective tier is optimal. Numeric timing values remain caller assertions for a fictional example; readiness, room capacity, useful staffing limits and task prerequisites remain separate constraints. Future intervals continue to require revalidation and `applied` remains false.

**Not checked by this reviewer:** Browser rendering, the capture process's live HTTP transport, deployment, real sensor integration, and real-world validation of timing values. The integration lead separately regenerated the captures through actual HTTP calls; this reviewer verified the resulting artifacts and proposals locally.

Integration lead's final verification: all 109 Python tests passed in 90.460 seconds. All 32 operational cases were captured through the running HTTP API, with every feasible schedule checked through the HTTP proposal checker. The browser regression passed all captured inline variations, a live supplied-policy call, stale-response handling, mobile layout and offline reading. Original fixture validation and replay checks passed in a temporary copy; the original embedded v1 evidence remains unchanged.
