"""Elapsed case state keeps evidence time and proposed work separate."""
import asyncio
import copy
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from heat_safe.application import service as module


def run(value):
    return asyncio.run(value)


class Clock:
    def __init__(self):
        self.value=datetime(2026,11,16,tzinfo=timezone.utc)

    def __call__(self):
        return self.value

    def advance(self, **kwargs):
        self.value+=timedelta(**kwargs)


@pytest.fixture
def setup_case(tmp_path,monkeypatch):
    async def graph(request,_url):
        plan=request.get('planning')
        intervals=[]
        if plan:
            start=max(datetime.fromisoformat(plan['work_not_before']),
                      datetime.fromisoformat(request['decision_at'])+timedelta(minutes=4))
            intervals=[{'person_id':'C05','kind':'work','task_id':'workshop_prep','zone_id':'workshop',
                        'starts_at':start.isoformat(),'ends_at':(start+timedelta(minutes=10)).isoformat()}]
        return 200,{'crew_rest':{'planning_status':'planned' if plan else 'blocked','intervals':intervals},
                    'plan_check':{'accepted':bool(plan)},'protective_response':{'excluded_worker_ids':[]},
                    'restart':{'status':'blocked'}},['stub']
    monkeypatch.setattr(module,'run_graph',graph)
    clock=Clock()
    case=module.CaseService(tmp_path/'case.sqlite3',now=clock)
    run(case.start())
    return case,clock


def command(case,actor,action,payload=None,key=None):
    return run(case.command(actor,{'action':action,'command_id':key or action,
            'expected_version':case.read_case(actor)['version'],'payload':payload or {}}))


def recovered(case):
    command(case,'P03','issue')
    command(case,'C01','acknowledge')
    command(case,'C01','stop')
    command(case,'C05','checkin')
    command(case,'C01','recover',{'person_ids':[f'C{i:02}' for i in range(2,13)],'zone_id':'shelter_a'})


def observed(case,clock):
    recovered(case)
    command(case,'C01','readiness',{'confirmations':[{'person_id':'C05','status':'ready',
             'basis':'Observed cooled recovery','valid_until':'2025-08-04T09:00:00+04:00'}]})
    clock.advance(minutes=2)
    return command(case,'C01','activity',{'through_now':True,'observed':True,
        'groups':[{'person_ids':[f'C{i:02}' for i in range(2,13)],'kind':'recovery','zone_id':'shelter_a'}]})


def test_elapsed_ticks_do_not_churn_version_and_escalation_is_once_at_due(setup_case):
    case,clock=setup_case
    command(case,'P03','issue')
    version=case.read_case()['version']
    clock.advance(minutes=1)
    assert case.read_case()['version']==version
    run(case.catch_up())
    assert case.read_case()['version']==version
    assert case.read_case()['capture']['request']['decision_at']=='2025-08-04T08:01:00+04:00'
    clock.advance(minutes=1)
    run(case.catch_up())
    first=case.read_case()
    assert first['version']==version+1
    assert next(e for e in first['story']['events'] if e['id']=='escalate')['occurred_at']=='2025-08-04T08:02:00+04:00'
    clock.advance(minutes=3)
    run(case.catch_up())
    assert case.read_case()['version']==first['version']


def test_headcount_coverage_and_approved_start_are_distinct(setup_case):
    case,clock=setup_case
    recovered(case)
    head=case.read_case()['headcount']
    assert (head['checked_in_count'],head['confirmed_count'])==(1,11)
    assert head['arrivals']==[{'person_id':'C05','checked_in_at':head['arrivals'][0]['checked_in_at']}]
    review=command(case,'P10','coverage_review',{'policy_id':'heat-rest-schedule-v1',
        'status':'needs_verification','crew_ids':[f'C{i:02}' for i in range(2,13)],
        'roster_verified':False,'note':'Roster pending'})
    assert review['version']>0
    assert 'crew_ids' not in case.heat_rest('C05')['coverage_review']
    assert 'note' not in case.heat_rest('C05')['coverage_review']
    assert case.heat_rest('P10')['review_queue']['confirmed_count']==11
    assert case.heat_rest('P01')['records']['arrivals']==[]
    assert case.heat_rest('P01')['commercial_summary']['coverage_status']=='needs_verification'
    command(case,'C01','readiness',{'confirmations':[{'person_id':'C05','status':'ready',
             'basis':'Observed cooled recovery','valid_until':'2025-08-04T09:00:00+04:00'}]})
    clock.advance(minutes=2)
    view=command(case,'C01','activity',{'through_now':True,'observed':True,
        'groups':[{'person_ids':[f'C{i:02}' for i in range(2,13)],'kind':'recovery','zone_id':'shelter_a'}]})
    assessment=view['plan_assessment']
    assert assessment['status']=='proposed'
    assert assessment['request']['snapshot']['activity_history']
    command(case,'C01','assign',{'assessment_id':assessment['id']})
    assert next(w for w in case.read_case()['request']['snapshot']['workers'] if w['person_id']=='C05')['location_id']=='shelter_a'
    clock.advance(minutes=4)
    started=command(case,'C01','start_work',{'assessment_id':assessment['id'],'person_ids':['C05'],
        'observed_recovery':True,'prerequisites_confirmed':True})
    assert started['plan_assessment']['started_worker_ids']==['C05']
    assert next(w for w in started['request']['snapshot']['workers'] if w['person_id']=='C05')['location_id']=='workshop'


