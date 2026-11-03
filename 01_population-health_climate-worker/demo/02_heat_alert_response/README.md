# 02. Respond to the local heat trigger

The civil crew is working in the exposed area. Its local simulated TWL crosses the fictional heavy-work hold threshold. Other work fronts have separate measurements.

**Demonstrated value:** Connect a measurement to an accountable response without confusing an alert with completed action.

## Walkthrough

1. Show the new local reading and its measurement time, quality and source.
2. Show the derived heavy-task hold and the exact fictional policy behind it.
3. Step through foreman acknowledgement, confirmation that work stopped, and the recorded recovery headcount.
4. Keep the task held; acknowledgement and recovery do not authorise a restart.

## Expected result

The hold is acknowledged, cessation is confirmed and recovery is recorded. The case remains open.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heavy_hold, p_heat_program, p_restart`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
