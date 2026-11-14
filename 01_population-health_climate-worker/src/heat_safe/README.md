# `heat_safe`: risk core and guidance search

| File | Role |
|---|---|
| `rules.py`, `twl.py`, `thermal.py`, `heat_stress.py`, `schedule.py` | Deterministic risk core: TWL, zones, midday break, scheduler |
| `acclimatisation.py` | Who counts as acclimatised today, and their share of a full workload (from dates) |
| `README_WORKER_RISK.md` | **Spec for `compute_worker_risk`** (not built yet): the six layers, band vs reminder vs alert, the 1 Aug walkthrough, clothing values (`rules.CLOTHING`) |
| `forecast.py`, `sites.py`, `job_profile.py` | Inputs: weather, sites, roles |
| `grounding.py` | Output guardrails: numbers and page references must come from tool outputs |
| `agent_tools.py` | The agent's tools: thin wrappers with the same names as the core functions |
| `corpus.py`, `guidance.py` | Guidance search (RAG): **see [`README_RAG.md`](README_RAG.md)** for the design, reading order and learning notes |
| `gcp.py` | Fail-fast credentials check |

## Risk core learning notes

The full set (TWL, fail-safe, scheduler, grounding) is still to be written. This one comes from 6 Nov.

### 1. When the documents disagree, decide once, in code, and write down why

"When does a new starter count as acclimatised?" has no single answer in the binding documents:

| Source | Says |
|---|---|
| ADOSH-SF CoP 11.0 §3.2(b)(i), p. 7 | "allowance of 5-7 days for acclimatization before starting hard work" |
| ADOSH-SF TG §3, p. 6 | New employee: 20/40/60/80/100% of a full workload, so 100% on day 5 |
| ADOSH-SF TG §5.1, p. 10 | Full acclimatisation "takes over two weeks" |
| ADOSH-SF TG Table 1 note b, p. 5 (an image) | "Unacclimatised workers are defined as new workers or those who have been off work for more than 14 days due to illness or on vacation leave" |

Before 6 Nov the agent passed `acclimatised=true/false` itself. So **the model** was choosing between
these readings, differently from run to run. In one answer it said a day-5 roofer was at "100%"
and then still restricted them. A safety cutoff chosen by the model is not a cutoff.

The fix (option B, chosen by the team):
- **New starters may work only in the Low zone through day 7**, the protective end of the binding
  "5-7 days", at the TG day-by-day workload share.
- **Returning workers follow the TG re-acclimatisation table** for their workload, and anyone off
  **more than 14 days** is unacclimatised (note b), so Low zone only for 7 days, like a new starter.

It lives in three places, each doing one job:
- **`rules.py`** holds the numbers, with the sources and the reasoning in comments, and a new `RULES_VERSION`.
- **`acclimatisation.py`** turns dates into a status. The model converts "started on Monday" to a
  date, but **never counts days or decides**: date arithmetic is code.
- **`schedule.py`** blocks hours outside the Low zone and caps total work at the share. It reports the
  result in its output and checks it with an invariant (`within_acclimatisation_share`).

Three things worth copying:
- **Reading the documents properly found a hidden gap.** The old rule ("off > 14 days = unacclimatised")
  gave 100% to someone back after 10 days. The TG table says 80% from 6 days away. Old code that
  passed every test was less protective than the source it cited.
- **Then I made the opposite mistake.** The 14-day rule's comment cited "Table 1 note b". Table 1 is an
  image, so text extraction couldn't see the note, and I treated the citation as unverifiable and
  replaced the rule. Rendering the page (`pdftoppm -f 5 -l 5 -png`) showed note b is the *official
  definition* of unacclimatised. For about an hour, workers back after more than 14 days could be
  scheduled in the High zone (at reduced workload) against a binding rule. No test caught it, because
  the tests encoded my reading. **If you can't see a source, look harder (render it, open it); never
  treat "can't verify" as "not there".** And when replacing a rule, find out why it existed first.
