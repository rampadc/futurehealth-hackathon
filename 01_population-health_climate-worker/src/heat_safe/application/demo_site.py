"""Presenter site settings: hourly TWL per squad sensor, sensor state, worker health conditions, case time.

The presenter edits these on the demo control screen. They reach the case only through the existing
contracts:

* Sensor t1 (the civil crew's monitor) is the only sensor the case ledger reads. When the presenter edits
  its TWL for an hour, or marks it stale or offline, a ``sensor_reading`` signal is recorded at the case
  clock (once per hour and setting), exactly like the existing reading signal. Unedited, the scenario's own
  08:00 reading stands and nothing is injected.
* The other squads' sensors are a site fixture (``supervisor-ui/src/screens/squads.tsx``); their values are
  read by the squad screens through ``GET /api/case/site-sensors``.
* Health conditions feed the per-worker heat-risk bands (``crew_risk.assess``) as risk modifiers. They are
  planning information: they never record a report, clear a hold or reach the solver.
* Case time can be moved to any minute in the case window. Moving earlier starts a new case at 08:00 and
  moves it forward, so recorded actions after the target time are cleared.
"""
from __future__ import annotations

import copy
import json
import logging
from datetime import timedelta

from fastapi import APIRouter, Request
from pydantic import BaseModel

from .service import CaseError, CaseService, END, SEED, START, at, encoded

log = logging.getLogger(__name__)
router = APIRouter()

HOURS = list(range(START.hour, END.hour + (1 if END.minute else 0)))
SENSOR_STATES = ('live', 'stale', 'offline')
LIVE_SENSOR = 't1'
LIVE_SQUAD = 'civil'
# squad -> sensor -> hour -> TWL (W/m²). Civil t1 defaults to the scenario's own 08:00 reading.
DEFAULT_TWL = {
    'civil': {'t1': {h: 145 for h in HOURS}},
    'form': {'t2': dict(zip(HOURS, (156, 150, 144)))},
    'steel': {'t3': dict(zip(HOURS, (138, 132, 126)))},
    'mep': {'m1': dict(zip(HOURS, (168, 166, 164)))},
}
DEFAULT_SENSORS = {'t1': 'live', 't2': 'live', 't3': 'offline', 'm1': 'live'}
CONDITIONS = {
    'not_acclimatised': 'New to the heat (not acclimatised)',
    'heat_sensitive': 'Heat-sensitive health condition or medicine',
    'low_fluid': 'Low fluid intake',
    'unwell': 'Feeling unwell (non-urgent symptoms)',
    'red_flag': 'Red-flag symptoms (confusion, collapse)',
}
CASE_WORKERS = [w['person_id'] for w in SEED['snapshot']['workers']]


def _squad_workers() -> set[str]:
    from .crew_risk import squad_worker_ids
    return squad_worker_ids()


def defaults() -> dict:
    return {'twl': {q: {s: {str(h): v for h, v in hours.items()} for s, hours in sensors.items()} for q, sensors in DEFAULT_TWL.items()},
            'sensors': dict(DEFAULT_SENSORS), 'conditions': {}}


def _validate(settings: dict) -> dict:
    base = defaults()
    twl, sensors, conditions = settings.get('twl', {}), settings.get('sensors', {}), settings.get('conditions', {})
    if not isinstance(twl, dict) or not isinstance(sensors, dict) or not isinstance(conditions, dict):
        raise CaseError(422, 'Site settings require twl, sensors and conditions objects')
    for squad, by_sensor in twl.items():
        if squad not in base['twl'] or not isinstance(by_sensor, dict):
            raise CaseError(422, f'Unknown squad {squad}')
        for sensor, by_hour in by_sensor.items():
            if sensor not in base['twl'][squad] or not isinstance(by_hour, dict):
                raise CaseError(422, f'Unknown sensor {sensor} for {squad}')
            for hour, value in by_hour.items():
                if hour not in base['twl'][squad][sensor]:
                    raise CaseError(422, f'Hour {hour} is outside the case window')
                if type(value) not in (int, float) or not 0 < value < 500:
                    raise CaseError(422, 'TWL must be between 0 and 500 W/m²')
                base['twl'][squad][sensor][hour] = round(float(value), 1)
    for sensor, state in sensors.items():
        if sensor not in DEFAULT_SENSORS or state not in SENSOR_STATES:
            raise CaseError(422, f'Unknown sensor state {sensor}={state}')
        base['sensors'][sensor] = state
    for person, items in conditions.items():
        if person not in CASE_WORKERS and person not in _squad_workers() or not isinstance(items, list) or any(i not in CONDITIONS for i in items):
            raise CaseError(422, f'Unknown health condition for {person}')
        if items:
            base['conditions'][person] = sorted(set(items))
    return base


def load(service: CaseService) -> tuple[dict, str | None]:
    with service._conn() as c:
        row = c.execute('SELECT settings, applied_key FROM demo_settings WHERE id=1').fetchone()
    if not row:
        return defaults(), None
    try:
        return _validate(json.loads(row['settings'])), row['applied_key']
    except CaseError:
        return defaults(), row['applied_key']


