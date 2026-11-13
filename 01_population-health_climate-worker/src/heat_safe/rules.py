"""Versioned regulatory thresholds. Code, not RAG, not LLM (plan: "Risk model").

Every value cites its source document in data/heat_safe/raw/regulatory/. Change a value only together with
RULES_VERSION and the unit tests in tests/test_rules.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from enum import IntEnum

from heat_safe.twl import DEFAULT_ICL

RULES_VERSION = "2026.11.07-1"  # 06 Nov: 2026 midday-break season (-1); acclimatisation option B (-2); note b restored (-3). 07 Nov: clothing ensembles (-1)

ADOSH_TG = "ADOSH-SF Technical Guideline, Safety in the Heat, v4.0 (15 Jul 2024), Table 1, p.5"
ADOSH_COP = "ADOSH-SF CoP 11.0, Safety in the Heat, v4.0 (Jul 2024)"
MOHRE = "MoHRE Midday Break / Occupational Heat Stress Prevention Policy announcements (WAM, 2024-2026)"
NIOSH = "NIOSH 2016-106, Occupational Exposure to Heat and Hot Environments, Table 3-1 p.18, Table 3-2 p.19"


class Band(IntEnum):
    """Plan's graded warnings. Ordered so max() picks the most severe; risk only ever moves up."""
    GREEN = 0
    AMBER = 1
    RED = 2
    EMERGENCY = 3  # symptoms only (worker check-ins), never from environment alone

    def raised(self, levels: int = 1) -> "Band":
        """Fail-safe: one level higher, capped below EMERGENCY (emergency needs symptoms)."""
        return Band(min(self + levels, Band.RED))


# --- Thermal Work Limit zones ([ADOSH_TG]) ---------------------------------------------------------
# TWL is the heat-stress index adopted in Abu Dhabi ("validated for Gulf conditions"), in W/m².
TWL_HIGH_RISK_BELOW = 115.0  # TWL < 115           -> High Risk Zone
TWL_LOW_RISK_FROM = 140.0    # 115 <= TWL < 140    -> Medium Risk / Cautionary;  TWL >= 140 -> Low Risk

ZONE_LOW, ZONE_MEDIUM, ZONE_HIGH = "low", "medium", "high"
ZONE_BAND = {ZONE_LOW: Band.GREEN, ZONE_MEDIUM: Band.AMBER, ZONE_HIGH: Band.RED}


@dataclass(frozen=True)
class ZoneControls:
    work_rest_light: str
    work_rest_heavy: str
    work_minutes_per_hour_light: int  # 60 = continuous self-paced
    work_minutes_per_hour_heavy: int
    fluid_l_per_hr: str
    unacclimatised_may_work: bool
    lone_work_allowed: bool
    interventions: tuple[str, ...]


ZONE_CONTROLS = {
    ZONE_LOW: ZoneControls(
        work_rest_light="continuous self-paced",
        work_rest_heavy="continuous self-paced",
        work_minutes_per_hour_light=60,
        work_minutes_per_hour_heavy=60,
        fluid_l_per_hr="0.6-1.0 (light work)",
        unacclimatised_may_work=True,
        lone_work_allowed=True,
        interventions=("No limits on self-paced work for educated, hydrated workers",),
    ),
    ZONE_MEDIUM: ZoneControls(
        work_rest_light="continuous self-paced light work",
        work_rest_heavy="45 min work / 15 min rest (paced work)",
        work_minutes_per_hour_light=60,
        work_minutes_per_hour_heavy=45,
        fluid_l_per_hr="1.0-1.2 light; >1.2 heavy",
        unacclimatised_may_work=False,
        lone_work_allowed=False,  # "working alone to be avoided"
        interventions=(
            "Engineering controls to reduce heat stress (shade, ventilation)",
            "Working alone to be avoided",
            "No unacclimatised person to work",
            "Ensure adequate fluid intake for the type of work",
        ),
    ),
    ZONE_HIGH: ZoneControls(
        work_rest_light="45 min work / 15 min rest",
        work_rest_heavy="20 min work / 40 min rest",
        work_minutes_per_hour_light=45,
        work_minutes_per_hour_heavy=20,
        fluid_l_per_hr=">1.2 all work",
        unacclimatised_may_work=False,
        lone_work_allowed=False,
        interventions=(
            "Strict work/rest cycling required",
            "No person to work alone",
            "No unacclimatised person to work",
            "High Risk induction: hydration and signs of heat strain",
            "Personal water bottle (2 litre) on site at all times",
        ),
    ),
}


