"""TWL port vs Brake & Bates (2002) Table 1, p.181 (published reference values).

Each case: dry bulb, aspirated wet bulb, mean radiant temp (°C), wind (m/s), pressure (kPa),
clothing insulation (clo), clothing permeability, expected TWL (W/m²), tolerance (W/m²).
Tolerance is 5 W/m², or 14 W/m² for four extreme low-humidity cases at the edge of the
physiological curve fits (same tolerances as the reference R implementation's tests).
"""
import numpy as np
import pytest

from heat_safe.twl import sat_vapour_pressure, thermal_work_limit, wind_10m_to_body

TABLE1 = [
    (34, 24, 36, 0.2, 101, 0.45, 0.45, 175, 5),
    (34, 26, 36, 0.2, 101, 0.45, 0.45, 157, 5),
    (34, 28, 36, 0.2, 101, 0.45, 0.45, 136, 5),
    (34, 30, 36, 0.2, 101, 0.45, 0.45, 114, 5),
    (36, 24, 38, 0.2, 101, 0.45, 0.45, 170, 5),
    (36, 26, 38, 0.2, 101, 0.45, 0.45, 151, 5),
    (36, 28, 38, 0.2, 101, 0.45, 0.45, 131, 5),
    (36, 30, 38, 0.2, 101, 0.45, 0.45, 109, 5),
    (38, 24, 40, 0.2, 101, 0.45, 0.45, 164, 5),
    (38, 26, 40, 0.2, 101, 0.45, 0.45, 145, 5),
    (38, 28, 40, 0.2, 101, 0.45, 0.45, 125, 5),
    (38, 30, 40, 0.2, 101, 0.45, 0.45, 103, 5),
    (40, 24, 42, 0.2, 101, 0.45, 0.45, 158, 5),
    (40, 26, 42, 0.2, 101, 0.45, 0.45, 140, 5),
    (40, 28, 42, 0.2, 101, 0.45, 0.45, 120, 5),
    (42, 24, 44, 0.2, 101, 0.45, 0.45, 152, 5),
    (42, 26, 44, 0.2, 101, 0.45, 0.45, 134, 5),
    (42, 28, 44, 0.2, 101, 0.45, 0.45, 114, 5),
    (34, 24, 34, 0.5, 115, 0.69, 0.4, 181, 5),
    (34, 26, 34, 0.5, 115, 0.69, 0.4, 161, 5),
    (34, 28, 34, 0.5, 115, 0.69, 0.4, 140, 5),
    (34, 30, 34, 0.5, 115, 0.69, 0.4, 118, 5),
    (36, 24, 36, 0.5, 115, 0.69, 0.4, 176, 5),
    (36, 26, 36, 0.5, 115, 0.69, 0.4, 156, 5),
    (36, 28, 36, 0.5, 115, 0.69, 0.4, 136, 5),
    (36, 30, 36, 0.5, 115, 0.69, 0.4, 113, 5),
    (38, 24, 38, 0.5, 115, 0.69, 0.4, 171, 5),
    (38, 26, 38, 0.5, 115, 0.69, 0.4, 152, 5),
    (38, 28, 38, 0.5, 115, 0.69, 0.4, 131, 5),
    (38, 30, 38, 0.5, 115, 0.69, 0.4, 109, 5),
    (40, 24, 40, 0.5, 115, 0.69, 0.4, 166, 5),
    (40, 26, 40, 0.5, 115, 0.69, 0.4, 147, 5),
    (40, 28, 40, 0.5, 115, 0.69, 0.4, 126, 5),
    (40, 30, 40, 0.5, 115, 0.69, 0.4, 104, 5),
    (42, 24, 42, 0.5, 115, 0.69, 0.4, 161, 5),
    (42, 26, 42, 0.5, 115, 0.69, 0.4, 142, 5),
    (42, 28, 42, 0.5, 115, 0.69, 0.4, 122, 5),
    (34, 24, 37, 1.5, 80, 0.35, 0.45, 288, 5),
    (34, 26, 37, 1.5, 80, 0.35, 0.45, 260, 5),
    (34, 28, 37, 1.5, 80, 0.35, 0.45, 229, 5),
    (34, 30, 37, 1.5, 80, 0.35, 0.45, 193, 5),
    (34, 32, 37, 1.5, 80, 0.35, 0.45, 154, 5),
    (36, 24, 39, 1.5, 80, 0.35, 0.45, 282, 5),
    (36, 26, 39, 1.5, 80, 0.35, 0.45, 254, 5),
    (36, 28, 39, 1.5, 80, 0.35, 0.45, 222, 5),
    (36, 30, 39, 1.5, 80, 0.35, 0.45, 187, 5),
    (36, 32, 39, 1.5, 80, 0.35, 0.45, 148, 5),
    (38, 24, 41, 1.5, 80, 0.35, 0.45, 276, 14),
    (38, 26, 41, 1.5, 80, 0.35, 0.45, 248, 5),
    (38, 28, 41, 1.5, 80, 0.35, 0.45, 216, 5),
    (38, 30, 41, 1.5, 80, 0.35, 0.45, 181, 5),
    (38, 32, 41, 1.5, 80, 0.35, 0.45, 141, 5),
    (40, 24, 43, 1.5, 80, 0.35, 0.45, 270, 14),
    (40, 26, 43, 1.5, 80, 0.35, 0.45, 242, 5),
    (40, 28, 43, 1.5, 80, 0.35, 0.45, 210, 5),
    (40, 30, 43, 1.5, 80, 0.35, 0.45, 174, 5),
    (40, 32, 43, 1.5, 80, 0.35, 0.45, 135, 5),
    (42, 24, 45, 1.5, 80, 0.35, 0.45, 264, 14),
    (42, 26, 45, 1.5, 80, 0.35, 0.45, 235, 14),
    (42, 28, 45, 1.5, 80, 0.35, 0.45, 203, 5),
    (42, 30, 45, 1.5, 80, 0.35, 0.45, 167, 5),
    (42, 32, 45, 1.5, 80, 0.35, 0.45, 128, 5),
    (40, 30, 40, 0.2, 100, 0.35, 0.45, 110, 5),
]


