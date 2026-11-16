"""Shared-code perimeter for the hosted fictional case, separate from persona selection."""
from __future__ import annotations

import hashlib
import os
import re
import secrets
import time
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import storage

router = APIRouter()
COOKIE = '__Host-heat_access'
TTL = 8 * 60 * 60
TAB_HEADER = 'x-heat-tab-id'
TAB_PATTERN = re.compile(r'[A-Za-z0-9_-]{16,128}')
TAB_TABLE = 'CREATE TABLE IF NOT EXISTS persona_tabs(access_hash TEXT NOT NULL, tab_id TEXT NOT NULL, persona_id TEXT NOT NULL, PRIMARY KEY(access_hash,tab_id))'


def initialize_tabs(service) -> None:
    with service._conn() as db:
        db.execute(TAB_TABLE)


def _tab_id(request: Request) -> str | None:
    value = request.headers.get(TAB_HEADER, '')
    return value if TAB_PATTERN.fullmatch(value) else None


def _access_identity(request: Request) -> str:
    return digest(request.cookies.get(COOKIE, '')) if required() else 'local'


def actor_for_request(request: Request, service) -> str | None:
    tab = _tab_id(request)
    if tab:
        if required() and not role(request):
            return None
        initialize_tabs(service)
        with service._conn() as db:
            row = db.execute('SELECT persona_id FROM persona_tabs WHERE access_hash=? AND tab_id=?',
                             (_access_identity(request), tab)).fetchone()
        return row['persona_id'] if row else None
    # Local fixture clients predate tab sessions. Hosted requests never inherit a shared persona cookie.
    if required() or request.headers.get(TAB_HEADER):
        return None
    token = request.cookies.get('heat_persona')
    if not token:
        return None
    with service._conn() as db:
        row = db.execute('SELECT persona_id FROM sessions WHERE token=?', (token,)).fetchone()
    return row['persona_id'] if row else None


def select_persona(request: Request, service, persona_id: str) -> None:
    tab = _tab_id(request)
    if not tab:
        raise HTTPException(400, 'Reload the workspace before choosing your account.')
    if required() and not role(request):
        raise HTTPException(401, 'Access code required')
    initialize_tabs(service)
    with service._conn() as db:
        db.execute('INSERT INTO persona_tabs(access_hash,tab_id,persona_id) VALUES (?,?,?) '
                   'ON CONFLICT(access_hash,tab_id) DO UPDATE SET persona_id=excluded.persona_id',
                   (_access_identity(request), tab, persona_id))


def clear_persona(request: Request, service) -> None:
    tab = _tab_id(request)
    if not tab:
        raise HTTPException(400, 'Reload the workspace before choosing your account.')
    initialize_tabs(service)
    with service._conn() as db:
        db.execute('DELETE FROM persona_tabs WHERE access_hash=? AND tab_id=?',
                   (_access_identity(request), tab))


def required() -> bool:
    return bool(os.getenv('K_SERVICE')) or os.getenv('HEAT_REQUIRE_ACCESS', 'false').lower() == 'true'


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def fingerprint() -> str:
    return digest(os.environ['HEAT_ACCESS_CODE_SHA256'] + ':' + os.environ['HEAT_PRESENTER_CODE_SHA256'])


def initialize() -> None:
    if not required():
        return
    hashes = [os.getenv(name, '') for name in ('HEAT_ACCESS_CODE_SHA256', 'HEAT_PRESENTER_CODE_SHA256')]
    if any(not re.fullmatch('[a-f0-9]{64}', value) for value in hashes) or hashes[0] == hashes[1]:
        raise RuntimeError('Hosted access requires distinct viewer and presenter code digests')
    with storage.connection() as db:
        if storage.database_url():
            db.execute('SELECT pg_advisory_xact_lock(17104218)')
        else:
            db.execute('BEGIN IMMEDIATE')
        for sql in (
            'CREATE TABLE IF NOT EXISTS access_sessions(token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, expires_at DOUBLE PRECISION NOT NULL)',
            'CREATE TABLE IF NOT EXISTS access_attempts(bucket TEXT PRIMARY KEY, failures INTEGER NOT NULL, expires_at DOUBLE PRECISION NOT NULL)',
            'CREATE TABLE IF NOT EXISTS access_personas(persona_hash TEXT PRIMARY KEY, access_hash TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS access_config(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)',
            TAB_TABLE,
        ):
            db.execute(sql)
        current = db.execute("SELECT fingerprint FROM access_config WHERE id='codes'").fetchone()
        if not current or current['fingerprint'] != fingerprint():
            db.execute('DELETE FROM access_personas')
            db.execute('DELETE FROM persona_tabs')
            db.execute('DELETE FROM access_sessions')
            db.execute("INSERT INTO access_config(id,fingerprint) VALUES ('codes',?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint", (fingerprint(),))


def role(request: Request) -> str | None:
    if not required():
        return 'presenter'
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    with storage.connection() as db:
        row = db.execute("SELECT role FROM access_sessions WHERE token_hash=? AND expires_at>? AND EXISTS (SELECT 1 FROM access_config WHERE id='codes' AND fingerprint=?)", (digest(token), time.time(), fingerprint())).fetchone()
    return row['role'] if row else None


