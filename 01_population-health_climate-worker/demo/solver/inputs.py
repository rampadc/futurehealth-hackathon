"""Prepare synthetic allocation cases from the original scenario 02 recovery state."""
import copy
import importlib.util
import json
from datetime import datetime, timedelta
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
DEMO = ROOT.parent

def read(path):
    return json.loads(Path(path).read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def same_typed(actual, expected):
    """Python equality alone treats True, 1 and 1.0 as interchangeable."""
    if type(actual) is not type(expected):
        return False
    if type(expected) is dict:
        return actual.keys() == expected.keys() and all(same_typed(actual[key], value)
                                                      for key, value in expected.items())
    if type(expected) is list:
        return len(actual) == len(expected) and all(same_typed(a, b) for a, b in zip(actual, expected))
    return actual == expected


def time(value):
    result = datetime.fromisoformat(value)
    require(result.utcoffset() == timedelta(hours=4), 'expected replay timezone +04:00')
    require(result.date().isoformat() == '2025-08-04', 'expected replay date')
    return result


def reference_validator():
    spec = importlib.util.spec_from_file_location('sandline_reference', DEMO / 'validation/validate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def apply_fact(state, context, fact, decision_at, people, tasks, zones):
    occurred, recorded = time(fact['occurred_at']), time(fact['recorded_at'])
    require(time(state['clock']) <= occurred <= recorded <= time(decision_at),
            f"fact not available at decision: {fact['id']}")
    kind, p = fact['kind'], fact['payload']
    authority = {'readiness': 'C01', 'permit': 'P04', 'resources': 'P03',
                 'demand': 'C01', 'supervision': 'P02', 'fixed_occupant': 'P03',
                 'unavailability': 'C01', 'reading': 'P03'}
    require(fact['actor_id'] in people and fact['actor_id'] == authority[kind],
            f"wrong fact authority: {fact['id']}")
    if 'task_id' in p:
        require(p['task_id'] in tasks, 'unknown task')
    if kind == 'readiness':
        require(set(p['person_ids']) <= set(people), 'unknown readiness worker')
        for pid in p['person_ids']:
            context['readiness'][pid] = p['ready']
    elif kind == 'permit':
        require(p['permit_id'] == tasks[p['task_id']]['permit_id'], 'wrong task permit')
        context['permit'] = p['status'] == 'valid'
    elif kind == 'resources':
        context['resources'] = p['available']
    elif kind == 'demand':
        require(p['max_workers'] >= p['min_workers'], 'invalid demand')
        # JSON Schema integers also accept numbers written as 4.0.
        context['demand'] = int(p['max_workers'])
    elif kind == 'supervision':
        require(p['supervisor_id'] in people and p['approved_by'] in people, 'unknown supervisor/approver')
        require(all(tasks[tid]['supervisor_id'] == p['supervisor_id'] for tid in p['task_ids']),
                'supervisor does not cover both tasks')
        require('supervisor' in people[p['supervisor_id']]['qualifications'], 'unqualified supervisor')
        context['supervision'] = p['available']
    elif kind == 'fixed_occupant':
        pid = p['person_id']
        require(pid in people and p['zone_id'] in zones, 'unknown occupant/zone')
        require(pid not in sum(state['occupancy'].values(), []), 'occupant already located')
        require(not any(pid in ids for ids in state['assignments'].values()), 'occupant has reserved task')
        state['occupancy'][p['zone_id']].append(pid)
    elif kind == 'unavailability':
        pid = p['person_id']
        require(pid in context['candidate_pool'], 'unavailability outside affected crew')
        require(p['responder_id'] in people and 'first_aid' in people[p['responder_id']]['qualifications'],
                'invalid first aider')
        require(pid not in context['unavailable'], 'duplicate incident')
        context['unavailable'].add(pid)
        context['response'][pid] = {'responder_id': p['responder_id'], 'status': p['responder_status']}
        for occupants in state['occupancy'].values():
            if pid in occupants:
                occupants.remove(pid)
        for assigned in state['assignments'].values():
            if pid in assigned:
                assigned.remove(pid)
        state['occupancy'][p['zone_id']].append(pid)
    elif kind == 'reading':
        require(zones[p['zone_id']]['sensor_id'] == p['sensor_id'], 'wrong-zone reading')
        require(state['sensor_status'][p['sensor_id']] == 'serviceable', 'failed monitor')
        state['readings'][p['zone_id']] = {'twl': p['twl'], 'sensor_id': p['sensor_id'],
                                         'at': fact['occurred_at']}
        # Improved measurements do not change an existing hold.


def prepare_case(case, snapshot, base, people, tasks, zones, reference):
    """Replay only facts available at this case's decision, before any proposal."""
    state = copy.deepcopy(base)
    pool = set(base['occupancy']['shelter_a'])
    context = {'candidate_pool': pool, 'readiness': {}, 'permit': False, 'resources': False,
               'demand': None, 'supervision': False, 'unavailable': set(), 'response': {}}
    require(time(base['clock']) <= time(snapshot['decision_at']) <= time(case['decision_at']),
            'snapshot precedes source cutoff or case precedes snapshot')
    for facts, cutoff in ((snapshot['facts'], snapshot['decision_at']),
                          (case['facts'], case['decision_at'])):
        previous = time(state['clock'])
        for fact in facts:
            recorded = time(fact['recorded_at'])
            require(recorded >= previous, 'facts out of recorded order')
            if facts is case['facts']:
                require(time(fact['occurred_at']) >= time(snapshot['decision_at']),
                        'branch fact precedes snapshot')
            apply_fact(state, context, fact, cutoff, people, tasks, zones)
            previous = recorded
    state['clock'] = case['decision_at']
    reference.validate_state(state)
    require(state['task_status']['civil_heavy'] == 'held', 'trench hold lost')
    require(state['assignments']['civil_light'] == ['C13', 'C14'], 'new-starter assignments changed')
    require('C01' in state['assignments']['civil_heavy'], 'foreman reservation lost')
    require(all(pid in state['occupancy']['workshop'] for pid in ('P07', 'P08')),
            'welfare attendants displaced')
    accountability = set(state['occupancy']['shelter_a']) | context['unavailable']
    require(accountability == pool, 'affected eleven not accounted for')
    civil = {pid for pid, person in people.items() if person['crew_id'] == 'civil'}
    require(accountability | {'C01', 'C13', 'C14'} == civil and len(civil) == 14,
            'civil roster mismatch')
    require(set(state['occupancy']['welfare']) == context['unavailable'],
            'incident location not accounted for')
    require(set(context['response']) == context['unavailable'], 'missing responder status')
    require(len(state['occupancy']['workshop']) <= zones['workshop']['capacity'],
            'fixed workshop overcrowding')
    context['candidate_pool'] = sorted(pool)
    context['unavailable'] = sorted(context['unavailable'])
    return {'case_id': case['id'], 'decision_at': case['decision_at'], 'state': state,
            'context': context, 'people': copy.deepcopy(people), 'tasks': copy.deepcopy(tasks),
            'zones': copy.deepcopy(zones)}


def _check_ids(data):
    for collection in ('assumptions', 'snapshots', 'cases'):
        ids = [item['id'] for item in data[collection]]
        require(len(ids) == len(set(ids)), f'duplicate {collection} IDs')
    fact_ids = [fact['id'] for item in data['snapshots'] + data['cases'] for fact in item['facts']]
    require(len(fact_ids) == len(set(fact_ids)), 'duplicate supplemental fact IDs')


def _source():
    require(__debug__, 'run without -O: reference fixture validator uses assertions')
    reference = reference_validator()
    reference.shared_checks()
    base, _ = reference.replay(DEMO / '02_heat_alert_response')
    require(base['clock'] == '2025-08-04T08:04:00+04:00', 'unexpected source cutoff')
    return reference, base


def prepare_problem(data, case_id):
    """Accept synthetic facts independently of authored proposals and expected outputs."""
    require(isinstance(data, dict), 'dataset must be an object')
    require(type(case_id) is str and bool(case_id), 'invalid case ID')
    clean = copy.deepcopy(data)
    if isinstance(clean.get('cases'), list):
        for case in clean['cases']:
            if isinstance(case, dict):
                case.pop('proposal', None)
                case.pop('expected', None)
    schema = read(ROOT / 'dataset.schema.json')
    case_schema = schema['properties']['cases']['items']
    for key in ('proposal', 'expected'):
        case_schema['properties'].pop(key)
        case_schema['required'].remove(key)
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(clean)
    _check_ids(clean)
    snapshots = {snapshot['id']: snapshot for snapshot in clean['snapshots']}
    cases = {case['id']: case for case in clean['cases']}
    require(all(case['snapshot_id'] in snapshots for case in clean['cases']),
            'unknown snapshot reference')
    require(case_id in cases, f'unknown case: {case_id}')
    case = cases[case_id]
    require(case['snapshot_id'] in snapshots, 'unknown snapshot reference')
    reference, base = _source()
    return prepare_case(case, snapshots[case['snapshot_id']], base,
                        reference.people, reference.tasks, reference.zones, reference)


def validate_problem(problem):
    """Check a prepared problem at the solver boundary without replacing its controls."""
    require(type(problem) is dict and set(problem) ==
            {'case_id', 'decision_at', 'state', 'context', 'people', 'tasks', 'zones'},
            'invalid prepared problem')
    require(type(problem['case_id']) is str and bool(problem['case_id']), 'invalid case ID')
    require(type(problem['decision_at']) is str, 'invalid decision time')
    decision = time(problem['decision_at'])
    reference, base = _source()
    people, tasks, zones = (problem[key] for key in ('people', 'tasks', 'zones'))
    require(same_typed(people, reference.people), 'person definitions changed')
    require(same_typed(tasks, reference.tasks), 'task definitions changed')
    require(same_typed(zones, reference.zones), 'zone definitions changed')
    state, context = problem['state'], problem['context']
    require(type(state) is dict and set(state) == set(base), 'invalid state fields')
    require(type(context) is dict and set(context) ==
            {'candidate_pool', 'readiness', 'permit', 'resources', 'demand',
             'supervision', 'unavailable', 'response'}, 'invalid context fields')
    require(state['clock'] == problem['decision_at'] and decision >= time(base['clock']),
            'state clock differs from decision time')
    pool = base['occupancy']['shelter_a']
    require(type(context['candidate_pool']) is list and context['candidate_pool'] == sorted(pool),
            'candidate pool differs from original recovery crew')
    unavailable = context['unavailable']
    require(type(unavailable) is list and all(type(pid) is str for pid in unavailable)
            and unavailable == sorted(set(unavailable))
            and set(unavailable) <= set(pool), 'invalid unavailable workers')
    readiness = context['readiness']
    require(type(readiness) is dict and set(readiness) <= set(people)
            and all(type(value) is bool for value in readiness.values()), 'invalid readiness')
    for key in ('permit', 'resources', 'supervision'):
        require(type(context[key]) is bool, f'invalid {key}')
    demand = context['demand']
    require(demand is None or type(demand) is int and demand >= 1, 'invalid demand')
    response = context['response']
    require(type(response) is dict and set(response) == set(unavailable), 'invalid response')
    require(all(type(item) is dict and item == {'responder_id': 'P06', 'status': 'contacted'}
                for item in response.values()), 'invalid responder status')
    require(type(state['assignments']) is dict and set(state['assignments']) == set(base['assignments'])
            and all(type(ids) is list for ids in state['assignments'].values()),
            'invalid assignments')
    require(same_typed(state['task_status'], base['task_status']),
            'task status changed')
    expected_assignments = copy.deepcopy(base['assignments'])
    expected_assignments['civil_heavy'] = [pid for pid in expected_assignments['civil_heavy']
                                           if pid not in unavailable]
    require(same_typed(state['assignments'], expected_assignments), 'unexpected task assignments')
    occupancy = state['occupancy']
    require(type(occupancy) is dict and set(occupancy) == set(base['occupancy'])
            and all(type(ids) is list and all(type(pid) is str and pid in people for pid in ids)
                    and len(ids) == len(set(ids))
                    for ids in occupancy.values()), 'invalid occupancy')
    require(occupancy['shelter_a'] == [pid for pid in pool if pid not in unavailable]
            and occupancy['shelter_b'] == base['occupancy']['shelter_b']
            and set(occupancy['welfare']) == set(unavailable), 'recovery or welfare changed')
    require(set(base['occupancy']['workshop']) <= set(occupancy['workshop'])
            and not set(occupancy['workshop']) & set(pool), 'invalid fixed workshop occupants')
    extras = set(occupancy['workshop']) - set(base['occupancy']['workshop'])
    require(not any(pid in ids for pid in extras for ids in state['assignments'].values()),
            'fixed occupant has a reserved task')
    require(len(occupancy['workshop']) <= zones['workshop']['capacity'], 'fixed workshop overcrowding')
    require(len(set(sum(occupancy.values(), []))) == sum(map(len, occupancy.values())),
            'worker in multiple zones')
    require(type(state['readings']) is dict and set(state['readings']) == set(base['readings'])
            and all(type(reading) is dict and set(reading) == {'twl', 'at', 'sensor_id'}
                    for reading in state['readings'].values()), 'invalid readings')
    for zone_id, reading in state['readings'].items():
        require(type(reading['twl']) in (int, float) and 0 < reading['twl'] < 500
                and reading['sensor_id'] == zones[zone_id]['sensor_id']
                and type(reading['at']) is str and time(reading['at']) <= decision,
                'invalid reading')
        if zone_id != 'civil_exposed':
            require(same_typed(reading, base['readings'][zone_id]), 'unrelated reading changed')
        elif reading != base['readings'][zone_id]:
            require(time(reading['at']) >= time(base['clock']), 'reading predates recovery')
    for key in ('sensor_status', 'alerts', 'delivery', 'evidence', 'open_items', 'case_id'):
        require(same_typed(state[key], base[key]), f'unexpected state change: {key}')
    try:
        reference.validate_state(state)
    except (AssertionError, KeyError, TypeError) as error:
        raise ValueError(f'invalid prepared state: {error}') from error
    return problem
