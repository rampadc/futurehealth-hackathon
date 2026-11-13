"""A solver retry is a new run, never new human evidence."""
import asyncio

import pytest

from heat_safe.application import service as module


def execute(coro):
    return asyncio.run(coro)


def test_retry_same_version_and_scope(tmp_path,monkeypatch):
    calls=[]
    async def graph(request,_url):
        calls.append(request['request_id'])
        status='unknown' if len(calls)==1 else 'planned'
        return 200,{
            'heat':{'held_task_ids':['civil_heavy']},
            'protective_response':{},
            'crew_rest':{'planning_status':status,'solver_status':'UNKNOWN' if status=='unknown' else 'OPTIMAL',
                         'intervals':[],'blockers':['optimizer_unknown'] if status=='unknown' else []},
            'restart':{'status':'blocked'},
        },['project_evidence','plan','route_decision']
    monkeypatch.setattr(module,'run_graph',graph)
    service=module.CaseService(tmp_path/'retry.sqlite3')
    before=execute(service.start())
    assert before['retry_available'] is False  # Unscoped presenter view.
    assert service.read_case('P02')['retry_available'] is True
    with pytest.raises(module.CaseError) as forbidden:
        execute(service.retry('C05',0))
    assert forbidden.value.status==403
    with pytest.raises(module.CaseError) as stale:
        execute(service.retry('P02',1))
    assert stale.value.status==409
    after=execute(service.retry('P02',0))
    assert after['version']==0
    assert after['story']['events']==[]
    assert after['capture']['response']['crew_rest']['planning_status']=='planned'
    assert len(service.runs())==2
    assert calls==[before['request']['request_id']]*2
    assert after['retry_available'] is False
    with pytest.raises(module.CaseError) as no_retry:
        execute(service.retry('P02',0))
    assert no_retry.value.status==409


def test_failed_retry_keeps_previous_capture(tmp_path,monkeypatch):
    calls=0
    async def graph(request,_url):
        nonlocal calls
        calls+=1
        if calls==2: return 0,{'error':'connection unavailable'},['solver_error']
        return 200,{'heat':{'held_task_ids':['civil_heavy']},'protective_response':{},
                    'crew_rest':{'planning_status':'unknown','solver_status':'UNKNOWN','intervals':[],
                                 'blockers':['optimizer_unknown']},'restart':{'status':'blocked'}},['plan']
    monkeypatch.setattr(module,'run_graph',graph)
    service=module.CaseService(tmp_path/'retry.sqlite3')
    initial=execute(service.start())
    after=execute(service.retry('P03',0))
    assert after['version']==0
    assert after['capture']==initial['capture']
    assert after['runs'][0]['status']=='failed'
    assert after['retry_available'] is True
