"""Shared catalogue, provenance and cross-field input checks. No operational writes."""
import hashlib
import json
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from .contracts import Action, Request, TimingPolicy

ROOT = Path(__file__).resolve().parent
POLICY = json.loads((ROOT / 'policy.json').read_text())
VERSIONS = ['sandline-heat-rules-v1']


def require(condition, message):
    if not condition:
        raise ValueError(message)


@lru_cache(maxsize=1)
def catalog():
    shared = ROOT.parents[1] / 'cross-scenario'
    result = {}
    for key, filename in [('people','personnel'),('tasks','tasks'),('policies','policies')]:
        try:
            items = json.loads((shared / f'{filename}.json').read_text())
            result[key] = {item['id']: item for item in items}
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise RuntimeError('operational catalogue unavailable') from error
    return result


def elapsed_minutes(later, earlier):
    return (later - earlier).total_seconds() / 60


def midday(at):
    return (6, 15) <= (at.month, at.day) <= (9, 15) and (12, 30) <= (at.hour, at.minute) < (15, 0)


def location_map(req):
    return {location.id: location for location in req.locations}


def task_location(req, task_id):
    return req.task_locations[task_id]


def recovery_locations(req):
    return tuple(sorted(location.id for location in req.locations if POLICY['required_recovery_capability'] in location.capabilities))


def planning_locations(req):
    return tuple(sorted({task_location(req, 'workshop_prep')} |
                        {location.id for location in req.locations
                         if set(location.capabilities) & {'cooled_recovery','first_aid_support'}}))


def readiness_status(req, worker, at=None):
    record = worker.readiness
    if record is None:
        return 'unknown'
    if (at or req.decision_at) >= record.valid_until:
        return 'expired'
    return record.status


def ready_for_work(req, worker, starts_at, ends_at):
    return (readiness_status(req, worker, starts_at) == 'ready' and
            worker.readiness.confirmed_at <= req.decision_at and
            ends_at <= worker.readiness.valid_until)


def effective_timing_policy(req):
    """Resolve numeric rules; an ID alone selects the registered demo fallback."""
    if req.planning is None:
        return None
    supplied, selected_id = req.timing_policy, req.planning.policy_id
    if supplied is not None:
        require(selected_id is None or selected_id == supplied.id,
                'planning policy_id conflicts with supplied timing_policy.id')
        return supplied
    if selected_id is None:
        return None
    require(selected_id == POLICY['id'], 'unknown timing policy; supply its timing_policy object')
    try:
        return TimingPolicy(id=POLICY['id'],initial_recovery_minutes=POLICY['initial_recovery_minutes'],
            max_work_minutes=POLICY['max_work_minutes'],
            between_work_recovery_minutes=POLICY['between_work_recovery_minutes'])
    except (KeyError, ValueError, TypeError) as error:
        raise RuntimeError('registered timing policy is invalid') from error


