# Project Sandline — synthetic Heat-Safe demonstration

Start with one fictional utilities-construction site in Mussafah, Abu Dhabi, on **4 August 2025 (Asia/Dubai, UTC+04:00)**. The site already has a heat programme. These cases explore how an assistant could help people apply it, coordinate changes and preserve evidence.

All people, companies, measurements and operational actions are synthetic. The package is a dossier and replayable fixtures, not an application, live integration or operational safety approval.

## Read the site before running a scenario

1. [Site context](cross-scenario/SITE_CONTEXT.md): organisations, personnel, resources, work and authority.
2. [Heat programme and SOP](cross-scenario/HEAT_PROGRAM_AND_SOP.md): response steps and the distinction between published requirements and invented demo policies.
3. [Policy register](cross-scenario/policies.json) and [source register](cross-scenario/sources.json): evidence behind each rule.

The shared JSON files define 36 regular personnel, their crews, tasks, zones, assets and delivery. Scenario folders reuse those IDs; they do not introduce a different company each time.

## Choose a demonstration

| Scenario | Value to show |
|---|---|
| [01. Plan before conditions change](01_pre_shift_planning/README.md) | Earlier preparation and a clear distinction between planning information and current exposure. |
| [02. Respond to the local heat trigger](02_heat_alert_response/README.md) | Connect a measurement to an accountable response without confusing an alert with completed action. |
| [03. Find an alternative that actually fits](03_constrained_reassignment/README.md) | Prevent an attractive but impossible suggestion and preserve a consistent picture of where people are assigned. |
| [04. Coordinate across organisational boundaries](04_delivery_coordination/README.md) | Keep draft, approval, transmission and external confirmation distinct across contractor and supplier teams. |
| [05. Respect mobilisation restrictions](05_restricted_worker_assignment/README.md) | Catch an assignment mistake before work starts, without disclosing a diagnosis or a full HR record. |
| [06. Treat missing local information as unknown](06_sensor_failure/README.md) | Make uncertainty explicit and avoid interpreting nearby or historical data as current local conditions. |
| [07. Escalate a response that has no owner acknowledgement](07_unacknowledged_alert/README.md) | Reveal an unattended response and route it to a defined accountable person. |
| [08. Respond to a person, not just a sensor](08_symptom_escalation/README.md) | Avoid reassuring a symptomatic worker merely because no environmental threshold was crossed. |
| [09. Require current evidence at restart](09_restart_review/README.md) | Prevent an earlier review from becoming a reusable permission that overrides changed conditions. |
| [10. Explain what happened and what remains open](10_handover_and_evidence/README.md) | Produce an inspectable handover that preserves unresolved work instead of writing a misleading success summary. |

For a presentation, use **02 → 03 → 04 → 10**: heat hold, constrained reassignment, supplier coordination and handover. Use **06** as the independent failure demonstration. The other cases are focused tests or alternate demonstrations.

## How the data fits together

Each scenario has a readable walkthrough, `scenario.json` starting-state overrides, ordered `signals.jsonl`, semantic expectations and an illustrative dialogue. Dialogue is authored example text; it is not evidence of an LLM run.

Standalone replay deep-merges the scenario's `initial_overrides` into the shared baseline. Dictionaries merge recursively; arrays replace. Connected replay applies the baseline once and carries actual state across scenarios 02, 03, 04 and 10; it does not reapply their standalone overrides. Event timestamps advance replay time.

Telemetry represents an application-level input after a device adapter. It is suitable for a future HTTPS adapter or gateway integration, but no manufacturer payload compatibility is claimed. Regional weather is planning context, not measured work-front conditions or the derivation of the synthetic TWL values. The LLM is not needed to run the fixture checks.

## Validate locally

From this directory:

```sh
python3 validation/validate.py
python3 validation/mutation_checks.py
```

The standard-library validator checks shared references and replays all ten standalone scenarios and the connected chain. [Results](validation/results.json) record the latest run. The [independent Astra review](validation/ASTRA_REVIEW.md) and [resolution record](validation/RESOLUTIONS.md) document review status and corrections. Read the status in those files; a replay pass alone is not field validation.

The demonstration keeps acknowledgement, task cessation, message transmission, supplier acceptance and action completion separate. A future afternoon delivery booking is not a clearance to unload. Symptoms follow the first-aid route regardless of the environmental reading; no clinical diagnosis or treatment model is included.
