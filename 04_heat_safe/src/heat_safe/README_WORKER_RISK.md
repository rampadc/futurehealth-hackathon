# `compute_worker_risk`: one worker's band, every hour (spec)

**Status, 7 Nov 2026:** this is the specification to build against.
- **Built:** the clothing ensembles (`rules.CLOTHING`, `tests/test_clothing.py`), acclimatisation
  (`acclimatisation.py`) and the site heat stress (`heat_stress.py`) it combines.
- **Not built yet:** `compute_worker_risk` itself, the planned-baseline table, the alert rules.

The tests listed under "Executable spec" come first, then the code that makes them pass.

## Why it exists

`compute_heat_stress` is **site-level**: "Mussafah at 05:00 is in the Low zone" is the same for
everyone. But two workers side by side can be at very different risk. `compute_worker_risk` combines
the site's heat with what is true about one person, and gives a band per worker per hour. It then
rolls the bands up per crew. It is pure code, like the rest of the risk core: no LLM decides a band.

## Three separate things: band, reminder, alert

On 1 Aug 2025 the whole crew is in the High zone from 07:00 to 17:00. The ADOSH-SF TG allows planned
work there (20 min work / 40 min rest), and `optimise_schedule` plans it. If "Red" meant "stop", either
nobody would work all day, or workers would get the same ignored "stop" alert every 15 minutes.
**Alert fatigue is a safety failure in itself.** So the design separates three things:

| Concept | What it is | How the worker sees it |
|---|---|---|
| **Band** (state) | Green / Amber / Red / Emergency, per worker per hour, from the six layers below | Always visible, like a weather icon. Never pushed on its own |
| **Reminder** (planned) | The plan's own controls: "rest now, 40 min", "drink a cup" at the cycle times | On schedule, low urgency, generated from the stored plan |
| **Alert** (event) | Something **changed, or went beyond what the plan assumed** | Pushed at once: voice or SMS to the worker, a line on the supervisor board |

**Alert triggers** (and only these):

| # | Trigger | Worker template | Supervisor |
|---|---|---|---|
| 1 | Band rises above the band the plan assumed for this worker and hour | **Stop work now**, shade, drink, tell your supervisor | Remove from heat, check in within 10 min |
| 2 | A new risk factor the plan did not know: low fluid intake, symptoms at a check-in, rising strain | **Stop work now** (strain, symptoms) or **Drink now** (fluid) | Same, with the factor named (not the health detail) |
| 3 | Withdrawal limit reached (`WITHDRAWAL_DRY_BULB_C`, `WITHDRAWAL_WET_BULB_C`) | **Stop work now**, everyone | Withdraw the crew |
| 4 | An input lost (wearable, site sensor, stale forecast) | none | "Check W09 in person: wearable data lost" |
| 5 | Red-flag symptom (confusion, collapse, vomiting, stopped sweating) | **Emergency**: call for help, buddy stays | **Call 998**, start cooling |

Notes on the triggers:
- **Trigger 2 is "a new factor", not "a higher band".** At Red the band can't go higher (only
  symptoms reach Emergency). So a "higher number" rule would stay silent for a Red worker who
  reports drinking almost nothing.
- **Rate limit:** the same alert to the same person at most once per 30 minutes. Emergency is never
  rate-limited.
- **The Red band template** (shown, not pushed) becomes: "High risk: follow your work/rest times,
  drink every 15 minutes, stop and tell your supervisor if you feel unwell".

**The plan becomes the baseline.** Triggers 1–2 need to know what the plan assumed, so plans are
stored. That gives a planned-baseline table, one row per worker per hour:

| Column | Example |
|---|---|
| `plan_id`, `worker_id`, `site`, `hour` | `p-0731-a`, `W09`, `mussafah`, `2025-08-01 05:00` |
| `planned_band`, `planned_zone` | `RED`, `high` |
| `scheduled_work_minutes`, `low_zone_only`, `workload_share` | `20`, `false`, `1.0` |
| `assumed_clothing`, `assumed_modifiers` | `coveralls_over_work_wear`, `[]` |
| `rules_version`, `created_at` | `2026.11.07-1`, ... |

This also connects the two halves of the system: the supervisor agent's plan is what the risk monitor
compares the live day against.

## The six layers

Each layer can only **raise** the band, never lower it:

```python
if not clothing.in_twl_model:                             # vapour-barrier suit: no TWL is valid
    band = RED                                            #   "special controls" (cooling garment, short exposures)
else:
    band = zone_band(twl(site_weather, clothing.icl))     # L1 environment + L2 clothing/PPE
band = band.raised(len(active_modifiers))                 # L3: +1 per modifier, capped at Red
if wearable_ok:
    band = max(band, strain_band(hr_trend))               # L4 physiology adds caution, never removes it
if missing_inputs:
    band = band.raised(1)                                 # L5 fail-safe: unknown is treated as worse
if red_flag_symptoms:
    band = EMERGENCY                                      # the only way to Emergency
crew_band, crew_share = max(bands), share_at_or_above(AMBER, bands)   # L6
```

