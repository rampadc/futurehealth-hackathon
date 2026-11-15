"""SQLite event ledger, evidence projection, optimistic commands and ADK runs."""
from __future__ import annotations

import asyncio
import copy
import json
import math
import os
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .workflow import run_graph
from . import storage

SEED = json.loads((Path(__file__).parent / 'seed.json').read_text())
PERSONAS = [
    ('P03','Maya Al Qamar','Safety officer','Sandline'), ('P02','Rashid Al Wadi','Superintendent','Sandline'),
    ('P04','Tariq Al Safa','Permit coordinator','Sandline'), ('P05','Noura Al Nadir','Logistics coordinator','Sandline'),
    ('P06','Salim Al Wadi','First aider','Sandline'), ('P01','Amal Al Nadir','Project manager','Sandline'),
    ('C01','Huda Al Nadir','Civil foreman','Dune Civil Works'), ('C05','Rana Al Nadir','Civil worker','Dune Civil Works'),
    ('C08','Bilal Al Safa','Civil worker','Dune Civil Works'),
    # Organisation admin for the wireframe platform screens (system & trust, branding); owns no case actions.
    ('P09','Hessa Al Qamar','HSE systems admin','Sandline'),
]
PEOPLE = {id: {'id':id,'name':name,'role':role,'organisation':org,'description':''} for id,name,role,org in PERSONAS}
# (owner, title, prerequisites); these names are stable UI action IDs.
ACTIONS = {
    'sensor_reading':('sensor','New local monitor reading received',()),
    'escalate':('system','Stop-work acknowledgment overdue; escalation recorded',()),
    'escalation_followup':('P02','Rashid recorded follow-up on the overdue stop-work acknowledgment',('escalate',)),
    'issue':('P03','Maya instructed the crew to stop heavy trench work',()),
    'acknowledge':('C01','Huda acknowledged the stop-work instruction',('issue',)),
    'stop':('C01','Huda confirmed heavy trench work has stopped',('acknowledge',)),
    'checkin':('C05','Rana checked in to cooled recovery',('stop',)),
    'recover':('C01','Huda accounted for the affected crew in recovery',('checkin',)),
    'activity':('C01','Huda recorded observed crew activity',('recover',)),
    'readiness':('C01','Huda recorded individual workshop readiness',('recover',)),
    'assign':('C01','Huda confirmed the supervised workshop move',('recover',)),
    'report':('C08','Bilal requested assistance',('assign',)),
    'incident_record':('C01','Huda recorded Bilal’s report in the incident record',('report',)),
    'remove':('C01','Huda confirmed Bilal’s removal from work',('incident_record',)),
    'firstaid':('P06','Salim recorded first aid contact',('remove',)),
    'leila':('C01','Huda confirmed Leila’s workshop readiness',('remove','firstaid')),
    'draftDelivery':('P05','Noura drafted a later delivery',('assign',)),
    'approveDelivery':('P05','Noura approved the delivery request',('draftDelivery',)),
    'sendDelivery':('P05','Noura recorded the delivery request as sent',('approveDelivery',)),
    'acceptDelivery':('P05','Noura recorded supplier acceptance',('sendDelivery',)),
    'fresh':('P03','Maya recorded a fresh local reading',('firstaid',)),
    'permit':('P04','Tariq confirmed the permit check',('fresh',)),
    'personnel':('C01','Huda checked personnel for restart',('fresh',)),
    'recovery_check':('C01','Huda checked recovery for restart',('fresh',)),
    'crew_readiness':('C01','Huda checked crew readiness for restart',('fresh',)),
    'water':('P03','Maya checked water for restart',('fresh',)),
    'review':('P02','Rashid recorded the restart review; work remains stopped',('permit','fresh','remove','firstaid')),
    'handover':('P02','Rashid recorded the shift handover with restart decisions carried forward',('assign','firstaid')),
    'costReview':('P01','Amal reviewed the project cost impact',('handover',)),
}
RESTART_ACTIONS = {'permit':'permit','personnel':'personnel','recovery_check':'recovery','water':'water','crew_readiness':'crew_readiness'}
TASK_LABELS = {
    'issue':'Issue stop-work instruction', 'acknowledge':'Acknowledge stop-work instruction',
    'stop':'Confirm heavy work has stopped', 'checkin':'Check in to cooled recovery',
    'recover':'Record crew headcount in cooled recovery', 'activity':'Record observed activity through current clock',
    'readiness':'Confirm individual workshop readiness', 'assign':'Confirm supervised workshop assignment',
    'report':'Report dizziness', 'incident_record':'Record worker symptom report',
    'remove':'Confirm removal to first aid', 'firstaid':'Record first aid contact',
    'leila':'Confirm Leila’s workshop readiness', 'draftDelivery':'Draft later delivery request',
    'approveDelivery':'Approve delivery request', 'sendDelivery':'Record delivery request sent',
    'acceptDelivery':'Record supplier acceptance', 'fresh':'Record fresh local reading',
    'permit':'Confirm permit check', 'personnel':'Confirm personnel check',
    'recovery_check':'Confirm recovery check', 'water':'Confirm water check',
    'crew_readiness':'Confirm crew readiness check', 'review':'Record restart review',
    'handover':'Record shift handover', 'costReview':'Review project cost impact',
    'escalation_followup':'Follow up overdue acknowledgment',
}
FLAG = {'issue':'issued','acknowledge':'acknowledged','stop':'stopped','checkin':'checkedIn','recover':'recovered','assign':'assigned','report':'reported','remove':'removed','firstaid':'firstaid','leila':'leila','fresh':'fresh','permit':'permit','review':'reviewed','draftDelivery':'deliveryDrafted','approveDelivery':'deliveryApproved','sendDelivery':'deliverySent','acceptDelivery':'deliveryAccepted','handover':'handover','costReview':'costReviewed'}
DAY = '2025-08-04'

