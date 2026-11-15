"""Run one question through the supervisor agent and collect everything an eval needs.

Shared by tools/ask_supervisor.py (humans), evals/run_evals.py (machines) and the API's /agent/chat
(server.py), so all three exercise the exact same code path. If evals used a different harness from the
demo, a passing eval would prove less about the demo.

    turn(runner, question)  streams one turn as small events (the API sends them to the browser)
    ask(question)           runs turn() on a fresh runner and returns the final summary (CLI, evals)
"""
from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator

from google.adk.runners import InMemoryRunner
from google.genai import types

from .agent import MODEL, app

ASK_KEYS = ("session_id", "model", "answer", "tool_calls", "tool_outputs", "grounding", "citations", "tokens",
            "latency_s")
PASSED = {"passed": True, "ungrounded": [], "checked": 0}


class UnknownSession(KeyError):
    """The session id does not exist (e.g. the server restarted: sessions live in memory)."""


async def turn(runner: InMemoryRunner, question: str, user_id: str = "supervisor-demo",
               session_id: str | None = None) -> AsyncIterator[dict]:
    """One turn of the conversation, as events:

        {"type": "session", "session_id"}          first, so a client can continue the conversation
        {"type": "tool_call", "name", "args"}       the agent asked for a tool
        {"type": "tool_result", "name", "status"}   the tool answered ("ok", "error", "no_sensor", ...)
        {"type": "done", "answer", "tool_calls", "tool_outputs", "grounding", "citations", "links",
         "tokens", "latency_s", "session_id", "model"}

    The answer arrives whole, in `done`, after the grounding check (agent.check_grounding) has run on it.
    Streaming the text token by token would show the user words before they were checked.
    """
    service = runner.session_service
    if session_id:
        session = await service.get_session(app_name=app.name, user_id=user_id, session_id=session_id)
        if session is None:
            raise UnknownSession(session_id)
    else:
        session = await service.create_session(app_name=app.name, user_id=user_id,
                                               session_id=f"s-{uuid.uuid4().hex[:12]}")
    yield {"type": "session", "session_id": session.id}

    calls, answer = [], ""
    tokens = {"prompt": 0, "output": 0, "thinking": 0}
    started = time.perf_counter()
    async for event in runner.run_async(user_id=user_id, session_id=session.id,
                                        new_message=types.Content(role="user", parts=[types.Part(text=question)])):
        for fc in event.get_function_calls():
            calls.append({"name": fc.name, "args": dict(fc.args or {})})
            yield {"type": "tool_call", **calls[-1]}
        for fr in event.get_function_responses():
            status = (fr.response or {}).get("status", "ok") if isinstance(fr.response, dict) else "ok"
            yield {"type": "tool_result", "name": fr.name, "status": status}
        # Every model call reports its own usage; summing them gives the cost of the whole turn
        if (u := event.usage_metadata) is not None:
            tokens["prompt"] += u.prompt_token_count or 0
            tokens["output"] += u.candidates_token_count or 0
            tokens["thinking"] += u.thoughts_token_count or 0
        if event.is_final_response() and event.content and event.content.parts:
            answer = "".join(p.text or "" for p in event.content.parts if not p.thought)
    latency_s = time.perf_counter() - started
    session = await service.get_session(app_name=app.name, user_id=user_id, session_id=session.id)
    yield {
        "type": "done",
        "session_id": session.id,
        "model": MODEL,
        "answer": answer,
        "tool_calls": calls,
        "tool_outputs": session.state.get("tool_outputs", []),
        "grounding": session.state.get("grounding") or PASSED,
        "citations": session.state.get("citations") or PASSED,
        "links": session.state.get("links") or PASSED,
        "tokens": tokens,
        "latency_s": round(latency_s, 2),
    }


async def ask(question: str, user_id: str = "supervisor-demo") -> dict:
    """Answer, tool calls (name + args, in order), tool outputs, grounding results, tokens, latency."""
    runner = InMemoryRunner(app=app)
    try:
        async for event in turn(runner, question, user_id):
            if event["type"] == "done":
                return {k: event[k] for k in ASK_KEYS}
    finally:
        await runner.close()
    raise RuntimeError("the agent turn ended without a result")
