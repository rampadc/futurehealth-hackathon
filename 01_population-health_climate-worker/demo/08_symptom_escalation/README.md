# 08. Respond to a person, not just a sensor

A worker reports dizziness while the current local TWL does not trigger the fictional environmental hold. This is a separate incident branch, not part of the main connected demonstration. The existing first-aid route takes priority over the beacon band, and minimal shared detail protects the worker from a performance label. Any wage or absence question belongs to Dune's employer process, not the crew event log.

**Demonstrated value:** Avoid reassuring a symptomatic worker merely because no environmental threshold was crossed.

## Walkthrough

1. Display the minimal symptom report; do not infer a diagnosis.
2. Remove the person from the active task and invoke the approved first-aid route.
3. Show the trained responder’s recorded action separately from the initial report.
4. Retain follow-up as unresolved where the fixture does not establish completion.

## Expected result

The response route and first-aid evidence are recorded. No medical clearance or invented diagnosis is produced.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_symptoms`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