def vapour_pressure_from_wet_bulb(db, wb, p_kpa):
    """Aspirated psychrometer equation."""
    return max(0.0, float(sat_vapour_pressure(wb)) - 6.6e-4 * p_kpa * (db - wb))


@pytest.mark.parametrize("db,wb,mrt,wind,p,icl,perm,expected,tol", TABLE1)
def test_matches_brake_bates_table1(db, wb, mrt, wind, p, icl, perm, expected, tol):
    pa = vapour_pressure_from_wet_bulb(db, wb, p)
    got = float(thermal_work_limit(db, pa, mrt, wind, p, icl=icl, icl_perm=perm))
    assert abs(got - expected) <= tol, f"TWL {got:.1f} vs published {expected}"


def test_vectorised_matches_scalar():
    rows = TABLE1[:10]
    pa = [vapour_pressure_from_wet_bulb(r[0], r[1], r[4]) for r in rows]
    cols = np.array([r[:5] for r in rows], dtype=float).T
    vec = thermal_work_limit(cols[0], pa, cols[2], cols[3], cols[4], icl=0.45, icl_perm=0.45)
    one = [float(thermal_work_limit(r[0], a, r[2], r[3], r[4], icl=0.45, icl_perm=0.45)) for r, a in zip(rows, pa)]
    np.testing.assert_allclose(vec, one)


def test_hotter_more_humid_or_more_radiant_lowers_twl():
    base = float(thermal_work_limit(36, 2.5, 38, 1.0))
    assert thermal_work_limit(40, 2.5, 38, 1.0) < base
    assert thermal_work_limit(36, 3.5, 38, 1.0) < base
    assert thermal_work_limit(36, 2.5, 50, 1.0) < base


def test_missing_input_gives_nan_not_a_safe_value():
    assert np.isnan(thermal_work_limit(np.nan, 2.5, 38, 1.0))


def test_wind_height_factor():
    assert float(wind_10m_to_body(3.0)) == pytest.approx(2.0, abs=0.01)