def same_origin(request: Request) -> bool:
    origin = request.headers.get('origin', '')
    expected = os.getenv('HEAT_PUBLIC_ORIGIN') or str(request.base_url).rstrip('/')
    try:
        actual_url, expected_url = urlsplit(origin), urlsplit(expected)
        return bool(origin and actual_url.scheme in {'http', 'https'} and
                    (actual_url.scheme, actual_url.netloc) == (expected_url.scheme, expected_url.netloc))
    except ValueError:
        return False


def bind_persona(request: Request, token: str) -> None:
    if required():
        with storage.connection() as db:
            db.execute('INSERT INTO access_personas(persona_hash,access_hash) VALUES (?,?)',
                       (digest(token), digest(request.cookies[COOKIE])))


def persona_is_bound(request: Request) -> bool:
    token = request.cookies.get('heat_persona')
    if not token:
        return True
    with storage.connection() as db:
        row = db.execute('SELECT access_hash FROM access_personas WHERE persona_hash=?', (digest(token),)).fetchone()
    return bool(row and secrets.compare_digest(row['access_hash'], digest(request.cookies.get(COOKIE, ''))))


async def protect(request: Request, call_next):
    path = request.url.path
    if not required() or not path.startswith('/api/') or path in {'/api/health', '/api/ready'}:
        return await call_next(request)
    if request.method not in {'GET', 'HEAD', 'OPTIONS'} and not same_origin(request):
        return JSONResponse({'detail': 'Same-origin request required'}, status_code=403)
    if path.rstrip('/') == '/api/access':
        return await call_next(request)
    current_role = role(request)
    if not current_role:
        return JSONResponse({'detail': 'Access code required'}, status_code=401)
    if (path == '/api/demo' or path.startswith('/api/demo/')) and current_role != 'presenter':
        return JSONResponse({'detail': 'Presenter access required'}, status_code=403)
    tab = request.headers.get(TAB_HEADER)
    if tab and not _tab_id(request):
        return JSONResponse({'detail': 'Invalid workspace tab. Reload the page.'}, status_code=400)
    if not tab and not (path == '/api/session' and request.method in {'POST', 'DELETE'}) and not persona_is_bound(request):
        return JSONResponse({'detail': 'Choose your account again'}, status_code=401)
    return await call_next(request)


class AccessInput(BaseModel):
    code: str = Field(min_length=1, max_length=512)


@router.get('/api/access')
def status(request: Request):
    return {'required': required(), 'role': role(request)}


@router.post('/api/access')
def login(body: AccessInput, request: Request):
    if not required():
        return {'required': False, 'role': 'presenter'}
    now = time.time()
    # The global bucket bounds attempts even when an attacker varies forwarded headers.
    peer = request.headers.get('x-forwarded-for', '').split(',')[-1].strip() or (request.client.host if request.client else 'unknown')
    buckets = [(digest(peer) + ':' + str(int(now // 60)), 10), ('global:' + str(int(now // 60)), 100)]
    candidate = digest(body.code)
    current_role = None
    if secrets.compare_digest(candidate, os.environ['HEAT_PRESENTER_CODE_SHA256']):
        current_role = 'presenter'
    elif secrets.compare_digest(candidate, os.environ['HEAT_ACCESS_CODE_SHA256']):
        current_role = 'viewer'
    with storage.connection() as db:
        db.execute('BEGIN IMMEDIATE')
        config = db.execute("SELECT fingerprint FROM access_config WHERE id='codes'").fetchone()
        if not config or config['fingerprint'] != fingerprint():
            raise HTTPException(503, 'Access configuration is updating. Please retry.')
        db.execute('DELETE FROM access_attempts WHERE expires_at<?', (now,))
        for bucket, limit in buckets:
            attempts = db.execute('SELECT failures FROM access_attempts WHERE bucket=?', (bucket,)).fetchone()
            if attempts and attempts['failures'] >= limit:
                raise HTTPException(429, 'Too many attempts. Please try again in a minute.')
        if not current_role:
            for bucket, _ in buckets:
                db.execute('INSERT INTO access_attempts(bucket,failures,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET failures=access_attempts.failures+1', (bucket, now + 120))
        else:
            token = secrets.token_urlsafe(32)
            db.execute('DELETE FROM access_sessions WHERE expires_at<?', (now,))
            db.execute('INSERT INTO access_sessions(token_hash,role,expires_at) VALUES (?,?,?)', (digest(token), current_role, now + TTL))
    if not current_role:
        raise HTTPException(401, 'That access code was not recognised.')
    response = JSONResponse({'required': True, 'role': current_role})
    response.set_cookie(COOKIE, token, max_age=TTL, httponly=True, secure=True, samesite='lax', path='/')
    response.delete_cookie('heat_persona')
    return response


@router.delete('/api/access')
def logout(request: Request):
    token = request.cookies.get(COOKIE)
    if required() and token:
        with storage.connection() as db:
            token_hash = digest(token)
            db.execute('DELETE FROM access_personas WHERE access_hash=?', (token_hash,))
            db.execute('DELETE FROM persona_tabs WHERE access_hash=?', (token_hash,))
            db.execute('DELETE FROM access_sessions WHERE token_hash=?', (token_hash,))
    response = JSONResponse({'required': required(), 'role': None})
    response.delete_cookie(COOKIE, secure=True, httponly=True, samesite='lax', path='/')
    response.delete_cookie('heat_persona')
    return response
