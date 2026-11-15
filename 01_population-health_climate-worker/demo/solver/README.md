# Heat-Safe scenario 2 operational demonstration

The `/v2` operational API evaluates heat controls, protective actions, timed crew/rest plans and restart readiness. Start with [the operational input/output contract](OPERATIONS_API.md). Its current schema is **2.1**: callers supply the location catalogue and task bindings, plus task-specific supervisor readiness records with evidence, basis and expiry. Earlier operational 2.0 requests require migration. The composed endpoint is `POST /v2/response-plans/solve`; each component also has its own endpoint. These are ordinary deterministic Python functions and HTTP JSON contracts, without agents, LLMs, ADK or MCP.

Callers can now supply a root `timing_policy` object with `id`, `initial_recovery_minutes` (0–120), `max_work_minutes` (1–120) and `between_work_recovery_minutes` (1–120). The planner and checker build their timing rules from it. The response echoes the effective policy and its source; changing values changes the fingerprint. Existing `planning.policy_id` requests still select the registered fallback. See the complete [alternative policy request](operations/examples/crew-rest.alternate_timing_policy.request.json) and [actual response](operations/examples/crew-rest.alternate_timing_policy.response.json).

The registered [example timing policy](operations/policy.json) is explicitly fictional. It applies only to C02–C12 and light workshop preparation: six recorded cooled minutes before the first tour, a maximum fifteen-minute tour, and fifteen consecutive cooled minutes before another tour. Future work remains conditional on rechecking readiness and prerequisites. Original site files and the immediate `/v1` API remain unchanged.

The operational chapter of the walkthrough follows the actual JSON from input to output: supplied room IDs/capacities, Huda's readiness confirmations, per-person `crew_rest.intervals`, elapsed time versus worker-minutes, and Bilal's incident with and without a ready replacement. Complete bodies remain inspectable alongside the readable explanation. The API validates supplied assertions; it does not authenticate supervisors, persist an audit log, or authorise work.

