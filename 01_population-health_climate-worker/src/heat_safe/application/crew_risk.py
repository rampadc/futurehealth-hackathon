"""Per-worker heat risk for the case crew (worker_risk.compute_worker_risk), scoped by who asks.

Supervisors and responders get each worker's band and action, never the reasons behind them. A worker
gets only their own band, with the reasons. Bands are planning information: they never clear a hold,
never record anything and never reach the solver.

The crew's clothing and type of work below are synthetic, chosen so the same air gives different answers.
Acclimatisation comes from the shared roster (demo/cross-scenario/personnel.json).
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from functools import cache

from fastapi import APIRouter, HTTPException, Request

from heat_safe import rules
from heat_safe.acclimatisation import ACCLIMATISED, Acclimatisation, acclimatisation_status
from heat_safe.paths import ROOT
from heat_safe.worker_risk import WorkerFactors, WorkerRisk, compute_worker_risk, crew_risk, with_local_reading

from .platform_api import CASE_SITE, WORKERS, actor

router = APIRouter()

# Synthetic demo crew: plant operators work from a cab (light work); everyone else does heavy trench work.
LIGHT_WORK = {'C02', 'C03'}
CLOTHING = {'C05': 'cloth_coveralls', 'C06': 'coveralls_over_work_wear', 'C10': 'coveralls_over_work_wear'}
# A valid local reading corrects the weather for one weather hour. A reading already older than the case's
# freshness limit when it arrives, or not valid, is a lost input.
LOCAL_READING_MAX_AGE = timedelta(minutes=60)
FRESH_ON_ARRIVAL = timedelta(minutes=5)


@cache
def _roster() -> dict:
    people = json.loads((ROOT / 'demo/cross-scenario/personnel.json').read_text(encoding='utf-8'))
    return {p['id']: p for p in people}


def acclimatisation_for(person_id: str, day: date) -> Acclimatisation:
    status = _roster().get(person_id, {}).get('acclimatisation', 'complete')
    if status == 'complete':
        return ACCLIMATISED
    restricted = re.fullmatch(r'restricted_day_(\d+)', status)
    days = int(restricted.group(1)) if restricted else 1  # an unknown status is read as a first day
    return acclimatisation_status(day, new_starter_since=day - timedelta(days=days - 1))


def site_twl(day: str, hour: int) -> dict[str, float] | None:
    """The case site's TWL in the sun for one hour, per clothing ensemble in the TWL model."""
    import pandas as pd

    from heat_safe.agent_tools import _weather
    from heat_safe.heat_stress import compute_heat_stress
    try:
        weather = _weather(CASE_SITE, day)
    except Exception:  # noqa: BLE001 - no weather is an unknown input, handled as Red
        return None
    out = {}
    for name, clothing in rules.CLOTHING.items():
        if not clothing.in_twl_model:
            continue
        hs = compute_heat_stress(weather, icl=clothing.icl)
        row = hs[pd.DatetimeIndex(hs['time']).hour == hour]
        if row.empty or row.iloc[0]['data_issue']:
            return None
        out[name] = float(row.iloc[0]['twl_wm2'])
    return out


def _local_reading(snapshot: dict, clock: datetime) -> tuple[float | None, str]:
    readings = snapshot.get('readings') or []
    if not readings:
        return None, 'none'
    r = readings[-1]
    measured, received = datetime.fromisoformat(r['measured_at']), datetime.fromisoformat(r['received_at'])
    if r.get('quality') != 'valid' or received - measured > FRESH_ON_ARRIVAL:
        return None, 'lost'
    if clock - measured > LOCAL_READING_MAX_AGE:
        return None, 'none'
    return float(r['twl']), 'used'


def assess(view: dict) -> tuple[list[WorkerRisk], dict]:
    clock = datetime.fromisoformat(view['clock'])
    snapshot = view['request']['snapshot']
    heat = site_twl(clock.date().isoformat(), clock.hour)
    local, local_status = _local_reading(snapshot, clock)
    if heat is not None:
        heat = with_local_reading(heat, local)
    reported = {e['actorId'] for e in view['story']['events'] if e['id'] == 'report'}
    risks = [compute_worker_risk(heat, WorkerFactors(
        pid,
        work_intensity='light' if pid in LIGHT_WORK else 'heavy',
        clothing=CLOTHING.get(pid, rules.DEFAULT_CLOTHING),
        acclimatisation=acclimatisation_for(pid, clock.date()),
        symptoms_reported=pid in reported,
    ), environment_ok=local_status != 'lost') for pid in (w['person_id'] for w in snapshot['workers'])]
    inputs = {'hour': f'{clock.hour:02}:00', 'site': CASE_SITE, 'weather': 'ok' if heat is not None else 'unavailable',
              'local_reading': local_status, 'rules_version': rules.RULES_VERSION}
    return risks, inputs


@router.get('/api/case/crew-risk')
def case_crew_risk(request: Request):
    """Each worker's band and action for supervisors and responders. No reasons, symptoms or readings."""
    persona = actor(request)
    if persona in WORKERS or persona == 'P10':
        raise HTTPException(403, 'Crew heat risk is for supervisors; your own is on your phone')
    view = request.app.state.service.read_case(None)
    if not view:
        return None
    risks, inputs = assess(view)
    return {'inputs': inputs, 'crew': crew_risk(risks), 'workers': [r.for_supervisor() for r in risks]}


@router.get('/api/worker/risk')
def own_risk(request: Request):
    """The signed-in worker's own band, with the reasons only they see."""
    persona = actor(request)
    if persona not in WORKERS:
        raise HTTPException(403, 'Only a worker can see their own heat risk')
    view = request.app.state.service.read_case(None)
    if not view:
        return None
    risks, inputs = assess(view)
    mine = next((r for r in risks if r.person_id == persona), None)
    return mine and {'inputs': inputs, **mine.for_worker()}
