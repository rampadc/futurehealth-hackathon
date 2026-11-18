# Guidance search (RAG): how the agent finds and cites the regulations

The supervisor agent answers "why", training, first-aid, hydration, midday-break and data-law questions
from 14 documents: Abu Dhabi and MoHRE regulations, UAE data law and international guidance. It quotes them with
a page citation, and a guardrail checks every page reference. RAG explains and cites. It **never**
supplies a threshold: those live in `rules.py`.

```bash
uv run --env-file .env python tools/build_corpus.py --dry-run    # chunk and report, no cloud calls
uv run --env-file .env python tools/build_corpus.py              # embed (cached) and load BigQuery
uv run --env-file .env python evals/run_retrieval_evals.py -v    # retrieval quality per boost setting
uv run pytest tests/test_corpus_guidance.py                      # chunker, ranking, citation checks
HEAT_SAFE_TODAY=2025-07-31 uv run --env-file .env python tools/ask_supervisor.py "What heat training do my foremen need?"
```

```
BUILD (offline, once per corpus change)
  data/heat_safe/raw/*.pdf ─► corpus.py: extract text, strip headers, chunk per page, add context header
                 ─► build_corpus.py: embed (gemini-embedding-001, 768-d, me-central1, cached by hash)
                 ─► BigQuery vectors.guidance_chunks (1,574 rows)

QUERY (every search_guidance call, ~3 s)
  question ─► guidance.py: embed as RETRIEVAL_QUERY ─► VECTOR_SEARCH top 20 (cosine)
           ─► rerank: similarity + authority bonus ─► top 5 with "cite" strings
           ─► agent_tools.search_guidance ─► agent quotes the cite ─► grounding.py checks each "p. N"
```

| File | Role |
|---|---|
| `src/heat_safe/corpus.py` | Which documents, how authoritative, how they are chunked. Pure code, no cloud |
| `tools/build_corpus.py` | Embeds the chunks and loads BigQuery; embedding cache |
| `src/heat_safe/guidance.py` | Query embedding, `VECTOR_SEARCH`, authority re-rank |
| `src/heat_safe/agent_tools.py` → `search_guidance` | The tool Gemini sees: thin wrapper, errors as dicts |
| `src/heat_safe/grounding.py` (citation section) | Every page reference must match a tool citation |
| `agents/supervisor/agent.py` | Instruction rules for guidance; grounding callback |
| `evals/golden/retrieval.yaml`, `evals/retrieval_metrics.py`, `evals/run_retrieval_evals.py` | Retrieval eval: hit@k, MRR, binding-first |
| `evals/golden/supervisor.yaml` (last 3 scenarios) | End-to-end guidance scenarios |
| `tests/test_corpus_guidance.py` | Unit tests for everything above that needs no cloud |

## Design decisions

- **RAG explains and cites; it never supplies a threshold.** Limits live in `rules.py`.
- **The data was read before writing the chunker.** TG Table 1 (TWL zones) is an image, so it's transcribed
  (`corpus.twl_table_chunks`). Printed page numbers are mapped from PDF pages, and repeated headers are stripped.
  Chunks never cross a page, so every chunk has one citation.
- **A vector database can be a table.** 1,574 chunks in BigQuery with `VECTOR_SEARCH`, in the same region as the
  rest of the data.
- **Similarity ranks by topic, not authority.** `guidance.rerank` adds a small bonus for binding Abu Dhabi sources,
  chosen with the retrieval eval (21 questions, `evals/golden/retrieval.yaml`):

| Setting | hit@1 | hit@5 | MRR | Binding source first |
|---|---|---|---|---|
| Similarity only | 0.65 | 1.0 | 0.80 | 0.54 |
| **Boost 0.05 / 0.03 (chosen)** | **0.88** | 1.0 | **0.94** | **1.0** |
| Filter to Abu Dhabi only | 0.65 | 0.77 | 0.71 | 1.0 |

  (Measured on the first 17 questions. With 21 questions, hit@1 is 0.90.)
- **Citations are checked like numbers.** Every "p. N" in an answer must match a page that a tool returned
  (`grounding.py`).
- **Retrieved text is untrusted input.** Model Armor screens guidance text for hidden instructions before the model
  sees it.
- **Provenance is checked before indexing:** the publisher's site, PDF metadata and the release date
  (`data/heat_safe/README.md`).
- **Known limits:**
  - The retrieval set is small, and the boost was tuned on it.
  - No LLM judge checks that a cited passage supports the sentence.