| Layer | Input | Source of the rule | Status |
|---|---|---|---|
| L1 Environment | Site TWL for the hour (sun or shade) | ADOSH-SF TG Table 1, `rules.twl_zone` | Built |
| L2 Clothing/PPE | The worker's ensemble → `icl` for TWL | NIOSH Table 3-1 as a difference (`rules.CLOTHING`) | Built (values) |
| L3 Modifiers | Acclimatisation, low fluid, check-in symptoms, cumulative dose, Ramadan fasting, respirator on a dust day | ADOSH-SF CoP/TG; plan "Risk model" | Acclimatisation built; rest not |
| L4 Physiology (consent only) | HR, skin temperature → strain trend | Plan: ECTemp-style estimate → PSI | Not built |
| L5 Fail-safe | Missing or stale inputs | Plan: environment band + 1 | Only "missing weather → Red" built |
| L6 Crew | All bands | Plan: highest band + share at Amber or above | Not built |

`Band.raised()` (in `rules.py`) already caps at Red. **The whole function is monotonic**, which is its
main safety property: adding a modifier, or losing an input, can never make anyone safer on paper.
That gets a property test: for any worker, adding a modifier never lowers the band.

## Clothing values (decided 7 Nov)

| Ensemble | `icl` (clo) | WBGT adj. | Source |
|---|---|---|---|
| `work_wear` (default) | 0.6 | 0 | TWL baseline (Brake & Bates), = NIOSH "shirt, pants" 0.75 |
| `cloth_coveralls` | 0.65 | 0 | NIOSH 3-1 "shirt, coveralls" 0.80 → +0.05 |
| `coveralls_over_work_wear` | 0.95 | 3 | NIOSH 3-1 "shirt, pants, coveralls" 1.1 → +0.35; 3-2 double-layer cloth |
| `vapour_barrier` | outside model | 11 | NIOSH 3-2; TWL assumes sweat can evaporate |

There's no binding Abu Dhabi value. The ADOSH-SF TG (p. 11) only says PPE "may increase the risk of
heat stress", so these are labelled interpretations, on the OHS review list.

## Walkthrough: Mussafah, 1 Aug 2025 (real weather, synthetic crew)

| ID | Role | Acclimatisation | Clothing | Consent |
|---|---|---|---|---|
| W03 | Steel fixer | acclimatised | `work_wear` | check-ins + wearable |
| W07 | Roofer | new starter, day 5 (started 28 Jul) | `work_wear` | check-ins only |
| W09 | Welder | acclimatised | `coveralls_over_work_wear` | check-ins + wearable |

**31 Jul evening (built):** the supervisor plans with the supervisor agent. W07 is passed as
`new_starter_since=2025-07-28` and limited to Low-zone hours. The plan rows go to the
planned-baseline table.

**05:00:** site TWL in the sun is 144, Low. The site view says everyone is Green.

| | L2 own TWL (zone) | L3 | Band | Alert? |
|---|---|---|---|---|
| W03 | 144 (Low) | none | Green | no |
| W07 | 144 (Low) | new starter +1 | Amber | no: the plan assumed it |
| W09 | **112 (High)** | none | Red | **only if the plan assumed work wear** (trigger 1). A plan that knew about the coveralls already moved the welding |

The crew band is Red, with 2 of 3 at Amber or above. This is the Week 2 exit test: same air, three
answers. (These TWL values are pinned in `tests/test_clothing.py`.)

**06:00:** the site is Medium (126). W07 is Medium + new starter → Red, but `optimise_schedule` already
kept W07 out of this hour (Low zone only through day 7), so there's no alert. The band and the plan
agree because both come from `rules.py`.

**07:00–17:00:** everyone is in the High zone in the sun (TWL 60–87). Red was planned, so workers get
only the 20/40 reminders. On a day this extreme, the weather dominates and layers 2–4 stop separating
people. **Individual risk matters most at the edges of the day and on moderate days**, and the backtest
should show that, not hide it.

**15:30:** W07's voice check-in (Malayalam): "two bottles since morning". The worker agent extracts
`water_l: 1.0`; the monitor compares that with the TG fluid rate for the hours worked → a low-intake
factor → **alert (trigger 2): "Drink now"**. The band stays Red; the factor is new.

**16:00:** W09's heart rate has risen for 40 minutes at the same workload → **alert (trigger 2): "Stop,
cool down"**. **16:30:** W09's wearable disconnects → **supervisor alert (trigger 4)**.

**17:10:** W07 reports "dizzy… confused". The red flag → **Emergency (trigger 5)**:
- W07 gets the Malayalam template;
- the board shows "W07: Emergency, call 998";
- the supervisor agent's service account cannot read the check-in, so it never sees "confused".

**The day's result:** four alerts and one emergency, each one meaningful, instead of an alert every
15 minutes.

## Executable spec: tests to write first