- **Interpretations are labelled as interpretations.** The TG says "R/E, reduced expectations" without
  a number; `REDUCED_EXPECTATIONS_SHARE = 0.80` says in its comment that it is our reading. Where the
  TG's rows overlap (6-12 and 12-20 days), 12 goes to the stricter row, and that is written down too.
  Both, plus "returning workers are not limited to the Low zone", are listed for review with an
  occupational health and safety advisor.
- **Every boundary has a test** (`tests/test_acclimatisation.py`): day 7 vs 8, 3 vs 4 days away, 11
  vs 12, 20 vs 21, the illness column, and invalid input. The test names say *why*, e.g.
  `test_ten_days_leave_is_now_reduced_where_the_old_14_day_rule_gave_100_percent` and
  `test_off_more_than_14_days_is_unacclimatised_per_table_1_note_b`.

### 2. Give the model numbers in the form it will say them

The first eval run of option B failed 2 of 3 `returning_after_leave` runs on numeric grounding. Neither
number was wrong: the agent turned `workload_share: 0.8`-style fields into "100 %", and 288 minutes
into "4 hours 48 minutes". Both are conversions, which the instruction forbids, because a converted
number can't be checked against the tool output. (The crew's "5 hours 20 minutes" passed only by
coincidence: "20 min" appears in the work/rest column.)

There were two ways to make it pass:
- **Loosen the guardrail** (allow percentages of fractions, minutes from hours). That makes it weaker
  for every answer, to fix one.
- **Change the tool output** to carry the forms people say: `workload_percent: 80` and
  `work_scheduled_hm: "4 h 48 min"`. The model then copies instead of calculating, and the guardrail
  stays strict.

We took the second. **When a model keeps doing arithmetic, give it the answer instead.** It is the
same principle as moving thresholds out of the prompt: anything code can compute, code should.

### 3. A heat spike runs two loops at different speeds (13–14 Nov)

A forecast describes each hour with one value. A sensor on site can show it is hotter than that, so
the plan has to change during the shift. That needs two loops:

```
sensor reading ─► sensor.measured_twl ─► spike.adjust_for_observation   FAST: every reading, no LLM
                                            continue / tighten / rest_now / sensor_fault / withdraw + alert
             └──► sensor.apply_measurements ─► schedule.optimise_schedule(from_hour, already_worked_minutes)
                                                                         SLOW: re-plan the rest of the day
```

| File | Role |
|---|---|
| `spike.py` | Fast loop. A pure function: one reading and a small state in, one decision out. Only ever stricter than the plan |
| `sensor.py` | Measured TWL (same model as the forecast), conversion of readings for the fast loop, forecast correction, synthetic feed, `replay_fast_loop` |
| `schedule.py` | `from_hour` and `already_worked_minutes`: re-plan without touching past hours or exceeding the acclimatisation share |
| `tools/replay_heat_spike.py` | The demo: morning plan, then the alerts during the spike, then the re-plan |
| `rules.py` | `STEP_DOWN_AFTER_MINUTES`, `SENSOR_MAX_CHANGE_C_PER_MIN` and `SENSOR_BIAS_FADE_HOURS`: design choices, not ADOSH-SF |

What the replay day taught us:
- **An hourly forecast is not the whole hour.** Even without the synthetic spike, the shade sensor
  drifts into High during the 10:00 hour as the air heats towards 11:00, while the forecast says
  Medium (122.8). That is the case for site sensors in the pitch.
- **The spike had to be placed with care.** In the sun, 07:00–17:00 is already High (the TWL floor), so
  a spike changes nothing there. After 10:00 a +3 °C spike crosses the 44 °C withdrawal limit. The demo
  spike is 08:15–09:15 for a crew in shade, where the plan assumed Medium.
- **Raise fast, lower slowly; a bad input moves toward safety.** A stricter zone applies from the first
  reading and is lifted only after 30 minutes of better readings (15 until 14 Nov; see `rules.py`). An implausible jump is a fault: it
  raises the zone by one and alerts, but it never triggers a withdrawal and never relaxes anything.
- **The correction is one-sided.** Hotter than forecast lowers the next hours' TWL (fading over 3 hours).
  A cooler reading never raises it.
