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
    entries = client(app, 'P02').get('/api/trust-log').json()
    kinds = {e['kind'] for e in entries}
    assert {'solver_run', 'command'} <= kinds
    assert all(not e['applied'] for e in entries if e['kind'] == 'solver_run')
    assert any('Maya Al Qamar' in e['summary'] for e in entries)
    assert client(app, 'C05').get('/api/trust-log').status_code == 403


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
