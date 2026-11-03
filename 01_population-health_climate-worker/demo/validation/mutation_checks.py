"""Regression probes for unsafe fixture transitions flagged by review."""
import copy
import json
import shutil
import tempfile
from pathlib import Path
from validate import ROOT, replay

def rejected(name, change):
    original=ROOT/name
    with tempfile.TemporaryDirectory() as temp:
        folder=Path(temp)/name
        shutil.copytree(original,folder)
        path=folder/'signals.jsonl'
        events=[json.loads(line) for line in path.read_text().splitlines()]
        change(events)
        path.write_text('\n'.join(json.dumps(e) for e in events)+'\n')
        try:
            replay(folder)
        except AssertionError:
            return
        raise AssertionError(f'unsafe mutation passed: {name}')

def shift_midday(events):
    for e in events:
        e['occurred_at']=e['occurred_at'].replace('T08:','T13:')
        e['received_at']=e['received_at'].replace('T08:','T13:')
        if e['type']=='twl':e['payload']['measured_at']=e['occurred_at']

def fail_before_restart(events):
    idx=next(i for i,e in enumerate(events) if e['type']=='restart')
    sample=copy.deepcopy(events[idx]);sample['event_id']='injected_failure';sample['type']='sensor_fail';sample['payload']={'sensor_id':'t1'}
    events.insert(idx,sample)

def stale_restart(events):
    idx=next(i for i,e in enumerate(events) if e['type']=='restart')
    for e in events[idx:]:
        e['occurred_at']=e['occurred_at'].replace('T08:','T09:')
        e['received_at']=e['received_at'].replace('T08:','T09:')

def duplicate_id(events): events[1]['event_id']=events[0]['event_id']
def wrong_zone(events): events[0]['payload']['sensor_id']='t2'
def no_first_aid(events): events[:]=[e for e in events if e['type']!='first_aid']
def no_twl_hold(events): events[0]['payload']['twl']=175
def wrong_authority(events): events[1]['actor_id']='E01'
def missing_actor(events): events[1].pop('actor_id')
def invalid_symptom_type(events): events[1]['payload']['observation']={'diagnosis':'invented'}
def delayed_receipt(events): events[0]['received_at']='2025-08-04T10:00:00+04:00'

if __name__=='__main__':
    for name,change in [
        ('09_restart_review',shift_midday),('09_restart_review',fail_before_restart),
        ('09_restart_review',stale_restart),('09_restart_review',duplicate_id),
        ('02_heat_alert_response',wrong_zone),('02_heat_alert_response',no_twl_hold),
        ('08_symptom_escalation',no_first_aid),('03_constrained_reassignment',wrong_authority),
        ('03_constrained_reassignment',missing_actor),('08_symptom_escalation',invalid_symptom_type),
        ('02_heat_alert_response',delayed_receipt),
    ]: rejected(name,change)
    print('PASS: 11 unsafe mutations rejected')
