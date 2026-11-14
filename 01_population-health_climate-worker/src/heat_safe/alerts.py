"""Alert texts: what the worker and the supervisor receive when the fast loop decides something. No LLM.

The texts are fixed data (alert_templates.yaml); code only fills in values it computed. Each translation
has a review status, and the status decides how it is sent:
- reviewed (a native speaker checked it): sent alone;
- back_translated (machine-checked only): always sent together with the English text;
- draft (not checked): demo mode marks it "[draft translation]"; production mode refuses it and sends English.
So no unreviewed safety instruction reaches a worker as if a native speaker had checked it.

    for a in alerts_for(replay_fast_loop(...), crew="Steel fixers"):
        print(a.recipient, a.language, a.text)

Nothing is sent: the returned records ARE the alert log (SMS, push and voice are on the roadmap).
Set HEAT_SAFE_ALERT_MODE=production to see the production behaviour.
"""
from __future__ import annotations

import os
import string
from dataclasses import asdict, dataclass
from functools import cache
from pathlib import Path

import pandas as pd
import yaml

TEMPLATES = Path(__file__).with_name("alert_templates.yaml")
ACTIONS = ("tighten", "rest_now", "sensor_fault", "withdraw", "emergency")
WORKER_LANGUAGES = ("en", "zh", "hi", "ur", "ml", "bn")
PLACEHOLDERS = {"minutes", "time", "crew", "zone"}
DRAFT_MARKER = "[draft translation]"
BACK_TRANSLATED_MARKER = "[machine-checked translation, English included]"
STATUSES = ("source", "reviewed", "back_translated", "draft")
MODES = ("demo", "production")


@dataclass(frozen=True)
class Alert:
    action: str
    recipient: str        # "worker" or "supervisor"
    language: str         # the language actually sent (English after a production fallback)
    text: str
    template_status: str  # source | reviewed | back_translated | draft
    marker: str           # DRAFT_MARKER / BACK_TRANSLATED_MARKER when such a text is sent, else ""
    fallback: str         # why the requested language was not sent, else ""
    time: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _fields(text: str) -> set[str]:
    return {f for _, f, _, _ in string.Formatter().parse(text) if f}


@cache
def load_templates() -> dict:
    """Read and check the templates once. A broken file fails here, at start-up, not mid-shift."""
    t = yaml.safe_load(TEMPLATES.read_text(encoding="utf-8"))
    langs, actions = t["languages"], t["actions"]
    if set(langs) != set(WORKER_LANGUAGES) or set(actions) != set(ACTIONS):
        raise ValueError(f"templates must cover languages {WORKER_LANGUAGES} and actions {ACTIONS}")
    for code, meta in langs.items():
        if meta["status"] not in STATUSES:
            raise ValueError(f"{code}: unknown status {meta['status']!r}")
        if meta["status"] == "reviewed" and not (meta.get("reviewed_by") and meta.get("reviewed_on")):
            raise ValueError(f"{code}: 'reviewed' needs reviewed_by and reviewed_on")
        if meta["status"] == "back_translated" and not (meta.get("checked_by") and meta.get("checked_on")):
            raise ValueError(f"{code}: 'back_translated' needs checked_by and checked_on")
    for action, a in actions.items():
        english = _fields(a["worker"]["en"])
        for code in WORKER_LANGUAGES:
            text = a["worker"].get(code, "")
            if not text.strip():
                raise ValueError(f"{action}: no worker text in {code}")
            if _fields(text) != english:  # every translation fills the same values as the original
                raise ValueError(f"{action}/{code}: placeholders {_fields(text)} differ from English {english}")
        if not _fields(a["supervisor"]) <= PLACEHOLDERS or not english <= PLACEHOLDERS:
            raise ValueError(f"{action}: unknown placeholder")
    return t


def mode() -> str:
    m = os.getenv("HEAT_SAFE_ALERT_MODE", "demo")
    if m not in MODES:
        raise ValueError(f"HEAT_SAFE_ALERT_MODE must be one of {MODES}, got {m!r}")
    return m


def render(action: str, language: str = "en", recipient: str = "worker", *, minutes: int | None = None,
           time: str = "", crew: str = "", zone: str = "", alert_mode: str | None = None) -> Alert:
    """The text for one recipient. Raises on an unknown action, language or a missing value: an alert must
    never go out blank or half-filled."""
    t = load_templates()
    if action not in t["actions"]:
        raise ValueError(f"unknown alert action {action!r}")
    alert_mode = alert_mode or mode()
    values = {"minutes": "" if minutes is None else str(int(minutes)), "time": time, "crew": crew,
              "zone": zone.capitalize()}

    if recipient == "supervisor":  # crew-level and English: built from action, time, crew and zone only
        text, lang, status, fallback = t["actions"][action]["supervisor"], "en", "source", ""
    elif recipient == "worker":
        if language not in t["languages"]:
            raise ValueError(f"unknown language {language!r}; known: {WORKER_LANGUAGES}")
        lang, status, fallback = language, t["languages"][language]["status"], ""
        if status == "draft" and alert_mode == "production":
            fallback = f"{t['languages'][language]['name']} text is not yet reviewed by a native speaker: sent in English"
            lang, status = "en", "source"
        text = t["actions"][action]["worker"][lang]
        if status == "back_translated":  # not native-reviewed: the original travels with it
            text = f"{text}\n{t['actions'][action]['worker']['en']}"
    else:
        raise ValueError(f"recipient must be 'worker' or 'supervisor', got {recipient!r}")

    missing = [f for f in _fields(text) if not values[f]]
    if missing:
        raise ValueError(f"{action} alert needs {missing}")
    marker = {"draft": DRAFT_MARKER, "back_translated": BACK_TRANSLATED_MARKER}.get(status, "")
    return Alert(action, recipient, lang, text.format(**values), status, marker, fallback, time)


def alerts_for(log: pd.DataFrame, crew: str, languages=WORKER_LANGUAGES, alert_mode: str | None = None) -> list[Alert]:
    """The alert log for a fast-loop run (sensor.replay_fast_loop): for every alert, one supervisor message
    and one worker message per language."""
    out = []
    for r in log[log["alert"]].itertuples():
        kw = dict(minutes=int(r.work_minutes_left), time=f"{r.time:%H:%M}", crew=crew, zone=r.zone,
                  alert_mode=alert_mode)
        out.append(render(r.action, recipient="supervisor", **kw))
        out += [render(r.action, code, **kw) for code in languages]
    return out
