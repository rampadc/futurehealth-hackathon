"""Model Armor screening for the supervisor agent: ADK's ModelArmorPlugin, adapted in three ways.

What gets screened (templates in infra/model_armor.tf):

    the supervisor's message   heat-safe-input    injection / jailbreak, personal data, harm
    search_guidance results     heat-safe-tool     injection hidden in documents
    the final answer            heat-safe-output   personal data, harm

Links are checked by our own check_link_grounding (agent.py): Mumbai has no malicious-URL filter.

Personal data is de-identified ("+971 50 ..." becomes "[PHONE_NUMBER]") and the turn continues; any other
match blocks the turn with a fixed message. If Model Armor itself fails, the turn is blocked too (fail
closed): an unscreened answer is worse than no answer.

Location: Model Armor is not offered in me-central1, and `global` takes no templates, so they are in
asia-south1 (Mumbai), the nearest region that has it (infra/model_armor.tf, README note 9).

The three changes to the stock plugin, and why:
1. Only search_guidance output is screened. The other tools return numbers our own code computed; the
   guidance tool returns text from PDFs, the one place an indirect injection could hide.
2. A cache. ADK screens the latest user message before EVERY model call, and a planning turn makes about
   four, so the same text would be sent four times. Same template + same text = same verdict.
3. Decisions are recorded in session state, state["armor"] = {"input": "passed" | "redacted" | "blocked" |
   "error", "tool_output": ..., "output": ...}, like state["grounding"]. The BigQuery analytics plugin logs
   state changes as STATE_DELTA rows, so every guardrail decision ends up queryable next to the turn.
"""
from __future__ import annotations

import contextvars
import re
from collections import OrderedDict
from typing import Any

from google.adk.integrations.model_armor import ModelArmorConfig, ModelArmorPlugin
from google.adk.models import LlmRequest
from google.genai import types

LOCATION = "asia-south1"
SCREENED_TOOLS = frozenset({"search_guidance"})  # tools whose output is untrusted text
CACHE_SIZE = 256

INPUT_BLOCKED = ("I can only help with heat-safe shift planning and the heat-safety guidance, and I can't "
                 "follow instructions to change my safety rules. Please rephrase your question.")
OUTPUT_BLOCKED = ("I couldn't produce an answer that passed the safety screen. Please ask again, or check "
                  "the plan directly with the schedule tool.")
TOOL_BLOCKED = "This guidance result was withheld by the safety screen."

# Set when a screening call fails, so the recorded decision can say "error" rather than "blocked".
# A ContextVar is per asyncio task, so concurrent turns on one server don't see each other's flag.
_screening_failed: contextvars.ContextVar[bool] = contextvars.ContextVar("armor_screening_failed", default=False)


def config(project: str, location: str = LOCATION) -> ModelArmorConfig:
    t = f"projects/{project}/locations/{location}/templates"
    return ModelArmorConfig(
        prompt_template_name=f"{t}/heat-safe-input",
        tool_output_template_name=f"{t}/heat-safe-tool",
        response_template_name=f"{t}/heat-safe-output",
        deidentify_sensitive_data=True,
        block_on_screening_failure=True,
        input_blocked_message=INPUT_BLOCKED,
        output_blocked_message=OUTPUT_BLOCKED,
        tool_output_blocked_message=TOOL_BLOCKED,
    )


def record(context: Any, direction: str, verdict: str) -> None:
    """state["armor"][direction] = verdict, starting afresh at each new turn (invocation)."""
    current = context.state.get("armor") or {}
    if current.get("invocation") != context.invocation_id:
        current = {"invocation": context.invocation_id}
    context.state["armor"] = {**current, direction: verdict}


def _text(content) -> str:
    if not content or not content.parts:
        return ""
    return "\n".join(p.text for p in content.parts if p.text and not p.thought)


def _latest_user_content(llm_request):
    for content in reversed(llm_request.contents or []):
        if content.role == "user" and _text(content):
            return content
    return None