class CaseError(Exception):
    def __init__(self, status: int, detail: str):
        self.status, self.detail = status, detail
        super().__init__(detail)


def at(value: str) -> datetime:
    try: result = datetime.fromisoformat(value)
    except (TypeError, ValueError): raise CaseError(422,'Invalid ISO timestamp')
    if result.utcoffset() != timedelta(hours=4) or result.date().isoformat() != DAY:
        raise CaseError(422,'Demo clock requires 2025-08-04 and +04:00')
    return result


def encoded(value: Any) -> str:
    return json.dumps(value, separators=(',',':'), sort_keys=True)


class CaseService:
    def __init__(self, db_path: str | Path | None = None, solver_url: str | None = None):
        self._postgres = db_path is None and bool(storage.database_url())
        self.db_path = str(db_path or os.getenv('HEAT_CASE_DB') or (Path(os.getenv('HEAT_SAFE_LOCAL_DIR', Path.cwd() / '.local' / 'heat-safe')) / 'cases.sqlite3'))
        self.solver_url = (solver_url or os.getenv('HEAT_SOLVER_URL', 'http://127.0.0.1:8765')).rstrip('/')
        if not self._postgres: Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._run_order = 'seq' if self._postgres else 'rowid'
        self._init()
        self._listeners: set[asyncio.Queue] = set()
        self._retry_lock = asyncio.Lock()

    def _conn(self):
        return storage.connection(None if self._postgres else self.db_path)

    def _init(self):
        if self._postgres:
            storage.initialize()
            return
        with self._conn() as c:
            c.executescript('''
                CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, version INTEGER NOT NULL, clock TEXT NOT NULL, active INTEGER NOT NULL);
                CREATE UNIQUE INDEX IF NOT EXISTS one_active_case ON cases(active) WHERE active=1;
                CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL REFERENCES cases(id), command_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, occurred_at TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(case_id,command_id));
                CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, persona_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), version INTEGER NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, request TEXT NOT NULL, response TEXT, http_status INTEGER, graph_events TEXT, error TEXT, applied INTEGER NOT NULL DEFAULT 0);
                CREATE INDEX IF NOT EXISTS runs_case ON runs(case_id,version);
            ''')

    def actor_from_request(self, request):
        token = request.cookies.get('heat_persona')
        if not token: return None
        with self._conn() as c:
            row = c.execute('SELECT persona_id FROM sessions WHERE token=?',(token,)).fetchone()
        return row['persona_id'] if row else None

    def create_session(self, persona_id: str):
        if persona_id not in PEOPLE: raise CaseError(422,'Unknown persona')
        token = secrets.token_urlsafe(32)
        with self._conn() as c:
            c.execute('INSERT INTO sessions VALUES (?,?)',(token,persona_id))
        return token, PEOPLE[persona_id]

    def delete_session(self, token: str | None):
        if token:
            with self._conn() as c: c.execute('DELETE FROM sessions WHERE token=?',(token,))

    def _active(self, c):
        return c.execute('SELECT * FROM cases WHERE active=1').fetchone()

    def _events(self, c, case_id):
        return [dict(row) | {'payload':json.loads(row['payload'])} for row in c.execute('SELECT * FROM events WHERE case_id=? ORDER BY id',(case_id,))]

    def _latest(self, c, case_id, version):
        return c.execute(f"SELECT * FROM runs WHERE case_id=? AND version=? AND status='completed' AND applied=1 ORDER BY {self._run_order} DESC LIMIT 1",(case_id,version)).fetchone()

    def _project(self, case, events):
        q = copy.deepcopy(SEED)
        q['request_id'] = f"case-{case['id']}-v{case['version']}"
        q['snapshot_id'] = f"snapshot-{case['id']}-v{case['version']}"
        q['decision_at'] = case['clock']
        snap = q['snapshot']
        present = {}
        for e in events:
            a, p, t, eid = e['action'], e['payload'], e['occurred_at'], f"case-e{e['id']}"
            present[a] = e
            if a == 'issue':
                snap['instruction'] = {'evidence_id':eid,'alert_id':case['id'],'issued_at':t,'issued_by':'P03','acknowledged_at':None,'acknowledged_by':None}
                snap['held_task_ids'] = ['civil_heavy']
            elif a == 'acknowledge' and snap['instruction']:
                snap['instruction'].update(acknowledged_at=t,acknowledged_by='C01')
            elif a == 'stop':
                snap['cessation'] = {'evidence_id':eid,'confirmed_at':t,'actor_id':'C01'}
            elif a == 'checkin':
                next(w for w in snap['workers'] if w['person_id']=='C05')['location_id'] = p.get('zone_id','shelter_a')
            elif a == 'recover':
                ids = p['person_ids']
                snap['recovery'] = {'evidence_id':eid,'recorded_at':t,'actor_id':'C01','person_ids':ids,'zone_id':p['zone_id']}
                for w in snap['workers']:
                    if w['person_id'] in ids: w['location_id'] = p['zone_id']
            elif a == 'assign':
                for w in snap['workers']:
                    if w['person_id'] in p['person_ids']: w['location_id']='workshop'
            elif a == 'activity':
                for i, item in enumerate(p['intervals']):
                    snap['activity_history'].append({**item,'evidence_id':f'{eid}-{i}','recorded_at':t,'observed':True,'source':'human_confirmation'})
            elif a in ('readiness','leila'):
                confirmations = p.get('confirmations',[])
                if a == 'leila' and not confirmations:
                    raise CaseError(422,'Leila readiness requires an individual confirmation')
                for i, rd in enumerate(confirmations):
                    worker = next(w for w in snap['workers'] if w['person_id']==rd['person_id'])
                    worker['readiness'] = {'status':rd['status'],'task_id':'workshop_prep','confirmed_by':'C01','confirmed_at':t,'valid_until':rd['valid_until'],'evidence_id':f'{eid}-{i}','basis':rd['basis'],'source':'human_confirmation'}
            elif a == 'report':
                next(w for w in snap['workers'] if w['person_id']=='C08')['availability']='unavailable'
            elif a == 'incident_record':
                snap['incidents'].append({'evidence_id':eid,'person_id':'C08','reported_at':t,'reported_by':'C01','removed_at':None,'first_aid_contacted_at':None,'location_id':None,'responder_id':'P06'})
            elif a == 'remove':
                incident = snap['incidents'][-1]
                incident.update(removed_at=t,location_id=p.get('location_id','welfare'))
                worker = next(w for w in snap['workers'] if w['person_id']=='C08')
                worker.update(availability='unavailable',location_id=incident['location_id'])
            elif a == 'firstaid': snap['incidents'][-1]['first_aid_contacted_at'] = t
            elif a in {'fresh','sensor_reading'}:
                reading = p['reading']
                # One local report per zone. Keep the latest, including invalid reports.
                snap['readings'] = [r for r in snap['readings'] if r['zone_id'] != reading['zone_id']]
                snap['readings'].append({'evidence_id':eid,**reading})
        if 'recover' in present:
            # A plan may be requested only after complete observed activity reaches the current cutoff.
            histories = {w['person_id']:[] for w in snap['workers']}
            for item in snap['activity_history']: histories[item['person_id']].append(item)
            if all(histories.values()) and all(max(at(i['ends_at']) for i in items)==at(case['clock']) for items in histories.values()):
                start = at(case['clock']).replace(second=0,microsecond=0)
                if start < at(case['clock']): start += timedelta(minutes=1)
                q['planning'] = {'policy_id':'demo-work-rest-v1','starts_at':start.isoformat(),'horizon_minutes':60}
        if 'fresh' in present:
            trigger = max((e for e in events if e['action'] in {'fresh','sensor_reading'}),key=lambda e:e['id'])
            fresh_time = at(trigger['occurred_at'])
            checks = {}
            for action, field in RESTART_ACTIONS.items():
                event = present.get(action)
                if event and event['id'] > trigger['id'] and at(event['occurred_at']) >= fresh_time:
                    checks[field] = {'status':event['payload']['status'],'observed_at':event['occurred_at'],'actor_id':event['actor_id']}
                else: checks[field] = {'status':'unknown','observed_at':None,'actor_id':None}
            q['restart'] = {'proposed_at':case['clock'],'task_id':'civil_heavy',**checks}
        return q

    def _notify(self, case_id, version):
        for queue in tuple(self._listeners):
            try: queue.put_nowait({'case_id':case_id,'version':version})
            except asyncio.QueueFull: pass

    async def start(self):
        with self._conn() as c:
            if self._postgres: c.execute('BEGIN IMMEDIATE')
            row = self._active(c)
            if not row:
                cid = str(uuid.uuid4())
                c.execute('INSERT INTO cases VALUES (?,?,?,1)',(cid,0,SEED['decision_at']))
        if row: return self.read_case(None)
        await self.recompute(cid,0)
        self._notify(cid,0)
        return self.read_case(None)

    async def reset(self):
        with self._conn() as c:
            if self._postgres: c.execute('BEGIN IMMEDIATE')
            c.execute('UPDATE cases SET active=0 WHERE active=1')
            cid = str(uuid.uuid4())
            c.execute('INSERT INTO cases VALUES (?,?,?,1)',(cid,0,SEED['decision_at']))
        await self.recompute(cid,0)
        self._notify(cid,0)
        return self.read_case(None)

    def _retryable(self, latest_run, capture_row):
        if latest_run is None or latest_run['status']=='processing': return False
        if latest_run['http_status'] in (0,500,502,503,504): return True
        if capture_row is None: return False
        plan=json.loads(capture_row['response']).get('crew_rest',{})
        return plan.get('planning_status') in {'unknown','model_invalid'} or plan.get('solver_status') in {'UNKNOWN','MODEL_INVALID'}

    async def retry(self, actor: str | None, expected_version: int):
        if actor is None: raise CaseError(401,'Choose a local persona')
        if actor not in {'P02','P03','C01'}: raise CaseError(403,'Calculation retry belongs to an operational lead')
        async with self._retry_lock:
            with self._conn() as c:
                if self._postgres: c.execute('BEGIN IMMEDIATE')
                case=self._active(c)
                if not case: raise CaseError(404,'No active case')
                if expected_version!=case['version']: raise CaseError(409,'Case version changed')
                latest_run=c.execute(f'SELECT * FROM runs WHERE case_id=? AND version=? ORDER BY {self._run_order} DESC LIMIT 1',
                                     (case['id'],case['version'])).fetchone()
                capture=self._latest(c,case['id'],case['version'])
                if not self._retryable(latest_run,capture): raise CaseError(409,'Calculation is not retryable')
                case_id,version=case['id'],case['version']
            if not await self.recompute(case_id,version):
                raise CaseError(409,'Calculation is already processing')
            return self.read_case(actor)

    async def command(self, actor: str | None, body: dict):
        if actor is None: raise CaseError(401,'Choose a local persona')
        action, command_id = body.get('action'), body.get('command_id')
        if action not in ACTIONS: raise CaseError(422,'Unknown action')
        if not isinstance(command_id,str) or not command_id.strip() or len(command_id)>200: raise CaseError(422,'command_id required')
        if ACTIONS[action][0] != actor: raise CaseError(403,'Action belongs to another role')
        p = body.get('payload') or {}
        if not isinstance(p,dict): raise CaseError(422,'payload must be an object')
        self._validate_payload(action,p)
        repeated = False
        with self._conn() as c:
            c.execute('BEGIN IMMEDIATE')
            case = self._active(c)
            if not case: raise CaseError(404,'No active case')
            prior = c.execute('SELECT action,actor_id,payload FROM events WHERE case_id=? AND command_id=?',(case['id'],command_id)).fetchone()
            if prior:
                if prior['action'] != action or prior['actor_id'] != actor or prior['payload'] != encoded(p): raise CaseError(409,'command_id already used')
                repeated = True
            if not repeated and body.get('expected_version') != case['version']: raise CaseError(409,'Case version changed')
            if not repeated:
                self._record_command(c, case, action, command_id, actor, p)
                version = case['version']+1
        if repeated: return self.read_case(actor)
        await self.recompute(case['id'],version)
        self._notify(case['id'],version)
        return self.read_case(actor)

    def _record_command(self, c, case, action, command_id, actor, p):
        if action=='fresh' and at(p['reading']['received_at'])>at(case['clock']): raise CaseError(422,'Reading has not arrived at case clock')
        if action=='activity' and any(at(i['ends_at'])>at(case['clock']) for i in p['intervals']): raise CaseError(422,'Observed activity extends beyond case clock')
        if action in {'readiness','leila'} and any(at(i['valid_until'])<=at(case['clock']) for i in p['confirmations']): raise CaseError(422,'Readiness must remain valid after confirmation')
        if action=='activity': self._validate_activity_continuity(case,self._events(c,case['id']),p['intervals'])
        done = {r['action'] for r in c.execute('SELECT action FROM events WHERE case_id=?',(case['id'],))}
        if action in done and action not in {'activity','readiness','fresh',*RESTART_ACTIONS}: raise CaseError(409,'Action already recorded')
        if not all(prereq in done for prereq in ACTIONS[action][2]): raise CaseError(409,'Prerequisite evidence missing')
        if action == 'review':
            latest=self._latest(c,case['id'],case['version'])
            if not latest or json.loads(latest['response']).get('restart',{}).get('status')!='ready_for_human_review': raise CaseError(409,'Restart evidence is not ready for human review')
        if action == 'assign':
            latest=self._latest(c,case['id'],case['version'])
            if not latest: raise CaseError(409,'Current solver plan unavailable')
            plan=json.loads(latest['response']).get('crew_rest',{})
            proposed={i['person_id'] for i in plan.get('intervals',[]) if i['kind']=='work' and i['task_id']=='workshop_prep'}
            if plan.get('planning_status')!='planned' or not json.loads(latest['response']).get('plan_check',{}).get('accepted') or not proposed:
                raise CaseError(409,'Workshop plan remains blocked or unchecked')
            if not p.get('person_ids') or not set(p['person_ids']) <= proposed: raise CaseError(422,'Assignment needs workers in current solver plan')
        c.execute('INSERT INTO events(case_id,command_id,actor_id,action,occurred_at,payload) VALUES (?,?,?,?,?,?)',(case['id'],command_id,actor,action,case['clock'],encoded(p)))
        c.execute('UPDATE cases SET version=? WHERE id=?',(case['version']+1,case['id']))

    def _validate_payload(self, action, p):
        if action == 'recover':
            ids = p.get('person_ids')
            if not isinstance(ids,list) or set(ids)!={f'C{i:02}' for i in range(2,13)} or len(ids)!=11: raise CaseError(422,'Record all 11 affected crew members')
            if p.get('zone_id') not in {'shelter_a','shelter_b'}: raise CaseError(422,'Recovery needs a cooled shelter')
        elif action in {'readiness','leila'}:
            rows=p.get('confirmations')
            if not isinstance(rows,list) or not rows: raise CaseError(422,'Individual readiness confirmations required')
            for r in rows:
                if r.get('person_id') not in {f'C{i:02}' for i in range(2,13)} or r.get('status') not in {'ready','not_ready'} or not str(r.get('basis','')).strip(): raise CaseError(422,'Invalid readiness confirmation')
                at(r.get('valid_until'))
            if action=='leila' and not any(r['person_id']=='C09' for r in rows): raise CaseError(422,'Leila is C09')
        elif action=='activity':
            rows=p.get('intervals')
            if not isinstance(rows,list) or not rows: raise CaseError(422,'Observed intervals required')
            for r in rows:
                if r.get('person_id') not in {f'C{i:02}' for i in range(2,13)} or r.get('kind') not in {'work','recovery','unavailable'}: raise CaseError(422,'Invalid activity interval')
                if at(r.get('starts_at'))>=at(r.get('ends_at')): raise CaseError(422,'Activity interval must have duration')
                if r.get('kind')=='work' and (r.get('zone_id')!='workshop' or r.get('task_id')!='workshop_prep'):
                    raise CaseError(422,'Observed work must match the covered workshop task and zone')
                if r.get('kind')=='recovery' and (r.get('zone_id') not in {'shelter_a','shelter_b'} or r.get('task_id') is not None): raise CaseError(422,'Recovery must be in cooled shelter')
                if r.get('kind')=='unavailable' and (r.get('zone_id')!='welfare' or r.get('task_id') is not None):
                    raise CaseError(422,'Unavailable activity must be recorded in welfare')
        elif action=='assign':
            if not isinstance(p.get('person_ids'),list) or not p['person_ids'] or not all(isinstance(x,str) for x in p['person_ids']): raise CaseError(422,'Assigned person_ids required')
        elif action=='fresh':
            r=p.get('reading')
            if not isinstance(r,dict) or r.get('sensor_id')!='t1' or r.get('zone_id')!='civil_exposed' or r.get('quality') not in {'valid','invalid'} or r.get('unit')!='W/m²' or type(r.get('twl')) not in (int,float) or not math.isfinite(r['twl']) or not 0<r['twl']<500: raise CaseError(422,'Fresh local t1 reading required')
            if at(r.get('measured_at'))>at(r.get('received_at')): raise CaseError(422,'Invalid reading chronology')
        elif action in RESTART_ACTIONS:
            if p.get('status') not in {'confirmed','not_confirmed'}: raise CaseError(422,'Explicit check status required')

    def _validate_activity_continuity(self, case, events, intervals):
        projected=self._project(case,events)
        snap=projected['snapshot']
        if not snap['recovery']:
            raise CaseError(409,'Crew recovery must be recorded before activity')
        last={w['person_id']:at(snap['recovery']['recorded_at']) for w in snap['workers']}
        for item in snap['activity_history']:
            end=at(item['ends_at'])
            if end>last[item['person_id']]: last[item['person_id']]=end
        grouped={pid:[] for pid in last}
        for item in intervals: grouped[item['person_id']].append(item)
        for pid,items in grouped.items():
            cursor=last[pid]
            for item in sorted(items,key=lambda row:at(row['starts_at'])):
                if at(item['starts_at'])!=cursor:
                    raise CaseError(422,f'Observed activity for {pid} must continue from {cursor.isoformat()} without gaps or overlaps')
                cursor=at(item['ends_at'])

    async def advance_clock(self, iso: str):
        new = at(iso)
        with self._conn() as c:
            c.execute('BEGIN IMMEDIATE')
            case=self._active(c)
            if not case: raise CaseError(404,'No active case')
            if new<=at(case['clock']): raise CaseError(422,'Clock must advance')
            version=case['version']+1
            c.execute('UPDATE cases SET clock=?,version=? WHERE id=?',(iso,version,case['id']))
            prior=c.execute("SELECT * FROM events WHERE case_id=? AND action='issue' ORDER BY id DESC LIMIT 1",(case['id'],)).fetchone()
            ack=c.execute("SELECT 1 FROM events WHERE case_id=? AND action='acknowledge'",(case['id'],)).fetchone()
            escalated=c.execute("SELECT 1 FROM events WHERE case_id=? AND action='escalate'",(case['id'],)).fetchone()
            if prior and not ack and not escalated and new>=at(prior['occurred_at'])+timedelta(minutes=2):
                c.execute('INSERT INTO events(case_id,command_id,actor_id,action,occurred_at,payload) VALUES (?,?,?,?,?,?)',(case['id'],f'escalate-{version}','system','escalate',iso,'{}'))
        await self.recompute(case['id'],version)
        self._notify(case['id'],version)
        return self.read_case(None)

    async def signal(self, kind: str, payload: dict):
        if kind!='reading': raise CaseError(422,'Unsupported signal')
        self._validate_payload('fresh',{'reading':payload})
        with self._conn() as c:
            c.execute('BEGIN IMMEDIATE')
            case=self._active(c)
            if not case: raise CaseError(404,'No active case')
            if at(payload['received_at'])>at(case['clock']): raise CaseError(422,'Reading has not arrived at case clock')
            version=case['version']+1
            c.execute('INSERT INTO events(case_id,command_id,actor_id,action,occurred_at,payload) VALUES (?,?,?,?,?,?)',(case['id'],f'signal-{uuid.uuid4()}','sensor','sensor_reading',case['clock'],encoded({'reading':payload})))
            c.execute('UPDATE cases SET version=? WHERE id=?',(version,case['id']))
        await self.recompute(case['id'],version)
        self._notify(case['id'],version)
        return self.read_case(None)

    async def recompute(self, case_id: str, version: int, *, recovery: bool = False):
        if self._postgres:
            async with storage.run_lock(f'{case_id}:{version}') as acquired:
                if acquired:
                    await self._recompute_claimed(case_id, version, recovery=recovery)
                    return True
            return False
        else:
            await self._recompute_claimed(case_id, version, recovery=recovery)
            return True

    async def _recompute_claimed(self, case_id: str, version: int, *, recovery: bool = False):
        with self._conn() as c:
            if self._postgres: c.execute('BEGIN IMMEDIATE')
            case=c.execute('SELECT * FROM cases WHERE id=?',(case_id,)).fetchone()
            if case is None or case['version']!=version:
                if self._postgres:
                    c.execute("UPDATE runs SET status='interrupted',error='Case version changed during graph invocation' WHERE case_id=? AND version=? AND status='processing'",(case_id,version))
                return
            if self._postgres:
                existing=c.execute(f'SELECT status FROM runs WHERE case_id=? AND version=? ORDER BY {self._run_order} DESC LIMIT 1',(case_id,version)).fetchone()
                if recovery and existing and existing['status']!='processing': return
                c.execute("UPDATE runs SET status='interrupted',error='Run owner exited before completion' WHERE case_id=? AND version=? AND status='processing'",(case_id,version))
            events=self._events(c,case_id)
            request=self._project(case,events)
            run_id=str(uuid.uuid4())
            c.execute('INSERT INTO runs(id,case_id,version,status,started_at,request) VALUES (?,?,?,?,?,?)',(run_id,case_id,version,'processing',case['clock'],encoded(request)))
        try:
            status,response,graph_events=await run_graph(request,self.solver_url)
            error = None if status==200 else f'Solver rejected current evidence ({status})'
        except Exception as exc:
            status,response,graph_events,error=0,{},[],f'{type(exc).__name__}: {exc}'
        with self._conn() as c:
            c.execute('BEGIN IMMEDIATE')
            current=c.execute('SELECT version FROM cases WHERE id=?',(case_id,)).fetchone()
            applied=int(current is not None and current['version']==version and status==200)
            c.execute("UPDATE runs SET status=?,finished_at=?,response=?,http_status=?,graph_events=?,error=?,applied=? WHERE id=? AND status='processing'",('completed' if status==200 else 'failed',request['decision_at'],encoded(response),status,encoded(graph_events),error,applied,run_id))
        self._notify(case_id,version)

    async def replay_unfinished(self):
        with self._conn() as c:
            if self._postgres:
                rows=c.execute("SELECT DISTINCT case_id,version FROM runs WHERE status='processing' UNION SELECT id,version FROM cases WHERE active=1 AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.case_id=cases.id AND runs.version=cases.version)").fetchall()
            else:
                rows=c.execute("SELECT DISTINCT case_id,version FROM runs WHERE status='processing' UNION SELECT id,version FROM cases WHERE active=1 AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.case_id=cases.id AND runs.version=cases.version)").fetchall()
                c.execute("UPDATE runs SET status='interrupted',error='Process restarted during graph invocation' WHERE status='processing'")
        for row in rows:
            await self.recompute(row['case_id'],row['version'], recovery=self._postgres)

    def runs(self):
        with self._conn() as c:
            case=self._active(c)
            if not case: return []
            rows=c.execute(f'SELECT id,version,status,started_at,finished_at,request,response,http_status,graph_events,error,applied FROM runs WHERE case_id=? ORDER BY {self._run_order} DESC',(case['id'],)).fetchall()
        return [dict(row)|{'request':json.loads(row['request']),'response':json.loads(row['response'] or 'null'),
                           'graph_events':json.loads(row['graph_events'] or '[]'),'applied':bool(row['applied'])} for row in rows]

    def _scope_worker_capture(self, capture: dict, worker_id: str):
        scoped=copy.deepcopy(capture)
        snap=scoped['request']['snapshot']
        snap['workers']=[w for w in snap['workers'] if w['person_id']==worker_id]
        snap['activity_history']=[i for i in snap['activity_history'] if i['person_id']==worker_id]
        snap['incidents']=[i for i in snap['incidents'] if i['person_id']==worker_id]
        if snap.get('recovery'): snap['recovery']['person_ids']=[worker_id] if worker_id in snap['recovery']['person_ids'] else []
        response=scoped['response']
        response.pop('solver_calls',None)
        response.pop('plan_check',None)
        for key in ('crew_rest','protective_response'):
            section=response.get(key,{})
            for field in ('intervals','carry_forward_rest'):
                if field in section: section[field]=[item for item in section[field] if item.get('person_id')==worker_id]
            if 'excluded_worker_ids' in section: section['excluded_worker_ids']=[x for x in section['excluded_worker_ids'] if x==worker_id]
        for section in [response,*[v for v in response.values() if isinstance(v,dict)]]:
            if 'actions' in section:
                section['actions']=[a for a in section['actions'] if not a.get('person_ids') or worker_id in a['person_ids']]
                for a in section['actions']: a['person_ids']=[x for x in a.get('person_ids',[]) if x==worker_id]
            if 'evidence_ids' in section: section['evidence_ids']=[]
        # This is a privacy-scoped projection of a live capture, not the exact solver response.
        scoped['provenance']['validation']='worker-scoped projection of solver response'
        return scoped

    def _scope_worker_request(self, request: dict, worker_id: str):
        scoped=copy.deepcopy(request)
        snap=scoped['snapshot']
        snap['workers']=[w for w in snap['workers'] if w['person_id']==worker_id]
        snap['activity_history']=[i for i in snap['activity_history'] if i['person_id']==worker_id]
        snap['incidents']=[i for i in snap['incidents'] if i['person_id']==worker_id]
        if snap.get('recovery'):
            snap['recovery']['person_ids']=[worker_id] if worker_id in snap['recovery']['person_ids'] else []
        return scoped

    def read_case(self, persona_id: str | None = None):
        with self._conn() as c:
            case=self._active(c)
            if not case: return None
            events=self._events(c,case['id'])
            capture_row=self._latest(c,case['id'],case['version'])
            run_rows=c.execute(f'SELECT id,version,status,http_status,error,graph_events,applied FROM runs WHERE case_id=? ORDER BY {self._run_order} DESC LIMIT 8',(case['id'],)).fetchall()
        done={e['action'] for e in events}
        current_request=self._project(case,events)
        current_snapshot=current_request['snapshot']
        histories={w['person_id']:[] for w in current_snapshot['workers']}
        for interval in current_snapshot['activity_history']:
            histories[interval['person_id']].append(interval)
        missing_history=[pid for pid,items in histories.items()
                         if not items or max(at(item['ends_at']) for item in items)!=at(case['clock'])]
        flags={flag: action in done for action,flag in FLAG.items()}
        timeline=[]
        for e in events:
            if persona_id in {'C05','C08'} and e['actor_id'] in {f'C{i:02}' for i in range(2,13)} and e['actor_id']!=persona_id: continue
            if persona_id in {'C05','C08'} and e['action'] in {'readiness','activity','leila'}: continue
            if persona_id == 'C05' and e['action'] in {'report','incident_record','remove','firstaid'}: continue
            timeline.append({'id':e['action'],'actorId':e['actor_id'],'title':ACTIONS[e['action']][1],'occurred_at':e['occurred_at'],'evidence_ids':[f"case-e{e['id']}"]})
        tasks=[]
        for action,(owner,title,pre) in ACTIONS.items():
            if owner in {'sensor','system'}: continue
            status='recorded' if action in done else 'ready' if all(p in done for p in pre) else 'waiting'
            reason=None if status!='waiting' else 'Waiting for '+', '.join(p for p in pre if p not in done)
            if action=='activity' and status in {'ready','recorded'} and missing_history:
                status,reason='ready','Observed activity needed through current clock: '+', '.join(missing_history)
            if action=='readiness' and action in done:
                missing=[w['person_id'] for w in current_snapshot['workers']
                         if not w['readiness'] or at(w['readiness']['valid_until'])<=at(case['clock'])]
                if missing:
                    status,reason='ready','Current individual readiness confirmation needed: '+', '.join(missing)
            if action=='fresh' and action in done:
                reading=current_snapshot['readings'][-1]
                if reading['quality']!='valid' or at(case['clock'])-at(reading['measured_at'])>timedelta(minutes=5):
                    status,reason='ready','Fresh valid local reading needed'
            if action in RESTART_ACTIONS and action in done:
                check=(current_request.get('restart') or {}).get(RESTART_ACTIONS[action],{})
                observed=check.get('observed_at')
                if check.get('status')!='confirmed' or not observed or at(case['clock'])-at(observed)>timedelta(minutes=5):
                    status,reason='ready','Current confirmation needed after latest trigger'
            if action=='review' and status!='recorded' and capture_row and json.loads(capture_row['response']).get('restart',{}).get('status')!='ready_for_human_review': status,reason='waiting','Restart evidence is not ready for human review'
            if action=='assign' and status!='recorded':
                if 'readiness' not in done: status,reason='waiting','Individual readiness missing'
                elif not capture_row: status,reason='waiting','Current solver plan unavailable'
                else:
                    plan=json.loads(capture_row['response']).get('crew_rest',{})
                    check=json.loads(capture_row['response']).get('plan_check',{})
                    if plan.get('planning_status')!='planned' or not check.get('accepted'):
                        status,reason='waiting','Workshop plan remains blocked or unchecked: '+', '.join(plan.get('blockers',[]) or ['plan check not accepted'])
            if persona_id and owner != persona_id: continue
            due_at=None
            if action=='escalation_followup':
                issued=next((e for e in events if e['action']=='issue'),None)
                if issued: due_at=(at(issued['occurred_at'])+timedelta(minutes=2)).isoformat()
            tasks.append({'action':action,'actor_id':owner,'label':TASK_LABELS[action],'status':status,'reason':reason,'due_at':due_at})
        capture=None
        if capture_row:
            capture={'case_id':case['id'],'request':json.loads(capture_row['request']),'response':json.loads(capture_row['response']),'http_status':capture_row['http_status'],'provenance':{'captured_at':capture_row['finished_at'],'transport':'live HTTP','source':self.solver_url,'fixture_count':0,'validation':'solver accepted'}}
            if persona_id in {'C05','C08'}: capture=self._scope_worker_capture(capture,persona_id)
        runs=[dict(row)|{'graph_events':json.loads(row['graph_events'] or '[]'),'applied':bool(row['applied'])} for row in run_rows]
        retry_available=bool(persona_id in {'P02','P03','C01'} and
                             self._retryable(run_rows[0] if run_rows else None,capture_row))
        workers=[]
        for worker in current_snapshot['workers']:
            pid=worker['person_id']
            if persona_id in {'C05','C08'} and pid!=persona_id: continue
            rd=worker['readiness']
            ready=bool(rd and rd['status']=='ready' and at(rd['valid_until'])>at(case['clock']))
            workers.append({'person_id':pid,'availability':worker['availability'],
                'readiness':'ready' if ready else 'not_ready' if rd and rd['status']=='not_ready' else 'unknown',
                'last_observed_at':max((item['ends_at'] for item in histories[pid]),default=None),
                'reason':'Observed activity missing at current clock' if pid in missing_history else
                         'Individual readiness missing or expired' if not ready else 'Ready for solver assessment'})
        projected_request=(self._scope_worker_request(current_request,persona_id)
                           if persona_id in {'C05','C08'} else current_request)
        return {'case_id':case['id'],'version':case['version'],'clock':case['clock'],'story':{**flags,'events':timeline},
                'request':projected_request,'capture':capture,'tasks':tasks,'runs':runs,'workers':workers,
                'retry_available':retry_available}
