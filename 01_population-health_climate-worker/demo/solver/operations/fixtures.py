"""Synthetic operational inputs. Original replay files are never changed."""
import copy
from .common import POLICY


def at(value):
    return f'2025-08-04T{value}+04:00'


def site_inputs():
    """Supplied site catalogue, independent of the legacy replay catalogue."""
    return {
        'locations': [
            {'id':'civil_exposed','label':'Civil trench preparation','capacity':20,
             'capabilities':['exposed_civil']},
            {'id':'electrical_exposed','label':'Electrical preparation laydown','capacity':20,
             'capabilities':['exposed_electrical']},
            {'id':'yard','label':'Receiving yard','capacity':20,'capabilities':['yard']},
            {'id':'workshop','label':'Cooled preparation workshop','capacity':6,
             'capabilities':['light_work']},
            {'id':'shelter_a','label':'Cooled recovery shelter A','capacity':24,
             'capabilities':['cooled_recovery']},
            {'id':'shelter_b','label':'Cooled recovery shelter B','capacity':16,
             'capabilities':['cooled_recovery']},
            {'id':'welfare','label':'Welfare and first aid','capacity':8,
             'capabilities':['first_aid_support']},
        ],
        'task_locations': {'civil_heavy':'civil_exposed','civil_light':'civil_exposed',
                           'workshop_prep':'workshop'},
    }


def readiness_record(person_id, *, status='ready', confirmed_at=None, valid_until=None,
                     task_id='workshop_prep', confirmed_by='C01', evidence_id=None,
                     basis='Supervisor confirmed suitability for the light workshop task under the fictional demo arrangement.',
                     source='synthetic_fixture'):
    return {'status':status,'task_id':task_id,'confirmed_by':confirmed_by,
            'confirmed_at':confirmed_at or at('08:10:30'),
            'valid_until':valid_until or at('10:30:00'),
            'evidence_id':evidence_id or f'readiness-{person_id}',
            'basis':basis,'source':source}


def canonical_request():
    now = at('08:11:00')
    workers = [{'person_id':f'C{i:02d}',
                'readiness':readiness_record(f'C{i:02d}') if 5 <= i <= 8 else None,
                'availability':'available','location_id':'workshop' if 5 <= i <= 8 else 'shelter_a'}
               for i in range(2,13)]
    history = [{'evidence_id':f'cooled-{w["person_id"]}', 'person_id':w['person_id'],
                'kind':'recovery','task_id':None,'zone_id':'shelter_a',
                'starts_at':at('08:04:00'),'ends_at':now,'recorded_at':now,
                'observed':True,'source':'synthetic_fixture'} for w in workers]
    return {
        'schema_version':'2.1','request_id':'operational-canonical','profile_id':'sandline_operational_demo_v1',
        'snapshot_id':'sandline-0811','decision_at':now,
        **site_inputs(),
        'snapshot':{
            'readings':[{'evidence_id':'02_heat_alert_response_e01','sensor_id':'t1',
                'zone_id':'civil_exposed','twl':145.0,'unit':'W/m²','quality':'valid',
                'measured_at':at('08:00:00'),'received_at':at('08:00:00')}],
            'sensor_status':{'t1':'serviceable','t2':'serviceable','t3':'serviceable'},
            'held_task_ids':['civil_heavy'],
            'instruction':{'evidence_id':'02_heat_alert_response_e02','alert_id':'heat_case_01',
                'issued_at':at('08:01:00'),'issued_by':'P03','acknowledged_at':at('08:02:00'),'acknowledged_by':'C01'},
            'cessation':{'evidence_id':'02_heat_alert_response_e04','confirmed_at':at('08:03:00'),'actor_id':'C01'},
            'recovery':{'evidence_id':'02_heat_alert_response_e05','recorded_at':at('08:04:00'),
                'actor_id':'C01','person_ids':[w['person_id'] for w in workers],'zone_id':'shelter_a'},
            'workers':workers,'activity_history':history,
            'workshop':{'staffing_demand':{'minimum':1,'maximum':4},'permit_status':'valid',
                'resource_status':'available','supervision_status':'available'},
            'zone_windows':[{'zone_id':zone,'starts_at':at('08:00:00'),'ends_at':at('10:30:00'),
                'status':'available','fixed_occupant_ids':['P07','P08'] if zone == 'workshop' else []}
                for zone in ['workshop','shelter_a','shelter_b','welfare']],
            'task_windows':[{'task_id':'workshop_prep','starts_at':at('08:00:00'),'ends_at':at('10:30:00'),
                'permit_status':'valid','resource_status':'available','supervision_status':'available'}],
            'incidents':[],
        },
        'planning':{'policy_id':POLICY['id'],'starts_at':now,'horizon_minutes':60},
        'timing_policy':{key:POLICY[key] for key in ('id','initial_recovery_minutes',
            'max_work_minutes','between_work_recovery_minutes')},
        'restart':None,
    }


