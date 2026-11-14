"""Demo: an unexpected heat spike on the replay day, from sensor reading to re-planned shift. No LLM.

    uv run python tools/replay_heat_spike.py                 # steel fixers in shade, Mussafah, 1 Aug 2025
    uv run python tools/replay_heat_spike.py --replan-at 09:00 --save

1. Morning plan from the forecast (optimise_schedule, shade TWL).
2. Fast loop over the SYNTHETIC sensor feed (spike 08:15-09:15, faulty reading 09:40): every decision
   that raises an alert. Needs spike.adjust_for_observation (skipped with a note until it is written).
3. Slow loop at --replan-at: measured heat replaces the forecast, the rest of the day is re-planned.
--save writes the feed to data/heat_safe/processed/synthetic/ for inspection or loading elsewhere.
"""
from __future__ import annotations

import argparse
from datetime import datetime

import pandas as pd

from heat_safe.alerts import alerts_for, load_templates, mode
from heat_safe.forecast import get_replay
from heat_safe.heat_stress import compute_heat_stress
from heat_safe.job_profile import lookup_job_profile
from heat_safe.paths import PROCESSED
from heat_safe.schedule import minutes_scheduled_before, optimise_schedule
from heat_safe.sensor import apply_measurements, measured_twl, replay_fast_loop, synthetic_feed


def show(plan: dict, title: str) -> None:
    print(f"\n{title}: {plan['work_scheduled_hm']} scheduled of {plan['work_needed_hm']} "
          f"(shortfall {plan['shortfall_hm']})")
    for b in plan["hours"]:
        if b["scheduled_work_minutes"] or b["twl_basis"] != "forecast":
            print(f"  {b['start']}  {b['twl_zone']:6s} TWL {b['twl_wm2']:>3}  work {b['scheduled_work_minutes']:>2} min"
                  f"  [{b['twl_basis']}]{'  ' + b['blocked_reason'] if b['blocked_reason'] else ''}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="mussafah")
    ap.add_argument("--date", default="2025-08-01")
    ap.add_argument("--role", default="steel fixer")
    ap.add_argument("--hours", type=float, default=5)
    ap.add_argument("--replan-at", default="09:00", help="local HH:MM when the supervisor re-plans")
    ap.add_argument("--save", action="store_true")
    args = ap.parse_args()

    weather = get_replay(args.date, sites=[args.site])
    hs = compute_heat_stress(weather)
    profile = lookup_job_profile(args.role)
    plan = optimise_schedule(hs, profile, work_hours_needed=args.hours, shade=True)
    show(plan, f"1. Morning plan from the forecast ({args.role}, shade)")

    feed = synthetic_feed(weather)
    measured = measured_twl(feed)
    if args.save:
        out = PROCESSED / "synthetic" / f"sensor_{args.site}_{args.date}.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        feed.to_csv(out, index=False)
        print(f"\nfeed saved: {out}")

    # The supervisor re-plans at --replan-at on measured heat; from the re-plan's first hour the monitor
    # follows the NEW plan, so its alerts and the re-plan describe the same day.
    h, m = map(int, args.replan_at.split(":"))
    now = datetime.fromisoformat(f"{args.date}T{args.replan_at}")
    from_hour = h + (m > 0)
    worked = minutes_scheduled_before(plan, from_hour)
    replanned = optimise_schedule(apply_measurements(hs, measured, now, shade=True), profile,
                                  work_hours_needed=args.hours, shade=True, from_hour=from_hour,
                                  already_worked_minutes=worked)

    print(f"\n2. Fast loop, 08:00-10:00 (SYNTHETIC sensor feed): what each person received ({mode()} mode)")
    print(f"   The monitor follows the morning plan, then the re-plan from {replanned['replanned_from']}.")
    log = replay_fast_loop(measured, plan, start="08:00", end="10:00", replans=(replanned,))
    langs = load_templates()["languages"]
    sent = alerts_for(log, crew=f"{args.role.capitalize()} crew")
    switch_shown = False
    for a in sent:
        if a.recipient == "supervisor":
            if not switch_shown and a.time >= replanned["replanned_from"]:
                print(f"\n  {replanned['replanned_from']}  -- re-plan accepted: the monitor now follows it --")
                switch_shown = True
            print(f"\n  {a.time}  SUPERVISOR  {a.text}")
        else:
            note = a.marker or (f"[{a.fallback}]" if a.fallback else "")
            text = a.text.replace("\n", "\n" + " " * 20)  # a back-translated text carries the English below it
            print(f"         {langs[a.language]['name'][:9]:9s}  {text}  {note}")
    print(f"\n  ({int(log['alert'].sum())} alerts from {len(log)} readings; logged, not sent: SMS/voice is roadmap)")
    if args.save:
        out = PROCESSED / "synthetic" / f"alerts_{args.site}_{args.date}.csv"
        pd.DataFrame([a.to_dict() for a in sent]).to_csv(out, index=False)
        print(f"  alert log saved: {out}")

    show(replanned, f"3. Re-plan at {args.replan_at} on measured heat ({worked} min already worked)")

if __name__ == "__main__":
    main()
