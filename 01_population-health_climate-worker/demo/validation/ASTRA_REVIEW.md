# Independent Astra audit — final review

**Final status: PASS for the synthetic demonstration scope.** Rechecked the final stable revision on 2026-11-03. No material blockers remain from this review. This is a fixture and workflow review, not certification of an operational safety controller.

## Final verification

- Ran `validation/validate.py` in a temporary package copy: ten standalone scenarios and actual connected 02→03→04→10 replay passed.
- Ran `validation/mutation_checks.py` in that copy: all eleven unsafe/invalid mutations were rejected, including midday, failed-sensor and stale restart, duplicate IDs, wrong-zone measurement, missing hold trigger, missing first-aid response, unauthorized/missing assignment actor, non-string symptom content, and receipt after the dependent action.
- Independently checked connected final state: C05–C08 occupy the four free workshop places alongside P07/P08; their workshop qualifications satisfy the task; seven other recovering civil workers remain in shelter A; all ten electrical staff retain their own task roster. Civil heavy work remains held, supplier acceptance precedes confirmed delivery state, and handover retains open items.

## Resolution of findings

1. **Restart restrictions resolved.** Actual restart now rechecks local TWL, measurement age, monitor health and the seasonal midday interval as well as prior human review. The three original unsafe restart mutations fail.
2. **Affected crew and conservation resolved.** Scenario 03 now uses qualified civil C05–C08; replay removes prior task/location reservations before the workshop assignment and validates active assignment and cooled occupancy conflicts.
3. **Contract and identity findings resolved for the supported fixtures.** Payload required fields now have explicit types, event types are enumerated, duplicate IDs fail, and authority is required for the relevant human actions. The civil assignment actor is C01; envelope and payload actors must agree when both are present. The validator is purpose-built for these ten fixtures, not a general JSON Schema implementation.
4. **Derived hold and response evidence resolved.** Low local TWL derives held state before the separately recorded human notification. Incident evidence requires the trained first-aid response. The response route remains a deterministic synthetic workflow rather than proof of a real notification.
5. **Follow-up authority, symptom type and receipt findings resolved.** The prior E01 civil authorization, missing actor, object-valued symptom and delayed-receipt reproductions now fail. Replay explicitly rejects a later recorded action that precedes receipt of the prior signal.

## Source and scope review

The numbered SOP separates published CoP duties, technical guidance/reported practice and invented site thresholds. Historical weather remains planning background; synthetic local TWL carries zone, sensor, unit, quality and measurement time. The package does not claim clinical diagnoses, model-issued medical clearance or an exemption from the midday restriction. The required 36-person staffing and separate client/contractor/supplier roles remain coherent.

Local CoP and Technical Guideline text was reviewed. External URLs were not independently re-fetched; the image-only TG p5 table was not visually audited because the package expressly does not reproduce its zones. No live messages, operational deployments or clinical effectiveness were tested. Those are outside this synthetic demonstration.

---

The original report below is retained as history; its CHANGES REQUIRED status applied to the initial snapshot and is superseded by the final review above.

# Initial audit history

Status: **CHANGES REQUIRED**. Reviewed the READY snapshot on 2026-11-03. Baseline validator passed in a temporary copy; four unsafe/invalid mutations also passed. No scenario files were modified.

## Blocking findings

1. **High — human review bypasses hard restart restrictions.** `validation/validate.py:158–166` checks a list containing the word `midday`, but never evaluates the time prohibition. Restart only requires a previous review, without rechecking fresh local TWL or sensor health. Reproductions (each independently applied in a temporary copy of scenario 09) all report PASS: replace every `T08:` timestamp with `T13:`; insert a `sensor_fail` event for `t1` between review and restart; shift restart and later events from `T08:` to `T09:`. Fix: validate midday exclusion, current local measurement age/value, serviceable sensor, relevant held task and review at the actual restart transition. A named check is not evidence that the condition holds.

2. **High — scenario 03 double-books people and does not reassign the affected crew.** `03_constrained_reassignment/signals.jsonl:1–2` moves E02–E05 into the workshop while `cross-scenario/baseline_state.json` retains them on electrical_prep. `validation/validate.py:114–115` then claims `no_double_booking` without removing prior assignments or testing uniqueness across tasks. The heat case affects civil work, so this does not demonstrate constrained recovery of the affected civil crew. Fix: use an eligible subset of affected workers, explicitly release their old assignments/location, and verify conservation, qualification and unique current assignments. Preserve the remaining civil crew's safe recovery state in the chain.

3. **Medium — typed signal contract and IDs are not validated.** `cross-scenario/schemas/signal.schema.json` accepts any string type and any object payload; `validation/validate.py:64–76` never loads either schema or checks event ID uniqueness. Reproduction: set the second event ID in scenario 09 equal to the first; validator still reports PASS. Fix: use type-specific payload requirements/types and invoke schema validation (or equivalent explicit contract checks), check unique IDs and the timestamp ordering semantics actually used by replay.

4. **Medium — derived outcomes can be pre-authored rather than demonstrated.** `02_heat_alert_response/signals.jsonl:2` supplies the hold outcome; the TWL handler at `validation/validate.py:81–83` only stores a number. `symptom` at lines 145–149 similarly marks first-aider notification and incident recording as observed without such evidence. Fix: derive hold from the synthetic measurement and policy, and distinguish requested/notified/responded/recorded state using actual evidence. Expected assertions should check resulting state rather than labels added unconditionally by event type.

## Verified strengths and scope

The package has ten scenario folders and standalone plus connected replay. It preserves 36 regular staff (8 principal, 14 civil, 10 electrical, 4 logistics); C13/C14 restrictions; workshop capacity six with two existing occupants; shelters 24 and 16; distinct client, contractors and supplier. Delivery draft/approval/send/acceptance sequencing is represented. Source classification distinguishes CoP requirements, technical guidance and fictional thresholds. Weather is explicitly background, not workfront measurement or TWL computation. Symptoms do not require a low TWL or model diagnosis.

Read the local CoP and Technical Guideline through pdftotext. The guidance TWL zone table on p5 is image-only, but the demo expressly does not reproduce it. This review did not independently fetch external source URLs or certify operational/legal compliance. The package is a synthetic fixture demonstration, not an operational heat safety system.

A revised stable snapshot requires recheck before a pass.