def _initial(now='08:00:00', twl=145.0):
    req = canonical_request()
    req['decision_at'] = at(now); req['planning'] = None
    snap = req['snapshot']
    snap.update(held_task_ids=[],instruction=None,cessation=None,recovery=None,activity_history=[])
    snap['readings'][0]['twl'] = twl
    for w in snap['workers']:
        w.update(readiness=None,location_id='civil_exposed')
    return req


def _restart(req, now):
    req['decision_at'] = at(now); req['planning'] = None; req['snapshot']['activity_history'] = []
    snap = req['snapshot']
    snap['readings'][0].update(evidence_id='fresh-restart-reading',twl=175.0,
                             measured_at=at(now),received_at=at(now))
    req['restart'] = {'proposed_at':at(now),'task_id':'civil_heavy'}
    for field,actor in [('permit','P04'),('personnel','C01'),('recovery','C01'),('water','C01'),('crew_readiness','C01')]:
        req['restart'][field] = {'status':'confirmed','observed_at':at(now),'actor_id':actor}


def _rename_locations(value, names):
    if isinstance(value, dict):
        return {key:item if key == 'capabilities' else _rename_locations(item,names)
                for key,item in value.items()}
    if isinstance(value, list):
        return [_rename_locations(item,names) for item in value]
    return names.get(value,value) if isinstance(value,str) else value


