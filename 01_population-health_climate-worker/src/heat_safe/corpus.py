"""Guidance corpus: which documents the agent may cite, how authoritative each is, and how they are chunked.

Pure code, no cloud calls, so chunking is unit-tested (tests/test_corpus.py) and reproducible.
tools/build_corpus.py embeds the chunks and loads them into BigQuery; heat_safe.guidance searches them.

Retrieval explains and cites. It never supplies a threshold: TWL zones, work/rest and the midday break
come from rules.py, which was transcribed from these same documents and is unit-tested.
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import asdict, dataclass
from pathlib import Path

import pypdf

from heat_safe.paths import RAW, ROOT  # noqa: F401  (ROOT kept for importers)

# Chunks are packed from whole lines up to MAX_CHARS (~300 tokens), never crossing a page, so each
# chunk cites exactly one page. OVERLAP_CHARS of trailing lines repeat at the start of the next chunk
# so a sentence split at a boundary is still whole in one of them.
MAX_CHARS = 1200
OVERLAP_CHARS = 200
MIN_CHARS = 120  # drop fragments: cover pages, "this page intentionally left blank"
# A line (digits ignored) on at least this share of pages is a running header or footer
REPEATED_LINE_SHARE = 0.3

# Authority tier: lower is more binding for an Abu Dhabi construction site
AUTHORITY = {
    1: "Binding regulation for an Abu Dhabi site (ADOSH-SF, MoHRE)",
    2: "UAE / Abu Dhabi data-protection law",
    3: "International guidance (not binding in Abu Dhabi)",
    4: "Other emirate, reference only (not Abu Dhabi law)",
}


@dataclass(frozen=True) # immutable dataclass 
class Document:
    doc_id: str
    path: str  # relative to data/heat_safe/raw
    title: str
    short: str  # what the agent writes in a citation: "<short>, p. N", a short version of the title
    issuer: str
    tier: int
    # Where a reader can open the source. For a file tools/download_data.py fetched it is the manifest's
    # "source" (a test checks they agree). For manual collections this list is the record (data/ is not
    # in git). None when no public URL is known: the citation then has no link.
    url: str | None

    def link(self, page: int | None = None) -> str | None:
        """URL to cite. A direct PDF link opens at the cited page with "#page=N" (the 1-based PDF page,
        the same number as Chunk.page). Article and landing pages have no pages, so they get no anchor."""
        if not self.url:
            return None
        is_pdf = self.url.split("?")[0].lower().endswith(".pdf")
        return f"{self.url}#page={page}" if page and is_pdf else self.url

## initialize all Document instances
DOCUMENTS = [
    Document("adosh_cop_11", "regulatory/adosh_sf_cop_11_safety_in_the_heat_v4_2024_en.pdf",
             "ADOSH-SF Code of Practice 11.0 Safety in the Heat, v4.0 (15 Jul 2024)",
             "ADOSH-SF CoP 11.0", "Abu Dhabi Public Health Centre (ADOSH-SF)", 1,
             "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Codes-of-Practise/11---Safety-in-the-Heat-v31-English.pdf"),
    Document("adosh_tg_heat", "regulatory/adosh_sf_tg_safety_in_the_heat_v4_2024_en.pdf",
             "ADOSH-SF Technical Guideline Safety in the Heat, v4.0 (15 Jul 2024)",
             "ADOSH-SF TG Safety in the Heat", "Abu Dhabi Public Health Centre (ADOSH-SF)", 1,
             "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Technical-Guidelines/Safety-in-the-Heat--Eng.pdf"),
    Document("adosh_cop_53_1", "regulatory/adosh_sf_cop_53_1_osh_construction_en.pdf",
             "ADOSH-SF Code of Practice 53.1 OSH in Construction",
             "ADOSH-SF CoP 53.1", "Abu Dhabi Public Health Centre (ADOSH-SF)", 1,
             "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Codes-of-Practise/53__1---OSH-Construction--Eng.pdf"),
    # MoHRE's midday break is federal and binds every UAE site. The announcements are WAM news
    # releases printed from the browser: the official public statement of the rule each year.
    Document("mohre_break_2024", "regulatory/middaybreakannouncements/WAM_Midday_Break_Announcement_2024.pdf",
             "MoHRE Midday Break 2024 announcement (WAM, 31 May 2024)",
             "MoHRE Midday Break 2024 (WAM)", "UAE Ministry of Human Resources and Emiratisation", 1,
             # The WAM article whose headline and date match the PDF (manual_urls.md had b56ll46, a different article)
             "https://www.wam.ae/en/article/b3fhmx5-mohre-implements-midday-break-from-june-september"),
    Document("mohre_break_2025", "regulatory/middaybreakannouncements/WAM_Midday_Break_Anouncement_2025.pdf",
             "MoHRE Midday Break 2025 announcement (WAM, 3 Jun 2025)",
             "MoHRE Midday Break 2025 (WAM)", "UAE Ministry of Human Resources and Emiratisation", 1,
             "https://www.wam.ae/en/article/bk01z89-mohre-implement-midday-break-for-21st-consecutive"),
    Document("mohre_break_2026", "regulatory/middaybreakannouncements/WAM_Midday_Break_Anouncement_2026.pdf",
             "MoHRE Occupational Heat Stress Prevention Policy 2026 announcement (WAM, 8 Jun 2026)",
             "MoHRE Heat Stress Policy 2026 (WAM)", "UAE Ministry of Human Resources and Emiratisation", 1,
             "https://www.wam.ae/en/article/c0memda-mohre-announces-return-occupational-heat-stress"),
    Document("mohre_break_2026_close", "regulatory/middaybreakannouncements/WAM_End_Of_Season_Release_2026.pdf",
             "MoHRE end-of-season release, Occupational Heat Stress Prevention Policy 2026 (WAM, 15 Sep 2026)",
             "MoHRE 2026 season close (WAM)", "UAE Ministry of Human Resources and Emiratisation", 1,
             # Not a duplicate of the 8 Jun release (it reports the season's results). No English WAM URL found
             None),
    Document("uae_pdpl", "regulatory/manual/uae_pdpl_fdl_45_2021_en.pdf",
             "UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL)",
             "UAE PDPL (FDL 45/2021)", "UAE Government", 2,
             "https://uaelegislation.gov.ae/en/legislations/1972"),
    Document("uae_health_ict", "regulatory/manual/uae_health_ict_law_2_2019_en.pdf",
             "UAE Federal Law No. 2 of 2019 on the Use of ICT in Health Fields",
             "UAE Health ICT Law (2/2019)", "UAE Government", 2,
             "https://uaelegislation.gov.ae/en/legislations/1209"),
    Document("adhics_faq", "regulatory/manual/ADHICS-FAQ.pdf",
             "DoH Abu Dhabi Healthcare Information and Cyber Security Standard (ADHICS) FAQ",
             "DoH ADHICS FAQ", "Department of Health Abu Dhabi", 2,
             "https://www.doh.gov.ae/-/media/Feature/Aamen/ADHICS-FAQ.ashx"),
    Document("ilo_2019", "guidance/ilo_working_on_a_warmer_planet_2019.pdf",
             "ILO, Working on a warmer planet: the impact of heat stress on labour productivity (2019)",
             "ILO Warmer Planet 2019", "International Labour Organization", 3,
             "https://www.ilo.org/wcmsp5/groups/public/---dgreports/---dcomm/---publ/documents/publication/wcms_711919.pdf"),
    Document("niosh_2016", "guidance/niosh_2016-106_heat_stress_criteria.pdf",
             "NIOSH 2016-106 Criteria for a Recommended Standard: Occupational Exposure to Heat and Hot Environments",
             "NIOSH 2016-106", "US National Institute for Occupational Safety and Health", 3,
             "https://www.cdc.gov/niosh/docs/2016-106/pdfs/2016-106.pdf"),
    Document("who_wmo_2015", "guidance/who_wmo_heatwaves_and_health_warning_systems_2015.pdf",
             "WHO/WMO Heatwaves and health: guidance on warning-system development (2015)",
             "WHO/WMO Heatwaves 2015", "World Health Organization / World Meteorological Organization", 3,
             # UN CC:Learn mirror; the file it serves is byte-identical to the indexed copy
             "https://www.uncclearn.org/wp-content/uploads/library/who16102015.pdf"),
    Document("sharjah_cop33", "guidance/sharjah_oshj_cop33_safety_in_heat_2024.pdf",
             "Sharjah OSHJ-CoP-33 Safety in Heat (2024)",
             "Sharjah OSHJ-CoP-33", "Sharjah Prevention and Safety Authority", 4,
             "https://mc.spsa.shj.ae/Media/documents/j3comnEiUeCQ3emVuS2OQ_Safety%20in%20Heat%20OSHJ-COP-33.pdf"),
]


@dataclass(frozen=True) # immutable dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    page: int  # 1-based PDF page, what a PDF viewer's "go to page" uses
    page_label: str  # the number printed on the page, which can differ (NIOSH front matter is "Pi")
    section: str
    text: str

    def embed_text(self, doc: Document) -> str:
        """What gets embedded: a short context header plus the text, so a chunk that says only
        "(d) Within 10 days..." still carries which document and section it came from."""
        return f"{doc.short} - {self.section}\n{self.text}" if self.section else f"{doc.short}\n{self.text}"

    def content_hash(self, doc: Document, model: str, dim: int) -> str:
        """Embedding cache key: re-embed only when the text, header, model or size changes."""
        return hashlib.sha256(f"{model}|{dim}|{self.embed_text(doc)}".encode()).hexdigest()[:16]

    def to_dict(self) -> dict:
        return asdict(self)


def _normalise(line: str) -> str:
    """
    Normalize lines
    """
    return re.sub(r"\d+", "#", line.strip().lower())


def strip_repeated_lines(pages: list[str]) -> list[str]:
    """Remove running headers and footers ("Page 4 of 12", the document title on every page).

    They repeat on most pages, so left in they dominate the embeddings of short chunks and make every
    chunk of a document look alike. Digits are ignored so "Page 4 of 12" and "Page 5 of 12" count as one.
    """
    if len(pages) < 4:
        return pages
    seen: dict[str, int] = {}
    for text in pages:
        for key in {_normalise(l) for l in text.splitlines() if l.strip()}:
            seen[key] = seen.get(key, 0) + 1
    limit = max(3, REPEATED_LINE_SHARE * len(pages))
    repeated = {k for k, n in seen.items() if n >= limit and len(k) < 120}
    return ["\n".join(l for l in text.splitlines() if l.strip() and _normalise(l) not in repeated)
            for text in pages]


def clean(text: str) -> str:
    """Tidy extracted text: collapse runs of spaces, join words hyphenated across a line break."""
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    lines = [re.sub(r"[ \t ]+", " ", l).strip() for l in text.splitlines()]
    return "\n".join(l for l in lines if l)


def pack(text: str, max_chars: int = MAX_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    """
    Greedy packing of whole lines into chunks of at most max_chars, with a line-aligned overlap.

    Break text into small chunks for later embedding.
    """
    lines: list[str] = []
    for line in text.splitlines():  # a line longer than a chunk is split on words
        while len(line) > max_chars:
            cut = line.rfind(" ", 0, max_chars)
            cut = cut if cut > 0 else max_chars
            lines.append(line[:cut])
            line = line[cut:].strip()
        if line:
            lines.append(line)
    chunks, current = [], []
    for line in lines:
        if current and len("\n".join(current + [line])) > max_chars:
            chunks.append("\n".join(current))
            tail = []
            for prev in reversed(current):  # carry whole trailing lines up to `overlap` chars
                if len("\n".join([prev] + tail)) > overlap:
                    break
                tail.insert(0, prev)
            current = tail
        current.append(line)
    if current:
        chunks.append("\n".join(current))
    return chunks


def _outline(reader: pypdf.PdfReader) -> list[tuple[int, str]]:
    """(0-based page, heading) for every bookmark, in page order; nested bookmarks are flattened."""
    out: list[tuple[int, str]] = []

    def walk(items):
        for item in items:
            if isinstance(item, list):
                walk(item)
                continue
            try:
                page = reader.get_destination_page_number(item)
            except Exception:  # noqa: BLE001 - a broken bookmark should not stop the build
                page = None
            if page is not None:  # bookmarks that point nowhere exist in real PDFs
                out.append((page, " ".join(item.title.split())))
    walk(reader.outline or [])
    return sorted(out, key=lambda x: x[0])


def section_for(outline: list[tuple[int, str]], page_index: int) -> str:
    """The most recent bookmark at or before this page: the section a reader would be in."""
    current = ""
    for p, title in outline:
        if p > page_index:
            break
        current = title
    return current[:200]


def chunk_document(doc: Document) -> list[Chunk]:
    logging.getLogger("pypdf").setLevel(logging.ERROR)  # font warnings are noise for text extraction
    reader = pypdf.PdfReader(RAW / doc.path)
    labels = reader.page_labels
    pages = strip_repeated_lines([p.extract_text() or "" for p in reader.pages])
    outline = _outline(reader)
    chunks = []
    for i, page_text in enumerate(pages):
        for j, text in enumerate(pack(clean(page_text))):
            if len(text) < MIN_CHARS:
                continue
            chunks.append(Chunk(f"{doc.doc_id}-p{i + 1:03d}-{j}", doc.doc_id, i + 1, labels[i],
                                section_for(outline, i), text))
    return chunks


TWL_TABLE_CSV = RAW / "regulatory" / "manual" / "twl_zones_adosh_tg_v4.csv"


def twl_table_chunks() -> list[Chunk]:
    """TG Table 1 (TWL zones, p.5) is an image in the PDF, so text extraction finds nothing there.
    The hand-checked transcription that rules.py was built from fills the gap, one chunk per zone."""
    import csv

    chunks = []
    with TWL_TABLE_CSV.open() as f:
        for i, row in enumerate(csv.DictReader(f)):
            text = (f"[Transcribed from Table 1, an image in the PDF]\n{row['zone']}: TWL "
                    f"{row['twl_min_wm2']} to {row['twl_max_wm2']} W/m2.\nInterventions: {row['interventions']}\n"
                    f"Work/rest: {row['work_rest_schedule_minutes']}.\nRehydration: {row['rehydration_schedule_per_hr']}.")
            chunks.append(Chunk(f"adosh_tg_heat-p005-t{i}", "adosh_tg_heat", 5, "5",
                                "Table 1 - Thermal Work Limit Zones and Interventions for Management of Work", text))
    return chunks


# The notes under Table 1 are part of the same image and absent from the CSV. Transcribed on 6 Nov from
# the page rendered with `pdftoppm -f 5 -l 5 -r 130 -png`; checked word for word against the PDF by a
# second person (the team) on 6 Nov, like the table itself.
# Note b is the official definition of "unacclimatised" (rules.UNACCLIMATISED_AFTER_DAYS_AWAY).
TWL_TABLE_NOTES = """[Transcribed from the notes under Table 1, an image in the PDF]
(a) Self-paced work: workers must be allowed to adjust their work rate according to environmental conditions. Paced work is when the work rate is not under the worker's control.
(b) Unacclimatised workers are defined as new workers or those who have been off work for more than 14 days due to illness or on vacation leave (in a cool climate area).
(c) Light work: sitting or standing, light arm work.
(d) Heavy work: carrying, climbing, lifting, pushing, whole-body work.
(*) At high workloads and or thermal stress, sweat rates exceed 1.2 Litres / hr. Increasing fluid intake much above this level is not practical due to gastric discomfort as the upper limit for gastric emptying and fluid absorption is ~ 1.5 Litres / hr so control solutions to improve thermal conditions should be implemented in addition to providing adequate hydration to replace sweat lost."""


def build_chunks(documents: list[Document] = DOCUMENTS) -> list[Chunk]:
    """
    Build chunks for all documents in DOCUMENTS and small notes chunk
    """
    notes = Chunk("adosh_tg_heat-p005-notes", "adosh_tg_heat", 5, "5",
                  "Table 1 - Notes (definitions: self-paced, unacclimatised, light and heavy work)", TWL_TABLE_NOTES)
    return [c for d in documents for c in chunk_document(d)] + twl_table_chunks() + [notes]


DOCS_BY_ID = {d.doc_id: d for d in DOCUMENTS}
