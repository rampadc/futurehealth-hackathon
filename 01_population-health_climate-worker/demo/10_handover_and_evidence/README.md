# 10. Explain what happened and what remains open

The incoming supervisor needs the state of the same case used in scenarios 02–04: the civil hold, workshop reassignment and supplier-confirmed delivery change.

**Demonstrated value:** Produce an inspectable handover that preserves unresolved work instead of writing a misleading success summary.

## Walkthrough

1. Load the connected case or its explicit standalone evidence snapshot.
2. Show the alert reference and separate recorded actions from recommendations.
3. Summarise the supplier-confirmed slot without describing it as a completed delivery.
4. Highlight that exposed civil work is still held and identify the outstanding measurement and permit review.

## Expected result

The handover references existing case evidence, reports the delivery state accurately and retains the open safety items.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heavy_hold, p_restart`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
