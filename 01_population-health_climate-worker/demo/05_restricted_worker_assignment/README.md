# 05. Respect mobilisation restrictions

C13 and C14 are newly mobilised civil workers. Their baseline assignment is supervised light work. An attempted assignment to exposed heavy work conflicts with their restrictions.

**Demonstrated value:** Catch an assignment mistake before work starts, without disclosing a diagnosis or a full HR record.

## Walkthrough

1. Display the proposed assignment and only the operational restriction needed for the decision.
2. Reject the heavy-task proposal and explain the restriction.
3. Confirm that the supervised light assignment remains in place.

## Expected result

The prohibited assignment is rejected and the original suitable assignment is preserved.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heat_program, p_twl_assumptions`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
