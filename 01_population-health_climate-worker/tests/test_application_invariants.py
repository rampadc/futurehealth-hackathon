"""Local case safety invariants; graph calls are stubbed except the pure solver check."""

import asyncio
import copy
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from heat_safe.application import api, service as case_module


ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def case(tmp_path, monkeypatch):
    async def graph(_request, _url):
        return 200, {
            'crew_rest': {'planning_status': 'blocked', 'intervals': []},
            'protective_response': {'excluded_worker_ids': []},
            'restart': {'decision': 'not_ready'},
        }, ['stubbed_graph']

    monkeypatch.setattr(case_module, 'run_graph', graph)
    return case_module.CaseService(tmp_path / 'case.sqlite3')


def execute(coro):
    return asyncio.run(coro)


def command(case, actor, action, *, key=None, payload=None, version=None):
    current = case.read_case(actor)
    return execute(case.command(actor, {
        'command_id': key or action,
        'expected_version': current['version'] if version is None else version,
        'action': action,
        'payload': payload or {},
    }))


def add_event(case, action, actor, payload=None, at='2025-08-04T08:00:00+04:00'):
    with case._conn() as db:
        active = case._active(db)
        db.execute('INSERT INTO events(case_id,command_id,actor_id,action,occurred_at,payload) VALUES (?,?,?,?,?,?)',
                   (active['id'], f'seed-{action}', actor, action, at, json.dumps(payload or {})))
        db.execute('UPDATE cases SET version=version+1 WHERE id=?', (active['id'],))


def test_case_api_requires_session(case, monkeypatch):
    monkeypatch.setattr(api.app.state, 'service', case)
    with TestClient(api.app) as client:
        assert client.get('/api/case').status_code == 401
        assert client.post('/api/case/commands', json={
            'case_id': 'not-authenticated',
            'command_id': 'one', 'expected_version': 0, 'action': 'issue', 'payload': {},
        }).status_code == 401


def test_wrong_actor_rejected(case):
    execute(case.start())
    with pytest.raises(case_module.CaseError) as error:
        command(case, 'C01', 'issue')
    assert error.value.status == 403
    assert case.read_case('P03')['version'] == 0


def test_review_requires_current_ready_restart_result(case):
    execute(case.start())
    reading = copy.deepcopy(case_module.SEED['snapshot']['readings'][0])
    for action, actor, payload in [
        ('report', 'C08', {}), ('incident_record', 'C01', {}),
        ('remove', 'C01', {}), ('firstaid', 'P06', {}),
        ('fresh', 'P03', {'reading': reading}), ('permit', 'P04', {'status': 'confirmed'}),
    ]:
        add_event(case, action, actor, payload)
    with pytest.raises(case_module.CaseError) as error:
        command(case, 'P02', 'review')
    assert error.value.status == 409
    with case._conn() as db:
        assert 'review' not in {event['action'] for event in case._events(db, case.read_case()['case_id'])}


def test_symptom_report_excludes_bilal_before_foreman_record(case):
    execute(case.start())
    add_event(case, 'report', 'C08')
    with case._conn() as db:
        active = case._active(db)
        request = case._project(active, case._events(db, active['id']))
    assert not request['snapshot']['incidents']  # Huda has not authored the incident record yet.
    assert next(w for w in request['snapshot']['workers'] if w['person_id'] == 'C08')['availability'] == 'unavailable'
    sys.path.insert(0, str(ROOT / 'demo/solver'))
    from operations.contracts import Request
    from operations.decisions import evaluate_protective

    response = evaluate_protective(Request.model_validate(request))
    assert 'C08' in response.excluded_worker_ids


def test_idempotency_key_cannot_change_payload(case):
    execute(case.start())
    command(case, 'P03', 'issue', key='same', payload={'source': 'first'})
    with pytest.raises(case_module.CaseError) as error:
        command(case, 'P03', 'issue', key='same', payload={'source': 'changed'}, version=0)
    assert error.value.status == 409
    assert case.read_case('P03')['version'] == 1