def test_unapproved_plan_expires(setup_case):
    case,clock=setup_case
    view=observed(case,clock)
    assessment=view['plan_assessment']
    clock.advance(minutes=4)
    assert case.read_case()['plan_assessment']['status']=='expired'
    with pytest.raises(module.CaseError) as exc:
        command(case,'C01','assign',{'assessment_id':assessment['id']})
    assert exc.value.status==409


def test_late_acknowledgment_still_records_due_escalation(setup_case):
    case,clock=setup_case
    command(case,'P03','issue')
    clock.advance(minutes=3)
    command(case,'C01','acknowledge')
    run(case.catch_up())
    timeline=case.read_case()['story']['events']
    assert next(e for e in timeline if e['id']=='escalate')['occurred_at']=='2025-08-04T08:02:00+04:00'
    assert sum(e['id']=='escalate' for e in timeline)==1


def test_legacy_case_is_historical_until_reset(setup_case):
    case,_=setup_case
    with case._conn() as db:
        db.execute('UPDATE cases SET started_at=NULL')
    assert case.read_case()['time']['status']=='historical'
    with pytest.raises(module.CaseError) as exc:
        command(case,'P03','issue')
    assert exc.value.status==409
    assert run(case.reset())['time']['mode']=='elapsed'


def test_observed_work_return_allows_replanning_after_report(setup_case):
    case,clock=setup_case
    assessment=observed(case,clock)['plan_assessment']
    command(case,'C01','assign',{'assessment_id':assessment['id']})
    clock.advance(minutes=4)
    command(case,'C01','start_work',{'assessment_id':assessment['id'],'person_ids':['C05'],
            'observed_recovery':True,'prerequisites_confirmed':True})
    command(case,'C08','report')
    assert case.read_case()['plan_assessment']['status']=='expired'
    command(case,'C01','incident_record')
    command(case,'C01','remove',{'location_id':'welfare'})
    command(case,'P06','firstaid')
    clock.advance(minutes=2)
    command(case,'C01','start_recovery',{'person_ids':['C05'],'zone_id':'shelter_a','observed_work':True})
    clock.advance(minutes=2)
    view=command(case,'C01','activity',{'through_now':True,'observed':True,
        'groups':[{'person_ids':[f'C{i:02}' for i in range(2,13) if i!=8],
                   'kind':'recovery','zone_id':'shelter_a'}]},key='activity-after-report')
    request=view['capture']['request']
    assert view['plan_assessment']['id']!=assessment['id']
    assert view['plan_assessment']['status']=='proposed'
    assert next(t for t in view['tasks'] if t['action']=='assign')['status']=='ready'
    command(case,'C01','assign',{'assessment_id':view['plan_assessment']['id']},key='assign-after-report')
    assert request['planning'] is not None
    assert {i['person_id'] for i in request['snapshot']['activity_history']}=={f'C{i:02}' for i in range(2,13) if i!=8}
    assert next(w for w in request['snapshot']['workers'] if w['person_id']=='C05')['location_id']=='shelter_a'
    pytest.importorskip('ortools')
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'demo/solver'))
    from operations.contracts import Request
    from operations.planning import solve_plan
    assert solve_plan(Request.model_validate(request)).planning_status=='planned'


