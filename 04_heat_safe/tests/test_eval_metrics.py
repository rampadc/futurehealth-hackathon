"""The eval scorer is itself code that can be wrong, so it gets tests like any other code.

A buggy scorer is worse than no scorer: it reports green while the agent regresses.

This is a test of eval metrics. Given the mock actual tool calls, and expected tool calls, 
test the scorer results is correct or not. Just a pytest for any python function.
"""
from pathlib import Path

import pytest
import yaml

from evals import metrics
from evals.metrics import any_order_match, exact_match, in_order_match, precision, recall, score

PLAN = ["lookup_job_profile", "compute_heat_stress", "optimise_schedule"]


@pytest.mark.parametrize("actual,exact,in_order,any_order", [
    (PLAN, True, True, True),
    (PLAN + ["optimise_schedule"], False, True, True),                      # extra call allowed in_order
    (["compute_heat_stress", "lookup_job_profile", "optimise_schedule"], False, False, True),
    (["lookup_job_profile", "optimise_schedule"], False, False, False),     # skipped heat stress
    ([], False, False, False),
])
def test_trajectory_matchers(actual, exact, in_order, any_order):
    assert exact_match(actual, PLAN) is exact
    assert in_order_match(actual, PLAN) is in_order
    assert any_order_match(actual, PLAN) is any_order


def test_precision_and_recall():
    assert precision(PLAN + ["get_forecast"], PLAN) == 0.75
    assert recall(["lookup_job_profile"], PLAN) == pytest.approx(1 / 3)
    assert precision([], []) == 1.0 and recall([], []) == 1.0      # refusal scenario: nothing expected
    assert precision([], PLAN) == 0.0


def fake_run(answer="Work ends 12:30.", calls=PLAN, plan_ok=True, grounded=True):
    plan = {"status": "ok", "date": "2025-08-01", "acclimatised": True,
            "invariants": {"no_work_in_midday_break": plan_ok, "no_unacclimatised_outside_low_zone": True}}
    return {
        "answer": answer,
        "tool_calls": [{"name": n, "args": {"site": "mussafah"}} for n in calls],
        "tool_outputs": [{"tool": "optimise_schedule", "args": {}, "response": plan}],
        "grounding": {"passed": grounded, "ungrounded": [] if grounded else ["44 °C"], "checked": 3},
    }


SCENARIO = {
    "trajectory": {"expected": PLAN, "match": "in_order"},
    "tool_args": [{"tool": "optimise_schedule", "args": {"site": "mussafah"}}],
    "invariants": ["grounding", "no_work_in_midday_break"],
    "answer_must_match": ["12:30"],
    "answer_must_not_match": ["(?i)safe to continue"],
}


def test_clean_run_passes():
    assert score(SCENARIO, fake_run())["passed"]


@pytest.mark.parametrize("run,failing", [
    (fake_run(grounded=False), "invariant:grounding"),
    (fake_run(plan_ok=False), "invariant:no_work_in_midday_break"),
    (fake_run(answer="It is safe to continue. 12:30"), "answer_not_match:(?i)safe to continue"),
    (fake_run(answer="no times given"), "answer_match:12:30"),
    (fake_run(calls=["lookup_job_profile", "optimise_schedule"]), "trajectory:in_order"),
])
def test_each_check_can_fail(run, failing):
    """A check that can never fail is decoration. Prove each one bites."""
    result = score(SCENARIO, run)
    assert not result["passed"]
    assert failing in [f"{c['kind']}:{c['name']}" for c in result["checks"] if not c["passed"]]


def test_tool_outputs_check_uses_resolved_values():
    run = fake_run()
    run["tool_outputs"][0]["response"]["role"] = "steel_fixer"      # tool resolved the alias
    run["tool_calls"][-1]["args"]["role"] = "steel fixer"            # model typed the alias
    spec = {"tool_outputs": [{"tool": "optimise_schedule", "fields": {"role": "steel_fixer"}}]}
    assert score(spec, run)["passed"]
    spec_wrong = {"tool_outputs": [{"tool": "optimise_schedule", "fields": {"role": "roofer"}}]}
    assert not score(spec_wrong, run)["passed"]


def test_unknown_invariant_fails_loudly():
    with pytest.raises(KeyError):
        score({**SCENARIO, "invariants": ["typo_invariant"]}, fake_run())


def test_golden_file_is_valid():
    """Catch YAML mistakes before paying for model calls."""
    scenarios = yaml.safe_load((Path(metrics.__file__).parent / "golden" / "supervisor.yaml").read_text())
    ids = [s["id"] for s in scenarios]
    assert len(ids) == len(set(ids)), "duplicate scenario ids"
    for s in scenarios:
        assert {"id", "why", "today", "prompt", "trajectory"} <= set(s), s["id"]
        assert s["trajectory"]["match"] in metrics.MATCHERS, s["id"]
        assert set(s.get("invariants", [])) <= set(metrics.INVARIANTS), s["id"]


@pytest.mark.parametrize("answer,flagged", [
    ("It is safe to continue working in the afternoon.", True),
    ("Safe to continue after 15:00.", True),
    ("It is not safe to continue working continuously.", False),
    ("It isn't safe to continue without rest.", False),
    ("Do not add hours, as it is unsafe to continue working.", False),   # failed a correct answer
])
def test_safe_to_continue_pattern_ignores_negation(answer, flagged):
    """Regexes in the golden file are code too. This one failed correct answers twice on 5 Nov."""
    import re
    scenarios = yaml.safe_load((Path(metrics.__file__).parent / "golden" / "supervisor.yaml").read_text())
    exit_test = next(s for s in scenarios if s["id"] == "exit_roofing_plan")
    pattern = next(p for p in exit_test["answer_must_not_match"] if "safe to continue" in p)
    assert (re.search(pattern, answer) is not None) is flagged


def _out(tool, status, msg=""):
    return {"tool": tool, "args": {}, "response": {"status": status, "message": msg}}


def test_recovered_tool_error_passes_but_is_reported():
    run = {"tool_outputs": [_out("lookup_job_profile", "error", "unknown role 'concrete pourer'"),
                            _out("lookup_job_profile", "ok")]}
    passed, detail = metrics.INVARIANTS["no_tool_errors"](run)
    assert passed and "recovered" in detail and "concrete pourer" in detail


def test_unrecovered_tool_error_fails():
    run = {"tool_outputs": [_out("lookup_job_profile", "ok"),
                            _out("compute_heat_stress", "error", "no weather data")]}
    passed, detail = metrics.INVARIANTS["no_tool_errors"](run)
    assert not passed and "no weather data" in detail
