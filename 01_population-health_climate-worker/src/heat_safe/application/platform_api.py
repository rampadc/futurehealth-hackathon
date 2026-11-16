"""Worker consent and data, the supervisor trust log, organisation branding and site heat conditions.

These back the worker welcome and my-data screens, system & trust, admin settings and the
conditions panel (see supervisor-ui/src/contract.ts).
Consent and exports only ever cover the signed-in worker. Branding is published only by
the organisation admin and is checked against the safety signal colours before it is saved.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import storage
from .service import ACTIONS, PEOPLE

router = APIRouter()

WORKERS = {'C05', 'C08'}
ADMINS = {'P09'}
SCOPES = ('heat_alerts', 'check_in', 'symptom_report', 'wearable')
LANGUAGES = {'en', 'ar', 'ur', 'hi', 'ml', 'bn', 'tl'}
# Worker actions that may appear in the worker's own export. Clinical notes never enter the ledger.
OWN_ACTIONS = {'checkin', 'report'}

SQLITE_TABLES = '''
  CREATE TABLE IF NOT EXISTS worker_consent(person_id TEXT PRIMARY KEY, language TEXT NOT NULL,
    scopes TEXT NOT NULL, consented_at TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS brand(id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL,
    published_at TEXT NOT NULL, published_by TEXT NOT NULL, settings TEXT NOT NULL);
'''
# PostgreSQL creates the same tables in storage.initialize().


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def connect(request: Request):
    service = request.app.state.service
    db = service._conn()
    if not service._postgres:
        db.executescript(SQLITE_TABLES)
    return db


def actor(request: Request) -> str:
    persona = request.app.state.service.actor_from_request(request)
    if not persona:
        raise HTTPException(401, 'Choose your account again')
    return persona


# ── Worker consent and data ─────────────────────────────────────────

class ConsentInput(BaseModel):
    language: str
    scopes: list[str] = Field(default_factory=list, max_length=len(SCOPES))


def _consent(db, person_id: str) -> dict:
    row = db.execute('SELECT language, scopes, consented_at FROM worker_consent WHERE person_id=?', (person_id,)).fetchone()
    if not row:
        return {'person_id': person_id, 'language': 'en', 'consented_at': None, 'scopes': []}
    return {'person_id': person_id, 'language': row['language'], 'consented_at': row['consented_at'], 'scopes': json.loads(row['scopes'])}


def worker(request: Request) -> str:
    persona = actor(request)
    if persona not in WORKERS:
        raise HTTPException(403, 'Only a worker can see or change their own consent')
    return persona


@router.get('/api/worker/consent')
def get_consent(request: Request):
    person_id = worker(request)
    with connect(request) as db:
        return _consent(db, person_id)


@router.put('/api/worker/consent')
def put_consent(body: ConsentInput, request: Request):
    person_id = worker(request)
    if body.language not in LANGUAGES:
        raise HTTPException(422, 'Unsupported language')
    if any(scope not in SCOPES for scope in body.scopes):
        raise HTTPException(422, 'Unknown consent scope')
    scopes = sorted(set(body.scopes))
    stamp = now()
    with connect(request) as db:
        db.execute('DELETE FROM worker_consent WHERE person_id=?', (person_id,))
        db.execute('INSERT INTO worker_consent VALUES (?, ?, ?, ?, ?)',
                   (person_id, body.language, json.dumps(scopes), stamp if scopes else None, stamp))
        return _consent(db, person_id)


@router.delete('/api/worker/consent')
def withdraw_consent(request: Request):
    """Withdraw every optional scope. Heat alerts for the crew continue regardless."""
    person_id = worker(request)
    with connect(request) as db:
        language = _consent(db, person_id)['language']
        db.execute('DELETE FROM worker_consent WHERE person_id=?', (person_id,))
        db.execute('INSERT INTO worker_consent VALUES (?, ?, ?, ?, ?)', (person_id, language, '[]', None, now()))
        return _consent(db, person_id)


@router.get('/api/worker/data')
def worker_data(request: Request):
    """The signed-in worker's own records: consent, own check-ins and reports, own plan."""
    person_id = worker(request)
    service = request.app.state.service
    view = service.read_case(person_id)
    with connect(request) as db:
        consent = _consent(db, person_id)
        events = []
        if view:
            events = db.execute('SELECT action, occurred_at FROM events WHERE case_id=? AND actor_id=? ORDER BY id',
                                (view['case_id'], person_id)).fetchall()
    own = [e for e in events if e['action'] in OWN_ACTIONS]
    intervals = []
    if view and view.get('capture'):
        intervals = [i for i in view['capture']['response']['crew_rest']['intervals'] if i['person_id'] == person_id]
    return {
        'person_id': person_id, 'generated_at': now(), 'consent': consent,
        'check_ins': [{'at': e['occurred_at'], 'location_id': 'shelter_a'} for e in own if e['action'] == 'checkin'],
        'reports': [{'at': e['occurred_at'], 'kind': 'needs_rest'} for e in own if e['action'] == 'report'],
        'plan_intervals': intervals,
        'note': 'Clinical notes are never stored in the shared operations record.',
    }


