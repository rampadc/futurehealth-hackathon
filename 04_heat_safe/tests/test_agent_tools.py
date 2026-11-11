"""agent_tools wrappers: same names as the core, no rules of their own, errors as dicts."""
import ast
import inspect

import pytest

from heat_safe import agent_tools, forecast, guidance, heat_stress, job_profile, schedule

SOURCE = ast.parse(inspect.getsource(agent_tools))

# rules.* the wrappers may read: citations, version and values shown for display only
ALLOWED_RULES = {"ADOSH_TG", "ADOSH_COP", "MOHRE", "RULES_VERSION",
                 "MIDDAY_BREAK_START", "MIDDAY_BREAK_END", "TWL_HIGH_RISK_BELOW", "TWL_LOW_RISK_FROM"}
# Numeric literals allowed: indexes and rounding digits, default shift hours (5, 19),
# the 16-day forecast horizon and the weather cache size (32)
ALLOWED_NUMBERS = {0, 1, 5, 16, 19, 32}


@pytest.mark.parametrize("name,core", [
    ("get_forecast", forecast), ("compute_heat_stress", heat_stress),
    ("lookup_job_profile", job_profile), ("optimise_schedule", schedule), ("search_guidance", guidance),
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