def twl_zone(twl: float) -> str:
    if twl < TWL_HIGH_RISK_BELOW:
        return ZONE_HIGH
    if twl < TWL_LOW_RISK_FROM:
        return ZONE_MEDIUM
    return ZONE_LOW


# --- TWL withdrawal limits (Brake & Bates 2002 practice, not in the ADOSH table) ----------------
# Conditions where TWL is capped into the High Risk zone regardless of the heat-balance result.
WITHDRAWAL_DRY_BULB_C = 44.0
WITHDRAWAL_WET_BULB_C = 32.0  # psychrometric wet bulb

# --- Acclimatisation ([ADOSH_COP] 3.2(b)(i), p.7; [ADOSH_TG] section 3, p.6) ---------------------
# Decision 6 Nov 2026 (option B; review with an OHS advisor). The documents give no single cutoff:
# CoP 11.0 allows "5-7 days for acclimatization before starting hard work", TG section 3 reaches 100%
# workload on day 5, and TG 5.1 says full acclimatisation "takes over two weeks". So:
# - New starters (including people moving from a climate-controlled job, CoP 3.2(b)(i)) may work only
#   in the Low zone through day NEW_STARTER_LOW_ZONE_ONLY_DAYS (the protective end of 5-7), and at the
#   TG share of a full work assignment for days 1-5.
# - Returning workers follow the TG re-acclimatisation table: a workload share by day back (it reduces
#   work from 4 days away, which a 14-day rule alone missed).
# - Off work MORE than 14 days (illness or vacation) = unacclimatised, by definition: TG Table 1 note b,
#   p.5 (an image; read from the rendered page). So they are also Low zone only, for the same 7 days as
#   new starters, because CoP 3.2(b)(i) gives "5-7 days" to employees back from vacation too.
#   Note b says "vacation leave (in a cool climate area)"; we apply it to any absence: the protective reading.
# Days are calendar days from the first day (day 1), an assumption: a rest day counts as a day.
NEW_STARTER_LOW_ZONE_ONLY_DAYS = 7
UNACCLIMATISED_AFTER_DAYS_AWAY = 14  # TG Table 1 note b: off work for more than 14 days
# Day -> share of a full work assignment
ACCLIMATISATION_NEW = {1: 0.20, 2: 0.40, 3: 0.60, 4: 0.80, 5: 1.00}
ACCLIMATISATION_EXPERIENCED = {1: 0.50, 2: 0.60, 3: 0.80, 4: 1.00, 5: 1.00}
FULLY_ACCLIMATISED_DAY = 5
# The TG writes "R/E - reduced expectations" without a number (4-5 days away, 1-3 days ill). We use
# 80%, the first-day value of the next row: our interpretation, not the TG's.
REDUCED_EXPECTATIONS_SHARE = 0.80
# (most days away in this row, workload share on day 1, 2, ... back). None = no upper limit.
# The TG rows "6-12" and "12-20" overlap at 12 days; 12 is read as the stricter row.
REACCLIMATISATION_ABSENCE: list[tuple[int | None, tuple[float, ...]]] = [
    (3, (1.00,)),
    (5, (REDUCED_EXPECTATIONS_SHARE, 1.00)),
    (11, (0.80, 1.00)),
    (20, (0.60, 0.80, 1.00)),
    (None, (0.50, 0.60, 0.80, 1.00)),
]
REACCLIMATISATION_ILLNESS: list[tuple[int | None, tuple[float, ...]]] = [
    (0, (1.00,)),
    (3, (REDUCED_EXPECTATIONS_SHARE, 1.00)),
    (5, (0.80, 1.00)),
    (8, (0.60, 0.80, 1.00)),
    (None, (0.50, 0.60, 0.80, 1.00)),
]

# --- Clothing and PPE ([NIOSH]; decision 7 Nov 2026, review with an OHS advisor) ----------------
# No binding Abu Dhabi value: the ADOSH-SF TG (p.11) says only that PPE "may increase the risk of heat
# stress". Insulation therefore comes from NIOSH Table 3-1, taken as a DIFFERENCE from standard work
# wear (shirt and trousers, 0.75 clo there) and added to our TWL baseline (twl.DEFAULT_ICL, 0.6 clo,
# the Brake & Bates convention the TWL tests are validated with). Using NIOSH's absolute values would
# mix two scales and shift every existing result for ordinary work wear.
# Permeability: no per-ensemble source yet, so cloth ensembles keep twl.DEFAULT_ICL_PERM (open question).
# WBGT adjustments are for the WBGT display only (Table 3-2, ACGIH 2014 column).
# Vapour-barrier suits: TWL assumes sweat can evaporate through clothing, so it is not valid for them;
# compute_worker_risk must not compute a TWL and sets Red, "special controls" instead.
# Not yet modelled: limited-use SMS / polyolefin coveralls (Table 3-2 gives WBGT values, Table 3-1 no clo).
NIOSH_WORK_WEAR_CLO = 0.75  # Table 3-1: underpants, shirt, pants, socks, shoes


