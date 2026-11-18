"""Create (or replace) the observability views in BigQuery: uv run --env-file ../.env python observability/create_views.py

Runs each statement in views.sql, then prints a row count per view as a smoke test.
"""
from pathlib import Path

from google.cloud import bigquery

PROJECT, LOCATION = "future-health-513202", "me-central1"
SQL = Path(__file__).with_name("views.sql").read_text()


def statements(sql: str) -> list[str]:
    body = "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("--"))
    return [s.strip() for s in body.split(";") if s.strip()]


def main() -> None:
    client = bigquery.Client(project=PROJECT, location=LOCATION)
    for stmt in statements(SQL):
        client.query(stmt).result()
        print("ok  ", stmt.split("`")[1])
    for view in ("v_turns", "v_guardrail_decisions", "v_tool_calls", "v_redteam"):
        n = next(iter(client.query(f"SELECT COUNT(*) n FROM `{PROJECT}.telemetry.{view}`").result()))["n"]
        print(f"{view:24s}{n} rows")


if __name__ == "__main__":
    main()
