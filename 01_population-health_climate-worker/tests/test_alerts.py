"""Alert texts (alerts.py, alert_templates.yaml): complete, honest about review status, and safe to send."""
import re
from itertools import product

import pytest
import yaml

from heat_safe import alerts
from heat_safe.alerts import (ACTIONS, BACK_TRANSLATED_MARKER, DRAFT_MARKER, WORKER_LANGUAGES, alerts_for,
                              load_templates, render)

VALUES = dict(minutes=20, time="09:00", crew="Steel fixer crew", zone="high")


@pytest.mark.parametrize("action,language", list(product(ACTIONS, WORKER_LANGUAGES)))
def test_every_action_renders_in_every_language(action, language):
    a = render(action, language, alert_mode="demo", **VALUES)
    assert a.text.strip() and "{" not in a.text and "}" not in a.text
    if "{minutes}" in load_templates()["actions"][action]["worker"]["en"]:
        assert "20" in a.text  # ASCII digits, also inside right-to-left Urdu


@pytest.mark.parametrize("action", ACTIONS)
def test_supervisor_messages_are_crew_level_without_health_details(action):
    text = render(action, recipient="supervisor", **VALUES).text
    assert text.startswith("Steel fixer crew:")
    health = r"(?i)\b(dizz|vomit|sweat|faint|confus|nause|headache|heart rate|core temp|symptom|sick|ill\b|unwell)"
    assert not re.search(health, text), text


def _templates_with(monkeypatch, tmp_path, edit):
    """Load a modified copy of the templates (edit: a function on the parsed YAML)."""
    data = yaml.safe_load(alerts.TEMPLATES.read_text(encoding="utf-8"))
    edit(data)
    path = tmp_path / "t.yaml"
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    monkeypatch.setattr(alerts, "TEMPLATES", path)
    load_templates.cache_clear()


@pytest.fixture(autouse=True)
def _fresh_templates():
    load_templates.cache_clear()
    yield
    load_templates.cache_clear()


def test_the_recorded_review_status():
    """What the file claims (14 Nov): Mandarin native-reviewed; four South Asian languages machine-checked."""
    langs = load_templates()["languages"]
    assert langs["zh"]["status"] == "reviewed" and langs["zh"]["reviewed_by"]
    assert {c for c in WORKER_LANGUAGES if langs[c]["status"] == "back_translated"} == {"hi", "ur", "ml", "bn"}


@pytest.mark.parametrize("alert_mode", ["demo", "production"])
def test_a_reviewed_translation_is_sent_alone(alert_mode):
    a = render("rest_now", "zh", alert_mode=alert_mode)
    assert (a.language, a.marker, a.fallback) == ("zh", "", "") and "Stop work" not in a.text


@pytest.mark.parametrize("alert_mode,code", list(product(["demo", "production"], ["hi", "ur", "ml", "bn"])))
def test_a_back_translated_text_always_travels_with_the_english(alert_mode, code):
    a = render("rest_now", code, alert_mode=alert_mode)
    english = render("rest_now", "en").text
    assert a.language == code and a.text.endswith(english) and a.text != english
    assert a.marker == BACK_TRANSLATED_MARKER and not a.fallback


def test_a_draft_is_marked_in_demo_and_refused_in_production(monkeypatch, tmp_path):
    def make_hindi_draft(d):
        d["languages"]["hi"]["status"] = "draft"
    _templates_with(monkeypatch, tmp_path, make_hindi_draft)
    demo, prod = render("rest_now", "hi", alert_mode="demo"), render("rest_now", "hi", alert_mode="production")
    assert (demo.language, demo.marker) == ("hi", DRAFT_MARKER)
    assert (prod.language, prod.text) == ("en", render("rest_now", "en").text) and "not yet reviewed" in prod.fallback


def test_back_translated_needs_who_checked_it_and_when(monkeypatch, tmp_path):
    def drop_checker(d):
        d["languages"]["ur"]["checked_by"] = ""
    _templates_with(monkeypatch, tmp_path, drop_checker)
    with pytest.raises(ValueError, match="checked_by"):
        load_templates()


def test_no_translation_is_marked_reviewed_without_a_named_reviewer_and_date(monkeypatch, tmp_path):
    t = load_templates()
    for code, meta in t["languages"].items():
        if meta["status"] == "reviewed":
            assert meta["reviewed_by"] and meta["reviewed_on"], code
    bad = yaml.safe_load(alerts.TEMPLATES.read_text(encoding="utf-8"))
    bad["languages"]["hi"]["status"] = "reviewed"  # claimed, but nobody named
    path = tmp_path / "t.yaml"
    path.write_text(yaml.safe_dump(bad, allow_unicode=True), encoding="utf-8")
    monkeypatch.setattr(alerts, "TEMPLATES", path)
    load_templates.cache_clear()
    try:
        with pytest.raises(ValueError, match="reviewed_by"):
            load_templates()
    finally:
        load_templates.cache_clear()


def test_a_translation_must_fill_the_same_values_as_the_english(monkeypatch, tmp_path):
    bad = yaml.safe_load(alerts.TEMPLATES.read_text(encoding="utf-8"))
    bad["actions"]["tighten"]["worker"]["bn"] = "মাত্র কাজ করুন।"  # the minutes were lost in translation
    path = tmp_path / "t.yaml"
    path.write_text(yaml.safe_dump(bad, allow_unicode=True), encoding="utf-8")
    monkeypatch.setattr(alerts, "TEMPLATES", path)
    load_templates.cache_clear()
    try:
        with pytest.raises(ValueError, match="placeholders"):
            load_templates()
    finally:
        load_templates.cache_clear()


@pytest.mark.parametrize("call", [
    lambda: render("evacuate"),                              # unknown action
    lambda: render("rest_now", "fr"),                        # unknown language
    lambda: render("tighten", "en"),                         # minutes missing: never send a half-filled alert
    lambda: render("rest_now", recipient="foreman"),
])
def test_bad_requests_raise_instead_of_sending_blank_text(call):
    with pytest.raises(ValueError):
        call()


def test_mode_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("HEAT_SAFE_ALERT_MODE", "production")
    assert render("rest_now", "hi").template_status == "back_translated"
    monkeypatch.setenv("HEAT_SAFE_ALERT_MODE", "live")
    with pytest.raises(ValueError):
        render("rest_now", "hi")


def test_replay_day_alert_log():
    from datetime import date

    from heat_safe.forecast import get_replay
    from heat_safe.heat_stress import compute_heat_stress
    from heat_safe.job_profile import lookup_job_profile
    from heat_safe.schedule import optimise_schedule
    from heat_safe.sensor import measured_twl, replay_fast_loop, synthetic_feed

    w = get_replay(date(2025, 8, 1), sites=["mussafah"])
    plan = optimise_schedule(compute_heat_stress(w), lookup_job_profile("steel fixer"), 5, shade=True)
    log = replay_fast_loop(measured_twl(synthetic_feed(w)), plan, start="08:00", end="10:00")
    sent = alerts_for(log, crew="Steel fixer crew", alert_mode="demo")
    per_alert = 1 + len(WORKER_LANGUAGES)
    assert len(sent) == per_alert * int(log["alert"].sum())
    sup = [(a.time, a.action) for a in sent if a.recipient == "supervisor"]
    assert ("08:30", "rest_now") in sup and ("09:40", "sensor_fault") in sup
    assert {a.language for a in sent if a.recipient == "worker" and a.time == "08:30"} == set(WORKER_LANGUAGES)
