# 03. Find an alternative that actually fits

The civil work remains held. A supervisor proposes sending the whole civil crew to the covered workshop. Two existing occupants leave only four places, and only a subset has the relevant preparation skill.

**Demonstrated value:** Prevent an attractive but impossible suggestion and preserve a consistent picture of where people are assigned.

## Walkthrough

1. Load the held-work state from scenario 02, or the standalone starting snapshot.
2. Try the whole-crew move and display the capacity and qualification reasons for rejection.
3. Review the four eligible civil workers C05–C08 for the lightweight preparation task.
4. Show that their old assignments and recovery occupancy are released on reassignment; the remaining crew does not disappear.

## Expected result

Four qualified workers are assigned without exceeding workshop capacity or double booking. Exposed civil work remains held.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heavy_hold, p_restart`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
