"""Worker consent and data, the trust log, and branding guardrails (application/platform_api.py)."""
import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from heat_safe.application import platform_api
from heat_safe.application import service as module


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('HEAT_SAFE_LOCAL_DIR', str(tmp_path))

    async def graph(request, _url):
        return 200, {'heat': {'held_task_ids': ['civil_heavy']}, 'protective_response': {},
                     'crew_rest': {'planning_status': 'planned', 'intervals': [
                         {'person_id': 'C05', 'kind': 'recovery', 'task_id': None, 'zone_id': 'shelter_a',
                          'starts_at': request['decision_at'], 'ends_at': '2025-08-04T08:15:00+04:00', 'requires_revalidation': False},
                         {'person_id': 'C06', 'kind': 'recovery', 'task_id': None, 'zone_id': 'shelter_a',
                          'starts_at': request['decision_at'], 'ends_at': '2025-08-04T08:15:00+04:00', 'requires_revalidation': False}],
                         'blockers': []}, 'restart': {'status': 'blocked'}}, ['stub']
    monkeypatch.setattr(module, 'run_graph', graph)
    service = module.CaseService(tmp_path / 'case.sqlite3')
    current = asyncio.run(service.start())
    for actor, action in [('P03', 'issue'), ('C01', 'acknowledge'), ('C01', 'stop'), ('C05', 'checkin')]:
        current = asyncio.run(service.command(actor, {'command_id': action, 'expected_version': current['version'], 'action': action, 'payload': {}}))
    api = FastAPI()
    api.state.service = service
    api.include_router(platform_api.router)
    return api


def client(app, persona):
    token, _ = app.state.service.create_session(persona)
    http = TestClient(app)
    http.cookies.set('heat_persona', token)
    return http


def test_worker_consent_is_their_own_and_withdrawable(app):
    rana = client(app, 'C05')
    assert rana.get('/api/worker/consent').json() == {'person_id': 'C05', 'language': 'en', 'consented_at': None, 'scopes': []}
    saved = rana.put('/api/worker/consent', json={'language': 'ar', 'scopes': ['check_in', 'heat_alerts']}).json()
    assert saved['language'] == 'ar' and saved['scopes'] == ['check_in', 'heat_alerts'] and saved['consented_at']
    assert client(app, 'C08').get('/api/worker/consent').json()['scopes'] == []
    withdrawn = rana.delete('/api/worker/consent').json()
    assert withdrawn['scopes'] == [] and withdrawn['consented_at'] is None and withdrawn['language'] == 'ar'


def test_consent_rejects_unknown_values_and_non_workers(app):
    rana = client(app, 'C05')
    assert rana.put('/api/worker/consent', json={'language': 'xx', 'scopes': []}).status_code == 422
    assert rana.put('/api/worker/consent', json={'language': 'en', 'scopes': ['location_tracking']}).status_code == 422
    assert client(app, 'C01').get('/api/worker/consent').status_code == 403
    assert TestClient(app).get('/api/worker/consent').status_code == 401


def test_worker_data_holds_only_their_own_records(app):
    data = client(app, 'C05').get('/api/worker/data').json()
    assert data['person_id'] == 'C05'
    assert len(data['check_ins']) == 1 and data['reports'] == []
    assert {i['person_id'] for i in data['plan_intervals']} == {'C05'}


def test_trust_log_lists_runs_commands_and_is_for_supervisors(app):
    assert client(app, 'P10').get('/api/trust-log').status_code == 403
    entries = client(app, 'P02').get('/api/trust-log').json()
    kinds = {e['kind'] for e in entries}
    assert {'solver_run', 'command'} <= kinds
    assert all(not e['applied'] for e in entries if e['kind'] == 'solver_run')
    assert any('Maya Al Qamar' in e['summary'] for e in entries)
    assert sum('current result' in e['summary'] for e in entries) <= 1
    assert all('order' not in e for e in entries)
    assert client(app, 'C05').get('/api/trust-log').status_code == 403


