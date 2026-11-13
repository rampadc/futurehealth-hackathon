"""Thermal Work Limit (TWL), the heat-stress index required by ADOSH-SF CoP 11.0 in Abu Dhabi.

TWL (W/m²) is the highest metabolic rate a well-hydrated, acclimatised, self-paced worker can sustain
without core temperature exceeding 38.2 °C or sweat rate exceeding 1.2 kg/h.

Model: Brake & Bates (2002), "Limiting metabolic rate (thermal work limit) as an index of thermal
stress", Applied Occupational and Environmental Hygiene 17(3):176-186, Appendix 1. Ported from the
MIT-licensed R implementation in github.com/vorpalvorpal/meteoHazard (R/solve_twl.R, v0.4.0) and
vectorised. Validated against the paper's Table 1 in tests/test_twl.py.
"""
from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike

MAX_CORE_TEMP_C = 38.2
MAX_SWEAT_RATE = 0.67      # kg/(m²·h) = 1.2 kg/h over ~1.8 m² body surface
LEWIS_RELATION = 16.5      # K/kPa
LATENT_HEAT_SWEAT = 2430   # kJ/kg at skin temperature ~30 °C (ASHRAE)
TWL_FLOOR = 60.0           # W/m²
TWL_CEILING = 380.0        # W/m²
WIND_MIN, WIND_MAX = 0.2, 4.0  # m/s, validity range of the model at body level

# Default work clothing: long-sleeved cotton work wear (Brake & Bates use 0.35-0.69 clo)
DEFAULT_ICL = 0.6          # clothing insulation, clo
DEFAULT_ICL_PERM = 0.45    # clothing vapour permeability index (0-1)

BISECTION_STEPS = 50


def sat_vapour_pressure(t: ArrayLike) -> np.ndarray:
    """Saturation vapour pressure (kPa) at t (°C), Buck (1996)."""
    t = np.asarray(t, dtype=float)
    return 0.61121 * np.exp((18.678 - t / 234.5) * (t / (257.14 + t)))


def dew_point_from_vp(pa: ArrayLike) -> np.ndarray:
    """Dew point (°C) from actual vapour pressure (kPa), inverse Buck (Magnus form)."""
    g = np.log(np.asarray(pa, dtype=float) / 0.61121)
    return 257.14 * g / (18.678 - g)


def wind_10m_to_body(wind_10m: ArrayLike, z0: float = 0.01) -> np.ndarray:
    """Log-profile correction of 10 m wind to body level (1 m); factor 0.667 for z0 = 0.01 m."""
    return np.asarray(wind_10m, dtype=float) * np.log(1 / z0) / np.log(10 / z0)


def _three_zone_evaporation(lambda_sr: np.ndarray, emax: np.ndarray) -> np.ndarray:
    """Actual evaporation from sweat supply and evaporative capacity (Brake & Bates Appendix 1, Fig. 3)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        x = np.where(emax > 0, lambda_sr / emax, np.inf)
        partial = lambda_sr * np.exp(-0.4127 * np.clip(x - 0.46, 0, None) ** 1.168)
    e = np.where(x < 0.46, lambda_sr, np.where(x <= 1.7, partial, emax))
    return np.where(emax <= 0, 0.0, np.maximum(e, 0.0))


def thermal_work_limit(
    ta: ArrayLike,
    pa: ArrayLike,
    trad: ArrayLike,
    wind: ArrayLike,
    pressure_kpa: ArrayLike = 101.3,
    icl: float = DEFAULT_ICL,
    icl_perm: float = DEFAULT_ICL_PERM,
    max_core_temp: float = MAX_CORE_TEMP_C,
    max_sweat_rate: float = MAX_SWEAT_RATE,
) -> np.ndarray:
    """TWL (W/m²) from air temperature ta (°C), vapour pressure pa (kPa), mean radiant temperature
    trad (°C), body-level wind (m/s) and pressure (kPa). Vectorised; NaN in -> NaN out.

    Wind is clamped to the model's 0.2-4.0 m/s range. Withdrawal limits (DB > 44 °C, WB > 32 °C) are
    applied by the caller (heat_stress.py), which knows the wet bulb.
    """
    ta, pa, trad, wind, p = np.broadcast_arrays(*(np.asarray(v, dtype=float) for v in (ta, pa, trad, wind, pressure_kpa)))
    wind = np.clip(wind, WIND_MIN, WIND_MAX)
    t_core = max_core_temp

    # Clothing (ASHRAE Fundamentals ch. 8)
    rcl = 0.155 * icl                         # m²K/W
    fcl = 1.0 + 0.31 * icl
    recl = rcl / (LEWIS_RELATION * icl_perm)  # m²kPa/W

    hc = 0.608 * p**0.6 * wind**0.6           # convective coefficient, W/(m²K)
    he = 1587 * hc * p / (p - pa) ** 2        # evaporative coefficient, W/(m²kPa)

    def balance(t_skin: np.ndarray):
        hr = 4.61 * (1 + (trad + t_skin) / 546) ** 3
        h = hr + hc
        t_oper = (hr * trad + hc * ta) / h
        fcle = fcl / (1 + fcl * h * rcl)
        fpcl = 1 / (1 + fcl * he * recl)
        cr = fcle * h * (t_skin - t_oper)                                  # dry heat loss, C + R
        emax = np.maximum(0, fpcl * fcl * he * (sat_vapour_pressure(t_skin) - pa))
        tz = 0.1 * t_skin + 0.9 * t_core                                   # thermoregulatory signal
        kcs = 84 + 72 * np.tanh(1.3 * (tz - 37.9))                         # core-skin conductance
        h_core = np.maximum(0, kcs * (t_core - t_skin))                    # heat flow core -> skin
        sr = np.clip(0.42 + 0.44 * np.tanh(1.16 * (tz - 37.4)), 0, max_sweat_rate)  # sweat rate
        e = _three_zone_evaporation(LATENT_HEAT_SWEAT * sr / 3.6, emax)
        return h_core - (cr + e), h_core, cr + e

    # Bisection on skin temperature between dew point + 1 °C and core - 0.5 °C
    lo = dew_point_from_vp(np.maximum(pa, 1e-6)) + 1.0
    hi = np.full_like(lo, t_core - 0.5)
    degenerate = lo >= hi
    for _ in range(BISECTION_STEPS):
        mid = 0.5 * (lo + hi)
        b, _, _ = balance(mid)
        lo = np.where(b > 0, mid, lo)
        hi = np.where(b > 0, hi, mid)
    _, h_core, loss = balance(0.5 * (lo + hi))
    heat = 0.5 * (h_core + loss)

    resp = np.clip(0.0014 * (34 - ta) + 0.0173 * (5.87 - pa), 0, 0.5)    # respiratory share of M
    twl = heat / (1 - resp)
    twl = np.where(degenerate, TWL_FLOOR, twl)
    twl = np.clip(twl, TWL_FLOOR, TWL_CEILING)
    return np.where(np.isnan(ta + pa + trad + wind + p), np.nan, twl)
