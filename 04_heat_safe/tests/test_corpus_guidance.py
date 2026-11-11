"""RAG building blocks that need no cloud: chunking, header removal, re-ranking, citation grounding."""
import json

import pytest

from evals.retrieval_metrics import score_query, summarise
from heat_safe import rules
from heat_safe.corpus import (DOCS_BY_ID, DOCUMENTS, MAX_CHARS, RAW, Chunk, pack, section_for,
                              strip_repeated_lines, twl_table_chunks)
from heat_safe.grounding import (check_citation_grounding, check_link_grounding, check_numeric_grounding,
                                 tool_citations)
from heat_safe.guidance import rerank

# --- chunking --------------------------------------------------------------------------------------


def test_pack_respects_size_and_keeps_every_line():
    lines = [f"line {i} " + "x" * 90 for i in range(40)]
    chunks = pack("\n".join(lines), max_chars=500, overlap=120)
    assert all(len(c) <= 500 for c in chunks)
    joined = "\n".join(chunks)
    assert all(l in joined for l in lines)  # nothing dropped


def test_pack_overlap_repeats_the_tail_of_the_previous_chunk():
    chunks = pack("\n".join(f"sentence {i:02d} " + "y" * 40 for i in range(30)), max_chars=300, overlap=100)
    for a, b in zip(chunks, chunks[1:]):
        assert b.splitlines()[0] in a  # the first line of each chunk ends the previous one


def test_pack_splits_a_line_longer_than_a_chunk_on_words():
    chunks = pack("word " * 600, max_chars=MAX_CHARS)
    assert len(chunks) > 1 and all(len(c) <= MAX_CHARS for c in chunks)


def test_running_headers_are_removed_and_body_kept():
    # Digits are ignored when comparing lines, so "Page 4 of 6" and "Page 5 of 6" count as one line.
    # That also means body lines differing only by a number would be dropped: the bodies here differ in words.
    topics = ["training", "hydration", "acclimatisation", "first aid", "shade", "records"]
    pages = [f"ADOSH-SF Code of Practice\nPage {i} of 6\nSection on {t}" for i, t in enumerate(topics, 1)]
    out = strip_repeated_lines(pages)
    assert all("ADOSH-SF Code of Practice" not in p and "Page" not in p for p in out)
    assert all(f"Section on {t}" in p for t, p in zip(topics, out))


def test_short_documents_keep_their_lines():
    pages = ["Title\nA", "Title\nB"]  # too few pages to tell a header from content
    assert strip_repeated_lines(pages) == pages


def test_section_is_the_last_bookmark_at_or_before_the_page():
    outline = [(0, "1. Introduction"), (3, "2. Training"), (6, "3. Program")]
    assert [section_for(outline, p) for p in (0, 2, 3, 7)] == [
        "1. Introduction", "1. Introduction", "2. Training", "3. Program"]


def test_embed_text_carries_document_and_section_context():
    doc = DOCS_BY_ID["adosh_cop_11"]
    c = Chunk("x", doc.doc_id, 4, "4", "2. Training and Competency", "(d) Within 10 days...")
    assert c.embed_text(doc).startswith("ADOSH-SF CoP 11.0 - 2. Training and Competency\n")
    assert c.content_hash(doc, "m", 768) != c.content_hash(doc, "m", 3072)  # size change re-embeds


def test_every_registered_document_exists_and_has_a_known_tier():
    for d in DOCUMENTS:
        assert (RAW / d.path).exists(), d.path
        assert d.tier in (1, 2, 3, 4)
    assert len(DOCS_BY_ID) == len(DOCUMENTS)  # ids are unique


def test_source_urls_agree_with_the_download_manifest():
    """A downloaded file's citation link is the URL it was downloaded from, so the link opens the
    document that was indexed."""
    manifest = {e["path"]: e["source"] for e in json.loads((RAW.parent / "manifest.json").read_text())}
    checked = 0
    for d in DOCUMENTS:
        assert d.url is None or d.url.startswith("https://"), d.doc_id
        if f"raw/{d.path}" in manifest:
            assert d.url == manifest[f"raw/{d.path}"], d.doc_id
            checked += 1
    assert checked == 7  # ADOSH-SF x3, ILO, NIOSH, WHO/WMO, Sharjah; the rest were collected by hand


def test_pdf_links_open_at_the_cited_page_and_pages_do_not():
    assert DOCS_BY_ID["niosh_2016"].link(42) == "https://www.cdc.gov/niosh/docs/2016-106/pdfs/2016-106.pdf#page=42"
    assert DOCS_BY_ID["uae_pdpl"].link(3) == "https://uaelegislation.gov.ae/en/legislations/1972"  # landing page
    assert DOCS_BY_ID["adhics_faq"].link(2) == DOCS_BY_ID["adhics_faq"].url  # .ashx: not known to be a PDF URL
    assert DOCS_BY_ID["mohre_break_2026_close"].link(2) is None  # no URL known


def test_twl_table_chunks_match_the_rules_module():
    """The transcribed table is retrievable text; its zone limits must equal the coded thresholds."""
    text = "\n".join(c.text for c in twl_table_chunks())
    assert f"{rules.TWL_HIGH_RISK_BELOW:g}" in text and f"{rules.TWL_LOW_RISK_FROM:g}" in text  # 115.0 -> "115"
    assert all(c.page == 5 and c.doc_id == "adosh_tg_heat" for c in twl_table_chunks())


