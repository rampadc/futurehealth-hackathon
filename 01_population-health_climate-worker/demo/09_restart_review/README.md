# 09. Require current evidence at restart

A civil task starts in a held state. An improved local reading is available, but improvement alone does not authorise resumption.

**Demonstrated value:** Prevent an earlier review from becoming a reusable permission that overrides changed conditions.

## Walkthrough

1. Attempt to resume without the required human review and show the rejection.
2. Review the task and current prerequisites; record the authorised supervisor’s decision.
3. Show the authorised resumption only while current conditions satisfy the configured gates.
4. Demonstrate the stale-reading branch and the separate validation regressions for failed sensors and the midday restriction.

## Expected result

A valid reviewed restart is distinct from a blocked stale attempt. Mandatory restrictions are rechecked at the action time.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_restart, p_stale, p_midday`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
