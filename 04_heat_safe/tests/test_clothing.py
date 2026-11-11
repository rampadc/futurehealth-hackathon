"""Clothing ensembles (rules.CLOTHING, 7 Nov 2026): sources, ordering and the effect on the replay day."""
import numpy as np
import pytest

from heat_safe import rules, twl
from heat_safe.forecast import get_replay
from heat_safe.heat_stress import compute_heat_stress


def test_work_wear_is_the_twl_baseline_so_existing_results_do_not_change():
    assert rules.clothing(rules.DEFAULT_CLOTHING).icl == twl.DEFAULT_ICL


@pytest.mark.parametrize("name,niosh_clo,icl", [
    ("cloth_coveralls", 0.80, 0.65),            # NIOSH Table 3-1: shirt, coveralls
    ("coveralls_over_work_wear", 1.1, 0.95),    # NIOSH Table 3-1: shirt, pants, coveralls
])
def test_insulation_is_the_niosh_difference_added_to_our_baseline(name, niosh_clo, icl):
    c = rules.clothing(name)
    assert c.niosh_clo == niosh_clo and c.icl == icl
    assert c.icl - twl.DEFAULT_ICL == pytest.approx(niosh_clo - rules.NIOSH_WORK_WEAR_CLO)


def test_vapour_barrier_is_outside_the_twl_model():
    c = rules.clothing("vapour_barrier")
    assert not c.in_twl_model and c.icl is None and c.wbgt_adjust_c == 11.0


def test_more_clothing_never_raises_twl():
    """Monotonic: a heavier ensemble can only lower the work limit (hot, humid, sunny hour)."""
    ta = np.array([40.0])
    pa = 0.4 * twl.sat_vapour_pressure(ta)
    in_model = sorted((c for c in rules.CLOTHING.values() if c.in_twl_model), key=lambda c: c.icl)
    limits = [float(twl.thermal_work_limit(ta, pa, ta + 15, np.array([1.0]), np.array([100.0]), icl=c.icl)[0])
              for c in in_model]
    assert limits == sorted(limits, reverse=True) and limits[0] > limits[-1]


def test_unknown_clothing_raises():
    with pytest.raises(ValueError, match="known"):
        rules.clothing("tyvek")


@pytest.fixture(scope="module")
def mussafah_0500():
    w = get_replay("2025-08-01")
    w = w[w.site == "mussafah"]
    return {name: compute_heat_stress(w, icl=c.icl).query("time.dt.hour == 5").iloc[0]
            for name, c in rules.CLOTHING.items() if c.in_twl_model}


def test_replay_day_0500_same_air_three_zones(mussafah_0500):
    """The compute_worker_risk walkthrough (README_WORKER_RISK.md): at 05:00 on 1 Aug 2025 work wear is
    Low (144), cloth coveralls just cross into Medium (139), coveralls over work wear are High (112)."""
    got = {k: (round(r.twl_wm2), r.twl_zone) for k, r in mussafah_0500.items()}
    assert got == {"work_wear": (144, "low"), "cloth_coveralls": (139, "medium"),
                   "coveralls_over_work_wear": (112, "high")}
