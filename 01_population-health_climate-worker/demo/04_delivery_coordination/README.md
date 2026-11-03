# 04. Coordinate across organisational boundaries

The held civil work affects the plan for the aggregate delivery. The principal contractor can request a new slot, but the supplier must accept it; the assistant cannot commit the supplier.

**Demonstrated value:** Keep draft, approval, transmission and external confirmation distinct across contractor and supplier teams.

## Walkthrough

1. Show the original delivery booking and the reason a timing change is proposed.
2. Review the draft request and the logistics coordinator’s approval.
3. Show the simulated outbound request as sent, still awaiting acceptance.
4. Advance to the supplier reply; only then display the new slot as confirmed.

## Expected result

The supplier has confirmed a revised booking. Delivery has not physically occurred, and the booking does not clear future work conditions.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heat_program`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
