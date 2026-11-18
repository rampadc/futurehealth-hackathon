"""Local FastAPI case and demonstration controls."""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .service import CaseError, CaseService, PEOPLE
from . import access, crew_risk, demo_site, people_api, platform_api, storage


def check_hosted_config() -> None:
    if os.getenv('K_SERVICE') and (not storage.database_url() or not os.getenv('STATIC_DIR')):
        raise RuntimeError('Cloud Run requires PostgreSQL configuration and the bundled frontend')


check_hosted_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    access.initialize()
    access.initialize_tabs(app.state.service)
    await app.state.service.replay_unfinished()
    await app.state.service.catch_up()
    async def monitor_time():
        while True:
            await asyncio.sleep(1)
            try:
                await app.state.service.catch_up()
                await demo_site.sync(app.state.service)
            except Exception:
                # Reads and commands also catch up; a transient DB/solver failure must not stop the monitor.
                import logging
                logging.getLogger(__name__).exception('Case time update failed')
    monitor = asyncio.create_task(monitor_time())
    try:
        yield
    finally:
        monitor.cancel()
        try:
            await monitor
        except asyncio.CancelledError:
            pass

app = FastAPI(title='Heat Safe case', lifespan=lifespan,
              docs_url=None if access.required() else '/docs',
              redoc_url=None if access.required() else '/redoc',
              openapi_url=None if access.required() else '/openapi.json')
app.state.service = CaseService()
app.middleware('http')(access.protect)
app.include_router(access.router)
app.include_router(platform_api.router)
app.include_router(people_api.router)
app.include_router(crew_risk.router)
app.include_router(demo_site.router)


@app.exception_handler(CaseError)
async def case_error(_request: Request, error: CaseError):
    return JSONResponse(status_code=error.status, content={'detail':error.detail})


class SessionInput(BaseModel):
    persona_id: str


class CommandInput(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
    command_id: str
    expected_version: int
    action: str
    payload: dict = Field(default_factory=dict)


class RetryInput(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
    expected_version: int


class StartInput(BaseModel):
    scenario: str


class ClockInput(BaseModel):
    at: str


class SignalInput(BaseModel):
    case_id: str = Field(min_length=1, max_length=128)
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
    actor=request.app.state.service.actor_from_request(request)
    return {'person':PEOPLE.get(actor)}


@app.post('/api/session')
async def choose_session(body: SessionInput, request: Request):
    if body.persona_id not in PEOPLE:
        raise CaseError(422, 'Unknown persona')
    access.select_persona(request, request.app.state.service, body.persona_id)
    return {'person': PEOPLE[body.persona_id]}


@app.delete('/api/session')
async def leave_session(request: Request):
    access.clear_persona(request, request.app.state.service)
    return {'person': None}


@app.get('/api/case')
async def get_case(request: Request):
    service = request.app.state.service
    await service.catch_up()
    actor=service.actor_from_request(request)
    if actor is None: raise CaseError(401,'Choose a local persona')
    return service.read_case(actor)


@app.get('/api/case/heat-rest')
async def heat_rest(request: Request):
    service = request.app.state.service
    await service.catch_up()
    actor = service.actor_from_request(request)
    if actor is None:
        raise CaseError(401, 'Choose your account')
    return service.heat_rest(actor)


@app.post('/api/case/commands')
async def command(request: Request, body: CommandInput):
    service = request.app.state.service
    return await service.command(service.actor_from_request(request),body.model_dump())


@app.post('/api/case/retry')
async def retry(request: Request, body: RetryInput):
    service = request.app.state.service
    return await service.retry(service.actor_from_request(request),body.expected_version,case_id=body.case_id)


@app.post('/api/demo/start')
async def start(body: StartInput):
    if body.scenario!='heat_response': raise CaseError(422,'Unknown scenario')
    return await app.state.service.start()


@app.post('/api/demo/clock')
async def clock(body: ClockInput, request: Request):
    """Presenter: move case time to a minute in the case window. Earlier times start the day again."""
    return await demo_site.jump(request.app.state.service, body.at)


@app.post('/api/demo/signals')
async def signal(body: SignalInput):
    return await app.state.service.signal(body.kind,body.payload,case_id=body.case_id)


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
