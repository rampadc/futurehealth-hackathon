"""Safety and productivity measures for one crew-day, judged against MEASURED heat. Pure code.

A crew-day is a work timeline: (start time, minutes) blocks, one per 5-minute reading. Three timelines are
compared on the same measured day (tools/replay_metrics.py):
    A. no plan: work from 07:00 until done, midday break respected (baseline_timeline)
    B. the morning plan, followed blindly (plan_timeline)
    C. Heat-Safe: the plan, cut by the fast loop and re-planned (the `worked_now` column of replay_fast_loop)

Headline safety measure: minutes worked OVER the work limit. Each worked minute is judged when it is worked:
the measured zone of that reading gives the limit (ADOSH-SF TG Table 1: e.g. 20 minutes per 60 in High
for heavy work), counted over a rolling 60 minutes as in the fast loop. Work done before conditions changed
is never blamed afterwards. No heat illness is simulated: this measures exceedance of the regulator's
limits, not illness prevented.
"""
from __future__ import annotations

from datetime import time as clock

import pandas as pd

from heat_safe import rules
from heat_safe.spike import SENSOR_FAULT, WITHDRAW, ZONES, allowed_minutes

STEP_MIN = 5  # minutes between sensor readings, and the length of one work block
WINDOW = pd.Timedelta(minutes=60)


def baseline_timeline(day_readings: pd.DataFrame, minutes_needed: int, start: str = "07:00") -> list[tuple]:
    """Approach A: work in 5-minute blocks from `start` until done, skipping the midday break (it is the
    law, so the baseline obeys it too), with no work/rest limits."""
    h, m = (int(x) for x in start.split(":"))
    out, left = [], minutes_needed
    for t in pd.DatetimeIndex(day_readings["time"]):
        if left <= 0:
            break
        if t.time() < clock(h, m) or rules.in_midday_break(t.tz_localize(None).to_pydatetime()):
            continue
        out.append((t, min(STEP_MIN, left)))
        left -= STEP_MIN
    return out


def plan_timeline(plan: dict, day_readings: pd.DataFrame) -> list[tuple]:
    """Approach B: follow a plan blindly. In each hour, work its scheduled minutes from the start of the
    hour (the same crew model as sensor.replay_fast_loop), whatever the heat turns out to be."""
    per_hour = {int(b["start"].split(":")[0]): b["scheduled_work_minutes"] for b in plan["hours"]}
    out, done = [], {}
    for t in pd.DatetimeIndex(day_readings["time"]):
        left = per_hour.get(t.hour, 0) - done.get(t.hour, 0)
        if left > 0:
            out.append((t, min(STEP_MIN, left)))
            done[t.hour] = done.get(t.hour, 0) + min(STEP_MIN, left)
    return out


def log_timeline(log: pd.DataFrame) -> list[tuple]:
    """Approach C: what the crew actually worked under the fast loop (replay_fast_loop's `worked_now`)."""
    return [(r.time, int(r.worked_now)) for r in log.itertuples() if r.worked_now]


def _judge(measured: pd.DataFrame) -> pd.DataFrame:
    """Per reading: the measured zone to judge work by, and whether a withdrawal limit was exceeded. A faulty
    reading is judged by the last good one (a broken sensor does not change the real heat)."""
    m = measured.sort_values("time").set_index("time")
    good = m["fault"] == "" if "fault" in m else pd.Series(True, index=m.index)
    zone = pd.Series([rules.twl_zone(x) if ok else None for x, ok in zip(m["twl_wm2"], good)],
                     index=m.index).ffill()
    withdraw = m["withdrawal_limit"].where(good, other=False).astype(bool)
    return pd.DataFrame({"zone": zone, "withdrawal": withdraw})


def crew_day_metrics(timeline: list[tuple], measured: pd.DataFrame, minutes_needed: int,
                     work_intensity: str = "heavy", acclimatised: bool = True) -> dict:
    """The safety and productivity measures for one timeline, judged against `measured` (flag_faults output)."""
    judge = _judge(measured)
    over, by_zone, in_break, in_withdrawal, done = 0, {z: 0 for z in ZONES}, 0, 0, []
    for t, minutes in sorted(timeline):
        zone = judge.at[t, "zone"] if t in judge.index else rules.ZONE_HIGH  # no reading: fail-safe High
        limit = allowed_minutes(zone, work_intensity, acclimatised)
        # work in the 60 minutes that END with this block, as the fast loop counts (sensor.available_work_minutes)
        lo = t + pd.Timedelta(minutes=minutes) - WINDOW
        before = sum(max(0.0, (min(s + pd.Timedelta(minutes=m), t) - max(s, lo)).total_seconds() / 60)
                     for s, m in done)
        over += max(0, min(minutes, before + minutes - limit))
        by_zone[zone] += minutes
        in_break += minutes if rules.in_midday_break(t.tz_localize(None).to_pydatetime()) else 0
        in_withdrawal += minutes if (t in judge.index and judge.at[t, "withdrawal"]) else 0
        done.append((t, minutes))
    delivered = sum(m for _, m in timeline)
    last = max((t for t, _ in timeline), default=None)
    return dict(
        minutes_over_work_limit=over,
        work_minutes_high=by_zone[rules.ZONE_HIGH], work_minutes_medium=by_zone[rules.ZONE_MEDIUM],
        work_minutes_low=by_zone[rules.ZONE_LOW],
        minutes_in_midday_break=in_break, minutes_above_withdrawal_limit=in_withdrawal,
        work_delivered_minutes=delivered, shortfall_minutes=max(0, minutes_needed - delivered),
        finishes_at=(last + pd.Timedelta(minutes=STEP_MIN)).strftime("%H:%M") if last is not None else "",
    )


