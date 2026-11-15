"""Crew profile photos: each signed-in person adds, replaces or removes their own photo.

Every surface shows a small round photo beside a person's name (ui_design_system section 26).
Photos issued with the demo accounts ship with the frontend; an uploaded photo overrides the
issued one for everybody who can see that person. Only the person themselves can change it.
The browser square-crops and shrinks the image to 256px before upload; the server checks the
type from the file's own bytes, not from what the client claims, and caps the size.
"""
from __future__ import annotations

import base64
import binascii
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .platform_api import actor, connect
from .service import PEOPLE

router = APIRouter()

MAX_BYTES = 512 * 1024  # a 256px WebP is ~15 KB; this leaves room for a PNG fallback
DATA_URL = re.compile(r'^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$')
SQLITE_TABLE = '''CREATE TABLE IF NOT EXISTS person_photo(person_id TEXT PRIMARY KEY, content_type TEXT NOT NULL,
  data TEXT NOT NULL, updated_at TEXT NOT NULL)'''
# PostgreSQL creates the same table in storage.initialize().


def _sniff(raw: bytes) -> str | None:
    """The image type from its magic bytes, or None if it is not a JPEG, PNG or WebP."""
    if raw.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
        return 'image/webp'
    return None


def _db(request: Request):
    db = connect(request)
    if not request.app.state.service._postgres:
        db.execute(SQLITE_TABLE)
    return db


class PhotoInput(BaseModel):
    # A data URL from the browser's canvas, e.g. data:image/webp;base64,....
    image: str = Field(min_length=32, max_length=MAX_BYTES * 2)


@router.get('/api/people/photos')
def list_photos(request: Request):
    """Who has uploaded a photo, and when, so clients can cache-bust by version."""
    actor(request)
    with _db(request) as db:
        rows = db.execute('SELECT person_id, updated_at FROM person_photo').fetchall()
    return {'photos': {row['person_id']: row['updated_at'] for row in rows}}


@router.get('/api/people/{person_id}/photo')
def get_photo(person_id: str, request: Request):
    actor(request)
    with _db(request) as db:
        row = db.execute('SELECT content_type, data FROM person_photo WHERE person_id=?', (person_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'No uploaded photo')
    return Response(base64.b64decode(row['data']), media_type=row['content_type'],
                    headers={'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff'})


@router.put('/api/people/me/photo')
def put_photo(body: PhotoInput, request: Request):
    person_id = actor(request)
    if person_id not in PEOPLE:
        raise HTTPException(403, 'Only a named person can have a photo')
    match = DATA_URL.match(body.image.strip())
    if not match:
        raise HTTPException(422, 'Send a JPEG, PNG or WebP photo')
    try:
        raw = base64.b64decode(re.sub(r'\s', '', match.group(2)), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, 'The photo could not be read') from None
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, 'The photo is too large. Choose a smaller one.')
    kind = _sniff(raw)
    if kind is None:
        raise HTTPException(422, 'Send a JPEG, PNG or WebP photo')
    stamp = datetime.now(timezone.utc).isoformat(timespec='milliseconds')
    with _db(request) as db:
        db.execute('DELETE FROM person_photo WHERE person_id=?', (person_id,))
        db.execute('INSERT INTO person_photo VALUES (?, ?, ?, ?)', (person_id, kind, base64.b64encode(raw).decode(), stamp))
    return {'person_id': person_id, 'updated_at': stamp}


@router.delete('/api/people/me/photo')
def delete_photo(request: Request):
    """Remove the uploaded photo; the account falls back to its issued photo or initials."""
    person_id = actor(request)
    with _db(request) as db:
        db.execute('DELETE FROM person_photo WHERE person_id=?', (person_id,))
    return {'person_id': person_id, 'updated_at': None}
