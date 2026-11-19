"""Deterministic, advisory heat, protection, and restart decisions.

These functions describe required human actions. They never update the snapshot or
assert that an instruction, relocation, treatment, or restart has happened.
"""

from datetime import timedelta

from .common import action, metadata, midday, task_location, validate_request
from .contracts import Control, HeatResponse, ProtectiveResponse, Request, RestartResponse


_CIVIL_TASKS = ('civil_heavy', 'civil_light')
_ALL_TASKS = (*_CIVIL_TASKS, 'workshop_prep')
_CREW = tuple(f'C{i:02d}' for i in range(2, 13))


def _append_once(values: list[str], value: str) -> None:
    if value not in values:
        values.append(value)


def _latest_reading(req: Request):
    # Evaluate the latest expected monitor report, including an invalid or
    # wrong-zone report. An older good report must not mask a newer fault.
    readings = [r for r in req.snapshot.readings if r.sensor_id == 't1']
    return max(readings, key=lambda r: (r.received_at, r.measured_at, r.evidence_id), default=None)


def _reading_problem(req: Request, reading) -> str | None:
    if req.snapshot.sensor_status['t1'] != 'serviceable':
        return 'sensor_failed' if req.snapshot.sensor_status['t1'] == 'failed' else 'sensor_unverified'
    if reading is None:
        return 'reading_missing'
    if reading.zone_id != task_location(req, 'civil_heavy'):
        return 'reading_wrong_zone'
    if reading.quality != 'valid':
        return 'reading_invalid'
    now = req.decision_at
    if (reading.measured_at > now or reading.received_at > now or
            now - reading.measured_at > timedelta(minutes=5) or
            now - reading.received_at > timedelta(minutes=5)):
        return 'reading_stale'
    return None


def evaluate_heat(req: Request) -> HeatResponse:
    validate_request(req)
    recorded = set(req.snapshot.held_task_ids)
    # An issued heat instruction is historical evidence of a hold. No restart
    # authorization record exists in this contract, so an omitted held-task
    # list cannot erase that state.
    if req.snapshot.instruction is not None:
        recorded.add('civil_heavy')
    held = set(recorded)
    reading = _latest_reading(req)
    problem = _reading_problem(req, reading)
    midday_active = midday(req.decision_at)
    new_holds: dict[str, list[str]] = {}
    if req.snapshot.sensor_status['t1'] == 'failed':
        for task in _CIVIL_TASKS:
            new_holds[task] = ['sensor_failed']
    if midday_active:
        for task in _CIVIL_TASKS:
            new_holds.setdefault(task, []).append('midday_restriction')
    if problem is None and reading.twl <= 150:
        new_holds.setdefault('civil_heavy', []).append('twl_heavy_limit')
    held.update(new_holds)

    controls: list[Control] = []
    blockers: list[str] = []
    actions = []
    for task in _ALL_TASKS:
        reasons: list[str] = []
        policies: list[str] = []
        evidence: list[str] = []
        if task in new_holds:
            reasons.extend(new_holds[task])
            for reason in reasons:
                if reason == 'twl_heavy_limit':
                    _append_once(policies, 'p_heavy_hold')
                elif reason == 'midday_restriction':
                    _append_once(policies, 'p_midday')
                elif reason == 'sensor_failed':
                    _append_once(policies, 'p_stale')
                _append_once(blockers, reason)
            if 'twl_heavy_limit' in reasons and reading is not None:
                evidence.append(reading.evidence_id)
        if task in recorded:
            state = 'held'
            if task == 'civil_heavy' and problem is None and reading.twl > 150:
                _append_once(reasons, 'human_restart_required')
                _append_once(blockers, 'human_restart_required')
                _append_once(policies, 'p_restart')
        elif task in new_holds:
            state = 'hold_required'
        elif task in _CIVIL_TASKS and problem is not None:
            state = 'clearance_blocked'
            _append_once(reasons, problem)
            _append_once(policies, 'p_stale')
            _append_once(blockers, problem)
        else:
            state = 'no_new_hold'
        if task in _CIVIL_TASKS and problem is not None:
            _append_once(reasons, problem)
            _append_once(policies, 'p_stale')
            _append_once(blockers, problem)
        controls.append(Control(task_id=task, state=state, reason_codes=reasons,
                                policy_ids=policies, evidence_ids=evidence))
        if task in new_holds and task not in recorded:
            actions.append(action('issue_hold', 'P03', f'Issue and record a hold for {task}.',
                                  evidence_ids=evidence, policy_ids=policies))
    if problem is not None:
        actions.append(action('gather_fresh_local_reading', 'C01',
                              'Obtain a valid, fresh TWL reading from the t1 monitor at the civil heavy work location.',
                              policy_ids=['p_stale']))
    return HeatResponse(**metadata(req), controls=controls,
                        held_task_ids=[task for task in _ALL_TASKS if task in held],
                        clearance_blockers=blockers, actions=actions)


