"""Per-worker heat risk for the case crew (worker_risk.compute_worker_risk), scoped by who asks.

Supervisors and responders get each worker's band and action, never the reasons behind them. A worker
gets only their own band, with the reasons. Bands are planning information: they never clear a hold,
never record anything and never reach the solver.

The crew's clothing and type of work below are synthetic, chosen so the same air gives different answers.
Acclimatisation comes from the shared roster (demo/cross-scenario/personnel.json).

The site's other squads (formwork, steel fixing, MEP) are not on the case. Their rosters, clothing and type of
work are in demo/cross-scenario/site-squads.json, and their heat is their own squad sensor from the presenter
site settings (demo_site): a live sensor sets the work-wear TWL; an offline or stale one leaves the weather
forecast in use and is a lost input, so every band is one level higher.
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
def squads() -> dict[str, dict]:
    """The site's squads that are not on the case, by squad id."""
    return {q['id']: q for q in json.loads((ROOT / 'demo/cross-scenario/site-squads.json').read_text(encoding='utf-8'))}


def squad_worker_ids() -> set[str]:
    return {w['id'] for q in squads().values() for w in q['workers']}


@cache
def _roster() -> dict:
    people = json.loads((ROOT / 'demo/cross-scenario/personnel.json').read_text(encoding='utf-8'))
    return {**{w['id']: w for q in squads().values() for w in q['workers']}, **{p['id']: p for p in people}}


def acclimatisation_for(person_id: str, day: date) -> Acclimatisation:
    status = _roster().get(person_id, {}).get('acclimatisation', 'complete')
    if status == 'complete':
        return ACCLIMATISED
    restricted = re.fullmatch(r'restricted_day_(\d+)', status)
    days = int(restricted.group(1)) if restricted else 1  # an unknown status is read as a first day
    return acclimatisation_status(day, new_starter_since=day - timedelta(days=days - 1))


def site_twl(day: str, hour: int) -> dict[str, float] | None:
    """The case site's TWL in the sun for one hour, per clothing ensemble in the TWL model."""
    heat = _site_twl(day, hour)
    return dict(heat) if heat is not None else None


@cache
def _site_twl(day: str, hour: int) -> dict[str, float] | None:
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


def assess(view: dict, conditions: dict[str, list[str]] | None = None) -> tuple[list[WorkerRisk], dict]:
    """Bands for the case crew. ``conditions`` are presenter-assigned health conditions (demo_site.CONDITIONS)."""
    conditions = conditions or {}
    clock = datetime.fromisoformat(view['clock'])
    snapshot = view['request']['snapshot']
    heat = site_twl(clock.date().isoformat(), clock.hour)
    local, local_status = _local_reading(snapshot, clock)
    if heat is not None:
        heat = with_local_reading(heat, local)
    reported = {e['actorId'] for e in view['story']['events'] if e['id'] == 'report'}
    def factors(pid: str) -> WorkerFactors:
        has = set(conditions.get(pid, ()))
        return WorkerFactors(
            pid,
            work_intensity='light' if pid in LIGHT_WORK else 'heavy',
            clothing=CLOTHING.get(pid, rules.DEFAULT_CLOTHING),
            acclimatisation=(acclimatisation_status(clock.date(), new_starter_since=clock.date()) if 'not_acclimatised' in has
                             else acclimatisation_for(pid, clock.date())),
            symptoms_reported=pid in reported or 'unwell' in has,
            low_fluid='low_fluid' in has,
            heat_sensitive='heat_sensitive' in has,
            red_flag='red_flag' in has,
        )
    risks = [compute_worker_risk(heat, factors(pid), environment_ok=local_status != 'lost')
             for pid in (w['person_id'] for w in snapshot['workers'])]
    inputs = {'hour': f'{clock.hour:02}:00', 'site': CASE_SITE, 'weather': 'ok' if heat is not None else 'unavailable',
              'local_reading': local_status, 'rules_version': rules.RULES_VERSION}
    return risks, inputs