def test_review_uses_exact_current_evidence_age(setup_case,monkeypatch):
    case,clock=setup_case
    async def ready_graph(request,_url):
        return 200,{'crew_rest':{'planning_status':'blocked','intervals':[]},
                    'protective_response':{'excluded_worker_ids':[]},
                    'restart':{'status':'ready_for_human_review'}},['stub']
    monkeypatch.setattr(module,'run_graph',ready_graph)
    command(case,'C08','report')
    command(case,'C01','incident_record')
    command(case,'C01','remove')
    command(case,'P06','firstaid')
    command(case,'P03','fresh',{'measured_now':True,'reading':{'sensor_id':'t1',
        'zone_id':'civil_exposed','twl':180.0,'unit':'W/m²','quality':'valid'}})
    for actor,action in [('P04','permit'),('C01','personnel'),('C01','recovery_check'),
                         ('P03','water'),('C01','crew_readiness')]:
        command(case,actor,action,{'status':'confirmed'})
    clock.advance(minutes=5,seconds=1)
    with pytest.raises(module.CaseError) as exc:
        command(case,'P02','review')
    assert exc.value.status==409


def test_work_start_rejects_short_observed_recovery(setup_case,monkeypatch):
    case,clock=setup_case
    async def early_graph(request,_url):
        plan=request.get('planning')
        intervals=[]
        if plan:
            start=datetime.fromisoformat(plan['work_not_before'])
            intervals=[{'person_id':'C05','kind':'work','task_id':'workshop_prep','zone_id':'workshop',
                        'starts_at':start.isoformat(),'ends_at':(start+timedelta(minutes=10)).isoformat()}]
        return 200,{'crew_rest':{'planning_status':'planned' if plan else 'blocked','intervals':intervals},
                    'plan_check':{'accepted':bool(plan)},'protective_response':{'excluded_worker_ids':[]},
                    'restart':{'status':'blocked'}},['stub']
    monkeypatch.setattr(module,'run_graph',early_graph)
    assessment=observed(case,clock)['plan_assessment']
    command(case,'C01','assign',{'assessment_id':assessment['id']})
    clock.advance(minutes=2)
    with pytest.raises(module.CaseError) as exc:
        command(case,'C01','start_work',{'assessment_id':assessment['id'],'person_ids':['C05'],
            'observed_recovery':True,'prerequisites_confirmed':True})
    assert exc.value.status==409


def test_employer_case_view_has_no_clinical_or_solver_records(setup_case):
    case,_=setup_case
    recovered(case)
    command(case,'C08','report')
    command(case,'C01','incident_record')
    command(case,'C01','remove',{'location_id':'welfare'})
    command(case,'P06','firstaid')
    view=case.read_case('P10')
    assert view['request'] is None and view['capture'] is None and view['plan_assessment'] is None
    assert view['runs']==[] and view['workers']==[] and not view['retry_available']
    assert {event['id'] for event in view['story']['events']}=={'issue','acknowledge','stop','checkin','recover'}
    assert not any(key in view['story'] for key in ('reported','removed','firstaid','assigned'))
    assert [task['action'] for task in view['tasks']]==['coverage_review']
    assert case.heat_rest('P10')['records']['headcount']['confirmed_count']==11


def test_incident_first_headcount_keeps_removed_worker_in_welfare(setup_case):
    case,_=setup_case
    command(case,'P03','issue')
    command(case,'C01','acknowledge')
    command(case,'C01','stop')
    command(case,'C05','checkin')
    command(case,'C08','report')
    with pytest.raises(module.CaseError,match='welfare location'):
        command(case,'C01','recover',{'person_ids':[f'C{i:02}' for i in range(2,13)],'zone_id':'shelter_a'})
    command(case,'C01','incident_record')
    command(case,'C01','remove',{'location_id':'welfare'})
    command(case,'P06','firstaid')
    view=command(case,'C01','recover',{'person_ids':[f'C{i:02}' for i in range(2,13)],'zone_id':'shelter_a'})
    assert (view['headcount']['confirmed_count'],view['headcount']['cooled_recovery_count'],
            view['headcount']['welfare_count'])==(11,10,1)
    for worker in ('C05','C08'):
        assert 'cooled_recovery_count' not in case.read_case(worker)['headcount']
        assert 'welfare_count' not in case.read_case(worker)['headcount']
        assert 'cooled_recovery_count' not in case.heat_rest(worker)['records']['headcount']
        assert 'welfare_count' not in case.heat_rest(worker)['records']['headcount']
    snap=view['request']['snapshot']
    assert len(snap['recovery']['person_ids'])==10 and 'C08' not in snap['recovery']['person_ids']
    assert next(w for w in snap['workers'] if w['person_id']=='C08')['location_id']=='welfare'
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'demo/solver'))
    from operations.contracts import Request
    from operations.common import validate_request
    validate_request(Request.model_validate(view['capture']['request']))


