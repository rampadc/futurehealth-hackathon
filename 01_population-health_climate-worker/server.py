"""Heat-Safe API server: ADK's own app + our deterministic endpoints + a streaming chat with the agent.

    uv run --env-file ../.env uvicorn server:app --reload        # then open http://localhost:8000/docs

One FastAPI app, three layers:
    get_fast_api_app(...)   ADK's routes: /dev-ui (the `adk web` page), /run_sse, /apps/supervisor/... sessions
    heat_safe.api.router    conditions, plans, sensor, the monitor replay stream (no LLM)
    /agent/chat             the supervisor agent through agents/supervisor/session.turn (the evals' code path)

Chat sessions live in memory (InMemoryRunner): a restart forgets them, and a second instance would not know
them, so Cloud Run runs one instance (infra/main.tf). ADK's /run_sse and our /agent/chat keep separate
sessions: a conversation started in one is not visible in the other.
"""
from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel, Field

from heat_safe.api import SSE_HEADERS, router, sse

AGENTS_DIR = Path(__file__).resolve().parent / "agents"
sys.path.insert(0, str(AGENTS_DIR))  # import the agent as `supervisor`, the name ADK's loader uses too
from supervisor.agent import app as supervisor_app  # noqa: E402
from supervisor.session import UnknownSession, turn  # noqa: E402

# Browsers block calls from another origin unless the server allows it (CORS). Local Vite dev servers
# are allowed; add a deployed frontend with HEAT_SAFE_ALLOWED_ORIGINS="https://a.example,https://b.example".
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] + [
    o.strip() for o in os.getenv("HEAT_SAFE_ALLOWED_ORIGINS", "").split(",") if o.strip()]

RUNNER = InMemoryRunner(app=supervisor_app)


@asynccontextmanager
async def lifespan(_app):
    yield
    await RUNNER.close()


app = get_fast_api_app(agents_dir=str(AGENTS_DIR), web=True, allow_origins=ALLOWED_ORIGINS, lifespan=lifespan)
app.title = "Heat-Safe Crew API"
app.include_router(router)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = Field(None, description="From an earlier `session` event; empty starts a new chat")
    user_id: str = Field("ui", max_length=64)

    model_config = {"json_schema_extra": {"examples": [
        {"message": "Plan steel fixers at Mussafah on 2025-08-01: 5 hours of work, shade available."}]}}


@app.post("/agent/chat", tags=["agent"])
async def chat(req: ChatRequest) -> StreamingResponse:
    """Ask the supervisor agent, as Server-Sent Events: `session`, then `tool_call` / `tool_result` while it
    works, then `done` with the answer, its grounding and citation checks, tool calls, tokens and latency.
    `error` if the turn fails part-way. Send the session_id back to continue the same conversation."""
    if req.session_id and await RUNNER.session_service.get_session(
            app_name=supervisor_app.name, user_id=req.user_id, session_id=req.session_id) is None:
        raise HTTPException(404, f"unknown session {req.session_id!r} (sessions are lost when the server restarts)")

    async def events():
        try:
            async for event in turn(RUNNER, req.message, req.user_id, req.session_id):
                kind = event.pop("type")
                if kind == "done":
                    event.pop("tool_outputs")  # large; the grounding results already summarise them
                yield sse(kind, event)
        except UnknownSession as e:
            yield sse("error", {"message": f"unknown session {e}"})
        except Exception as e:  # noqa: BLE001 - the stream has started, so report in-band, not as a status
            yield sse("error", {"message": f"{type(e).__name__}: {e}"})

    return StreamingResponse(events(), media_type="text/event-stream", headers=SSE_HEADERS)
