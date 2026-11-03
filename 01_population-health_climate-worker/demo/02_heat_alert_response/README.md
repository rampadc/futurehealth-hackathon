# 02. Respond to the local heat trigger

The civil crew is working in the exposed area. Sandline's existing local monitor drives a beacon when its simulated TWL crosses the fictional heavy-work hold threshold. The open decision is whether the instruction reached the crew and what happened next. Dune's output pressure makes the stop costly, but P02's site authority and C01's protective action do not wait for a commercial settlement or for a worker to refuse the task. Workers retain their independent route to report symptoms or unsafe work.

**Demonstrated value:** Connect an existing alert to P02's authorised instruction, C01's actual stop, recovery and a separate commercial owner without confusing any of those steps.

## Walkthrough

1. Show the new local reading and its measurement time, quality and source.
2. Show the derived heavy-task hold and the exact fictional policy behind it.
3. Step through foreman acknowledgement, confirmation that work stopped, and the recorded recovery headcount. C01 can explain the fictional Heat Rest Schedule's ordinary-shift scope; the log does not prove payroll payment.
4. Route the unresolved Dune/Sandline cost question to P01. Keep the task held; acknowledgement, recovery and pay discussion do not authorise a restart.

## Expected result

The hold is acknowledged, cessation is confirmed and recovery is recorded. The case remains open. Worker pay questions follow Dune's employer channel; no subcontract or client reimbursement is inferred.

The machine-readable assertions, deliberate rejections and forbidden actions are in [expected_outcomes.json](expected_outcomes.json). Policy references: `p_heavy_hold, p_heat_program, p_restart`; see the shared [SOP](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json).

## Inputs and replay

Load the shared [baseline](../cross-scenario/baseline_state.json), apply `initial_overrides` from [scenario.json](scenario.json), then process [signals.jsonl](signals.jsonl) in recorded order. The timestamps are simulation time on 4 August 2025 (`+04:00`), not a command to wait in real time. See [example_interaction.md](example_interaction.md) for an illustrative dialogue.

All people, readings and actions are fictional. This demonstrates workflow behaviour, not clinical effectiveness, actual supplier communications or production safety approval.
