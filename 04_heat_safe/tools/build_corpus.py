"""Chunk the guidance PDFs, embed the chunks, and load them into BigQuery `vectors.guidance_chunks`.

    uv run --env-file .env python tools/build_corpus.py            # build and load
    uv run --env-file .env python tools/build_corpus.py --dry-run  # chunk and report only, no cloud calls

Embeddings are cached in data/processed/guidance_embeddings.jsonl, keyed by a hash of the embedded
text, model and dimension, so a re-run embeds only chunks that changed. The table is replaced on each
run (WRITE_TRUNCATE): the corpus is rebuilt from source, never edited in place.
"""
from __future__ import annotations

import argparse
import collections
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "processed" / "guidance_embeddings.jsonl"

from heat_safe.corpus import AUTHORITY, DOCS_BY_ID, build_chunks  # noqa: E402
from heat_safe.guidance import EMBED_DIM, EMBED_MODEL, LOCATION, TABLE, embed  # noqa: E402

SCHEMA = [
    ("chunk_id", "STRING"), ("doc_id", "STRING"), ("title", "STRING"), ("short", "STRING"),
    ("issuer", "STRING"), ("tier", "INTEGER"), ("authority", "STRING"), ("source_path", "STRING"), ("source_url", "STRING"),
    ("page", "INTEGER"), ("page_label", "STRING"), ("section", "STRING"), ("text", "STRING"),
    ("char_count", "INTEGER"), ("content_hash", "STRING"), ("embedding_model", "STRING"),
    ("embedding_dim", "INTEGER"), ("built_at", "TIMESTAMP"),
]


def load_cache() -> dict[str, list[float]]:
    if not CACHE.exists():
        return {}
    return {r["hash"]: r["embedding"] for r in map(json.loads, CACHE.read_text().splitlines())}


def report(chunks) -> None:
    by_doc = collections.Counter(c.doc_id for c in chunks)
    by_tier = collections.Counter(DOCS_BY_ID[c.doc_id].tier for c in chunks)
    sizes = [len(c.text) for c in chunks]
    print(f"{len(chunks)} chunks, median {statistics.median(sizes):.0f} chars, {sum(sizes):,} chars in total")
    for doc_id, n in by_doc.items():
        print(f"  {doc_id:16s} {n:5d}")
    for tier, n in sorted(by_tier.items()):
        print(f"  tier {tier} {AUTHORITY[tier]:52s} {n:5d}  ({n / len(chunks):.0%})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="chunk and report only")
    args = ap.parse_args()

    chunks = build_chunks()
    report(chunks)
    if args.dry_run:
        return 0

    cache = load_cache()
    hashes = [c.content_hash(DOCS_BY_ID[c.doc_id], EMBED_MODEL, EMBED_DIM) for c in chunks]
    todo = [(h, c) for h, c in zip(hashes, chunks) if h not in cache]
    print(f"\nembedding {len(todo)} new chunks ({len(chunks) - len(todo)} cached) with {EMBED_MODEL} in {LOCATION}")
    if todo:
        ## call embed() function to embed chunks, two task type: RETRIEVAL_DOCUMENT for chunks embeding, 
        ## RETRIEVAL_
        vectors = embed([c.embed_text(DOCS_BY_ID[c.doc_id]) for _, c in todo], "RETRIEVAL_DOCUMENT")
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        with CACHE.open("a") as f:  # append as we go: an interrupted run keeps what it paid for
            for (h, _), v in zip(todo, vectors):
                cache[h] = v
                f.write(json.dumps({"hash": h, "embedding": v}) + "\n")

    from google.cloud import bigquery

    built_at = datetime.now(timezone.utc).isoformat()
    rows = []
    for h, c in zip(hashes, chunks):
        d = DOCS_BY_ID[c.doc_id]
        rows.append({**c.to_dict(), "title": d.title, "short": d.short, "issuer": d.issuer, "tier": d.tier,
                     "authority": AUTHORITY[d.tier], "source_path": f"data/raw/{d.path}", "source_url": d.url,
                     "char_count": len(c.text), "content_hash": h, "embedding_model": EMBED_MODEL,
                     "embedding_dim": EMBED_DIM, "built_at": built_at, "embedding": cache[h]})
    schema = [bigquery.SchemaField(n, t) for n, t in SCHEMA] + [
        bigquery.SchemaField("embedding", "FLOAT64", mode="REPEATED")]
    client = bigquery.Client(location=LOCATION)
    job = client.load_table_from_json(rows, TABLE, job_config=bigquery.LoadJobConfig(
        schema=schema, write_disposition="WRITE_TRUNCATE"))
    job.result()
    print(f"{len(rows)} rows loaded into {TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
