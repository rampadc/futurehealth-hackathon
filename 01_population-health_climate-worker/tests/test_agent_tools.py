"""agent_tools wrappers: same names as the core, no rules of their own, errors as dicts."""
import ast
import inspect

import pytest

from heat_safe import agent_tools, forecast, guidance, heat_stress, job_profile, schedule, sensor

SOURCE = ast.parse(inspect.getsource(agent_tools))

# rules.* the wrappers may read: citations, version and values shown for display only
ALLOWED_RULES = {"ADOSH_TG", "ADOSH_COP", "MOHRE", "RULES_VERSION", "display_twl",
                 "MIDDAY_BREAK_START", "MIDDAY_BREAK_END", "TWL_HIGH_RISK_BELOW", "TWL_LOW_RISK_FROM"}
# Numeric literals allowed: indexes and rounding digits, default shift hours (5, 19),
# the 16-day forecast horizon and the weather cache size (32)
ALLOWED_NUMBERS = {0, 1, 5, 16, 19, 32}


@pytest.mark.parametrize("name,core", [
    ("get_forecast", forecast), ("compute_heat_stress", heat_stress),
    ("lookup_job_profile", job_profile), ("optimise_schedule", schedule), ("search_guidance", guidance),
    ("get_site_sensor", sensor),
])
def test_each_tool_wraps_the_same_named_core_function(name, core):
    assert name in [f.__name__ for f in agent_tools.SUPERVISOR_TOOLS]
    assert callable(getattr(core, name))


def test_wrappers_only_read_display_and_citation_rules():
    used = {n.attr for n in ast.walk(SOURCE)
            if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "rules"}
    assert used <= ALLOWED_RULES, f"move this logic into the core: {used - ALLOWED_RULES}"


def test_wrappers_hold_no_threshold_numbers():
    numbers = {n.value for n in ast.walk(SOURCE)
               if isinstance(n, ast.Constant) and type(n.value) in (int, float)}
    assert numbers <= ALLOWED_NUMBERS, f"thresholds belong in rules.py: {numbers - ALLOWED_NUMBERS}"


def test_wrappers_do_not_import_rule_constants_directly():
    for node in ast.walk(SOURCE):
        if isinstance(node, ast.ImportFrom) and node.module == "heat_safe.rules":
            pytest.fail("import the rules module, not names from it, so the allowlist check sees every use")


@pytest.mark.parametrize("call", [
    lambda: agent_tools.compute_heat_stress("nowhere", "2025-08-01"),
    lambda: agent_tools.get_forecast("mussafah", "not-a-date"),
    lambda: agent_tools.lookup_job_profile("astronaut"),
    lambda: agent_tools.optimise_schedule("mussafah", "2099-01-01", "roofer", 4),
    lambda: agent_tools.search_guidance("   "),  # rejected before any cloud call
])
def test_errors_come_back_as_dicts(call):
    r = call()
    assert r["status"] == "error" and r["message"]


@pytest.mark.parametrize("role", ["concrete worker", "Concrete Pourer", "concrete-pourer"])
def test_concrete_roles_resolve_to_labourer(role):
    r = agent_tools.lookup_job_profile(role)
    assert r["status"] == "ok" and r["role"] == "labourer" and r["work_intensity"] == "heavy"


# --- citation links --------------------------------------------------------------------------------


def test_search_guidance_returns_a_url_for_each_result(monkeypatch):
    hit = {"cite": "ADOSH-SF CoP 11.0, p. 5", "url": "https://www.adphc.gov.ae/x.pdf#page=5", "authority": "a",
           "section": "s", "text": "t", "score": 0.8, "page": 5, "doc_id": "adosh_cop_11"}
    monkeypatch.setattr(agent_tools, "_search", lambda q, top_k: [hit])
    (result,) = agent_tools.search_guidance("training")["results"]
    assert result["url"] == hit["url"] and result["cite"] == hit["cite"]


def test_planning_citations_carry_links_and_keep_their_text():
    from heat_safe import rules
    (tg, cop, mohre) = agent_tools._linked([rules.ADOSH_TG, rules.ADOSH_COP, rules.MOHRE])
    assert tg["cite"] == rules.ADOSH_TG and tg["url"].endswith("Safety-in-the-Heat--Eng.pdf#page=5")
    assert cop["url"].endswith(".pdf") and "#page" not in cop["url"]  # no single page for the whole code
    assert mohre["url"].startswith("https://www.wam.ae/en/article/")
    (src,) = agent_tools._linked(["ADOSH-SF CoP 11.0, p. 7"])  # an acclimatisation source
    assert src["url"].endswith("v31-English.pdf#page=7")
    assert agent_tools._linked(["something uncited"])[0]["url"] is None


# --- mid-shift re-plan and the site sensor (replay day, cached weather: no network) ----------------------

def test_replan_assumes_the_original_plan_until_now_and_says_so():
    kw = dict(site="mussafah", date="2025-08-01", role="steel fixer", work_hours_needed=5, shade_available=True)
    original = agent_tools.optimise_schedule(**kw)
    r = agent_tools.optimise_schedule(**kw, replan_from="09:20", use_site_sensor=True)
    assert r["status"] == "ok" and r["replanned_from"] == "10:00"  # the part-gone 09:00 hour is the monitor's
    assert r["already_worked_minutes"] == schedule.minutes_scheduled_before(original, 10)
    assert r["already_worked_basis"].startswith("assumed") and r["site_sensor"]["synthetic"]
    given = agent_tools.optimise_schedule(**kw, replan_from="09:20", already_worked_minutes=60)
    assert given["already_worked_minutes"] == 60 and given["already_worked_basis"] == "given by the supervisor"


def test_shade_sensor_does_not_change_a_sun_plan():
    r = agent_tools.optimise_schedule("mussafah", "2025-08-01", "roofer", 5, replan_from="09:00", use_site_sensor=True)
    assert "sun-zone hours are unchanged" in r["site_sensor"]["note"]


@pytest.mark.parametrize("call", [
    lambda: agent_tools.optimise_schedule("mussafah", "2025-08-01", "roofer", 5, use_site_sensor=True),
    lambda: agent_tools.get_site_sensor("mussafah", "2025-08-01", "09:00", role="roofer"),  # hours missing
    lambda: agent_tools.get_site_sensor("mussafah", "2025-08-01", "9am"),
])
def test_sensor_misuse_comes_back_as_an_error_dict(call):
    assert call()["status"] == "error"



def test_heat_stress_hours_carry_humidity_and_wet_bulb():
    """The conditions screens explain TWL with humidity and wet bulb, so every hour carries both."""
    r = agent_tools.compute_heat_stress("mussafah", "2025-08-04")
    assert r["status"] == "ok"
    nine = next(h for h in r["hourly"] if h["hour"] == "09:00")
    assert isinstance(nine["relative_humidity_pct"], int) and 0 <= nine["relative_humidity_pct"] <= 100
    assert 0 < nine["wet_bulb_c"] < nine["temperature_c"]
