# `heat_safe`: risk core and guidance search

| File | Role |
|---|---|
| `rules.py`, `twl.py`, `thermal.py`, `heat_stress.py`, `schedule.py` | Deterministic risk core: TWL, zones, midday break, scheduler |
| `acclimatisation.py` | Who counts as acclimatised today, and their share of a full workload (from dates) |
| `README_WORKER_RISK.md` | **Spec for `compute_worker_risk`** (`worker_risk.py`): the six layers, band vs reminder vs alert, the 1 Aug walkthrough, clothing values (`rules.CLOTHING`) |
| `forecast.py`, `sites.py`, `job_profile.py` | Inputs: weather, sites, roles |
| `grounding.py` | Output guardrails: numbers and page references must come from tool outputs |
| `agent_tools.py` | The agent's tools: thin wrappers with the same names as the core functions |
| `corpus.py`, `guidance.py` | Guidance search (RAG): **see [`README_RAG.md`](README_RAG.md)** for the design and retrieval results |
| `gcp.py` | Fail-fast credentials check |

## Design decisions

- **Safety numbers come from code, never from the model.** TWL, zones, the midday break and the schedule are
  deterministic and unit-tested (`tests/`). The agent only calls them and explains the result.
- **Where the documents disagree, we decide once, in code, and cite why.** Acclimatisation follows the protective end
  of the binding ADOSH-SF text (`acclimatisation.py`), interpretations are labelled as such, and every boundary has a test.
- **Tools return numbers in the form people say them** (clock times, minutes, "of 60"), so the model doesn't do arithmetic.
- **Two loops at different speeds.** The forecast plans the day; the site sensor (`sensor.py`, `spike.py`) corrects
  it during the shift. Zones go up at once and come down slowly, and a faulty reading moves toward safety, not away.
- **Alert text is reviewed data, not generated text** (`alert_templates.yaml`). Each language records its review
  status, and the checks run when the file loads.
- **Every number and page citation in an answer is checked** against tool outputs (`grounding.py`).
