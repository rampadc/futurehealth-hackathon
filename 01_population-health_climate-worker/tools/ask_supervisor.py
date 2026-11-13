"""Ask the supervisor agent one question from the terminal and print the answer, tool calls and grounding.

    HEAT_SAFE_TODAY=2025-07-31 uv run --env-file .env python tools/ask_supervisor.py "Plan tomorrow for a roofing crew at site A"

HEAT_SAFE_TODAY pins "today" for replay demos; HEAT_SAFE_TELEMETRY=0 turns BigQuery logging off.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agents"))

from supervisor.session import ask  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("question", nargs="?", default="Plan tomorrow for a roofing crew at site A")
    result = asyncio.run(ask(ap.parse_args().question))
    print(result["answer"])
    print("\n--- tool calls:", [f"{c['name']}({c['args']})" for c in result["tool_calls"]])
    print("--- grounding:", result["grounding"])
    print(f"--- tokens: {result['tokens']}  latency: {result['latency_s']} s")


if __name__ == "__main__":
    main()
