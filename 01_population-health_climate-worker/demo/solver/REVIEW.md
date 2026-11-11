# Independent synthetic dataset review

Reviewer model: `gpt-6.1-sol` · 10 November 2026

What this change does: Adds twelve authored, synthetic immediate-allocation examples after the scenario 02 heat-alert replay. The validator checks their inputs, proposed allocations and expected projections; it does not implement an optimiser, ADK integration, exposure-duration calculation or work authorization.

## Scope and evidence

Reviewed the final `dataset.json`, `dataset.schema.json`, `validate.py`, `README.md` and `test_validate.py` against the original scenario 02/03 events, shared roster, tasks, baseline state, original validator and architecture plan. Assumed the documented local fixture workload, with one invocation checking a small fixed dataset.

- The source state ends at 08:04 after scenario 02 events e01–e05. Later scenario 03 assignments are compared only as an output oracle, not applied to the allocation inputs.
- The canonical projection assigns C05–C08, retains P07/P08 in the six-seat workshop and leaves seven workers in shelter recovery. C01 remains outside the workshop; C13/C14 retain their original supervised light task.
- Cases copy the source state independently. Reversing case order still validates, including the symptom branches and their separate welfare accounting.
- Readiness is an explicit synthetic input, not inferred from attendance or absence of illness. C08's symptom report removes availability; contacting P06 does not imply diagnosis or completed care.
- Qualification, candidate-pool membership, workshop capacity, permit status, resources, demand and approved shared supervision constrain the allocation. All fourteen civil workers remain accounted for. Improved exposed-zone readings retain the heavy-work hold.
- Added facts carry `synthetic: true` and `fictional_demo_assumption`. The README distinguishes projected allocations, original replay observations and fictional point-in-time confirmations. It makes no safe-duration or real restart claim.

## Finding resolved during review

1. **A backdated empty snapshot could include future recovery evidence.** Before the fix, changing `recovery_0804.decision_at` and `readiness_missing.decision_at` to `2025-08-04T08:03:00+04:00` passed validation. The returned state already placed C02–C12 in shelter recovery, although the original recovery event occurs at 08:04. This was a temporal safety bug in `check_case`, whose case/snapshot ordering check did not constrain an empty snapshot to the source cutoff.

   The final validator requires `base.clock <= snapshot.decision_at <= case.decision_at`. Repeating the same mutation now raises `ValueError: snapshot precedes source cutoff or case precedes snapshot`. The regression test `test_empty_snapshot_cannot_precede_original_recovery` also passes. No unresolved finding remains from this issue.

## Verification

Ran with `/tmp/heat-safe-solver-validation/bin/python`:

```text
python -m unittest discover -s 01_population-health_climate-worker/demo/solver -p 'test_*.py'
Ran 18 tests — OK

python 01_population-health_climate-worker/demo/solver/validate.py --check-original
PASS: 10 standalone scenarios and connected 02→03→04→10 replay
PASS: 11 unsafe mutations rejected
PASS: 12 synthetic allocation cases; canonical matches scenario 03
```

Independent mutation probes also rejected future occurrence/recording times, wrong fact authority, wrong/revoked permit, missing resource/shared-supervision/readiness confirmation, symptomatic C08 in an accepted assignment, duplicate fixed occupants, workshop overcapacity, missing recovery accounting and a non-synthetic supplemental fact. Case-order reversal passed. Original checks run on a temporary demo copy; this review did not edit original scenario fixtures.

## Limits and verdict

The checks establish consistency of this authored fixture and its declared constraints. They do not validate clinical readiness, real permit validity, the adequacy of concurrent supervision, real task resources, regulatory compliance, or how long anyone may work. Those remain explicit fictional inputs or external human decisions. The test suite is targeted, not an exhaustive proof over every possible JSON document. The original reference validator uses Python assertions; the supported CLI rejects optimized (`-O`) execution.

No remaining actionable findings in the reviewed scope. **Verdict: Ship the synthetic fixture.**
