"""Check fixture relations and replay Sandline's deterministic human workflow."""
import copy
import json
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
C = ROOT / 'cross-scenario'

def read(path):
    return json.loads(path.read_text())

def time(value):
    result = datetime.fromisoformat(value)
    assert result.utcoffset() == timedelta(hours=4), value
    return result

def merge(a, b):
    for key, value in b.items():
        if isinstance(value, dict) and isinstance(a.get(key), dict):
            merge(a[key], value)
        else:
            a[key] = copy.deepcopy(value)
    return a

people = {p['id']:p for p in read(C/'personnel.json')}
zones = {z['id']:z for z in read(C/'zones.json')}
tasks = {t['id']:t for t in read(C/'tasks.json')}
assets = {a['id']:a for a in read(C/'assets.json')}
orgs = {o['id'] for o in read(C/'organisations.json')}
sources = {s['id']:s for s in read(C/'sources.json')}
policies = read(C/'policies.json')
signal_schema = read(C/'schemas/signal.schema.json')
scenario_schema = read(C/'schemas/scenario.schema.json')
PAYLOAD_KEYS = {
    'forecast':{'max_air_c','source'}, 'recommendation':{'kind','tasks','clearance'},
    'twl':{'zone_id','sensor_id','twl','unit','quality','measured_at'},
    'hold':{'task_id','alert_id','case_id'}, 'ack':{'alert_id','actor_id'},
    'stop':{'task_id','actor_id'}, 'recover':{'person_ids','zone_id'},
    'assign_attempt':{'task_id','person_ids','zone_id','expect_reject'},
    'assign':{'task_id','person_ids','zone_id'}, 'check':{'person_ids','task_id'},
    'delivery_draft':{'delivery_id','new_slot','reason'}, 'delivery_approve':{'actor_id'},
    'delivery_send':{'actor_id','recipient','synthetic_external_message'},
    'delivery_accept':{'actor'}, 'sensor_fail':{'sensor_id'},
    'clearance_attempt':{'zone_id','using_sensor_id','expect_reject'},
    'clock':{'minutes'}, 'escalate':{'alert_id','actor_id'},
    'symptom':{'person_id','observation','case_id'},
    'first_aid':{'person_id','actor_id','action'},
    'restart_attempt':{'task_id','actor_id','expect_reject'},
    'review':{'task_id','actor_id','checks'}, 'restart':{'task_id','actor_id'},
    'handover':{'case_id','references','actor_id','unresolved'},
}
HUMAN_AUTHORITY = {
    'recommendation':{'P03'},'hold':{'P03'},'ack':{'C01'},'stop':{'C01'},
    'recover':{'C01'},'assign_attempt':{'C01'},'assign':{'C01'},'check':{'C01'},
    'delivery_draft':{'P05'},'delivery_approve':{'P05'},'delivery_send':{'P05'},
    'sensor_fail':{'P03'},'clearance_attempt':{'P03'},'escalate':{'P02'},
    'symptom':{'C01'},'first_aid':{'P06'},'restart_attempt':{'C01'},
    'review':{'P02'},'restart':{'P02'},'handover':{'P02'},
}
LIST_KEYS={'tasks','person_ids','affected_zones','checks','references','unresolved'}
BOOL_KEYS={'clearance','synthetic_external_message'}
NUMBER_KEYS={'max_air_c','twl','minutes'}