def alert_metrics(log: pd.DataFrame, languages: int) -> dict:
    """What the fast loop did (approach C only): alerts, detection delay, faults and false withdrawals."""
    alerts = log[log["alert"]]
    usable = log[log["action"] != SENSOR_FAULT]
    worse = usable[[ZONES.index(z) > ZONES.index(p) for z, p in zip(usable["measured_zone"], usable["planned_zone"])]]
    first_worse = worse["time"].min() if len(worse) else None
    first_alert = alerts.loc[alerts["time"] >= first_worse, "time"].min() if first_worse is not None else None
    delay = (int((first_alert - first_worse).total_seconds() // 60)
             if first_worse is not None and pd.notna(first_alert) else None)
    return dict(
        alerts=len(alerts), readings=len(log), alerts_by_action=alerts["action"].value_counts().to_dict(),
        messages_sent=len(alerts) * (1 + languages),
        detection_delay_minutes=delay,  # from the first reading worse than the plan to the first alert
        sensor_faults_caught=int((log["action"] == SENSOR_FAULT).sum()),
        false_withdrawals=int(((log["action"] == WITHDRAW) & (log["measured_zone"] == "")).sum()),
    )


def schedule_change(morning: dict, replanned: dict, worked_before: int) -> dict:
    """Lost work time, made visible: minutes the fast loop cut before the re-plan, and minutes the re-plan
    moved into hours the morning plan had not used."""
    first = int(replanned["replanned_from"].split(":")[0])
    plan_before = sum(b["scheduled_work_minutes"] for b in morning["hours"] if int(b["start"].split(":")[0]) < first)
    m = {b["start"]: b["scheduled_work_minutes"] for b in morning["hours"]}
    moved = sum(max(0, b["scheduled_work_minutes"] - m.get(b["start"], 0)) for b in replanned["hours"]
                if int(b["start"].split(":")[0]) >= first)
    return dict(minutes_cut_by_fast_loop=max(0, plan_before - worked_before), minutes_moved_by_replan=moved)


def replay_day_metrics(site: str, day: str, role: str, hours: float, replan_at: str) -> tuple[dict, dict, dict]:
    """The three approaches on the replay day: (metrics per approach, what the fast loop did, run settings)."""
    from datetime import datetime

    from heat_safe.alerts import WORKER_LANGUAGES
    from heat_safe.forecast import get_replay
    from heat_safe.heat_stress import compute_heat_stress
    from heat_safe.job_profile import lookup_job_profile
    from heat_safe.schedule import optimise_schedule
    from heat_safe.sensor import apply_measurements, flag_faults, measured_twl, replay_fast_loop, synthetic_feed

    weather = get_replay(day, sites=[site])
    hs = compute_heat_stress(weather)
    profile = lookup_job_profile(role)
    need = round(hours * 60)
    measured = flag_faults(measured_twl(synthetic_feed(weather)))
    shift = measured[(measured["time"].dt.hour >= 5) & (measured["time"].dt.hour < 19)]
    morning = optimise_schedule(hs, profile, work_hours_needed=hours, shade=True)

    # C: the monitor follows the morning plan until the re-plan; the re-plan counts the minutes the monitor
    # actually let the crew work (not the morning plan's assumption), then the monitor follows the re-plan.
    h, m = (int(x) for x in replan_at.split(":"))
    first = h + (1 if m else 0)
    before = replay_fast_loop(shift, morning, end=f"{first:02d}:00")
    worked_before = int(before["worked_now"].sum())
    now = datetime.fromisoformat(f"{day}T{replan_at}")
    replanned = optimise_schedule(apply_measurements(hs, measured, now, shade=True), profile, work_hours_needed=hours,
                                  shade=True, from_hour=first, already_worked_minutes=worked_before)
    log = replay_fast_loop(shift, morning, replans=(replanned,))

    results = {
        "A. No plan": crew_day_metrics(baseline_timeline(shift, need), measured, need, profile.work_intensity),
        "B. Morning plan only": crew_day_metrics(plan_timeline(morning, shift), measured, need, profile.work_intensity),
        "C. Heat-Safe": crew_day_metrics(log_timeline(log), measured, need, profile.work_intensity),
    }
    extra = alert_metrics(log, len(WORKER_LANGUAGES)) | schedule_change(morning, replanned, worked_before)
    extra |= {"worked_before_replan": worked_before, "replanned_from": replanned["replanned_from"]}
    return results, extra, {"site": site, "date": day, "role": profile.role, "hours": hours, "replan_at": replan_at}
