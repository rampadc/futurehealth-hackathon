"""Output guardrail: every number the agent quotes with a unit must match a tool output (plan: Guardrails).

Pure code. A quoted value is grounded if some number in the tool outputs (including numbers inside
strings such as "45 min work / 15 min rest") rounds to it at the precision it was written with.
"""
from __future__ import annotations

import re
from typing import Any

# A number followed by a unit we must ground: temperatures, TWL, percentages, minutes, litres
QUOTED = re.compile(
    r"(?<![\d.])(-?\d+(?:\.\d+)?)\s*(?:–|-|to)?\s*(?:\d+(?:\.\d+)?\s*)?"
    r"(°C|°|W/m²|W/m2|%|min(?:utes)?\b|L\b|litres?\b|liters?\b)",
    re.IGNORECASE,
)
NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
# A link in an answer, bare or as a markdown target; stops at whitespace and closing brackets
URL = re.compile(r"https?://[^\s<>()\[\]]+")


def strip_urls(text: str) -> str:
    """Links are checked on their own (check_link_grounding); digits inside them ("%20", "#page=5",
    "2016-106") are not quoted values or page references."""
    return URL.sub(" ", text)


def tool_numbers(obj: Any) -> set[float]:
    """Every number in a tool output, recursively, including numbers written inside strings."""
    out: set[float] = set()
    if isinstance(obj, bool) or obj is None:
        return out
    if isinstance(obj, (int, float)):
        out.add(float(obj))
    elif isinstance(obj, str):
        out.update(float(n) for n in NUMBER.findall(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            out |= tool_numbers(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            out |= tool_numbers(v)
    return out


def quoted_values(text: str) -> list[tuple[str, str]]:
    """(number as written, unit) for each unit-bearing number in the text; ranges give both ends."""
    found = []
    for m in QUOTED.finditer(text):
        unit = m.group(2)
        for n in NUMBER.findall(m.group(0).replace(unit, "")):
            found.append((n, unit))
    return found


def _matches(written: str, numbers: set[float]) -> bool:
    decimals = len(written.split(".")[1]) if "." in written else 0
    value = float(written)
    return any(round(n, decimals) == value or abs(n - value) < 1e-9 for n in numbers)


def check_numeric_grounding(text: str, tool_outputs: list[Any]) -> dict:
    numbers = tool_numbers(tool_outputs)
    text = strip_urls(text)
    ungrounded = [f"{n} {u}" for n, u in quoted_values(text) if not _matches(n, numbers)]
    return {"passed": not ungrounded, "ungrounded": sorted(set(ungrounded)),
            "checked": len(quoted_values(text))}


# --- Citation grounding ----------------------------------------------------------------------------
# A page reference is as checkable as a number: "ADOSH-SF CoP 11.0, p. 5" is grounded only if a tool
# returned a citation for that document and page. Invented page numbers look authoritative and are
# the citation equivalent of a hallucinated value.

# A tool citation ends in a page: "ADOSH-SF CoP 11.0, p. 5" or "..., Table 1, p.5". Source = up to the first comma.
TOOL_CITE = re.compile(r"^(?P<source>[^,]+),.*?\bp\.\s?(?P<page>\d+)\s*$")
# A page reference in an answer: "p. 5", "p.5", "pp. 4-5"
PAGE_REF = re.compile(r"\bpp?\.\s?(\d+)(?:\s*[-–]\s*(\d+))?")
WINDOW = 120  # characters before "p. N" in which the document's name must appear


def _strings(obj: Any):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _strings(v)


def tool_citations(tool_outputs: list[Any]) -> set[tuple[str, int]]:
    """(source name, page) for every page-bearing citation string in the tool outputs."""
    out = set()
    for s in _strings(tool_outputs):
        if len(s) < 200 and (m := TOOL_CITE.match(s.strip())):
            out.add((m["source"].strip().lower(), int(m["page"])))
    return out


def check_citation_grounding(text: str, tool_outputs: list[Any]) -> dict:
    """Every "p. N" in the answer must sit just after the name of a document a tool cited at page N."""
    cites = tool_citations(tool_outputs)
    text = strip_urls(text)
    ungrounded, checked = [], 0
    for m in PAGE_REF.finditer(text):
        window = text[max(0, m.start() - WINDOW):m.start()].lower()
        first, last = int(m[1]), int(m[2] or m[1])
        for page in {first, last}:
            checked += 1
            if not any(page == p and source in window for source, p in cites):
                ungrounded.append(f"{text[max(0, m.start() - 40):m.end()].strip()}")
    return {"passed": not ungrounded, "ungrounded": sorted(set(ungrounded)), "checked": checked}


# --- Link grounding --------------------------------------------------------------------------------
# A link looks even more authoritative than a page number, and an invented one may open nothing or the
# wrong document. Every URL in an answer must be one a tool returned, character for character.

def _clean_url(url: str) -> str:
    return url.rstrip(".,;:!?'\"")


def check_link_grounding(text: str, tool_outputs: list[Any]) -> dict:
    """Every URL in the answer must appear exactly in some tool output string."""
    returned = {_clean_url(u) for s in _strings(tool_outputs) for u in URL.findall(s)}
    found = [_clean_url(u) for u in URL.findall(text)]
    ungrounded = sorted({u for u in found if u not in returned})
    return {"passed": not ungrounded, "ungrounded": ungrounded, "checked": len(found)}
