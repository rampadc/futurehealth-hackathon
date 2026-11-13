"""Run the golden scenarios against the supervisor agent, score them, and log results to BigQuery.

    uv run --env-file .env python evals/run_evals.py                      # all scenarios, once each
    uv run --env-file .env python evals/run_evals.py -k new_starter -n 3  # one scenario, three repeats
    uv run --env-file .env python evals/run_evals.py --no-bq              # local only (JSON in evals/results/)

Exit code is 1 if any scenario run fails, so this can gate CI or a deploy.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agents"))
sys.path.insert(0, str(ROOT))

from evals.metrics import score  # noqa: E402
from heat_safe.rules import RULES_VERSION  # noqa: E402

GOLDEN = ROOT / "evals" / "golden" / "supervisor.yaml"
RESULTS_DIR = ROOT / "evals" / "results"
PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "future-health-513202")
BQ_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "me-central1")
BQ_TABLE = f"{PROJECT}.telemetry.eval_results"

# An explicit schema (rather than autodetect) is a contract: the Trust tab and any later SQL depend
# on these names and types, and a typo in the runner should fail the load, not create a new column.
BQ_SCHEMA = [
    ("run_id", "STRING"), ("started_at", "TIMESTAMP"), ("suite", "STRING"), ("scenario_id", "STRING"),
    ("repeat", "INTEGER"), ("passed", "BOOLEAN"), ("failed_checks", "STRING"), ("checks_json", "STRING"),
    ("trajectory_exact", "BOOLEAN"), ("trajectory_in_order", "BOOLEAN"),
    ("trajectory_precision", "FLOAT"), ("trajectory_recall", "FLOAT"),
    ("tool_calls_json", "STRING"), ("grounding_checked", "INTEGER"), ("grounding_ungrounded", "STRING"),
    ("prompt_tokens", "INTEGER"), ("output_tokens", "INTEGER"), ("thinking_tokens", "INTEGER"),
    ("latency_s", "FLOAT"), ("model", "STRING"), ("rules_version", "STRING"),
    ("git_sha", "STRING"), ("git_dirty", "BOOLEAN"), ("session_id", "STRING"),
    ("prompt", "STRING"), ("answer", "STRING"),
]


def git_state() -> tuple[str, bool]:
    """Which code produced this result. Without it, a pass-rate change can't be traced to a change."""
    def run(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return run("rev-parse", "--short", "HEAD") or "unknown", bool(run("status", "--porcelain"))


async def run_scenario(scenario: dict, repeat: int) -> tuple[dict, dict]:
    # "today" is read by the agent's instruction on every model call, so set it before asking
    os.environ["HEAT_SAFE_TODAY"] = str(scenario["today"])
    from supervisor.session import ask  # imported late: the agent module reads env at import
    run = await ask(scenario["prompt"].strip(), user_id="eval-runner")
    return run, score(scenario, run)


def to_row(run_id, started_at, scenario, repeat, run, result, git_sha, dirty) -> dict:
    failed = [f"{c['kind']}:{c['name']}" for c in result["checks"] if not c["passed"]]
    return {
        "run_id": run_id, "started_at": started_at, "suite": "supervisor", "scenario_id": scenario["id"],
        "repeat": repeat, "passed": result["passed"], "failed_checks": ", ".join(failed),
        "checks_json": json.dumps(result["checks"]),
        "trajectory_exact": result["trajectory_exact"], "trajectory_in_order": result["trajectory_in_order"],
        "trajectory_precision": result["trajectory_precision"], "trajectory_recall": result["trajectory_recall"],
        "tool_calls_json": json.dumps(run["tool_calls"]),
        "grounding_checked": run["grounding"]["checked"],
        "grounding_ungrounded": ", ".join(run["grounding"]["ungrounded"]),
        "prompt_tokens": run["tokens"]["prompt"], "output_tokens": run["tokens"]["output"],
        "thinking_tokens": run["tokens"]["thinking"], "latency_s": run["latency_s"],
        "model": run["model"], "rules_version": RULES_VERSION, "git_sha": git_sha, "git_dirty": dirty,
        "session_id": run["session_id"], "prompt": scenario["prompt"].strip(), "answer": run["answer"],
    }


def write_bigquery(rows: list[dict]) -> None:
    from google.cloud import bigquery

    client = bigquery.Client(project=PROJECT, location=BQ_LOCATION)
    schema = [bigquery.SchemaField(n, t) for n, t in BQ_SCHEMA]
    table = bigquery.Table(BQ_TABLE, schema=schema)
    table.time_partitioning = bigquery.TimePartitioning(field="started_at")  # cheap "last 30 days" queries
    client.create_table(table, exists_ok=True)
    # A load job, not streaming inserts: free, atomic per batch, and rows are queryable immediately
    job = client.load_table_from_json(rows, BQ_TABLE, job_config=bigquery.LoadJobConfig(
        schema=schema, write_disposition="WRITE_APPEND"))
    job.result()
    print(f"\n{len(rows)} rows appended to {BQ_TABLE}")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-k", help="only scenarios whose id contains this text")
    ap.add_argument("-n", "--repeats", type=int, default=1, help="runs per scenario (LLMs are not deterministic)")
    ap.add_argument("--no-bq", action="store_true", help="do not write to BigQuery")
    args = ap.parse_args()

    scenarios = [s for s in yaml.safe_load(GOLDEN.read_text()) if not args.k or args.k in s["id"]]
    if not scenarios:
        print(f"no scenario matches {args.k!r}")
        return 2
    run_id = f"eval-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
    started_at = datetime.now(timezone.utc).isoformat()
    git_sha, dirty = git_state()
    print(f"{run_id}  git {git_sha}{' (dirty)' if dirty else ''}  rules {RULES_VERSION}\n")

    rows = []
    # Sequential on purpose: easier to read, and it avoids rate-limit noise looking like agent failures
    for s in scenarios:
        for r in range(1, args.repeats + 1):
            run, result = await run_scenario(s, r)
            rows.append(to_row(run_id, started_at, s, r, run, result, git_sha, dirty))
            mark = "PASS" if result["passed"] else "FAIL"
            print(f"{mark}  {s['id']} #{r}  tools={[c['name'] for c in run['tool_calls']]}  "
                  f"P={result['trajectory_precision']} R={result['trajectory_recall']}  "
                  f"tokens={sum(run['tokens'].values())}  {run['latency_s']}s")
            for c in result["checks"]:
                if not c["passed"]:
                    print(f"      x {c['kind']}: {c['name']}  {c['detail']}")

    # Summary: per-scenario pass rate, and pass^k (every repeat passed) which is what safety needs
    print("\nscenario                          pass rate   all repeats passed")
    for s in scenarios:
        mine = [r["passed"] for r in rows if r["scenario_id"] == s["id"]]
        print(f"{s['id']:34s}{sum(mine)}/{len(mine):<10d}{'yes' if all(mine) else 'NO'}")
    total = sum(r["passed"] for r in rows)
    print(f"\noverall {total}/{len(rows)} runs passed")

    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / f"{run_id}.json").write_text(json.dumps(rows, indent=2))
    if not args.no_bq:
        write_bigquery(rows)
    return 0 if total == len(rows) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