def squad_heat(weather: dict[str, float] | None, sensor_twl: float | None) -> dict[str, float] | None:
    """A squad's TWL per clothing from its own sensor, which measures its location in work wear.

    Each other ensemble keeps the weather's difference from work wear. No sensor value: the forecast stands.
    """
    if sensor_twl is None:
        return dict(weather) if weather is not None else None
    if weather is None or rules.DEFAULT_CLOTHING not in weather:
        return {rules.DEFAULT_CLOTHING: sensor_twl}
    base = weather[rules.DEFAULT_CLOTHING]
    return {name: sensor_twl + (twl - base) for name, twl in weather.items()}


def assess_squad(view: dict, squad_id: str, settings: dict) -> tuple[list[WorkerRisk], dict]:
    """Bands for one of the site's other squads, from its roster and its own squad sensor."""
    squad = squads()[squad_id]
    clock = datetime.fromisoformat(view['clock'])
    from .demo_site import hour_of
    hour = hour_of(view['clock'])
    sensor = squad['sensor']
    live = settings['sensors'].get(sensor) == 'live'
    sensor_twl = settings['twl'].get(squad_id, {}).get(sensor, {}).get(str(hour)) if live else None
    weather = site_twl(clock.date().isoformat(), clock.hour)
    heat = squad_heat(weather, sensor_twl)
    conditions = settings['conditions']

    def factors(w: dict) -> WorkerFactors:
        has = set(conditions.get(w['id'], ()))
        return WorkerFactors(
            w['id'], work_intensity=w['work_intensity'], clothing=w['clothing'],
            acclimatisation=(acclimatisation_status(clock.date(), new_starter_since=clock.date()) if 'not_acclimatised' in has
                             else acclimatisation_for(w['id'], clock.date())),
            symptoms_reported='unwell' in has, low_fluid='low_fluid' in has,
            heat_sensitive='heat_sensitive' in has, red_flag='red_flag' in has,
        )
    risks = [compute_worker_risk(heat, factors(w), environment_ok=live) for w in squad['workers']]
    inputs = {'hour': f'{clock.hour:02}:00', 'site': CASE_SITE, 'squad': squad_id, 'sensor': sensor,
              'weather': 'ok' if heat is not None else 'unavailable',
              'local_reading': 'used' if sensor_twl is not None else 'lost', 'rules_version': rules.RULES_VERSION}
    return risks, inputs


def _settings(request: Request) -> dict:
    from .demo_site import load
    return load(request.app.state.service)[0]


def _conditions(request: Request) -> dict[str, list[str]]:
    return _settings(request)['conditions']


@router.get('/api/case/crew-risk')
def case_crew_risk(request: Request, squad: str | None = None):
    """Each worker's band and action for supervisors and responders. No reasons, symptoms or readings.

    ``squad`` picks one of the site's other squads; without it, the case crew.
    """
    persona = actor(request)
    if persona in WORKERS or persona == 'P10':
        raise HTTPException(403, 'Crew heat risk is for supervisors; your own is on your phone')
    if squad is not None and squad not in squads():
        raise HTTPException(404, f'Unknown squad {squad}')
    view = request.app.state.service.read_case(None)
    if not view:
        return None
    risks, inputs = assess_squad(view, squad, _settings(request)) if squad else assess(view, _conditions(request))
    return {'inputs': inputs, 'crew': crew_risk(risks),
            'workers': [] if persona == 'P01' else [r.for_supervisor() for r in risks]}


@router.get('/api/worker/risk')
def own_risk(request: Request):
    """The signed-in worker's own band, with the reasons only they see."""
    persona = actor(request)
    if persona not in WORKERS:
        raise HTTPException(403, 'Only a worker can see their own heat risk')
    view = request.app.state.service.read_case(None)
    if not view:
        return None
    risks, inputs = assess(view, _conditions(request))
    mine = next((r for r in risks if r.person_id == persona), None)
    return mine and {'inputs': inputs, **mine.for_worker()}
