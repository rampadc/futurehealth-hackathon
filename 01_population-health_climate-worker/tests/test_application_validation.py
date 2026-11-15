"""Bad observations never enter the append-only case ledger."""
import asyncio
import math

import pytest

from heat_safe.application import service as module


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def case(tmp_path, monkeypatch):
    async def graph(request, _url):
        return 200, {
            'heat': {'held_task_ids':['civil_heavy']},
            'protective_response': {},
            'crew_rest': {'planning_status':'planned','intervals':[
                {'person_id':'C05','kind':'work','task_id':'workshop_prep','zone_id':'workshop',
                 'starts_at':request['decision_at'],'ends_at':'2025-08-04T08:15:00+04:00',
                 'requires_revalidation':True}], 'blockers':[]},
            'restart': {'status':'blocked'},
        }, ['stub']
    monkeypatch.setattr(module,'run_graph',graph)
    service=module.CaseService(tmp_path/'case.sqlite3')
    current=run(service.start())
    for actor,action in [('P03','issue'),('C01','acknowledge'),('C01','stop'),('C05','checkin')]:
        current=run(service.command(actor,{'command_id':action,'expected_version':current['version'],'action':action,'payload':{}}))
    current=run(service.command('C01',{'command_id':'recover','expected_version':current['version'],
        'action':'recover','payload':{'person_ids':[f'C{i:02}' for i in range(2,13)],'zone_id':'shelter_a'}}))
    return service


def assert_rejected_unchanged(case, actor, action, payload):
    before=case.read_case(actor)['version']
    with case._conn() as db:
        count=db.execute('SELECT COUNT(*) FROM events').fetchone()[0]
    with pytest.raises(module.CaseError) as error:
        run(case.command(actor,{'command_id':f'bad-{before}','expected_version':before,
                                'action':action,'payload':payload}))
    assert error.value.status==422
    assert case.read_case(actor)['version']==before
    with case._conn() as db:
        assert db.execute('SELECT COUNT(*) FROM events').fetchone()[0]==count


def interval(**overrides):
    data={'person_id':'C05','kind':'recovery','task_id':None,'zone_id':'shelter_a',
          'starts_at':'2025-08-04T08:00:00+04:00','ends_at':'2025-08-04T08:01:00+04:00'}
    return {**data,**overrides}


@pytest.mark.parametrize('rows',[
    [interval(starts_at='2025-08-04T08:01:00+04:00')],
    [interval(),interval()],
    [interval(kind='work',task_id='workshop_prep',zone_id='welfare')],
    [interval(kind='unavailable',zone_id='shelter_a')],
    [interval(kind='recovery',task_id='workshop_prep')],
])
def test_bad_activity_does_not_commit(case,rows):
    run(case.advance_clock('2025-08-04T08:02:00+04:00'))
    assert_rejected_unchanged(case,'C01','activity',{'intervals':rows})


@pytest.mark.parametrize('value',[True,float('nan'),float('inf'),0,500])
def test_bad_reading_does_not_commit(case,value):
    before=case.read_case()['version']
    reading={'sensor_id':'t1','zone_id':'civil_exposed','twl':value,'unit':'W/m²','quality':'valid',
             'measured_at':'2025-08-04T08:00:00+04:00','received_at':'2025-08-04T08:00:00+04:00'}
    with pytest.raises(module.CaseError) as error:
        run(case.signal('reading',reading))
    assert error.value.status==422
    assert case.read_case()['version']==before


def test_assignment_requires_checked_plan(case):
    current=case.read_case('C01')
    current=run(case.command('C01',{'command_id':'readiness','expected_version':current['version'],
        'action':'readiness','payload':{'confirmations':[{'person_id':'C05','status':'ready',
        'basis':'Observed','valid_until':'2025-08-04T10:00:00+04:00'}]}}))
    with pytest.raises(module.CaseError) as error:
        run(case.command('C01',{'command_id':'assign','expected_version':current['version'],
            'action':'assign','payload':{'person_ids':['C05']}}))
    assert error.value.status==409
    assert case.read_case('C01')['version']==current['version']


@pytest.mark.parametrize('quality,measured_at',[
    ('invalid','2025-08-04T08:30:00+04:00'),   # sensor fault
    ('valid','2025-08-04T08:20:00+04:00'),     # stale: ten minutes old when received
])
def test_fault_and_stale_readings_are_recorded_but_never_count_as_fresh(case,quality,measured_at):
    run(case.advance_clock('2025-08-04T08:30:00+04:00'))
    before=case.read_case()['version']
    reading={'sensor_id':'t1','zone_id':'civil_exposed','twl':180,'unit':'W/m²','quality':quality,
             'measured_at':measured_at,'received_at':'2025-08-04T08:30:00+04:00'}
    view=run(case.signal('reading',reading))
    assert view['version']==before+1
    with case._conn() as db:
        last=db.execute('SELECT actor_id, action FROM events ORDER BY id DESC LIMIT 1').fetchone()
    assert (last['actor_id'],last['action'])==('sensor','sensor_reading')
    fresh=[t for t in view['tasks'] if t['action']=='fresh']
    assert fresh and fresh[0]['status']!='recorded'
