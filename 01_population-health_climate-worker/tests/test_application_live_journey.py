"""Opt-in live HTTP journey through ADK graph and the synthetic solver.

Run with RUN_LIVE_APPLICATION=1 pytest -q tests/test_application_live_journey.py
while the solver is available at HEAT_SOLVER_URL (default localhost:8765).
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta

import pytest

from heat_safe.application.service import CaseService
from heat_safe.application import storage

pytestmark = pytest.mark.skipif(os.getenv('RUN_LIVE_APPLICATION') != '1', reason='opt-in live solver journey')
BASE = datetime.fromisoformat('2025-08-04T08:00:00+04:00')


def time_of(minute: int, second: int = 0):
    return (BASE + timedelta(minutes=minute, seconds=second)).isoformat()


def execute(coro):
    return asyncio.run(coro)


def make_service(tmp_path, name, monkeypatch):
    url = os.getenv('POSTGRES_TEST_URL')
    if not url:
        return CaseService(tmp_path / name)
    from sqlalchemy.engine import make_url
    assert make_url(url).database.endswith('_test'), 'Live tests require a disposable *_test database'
    monkeypatch.setenv('DATABASE_URL', url)
    service = CaseService()
    with storage.connection() as db:
        db.execute('TRUNCATE events, runs, cases, sessions RESTART IDENTITY CASCADE')
    return service


def test_live_shift_journey(tmp_path, monkeypatch):
    service=make_service(tmp_path, 'journey.sqlite3', monkeypatch)
    current=execute(service.start())
    assert current['capture']['response']['heat']['held_task_ids']==['civil_heavy']
    assert current['runs'][0]['graph_events'][-1]=='blocked_path'

    def clock(minute,second=0):
        nonlocal current
        current=execute(service.advance_clock(time_of(minute,second)))
        return current

    def act(actor,action,payload=None):
        nonlocal current
        current=execute(service.command(actor,{
            'command_id':str(uuid.uuid4()), 'expected_version':current['version'],
            'action':action, 'payload':payload or {},
        }))
        assert current['runs'][0]['http_status']==200, (action,current['runs'][0])
        return current

    crew=[f'C{i:02}' for i in range(2,13)]
    clock(1); act('P03','issue')
    clock(2); act('C01','acknowledge')
    clock(3); act('C01','stop')
    clock(4); act('C05','checkin'); act('C01','recover',{'person_ids':crew,'zone_id':'shelter_a'})
    clock(10,30)
    act('C01','readiness',{'confirmations':[
        {'person_id':pid,'status':'ready','basis':'Supervisor observed readiness for the covered workshop task',
         'valid_until':time_of(150)} for pid in ('C05','C06','C07','C08')
    ]})
    clock(11)
    act('C01','activity',{'intervals':[
        {'person_id':pid,'kind':'recovery','task_id':None,'zone_id':'shelter_a',
         'starts_at':time_of(4),'ends_at':time_of(11)} for pid in crew
    ]})
    response=current['capture']['response']
    assert response['crew_rest']['planning_status']=='planned'
    assert response['crew_rest']['useful_worker_minutes']==120
    assert response['plan_check']['accepted'] is True
    assert current['runs'][0]['graph_events'][-2:]==['check_plan','planned_path']
    selected=sorted({i['person_id'] for i in response['crew_rest']['intervals'] if i['kind']=='work'})
    assert selected==['C05','C06','C07','C08']
    act('C01','assign',{'person_ids':selected})
    clock(18)
    act('C01','activity',{'intervals':[
        {'person_id':pid,'kind':'work' if pid in selected else 'recovery',
         'task_id':'workshop_prep' if pid in selected else None,
         'zone_id':'workshop' if pid in selected else 'shelter_a',
         'starts_at':time_of(11),'ends_at':time_of(18)} for pid in crew
    ]})
    act('C08','report')
    assert 'C08' in current['capture']['response']['protective_response']['excluded_worker_ids']
    act('C01','incident_record')
    act('C01','remove',{'location_id':'welfare'})
    act('P06','firstaid')
    assert current['capture']['response']['crew_rest']['useful_worker_minutes']==90
    act('C01','leila',{'confirmations':[
        {'person_id':'C09','status':'ready','basis':'Supervisor observed readiness for the covered workshop task',
         'valid_until':time_of(150)},
    ]})
    assert current['capture']['response']['crew_rest']['useful_worker_minutes']==120
    for action in ('draftDelivery','approveDelivery','sendDelivery','acceptDelivery'):
        act('P05',action)
    act('P02','handover'); act('P01','costReview')
    clock(19)
    act('C01','activity',{'intervals':[
        {'person_id':pid,'kind':'unavailable' if pid=='C08' else 'work' if pid in {'C05','C06','C07'} else 'recovery',
         'task_id':'workshop_prep' if pid in {'C05','C06','C07'} else None,
         'zone_id':'welfare' if pid=='C08' else 'workshop' if pid in {'C05','C06','C07'} else 'shelter_a',
         'starts_at':time_of(18),'ends_at':time_of(19)} for pid in crew
    ]})
    act('P03','fresh',{'reading':{
        'sensor_id':'t1','zone_id':'civil_exposed','twl':170.0,'unit':'W/m²','quality':'valid',
        'measured_at':time_of(19),'received_at':time_of(19),
    }})
    for actor,action in [('P04','permit'),('C01','personnel'),('C01','recovery_check'),
                         ('P03','water'),('C01','crew_readiness')]:
        act(actor,action,{'status':'confirmed'})
    assert current['capture']['response']['restart']['status']=='ready_for_human_review'
    act('P02','review')
    assert 'civil_heavy' in current['capture']['response']['heat']['held_task_ids']
    assert current['capture']['response']['restart']['status']=='ready_for_human_review'
    assert current['story']['reviewed']
    assert all(run['applied'] for run in service.runs() if run['status']=='completed')


@pytest.mark.parametrize(('minute','expected'),[
    (6,'reading_stale'), (270,'midday_restriction'),
])
def test_live_stale_and_midday_holds(tmp_path, minute, expected, monkeypatch):
    service=make_service(tmp_path, f'hold-{minute}.sqlite3', monkeypatch)
    execute(service.start())
    execute(service.advance_clock(time_of(1)))
    execute(service.command('P03',{'command_id':'issue','expected_version':1,'action':'issue','payload':{}}))
    case=execute(service.advance_clock(time_of(minute)))
    assert case['runs'][0]['http_status']==200
    heat=case['capture']['response']['heat']
    assert expected in heat['clearance_blockers']
    assert 'civil_heavy' in heat['held_task_ids']
    assert expected in next(c['reason_codes'] for c in heat['controls'] if c['task_id']=='civil_heavy')
