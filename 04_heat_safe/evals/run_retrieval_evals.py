"""Score search_guidance against the retrieval golden set, for several authority-boost settings.

    uv run --env-file .env python evals/run_retrieval_evals.py           # compare boost settings
    uv run --env-file .env python evals/run_retrieval_evals.py -v        # plus per-question top 5

Cheap: one query embedding and one BigQuery search per question. Every boost setting re-ranks the
same candidates locally, so the comparison is exact (same candidates, only the ranking differs) and
costs nothing extra. This is how AUTHORITY_BOOST in heat_safe/guidance.py was chosen.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from evals.retrieval_metrics import score_query, summarise  # noqa: E402
from heat_safe.corpus import DOCS_BY_ID  # noqa: E402
from heat_safe.guidance import AUTHORITY_BOOST, CANDIDATES, embed, rerank, vector_search  # noqa: E402

GOLDEN = ROOT / "evals" / "golden" / "retrieval.yaml"
K = 5
SETTINGS = {
    "similarity only": {},
    "boost 0.02 / 0.01": {1: 0.02, 2: 0.01},
    "boost 0.05 / 0.03 (current)": AUTHORITY_BOOST,
    "boost 0.10 / 0.05": {1: 0.10, 2: 0.05},
    "tier 1 only (filter)": None,  # the alternative to boosting: hard filter, see below
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    questions = yaml.safe_load(GOLDEN.read_text())
    vectors = embed([q["query"] for q in questions], "RETRIEVAL_QUERY")
    candidates = [vector_search(v, CANDIDATES) for v in vectors]
    binding = [all(DOCS_BY_ID[e["doc"]].tier == 1 for e in q["expected"]) for q in questions]

    print(f"{len(questions)} questions, {CANDIDATES} candidates each, scored at k={K}\n")
    print(f"{'setting':30s} hit@1   hit@{K}   MRR    binding_first")
    worst, details = {}, []
    for name, boost in SETTINGS.items():
        scored, tops = [], []
        for q, cands in zip(questions, candidates):
            hits = [dict(c) for c in cands]
            if boost is None:
                hits = [h for h in hits if h["tier"] == 1]
            ranked = rerank(hits, boost or {}, K)
            s = score_query(ranked, q["expected"], K)
            scored.append(s)
            tops.append(ranked[0]["tier"] if ranked else 0)
            if boost is AUTHORITY_BOOST:
                details.append(f"  {q['id']:32s} rank={s['rank']}  {s['top']}")
        m = summarise(scored, K, binding, tops)
        print(f"{name:30s} {m['hit@1']:<7} {m[f'hit@{K}']:<7} {m['mrr']:<6} {m['binding_first']}")
        worst[name] = [q["id"] for q, s in zip(questions, scored) if not s[f"hit@{K}"]]
    if args.verbose:
        print("\nper question, current boost (rank of first expected page; None = not in top 5):")
        print("\n".join(details))
    print("\nmissed in the top 5:")
    for name, ids in worst.items():
        print(f"  {name:30s} {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