# ── Site heat conditions ─────────────────────────────────────────────────────

CASE_SITE = 'mussafah'  # the Sandline utility corridor in the demo case


@router.get('/api/case/conditions')
def conditions(request: Request):
    """Hourly TWL zones for the case site and day, from the risk core (ERA5 replay or forecast).

    Read-only context for planning. It is not a local measurement and never clears a hold: only a
    fresh, valid same-zone reading and the human review do that.
    """
    actor(request)
    view = request.app.state.service.read_case(None)
    if not view:
        return None
    clock = datetime.fromisoformat(view['clock'])
    from heat_safe.agent_tools import compute_heat_stress
    result = compute_heat_stress(CASE_SITE, clock.date().isoformat())
    if result.get('status') != 'ok':
        return {'status': 'unavailable', 'site': CASE_SITE, 'date': clock.date().isoformat(),
                'message': result.get('message', 'Heat conditions unavailable')}
    hour = f'{clock.hour:02}:00'
    current = next((h for h in result['hourly'] if h['hour'] == hour), None)
    return {'status': 'ok', 'site': CASE_SITE, 'date': result['date'], 'source': result['source'],
            'kind': 'replay' if 'era5' in result['source'] else 'forecast', 'clock_hour': hour,
            'current': current, 'summary': result['summary'], 'hourly': result['hourly'],
            'zone_thresholds_wm2': result['zone_thresholds_wm2'], 'citation': result['citation'],
            'rules_version': result['rules_version']}


# ── Trust log ───────────────────────────────────────────────────────────

@router.get('/api/trust-log')
def trust_log(request: Request):
    """Solver runs, agent answers and human commands for the active case. Supervisors only."""
    persona = actor(request)
    if persona in WORKERS or persona in {'P01', 'P10'}:
        raise HTTPException(403, 'The trust log is for supervisors')
    service = request.app.state.service
    view = service.read_case(None)
    if not view:
        return []
    entries = []
    with service._conn() as db:
        runs = db.execute('SELECT id, version, status, started_at, error, response, applied FROM runs WHERE case_id=? ORDER BY version', (view['case_id'],)).fetchall()
        events = db.execute('SELECT id, actor_id, action, occurred_at FROM events WHERE case_id=? ORDER BY id', (view['case_id'],)).fetchall()
    for r in runs:
        # `runs.applied` marks the result the case currently shows; whether the proposal was applied
        # on site is the solver response's own `applied` field, which is always false.
        response = json.loads(r['response'] or 'null') or {}
        current = r['applied'] and r['version'] == view['version']
        entries.append({'id': f"run-{r['id']}", 'at': r['started_at'], 'kind': 'solver_run', 'status': r['status'],
                        'summary': f"Solver run for case version {r['version']}" + (' · current result' if current else '') + (f": {r['error']}" if r['error'] else ''),
                        'applied': bool(response.get('applied', False)), 'order': (1, r['version'])})
    for e in events:
        title = ACTIONS.get(e['action'], (None, e['action']))[1]
        # Sensor readings and automatic escalations are not a person's record.
        if e['actor_id'] in ('sensor', 'system'):
            entries.append({'id': f"event-{e['id']}", 'at': e['occurred_at'], 'kind': 'signal', 'status': 'received',
                            'summary': title, 'applied': False, 'order': (0, e['id'])})
            continue
        owner = PEOPLE.get(e['actor_id'], {}).get('name', e['actor_id'])
        entries.append({'id': f"event-{e['id']}", 'at': e['occurred_at'], 'kind': 'command', 'status': 'recorded',
                        'summary': f'{owner}: {title}', 'applied': True, 'order': (0, e['id'])})
    try:
        from heat_safe.live_assistant import connect as assistant_db
        with assistant_db() as db:
            agents = db.execute('SELECT id, persona_id, recorded_at, detail FROM agent_runs WHERE case_id=?', (view['case_id'],)).fetchall()
    except Exception:
        agents = []
    for a in agents:
        detail = json.loads(a['detail'])
        tools = sorted({t.get('name', '') for t in detail.get('tools', []) if t.get('name')})
        owner = PEOPLE.get(a['persona_id'], {}).get('name', a['persona_id'])
        entries.append({'id': f"agent-{a['id']}", 'at': a['recorded_at'], 'kind': 'agent_run', 'status': detail.get('status', 'unknown'),
                        'summary': f"Planning Agent answered {owner}" + (f" · tools: {', '.join(tools)}" if tools else ''),
                        'applied': False})
    # Newest first. Within one instant a record precedes the solver run it triggers; each kind keeps its own order.
    entries.sort(key=lambda e: (datetime.fromisoformat(e['at']), *e.get('order', (2, 0))), reverse=True)
    return [{k: v for k, v in e.items() if k != 'order'} for e in entries]


