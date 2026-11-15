"""Heat-Safe HTTP API: the deterministic endpoints (no LLM). Mounted by server.py next to the agent chat.

Every endpoint wraps a function that already exists and already returns JSON-safe dicts:

    GET  /sites/{site}/conditions   agent_tools.compute_heat_stress
    POST /plans                     agent_tools.optimise_schedule
    GET  /sites/{site}/sensor       agent_tools.get_site_sensor
    GET  /monitor/replay  (SSE)     sensor.replay_day + alerts.alerts_for, streamed reading by reading

The agent tools are the same functions Gemini calls, so the UI and the agent see the same numbers. This
module adds no thresholds or rules: it only maps errors to HTTP status codes and shapes the stream.

It is an APIRouter, not an app, so any FastAPI app can mount it with `app.include_router(router)`.
"""
from __future__ import annotations

import asyncio
import json
import math
from datetime import date as Date

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from heat_safe import agent_tools, rules
from heat_safe.sites import SITES

# APIRouter: a group of routes that isn't an app by itself. include_router adds 
# the router's routes to it. 
# api.py: deterministic endpoints, no LLM
router = APIRouter() 


SITE_IDS = ", ".join(sorted(SITES))


def _ok(result: dict) -> dict:
    """
    A tool's {"status": "error", "message": ...} becomes an HTTP error; anything else passes through.
    A thin wrapper to convert tool function return, raise HTTP error for return error message.
    A HTTP client expectes status code, _ok converts the results, originally for LLM input.
    """
    if result.get("status") != "error":
        return result
    message = result["message"]
    raise HTTPException(status_code=404 if message.startswith("unknown site") else 400, detail=message)


