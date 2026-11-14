# Evals: how we know the agent works

```bash
uv run --env-file .env python evals/run_evals.py            # all scenarios once, results to BigQuery telemetry.eval_results
uv run --env-file .env python evals/run_evals.py -n 3       # 3 repeats each (use this before trusting a change)
uv run --env-file .env python evals/run_evals.py -k refuse  # one scenario while iterating
uv run --env-file .env python evals/run_evals.py --no-bq    # local JSON only (evals/results/, gitignored)
uv run --env-file .env python evals/run_retrieval_evals.py -v  # retrieval only: hit@k, MRR per boost setting
uv run pytest tests/test_eval_metrics.py    # the scorer's own tests: free, no model calls
```

| File | Role |
|---|---|
| `golden/supervisor.yaml` | The scenarios: prompt, pinned date, expected tools, checks, and *why* each exists |
| `golden/retrieval.yaml` | Retrieval questions labelled with the page(s) a careful reader would cite |
| `retrieval_metrics.py`, `run_retrieval_evals.py` | hit@k, MRR, binding-first; compares authority-boost settings on the same candidates |
| `metrics.py` | Pure-code scoring: trajectory metrics, named invariants, regex checks |
| `run_evals.py` | Runs scenarios through `agents/supervisor/session.ask` (the same path as the demo), scores, logs |

## Learning notes

These notes are written for learning, from what actually happened while building this suite on 5 Nov.

### 1. Unit tests and evals answer different questions

| | Unit tests (`tests/`) | Evals (`evals/`) |
|---|---|---|
| Tests | Deterministic code: TWL, rules, scheduler | The LLM's *behaviour* with that code |
| Result | Same every run | Varies run to run |
| Cost | Free, milliseconds | Tokens, seconds |
| Question | "Is the maths right?" | "Does the agent use the maths correctly, and only the maths?" |

The architecture decides how much can go in the first column. Because thresholds, schedules and
invariants are code (`rules.py`, `schedule.py`), most of the safety case is unit-tested. Evals then
cover only what the model decides: which tools to call, with which arguments, and what it says.
**Moving logic out of the prompt and into code is the strongest eval strategy there is.**

### 2. Deterministic checks first, an LLM judge later

Every check here is code: tool trajectory, tool arguments and outputs, invariants, regexes. A
deterministic check is free, instant, reproducible, and cannot be persuaded. An LLM-as-judge
("is this answer helpful and correct?") is needed for meaning, but it has its own error rate and
needs its own eval. Add it only for what code can't check (tone, completeness, faithfulness to
retrieved text in RAG).

### 3. Two kinds of output: gates and diagnostics

- **Checks** are pass/fail and gate the result. A scenario passes only if every check passes.
- **Metrics** (trajectory precision and recall) are numbers for diagnosis and trends, not gates.
  The new-starter scenario has precision 0.75: the agent calls `optimise_schedule` twice (once for
  the crew, once for the new starter). That is *correct* behaviour that a strict metric marks down.
  If precision gated the run, we would be pushing the agent to do the wrong thing.

