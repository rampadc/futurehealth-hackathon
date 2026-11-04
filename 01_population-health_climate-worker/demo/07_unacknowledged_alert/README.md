# 07. Follow up when an alert has no acknowledgement

Sandline's civil-area monitor reports a valid 145 W/m² reading at 8:00 a.m., reaching the heavy-work hold band. Maya Al Qamar records the civil hold at 8:01 a.m. The beacon and radio route have raised the issue, but Huda Al Nadir, the civil foreman, has not acknowledged it in the register. A crowded radio channel or an omitted entry could explain the gap. The missing acknowledgement does not prove that the crew ignored the instruction, and it does not prove that work stopped.

## Follow the open alert

1. Show the original local reading, affected heavy task, hold instruction and age of the unanswered alert. The system can track the clock and flag the missing response. It must keep the hold active while the crew's actual state is unverified.
2. At 8:02 a.m., replay time advances two minutes. That passes Sandline's acknowledgement window. The time rule makes the unanswered alert eligible for escalation; it does not manufacture a foreman acknowledgement or a stop confirmation.
3. At 8:04 a.m., the alert is escalated to Rashid Al Wadi, the superintendent. He receives the original task and alert details and takes responsibility for checking the crew's actual state through the site procedure. Escalation identifies the next human owner. It is not a proxy signature from Huda.
4. Rashid must still determine whether the instruction reached the work front, whether the task ceased and whether people moved to recovery. Those facts require their own evidence and times. If the register was simply missed, the team can reconcile it; if the crew is still exposed, protective action remains urgent. The record here does not resolve which explanation is true.

Amal Al Nadir, the project manager, may later need to review a disputed lost-time interval. That review should use the reconciled alert, contact and cessation times, rather than assume the whole interval was either worked or stopped. The cost question cannot close the safety gap.

## Where the case stands

The hold is open and Rashid has been escalated to. No foreman acknowledgement, confirmed cessation or recovery headcount is recorded in this branch. The outstanding response must be verified on site; escalation alone is not completion.

## Related records

[Scenario](scenario.json) · [Events](signals.jsonl) · [Expected outcomes](expected_outcomes.json) · [Example conversation](example_interaction.md). See the shared [heat programme](../cross-scenario/HEAT_PROGRAM_AND_SOP.md) and [policy register](../cross-scenario/policies.json) for the hold and escalation rules.