def cases():
    result = {'heat_trigger':_initial(), 'canonical_timed':canonical_request()}
    result['eight_ready'] = copy.deepcopy(result['canonical_timed'])
    for w in result['eight_ready']['snapshot']['workers']:
        if int(w['person_id'][1:]) >= 5:
            w['readiness'] = readiness_record(w['person_id'])
    for name in ['missing_policy','two_ready','reduced_seats','reduced_demand','no_supervision',
                 'no_cooling','no_workshop','insufficient_initial_recovery','missing_history','tail_rest']:
        result[name] = canonical_request()
    result['missing_policy']['planning']['policy_id'] = None
    result['missing_policy']['timing_policy'] = None
    for name, policy in (
        ('alternate_timing_policy', ('demo-work-rest-alternate',10,20,15)),
        ('long_recovery_policy', ('demo-work-rest-long-recovery',6,15,30)),
        ('zero_initial_recovery', ('demo-work-rest-zero-initial',0,20,10)),
    ):
        req = canonical_request()
        req['timing_policy'] = dict(zip(('id','initial_recovery_minutes',
            'max_work_minutes','between_work_recovery_minutes'),policy))
        req['planning']['policy_id'] = policy[0]
        for window in (*req['snapshot']['zone_windows'], *req['snapshot']['task_windows']):
            window['ends_at'] = at('11:30:00')
        if name == 'zero_initial_recovery':
            for history in req['snapshot']['activity_history']:
                history['starts_at'] = at('08:10:00')
        result[name] = req
    for w in result['two_ready']['snapshot']['workers']:
        if w['person_id'] in ('C07','C08'):
            w['readiness'] = readiness_record(w['person_id'],status='not_ready')
    result['reduced_seats']['snapshot']['zone_windows'][0]['fixed_occupant_ids'].append('P01')
    result['reduced_demand']['snapshot']['workshop']['staffing_demand']['maximum'] = 2
    result['no_supervision']['snapshot']['workshop']['supervision_status'] = 'unavailable'
    for window in result['no_supervision']['snapshot']['task_windows']: window['supervision_status'] = 'unavailable'
    for window in result['no_cooling']['snapshot']['zone_windows']:
        if window['zone_id'] in ('shelter_a','shelter_b'): window['status'] = 'unavailable'
    result['no_workshop']['snapshot']['zone_windows'][0]['status'] = 'unavailable'
    for history in result['insufficient_initial_recovery']['snapshot']['activity_history']:
        history['starts_at'] = at('08:09:00')
    result['missing_history']['snapshot']['activity_history'] = []
    result['tail_rest']['planning']['horizon_minutes'] = 15
    for name in ('incident_no_substitute','incident_substitute','removal_unconfirmed'):
        req = canonical_request(); req['decision_at'] = at('08:18:00'); req['planning']['starts_at'] = req['decision_at']
        for h in req['snapshot']['activity_history']:
            if h['person_id'] not in ('C05','C06','C07','C08'):
                h.update(ends_at=req['decision_at'],recorded_at=req['decision_at'])
        for pid in ('C05','C06','C07','C08'):
            req['snapshot']['activity_history'].append({'evidence_id':f'actual-work-{pid}',
                'person_id':pid,'kind':'work','task_id':'workshop_prep','zone_id':'workshop',
                'starts_at':at('08:11:00'),'ends_at':req['decision_at'],'recorded_at':req['decision_at'],
                'observed':True,'source':'synthetic_fixture'})
        req['snapshot']['workers'][6].update(availability='unavailable',location_id='welfare')
        req['snapshot']['incidents'] = [{'evidence_id':'bilal-incident','person_id':'C08',
            'reported_at':req['decision_at'],'reported_by':'C01','removed_at':req['decision_at'],
            'first_aid_contacted_at':req['decision_at'],'location_id':'welfare','responder_id':'P06'}]
        if name == 'incident_substitute':
            worker = req['snapshot']['workers'][7]
            worker['readiness'] = readiness_record(worker['person_id'],confirmed_at=req['decision_at'])
        if name == 'removal_unconfirmed':
            req['snapshot']['incidents'][0].update(removed_at=None,first_aid_contacted_at=None,location_id=None)
            req['snapshot']['workers'][6]['location_id'] = 'workshop'
        result[name] = req
    result['unacknowledged_hold'] = _initial('08:04:00')
    result['unacknowledged_hold']['snapshot'].update(
        held_task_ids=['civil_heavy'],instruction={'evidence_id':'unacked-hold','alert_id':'heat_case_07',
        'issued_at':at('08:01:00'),'issued_by':'P03','acknowledged_at':None,'acknowledged_by':None})
    result['stop_unconfirmed'] = canonical_request()
    result['stop_unconfirmed']['snapshot'].update(cessation=None,recovery=None,activity_history=[])
    result['accounting_incomplete'] = canonical_request()
    result['accounting_incomplete']['snapshot']['recovery']['person_ids'].remove('C12')
    result['failed_sensor'] = _initial('08:09:00')
    result['failed_sensor']['snapshot']['sensor_status']['t1'] = 'failed'
    result['wrong_zone'] = _initial('08:01:00')
    result['wrong_zone']['snapshot']['readings'][0].update(zone_id='yard')
    result['symptoms_without_heat_hold'] = _initial('08:01:00',175.0)
    result['symptoms_without_heat_hold']['snapshot']['incidents'] = [{'evidence_id':'symptom-only',
        'person_id':'C08','reported_at':at('08:01:00'),'reported_by':'C01','removed_at':None,
        'first_aid_contacted_at':None,'location_id':None,'responder_id':'P06'}]
    for name in ['restart_ready','restart_stale','restart_missing_check','restart_midday','restart_future']:
        result[name] = canonical_request(); _restart(result[name],'08:11:00')
    result['restart_stale']['snapshot']['readings'][0].update(measured_at=at('08:00:00'),received_at=at('08:00:00'))
    result['restart_missing_check']['restart']['permit'].update(status='unknown',observed_at=None,actor_id=None)
    _restart(result['restart_midday'],'12:30:00')
    result['restart_future']['restart']['proposed_at'] = at('08:12:00')
    result['expired_readiness'] = canonical_request()
    for worker in result['expired_readiness']['snapshot']['workers']:
        if worker['readiness'] is not None:
            worker['readiness']['valid_until'] = at('08:10:45')
    names = {'civil_exposed':'trench_7','electrical_exposed':'electrical_pad_7',
             'yard':'receiving_7','workshop':'annex_7','shelter_a':'cool_room_7',
             'shelter_b':'shelter_7','welfare':'care_room_7'}
    result['dynamic_locations'] = _rename_locations(canonical_request(),names)
    result['dynamic_locations']['locations'].append(
        {'id':'third_shelter_7','label':'Additional cooled shelter','capacity':12,
         'capabilities':['cooled_recovery']})
    result['dynamic_locations']['snapshot']['zone_windows'].append(
        {'zone_id':'third_shelter_7','starts_at':at('08:00:00'),
         'ends_at':at('10:30:00'),'status':'available','fixed_occupant_ids':[]})
    for name,req in result.items():
        req['request_id'] = name; req['snapshot_id'] = f'synthetic-{name}'
    return result