def shared_checks():
    assert set(signal_schema['required'])=={'event_id','scenario_id','occurred_at','received_at','source','synthetic','type','payload'}
    assert set(scenario_schema['required'])=={'id','title','baseline','initial_overrides','events_file','expected_file'}
    assert len(people) == 36 and len(set(people)) == 36
    assert {crew:sum(p['crew_id']==crew for p in people.values()) for crew in ['principal','civil','electrical','logistics']} == {'principal':8,'civil':14,'electrical':10,'logistics':4}
    assert {p['id'] for p in people.values() if p['acclimatisation'] != 'complete'} == {'C13','C14'}
    assert all(p['organisation_id'] in orgs for p in people.values())
    assert all(p['supervisor_id'] in people and p['communication_language'] for p in people.values())
    crews = read(C/'crews.json')
    assert all(set(c['member_ids']) == {p['id'] for p in people.values() if p['crew_id']==c['id']} and c['lead_id'] in c['member_ids'] for c in crews)
    assert zones['workshop']['capacity']==6 and zones['workshop']['baseline_occupants']==['P07','P08']
    assert zones['shelter_a']['capacity']==24 and zones['shelter_b']['capacity']==16
    assert all(z['sensor_id'] in assets for z in zones.values() if z['type']=='exposed')
    assert all(t['zone_id'] in zones and all(pid in people for pid in t['baseline_assignees']) for t in tasks.values())
    assert all(all(dep in assets or dep in people or dep.startswith('permit_') for dep in t['dependencies']) for t in tasks.values())
    assert all(p['classification'] in {'published_requirement','guidance_or_reported_practice','fictional_site_policy'} and (p.get('source_id') in sources if p.get('source_id') else True) for p in policies)
    assert all(s['url'].startswith('https://') for s in sources.values())
    assert len(read(C/'deliveries.json'))==1
    validate_state(read(C/'baseline_state.json'))

def validate_state(state):
    occupied = []
    for zid, ids in state['occupancy'].items():
        assert zid in zones and len(ids)<=zones[zid]['capacity'] and len(ids)==len(set(ids))
        occupied += ids
    assert len(occupied)==len(set(occupied))
    for tid, ids in state['assignments'].items():
        assert tid in tasks and all(pid in people for pid in ids) and len(ids)==len(set(ids))
    active=[pid for tid,ids in state['assignments'].items() if state['task_status'][tid]=='active' for pid in ids]
    assert len(active)==len(set(active)), 'worker assigned to two active tasks'
    exposed_active=[pid for tid,ids in state['assignments'].items() if state['task_status'][tid]=='active' and zones[tasks[tid]['zone_id']]['type']=='exposed' for pid in ids]
    assert not (set(exposed_active) & set(occupied)), 'worker assigned exposed work while in cooled occupancy'
    assert not (set(state['assignments']['civil_heavy']) & {'C13','C14'})
    for zid, value in state['readings'].items():
        assert value['sensor_id']==zones[zid]['sensor_id'] and 0 < value['twl'] < 500
        time(value['at'])
    time(state['clock'])

