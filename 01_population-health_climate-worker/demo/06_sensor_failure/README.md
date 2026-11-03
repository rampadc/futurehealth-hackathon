# 06. Treat missing local information as unknown

Sandline's existing civil-area monitor and beacon lose a reliable local input. The electrical-area instrument still reports a current reading, creating a tempting but invalid shortcut under programme pressure. P03 and C01 use the manual verification and protective route while P02 arranges local assessment; P01 can review any actual delay later. The crew needs an honest statement that the civil conditions are unknown.

**Demonstrated value:** Make uncertainty explicit and avoid interpreting nearby or historical data as current local conditions.

## Walkthrough

1. Show which instrument and zone are affected, while retaining the last reading as historical.
2. Try to use the electrical-area reading to clear civil work; reject the cross-zone substitution.
3. Advance replay time until the old local reading is stale.
4. Keep affected work subject to the manual-verification workflow rather than displaying an all-clear.

## Expected result

Both inappropriate clearance attempts are rejected. A new verified local measurement and the required human review are still needed.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_stale, p_restart`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
