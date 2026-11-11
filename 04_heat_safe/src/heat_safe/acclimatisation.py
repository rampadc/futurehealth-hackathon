"""Who counts as acclimatised on a given day, and what share of a full workload they may do. Deterministic.

The supervisor gives dates ("started on Monday", "back tomorrow after 10 days' leave"); this module
turns them into a status using the tables in rules.py. The model never counts days or decides who is
acclimatised: counting is arithmetic, and the cutoff is a safety rule (rules.py, option B, 6 Nov 2026).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

from heat_safe import rules


@dataclass(frozen=True)
class Acclimatisation:
    status: str  # "acclimatised" | "new_starter" | "returning"
    day: int  # 1 = first day on site / first day back; 0 when acclimatised
    low_zone_only: bool  # may work only in the TWL Low zone
    workload_share: float  # share of a full work assignment allowed today
    reason: str
    sources: tuple[str, ...]  # in the same "<doc>, p. N" form as search_guidance, so citations can be checked

    def to_dict(self) -> dict:
        # The percentage people say, so the model never converts 0.8 -> "80%" itself (grounding)
        return {**asdict(self), "workload_percent": round(self.workload_share * 100)}


ACCLIMATISED = Acclimatisation("acclimatised", 0, False, 1.0, "no recent start or time away given", ())
COP_CLAUSE = "ADOSH-SF CoP 11.0, p. 7"  # 3.2(b)(i): 5-7 days before hard work
TG_TABLES = "ADOSH-SF TG Safety in the Heat, p. 6"  # section 3: acclimatisation and re-acclimatisation
TG_TABLE1 = "ADOSH-SF TG Safety in the Heat, p. 5"  # Table 1 note b: definition of unacclimatised


def _day_number(plan_date: date, since: date, what: str) -> int:
    if since > plan_date:
        raise ValueError(f"{what} {since} is after the planned date {plan_date}")
    return (plan_date - since).days + 1


def _return_sequence(days_away: int, illness: bool) -> tuple[float, ...]:
    table = rules.REACCLIMATISATION_ILLNESS if illness else rules.REACCLIMATISATION_ABSENCE
    return next(seq for most, seq in table if most is None or days_away <= most)


def acclimatisation_status(
    plan_date: date,
    new_starter_since: date | None = None,
    returned_since: date | None = None,
    days_away: int = 0,
    away_for_illness: bool = False,
    experienced_in_heat: bool = False,
) -> Acclimatisation:
    """Status for one worker on plan_date. With neither date given, the worker is acclimatised.

    new_starter_since: first day working in the heat (a new employee, or moved from a climate-controlled job).
    returned_since: first day back after days_away days away (away_for_illness picks the illness column).
    experienced_in_heat: a new starter who has worked in heat before (TG "experienced employee" column).
    """
    if new_starter_since and returned_since:
        raise ValueError("give either new_starter_since or returned_since, not both")
    if days_away < 0:
        raise ValueError("days_away cannot be negative")

    if new_starter_since:
        day = _day_number(plan_date, new_starter_since, "new_starter_since")
        table = rules.ACCLIMATISATION_EXPERIENCED if experienced_in_heat else rules.ACCLIMATISATION_NEW
        share = table[min(day, rules.FULLY_ACCLIMATISED_DAY)]
        low_only = day <= rules.NEW_STARTER_LOW_ZONE_ONLY_DAYS
        reason = (f"day {day} since starting in the heat: Low zone only through day "
                  f"{rules.NEW_STARTER_LOW_ZONE_ONLY_DAYS}" if low_only
                  else f"day {day} since starting: past the {rules.NEW_STARTER_LOW_ZONE_ONLY_DAYS}-day allowance")
        return Acclimatisation("new_starter" if low_only else "acclimatised", day, low_only, share,
                               reason + f", {share:.0%} of a full workload",
                               (COP_CLAUSE, TG_TABLES))

    if returned_since:
        day = _day_number(plan_date, returned_since, "returned_since")
        seq = _return_sequence(days_away, away_for_illness)
        share = seq[day - 1] if day <= len(seq) else 1.0
        why = "ill" if away_for_illness else "away"
        # TG Table 1 note b: off work more than 14 days = unacclimatised -> Low zone only, 7 days like a new starter
        low_only = days_away > rules.UNACCLIMATISED_AFTER_DAYS_AWAY and day <= rules.NEW_STARTER_LOW_ZONE_ONLY_DAYS
        reason = f"day {day} back after {days_away} days {why}: {share:.0%} of a full workload"
        if low_only:
            reason += (f"; unacclimatised (off more than {rules.UNACCLIMATISED_AFTER_DAYS_AWAY} days), Low zone only "
                       f"through day {rules.NEW_STARTER_LOW_ZONE_ONLY_DAYS}")
        return Acclimatisation("returning" if share < 1.0 or low_only else "acclimatised", day, low_only, share,
                               reason, (TG_TABLE1, TG_TABLES, COP_CLAUSE) if low_only else (TG_TABLES,))

    return ACCLIMATISED
