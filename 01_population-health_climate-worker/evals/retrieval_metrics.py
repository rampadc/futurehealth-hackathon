"""Scoring for the retrieval golden set (evals/golden/retrieval.yaml). Pure functions, unit-tested.

Retrieval is scored on its own, before the agent sees anything: if the right page is not retrieved,
no prompt can make the answer cite it. Separating the two tells you which half to fix.

- hit@k: the share of questions with at least one expected page in the top k. The headline number.
- MRR (mean reciprocal rank): 1/rank of the first hit, averaged; 0 if no hit in the top k. Rewards
  putting the right page first, which matters because the agent reads results in order.
- binding_first: for questions whose answer is an Abu Dhabi regulation, the share where the top
  result is a binding document (tier 1). This is the property the authority boost exists for.
"""
from __future__ import annotations


def is_hit(result: dict, expected: list[dict]) -> bool:
    return any(result["doc_id"] == e["doc"] and ("pages" not in e or result["page"] in e["pages"])
               for e in expected)


def first_hit_rank(results: list[dict], expected: list[dict], k: int) -> int | None:
    """1-based rank of the first hit in the top k, or None."""
    return next((i for i, r in enumerate(results[:k], 1) if is_hit(r, expected)), None)


def score_query(results: list[dict], expected: list[dict], k: int) -> dict:
    rank = first_hit_rank(results, expected, k)
    return {"rank": rank, "hit@1": rank == 1, f"hit@{k}": rank is not None,
            "rr": 1 / rank if rank else 0.0,
            "top": [f"{r['doc_id']} p{r['page']}" for r in results[:k]]}


def summarise(scored: list[dict], k: int, binding: list[bool], top_tiers: list[int]) -> dict:
    """binding[i]: question i's expected source is tier 1; top_tiers[i]: tier of its top result."""
    n = len(scored)
    binding_tops = [t for b, t in zip(binding, top_tiers) if b]
    return {
        "hit@1": round(sum(s["hit@1"] for s in scored) / n, 3),
        f"hit@{k}": round(sum(s[f"hit@{k}"] for s in scored) / n, 3),
        "mrr": round(sum(s["rr"] for s in scored) / n, 3),
        "binding_first": round(sum(t == 1 for t in binding_tops) / len(binding_tops), 3) if binding_tops else None,
    }
