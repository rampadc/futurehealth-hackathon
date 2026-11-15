import hashlib
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from heat_safe.application import access, storage


@pytest.fixture(params=['sqlite', 'postgres'])
def hosted(monkeypatch, tmp_path, request):
    import os
    if request.param == 'postgres':
        if not os.getenv('POSTGRES_TEST_URL'):
            pytest.skip('No disposable PostgreSQL test URL')
        monkeypatch.setenv('DATABASE_URL', os.environ['POSTGRES_TEST_URL'])
    else:
        monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('HEAT_REQUIRE_ACCESS', 'true')
    monkeypatch.setenv('HEAT_CASE_DB', str(tmp_path / 'case.sqlite3'))
    monkeypatch.setenv('HEAT_ACCESS_CODE_SHA256', hashlib.sha256(b'judge-code').hexdigest())
    monkeypatch.setenv('HEAT_PRESENTER_CODE_SHA256', hashlib.sha256(b'presenter-code').hexdigest())
    storage.initialize()
    access.initialize()
    with storage.connection() as db:
        for table in ('access_personas', 'access_sessions', 'access_attempts'):
            db.execute(f'DELETE FROM {table}')
    app = FastAPI()
    app.middleware('http')(access.protect)
    app.include_router(access.router)

    @app.get('/api/case')
    def case():
        return {'private': True}

    @app.get('/api/demo/state')
    def presenter():
        return {'presenter': True}

    return TestClient(app, base_url='https://site.test', headers={'origin':'https://site.test'})


def test_anonymous_viewer_and_presenter_are_separate(hosted):
    assert hosted.get('/api/access').json()['role'] is None
    assert hosted.get('/api/case').status_code == 401
    response = hosted.post('/api/access', json={'code':'judge-code'})
    assert response.json()['role'] == 'viewer'
    assert 'Secure' in response.headers['set-cookie'] and 'HttpOnly' in response.headers['set-cookie']
    assert hosted.get('/api/case').status_code == 200
    assert hosted.get('/api/demo/state').status_code == 403
    assert hosted.post('/api/access', json={'code':'presenter-code'}).json()['role'] == 'presenter'
    assert hosted.get('/api/demo/state').status_code == 200
    assert hosted.delete('/api/access').status_code == 200
    assert hosted.get('/api/case').status_code == 401


def test_failed_codes_are_throttled_without_storing_plaintext(hosted):
    for _ in range(10):
        assert hosted.post('/api/access', json={'code':'wrong'}).status_code == 401
    assert hosted.post('/api/access', json={'code':'wrong'}).status_code == 429
    with storage.connection() as db:
        assert db.execute('SELECT COUNT(*) FROM access_sessions').fetchone()[0] == 0
        assert db.execute('SELECT COUNT(*) FROM access_attempts').fetchone()[0] == 2


def test_mutations_require_same_origin_and_sessions_expire(hosted):
    assert hosted.post('/api/access', json={'code':'judge-code'}, headers={'origin':'https://other.test'}).status_code == 403
    assert hosted.post('/api/access', json={'code':'judge-code'}).status_code == 200
    with storage.connection() as db:
        db.execute('UPDATE access_sessions SET expires_at=?', (time.time()-1,))
    assert hosted.get('/api/case').status_code == 401


def test_persona_cookie_cannot_move_between_access_sessions(hosted):
    hosted.post('/api/access', json={'code':'judge-code'})
    hosted.cookies.set('heat_persona', 'unbound-persona')
    assert hosted.get('/api/case').status_code == 401


def test_cloud_access_fails_closed_with_missing_or_equal_codes(monkeypatch):
    monkeypatch.setenv('HEAT_REQUIRE_ACCESS', 'true')
    monkeypatch.delenv('HEAT_ACCESS_CODE_SHA256', raising=False)
    with pytest.raises(RuntimeError):
        access.initialize()
    monkeypatch.setenv('HEAT_ACCESS_CODE_SHA256', 'a'*64)
    monkeypatch.setenv('HEAT_PRESENTER_CODE_SHA256', 'a'*64)
    with pytest.raises(RuntimeError):
        access.initialize()


def test_code_rotation_revokes_existing_sessions(hosted, monkeypatch):
    assert hosted.post('/api/access', json={'code':'judge-code'}).status_code == 200
    monkeypatch.setenv('HEAT_ACCESS_CODE_SHA256', hashlib.sha256(b'rotated-code').hexdigest())
    access.initialize()
    assert hosted.get('/api/case').status_code == 401
    assert hosted.post('/api/access', json={'code':'judge-code'}).status_code == 401
    assert hosted.post('/api/access', json={'code':'rotated-code'}).status_code == 200


def test_cloud_run_cannot_disable_the_code_gate(monkeypatch):
    monkeypatch.setenv('K_SERVICE', 'cloud-service')
    monkeypatch.setenv('HEAT_REQUIRE_ACCESS', 'false')
    assert access.required()
