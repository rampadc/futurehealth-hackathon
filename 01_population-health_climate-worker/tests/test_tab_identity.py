"""Persona selection belongs to one tab inside the shared access perimeter."""
import hashlib
import os

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from heat_safe.application import access, storage


@pytest.fixture(params=['sqlite', 'postgres'])
def client(monkeypatch, tmp_path, request):
    if request.param == 'postgres':
        if not os.getenv('POSTGRES_TEST_URL'):
            pytest.skip('No disposable PostgreSQL test URL')
        monkeypatch.setenv('DATABASE_URL', os.environ['POSTGRES_TEST_URL'])
    else:
        monkeypatch.delenv('DATABASE_URL', raising=False)
        monkeypatch.delenv('DATABASE_HOST', raising=False)
    monkeypatch.setenv('HEAT_CASE_DB', str(tmp_path / 'case.sqlite3'))
    monkeypatch.setenv('HEAT_REQUIRE_ACCESS', 'true')
    monkeypatch.setenv('HEAT_ACCESS_CODE_SHA256', hashlib.sha256(b'viewer-code').hexdigest())
    monkeypatch.setenv('HEAT_PRESENTER_CODE_SHA256', hashlib.sha256(b'presenter-code').hexdigest())
    from heat_safe.application import api
    from heat_safe.application.service import CaseService, CaseError

    storage.initialize()
    access.initialize()
    service = CaseService()
    access.initialize_tabs(service)
    with storage.connection() as db:
        for table in ('persona_tabs', 'access_personas', 'access_sessions', 'access_attempts'):
            db.execute(f'DELETE FROM {table}')
    app = FastAPI()
    app.state.service = service
    app.middleware('http')(access.protect)
    app.include_router(access.router)
    app.add_exception_handler(CaseError, api.case_error)
    app.add_api_route('/api/session', api.session, methods=['GET'])
    app.add_api_route('/api/session', api.choose_session, methods=['POST'])
    app.add_api_route('/api/session', api.leave_session, methods=['DELETE'])
    app.add_api_route('/api/case/commands', api.command, methods=['POST'])
    app.add_api_route('/api/case/retry', api.retry, methods=['POST'])
    app.add_api_route('/api/demo/signals', api.signal, methods=['POST'])
    app.add_api_route('/api/demo/clock', api.clock, methods=['POST'])

    @app.get('/api/whoami')
    def whoami(request: Request):
        return {'actor': access.actor_for_request(request, service)}

    with TestClient(app, base_url='https://site.test', headers={'origin': 'https://site.test'}) as http:
        assert http.post('/api/access', json={'code': 'viewer-code'}).status_code == 200
        yield http


HUDA = {'x-heat-tab-id': 'huda-tab-1111111111111111'}
RANA = {'x-heat-tab-id': 'rana-tab-2222222222222222'}


def test_personas_and_sign_out_are_independent_per_tab(client):
    assert client.post('/api/session', headers=HUDA, json={'persona_id': 'C01'}).status_code == 200
    assert client.post('/api/session', headers=RANA, json={'persona_id': 'C05'}).status_code == 200
    assert client.get('/api/session', headers=HUDA).json()['person']['id'] == 'C01'
    assert client.get('/api/session', headers=RANA).json()['person']['id'] == 'C05'
    assert client.delete('/api/session', headers=HUDA).status_code == 200
    assert client.get('/api/session', headers=HUDA).json()['person'] is None
    assert client.get('/api/session', headers=RANA).json()['person']['id'] == 'C05'


def test_access_lock_revokes_all_its_tabs(client):
    client.post('/api/session', headers=HUDA, json={'persona_id': 'C01'})
    client.post('/api/session', headers=RANA, json={'persona_id': 'C05'})
    assert client.delete('/api/access').status_code == 200
    assert client.get('/api/session', headers=RANA).status_code == 401
    assert client.post('/api/access', json={'code': 'viewer-code'}).status_code == 200
    assert client.get('/api/session', headers=RANA).json()['person'] is None
    assert client.get('/api/session', headers=HUDA).json()['person'] is None


def test_tab_cannot_move_between_access_sessions(client):
    client.post('/api/session', headers=HUDA, json={'persona_id': 'C01'})
    old_cookies = dict(client.cookies)
    client.post('/api/access', json={'code': 'viewer-code'})
    assert client.get('/api/session', headers=HUDA).json()['person'] is None
    with TestClient(client.app, base_url='https://site.test', cookies=old_cookies) as original:
        assert original.get('/api/session', headers=HUDA).json()['person']['id'] == 'C01'


def test_missing_or_spoofed_legacy_cookie_never_selects_hosted_persona(client):
    client.post('/api/session', headers=HUDA, json={'persona_id': 'C01'})
    client.cookies.set('heat_persona', 'legacy-global-persona')
    assert client.get('/api/session', headers=HUDA).json()['person']['id'] == 'C01'
    assert client.get('/api/whoami').status_code == 401
    assert client.post('/api/session', json={'persona_id': 'C05'}).status_code == 400


def test_tab_ids_and_personas_are_validated_and_mutations_remain_same_origin(client):
    assert client.get('/api/session', headers={'x-heat-tab-id': 'x' * 129}).status_code == 400
    assert client.post('/api/session', headers=HUDA, json={'persona_id': 'not-a-person'}).status_code == 422
    assert client.post('/api/session', headers={**HUDA, 'origin': 'https://other.test'}, json={'persona_id': 'C01'}).status_code == 403
    assert client.get('/api/session', headers=HUDA).json()['person'] is None


def test_public_mutations_require_case_binding_and_clock_stays_in_the_case_window(client):
    client.post('/api/session', headers=HUDA, json={'persona_id': 'C01'})
    assert client.post('/api/case/commands', headers=HUDA,
                       json={'command_id': 'old-command', 'expected_version': 0, 'action': 'recover', 'payload': {}}).status_code == 422
    assert client.post('/api/case/retry', headers=HUDA, json={'expected_version': 0}).status_code == 422
    client.post('/api/access', json={'code': 'presenter-code'})
    assert client.post('/api/demo/signals', headers=HUDA, json={'kind': 'reading', 'payload': {}}).status_code == 422
    response = client.post('/api/demo/clock', headers=HUDA, json={'at': '2025-08-04T11:30:00+04:00'})
    assert response.status_code == 422 and 'case window' in response.json()['detail']