def metadata(req):
    payload = req.model_dump(mode='json')
    snapshot = req.snapshot
    evidence = [*snapshot.readings, *snapshot.activity_history, *snapshot.incidents]
    evidence += [item for item in (snapshot.instruction, snapshot.cessation, snapshot.recovery) if item is not None]
    evidence += [worker.readiness for worker in snapshot.workers if worker.readiness is not None]
    policy = effective_timing_policy(req)
    fingerprint_input = {'request':payload,'effective_timing_policy':policy.model_dump(mode='json') if policy else None}
    return {'schema_version':'2.1','request_id':req.request_id,'snapshot_id':req.snapshot_id,
            'decision_at':req.decision_at,'profile_id':req.profile_id,
            'policy_versions':[*VERSIONS,*([policy.id] if policy else [])],
            'evidence_ids':sorted({item.evidence_id for item in evidence}),
            'input_fingerprint':hashlib.sha256(json.dumps(fingerprint_input,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest(),
            'applied':False}


def action(code, owner_id, message, person_ids=None, evidence_ids=None, policy_ids=None,
           due_at=None, status='required'):
    return Action(code=code,owner_id=owner_id,message=message,person_ids=person_ids or [],
                  evidence_ids=evidence_ids or [],policy_ids=policy_ids or [],due_at=due_at,status=status)


def _time(at):
    require(at.utcoffset() == timedelta(hours=4), 'operational demo timestamps require +04:00')
    require(at.date().isoformat() == '2025-08-04', 'operational demo uses 4 August 2025')


def validate_request(req):
    require(isinstance(req, Request), 'expected a validated operational Request')
    now, snap, cat = req.decision_at, req.snapshot, catalog()
    _time(now)
    locations = location_map(req)
    require(len(locations) == len(req.locations), 'duplicate location ID')
    for location in req.locations:
        require(location.label.strip(), 'location label must not be blank')
        require(len(location.capabilities) == len(set(location.capabilities)), 'duplicate location capability')
    require(set(req.task_locations) == {'civil_heavy','civil_light','workshop_prep'}, 'all registered tasks need location bindings')
    require(set(req.task_locations.values()) <= set(locations), 'task location references unknown location')
    for task, capability in [('civil_heavy','exposed_civil'),('civil_light','exposed_civil'),('workshop_prep','light_work')]:
        require(capability in locations[task_location(req,task)].capabilities, f'task location lacks {capability} capability')
    require(task_location(req,'civil_heavy') == task_location(req,'civil_light'), 'civil tasks share the affected exposed area in this scenario')
    require(not set(locations[task_location(req,'workshop_prep')].capabilities) & {'exposed_civil','exposed_electrical','yard'},
            'workshop preparation requires a covered light-work location')
    def known_location(location_id, capability=None):
        require(location_id in locations, f'unknown location reference: {location_id}')
        if capability:
            require(capability in locations[location_id].capabilities, f'location lacks {capability} capability: {location_id}')
    require((now.hour,now.minute) >= (7,58), 'decision precedes the demo baseline')
    require(set(snap.sensor_status) == {'t1','t2','t3'}, 'sensor status required for every registered monitor')
    workers = [worker.person_id for worker in snap.workers]
    require(len(set(workers)) == 11 and set(workers) == {f'C{i:02}' for i in range(2,13)},
            'workers must contain the original C02-C12 cohort exactly once')
    require(len(snap.held_task_ids) == len(set(snap.held_task_ids)), 'duplicate held task')
    for reading in snap.readings:
        known_location(reading.zone_id)
        _time(reading.measured_at); _time(reading.received_at)
        require(reading.measured_at <= reading.received_at <= now, 'reading not available at decision cutoff')
    require(len({reading.zone_id for reading in snap.readings}) == len(snap.readings), 'duplicate local reading')
    readiness_evidence = []
    for worker in snap.workers:
        known_location(worker.location_id)
        confirmation = worker.readiness
        if confirmation is not None:
            _time(confirmation.confirmed_at); _time(confirmation.valid_until)
            require(confirmation.confirmed_at <= now, 'future readiness confirmation')
            require(confirmation.confirmed_at < confirmation.valid_until, 'readiness validity must follow confirmation')
            require(confirmation.confirmed_by == 'C01', 'readiness requires the authorised task supervisor C01')
            require(confirmation.task_id == 'workshop_prep', 'readiness is scoped to workshop preparation')
            require(confirmation.evidence_id.strip() and confirmation.basis.strip(), 'readiness evidence and basis must not be blank')
            readiness_evidence.append(confirmation.evidence_id)
    require(len(readiness_evidence) == len(set(readiness_evidence)), 'duplicate readiness evidence ID')
    instruction = snap.instruction
    if instruction:
        _time(instruction.issued_at)
        require(instruction.issued_at <= now, 'instruction not yet issued')
        require((instruction.acknowledged_at is None) == (instruction.acknowledged_by is None),
                'acknowledgment requires both time and actor')
        if instruction.acknowledged_at:
            _time(instruction.acknowledged_at)
            require(instruction.issued_at <= instruction.acknowledged_at <= now, 'invalid acknowledgment chronology')
    if snap.cessation:
        _time(snap.cessation.confirmed_at)
        require(instruction is not None and instruction.acknowledged_at is not None,
                'cessation confirmation requires acknowledged instruction')
        require(instruction.acknowledged_at <= snap.cessation.confirmed_at <= now,
                'invalid cessation chronology')
    if snap.recovery:
        known_location(snap.recovery.zone_id, 'cooled_recovery')
        _time(snap.recovery.recorded_at)
        require(snap.cessation is not None and snap.cessation.confirmed_at <= snap.recovery.recorded_at <= now,
                'recovery record requires prior cessation')
        require(len(snap.recovery.person_ids) == len(set(snap.recovery.person_ids)), 'duplicate recovery person')
    incident_ids = [incident.person_id for incident in snap.incidents]
    require(len(incident_ids) == len(set(incident_ids)), 'duplicate worker incident')
    by_worker = {worker.person_id:worker for worker in snap.workers}
    for incident in snap.incidents:
        _time(incident.reported_at)
        require(incident.reported_at <= now, 'future symptom report')
        for value in (incident.removed_at,incident.first_aid_contacted_at):
            if value is not None:
                _time(value)
                require(incident.reported_at <= value <= now, 'invalid incident response chronology')
        if incident.location_id is not None:
            known_location(incident.location_id, 'first_aid_support')
        require(incident.location_id is None or incident.removed_at is not None,
                'confirmed first-aid location requires removal confirmation')
        if incident.removed_at is not None:
            require(incident.location_id is not None and by_worker[incident.person_id].location_id == incident.location_id,
                    'removed worker must be accounted for at the supplied first-aid location')
    histories = {}
    evidence_ids = []
    for item in snap.activity_history:
        known_location(item.zone_id)
        for value in (item.starts_at,item.ends_at,item.recorded_at): _time(value)
        require(item.starts_at < item.ends_at <= item.recorded_at <= now, 'activity is not observed at decision cutoff')
        require((item.kind != 'work' or item.task_id is not None), 'work history needs a task')
        if item.kind == 'work':
            require(task_location(req,item.task_id) == item.zone_id, 'history task and location mismatch')
        elif item.kind == 'recovery':
            require(item.task_id is None and item.zone_id in recovery_locations(req),
                    'recovery counts only in approved cooled shelters')
        else:
            require(item.task_id is None and 'first_aid_support' in locations[item.zone_id].capabilities,
                    'unavailable history needs a first-aid-support location')
        histories.setdefault(item.person_id,[]).append(item)
        evidence_ids.append(item.evidence_id)
    require(len(evidence_ids) == len(set(evidence_ids)), 'duplicate activity evidence ID')
    require(not set(evidence_ids) & set(readiness_evidence), 'readiness and activity evidence IDs must be distinct')
    records = [*snap.readings, *snap.activity_history, *snap.incidents,
               *(item for item in (snap.instruction,snap.cessation,snap.recovery) if item is not None),
               *(worker.readiness for worker in snap.workers if worker.readiness is not None)]
    all_evidence = [record.evidence_id for record in records]
    require(all(value.strip() for value in all_evidence), 'evidence IDs must not be blank')
    require(len(all_evidence) == len(set(all_evidence)), 'duplicate evidence ID across snapshot records')
    for pid, history in histories.items():
        ordered = sorted(history,key=lambda value:value.starts_at)
        for first,second in zip(ordered,ordered[1:]):
            require(first.ends_at == second.starts_at, f'activity history overlaps or has a gap for {pid}')
        require(ordered[-1].ends_at == now, f'activity history must reach the decision cutoff for {pid}')
    for windows, key in ((snap.zone_windows,'zone_id'),(snap.task_windows,'task_id')):
        grouped = {}
        for window in windows:
            _time(window.starts_at);_time(window.ends_at)
            require(window.starts_at < window.ends_at, 'invalid resource window')
            grouped.setdefault(getattr(window,key),[]).append(window)
        for group in grouped.values():
            ordered = sorted(group,key=lambda window:window.starts_at)
            for first,second in zip(ordered,ordered[1:]):
                require(first.ends_at <= second.starts_at, 'overlapping availability windows')
    for window in snap.zone_windows:
        known_location(window.zone_id)
        fixed = window.fixed_occupant_ids
        require(len(fixed) == len(set(fixed)) and set(fixed) <= set(cat['people']), 'unknown or duplicate fixed occupants')
        require(not set(fixed) & set(workers), 'candidate workers cannot be fixed occupants')
        require(len(fixed) <= locations[window.zone_id].capacity, 'fixed occupants exceed room capacity')
        if window.zone_id == task_location(req,'workshop_prep'):
            require({'P07','P08'} <= set(fixed), 'workshop must retain P07 and P08')
            reserved = {pid for task in cat['tasks'].values() for pid in task['baseline_assignees']}
            require(not (set(fixed)-{'P07','P08'}) & reserved, 'fixed workshop occupant has an existing task reservation')
    for first in snap.zone_windows:
        for second in snap.zone_windows:
            if first.zone_id != second.zone_id and max(first.starts_at,second.starts_at) < min(first.ends_at,second.ends_at):
                require(not set(first.fixed_occupant_ids) & set(second.fixed_occupant_ids), 'fixed occupant in two rooms at once')
    if req.planning:
        _time(req.planning.starts_at)
        rounded = now.replace(second=0,microsecond=0) + timedelta(minutes=int(bool(now.second or now.microsecond)))
        require(req.planning.starts_at == rounded, 'plan must start at the current or next minute boundary')
        require(req.planning.starts_at.second == 0 and req.planning.starts_at.microsecond == 0,
                'planning start must be minute-aligned')
        policy = effective_timing_policy(req)
        tail = max(policy.initial_recovery_minutes,policy.between_work_recovery_minutes) if policy else 0
        _time(req.planning.starts_at + timedelta(minutes=req.planning.horizon_minutes+tail))
    if hasattr(req, 'proposed_intervals'):
        for interval in req.proposed_intervals:
            known_location(interval.zone_id)
            _time(interval.starts_at); _time(interval.ends_at)
    if req.restart:
        _time(req.restart.proposed_at)
        owners = {'permit':'P04','personnel':'C01','recovery':'C01','water':'P03','crew_readiness':'C01'}
        for field,owner in owners.items():
            fact = getattr(req.restart,field)
            if fact.observed_at is not None:
                _time(fact.observed_at)
                require(fact.observed_at <= now, 'restart check is a future observation')
            if fact.status != 'unknown':
                require(fact.observed_at is not None and fact.actor_id == owner, f'invalid {field} confirmation actor or time')
            else:
                require(fact.observed_at is None and fact.actor_id is None, 'unknown confirmation must not claim evidence')
    return req