**Article and worked examples:** Open [the local guide](http://127.0.0.1:8765/walkthrough?article=1) or the self-contained [HTML file](walkthrough.html). The main article follows site responsibilities, the heat hold, workshop eligibility, the work/recovery schedule, Bilal's symptom response and human restart review. Descriptive headings and connected prose explain each decision before the supporting JSON and live scenario explorers. Delivery, employer commitments and pitch material are in a separate expandable section. Both original v1 evidence and all 32 operational captures remain embedded for offline reading.

The guide opens with each operational component's problem, inputs, outputs, caller, trigger and downstream use. Variations and local API Run buttons sit beside the article steps they change; each shows input facts, the decision and reason, returned output, per-person intervals and optional exact JSON. Selecting a case displays a captured calculation; Run sends its complete request to the local API. The user-approved writing convention is **plain-language explanatory prose built around a worked example**, recorded in [AGENTS.md](AGENTS.md) for future edits.

**HTTP JSON API:** Start with the [versioned input/output contract](HTTP_CONTRACT.md), [complete request](examples/solve.request.json), [actual response](examples/solve.response.json), and [JSON Schemas](schemas/solve.request.schema.json). `POST /v1/allocations/solve` generates a proposal; `POST /v1/allocations/check` tests one. The CLI documented below is an optional developer utility.

`dataset.json` is a fictional solver fixture layered on the original [08:04 heat-alert replay](../02_heat_alert_response/signals.jsonl). It does not change that replay or import the later scenario 03 assignment as evidence. Every added fact is explicitly marked `fictional_demo_assumption`. The fixture tests a decision at the stated time, not a real work authorization, medical judgment, safe exposure duration, or restart approval. `solve.py` now independently generates immediate workshop allocations with OR-Tools CP-SAT; `validate.py` continues to check the authored fixtures.

## Replay contract

The base state is the cross-scenario baseline after scenario 02 events `e01`–`e05` are applied through 08:04. Its civil heavy task remains held. C02–C12 are in `shelter_a` recovery, P07 and P08 occupy the six-seat workshop, C13 and C14 remain on supervised `civil_light`, and C01 remains the foreman. The `recovery_0804` snapshot adds no facts. `canonical_081030` adds only the facts recorded by 08:10:30; it is an immediate alternative allocation, before scenario 03's 08:11 assignment event.

Each case starts independently from its named snapshot. Apply its `facts` in timestamp order, with a later fact overriding an earlier fact for the same subject. `occurred_at` and `recorded_at` must both be at or before the case's `decision_at`. The `proposal` is the plan being checked; the deliberate `whole_crew` case is a request to reject. `expected.accepted` says whether that plan is accepted, including an empty feasible plan when a prerequisite is absent. `expected.assignees` and `expected.workshop_occupants` describe the resulting allocation. `expected.recovery` is the original eleven-person recovery set less assigned or unavailable people. `expected.unavailable` is a separate welfare state, never an assignment or recovery seat.

The five prerequisite facts for `workshop_prep` are worker readiness, a valid workshop permit, available resources, positive task demand, and C01's available shared supervision approved by P02. Readiness applies only to the listed people. Missing readiness is unknown, not a symptom or illness. A `false` readiness fact overrides an earlier `true` for those people. The `unavailability` fact records C08's symptom report and contact with P06; it does not claim a clinical diagnosis or completed care. C01 supervises from outside the workshop and consumes no workshop seat. The fixed P07/P08 occupants stay in place. More readiness than available seats selects lower person IDs solely for deterministic fixture output, not as a real worker priority.

`blockers` are diagnostic reason codes for the candidate allocation: `readiness`, `permit`, `resources`, `supervision`, and `demand` name missing prerequisites; `capacity` means otherwise ready candidates exceed the free workshop seats; `qualification` means a proposed person lacks the workshop task qualification; `outside_candidate_pool` means a proposed person is outside the recovered C02–C12 pool; `unavailable` identifies the separately removed C08. The reason codes can coexist with a feasible subset, so a partial assignment can be accepted. An improved exposed-zone reading does not clear the original heavy-work hold.

All expected allocations and resulting occupancy are **projections if approved**, not observations of actions already taken. The canonical projection matches the original recorded 08:11 assignment, but that later event is used only as an output check. A permit fact is a fictional point-in-time status confirmation, not a real permit issuance; readiness and resource facts likewise require revalidation before any later use.

In `supervision_unavailable`, only the concurrent shared-coverage arrangement is unavailable. C01 retains the original supervision of C13/C14 on `civil_light`; the new workshop assignment is blocked. No case makes the new starters work without their original supervisor.

The original v1 fixture assumes immediate suitability after recovery only as synthetic input for testing allocation logic. It supplies no recovery duration, threshold, real staffing approval, or production resource. The separate v2 fixture adds the explicitly fictional timing policy described above. Real operational decisions remain governed by the site process and human decision makers. In the v1 `eight_ready` case, capacity and useful staffing demand both bind at four and both appear as diagnostics. These diagnostics do not turn a valid subset into a rejected proposal.

## Verify

The expected-plan objective is to fill eligible useful workshop places, retain the other assignments, then break equivalent choices by ascending worker ID. This is a fixture convention, not a measured productivity or fairness model. Each case remains an independent branch; countercases do not alter the canonical story.

| Case | Expected productive workshop workers | Main limitation |
| --- | --- | --- |
| `readiness_missing` | None | Readiness and task prerequisites not yet confirmed |
| `canonical` | C05–C08 | Four places filled; seven remain in recovery |
| `two_ready` | C05/C06 | Only two confirmed suitable |
| `eight_ready` | C05–C08 | Four places and useful staffing cap; ID tie-break |
| `extra_occupant` | C05–C07 | P01 occupies a third fixed place |
| `demand_two` | C05/C06 | Useful task demand capped at two |
| `permit_unavailable` | None | Workshop permit unavailable |
| `supervision_unavailable` | None | Shared supervision arrangement unavailable |
| `symptom_no_substitute` | C05–C07 | C08 in welfare, no ready replacement |
| `symptom_substitute` | C05–C07 and C09 | C09 separately confirmed suitable; C08 in welfare |
| `whole_crew` | None; proposal rejected | Capacity, demand, qualifications, readiness and candidate scope |
| `improved_reading` | C05–C08 | Improved TWL still does not clear the trench hold |

From this directory, install the local test dependency with `python -m pip install -r requirements.txt`, then run `python validate.py` and `python -m unittest discover -s . -p 'test_*.py'`. `python validate.py --check-original` additionally runs the existing demo validators against a temporary copy of the original demo. No original scenario files are rewritten.

## Run the solver

Use Python 3.12. From this directory:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python solve.py recommend --case canonical
.venv/bin/python solve.py check --case whole_crew
.venv/bin/python solve.py verify
.venv/bin/python -m unittest discover -s . -p 'test_*.py'
.venv/bin/python validate.py --check-original
```

Every `solve.py` subcommand accepts `--dataset /path/to/dataset.json` and prints JSON. A rejected proposal is a successful check (exit zero); invalid inputs, failed verification, or recommendation runs with no feasible solution exit nonzero. The separate fixture validator prints text and uses the repository dataset. No command writes an allocation or changes a scenario. Do not run with `python -O`: the original replay validator uses assertions, and input preparation rejects optimized execution.

For Python callers in this directory:

```python
from inputs import prepare_problem, read
from solve import check_proposal, solve_allocation

problem = prepare_problem(read("dataset.json"), "canonical")
recommendation = solve_allocation(problem)
subset_check = check_proposal(problem, ["C05", "C06"])
```

Recommendations never consume the authored `proposal` or `expected` fields. Verification alone reads those output oracles. Checking the whole-crew proposal rejects it; recommending from that same snapshot independently returns C05–C08. A smaller valid subset or an equivalent higher-ID subset can pass a proposal check without being the preferred recommendation; checks do not evaluate optimality.

The model chooses at most one workshop assignment for each of the eleven affected workers. Qualifications, explicit task readiness, availability, fixed occupancy, useful demand, permit, resources and shared supervision are hard limits. Its integer objective maximises worker count before a unique ascending-ID preference. Other valid assignments are fixed; there is no cost, fairness, duration or full-shift objective.

Results include a SHA-256 fingerprint of the prepared input, decision time, preserved holds, per-worker reasons, welfare/responder status and a **projected** state. `OPTIMAL` establishes the preferred allocation; `FEASIBLE` is a valid incumbent without an optimality guarantee. `UNKNOWN` means no allocation was established before stopping, not proof of infeasibility. `INFEASIBLE` and `MODEL_INVALID` are distinct technical outcomes. An optimal empty plan under missing prerequisites is valid and is not `INFEASIBLE`. Runs use one worker, seed zero, and a five-second solve limit. There is no fallback schedule when a feasible result was not found.

The `/v1` allocator supports immediate allocation to this workshop. The separate `/v2` operational family adds fictional timed planning; neither API authorises work or restart. ADK, MCP, deployment and full-shift scheduling remain outside this implementation. The original [dataset review](REVIEW.md) covers the fixture; the separate [solver review](SOLVER_REVIEW.md) records immediate-allocation verification. See [the operational review](OPERATIONS_REVIEW.md) for the additional components.

## Verify the walkthrough

`walkthrough-results.json` records the captured requests and responses, and the HTML embeds the same evidence. With the local API running, maintainers can refresh both using `python build_walkthrough.py`. This makes 24 real HTTP calls, validates their schemas and compares results with the authored case expectations before updating the document. The Python test suite also replays all embedded request/response pairs against the current API to detect drift.

Run `npm ci` in this directory, then `npm run test:browser` with Google Chrome installed and the local API available at `http://127.0.0.1:8765/`. This Playwright check covers live JSON editing, returned allocations, rejected proposals, validation errors, connection failure, stale-response handling, mobile layout and offline reading. See the independent [walkthrough review](WALKTHROUGH_REVIEW.md).