# --- ranking ---------------------------------------------------------------------------------------


def test_authority_boost_lifts_binding_source_over_slightly_closer_guidance():
    hits = [{"similarity": 0.79, "tier": 4, "id": "sharjah"}, {"similarity": 0.78, "tier": 1, "id": "adosh"}]
    assert [h["id"] for h in rerank([dict(h) for h in hits], {1: 0.05}, 2)] == ["adosh", "sharjah"]
    assert [h["id"] for h in rerank([dict(h) for h in hits], {}, 2)] == ["sharjah", "adosh"]


def test_boost_does_not_beat_a_much_closer_match():
    hits = [{"similarity": 0.85, "tier": 3, "id": "niosh"}, {"similarity": 0.70, "tier": 1, "id": "adosh"}]
    assert rerank(hits, {1: 0.05}, 1)[0]["id"] == "niosh"


# --- citation grounding ----------------------------------------------------------------------------

OUTPUTS = [{"results": [{"cite": "ADOSH-SF CoP 11.0, p. 5"}, {"cite": "ADOSH-SF TG Safety in the Heat, p. 9"}]},
           {"citation": [rules.ADOSH_TG, rules.ADOSH_COP]}]


@pytest.mark.parametrize("answer,passed", [
    ("Train supervisors (ADOSH-SF CoP 11.0, p. 5).", True),
    ("Train supervisors (ADOSH-SF CoP 11.0, p.5).", True),                      # spacing differs
    ("Zones: ADOSH-SF Technical Guideline, Safety in the Heat, v4.0 (15 Jul 2024), Table 1, p.5", True),
    ("Train supervisors (ADOSH-SF CoP 11.0, p. 7).", False),                    # page not returned
    ("As NIOSH says (NIOSH 2016-106, p. 33).", False),                          # document not returned
    ("Heat stroke steps (ADOSH-SF TG Safety in the Heat, pp. 8-9).", False),    # p. 8 not returned
    ("Rest 15 min in the shade.", True),                                        # no page references
])
def test_citation_grounding(answer, passed):
    assert check_citation_grounding(answer, OUTPUTS)["passed"] is passed


def test_tool_citations_parses_both_citation_styles():
    cites = tool_citations(OUTPUTS)
    assert ("adosh-sf cop 11.0", 5) in cites and ("adosh-sf technical guideline", 5) in cites
    assert not any(src.startswith("adosh-sf cop 11.0") and p != 5 for src, p in cites)  # undated CoP has no page


# --- link grounding --------------------------------------------------------------------------------

NIOSH_P42 = "https://www.cdc.gov/niosh/docs/2016-106/pdfs/2016-106.pdf#page=42"
LINK_OUTPUTS = [{"results": [{"cite": "NIOSH 2016-106, p. 42", "url": NIOSH_P42}]}]


@pytest.mark.parametrize("answer,passed", [
    (f"Hydrate ([NIOSH 2016-106, p. 42]({NIOSH_P42})).", True),
    (f"See {NIOSH_P42}.", True),                                                       # bare, trailing full stop
    ("Hydrate ([NIOSH 2016-106, p. 42](https://www.cdc.gov/niosh/docs/2016-106/pdfs/2016-106.pdf#page=43)).", False),
    ("More at https://www.osha.gov/heat.", False),                                     # invented link
    ("Hydrate (NIOSH 2016-106, p. 42).", True),                                        # no links
])
def test_link_grounding(answer, passed):
    assert check_link_grounding(answer, LINK_OUTPUTS)["passed"] is passed


def test_numbers_and_pages_inside_links_are_not_checked_as_quoted_values():
    answer = ("Rest 15 min ([Sharjah OSHJ-CoP-33, p. 4](https://mc.spsa.shj.ae/x/Safety%20in%20Heat.pdf#page=4)),"
              " see also https://example.org/p.9/30%25")
    outputs = [{"results": [{"cite": "Sharjah OSHJ-CoP-33, p. 4"}]}, {"rest_min": 15}]
    assert check_numeric_grounding(answer, outputs)["passed"]   # "20" before "in", "25" before "%" ignored
    assert check_citation_grounding(answer, outputs)["passed"]  # "p.9" inside a URL is not a page reference


# --- retrieval metrics -----------------------------------------------------------------------------


def test_retrieval_scoring():
    results = [{"doc_id": "niosh_2016", "page": 80}, {"doc_id": "adosh_tg_heat", "page": 9}]
    s = score_query(results, [{"doc": "adosh_tg_heat", "pages": [9]}], k=5)
    assert s["rank"] == 2 and not s["hit@1"] and s["hit@5"] and s["rr"] == 0.5
    assert score_query(results, [{"doc": "niosh_2016"}], k=5)["rank"] == 1        # any page of the doc
    assert score_query(results, [{"doc": "adosh_cop_11", "pages": [5]}], k=5)["rr"] == 0.0
    m = summarise([s, {"hit@1": True, "hit@5": True, "rr": 1.0}], 5, binding=[True, False], top_tiers=[3, 3])
    assert m == {"hit@1": 0.5, "hit@5": 1.0, "mrr": 0.75, "binding_first": 0.0}