def test_competing_commands_do_not_both_commit(case):
    execute(case.start())

    async def race():
        return await asyncio.gather(*[
            case.command('P03', {'command_id': key, 'expected_version': 0, 'action': 'issue', 'payload': {}})
            for key in ('a', 'b')
        ], return_exceptions=True)

    results = execute(race())
    assert sum(isinstance(result, dict) for result in results) == 1
    assert sum(isinstance(result, case_module.CaseError) and result.status == 409 for result in results) == 1
    assert case.read_case('P03')['version'] == 1


def test_restart_check_can_be_repeated_after_new_reading(case):
    execute(case.start())
    for action, actor in [('report', 'C08'), ('incident_record', 'C01'),
                          ('remove', 'C01'), ('firstaid', 'P06')]:
        add_event(case, action, actor)
    reading = copy.deepcopy(case_module.SEED['snapshot']['readings'][0])
    command(case, 'P03', 'fresh', key='reading-one', payload={'reading': reading})
    command(case, 'P04', 'permit', key='permit-one', payload={'status': 'confirmed'})
    execute(case.advance_clock('2025-08-04T08:05:00+04:00'))
    reading.update(measured_at='2025-08-04T08:05:00+04:00', received_at='2025-08-04T08:05:00+04:00')
    command(case, 'P03', 'fresh', key='reading-two', payload={'reading': reading})
    command(case, 'P04', 'permit', key='permit-two', payload={'status': 'confirmed'})


def test_unacknowledged_instruction_escalates_at_two_minutes(case):
    execute(case.start())
    add_event(case, 'issue', 'P03')
    with case._conn() as db:
        active = case._active(db)
        db.execute('UPDATE cases SET clock=? WHERE id=?', ('2025-08-04T08:02:00+04:00', active['id']))
        active = case._active(db)
        request = case._project(active, case._events(db, active['id']))
    sys.path.insert(0, str(ROOT / 'demo/solver'))
    from operations.contracts import Request
    from operations.decisions import evaluate_protective

    response = evaluate_protective(Request.model_validate(request))
    assert any(action.code == 'escalate_missing_acknowledgement' for action in response.actions)


def test_replay_recovers_event_committed_before_run_insert(case):
    execute(case.start())
    add_event(case, 'issue', 'P03')
    assert case.read_case('P03')['capture'] is None
    execute(case.replay_unfinished())
    assert case.read_case('P03')['capture'] is not None


def test_worker_view_never_exposes_other_worker_records(case, monkeypatch):
    def paths(value, needle, path='view'):
        if isinstance(value, dict):
            return [found for key, item in value.items() for found in paths(item, needle, f'{path}.{key}')]
        if isinstance(value, list):
            return [found for index, item in enumerate(value) for found in paths(item, needle, f'{path}[{index}]')]
        return [path] if isinstance(value, str) and needle in value else []

    full = json.loads((ROOT / 'demo/solver/operations/examples/response-plans.solve.response.json').read_text())
    full['solver_calls'] = [{'endpoint': '/v2/crew-rest/solve', 'http_status': 200,
                             'response': copy.deepcopy(full['crew_rest'])}]
    full['plan_check'] = {'accepted': True, 'proposed_intervals': copy.deepcopy(full['crew_rest']['intervals'])}

    async def graph(_request, _url):
        return 200, copy.deepcopy(full), ['planned']

    monkeypatch.setattr(case_module, 'run_graph', graph)
    execute(case.start())
    for action, actor in [('checkin', 'C05'), ('report', 'C08'),
                          ('incident_record', 'C01'), ('remove', 'C01'), ('firstaid', 'P06')]:
        add_event(case, action, actor)
    current = case.read_case()['version']
    execute(case.recompute(case.read_case()['case_id'], current))

    for worker, other in [('C05', 'C08'), ('C08', 'C05')]:
        view = case.read_case(worker)
        assert view['capture'] is not None
        assert 'solver_calls' not in view['capture']['response']
        assert 'plan_check' not in view['capture']['response']
        assert not paths(view, other), f'{worker} view exposes {other} at {paths(view, other)}'
    assert all(e['id'] not in {'report', 'incident_record', 'remove', 'firstaid'}
               for e in case.read_case('C05')['story']['events'])