def test_trust_log_keeps_sensor_readings_apart_from_people_and_in_order(app):
    service = app.state.service
    asyncio.run(service.advance_clock('2025-08-04T08:10:00+04:00'))
    reading = {'sensor_id': 't1', 'zone_id': 'civil_exposed', 'twl': 145, 'unit': 'W/m²', 'quality': 'invalid',
               'measured_at': '2025-08-04T08:10:00+04:00', 'received_at': '2025-08-04T08:10:00+04:00'}
    asyncio.run(service.signal('reading', reading))
    entries = client(app, 'P02').get('/api/trust-log').json()
    signals = [e for e in entries if e['kind'] == 'signal']
    assert [s['summary'] for s in signals] == ['New local monitor reading received']
    assert not any(e['kind'] == 'command' and 'sensor' in e['summary'] for e in entries)
    runs = [int(e['summary'].split('version ')[1].split()[0].rstrip(':')) for e in entries if e['kind'] == 'solver_run']
    assert runs == sorted(runs, reverse=True)


PALETTE = {'name': 'Sandline', 'primary': '#1F3A5F', 'on_primary': '#FFFFFF', 'logo_text': 'SANDLINE', 'rail_tint': False}


def test_only_the_admin_publishes_branding_after_typed_confirmation(app):
    body = {'platform': PALETTE, 'mobile': PALETTE, 'expected_version': 0, 'confirm': 'PUBLISH'}
    assert client(app, 'P02').put('/api/brand', json=body).status_code == 403
    admin = client(app, 'P09')
    assert admin.put('/api/brand', json={**body, 'confirm': 'publish'}).status_code == 422
    published = admin.put('/api/brand', json=body).json()
    assert published['version'] == 1 and published['published_by'] == 'P09' and published['platform']['primary'] == '#1F3A5F'
    assert admin.put('/api/brand', json=body).status_code == 409
    assert client(app, 'C05').get('/api/brand').json()['version'] == 1


@pytest.mark.parametrize('primary,failing', [('#D32F2F', 'signal'), ('#2E7D32', 'signal'), ('#F9A825', 'signal'), ('#DDDDDD', 'contrast'), ('blue', 'format')])
def test_branding_guardrails_keep_signal_colours_and_contrast(app, primary, failing):
    checks = platform_api.check_palette(platform_api.Palette(**{**PALETTE, 'primary': primary}))
    assert failing in {c['id'] for c in checks if not c['ok']}
    body = {'platform': {**PALETTE, 'primary': primary}, 'mobile': PALETTE, 'expected_version': 0, 'confirm': 'PUBLISH'}
    assert client(app, 'P09').put('/api/brand', json=body).status_code == 422


def test_conditions_come_from_the_risk_core_for_the_case_day(app, monkeypatch):
    calls = []

    def fake(site, day):
        calls.append((site, day))
        return {'status': 'ok', 'site': site, 'date': day, 'source': 'cache:era5_summer_2025.csv',
                'summary': {'worst_band': 'red'}, 'zone_thresholds_wm2': {'high_below': 115, 'low_from': 140},
                'hourly': [{'hour': '08:00', 'twl_sun_wm2': 127, 'twl_zone_sun': 'medium'}],
                'citation': [], 'rules_version': 'test'}
    import heat_safe.agent_tools as tools
    monkeypatch.setattr(tools, 'compute_heat_stress', fake)
    body = client(app, 'P03').get('/api/case/conditions').json()
    assert calls == [('mussafah', '2025-08-04')]
    assert body['kind'] == 'replay' and body['clock_hour'] == '08:00'
    assert body['current'] == {'hour': '08:00', 'twl_sun_wm2': 127, 'twl_zone_sun': 'medium'}
    assert TestClient(app).get('/api/case/conditions').status_code == 401


def test_conditions_report_unavailable_instead_of_failing(app, monkeypatch):
    import heat_safe.agent_tools as tools
    monkeypatch.setattr(tools, 'compute_heat_stress', lambda site, day: {'status': 'error', 'message': 'no weather data'})
    body = client(app, 'C01').get('/api/case/conditions').json()
    assert body == {'status': 'unavailable', 'site': 'mussafah', 'date': '2025-08-04', 'message': 'no weather data'}