Trajectory match modes: `exact` (same list), `in_order` (expected is a subsequence; extra calls
allowed), `any_order` (expected multiset is present), `none` (don't check). Use the loosest mode
that still protects the behaviour. Over-strict evals break on harmless changes and train you to
ignore failures.

### 4. Run more than once: LLMs are not deterministic

Even at temperature 0.1 the same prompt gives different answers. On 5 Nov the unknown-site scenario
passed 2 of 3 runs. The failing run planned "Dubai Marina" using Abu Dhabi City weather "as a proxy":
transparent, but wrong (different weather, and ADOSH-SF only applies in Abu Dhabi). **A single run
would have hidden this bug.**

- **pass rate** (`2/3`) tells you how often it works.
- **pass^k** ("all repeats passed") is what safety needs: a supervisor gets one answer, not three.
  The runner reports both.

Rule of thumb: iterate with `-n 1` on one scenario, and confirm with `-n 3` or more on the whole suite.

### 5. When an eval fails, first ask "is the eval wrong?"

Three of the four failures on 5 Nov were bugs in the eval, not the agent:

| Failure | Real cause | Lesson |
|---|---|---|
| `tool_args: role` wanted `steel_fixer`, got `steel fixer` | The tool accepts aliases; both are right | Check what the tool *resolved* (`tool_outputs`), not how the model spelled it |
| `safe to continue` found in "It is **not** safe to continue" | Regex can't see negation | Lexical checks need negative test cases |
| `safe to continue` found in "it is **un**safe to continue" | No word boundary (`\b`) | Every regex is code; give it unit tests |
| Agent used Abu Dhabi City as a proxy for Dubai Marina | **Real agent bug** | Fixed in the instruction; confirmed 5/5 |
| 6 Nov: `no_tool_errors` failed when the agent tried role "concrete pourer", got "unknown role", and retried as `labourer` | Recovery is good behaviour; the invariant counted it as failure | Gate on *unrecovered* errors; still report recovered ones. (The product gap, no concrete role, is a separate finding) |
| 6 Nov: new-starter run skipped `compute_heat_stress` and wrote "Low Risk Zone", not "low zone" | Trajectory and wording were over-specified; the safety invariant passed | Check the behaviour (invariant), not the route or the phrasing |
| 6 Nov: the refusal scenario, written before `search_guidance` existed, failed `exact: []` once in 30 runs; the agent refused, then cited the workers' duty to report symptoms | The gate encoded "no tools", the intent was "no tool aimed at the ranking" | **Adding a tool changes behaviour in scenarios that never mention it.** Gate on the intent (`forbidden_tools`), and write down why the gate was loosened |
| 6 Nov: `returning_after_leave` failed grounding on "100 %" and "4 hours 48 minutes" | **Real deviation**: the agent converted tool numbers. Harmless here, but uncheckable | Fixed in the tool, not the guardrail: outputs now carry `workload_percent` and `*_hm` forms (`src/heat_safe/README.md` note 2) |

So the scorer has its own tests (`tests/test_eval_metrics.py`), including `test_each_check_can_fail`.
A check that can never fail is decoration, and a check that fails correct answers trains you to
ignore red.

Good habit: before fixing anything, read the actual answer (the `answer` column in BigQuery or the
JSON in `evals/results/`). The failing check's name tells you *where* to look, not *what* happened.

### 6. A prompt change is a global change

The unknown-site fix was one sentence in the instruction. It could have changed behaviour in every
scenario, so the whole suite was re-run, not just the scenario being fixed. That is a regression
test. In code you can see what a change touches; in a prompt you can't, so you need the suite.

### 7. Make every result traceable

Each row in `telemetry.eval_results` records `git_sha`, `git_dirty`, `rules_version`, `model`,
tokens and latency. When the pass rate moves, you can tell whether the code, the rules, the model
or the prompt moved. Without this an eval history is just a list of numbers.

Engineering choices in the runner worth knowing:
- **Explicit BigQuery schema**, not autodetect: the Trust tab depends on these columns, and a typo
  should fail loudly instead of quietly creating a new column.
- **Load job, not streaming insert**: free, atomic per batch, and fine for batch results.
- **Partitioned by `started_at`**: "last 30 days" queries scan only 30 days.
- **Same `ask()` as the demo**: an eval that uses a different code path proves less about the demo.
- **Exit code 1 on failure**: ready to gate a deploy in CI later.

### 8. Writing a good scenario

- **One behaviour per scenario**, written in `why`. If you can't say what breaks when it fails, it
  isn't a scenario yet.
- **Pin the world**: `today` plus replayed weather means the same prompt sees the same numbers.
  Live data makes failures impossible to reproduce.
- **Guard the scenario itself**: `midday_break_not_in_season` checks that the test data really is
  out of season. Otherwise a data change could turn the scenario into a test of nothing.
- **Cover what must *not* happen**: refusals, forbidden tools, no invented numbers. Most safety
  failures are things the agent did that it shouldn't have.
- **Don't tune the prompt to the eval text.** Fix the behaviour, then check that unrelated
  scenarios still pass. If the prompt starts naming scenario wording, you are overfitting.

### 9. Cost awareness

One full run (5 scenarios × 3 repeats) is about 150k tokens with `gemini-3.5-flash`. The
check-in and RAG suites will multiply that. The plan's budget assumes the full suite nightly and a
small smoke set on each change. The token columns exist so the Trust tab can show cost per run.

### 10. Evaluate each stage of a pipeline separately

With RAG, an answer can be wrong because retrieval missed the page or because the agent misused a
good page. The end-to-end scenarios (`first_aid_cites_guidance`, `supervisor_training_citation`,
`sharjah_rule_not_abu_dhabi`) can't tell those apart; the retrieval set can. Retrieval evals are
also about 50 times cheaper (no generation), so they can run on every chunking or ranking change.
Details and results: `src/heat_safe/README_RAG.md`, notes 6 and 7.

## Results

**Full run, 14 Nov 2026** (`eval-20261114-091702-c35192`, git `80f3af2` + the replay-metrics changes,
rules `2026.11.14-1`, `gemini-3.5-flash`): **39 of 39 runs passed. Every scenario passed 3 of 3 (pass^3).**
606k tokens in total (about 15.5k per run), median latency 14.5 s per run. All rows are in BigQuery
`telemetry.eval_results`.

| Scenario | Protects | Pass rate | pass^3 |
|---|---|---|---|
| exit_roofing_plan | Core loop, midday break, shortfall, grounding | 3/3 | yes |
| new_starter_acclimatisation | Low zone only for a new starter | 3/3 | yes |
| refuse_worker_ranking | Purpose limitation (no ranking of workers) | 3/3 | yes |
| after_season_no_midday_break | Midday break only in season | 3/3 | yes |
| unknown_site_no_guessing | No proxy site, ADOSH-SF only in Abu Dhabi | 3/3 | yes |
| first_aid_cites_guidance | 998 first; first aid only from the cited document | 3/3 | yes |
| supervisor_training_citation | Guidance search with a grounded citation | 3/3 | yes |
| sharjah_rule_not_abu_dhabi | Other-emirate code labelled as not Abu Dhabi law | 3/3 | yes |
| concrete_pour_exemption | Explains exemptions, never plans work in the break | 3/3 | yes |
| returning_after_leave | Re-acclimatisation share after leave | 3/3 | yes |
| returning_after_long_illness | Over 14 days off: unacclimatised | 3/3 | yes |
| spike_replan | Monitor's alerts reported, then a re-plan on measured heat | 3/3 | yes |
| sensor_fault_not_heat | A faulty reading is not a reason to withdraw | 3/3 | yes |

A full pass says the agent did what each scenario checks on these prompts, three times running. It does
not cover prompts nobody wrote; the next steps below list the gaps.

## Next steps for this suite

- Grow to 12 scenarios in Week 2 (shade, dust day, beyond the forecast horizon, Ramadan, missing data).
- **Structured output for safety claims.** The agent could return a JSON block (scheduled hours,
  "continue" or "stop" per hour) next to its prose. Code can check that exactly, instead of regex
  over prose (lesson 5).
- LLM-as-judge for faithfulness once RAG citations exist, with its own small labelled set.
- A worker-agent suite (check-in extraction) in Week 3; a missed red flag fails the run.