def sse(event: str, data: dict) -> str:
    """One Server-Sent Event: an `event:` name line, a `data:` JSON line, then a blank line ends it."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}  # no proxy may buffer the stream


# --- Conditions, plans, sensor: plain JSON ---------------------------------------------------------------

@router.get("/sites", tags=["sites"])
def list_sites() -> dict:
    """The sites the API knows, with their coordinates."""
    return {"sites": [{"site": k, "lat": lat, "lon": lon} for k, (lat, lon) in sorted(SITES.items())]}


@router.get("/sites/{site}/conditions", tags=["sites"])
def conditions(site: str, date: Date = Query(description="Local date, YYYY-MM-DD")) -> dict:
    """Hourly heat stress for a site and day: TWL zones in sun and shade, WBGT, withdrawal flags, the
    midday break, and the day's summary. Past dates replay the ERA5 archive; up to 16 days ahead use
    the live forecast."""
    return _ok(agent_tools.compute_heat_stress(site, date.isoformat()))


class PlanRequest(BaseModel):
    """A pydantic model fo request body. The inputs of agent_tools.optimise_schedule (its docstring explains each one)."""
    site: str = Field(description=f"One of {SITE_IDS}")
    date: Date
    role: str = Field(description="Crew role, e.g. steel fixer, roofer")
    work_hours_needed: float = Field(gt=0, le=24)
    shade_available: bool = False
    shift_start_hour: int = Field(5, ge=0, le=23)
    shift_end_hour: int = Field(19, ge=1, le=24)
    new_starter_since: Date | None = None
    returned_since: Date | None = None
    days_away: int = Field(0, ge=0)
    away_for_illness: bool = False
    experienced_in_heat: bool = False
    replan_from: str = Field("", description="Mid-shift re-plan: the time now, HH:MM. Empty for a normal plan.")
    already_worked_minutes: int | None = Field(None, ge=0)
    use_site_sensor: bool = False
    # examples: prefills the request in /docs for easy test.
    model_config = {
        "json_schema_extra": {"examples": [
            {"site": "mussafah", 
             "date": "2025-08-01", 
             "role": "steel fixer", 
             "work_hours_needed": 5,
            "shade_available": True
            },
            ]
        }
    }


@router.post("/plans", tags=["plans"])
def create_plan(req: PlanRequest) -> dict:
    """Place a crew's outdoor work into the safest hours of the shift, or re-plan the rest of the day
    (replan_from, optionally on the site sensor's measured heat). A need that cannot be met safely is
    reported as a shortfall, never scheduled. Not stored yet: the response is the plan."""
    args = req.model_dump() # converts the model back to a dict
    for k in ("date", "new_starter_since", "returned_since"):
        args[k] = args[k].isoformat() if args[k] else None  # convert date objects back to "YYYY-MM-DD" strings, for optimise_schedule funtion inputs
    return _ok(agent_tools.optimise_schedule(**args))


@router.get("/sites/{site}/sensor", tags=["sites"])
def site_sensor(site: str, date: Date, until: str = Query(description="The time now, HH:MM"),
                role: str = "", shade_available: bool = False, work_hours_needed: float = 0.0) -> dict:
    """What the site sensor measured up to `until`, against the forecast; with a crew (role,
    work_hours_needed), also the monitor's alerts so far and whether it recommends re-planning.
    status "no_sensor" when the site has no sensor that day (only mussafah, 2025-08-01: synthetic)."""
    return _ok(agent_tools.get_site_sensor(site, date.isoformat(), until, role, shade_available, work_hours_needed))


# --- The risk monitor, replayed live ---------------------------------------------------------------------

def _reading(r) -> dict:
    twl = None if r.twl_wm2 is None or math.isnan(r.twl_wm2) else rules.display_twl(float(r.twl_wm2))
    return dict(time=f"{r.time:%H:%M}", twl_wm2=twl, measured_zone=r.measured_zone or None,
                planned_zone=r.planned_zone, zone_in_force=r.zone, action=r.action, alert=bool(r.alert),
                reason=r.reason, worked_last_60_min=int(r.worked_minutes), work_minutes_left=int(r.work_minutes_left))


def _plan_summary(plan: dict) -> dict:
    keys = ("replanned_from", "work_needed_hm", "work_scheduled_hm", "shortfall_hm", "rules_version")
    hours = [{k: b[k] for k in ("start", "twl_zone", "twl_wm2", "scheduled_work_minutes", "twl_basis")}
             for b in plan["hours"]]
    return {**{k: plan.get(k) for k in keys}, "hours": hours}


@router.get("/monitor/replay", tags=["monitor"])
async def monitor_replay(
    site: str = "mussafah", date: Date = Date(2025, 8, 1), role: str = "steel fixer",
    hours: float = Query(5, gt=0, le=12, description="Work hours the crew needs today"),
    replan_at: str | None = Query("09:00", description="HH:MM the supervisor re-plans on measured heat; empty for none"),
    start: str = Query("05:00", description="First reading to stream, HH:MM"),
    end: str = Query("19:00", description="Stream readings before this time, HH:MM"),
    speed: float = Query(0.5, ge=0, le=5, description="Seconds between readings (0: as fast as possible)"),
    alert_mode: str | None = Query(None, pattern="^(demo|production)$"),
) -> StreamingResponse:
    """Replay the risk monitor on the SYNTHETIC sensor feed of the replay day, as Server-Sent Events.

    Events: `plan` (the morning plan the monitor follows), one `reading` per 5-minute reading (the fast
    loop's decision), `alert` when the crew is told something (the supervisor text and the worker texts in
    each language), `replan` when the re-plan takes over, and `done`. The day is computed in full first
    (it is a replay), then streamed; a live monitor would decide each reading as it arrives.
    """
    from heat_safe.alerts import alerts_for
    from heat_safe.sensor import DEMO_SENSORS, parse_clock, replay_day

    day = date.isoformat()
    if (site, day) not in DEMO_SENSORS:  # never invent readings for a site or day without a sensor
        raise HTTPException(404, f"no site sensor for {site} on {day}; the demo sensor is "
                                 + ", ".join(f"{s} on {d}" for s, d in DEMO_SENSORS))
    try:  # every failure before the stream starts gets a proper status code (a started stream cannot)
        for t in (start, end) + ((replan_at,) if replan_at else ()):
            parse_clock(t)
        run = await asyncio.to_thread(replay_day, site, day, role, hours, replan_at or None, True)
        sent = alerts_for(run["log"], crew=f"{role.capitalize()} crew", alert_mode=alert_mode)
    except (ValueError, KeyError) as e:
        raise HTTPException(400, str(e)) from e

    by_time: dict[str, dict] = {}
    for a in sent:
        entry = by_time.setdefault(a.time, {"time": a.time, "action": a.action, "supervisor": None, "workers": []})
        if a.recipient == "supervisor":
            entry["supervisor"] = a.text
        else:
            entry["workers"].append({"language": a.language, "text": a.text, "status": a.template_status,
                                     "marker": a.marker, "fallback": a.fallback})
    log = run["log"]
    rows = [r for r in log.itertuples() if start <= f"{r.time:%H:%M}" < end]
    replanned = run["replanned"]

    async def events():
        yield sse("plan", {"site": site, "date": day, "role": role, "synthetic": True, "plan": _plan_summary(run["morning"])})
        replan_sent = False
        for r in rows:
            now = f"{r.time:%H:%M}"
            if replanned and not replan_sent and now >= replanned["replanned_from"]:
                yield sse("replan", {"time": now, "worked_before_replan": run["worked_before_replan"],
                                     "plan": _plan_summary(replanned)})
                replan_sent = True
            yield sse("reading", _reading(r))
            if r.alert and now in by_time:
                yield sse("alert", by_time[now])
            if speed:
                await asyncio.sleep(speed)
        yield sse("done", {"readings": len(rows), "alerts": sum(1 for r in rows if r.alert)})

    return StreamingResponse(events(), media_type="text/event-stream", headers=SSE_HEADERS)
