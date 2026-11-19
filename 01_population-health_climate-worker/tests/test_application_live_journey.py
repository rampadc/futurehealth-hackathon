"""Opt-in elapsed-time journey through actual ADK nodes and the HTTP solver.

RUN_LIVE_APPLICATION=1 HEAT_SOLVER_URL=http://127.0.0.1:8876 pytest -q tests/test_application_live_journey.py
Only the injected test clock advances; the product exposes no time-advance action.
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from heat_safe.application.service import CaseService, CaseError
from heat_safe.application import storage

pytestmark = pytest.mark.skipif(os.getenv('RUN_LIVE_APPLICATION') != '1', reason='opt-in live solver journey')
BASE = datetime.fromisoformat('2025-08-04T08:00:00+04:00')


class Clock:
    def __init__(self):
        self.value = datetime(2026, 11, 16, tzinfo=timezone.utc)
        self.origin = self.value

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += timedelta(seconds=seconds)

    def until(self, scenario_time):
        elapsed = datetime.fromisoformat(scenario_time) - BASE
        target = self.origin + elapsed
        assert target >= self.value
        self.value = target


def execute(coro):
    return asyncio.run(coro)


def make_service(tmp_path, name, monkeypatch, clock):
    url = os.getenv('POSTGRES_TEST_URL')
    if not url:
        return CaseService(tmp_path / name, now=clock)
    from sqlalchemy.engine import make_url
    assert make_url(url).database.endswith('_test'), 'Live tests require a disposable *_test database'
    monkeypatch.setenv('DATABASE_URL', url)
    service = CaseService(now=clock)
    with storage.connection() as db:
        db.execute('TRUNCATE events, runs, cases, sessions RESTART IDENTITY CASCADE')
    return service


def test_live_elapsed_shift_journey(tmp_path, monkeypatch):
    clock = Clock()
    service = make_service(tmp_path, 'journey.sqlite3', monkeypatch, clock)
    current = execute(service.start())
    assert current['capture']['response']['heat']['held_task_ids'] == ['civil_heavy']
    crew = [f'C{i:02}' for i in range(2, 13)]
    selected = ['C05', 'C06', 'C07', 'C08']

    def act(actor, action, payload=None, seconds=1):
        nonlocal current
        clock.advance(seconds)
        execute(service.catch_up())
        current = service.read_case(actor)
        current = execute(service.command(actor, {
            'case_id': current['case_id'], 'command_id': str(uuid.uuid4()), 'expected_version': current['version'],
            'action': action, 'payload': payload or {},
        }))
        latest = service.runs()[0]
        assert latest['http_status'] == 200, (action, latest)
        return current

    def observe(ids):
        return act('C01', 'activity', {'through_now': True, 'observed': True,
            'groups': [{'person_ids': ids, 'kind': 'recovery', 'zone_id': 'shelter_a'}]})

    def readiness(ids):
        return {'confirmations': [{'person_id': pid, 'status': 'ready',
            'basis': 'Foreman checked the worker in person',
            'valid_until': (BASE + timedelta(minutes=150)).isoformat()} for pid in ids]}

    act('P03', 'issue', seconds=10)
    act('C01', 'acknowledge', seconds=15)
    act('C01', 'stop', seconds=5)
    act('C05', 'checkin', seconds=20)
    assert current['headcount']['checked_in_count'] == 1
    assert current['headcount']['confirmed_count'] == 0
    act('C01', 'recover', {'person_ids': crew, 'zone_id': 'shelter_a'}, seconds=10)
    assert current['headcount']['confirmed_count'] == 11
    assert any(t['action'] == 'coverage_review' and t['status'] == 'ready'
               for t in service.read_case('P10')['tasks'])
    act('P10', 'coverage_review', {'policy_id': 'heat-rest-schedule-v1', 'status': 'confirmed',
        'crew_ids': crew, 'roster_verified': True, 'note': 'Reviewed the supplied scenario roster and schedule'})
    own = service.heat_rest('C05')
    assert own['coverage_review']['status'] == 'confirmed'
    assert own['payroll_verified'] is False
    assert 'commercial_summary' in service.heat_rest('P01')

    # Request a prospective plan during recovery, with time for human review.
    clock.advance(120)
    act('C01', 'readiness', readiness(selected))
    observe(crew)
    assessment = current['plan_assessment']
    assert assessment['status'] == 'proposed'
    assert assessment['response']['crew_rest']['planning_status'] == 'planned'
    assert assessment['check']['accepted'] is True
    assert assessment['request']['planning']['work_not_before']
    proposed = sorted({i['person_id'] for i in assessment['response']['crew_rest']['intervals'] if i['kind'] == 'work'})
    assert proposed == selected
    plan_id = assessment['id']
    act('C01', 'assign', {'assessment_id': plan_id})
    assert all(w['location_id'] == 'shelter_a' for w in current['request']['snapshot']['workers'])
    with pytest.raises(CaseError):
        act('C01', 'start_work', {'assessment_id': plan_id, 'person_ids': selected,
            'observed_recovery': True, 'prerequisites_confirmed': True})
    first_work = min(i['starts_at'] for i in assessment['response']['crew_rest']['intervals'] if i['kind'] == 'work')
    clock.until(first_work)
    act('C01', 'start_work', {'assessment_id': plan_id, 'person_ids': selected,
        'observed_recovery': True, 'prerequisites_confirmed': True})
    working = {w['person_id'] for w in current['request']['snapshot']['workers'] if w['location_id'] == 'workshop'}
    assert working == set(selected)

    # Reports and actual cessation are distinct; other crew return to cooled recovery explicitly.
    act('C08', 'report', seconds=90)
    assert 'C08' in current['capture']['response']['protective_response']['excluded_worker_ids']
    act('C01', 'incident_record')
    act('C01', 'remove', {'location_id': 'welfare'})
    act('P06', 'firstaid')
    act('C01', 'start_recovery', {'person_ids': ['C05', 'C06', 'C07'],
        'zone_id': 'shelter_a', 'observed_work': True})
    active = [pid for pid in crew if pid != 'C08']
    observe(active)
    no_substitute = current['plan_assessment']
    assert no_substitute['response']['crew_rest']['planning_status'] == 'planned'
    no_sub_ids = {i['person_id'] for i in no_substitute['response']['crew_rest']['intervals'] if i['kind'] == 'work'}
    assert no_sub_ids == {'C05', 'C06', 'C07'}
    assert no_substitute['response']['crew_rest']['useful_worker_minutes'] > 0
    assert all(i['person_id'] != 'C08' for i in no_substitute['request']['snapshot']['activity_history'])
    act('C01', 'leila', readiness(['C09']))
    observe(active)
    substitute = current['plan_assessment']
    assert substitute['response']['crew_rest']['planning_status'] == 'planned'
    substitute_ids = {i['person_id'] for i in substitute['response']['crew_rest']['intervals'] if i['kind'] == 'work'}
    assert substitute_ids == {'C05', 'C06', 'C07', 'C09'}
    assert substitute['response']['crew_rest']['useful_worker_minutes'] >= no_substitute['response']['crew_rest']['useful_worker_minutes']

    act('P02', 'handover')
    for action in ('draftDelivery', 'approveDelivery', 'sendDelivery', 'acceptDelivery'):
        act('P05', action)
    act('P01', 'costReview')
    act('C01', 'fresh', {'measured_now': True, 'reading': {'sensor_id': 't1',
        'zone_id': 'civil_exposed', 'twl': 180.0, 'unit': 'W/m²', 'quality': 'valid'}})
    for actor, action in [('P04', 'permit'), ('C01', 'personnel'), ('C01', 'recovery_check'),
                          ('C01', 'water'), ('C01', 'crew_readiness')]:
        act(actor, action, {'status': 'confirmed'})
    assert current['capture']['response']['restart']['status'] == 'ready_for_human_review'
    act('P02', 'review')
    assert 'civil_heavy' in current['capture']['response']['heat']['held_task_ids']
    assert current['story']['reviewed']
    assert service.read_case('P10')['capture'] is None
    assert service.read_case('C05')['viewer_id'] == 'C05'
    assert all(w['person_id'] == 'C05' for w in service.read_case('C05')['workers'])


def test_live_elapsed_expiry_and_planning_window(tmp_path, monkeypatch):
    clock = Clock()
    service = make_service(tmp_path, 'expiry.sqlite3', monkeypatch, clock)
    current = execute(service.start())
    execute(service.command('P03', {'command_id': 'issue', 'expected_version': current['version'],
        'action': 'issue', 'payload': {}}))
    clock.advance(6 * 60)
    execute(service.catch_up())
    current = service.read_case('P03')
    assert current['runs'][0]['http_status'] == 200
    assert 'reading_stale' in current['capture']['response']['heat']['clearance_blockers']
    assert sum(e['id'] == 'escalate' for e in current['story']['events']) == 1
    clock.advance(145 * 60)
    execute(service.catch_up())
    current = service.read_case('P03')
    assert current['time']['status'] == 'ended'
    assert current['clock'] == '2025-08-04T10:30:00+04:00'
    assert 'civil_heavy' in current['capture']['response']['heat']['held_task_ids']