| Test | Walkthrough moment |
|---|---|
| `test_same_air_three_bands_at_0500` | W03 Green, W07 Amber, W09 Red; crew Red, share 2/3 |
| `test_planned_red_sends_reminders_not_alerts` | 07:00–17:00 |
| `test_new_factor_at_red_alerts_although_band_cannot_rise` | 15:30 low intake |
| `test_lost_wearable_raises_and_tells_supervisor` | 16:30 |
| `test_red_flag_is_emergency_and_never_rate_limited` | 17:10 |
| `test_vapour_barrier_is_red_with_special_controls_without_twl` | out-of-model PPE |
| `test_adding_any_modifier_never_lowers_the_band` | monotonic property, over all combinations |
| `test_supervisor_view_has_band_and_action_only` | no symptoms, vitals or check-in text |

## Open questions (OHS advisor review)

- **Clothing:** the NIOSH difference method; `icl_perm` (permeability) per ensemble has no source yet, so
  every cloth ensemble keeps 0.45. Candidates: Brake & Bates (2002) or ISO 9920.
- **Limited-use SMS or polyolefin coveralls:** NIOSH gives WBGT adjustments (0.5 and 1 °C) but no clo.
  Not modelled until sourced.
- **Low fluid:** the threshold against the TG fluid rates (litres per hour by zone) and how to judge a
  self-reported volume.
- **Rate limit:** 30 minutes is a starting value, not a sourced one.

## Reading order (the built parts)

| # | File | Lines | Question to answer |
|---|---|---|---|
| 1 | `rules.py` | `class Band` | How does `raised()` make "only up, never to Emergency" a property of the type? |
| 2 | `rules.py` | Clothing section | Why a difference from NIOSH work wear, and not NIOSH's absolute clo? |
| 3 | `twl.py` | `thermal_work_limit` clothing lines | Where do `icl` and `icl_perm` enter the heat balance? |
| 4 | `tests/test_clothing.py` | all | Which test would fail if someone set coveralls to NIOSH's raw 1.1? |
| 5 | `acclimatisation.py` | all | Which layer-3 modifier is already built, and what does it return? |
| 6 | This file | alert triggers | Which trigger fires for W09 at 05:00, and when does it not? |

## Exercises

1. Run `test_replay_day_0500_same_air_three_zones`. Then change `cloth_coveralls` to NIOSH's raw
   0.80 clo and run it again. What zone does 05:00 become, and why is mixing scales the bug?
2. In a Python shell, compute 05:00 TWL for `icl` from 0.60 to 0.70 in steps of 0.01. At which value
   does it cross 140? What does that say about precision near a zone boundary?
3. Write `test_adding_any_modifier_never_lowers_the_band` before the function exists, against a stub
   `compute_worker_risk` that returns Green. Watch it fail for the right reason.

## Learning notes

### 1. Separate state from events, or the alerts become noise

The first design had one word, Red, meaning both "conditions are High zone" and "stop now". Writing
out a real day showed the problem: Red is planned for 10 hours on 1 Aug, so "Red → alert" fires all
day. Safety systems in other fields (hospital monitors, aviation) learned this the hard way: people
stop responding to alarms that are usually expected. The fix is a pattern: **show the state, push the
events**, and define an event as a deviation from an expected baseline. Here the baseline is the stored
plan.

### 2. Don't mix scales from two sources; anchor to your model and take differences

Our TWL baseline is 0.6 clo (Brake & Bates convention, validated by `tests/test_twl.py`). NIOSH says
ordinary work wear is 0.75. Using NIOSH's 1.1 for coveralls directly would add 0.5 clo, of which 0.15
is just the two sources disagreeing about the same shirt and trousers. So the table takes NIOSH's
*difference* (+0.35) and adds it to our baseline. Work wear stays exactly where it was, which
`test_work_wear_is_the_twl_baseline_so_existing_results_do_not_change` guards.

### 3. Zone boundaries amplify small inputs

Cloth coveralls are only +0.05 clo, yet 05:00 goes from 144 to 139 W/m², from Low to Medium, and so from
"new starter may work" to "new starter may not". Near a threshold, an input's small uncertainty becomes
a different decision. That's why the clothing values carry sources and tests, and why "PPE unknown" uses
the role's typical ensemble and *says so*, rather than silently assuming the lightest.

### 4. Know where your model stops being valid

TWL is a heat-balance model that assumes sweat evaporates through clothing. A vapour-barrier suit
breaks that assumption, so any TWL number would be precise and wrong. Outside a model's validity range,
**don't extrapolate: fail safe and say why** (Red, "special controls"). It's the same rule as "missing
weather → Red", applied to a different unknown.

### 5. At a cap, triggers must look at causes, not levels

The bands cap at Red, so "alert when the band rises" is silent for a worker already at Red who reports
drinking almost nothing. Trigger 2 fires on a *new factor*, whatever the band. Whenever a scale
saturates, check what your rules can no longer see.
