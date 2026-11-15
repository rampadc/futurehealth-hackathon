"""Local FastAPI case and demonstration controls."""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .service import CaseError, CaseService, PEOPLE
from . import access, crew_risk, platform_api, storage


def check_hosted_config() -> None:
    if os.getenv('K_SERVICE') and (not storage.database_url() or not os.getenv('STATIC_DIR')):
        raise RuntimeError('Cloud Run requires PostgreSQL configuration and the bundled frontend')


check_hosted_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    access.initialize()
    await app.state.service.replay_unfinished()
    yield

app = FastAPI(title='Heat Safe case', lifespan=lifespan,
              docs_url=None if access.required() else '/docs',
              redoc_url=None if access.required() else '/redoc',
              openapi_url=None if access.required() else '/openapi.json')
app.state.service = CaseService()
app.middleware('http')(access.protect)
app.include_router(access.router)
app.include_router(platform_api.router)
app.include_router(crew_risk.router)


@app.exception_handler(CaseError)
async def case_error(_request: Request, error: CaseError):
    return JSONResponse(status_code=error.status, content={'detail':error.detail})


class SessionInput(BaseModel):
    persona_id: str


class CommandInput(BaseModel):
    command_id: str
    expected_version: int
    action: str
    payload: dict = Field(default_factory=dict)


class RetryInput(BaseModel):
    expected_version: int


class StartInput(BaseModel):
    scenario: str


class ClockInput(BaseModel):
    at: str


class SignalInput(BaseModel):
    kind: str
    payload: dict


@app.get('/api/health')
async def health():
    return {'ok':True,'service':'heat-safe-case'}


@app.get('/api/ready')
async def ready():
    try:
        storage.ping()
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get(f'{app.state.service.solver_url}/health')
            response.raise_for_status()
    except Exception:
        return JSONResponse({'ok':False}, status_code=503)
    return {'ok':True}


@app.get('/api/personas')
async def personas():
    return list(PEOPLE.values())


@app.get('/api/session')
async def session(request: Request):
    actor=app.state.service.actor_from_request(request)
    return {'person':PEOPLE.get(actor)}


@app.post('/api/session')
async def choose_session(body: SessionInput, request: Request):
    token,person=app.state.service.create_session(body.persona_id)
    access.bind_persona(request, token)
    response=JSONResponse({'person':person})
    response.set_cookie('heat_persona',token,httponly=True,samesite='lax',secure=access.required())
    return response


@app.delete('/api/session')
async def leave_session(request: Request):
    app.state.service.delete_session(request.cookies.get('heat_persona'))
    response=JSONResponse({'person':None})
    response.delete_cookie('heat_persona')
    return response


@app.get('/api/case')
async def get_case(request: Request):
    actor=app.state.service.actor_from_request(request)
    if actor is None: raise CaseError(401,'Choose a local persona')
    return app.state.service.read_case(actor)


@app.post('/api/case/commands')
async def command(request: Request, body: CommandInput):
    return await app.state.service.command(app.state.service.actor_from_request(request),body.model_dump())


@app.post('/api/case/retry')
async def retry(request: Request, body: RetryInput):
    return await app.state.service.retry(app.state.service.actor_from_request(request),body.expected_version)


@app.get('/api/case/events')
async def events(request: Request):
    service=app.state.service
    if service.actor_from_request(request) is None:
        raise CaseError(401, 'Choose a local persona')
    q=asyncio.Queue(maxsize=20)
    service._listeners.add(q)
    async def stream():
        try:
            current=service.read_case(service.actor_from_request(request))
            yield f"data: {json.dumps({'version':current['version'] if current else None})}\n\n"
            while True:
                if await request.is_disconnected(): break
                try:
                    msg=await asyncio.wait_for(q.get(),timeout=15)
                    yield f'data: {json.dumps(msg)}\n\n'
                except TimeoutError: yield ': keepalive\n\n'
        finally: service._listeners.discard(q)
    return StreamingResponse(stream(),media_type='text/event-stream',headers={'Cache-Control':'no-cache'})


@app.post('/api/demo/start')
async def start(body: StartInput):
    if body.scenario!='heat_response': raise CaseError(422,'Unknown scenario')
    return await app.state.service.start()


@app.post('/api/demo/clock')
async def clock(body: ClockInput):
    return await app.state.service.advance_clock(body.at)


@app.post('/api/demo/signals')
async def signal(body: SignalInput):
    return await app.state.service.signal(body.kind,body.payload)


@app.get('/api/demo/runs')
async def runs():
    return app.state.service.runs()


@app.get('/api/demo/state')
async def demo_state():
    return app.state.service.read_case(None)


@app.post('/api/demo/reset')
async def reset():
    return await app.state.service.reset()


try:
    from heat_safe.live_assistant import router as assistant_router
except ImportError:
    pass
else:
    app.include_router(assistant_router)


class FrontendAssets(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        return response


def serve_frontend(directory: str, application: FastAPI = app) -> None:
    root = Path(directory).resolve()
    if not (root / 'index.html').is_file():
        raise RuntimeError('STATIC_DIR does not contain the built frontend')
    if (root / 'assets').is_dir():
        application.mount('/assets', FrontendAssets(directory=root / 'assets'), name='frontend-assets')

    @application.get('/{path:path}', include_in_schema=False)
    async def frontend(path: str):
        if path == 'api' or path.startswith('api/') or path in {'docs', 'redoc', 'openapi.json', 'guide'} or path.startswith('guide/'):
            raise HTTPException(404, 'Not found')
        candidate = (root / path).resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        if Path(path).suffix:
            raise HTTPException(404, 'Not found')
        return FileResponse(root / 'index.html', headers={'Cache-Control':'no-cache'})


if os.getenv('STATIC_DIR'):
    serve_frontend(os.environ['STATIC_DIR'])