@dataclass(frozen=True)
class Clothing:
    description: str
    icl: float | None  # clothing insulation for TWL, clo; None = outside the TWL model
    wbgt_adjust_c: float  # added to WBGT for display
    niosh_clo: float | None  # the Table 3-1 value the difference comes from

    @property
    def in_twl_model(self) -> bool:
        return self.icl is not None


def _from_niosh(niosh_clo: float) -> float:
    return round(DEFAULT_ICL + (niosh_clo - NIOSH_WORK_WEAR_CLO), 2)


CLOTHING = {
    "work_wear": Clothing("long-sleeved shirt and trousers", DEFAULT_ICL, 0.0, NIOSH_WORK_WEAR_CLO),
    # Table 3-1 "underpants, shirt, coveralls" 0.80; Table 3-2 cloth coveralls 0
    "cloth_coveralls": Clothing("cloth coveralls over a shirt", _from_niosh(0.80), 0.0, 0.80),
    # Table 3-1 "... shirt, pants, coveralls" 1.1; Table 3-2 double-layer cloth 3
    "coveralls_over_work_wear": Clothing("cloth coveralls over shirt and trousers", _from_niosh(1.1), 3.0, 1.1),
    # Table 3-2 limited-use vapour-barrier coveralls 11
    "vapour_barrier": Clothing("vapour-barrier or chemical protective suit", None, 11.0, None),
}
DEFAULT_CLOTHING = "work_wear"


def clothing(name: str) -> Clothing:
    if name not in CLOTHING:
        raise ValueError(f"unknown clothing {name!r}; known: {sorted(CLOTHING)}")
    return CLOTHING[name]


# --- Heat stress programme trigger ([ADOSH_COP] 3.1(e)) ------------------------------------------
HEAT_PROGRAMME_TRIGGER_C = 35.0  # any shift reaching >= 35 °C needs a heat stress programme

# --- Midday break ([MOHRE]; required by [ADOSH_COP] 3.1(g)) --------------------------------------
# No work under direct sun / in open air 12:30-15:00. Dates are announced each year.
MIDDAY_BREAK_START = time(12, 30)
MIDDAY_BREAK_END = time(15, 0)
MIDDAY_BREAK_SEASONS: dict[int, tuple[date, date]] = {
    2024: (date(2024, 6, 15), date(2024, 9, 15)),  # MoHRE, 31 May 2024
    2025: (date(2025, 6, 15), date(2025, 9, 15)),  # MoHRE, 3 Jun 2025 (21st year)
    2026: (date(2026, 6, 15), date(2026, 9, 15)),  # MoHRE, 8 Jun 2026 (22nd year, renamed Heat Stress Prevention Policy)
}
DEFAULT_SEASON = ((6, 15), (9, 15))  # used for years without a recorded announcement


def midday_break_season(year: int) -> tuple[date, date]:
    if year in MIDDAY_BREAK_SEASONS:
        return MIDDAY_BREAK_SEASONS[year]
    (sm, sd), (em, ed) = DEFAULT_SEASON
    return date(year, sm, sd), date(year, em, ed)


def in_midday_break(ts: datetime) -> bool:
    """True if outdoor work in direct sun is prohibited at local time `ts` (Asia/Dubai wall clock)."""
    start, end = midday_break_season(ts.year)
    return start <= ts.date() <= end and MIDDAY_BREAK_START <= ts.time() < MIDDAY_BREAK_END


def midday_break_minutes(hour_start: datetime) -> int:
    """Minutes of the hour [hour_start, hour_start + 60 min) that fall inside the midday break."""
    start, end = midday_break_season(hour_start.year)
    if not start <= hour_start.date() <= end:
        return 0
    h0 = hour_start.hour * 60 + hour_start.minute
    b0 = MIDDAY_BREAK_START.hour * 60 + MIDDAY_BREAK_START.minute
    b1 = MIDDAY_BREAK_END.hour * 60 + MIDDAY_BREAK_END.minute
    return max(0, min(h0 + 60, b1) - max(h0, b0))
