"""HTTP API (heat_safe.api): each endpoint's contract on the replay day. No LLM and no cloud calls.

The chat endpoint (server.py) needs Gemini, so it is checked by hand (README: Heat-Safe API).
"""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from heat_safe import agent_tools
from heat_safe.api import router

@pytest.fixture(scope="module")
def api():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def events(response) -> list[tuple[str, dict]]:
    """Parse a Server-Sent Events body into (event name, data) pairs."""
    out = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


REPLAY = "/monitor/replay?speed=0&start=08:00&end=10:00"


# --- plain JSON endpoints: the same numbers the agent sees ---------------------------------------------

def test_conditions_are_exactly_what_the_agent_tool_returns(api):
    r = api.get("/sites/mussafah/conditions", params={"date": "2025-08-01"})
    assert r.status_code == 200
    assert r.json() == json.loads(json.dumps(agent_tools.compute_heat_stress("mussafah", "2025-08-01")))
    assert len(r.json()["hourly"]) == 24 and r.json()["citation"][0]["url"]


def test_an_unknown_site_is_404_and_a_bad_date_is_422(api):
    assert api.get("/sites/atlantis/conditions", params={"date": "2025-08-01"}).status_code == 404
    assert api.get("/sites/mussafah/conditions", params={"date": "1 Aug"}).status_code == 422
    assert api.get("/sites/mussafah/conditions").status_code == 422  # date is required


def test_a_plan_from_the_api(api):
    body = {"site": "mussafah", "date": "2025-08-01", "role": "steel fixer", "work_hours_needed": 5,
            "shade_available": True}
    plan = api.post("/plans", json=body).json()
    assert plan["status"] == "ok" and plan["hours"] and "work_scheduled_hm" in plan
    in_break = [b for b in plan["hours"] if b["start"] in ("13:00", "14:00")]  # inside 12:30-15:00
    assert in_break and all(b["scheduled_work_minutes"] == 0 for b in in_break)


def test_a_replan_on_the_site_sensor(api):
    body = {"site": "mussafah", "date": "2025-08-01", "role": "steel fixer", "work_hours_needed": 5,
            "shade_available": True, "replan_from": "09:00", "use_site_sensor": True}
    plan = api.post("/plans", json=body).json()
    assert plan["replanned_from"] == "09:00" and plan["site_sensor"]["used"]


def test_plan_errors_are_status_codes(api):
    ok = {"site": "mussafah", "date": "2025-08-01", "role": "steel fixer", "work_hours_needed": 5}
    assert api.post("/plans", json={**ok, "work_hours_needed": -1}).status_code == 422  # rejected by the model
    assert api.post("/plans", json={**ok, "site": "atlantis"}).status_code == 404
    assert api.post("/plans", json={**ok, "use_site_sensor": True}).status_code == 400  # needs replan_from


def test_sensor_endpoint(api):
    r = api.get("/sites/mussafah/sensor", params={"date": "2025-08-01", "until": "09:30", "role": "steel fixer",
                                                  "shade_available": True, "work_hours_needed": 5})
    assert r.status_code == 200 and r.json()["fast_loop_alerts"]
    none = api.get("/sites/al_ain/sensor", params={"date": "2025-08-01", "until": "09:30"}).json()
    assert none["status"] == "no_sensor"  # a site without a sensor says so; it is not an error


# --- the monitor stream --------------------------------------------------------------------------------

def test_monitor_replay_streams_plan_readings_alerts_replan_done(api):
    r = api.get(REPLAY)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    ev = events(r)
    names = [n for n, _ in ev]
    assert names[0] == "plan" and names[-1] == "done" and "replan" in names
    readings = [d for n, d in ev if n == "reading"]
    assert len(readings) == 24 and readings[0]["time"] == "08:00"  # 2 hours of 5-minute readings
    alerts = {d["time"]: d for n, d in ev if n == "alert"}
    assert alerts["08:30"]["action"] == "rest_now" and alerts["09:40"]["action"] == "sensor_fault"
    assert alerts["08:30"]["supervisor"].startswith("Steel fixer crew:")
    assert len(alerts["08:30"]["workers"]) == 6  # every worker language
    assert ev[-1][1]["alerts"] == sum(1 for d in readings if d["alert"])


def test_the_replan_arrives_before_the_first_reading_it_governs(api):
    ev = events(api.get(REPLAY))
    i = next(i for i, (n, _) in enumerate(ev) if n == "replan")
    assert ev[i][1]["plan"]["replanned_from"] == "09:00" and ev[i + 1][1]["time"] == "09:00"


def test_no_stream_without_a_sensor_and_bad_input_fails_before_streaming(api):
    assert api.get("/monitor/replay", params={"site": "al_ain", "speed": 0}).status_code == 404
    assert api.get("/monitor/replay", params={"replan_at": "9 o'clock", "speed": 0}).status_code == 400
    assert api.get("/monitor/replay", params={"alert_mode": "live", "speed": 0}).status_code == 422
