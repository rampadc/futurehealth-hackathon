"""Run one question through the supervisor agent and collect everything an eval needs.

Shared by tools/ask_supervisor.py (humans) and evals/run_evals.py (machines), so both exercise the
exact same code path. If evals used a different harness from the demo, a passing eval would prove
less about the demo.
"""
from __future__ import annotations

import time
import uuid

from google.adk.runners import InMemoryRunner
from google.genai import types

from .agent import MODEL, app


async def ask(question: str, user_id: str = "supervisor-demo") -> dict:
    """Answer, tool calls (name + args, in order), tool outputs, grounding results, tokens, latency."""
    runner = InMemoryRunner(app=app)
    session = await runner.session_service.create_session(
        app_name=app.name, user_id=user_id, session_id=f"s-{uuid.uuid4().hex[:12]}")
    calls, answer = [], ""
    tokens = {"prompt": 0, "output": 0, "thinking": 0}
    started = time.perf_counter()
    async for event in runner.run_async(user_id=user_id, session_id=session.id,
                                        new_message=types.Content(role="user", parts=[types.Part(text=question)])):
        for fc in event.get_function_calls():
            calls.append({"name": fc.name, "args": dict(fc.args or {})})
        # Every model call reports its own usage; summing them gives the cost of the whole turn
        if (u := event.usage_metadata) is not None:
            tokens["prompt"] += u.prompt_token_count or 0
            tokens["output"] += u.candidates_token_count or 0
            tokens["thinking"] += u.thoughts_token_count or 0
        if event.is_final_response() and event.content and event.content.parts:
            answer = "".join(p.text or "" for p in event.content.parts if not p.thought)
    latency_s = time.perf_counter() - started
    session = await runner.session_service.get_session(app_name=app.name, user_id=user_id, session_id=session.id)
    await runner.close()
    return {
        "session_id": session.id,
        "model": MODEL,
        "answer": answer,
        "tool_calls": calls,
        "tool_outputs": session.state.get("tool_outputs", []),
        "grounding": session.state.get("grounding") or {"passed": True, "ungrounded": [], "checked": 0},
        "citations": session.state.get("citations") or {"passed": True, "ungrounded": [], "checked": 0},
        "tokens": tokens,
        "latency_s": round(latency_s, 2),
    }