def evaluate_protective(req: Request, heat: HeatResponse | None = None) -> ProtectiveResponse:
    validate_request(req)
    heat = heat if heat is not None else evaluate_heat(req)
    snap = req.snapshot
    actions = []
    blockers: list[str] = []
    excluded = {w.person_id for w in snap.workers if w.availability == 'unavailable'}
    excluded.update(i.person_id for i in snap.incidents)
    active_heat_hold = any(c.state in ('hold_required', 'held') for c in heat.controls if c.task_id in _CIVIL_TASKS)
    if active_heat_hold:
        instruction = snap.instruction
        if instruction is None:
            blockers.append('instruction_missing')
            actions.append(action('issue_hold', 'P03',
                                  'Issue the civil heat hold instruction to C01 and record its time.',
                                  policy_ids=['p_heavy_hold']))
        elif instruction.acknowledged_at is None:
            due = instruction.issued_at + timedelta(minutes=2)
            overdue = req.decision_at >= due
            blockers.append('acknowledgement_missing')
            actions.append(action('acknowledge_instruction', 'C01',
                                  'Acknowledge the heat hold instruction.',
                                  evidence_ids=[instruction.evidence_id], due_at=due,
                                  status='overdue' if overdue else 'required'))
            if overdue:
                actions.append(action('escalate_missing_acknowledgement', 'P02',
                                      'Escalate the unacknowledged heat hold.',
                                      evidence_ids=[instruction.evidence_id], status='overdue'))
    crew_response_scope = active_heat_hold or snap.instruction is not None or req.planning is not None
    if crew_response_scope:
        if snap.cessation is None:
            blockers.append('cessation_unconfirmed')
            actions.append(action('confirm_work_stopped', 'C01',
                                  'Stop exposed work and record confirmation of cessation.'))

        accounted = set(snap.recovery.person_ids) if snap.recovery is not None else set()
        for incident in snap.incidents:
            if incident.removed_at is not None and incident.location_id is not None:
                accounted.add(incident.person_id)
        missing = [person for person in _CREW if person not in accounted]
        if missing:
            blockers.append('crew_accountability_missing')
            actions.append(action('account_for_crew', 'C01',
                                  'Confirm and record safe recovery or first aid location for every affected worker.',
                                  person_ids=missing))
    for incident in snap.incidents:
        if incident.removed_at is None or incident.location_id is None:
            _append_once(blockers, 'removal_unconfirmed')
            actions.append(action('confirm_removal_to_first_aid', 'C01',
                                  'Remove the affected worker from exposure and confirm the first aid location.',
                                  person_ids=[incident.person_id], evidence_ids=[incident.evidence_id]))
        if incident.first_aid_contacted_at is None:
            _append_once(blockers, 'first_aid_contact_missing')
            actions.append(action('contact_first_aid', 'P06',
                                  'Contact first aid for the reported symptom incident.',
                                  person_ids=[incident.person_id], evidence_ids=[incident.evidence_id]))
    return ProtectiveResponse(**metadata(req), actions=actions,
                              excluded_worker_ids=sorted(excluded), planning_blockers=blockers)


def evaluate_restart(req: Request, heat: HeatResponse | None = None) -> RestartResponse:
    validate_request(req)
    heat = heat if heat is not None else evaluate_heat(req)
    held = heat.held_task_ids
    restart = req.restart
    if restart is None:
        return RestartResponse(**metadata(req), status='not_requested', blockers=[],
                               required_owner_id='P02', held_task_ids=held, actions=[])

    blockers: list[str] = []
    actions = []
    if restart.proposed_at != req.decision_at:
        blockers.append('revalidate_at_restart_time')
    reading = _latest_reading(req)
    problem = _reading_problem(req, reading)
    if problem is not None:
        blockers.append(problem)
    elif reading.twl <= 150:
        blockers.append('twl_heavy_limit')
    if midday(req.decision_at):
        blockers.append('midday_restriction')
    if req.snapshot.cessation is None:
        blockers.append('cessation_unconfirmed')
    if req.snapshot.recovery is None or set(req.snapshot.recovery.person_ids) != set(_CREW):
        blockers.append('crew_accountability_missing')
    for incident in req.snapshot.incidents:
        if incident.removed_at is None or incident.location_id is None:
            _append_once(blockers, 'removal_unconfirmed')
        if incident.first_aid_contacted_at is None:
            _append_once(blockers, 'first_aid_contact_missing')

    latest_trigger = max(
        [t for t in (
            reading.received_at if problem is None else None,
            req.snapshot.instruction.acknowledged_at if req.snapshot.instruction else None,
            req.snapshot.cessation.confirmed_at if req.snapshot.cessation else None,
            req.snapshot.recovery.recorded_at if req.snapshot.recovery else None,
            *(i.reported_at for i in req.snapshot.incidents),
            *(i.removed_at for i in req.snapshot.incidents),
            *(i.first_aid_contacted_at for i in req.snapshot.incidents),
            *(w.readiness.confirmed_at for w in req.snapshot.workers if w.readiness is not None),
        ) if t is not None], default=req.decision_at)
    expected_actors = {
        'permit': 'P04', 'personnel': 'C01', 'recovery': 'C01',
        'water': 'C01', 'crew_readiness': 'C01',
    }
    for name, actor in expected_actors.items():
        confirmation = getattr(restart, name)
        valid = (confirmation.status == 'confirmed' and
                 confirmation.actor_id == actor and
                 confirmation.observed_at is not None and
                 latest_trigger <= confirmation.observed_at <= req.decision_at and
                 req.decision_at - confirmation.observed_at <= timedelta(minutes=5))
        if not valid:
            blockers.append(f'{name}_confirmation_required')
            actions.append(action(f'confirm_{name}', actor,
                                  f'Provide a current human {name.replace("_", " ")} confirmation for restart.',
                                  policy_ids=['p_restart']))
    status = 'blocked' if blockers else 'ready_for_human_review'
    if status == 'ready_for_human_review':
        actions.append(action('human_restart_review', 'P02',
                              'Review the evidence and decide whether to authorize restart.',
                              policy_ids=['p_restart']))
    return RestartResponse(**metadata(req), status=status, blockers=blockers,
                           required_owner_id='P02', held_task_ids=held, actions=actions)
