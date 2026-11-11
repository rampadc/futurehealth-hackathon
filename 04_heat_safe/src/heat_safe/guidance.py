"""Guidance search (RAG retrieval): embed the question, find the nearest chunks in BigQuery, rank by authority.

    search_guidance("what training must supervisors have for heat?")
    -> [{"cite": "ADOSH-SF CoP 11.0, p. 5", "authority": "Binding regulation for an Abu Dhabi site (ADOSH-SF, MoHRE)", "text": ...}, ...]

Index: tools/build_corpus.py writes `vectors.guidance_chunks` (one row per chunk from heat_safe.corpus).
Embeddings and data stay in me-central1; only the model's generation call goes to the global endpoint.
Design, reading order and learning notes: src/heat_safe/README_RAG.md.
"""
from __future__ import annotations

import math
import os
import time
from functools import lru_cache

from heat_safe.corpus import AUTHORITY, DOCS_BY_ID

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "heat-safe-example")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "me-central1")
TABLE = f"{PROJECT}.vectors.guidance_chunks"

EMBED_MODEL = "gemini-embedding-001"
# 768 of the model's 3072 dimensions (Matryoshka training keeps the leading dimensions meaningful):
# a quarter of the storage and distance maths, for a small loss in quality. Truncated vectors are
# not unit length, so they are normalised before storage and search.
EMBED_DIM = 768
EMBED_BATCH = 50

# Similarity alone ranks by topic, not by who has the authority to say it. 86% of chunks come from
# international guidance, so a binding ADOSH-SF page can lose to a NIOSH page that is merely worded
# closer to the question. Retrieval fetches CANDIDATES by similarity, then adds this bonus by tier.
# The values were chosen with the retrieval eval (evals/run_retrieval_evals.py), not by feel.
AUTHORITY_BOOST = {1: 0.05, 2: 0.03, 3: 0.0, 4: 0.0}
CANDIDATES = 20


@lru_cache(maxsize=1)
def _genai():
    from google import genai
    return genai.Client(vertexai=True, project=PROJECT, location=LOCATION)


@lru_cache(maxsize=1)
def _bigquery():
    from google.cloud import bigquery
    return bigquery.Client(project=PROJECT, location=LOCATION)


def _unit(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def embed(texts: list[str], task_type: str, retries: int = 5) -> list[list[float]]:
    """Embed texts in batches. task_type is RETRIEVAL_DOCUMENT for chunks and RETRIEVAL_QUERY for
    questions: the model embeds the two asymmetrically, so a short question lands near its answer."""
    from google.genai import errors, types

    config = types.EmbedContentConfig(task_type=task_type, output_dimensionality=EMBED_DIM)
    out: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i:i + EMBED_BATCH]
        for attempt in range(retries):
            try:
                r = _genai().models.embed_content(model=EMBED_MODEL, contents=batch, config=config)
                break
            except errors.APIError as e:  # 429 quota or 5xx: back off exponentially, then give up
                if e.code not in (429, 500, 503) or attempt == retries - 1:
                    raise
                time.sleep(2 ** attempt)
        out.extend(_unit(list(e.values)) for e in r.embeddings)
    return out


def rerank(hits: list[dict], boost: dict[int, float], top_k: int) -> list[dict]:
    """Pure: score = cosine similarity + authority bonus; ties keep similarity order."""
    for h in hits:
        h["score"] = round(h["similarity"] + boost.get(h["tier"], 0.0), 4)
    return sorted(hits, key=lambda h: -h["score"])[:top_k]


def vector_search(vector: list[float], k: int, max_tier: int | None = None) -> list[dict]:
    """Brute-force cosine search in BigQuery. No vector index: BigQuery needs 5,000+ rows to build one,
    and exact search over ~1,600 rows is fast and has perfect recall."""
    from google.cloud import bigquery

    base = f"(SELECT * FROM `{TABLE}` WHERE tier <= @max_tier)"
    sql = f"""
        SELECT base.chunk_id, base.doc_id, base.page, base.page_label, base.section, base.text, base.tier,
               distance
        FROM VECTOR_SEARCH({base}, 'embedding', (SELECT @q AS embedding),
                           top_k => {int(k)}, distance_type => 'COSINE')
        ORDER BY distance"""
    params = [bigquery.ArrayQueryParameter("q", "FLOAT64", vector),
              bigquery.ScalarQueryParameter("max_tier", "INT64", max_tier or max(AUTHORITY))]
    rows = _bigquery().query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params)).result()
    return [{**dict(r), "similarity": round(1 - r["distance"], 4)} for r in rows]


def search_guidance(query: str, top_k: int = 5, max_tier: int | None = None,
                    boost: dict[int, float] | None = None) -> list[dict]:
    """Top chunks for a question, each with a citation the agent can copy ("<short>, p. N")."""
    if not query.strip():
        raise ValueError("empty query")
    hits = vector_search(embed([query], "RETRIEVAL_QUERY")[0], CANDIDATES, max_tier)
    ranked = rerank(hits, AUTHORITY_BOOST if boost is None else boost, top_k)
    for h in ranked:
        doc = DOCS_BY_ID[h["doc_id"]]
        h.update(cite=f"{doc.short}, p. {h['page']}", title=doc.title, authority=AUTHORITY[doc.tier])
        h.pop("distance", None)
    return ranked