def save(service: CaseService, settings: dict) -> dict:
    """Replace the settings; the record of the last injected reading is kept."""
    valid = _validate(settings)
    with service._conn() as c:
        row = c.execute('SELECT applied_key FROM demo_settings WHERE id=1').fetchone()
        key = row['applied_key'] if row else None
        c.execute('DELETE FROM demo_settings WHERE id=1')
        c.execute('INSERT INTO demo_settings(id, settings, applied_key) VALUES (1,?,?)', (encoded(valid), key))
    return valid


def _set_key(service: CaseService, key: str):
    with service._conn() as c:
        c.execute('UPDATE demo_settings SET applied_key=? WHERE id=1', (key,))


def hour_of(clock: str) -> int:
    return min(max(at(clock).hour, HOURS[0]), HOURS[-1])


def edited(settings: dict) -> bool:
    """Whether the presenter has changed the live sensor from the scenario feed for any hour."""
    base = defaults()
    return (settings['twl'][LIVE_SQUAD][LIVE_SENSOR] != base['twl'][LIVE_SQUAD][LIVE_SENSOR]
            or settings['sensors'][LIVE_SENSOR] != DEFAULT_SENSORS[LIVE_SENSOR])


async def sync(service: CaseService) -> bool:
    """Record the live sensor's configured reading for the current case hour, once per hour and setting."""
    with service._conn() as c:
        case = service._active(c)
    if not case or not case.get('started_at') or at(case['clock']) >= END:
        return False
    settings, applied = load(service)
    hour = hour_of(case['clock'])
    twl = settings['twl'][LIVE_SQUAD][LIVE_SENSOR][str(hour)]
    state = settings['sensors'][LIVE_SENSOR]
    key = f"{case['id']}|{hour}|{twl}|{state}"
    if key == applied:
        return False
    if not edited(settings) and not (applied or '').startswith(case['id'] + '|'):
        return False  # Unedited: the scenario's own reading stands.
    _set_key(service, key)
    now = at(case['clock']).replace(microsecond=0)
    measured = now - timedelta(minutes=10) if state == 'stale' else now
    payload = {'twl': twl, 'sensor_id': LIVE_SENSOR, 'zone_id': 'civil_exposed', 'unit': 'W/m²',
               'quality': 'invalid' if state == 'offline' else 'valid',
               'measured_at': measured.isoformat(), 'received_at': now.isoformat()}
    try:
        await service.signal('reading', payload, case_id=case['id'])
    except CaseError as error:
        log.warning('Configured reading not recorded: %s', error.detail)
        return False
    return True


async def jump(service: CaseService, iso: str) -> dict:
    target = at(iso)
    if not START <= target < END:
        raise CaseError(422, 'Choose a time inside the case window, 08:00 to 10:30')
    with service._conn() as c:
        case = service._active(c)
    if not case or not case.get('started_at'):
        await service.reset()
    elif target < at(case['clock']) - timedelta(seconds=5):
        await service.reset()
    with service._conn() as c:
        current = at(service._active(c)['clock'])
    if target > current + timedelta(seconds=1):
        await service.advance_clock(target.isoformat())
    await sync(service)
    return service.read_case(None)


def public_view(settings: dict, clock: str | None) -> dict:
    """What any signed-in screen may read: sensor states and each squad sensor's TWL for the case hour."""
    hour = hour_of(clock) if clock else HOURS[0]
    return {'hour': hour, 'hours': HOURS, 'sensors': settings['sensors'],
            'squads': {q: {s: by_hour[str(hour)] for s, by_hour in sensors.items()} for q, sensors in settings['twl'].items()},
            'live_sensor_edited': edited(settings)}


class SettingsInput(BaseModel):
    twl: dict = {}
    sensors: dict = {}
    conditions: dict = {}


def _view(service: CaseService):
    with service._conn() as c:
        case = service._active(c)
    return case['clock'] if case else None


@router.get('/api/demo/site')
def get_site(request: Request):
    service = request.app.state.service
    settings, _ = load(service)
    return {'settings': settings, 'defaults': defaults(), 'conditions': CONDITIONS, 'workers': CASE_WORKERS,
            **public_view(settings, _view(service))}


@router.put('/api/demo/site')
async def put_site(body: SettingsInput, request: Request):
    service = request.app.state.service
    save(service, body.model_dump())
    await sync(service)
    return get_site(request)


@router.post('/api/demo/site/defaults')
async def restore_defaults(request: Request):
    service = request.app.state.service
    save(service, defaults())
    await sync(service)
    return get_site(request)


@router.get('/api/demo/crew-risk')
def presenter_crew_risk(request: Request):
    """Presenter view: every worker's band, action and reasons, for the site map."""
    from .crew_risk import assess
    service = request.app.state.service
    view = service.read_case(None)
    if not view:
        return None
    settings, _ = load(service)
    risks, inputs = assess(view, settings['conditions'])
    return {'inputs': inputs, 'workers': [{**r.for_worker(), 'supervisor_action': r.supervisor_action} for r in risks]}


@router.get('/api/case/site-sensors')
def site_sensors(request: Request):
    service = request.app.state.service
    settings, _ = load(service)
    return public_view(copy.deepcopy(settings), _view(service))