# --- Telemetry redaction -----------------------------------------------------------------------------
# Model Armor replaces personal data in the request sent to the model, but ADK keeps the original text in
# the session, and the BigQuery analytics plugin logs the user message from there. This formatter
# redacts the same kinds of data before any row is written. Local regexes, not a DLP call: logging must
# not add a network call or fail when DLP is slow. Same types as infra/model_armor.tf, so a log row and
# the model request say the same thing; numbers the tools return (TWL, minutes, dates, times) don't match.
PATTERNS = (
    ("EMAIL_ADDRESS", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("UAE_EMIRATES_ID", re.compile(r"\b784-?\d{4}-?\d{7}-?\d\b")),
    # International (+ or 00 prefix) or UAE mobile (05x): a bare number never counts as a phone
    ("PHONE_NUMBER", re.compile(r"(?<![\w+])(?:\+|00)\d{1,3}(?:[\s-]?\d{1,4}){2,5}\b|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b")),
    ("PASSPORT_NUMBER", re.compile(r"\b[A-Z]{1,2}\d{7,8}\b")),
)


def redact_text(text: str) -> str:
    for name, pattern in PATTERNS:
        text = pattern.sub(f"[{name}]", text)
    return text


def _redact(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {k: _redact(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    return value


def redact_for_log(content: Any, _event_type: str) -> Any:
    """content_formatter for BigQueryLoggerConfig. Returns a redacted copy; the live objects are untouched."""
    if isinstance(content, (types.Content, LlmRequest)):
        copy = content.model_copy(deep=True)
        for c in [copy] if isinstance(copy, types.Content) else copy.contents or []:
            for part in c.parts or []:
                if part.text:
                    part.text = redact_text(part.text)
        return copy
    return _redact(content)


class HeatSafeArmor(ModelArmorPlugin):
    def __init__(self, project: str, location: str = LOCATION, **kwargs):
        super().__init__(config=config(project, location), name="heat_safe_armor", **kwargs)
        self._cache: OrderedDict[tuple[str, str, str], Any] = OrderedDict()

    async def close(self) -> None:
        """Close the client AND forget it. The plugin lives in the module-level `app`, shared by every runner;
        session.ask() makes and closes a runner per question (CLI, evals). The stock close() keeps the closed
        client, so the next question's screening failed and, failing closed, was blocked (found 16 Nov: every
        eval scenario after the first). The next use now creates a fresh client on the current event loop."""
        await super().close()
        self._client = None

    # 2. cache ---------------------------------------------------------------------------------------
    async def _cached(self, kind: str, text: str, template: str, call):
        key = (kind, template, text)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        result = await call(text, template)
        self._cache[key] = result
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return result

    async def _sanitize_user_prompt(self, text, template_name):
        return await self._cached("prompt", text, template_name, super()._sanitize_user_prompt)

    async def _sanitize_model_response(self, text, template_name):
        return await self._cached("response", text, template_name, super()._sanitize_model_response)

    def _handle_screening_failure(self, blocked_message: str):
        _screening_failed.set(True)
        return super()._handle_screening_failure(blocked_message)

    # 3. record each decision --------------------------------------------------------------------------
    async def before_model_callback(self, *, callback_context, llm_request):
        content = _latest_user_content(llm_request)
        before = _text(content)
        _screening_failed.set(False)
        response = await super().before_model_callback(callback_context=callback_context, llm_request=llm_request)
        if before:
            if response is not None:
                verdict = "error" if _screening_failed.get() else "blocked"
            else:
                verdict = "redacted" if _text(content) != before else "passed"
            record(callback_context, "input", verdict)
        return response

    async def after_model_callback(self, *, callback_context, llm_response):
        if any(p.function_call for p in (llm_response.content.parts if llm_response.content else None) or []):
            return None  # an intermediate tool-calling step, not an answer
        if not _text(llm_response.content):
            return None
        _screening_failed.set(False)
        response = await super().after_model_callback(callback_context=callback_context, llm_response=llm_response)
        if response is None:
            verdict = "passed"
        elif (response.custom_metadata or {}).get("model_armor_blocked"):
            verdict = "error" if _screening_failed.get() else "blocked"
        else:
            verdict = "redacted"
        record(callback_context, "output", verdict)
        return response

    # 1. only untrusted tool output -----------------------------------------------------------------------
    async def after_tool_callback(self, *, tool, tool_args, tool_context, result):
        if tool.name not in SCREENED_TOOLS:
            return None
        replaced = await super().after_tool_callback(tool=tool, tool_args=tool_args, tool_context=tool_context,
                                                     result=result)
        record(tool_context, "tool_output", "passed" if replaced is None else "blocked")
        return replaced