def test_repeated_work_start_does_not_call_solver_again(setup_case,monkeypatch):
    case,clock=setup_case
    assessment=observed(case,clock)['plan_assessment']
    command(case,'C01','assign',{'assessment_id':assessment['id']})
    clock.advance(minutes=4)
    payload={'assessment_id':assessment['id'],'person_ids':['C05'],
             'observed_recovery':True,'prerequisites_confirmed':True}
    command(case,'C01','start_work',payload)
    version=case.read_case()['version']
    async def failed_graph(_request,_url):
        raise AssertionError('idempotent retry must not invoke solver')
    monkeypatch.setattr(module,'run_graph',failed_graph)
    command(case,'C01','start_work',payload)
    assert case.read_case()['version']==version


def test_signal_is_closed_for_historical_and_ended_cases(setup_case):
    case,clock=setup_case
    reading=copy.deepcopy(module.SEED['snapshot']['readings'][0])
    with case._conn() as db:
        db.execute('UPDATE cases SET started_at=NULL')
    with pytest.raises(module.CaseError) as historical:
        run(case.signal('reading',reading))
    assert historical.value.status==409
    run(case.reset())
    clock.advance(hours=2,minutes=30)
    with pytest.raises(module.CaseError) as ended:
        run(case.signal('reading',reading))
    assert ended.value.status==409


def test_case_id_binds_commands_retries_and_signals_across_reset(setup_case):
    case,_=setup_case
    old=case.read_case()['case_id']
    run(case.reset())
    new=case.read_case()
    assert new['version']==0 and new['case_id']!=old
    with pytest.raises(module.CaseError) as command_error:
        run(case.command('P03',{'case_id':old,'command_id':'old','expected_version':0,
                                'action':'issue','payload':{}}))
    assert command_error.value.status==409
    with pytest.raises(module.CaseError) as retry_error:
        run(case.retry('P03',0,case_id=old))
    assert retry_error.value.status==409
    with pytest.raises(module.CaseError) as signal_error:
        run(case.signal('reading',copy.deepcopy(module.SEED['snapshot']['readings'][0]),case_id=old))
    assert signal_error.value.status==409


def test_actual_workshop_occupancy_blocks_new_cohort(setup_case,monkeypatch):
    case,clock=setup_case
    first=observed(case,clock)['plan_assessment']
    command(case,'C01','assign',{'assessment_id':first['id']})
    clock.advance(minutes=4)
    command(case,'C01','start_work',{'assessment_id':first['id'],'person_ids':['C05'],
        'observed_recovery':True,'prerequisites_confirmed':True})
    replacements=['C06','C07','C09','C10']
    command(case,'C01','readiness',{'confirmations':[{'person_id':pid,'status':'ready',
        'basis':'Observed cooled recovery','valid_until':'2025-08-04T09:00:00+04:00'} for pid in replacements]},key='new-readiness')
    async def next_graph(request,_url):
        plan=request.get('planning')
        intervals=[]
        if plan:
            start=datetime.fromisoformat(request['decision_at'])+timedelta(minutes=4)
            intervals=[{'person_id':pid,'kind':'work','task_id':'workshop_prep','zone_id':'workshop',
                'starts_at':start.isoformat(),'ends_at':(start+timedelta(minutes=10)).isoformat()} for pid in replacements]
        return 200,{'crew_rest':{'planning_status':'planned' if plan else 'blocked','intervals':intervals},
                    'plan_check':{'accepted':bool(plan)},'protective_response':{'excluded_worker_ids':[]},
                    'restart':{'status':'blocked'}},['stub']
    monkeypatch.setattr(module,'run_graph',next_graph)
    clock.advance(minutes=1)
    remaining=[f'C{i:02}' for i in range(2,13) if i!=5]
    new=command(case,'C01','activity',{'through_now':True,'observed':True,'groups':[
        {'person_ids':['C05'],'kind':'work','zone_id':'workshop'},
        {'person_ids':remaining,'kind':'recovery','zone_id':'shelter_a'}]},key='activity-new-cohort')['plan_assessment']
    command(case,'C01','assign',{'assessment_id':new['id']},key='assign-new-cohort')
    clock.advance(minutes=4)
    with pytest.raises(module.CaseError,match='occupancy'):
        command(case,'C01','start_work',{'assessment_id':new['id'],'person_ids':replacements,
            'observed_recovery':True,'prerequisites_confirmed':True},key='start-new-cohort')


