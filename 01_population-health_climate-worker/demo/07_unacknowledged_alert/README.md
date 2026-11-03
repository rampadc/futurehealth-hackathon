# 07. Escalate a response that has no owner acknowledgement

The existing civil beacon and radio route have raised a local heat hold, but C01's response is missing from the manual register. Radio congestion or an omitted entry are plausible; the gap is not proof that the crew ignored the instruction. P02 is the site escalation contact and verifies the crew's actual state. P01 reviews any later disputed interval only after the times are reconciled.

**Demonstrated value:** Reveal an unattended response and route it to a defined accountable person.

## Walkthrough

1. Show the open alert and its age.
2. Advance the explicit replay timer past the fictional acknowledgement window.
3. Show escalation to P02 with the original task, evidence and outstanding actions.
4. Keep acknowledgement and confirmed cessation unresolved; escalation is not proof of either.

## Expected result

The superintendent is escalated to; the task remains held and crew response is not falsely marked complete.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heavy_hold, p_escalate`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
