"""compute_heat_stress and lookup_job_profile on synthetic and replayed weather."""
import numpy as np
import pandas as pd
import pytest

from heat_safe.forecast import CACHE_DIR, get_replay
from heat_safe.heat_stress import compute_heat_stress, daily_summary
from heat_safe.job_profile import lookup_job_profile


def weather(hours=24, day="2025-08-01", **overrides):
    times = pd.date_range(day, periods=hours, freq="h", tz="Asia/Dubai")
    base = dict(
        site="test", latitude=24.35, longitude=54.50, time=times,
        temperature_2m=30.0, relative_humidity_2m=40.0, surface_pressure=1005.0, wind_speed_10m=10.0,
        shortwave_radiation=0.0, direct_radiation=0.0, diffuse_radiation=0.0,
    )
    base.update(overrides)
    return pd.DataFrame(base)


def test_mild_night_is_green():
    hs = compute_heat_stress(weather(hours=4, temperature_2m=25.0, relative_humidity_2m=40.0))
    assert set(hs["band"]) == {"green"}
    assert (hs["data_issue"] == "").all()


def test_missing_input_is_never_safe():
    w = weather(hours=4, temperature_2m=25.0)
    w.loc[1, "temperature_2m"] = np.nan
    hs = compute_heat_stress(w)
    assert hs.loc[1, "band"] == "red"
    assert hs.loc[1, "data_issue"].startswith("missing weather input")
    assert hs.loc[0, "band"] == "green"


def test_withdrawal_limit_forces_high_zone():
    hs = compute_heat_stress(weather(hours=1, temperature_2m=45.0, relative_humidity_2m=10.0))
    assert hs.loc[0, "twl_zone"] == "high"
    assert "dry bulb" in hs.loc[0, "withdrawal_limit"]


def test_hotter_never_lowers_risk():
    cool = compute_heat_stress(weather(hours=1, temperature_2m=32.0, relative_humidity_2m=50.0))
    hot = compute_heat_stress(weather(hours=1, temperature_2m=38.0, relative_humidity_2m=50.0))
    assert hot.loc[0, "twl_wm2"] < cool.loc[0, "twl_wm2"]


def test_shade_is_never_worse_than_sun():
    hs = compute_heat_stress(weather(hours=1, day="2025-08-01 10:00", temperature_2m=40.0,
                                     shortwave_radiation=800.0, direct_radiation=650.0, diffuse_radiation=150.0))
    assert hs.loc[0, "twl_shade_wm2"] >= hs.loc[0, "twl_wm2"]


def test_no_outdoor_work_minutes_in_midday_break():
    hs = compute_heat_stress(weather(hours=24, temperature_2m=25.0))
    by_hour = hs.set_index(pd.DatetimeIndex(hs["time"]).hour)
    assert by_hour.loc[13, "work_minutes_light"] == 0 and by_hour.loc[14, "work_minutes_heavy"] == 0
    assert by_hour.loc[12, "midday_break_minutes"] == 30


def test_no_midday_break_out_of_season():
    hs = compute_heat_stress(weather(hours=24, day="2025-11-20", temperature_2m=25.0))
    assert (hs["midday_break_minutes"] == 0).all()


@pytest.mark.skipif(not (CACHE_DIR / "era5_replay_2025-08-01.csv").exists(), reason="run tools/download_data.py")
def test_replay_day_mussafah():
    hs = compute_heat_stress(get_replay("2025-08-01"))
    s = daily_summary(hs).set_index("site").loc["mussafah"]
    assert s["worst_band"] == "red"
    assert s["midday_break_applies"] and s["heat_programme_required"]
    assert s["max_temperature_c"] == pytest.approx(45.0, abs=0.1)
    assert s["data_issues"] == 0


def test_job_profiles():
    roofer = lookup_job_profile("Roofer")
    assert roofer.work_intensity == "heavy" and roofer.iso8996_class == 3
    assert lookup_job_profile("rebar worker").role == "steel_fixer"
    assert lookup_job_profile("driver").work_intensity == "light"
    with pytest.raises(KeyError):
        lookup_job_profile("astronaut")