def test_project_manager_receives_aggregate_commercial_evidence(setup_case):
    case,clock=setup_case
    plan=observed(case,clock)['plan_assessment']
    command(case,'P10','coverage_review',{'policy_id':'heat-rest-schedule-v1','status':'confirmed',
        'crew_ids':[f'C{i:02}' for i in range(2,13)],'roster_verified':True,'note':'Internal roster note'})
    command(case,'C01','assign',{'assessment_id':plan['id']})
    for action in ('draftDelivery','approveDelivery','sendDelivery','acceptDelivery'):
        command(case,'P05',action)
    clock.advance(minutes=4)
    command(case,'C01','start_work',{'assessment_id':plan['id'],'person_ids':['C05'],
        'observed_recovery':True,'prerequisites_confirmed':True})
    command(case,'C08','report')
    command(case,'C01','incident_record')
    command(case,'C01','remove',{'location_id':'welfare'})
    command(case,'P06','firstaid')
    clock.advance(minutes=2)
    command(case,'C01','start_recovery',{'person_ids':['C05'],'zone_id':'shelter_a','observed_work':True})
    command(case,'P02','handover')
    command(case,'P01','costReview')
    summary=case.heat_rest('P01')['commercial_summary']
    assert summary['confirmed_count']==11
    assert summary['employer_review']=={'status':'confirmed','roster_verified':True,
        'reviewed_at':case.heat_rest('P10')['coverage_review']['reviewed_at']}
    assert summary['confirmed_time']['recovery_worker_minutes']==26
    assert summary['confirmed_time']['workshop_worker_minutes']==2
    assert summary['delivery']['status']=='accepted'
    assert [m['action'] for m in summary['delivery']['milestones']]==[
        'draftDelivery','approveDelivery','sendDelivery','acceptDelivery']
    assert summary['cost_review_at'] is not None
    assert not {'report','incident_record','remove','firstaid'} & {e['action'] for e in summary['chronology']}
    assert all(item['status']=='open' for item in summary['unresolved_questions'])
    assert 'Internal roster note' not in str(summary)
    with case._conn() as db:
        active=case._active(db)
        work=json.loads(db.execute("SELECT payload FROM events WHERE case_id=? AND action='start_recovery'",(active['id'],)).fetchone()['payload'])['work_intervals'][0]
        db.execute('INSERT INTO events(case_id,command_id,actor_id,action,occurred_at,payload) VALUES (?,?,?,?,?,?)',
                   (active['id'],'duplicate-observed-work','C01','activity',active['clock'],json.dumps({'intervals':[work]})))
        db.execute('UPDATE cases SET version=version+1 WHERE id=?',(active['id'],))
    assert case.heat_rest('P01')['commercial_summary']['confirmed_time']==summary['confirmed_time']


def test_project_manager_case_view_excludes_clinical_and_worker_records(setup_case):
    case,_=setup_case
    recovered(case)
    command(case,'C08','report',{'note':'private-symptom-marker'})
    command(case,'C01','incident_record',{'note':'private-clinical-marker'})
    command(case,'C01','remove',{'location_id':'welfare'})
    command(case,'P06','firstaid')
    view=case.read_case('P01')
    assert view['request'] is None and view['capture'] is None and view['plan_assessment'] is None
    assert view['runs']==[] and view['workers']==[] and not view['retry_available']
    assert view['headcount']['arrivals']==[]
    assert [task['action'] for task in view['tasks']]==['costReview']
    assert not {'report','incident_record','remove','firstaid','readiness','leila'} & {
        item['id'] for item in view['story']['events']}
    assert not any(item['id']=='checkin' or item.get('actorId')=='C05' for item in view['story']['events'])
    assert not {'reported','removed','firstaid'} & set(view['story'])
    serialized=json.dumps(view)
    assert 'private-symptom-marker' not in serialized and 'private-clinical-marker' not in serialized
    assert 'person_id' not in serialized
    assert 'private-symptom-marker' not in json.dumps(case.heat_rest('P01'))
