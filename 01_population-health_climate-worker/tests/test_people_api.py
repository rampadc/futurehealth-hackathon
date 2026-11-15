"""Crew profile photos: own photo only, checked bytes, size cap (application/people_api.py)."""
import base64

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from heat_safe.application import people_api
from heat_safe.application import service as module

# Smallest valid headers for each accepted type, plus padding.
WEBP = b'RIFF\x24\x00\x00\x00WEBPVP8 ' + b'\x00' * 32
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
JPEG = b'\xff\xd8\xff\xe0' + b'\x00' * 32


def data_url(raw: bytes, kind: str = 'image/webp') -> str:
    return f'data:{kind};base64,{base64.b64encode(raw).decode()}'


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('HEAT_SAFE_LOCAL_DIR', str(tmp_path))
    api = FastAPI()
    api.state.service = module.CaseService(tmp_path / 'case.sqlite3')
    api.include_router(people_api.router)
    return api


def client(app, persona):
    token, _ = app.state.service.create_session(persona)
    http = TestClient(app)
    http.cookies.set('heat_persona', token)
    return http


def test_a_person_uploads_replaces_and_removes_their_own_photo(app):
    rana = client(app, 'C05')
    assert rana.get('/api/people/photos').json() == {'photos': {}}
    assert rana.get('/api/people/C05/photo').status_code == 404

    first = rana.put('/api/people/me/photo', json={'image': data_url(WEBP)}).json()
    assert first['person_id'] == 'C05'
    photo = rana.get('/api/people/C05/photo')
    assert photo.status_code == 200 and photo.headers['content-type'] == 'image/webp' and photo.content == WEBP

    second = rana.put('/api/people/me/photo', json={'image': data_url(PNG, 'image/png')}).json()
    assert second['updated_at'] >= first['updated_at']
    assert rana.get('/api/people/C05/photo').content == PNG
    # Everyone signed in sees the new photo and its version.
    assert client(app, 'C01').get('/api/people/photos').json()['photos'] == {'C05': second['updated_at']}

    assert rana.delete('/api/people/me/photo').json()['updated_at'] is None
    assert rana.get('/api/people/C05/photo').status_code == 404


def test_upload_only_ever_changes_the_signed_in_persons_photo(app):
    client(app, 'C01').put('/api/people/me/photo', json={'image': data_url(JPEG, 'image/jpeg')})
    photos = client(app, 'P03').get('/api/people/photos').json()['photos']
    assert list(photos) == ['C01']
    # There is no route to set someone else's photo.
    assert client(app, 'P03').put('/api/people/C01/photo', json={'image': data_url(WEBP)}).status_code == 405


def test_photo_routes_need_a_signed_in_person(app):
    anonymous = TestClient(app)
    assert anonymous.get('/api/people/photos').status_code == 401
    assert anonymous.put('/api/people/me/photo', json={'image': data_url(WEBP)}).status_code == 401


@pytest.mark.parametrize('image, status', [
    (data_url(b'GIF89a' + b'\x00' * 40, 'image/webp'), 422),      # claims WebP, bytes are not
    (data_url(b'<svg onload=alert(1)>' + b' ' * 20, 'image/png'), 422),
    ('data:image/svg+xml;base64,' + base64.b64encode(b'<svg/>' * 10).decode(), 422),
    ('data:image/webp;base64,@@@not-base64@@@' + 'A' * 20, 422),
    (data_url(WEBP + b'\x00' * people_api.MAX_BYTES), 413),
])
def test_only_real_jpeg_png_or_webp_under_the_cap_is_kept(app, image, status):
    rana = client(app, 'C05')
    assert rana.put('/api/people/me/photo', json={'image': image}).status_code == status
    assert rana.get('/api/people/photos').json() == {'photos': {}}
