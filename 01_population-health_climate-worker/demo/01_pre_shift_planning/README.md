# 01. Plan before conditions change

The superintendent reviews the exposed civil task and the booked aggregate delivery. A synthetic forecast suggests a hot period, but it is not a measurement of either work front.

**Demonstrated value:** Earlier preparation and a clear distinction between planning information and current exposure.

## Walkthrough

1. Open the work plan and forecast together; identify the civil task and delivery dependency.
2. Show an advisory to review timing with the foreman and logistics coordinator.
3. Keep existing permissions unchanged: a forecast alone neither clears nor prohibits work.

## Expected result

A planning recommendation exists, with its assumptions visible. No actual rescheduling or supplier agreement is claimed.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heat_program, p_twl_assumptions`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