# ── Branding ────────────────────────────────────────────────────────────

HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
# Hues reserved for safety signals: red (Stop), amber (Caution), green (Safe).
SIGNALS = {'stop': 0, 'caution': 45, 'safe': 130}


class Palette(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    primary: str
    on_primary: str
    logo_text: str = Field(min_length=1, max_length=40)
    rail_tint: bool = False


class BrandInput(BaseModel):
    platform: Palette
    mobile: Palette
    expected_version: int
    confirm: str


def _rgb(hex_colour: str):
    value = hex_colour.lstrip('#')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _luminance(hex_colour: str) -> float:
    def channel(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in _rgb(hex_colour))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _hue_saturation(hex_colour: str):
    r, g, b = _rgb(hex_colour)
    high, low = max(r, g, b), min(r, g, b)
    if high == low:
        return 0.0, 0.0
    delta = high - low
    saturation = delta / (1 - abs(high + low - 1))
    if high == r:
        hue = 60 * (((g - b) / delta) % 6)
    elif high == g:
        hue = 60 * ((b - r) / delta + 2)
    else:
        hue = 60 * ((r - g) / delta + 4)
    return hue, saturation


def check_palette(palette: Palette) -> list[dict]:
    """Guardrails: legible text, and no colour that reads as Stop, Caution or Safe."""
    checks = []
    valid = bool(HEX.match(palette.primary) and HEX.match(palette.on_primary))
    checks.append({'id': 'format', 'ok': valid, 'label': 'Colours are six-digit hex values'})
    if not valid:
        return checks
    ratio = contrast(palette.primary, palette.on_primary)
    checks.append({'id': 'contrast', 'ok': ratio >= 4.5, 'label': f'Text on brand colour contrast {ratio:.1f}:1 (needs 4.5:1)'})
    hue, saturation = _hue_saturation(palette.primary)
    clash = None
    if saturation >= 0.35:
        for name, centre in SIGNALS.items():
            if min(abs(hue - centre), 360 - abs(hue - centre)) < 20:
                clash = name
    checks.append({'id': 'signal', 'ok': clash is None,
                   'label': 'Brand colour does not read as a safety signal' if clash is None else f'Brand colour reads as the {clash} signal; keep it to the logo mark'})
    return checks


def _brand(db) -> dict:
    row = db.execute('SELECT version, published_at, published_by, settings FROM brand WHERE id=1').fetchone()
    if not row:
        return {'version': 0, 'published_at': None, 'published_by': None, 'platform': None, 'mobile': None}
    return {'version': row['version'], 'published_at': row['published_at'], 'published_by': row['published_by'], **json.loads(row['settings'])}


@router.get('/api/brand')
def get_brand(request: Request):
    actor(request)
    with connect(request) as db:
        return _brand(db)


@router.post('/api/brand/check')
def check_brand(body: BrandInput, request: Request):
    actor(request)
    return {'platform': check_palette(body.platform), 'mobile': check_palette(body.mobile)}


@router.put('/api/brand')
def publish_brand(body: BrandInput, request: Request):
    persona = actor(request)
    if persona not in ADMINS:
        raise HTTPException(403, 'Only the organisation admin can publish branding')
    if body.confirm != 'PUBLISH':
        raise HTTPException(422, 'Type PUBLISH to confirm')
    failing = [c['label'] for p in (body.platform, body.mobile) for c in check_palette(p) if not c['ok']]
    if failing:
        raise HTTPException(422, 'Branding fails its guardrails: ' + '; '.join(failing))
    with connect(request) as db:
        current = _brand(db)
        if current['version'] != body.expected_version:
            raise HTTPException(409, 'Branding changed since you opened it. Reload and try again.')
        settings = json.dumps({'platform': body.platform.model_dump(), 'mobile': body.mobile.model_dump()})
        db.execute('DELETE FROM brand WHERE id=1')
        db.execute('INSERT INTO brand VALUES (1, ?, ?, ?, ?)', (current['version'] + 1, now(), persona, settings))
        return _brand(db)
