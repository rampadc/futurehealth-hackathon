# Independent solver review

What this change does: The local OR-Tools CP-SAT solver generates an immediate workshop allocation from the fictional recovery snapshot and supplemental facts. Proposal checking evaluates hard feasibility separately, so a valid smaller or equivalent allocation can pass without becoming the preferred recommendation.

Reviewed on 2026-11-10 by an independent Sol reviewer, using the ponytail-review workflow. Scope: `solve.py`, `inputs.py`, the refactored fixture validator, dataset/schema, README and connected tests/source replay. Expected load is one local invocation with the fixed eleven-person recovery pool. This review is separate from the historical dataset review in `REVIEW.md`.

## Resolved findings

1. **Oversized useful staffing demand crashed model construction.** A prepared demand of `2**63` passed input checks but exceeded the integer range accepted by an OR-Tools constraint. The model now caps that nonbinding bound at the candidate count. Rechecked both `2**63` and `10**100`: each returns `OPTIMAL` with C05–C08.
2. **Python equality allowed malformed frozen inputs.** Workshop capacity `6.0` compared equal to the frozen integer `6`, passed validation and then crashed model construction. An alert acknowledgment of `1` also passed as the frozen Boolean `True`. Type-sensitive recursive comparison now protects frozen definitions and state fields. Both reproductions now raise `ValueError` before solving; strict Boolean controls remain enforced.
3. **A schema-valid integral JSON number failed the prepared API boundary.** JSON Schema accepts `4.0` as an integer, but the replay preserved its Python float type and the solver boundary rejected it. Validated demand facts now normalize to Python integers. Rechecked `max_workers: 4.0`: preparation produces integer `4` and the solver returns C05–C08. Direct prepared inputs still require an integer demand.

The README also now correctly limits its `--dataset` and JSON-output claims to `solve.py` subcommands; the fixture validator uses the repository dataset and prints text.

## Verification evidence

- Python 3.12 with OR-Tools `9.15.6755`: all **30 unit tests pass** after the fixes.
- `solve.py verify`: all **12 cases pass**, each with an optimal independently generated recommendation. The fourteen-person whole-crew proposal is rejected while its separate recommendation remains C05–C08.
- `validate.py --check-original`: all **10 original standalone scenarios**, the connected **02→03→04→10** replay and **11 unsafe mutation checks** pass using a temporary copy.
- Independent exhaustive enumeration confirms the preferred cardinality and ascending-ID choice for every authored case. A separate seeded adversarial run checked **40 additional combinations** of readiness, unavailable workers, fixed workshop occupancy, missing gates and staffing demand against exhaustive enumeration; every optimum and sampled feasible proposal check agreed.
- Repeated and reversed-order runs preserve their input dictionaries and return identical results and fingerprints. Removing or replacing authored proposals/expected outputs leaves the prepared recommendation input unchanged. Recommendations replay scenario 02 as their base and do not load scenario 03 as selection evidence; only fixture verification uses scenario 03 as an output oracle.
- Hard limits cover candidate scope, qualifications, explicit readiness, availability, capacity, useful demand, permit, resources and shared supervision. The objective gives worker count priority over the unique ascending-ID preference. P07/P08 remain fixed, C01's reservation and C13/C14's supervised work remain intact, and all fourteen civil workers remain accounted for.
- Improved exposed-zone readings preserve the civil-heavy hold. Readiness and responder contact remain fictional readiness/response facts, without a diagnosis or claim of completed care.
- Optimal empty allocations remain feasible. Tests exercise `FEASIBLE`, `UNKNOWN`, `INFEASIBLE` and `MODEL_INVALID` handling, including absent allocation/projection for the latter three and CLI failure codes. Runtime parameters remain one search worker, seed zero and a five-second limit.

## Limits

The rare nonoptimal/error solver-status branches are tested by substituting returned statuses; this fixed optional-allocation model always permits the empty allocation, so ordinary valid fixtures do not naturally prove infeasibility. The review verifies the stated fictional immediate-allocation contract, not medical readiness, real permits, recovery durations, fairness, timed rotations or operational authorization. The prepared dictionary API validates the supported shape and controls; it does not authenticate the human provenance of caller-supplied readiness or gate values.

No ADK, MCP, deployment, external publication or production integration was performed. Source replay validation still depends on assertions, so optimized Python execution is explicitly rejected.

Verdict: Ship within the documented local synthetic scope. No unresolved actionable findings remain from this review.
