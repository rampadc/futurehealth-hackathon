"""optimise_schedule: place a crew's outdoor work into the safest hours of a shift. Deterministic.

Never trades a safety rule for output: work minutes per hour come from the TWL zone controls and the
midday break (heat_stress.compute_heat_stress), new starters get zero minutes outside the Low zone,
anyone acclimatising is capped at their share of a full workload (acclimatisation.py), and a shortfall
is reported rather than squeezed into unsafe hours.
"""
from __future__ import annotations

import pandas as pd

from heat_safe import rules
from heat_safe.acclimatisation import ACCLIMATISED, Acclimatisation
from heat_safe.job_profile import JobProfile


def optimise_schedule(
    hs: pd.DataFrame,
    profile: JobProfile,
    work_hours_needed: float,
    shift_start_hour: int = 5,
    shift_end_hour: int = 19,
    shade: bool = False,
    acclimatisation: Acclimatisation = ACCLIMATISED,
) -> dict:
    """Pick the hours with the most allowed work minutes (earliest first on ties) until the need is met.

    `hs` is compute_heat_stress output for one site and one local day. `shade` uses the shaded TWL zone.
    `acclimatisation` (from acclimatisation_status) limits zones and the share of a full workload.
    """
    acclimatised = not acclimatisation.low_zone_only
    if hs["site"].nunique() != 1 or pd.DatetimeIndex(hs["time"]).normalize().nunique() != 1:
        raise ValueError("optimise_schedule needs heat stress for exactly one site and one day")
    if not 0 <= shift_start_hour < shift_end_hour <= 24:
        raise ValueError("shift hours must satisfy 0 <= start < end <= 24")

    hours = pd.DatetimeIndex(hs["time"]).hour
    day = hs[(hours >= shift_start_hour) & (hours < shift_end_hour)].copy()
    day["hour"] = pd.DatetimeIndex(day["time"]).hour
    zone_col = "twl_zone_shade" if shade else "twl_zone"
    twl_col = "twl_shade_wm2" if shade else "twl_wm2"

    blocks = []
    for _, r in day.iterrows():
        zone = r[zone_col]
        controls = rules.ZONE_CONTROLS[zone]
        per_hour = (controls.work_minutes_per_hour_heavy if profile.work_intensity == "heavy"
                    else controls.work_minutes_per_hour_light)
        open_minutes = 60 - int(r["midday_break_minutes"])
        minutes = round(open_minutes * per_hour / 60)
        blocked = ""
        if not acclimatised and not controls.unacclimatised_may_work:
            minutes, blocked = 0, "unacclimatised workers may work only in the Low zone"  # new starter, day <= 7
        elif open_minutes == 0:
            blocked = "midday break"
        elif r["data_issue"]:
            blocked = r["data_issue"]
        blocks.append(dict(
            start=f"{r['hour']:02d}:00",
            end=f"{r['hour'] + 1:02d}:00" if r["hour"] < 23 else "24:00",
            outdoor_work_must_end_by=_must_end_by(r["hour"], int(r["midday_break_minutes"])),
            twl_zone=zone,
            band=rules.ZONE_BAND[zone].name.lower(),
            twl_wm2=round(float(r[twl_col])),
            temperature_c=round(float(r["temperature_c"]), 1),
            work_rest=controls.work_rest_heavy if profile.work_intensity == "heavy" else controls.work_rest_light,
            fluid_l_per_hr=controls.fluid_l_per_hr,
            midday_break_minutes=int(r["midday_break_minutes"]),
            allowed_work_minutes=int(minutes),
            scheduled_work_minutes=0,
            blocked_reason=blocked,
        ))

    need = round(work_hours_needed * 60)
    cap = round(need * acclimatisation.workload_share)  # TG section 3: share of a full work assignment
    remaining = cap
    for b in sorted(blocks, key=lambda b: (-b["allowed_work_minutes"], b["start"])):
        if remaining <= 0 or b["allowed_work_minutes"] == 0:
            break
        b["scheduled_work_minutes"] = min(b["allowed_work_minutes"], remaining)
        remaining -= b["scheduled_work_minutes"]

    scheduled = sum(b["scheduled_work_minutes"] for b in blocks)
    in_break = sum(b["scheduled_work_minutes"] for b in blocks
                   if b["scheduled_work_minutes"] > 60 - b["midday_break_minutes"])
    return dict(
        site=hs["site"].iloc[0],
        date=str(pd.DatetimeIndex(hs["time"])[0].date()),
        role=profile.role,
        work_intensity=profile.work_intensity,
        shade=shade,
        acclimatised=acclimatised,
        acclimatisation=acclimatisation.to_dict(),
        work_minutes_needed=need,
        work_minutes_allowed_by_acclimatisation=cap,
        work_minutes_scheduled=scheduled,
        shortfall_minutes=max(0, need - scheduled),
        # Totals in hours and minutes, so the model quotes them instead of doing the arithmetic
        work_needed_hm=_hm(need), work_scheduled_hm=_hm(scheduled), shortfall_hm=_hm(max(0, need - scheduled)),
        hours=blocks,
        zone_controls={z: dict(interventions=list(c.interventions), lone_work_allowed=c.lone_work_allowed,
                               unacclimatised_may_work=c.unacclimatised_may_work)
                       for z, c in rules.ZONE_CONTROLS.items() if any(b["twl_zone"] == z for b in blocks)},
        invariants=dict(no_work_in_midday_break=in_break == 0,
                        within_acclimatisation_share=scheduled <= cap,
                        no_unacclimatised_outside_low_zone=acclimatised or all(
                            b["scheduled_work_minutes"] == 0 or b["twl_zone"] == rules.ZONE_LOW for b in blocks)),
        rules_version=rules.RULES_VERSION,
    )


def _hm(minutes: int) -> str:
    """288 -> "4 h 48 min"."""
    h, m = divmod(int(minutes), 60)
    return f"{h} h {m} min" if h else f"{m} min"


def _must_end_by(hour: int, break_minutes: int) -> str:
    """For the hour that runs into the midday break, outdoor work stops when the break starts."""
    if 0 < break_minutes < 60 and hour == rules.MIDDAY_BREAK_START.hour:
        return rules.MIDDAY_BREAK_START.strftime("%H:%M")
    return ""