def replay(folder, inherited=None):
    meta=read(folder/'scenario.json')
    assert set(scenario_schema['required'])<=set(meta) and isinstance(meta['initial_overrides'],dict)
    assert folder.name==meta['id'] and meta['baseline']=='../cross-scenario/baseline_state.json'
    state=copy.deepcopy(inherited) if inherited is not None else merge(read(C/'baseline_state.json'),meta['initial_overrides'])
    observed=set(); rejected=[]; last=None; last_received=None; pending=None; review=None; seen_ids=set(); notified_symptoms=set()
    for raw in (folder/'signals.jsonl').read_text().splitlines():
        event=json.loads(raw); p=event['payload']; kind=event['type']
        assert {'event_id','scenario_id','occurred_at','received_at','source','synthetic','type','payload'}<=set(event)
        assert set(event)<={'event_id','scenario_id','occurred_at','received_at','source','synthetic','type','payload','actor_id'}
        assert isinstance(event['event_id'],str) and isinstance(event['scenario_id'],str) and isinstance(p,dict)
        assert kind in PAYLOAD_KEYS and PAYLOAD_KEYS[kind]<=set(p), (folder.name,kind)
        for key in PAYLOAD_KEYS[kind]:
            value=p[key]
            if key in LIST_KEYS: assert isinstance(value,list) and all(isinstance(v,str) for v in value)
            elif key in BOOL_KEYS: assert isinstance(value,bool)
            elif key in NUMBER_KEYS: assert isinstance(value,(int,float)) and not isinstance(value,bool)
            else: assert isinstance(value,str)
        if kind in HUMAN_AUTHORITY: assert event.get('actor_id') in HUMAN_AUTHORITY[kind]
        if 'actor_id' in event: assert event['actor_id'] in people and event['actor_id']==p.get('actor_id',event['actor_id'])
        assert event['event_id'] not in seen_ids; seen_ids.add(event['event_id'])
        assert event['scenario_id']==folder.name and event['source']=='synthetic_fixture' and event['synthetic'] is True
        now=time(event['occurred_at']); received=time(event['received_at']); assert received>=now
        assert last is None or now>=last
        assert last_received is None or now>=last_received, 'decision cannot precede receipt of prior signal'
        if inherited is not None: assert now>=time(state['clock'])
        last=now; last_received=received; state['clock']=event['occurred_at']
        if kind=='forecast':
            assert p['max_air_c']>35 and 'background' in p['source']
            assert p['affected_zones']==['civil_exposed','yard'] and len(p['forecast_window'].split('/'))==2
            observed.add('forecast_used_for_planning')
        elif kind=='recommendation':
            assert p['clearance'] is False and p['delivery_id']==state['delivery']['id'] and p['decision_owner']=='P02'
            assert p['proposed_task_window'].endswith('11:00:00+04:00')
            observed.add('no_safety_clearance')
        elif kind=='twl':
            assert zones[p['zone_id']]['sensor_id']==p['sensor_id'] and state['sensor_status'][p['sensor_id']]=='serviceable'
            assert p['unit']=='W/m²' and p['quality']=='valid' and time(p['measured_at'])==now
            state['readings'][p['zone_id']]={'twl':p['twl'],'at':event['occurred_at'],'sensor_id':p['sensor_id']}
            if tasks['civil_heavy']['zone_id']==p['zone_id'] and p['twl']<=150:
                state['task_status']['civil_heavy']='held'
        elif kind=='hold':
            task=tasks[p['task_id']]; reading=state['readings'][task['zone_id']]
            assert task['kind']=='heavy_exposed' and state['task_status'][p['task_id']]=='held' and reading['twl']<=150 and now-time(reading['at'])<=timedelta(minutes=5)
            state['case_id']=p['case_id']
            state['alerts'][p['alert_id']]={'task_id':p['task_id'],'status':'open','acknowledged':False,'at':event['occurred_at']}
            state['evidence'].append({'kind':'hold','id':p['alert_id'],'at':event['occurred_at']}); observed.update(['local_heavy_hold','hold_open'])
        elif kind=='ack':
            alert=state['alerts'][p['alert_id']]; assert p['actor_id']=='C01' and alert['status']=='open'
            alert['acknowledged']=True; alert['status']='acknowledged'; observed.add('foreman_acknowledged')
        elif kind=='stop':
            assert state['task_status'][p['task_id']]=='held' and p['actor_id']=='C01'
            alert=next(a for a in state['alerts'].values() if a['task_id']==p['task_id'])
            assert alert['acknowledged']; alert['status']='stopped'; observed.add('work_stopped')
        elif kind=='recover':
            assert zones[p['zone_id']]['type']=='cooled'
            ids=p['person_ids']; assert set(ids).issubset(set(state['assignments']['civil_heavy']))
            state['occupancy'][p['zone_id']]+=ids; observed.add('recovery_recorded')
        elif kind in ('assign_attempt','assign'):
            ids=p['person_ids']; zid=p['zone_id']; task=tasks[p['task_id']]
            assert zid==task['zone_id'] and all(pid in people for pid in ids)
            free=zones[zid]['capacity']-len(state['occupancy'][zid]) if 'capacity' in zones[zid] else 999
            qualified=all(set(task['required_qualifications']).issubset(people[pid]['qualifications']) for pid in ids)
            acclim=all(people[pid]['acclimatisation']=='complete' or task['kind']=='light_supervised' for pid in ids)
            if kind=='assign_attempt':
                assert not (len(ids)<=free and qualified and acclim)
                reason='capacity_and_qualification' if len(ids)>free else 'acclimatisation'
                assert reason==p['expect_reject']; rejected.append(reason)
                observed.add('whole_crew_rejected' if reason=='capacity_and_qualification' else 'restricted_heavy_assignment_rejected')
            else:
                assert len(ids)<=free and qualified and acclim
                for prior, assigned in state['assignments'].items():
                    if prior!=p['task_id']:
                        state['assignments'][prior]=[pid for pid in assigned if pid not in ids]
                for prior, occupants in state['occupancy'].items():
                    if prior!=zid:
                        state['occupancy'][prior]=[pid for pid in occupants if pid not in ids]
                state['assignments'][p['task_id']]=ids; state['occupancy'][zid]+=ids
                state['task_status'][p['task_id']]='active'
                observed.update(['qualified_subset_reserved','no_double_booking'])
        elif kind=='check':
            assert set(p['person_ids']).issubset(state['assignments'][p['task_id']]) and tasks[p['task_id']]['kind']=='light_supervised'
            observed.add('supervised_light_assignment_preserved')
        elif kind=='delivery_draft':
            assert state['delivery']['status']=='confirmed' and p['delivery_id']==state['delivery']['id']
            pending=p['new_slot']; time(pending); state['delivery']['status']='draft'
        elif kind=='delivery_approve':
            assert pending and p['actor_id']=='P05' and state['delivery']['status']=='draft'
            state['delivery']['status']='approved'; observed.add('draft_approved')
        elif kind=='delivery_send':
            assert state['delivery']['status']=='approved' and p['actor_id']=='P05' and p['synthetic_external_message'] is True
            state['delivery']['status']='sent'; observed.add('request_sent')
        elif kind=='delivery_accept':
            assert state['delivery']['status']=='sent' and p['actor']=='visitor_supplier_dispatch'
            state['delivery'].update(slot=pending,status='confirmed'); observed.update(['supplier_accepted','slot_confirmed_after_acceptance'])
        elif kind=='sensor_fail':
            assert p['sensor_id'] in state['sensor_status']; state['sensor_status'][p['sensor_id']]='failed'; observed.add('civil_measurement_unavailable')
            affected=assets[p['sensor_id']]['zone_id']
            for tid,task in tasks.items():
                if task['zone_id']==affected and zones[affected]['type']=='exposed':state['task_status'][tid]='held'
        elif kind=='clearance_attempt':
            zid=p['zone_id']; sensor=p['using_sensor_id']; local=zones[zid]['sensor_id']
            reason='wrong_zone' if sensor!=local else 'failed_or_stale'
            assert (sensor!=local or state['sensor_status'][sensor]=='failed' or now-time(state['readings'][zid]['at'])>timedelta(minutes=5)) and reason==p['expect_reject']
            rejected.append(reason); observed.add('clearance_blocked')
            if reason=='wrong_zone': observed.add('other_zone_not_substituted')
        elif kind=='clock':
            assert p['minutes']>=2
        elif kind=='escalate':
            alert=state['alerts'][p['alert_id']]
            assert not alert['acknowledged'] and now-time(alert['at'])>=timedelta(minutes=2) and p['actor_id']=='P02'
            alert['status']='escalated'; observed.update(['no_acknowledgment','superintendent_escalated'])
        elif kind=='symptom':
            assert p['person_id'] in people and 'diagnosis' not in p
            state['case_id']=p['case_id']; state['assignments']['civil_heavy'].remove(p['person_id'])
            state['open_items'].append('first aid follow-up for '+p['person_id'])
            notified_symptoms.add(p['person_id']); observed.update(['first_aider_alerted','worker_removed_from_task','no_diagnosis'])
        elif kind=='first_aid':
            assert p['person_id'] in notified_symptoms and p['actor_id']=='P06' and 'diagnosis' not in p and 'referral' in p['action']
            state['evidence'].append({'kind':'first_aid','person_id':p['person_id'],'at':event['occurred_at']})
            observed.add('incident_recorded')
        elif kind=='restart_attempt':
            task=tasks[p['task_id']]; reading=state['readings'][task['zone_id']]
            reason='stale_reading' if now-time(reading['at'])>timedelta(minutes=5) else 'human_review_required'
            assert reason==p['expect_reject']; rejected.append(reason)
            if reason=='stale_reading':state['task_status'][p['task_id']]='held'
            observed.add('stale_branch_blocked' if reason=='stale_reading' else 'improvement_not_auto_restart')
        elif kind=='review':
            assert p['actor_id']=='P02' and state['task_status'][p['task_id']]=='held'
            assert set(p['checks'])=={'fresh_local_twl','person_accountability','water_rest','permit','midday'}
            reading=state['readings'][tasks[p['task_id']]['zone_id']]
            assert reading['twl']>150 and now-time(reading['at'])<=timedelta(minutes=5)
            review=event['occurred_at']; observed.add('human_review_recorded')
        elif kind=='restart':
            assert review and p['actor_id']=='P02' and time(review)<=now
            reading=state['readings'][tasks[p['task_id']]['zone_id']]
            assert reading['twl']>150 and now-time(reading['at'])<=timedelta(minutes=5) and state['sensor_status'][reading['sensor_id']]=='serviceable'
            assert not (time('2025-06-15T00:00:00+04:00').date()<=now.date()<=time('2025-09-15T00:00:00+04:00').date() and (now.hour,now.minute)>=(12,30) and (now.hour,now.minute)<(15,0))
            state['task_status'][p['task_id']]='active'
        elif kind=='handover':
            assert p['case_id']==state['case_id']=='sandline_case_01'
            assert 'heat_case_01' in p['references'] and any(e.get('id')=='heat_case_01' for e in state['evidence'])
            assert state['delivery']['status']=='confirmed' and state['delivery']['slot']=='2025-08-04T15:30:00+04:00'
            assert state['task_status']['civil_heavy']=='held' and p['unresolved']
            state['open_items']+=p['unresolved']; observed.update(['prior_case_cited','delivery_state_cited','unresolved_items_visible'])
        else:
            raise AssertionError(f'unknown event type: {kind}')
        validate_state(state)
    expected=read(folder/'expected_outcomes.json')
    assert set(expected['semantic_assertions'])<=observed, (folder.name,set(expected['semantic_assertions'])-observed)
    assert expected['expected_rejections']==rejected
    return state,{'scenario':folder.name,'events':len((folder/'signals.jsonl').read_text().splitlines()),'assertions':len(expected['semantic_assertions']),'rejections':rejected,'status':'passed'}

def main():
    shared_checks()
    results=[]
    for folder in sorted(ROOT.glob('[0-9][0-9]_*')):
        _,summary=replay(folder); results.append(summary)
    assert len(results)==10
    state=None
    for name in ['02_heat_alert_response','03_constrained_reassignment','04_delivery_coordination','10_handover_and_evidence']:
        state,summary=replay(ROOT/name,state)
    assert state['case_id']=='sandline_case_01' and state['task_status']['civil_heavy']=='held'
    assert state['assignments']['workshop_prep']==['C05','C06','C07','C08']
    assert state['delivery']['slot']=='2025-08-04T15:30:00+04:00' and state['open_items']
    outcome={'status':'passed','shared_checks':'passed','standalone':results,'connected_chain':['02','03','04','10'],'connected_final':{'case_id':state['case_id'],'civil_heavy':state['task_status']['civil_heavy'],'workshop_assignees':state['assignments']['workshop_prep'],'delivery_slot':state['delivery']['slot'],'open_items':state['open_items']}}
    (ROOT/'validation/results.json').write_text(json.dumps(outcome,indent=2)+'\n')
    print('PASS: 10 standalone scenarios and connected 02→03→04→10 replay')

if __name__=='__main__': main()
