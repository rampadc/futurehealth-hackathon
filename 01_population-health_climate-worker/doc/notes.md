## Status Tracking

Built

| Area | What exists | Proof |
|---|---|---|
| **Foundations** | GCP project with separate credentials, BigQuery datasets, public data downloaded and loaded, shared private data bucket | `data/manifest.json`<br>`gs://heat-safe-example-data` |
| **Risk core** | TWL + WBGT, zones, midday break (2024–2026 seasons), scheduler, acclimatisation option B with note b | 209 unit tests<br>`RULES_VERSION 2026.11.06-3` |
| **Supervisor agent** | ADK + Gemini, 5 tools (`lookup_job_profile`, `get_forecast`, `compute_heat_stress`, `optimise_schedule`, `search_guidance`); refuses requests to rank or single out workers | `agents/supervisor/` |
| **Guardrails** | Numbers must come from tool outputs; page citations must come from guidance search results | `grounding.py` |
| **RAG** | 14 documents, 1,575 chunks, BigQuery vector search, re-ranking by authority | Retrieval eval: hit@5 1.0, MRR 0.93, binding_first 1.0 |
| **Evals** | 11 supervisor scenarios, 22 retrieval questions, results and telemetry in BigQuery | Last full run 29/30; the one failure fixed and re-run 5/5 |
| **Deployment** | Public Cloud Run demo with Terraform | Live link, `infra/README.md` |
| **Learning docs** | READMEs with learning notes for evals, RAG, the risk core and infra | 4 READMEs |

Some plan checkboxes are out of date. These are done but still untick


Left, by week

Week 2, not done:
- compute_worker_risk: PPE, acclimatisation, hydration, cumulative dose, fail-safe
- Synthetic crew, sensor and wearable data
- Air quality / dust modifier
- Pre-start note extraction and get_site_context
- PII redaction before embedding and logging
- Rotation in optimise_schedule
- Supervisor web app shell
- A conversation with an OHS advisor
- One more scenario (11 of 12)

Week 3:
- Graded alerts in 4 languages and send_alert
- Worker PWA with voice check-in
- Offline mode and SMS fallback
- An invariant that escalates red flags to 998
- Row-level security and policy tags
- Model Armor and a SQL guard
- 20–25 scenarios

Week 4:
- Summer backtest and Metrics tab
- Trust tab
- Documentation
- Demo video
- Submit

Not code, but urgent:
- Team registration closes 10 Nov, in 3 days.
- After the demo: terraform destroy and delete the stray US bucket.
- Commit the current work. Nothing since 64fa2d1 is committed.




## Risk Score Calculation Layers

It is pure code, like the rest of the risk core. The plan's model, in layers:

| Layer | Input | Effect | Already built? |
|---|---|---|---|
| **1. Environment** | Site TWL zone for the hour (from `compute_heat_stress`) | Low → Green, Medium → Amber, High → Red | ✅ Yes |
| **2. Clothing/PPE** | Clothing insulation (default 0.6 clo; coveralls are higher) | Changes the TWL for this worker, so the zone can drop | 🟡 Partly: TWL takes clothing, but nothing per worker yet |
| **3. Modifiers**<br>(can only raise the band) | Acclimatisation, low water intake, symptoms at the last check-in, cumulative heat dose today, Ramadan fasting, dust/respirator | Each one raises the band a level, e.g. "Low zone plus one modifier → Amber" | 🟡 Acclimatisation yes (`acclimatisation.py`); the rest no |
| **4. Physiology**<br>(optional, consented only) | Heart rate, skin temperature → estimated core temperature → Physiological Strain Index | A rising trend raises the band early; missing data never lowers it | ❌ No |
| **5. Fail-safe** | Stale forecast, a sensor or wearable dropping out | Fall back to the environment band +1 level, and tell the supervisor what's missing | 🟡 Only "missing weather → Red" |
| **6. Crew** | All the individual bands | The crew's band is the highest one, plus the share of the crew at Amber or above | ❌ No |





## to do list




## RAG work

All 10 PDFs have a text layer, so no OCR is needed: about 1.46M characters, or roughly 1,500 chunks. My recommendation:

1. Index. Store chunks with embeddings in BigQuery vectors in me-central1 and search them with BigQuery's built-in vector search.
   - At this size no vector index is needed.
   - It keeps data in region with no extra service.
   - I'd skip Vertex AI RAG Engine because I couldn't confirm it runs in me-central1.
2. Build script tools/build_corpus.py:
   - Extract text page by page.
   - Split into chunks of about 400 tokens along section headings.
   - Keep metadata on each chunk: document, version, issuer, jurisdiction, page, section, and the URL from manifest.json.
   - Embed with gemini-embedding-001 in me-central1. It handles Arabic too, for the Arabic code of practice later.
3. Rank by authority. Abu Dhabi and UAE documents first (ADOSH-SF codes, PDPL, Law 2/2019, ADHICS). International guidance second (ILO, WHO/WMO, NIOSH). Sharjah labelled "reference only".
4. search_guidance(query, jurisdiction?) returns chunks with page-level citations. A citation guardrail checks that every policy claim maps to a retrieved chunk.
5. Thresholds never come from RAG. The TWL table in the PDF is an image anyway; your CSV is indexed only so it can be cited.
6. Operational documents later (Week 2): pre-start notes, incidents and photos go through Gemini extraction into structured tables, then into their own vector table. They may name workers, so they're redacted before embedding.
7. Evals: about 15 questions, each with the page that should answer it, to measure whether search finds the right passages and whether answers stay faithful to them.

Building the PDF part and the tool is about half a day of work.


## Why we use TWL??

 TWL comes straight from Abu Dhabi's official heat-stress code, not from our own choice. I quoted the passages below from the PDFs in data/raw/regulatory/.

The documents
- ADOSH-SF Code of Practice 11.0, Safety in the Heat, v4.0 (Jul 2024), issued by the Abu Dhabi Public Health Centre (ADPHC). ADOSH-SF stands for Abu Dhabi Occupational Safety and Health System Framework, the emirate's mandatory OSH framework. The code uses "shall" language, so its requirements are obligations for employers in Abu Dhabi.
- ADOSH-SF Technical Guideline, Safety in the Heat, v4.0 (15 Jul 2024), the companion guidance that says how to meet the code.

What they say
1. The code makes TWL the required assessment method (CoP 11.0, p. 6, clause 3.1(f)):
▎ "Employer shall implement a process for assessing the environmental conditions and comparing it to the TWL heat stress index and implementation of the requirements of the relevant work zone control measures…"
2. It ties the 35 °C heat-programme trigger to TWL (CoP 11.0, p. 6):
▎ "Any worksite that has… a temperature at or above 35 degrees Celsius… shall implement an effective heat stress program, unless they can document through risk assessments and Thermal Work Limit (TWL) that there is no risk to employees."
3. It explains why TWL was chosen (Technical Guideline, p. 3):
▎ "The Thermal Work Limit (TWL), which has been validated for Gulf conditions, is the heat stress index that has been researched and adopted… within the Emirate of Abu Dhabi to enable safe management of work in heat."
4. It sets the zones and controls (Technical Guideline, Table 1, p. 5): Low ≥ 140, Medium 115–140, High < 115 W/m², each with work/rest cycles and fluid intake. That's the table you transcribed into twl_zones_adosh_tg_v4.csv and that rules.py encodes.

Neither document mentions WBGT at all. The original plan used WBGT/NIOSH thresholds, which is the common international index, and I switched to TWL after reading these documents. WBGT is kept only as a familiar number for display.

Caveats
- How TWL is meant to be measured: the guideline expects it measured on site with instruments: dry bulb, wet bulb, globe temperature and wind (Technical Guideline, p. 4). We estimate it from forecast data for planning ahead. This is why the plan treats a measured site reading as overriding the forecast estimate, and why the agent says once that TWL is an estimate.
- Scope: CoP 11.0 applies in the Emirate of Abu Dhabi. Other emirates use different rules; Sharjah's code, for example, is in data/raw/guidance/ as reference only.
- Federal level: the UAE-wide MoHRE rule is the midday break (12:30–15:00, 15 Jun–15 Sep), not a heat index. CoP 11.0 clause 3.1(g) requires compliance with it, and we apply both.
- Where the method comes from: the TWL heat-balance model is from Brake & Bates (2002), developed for hot Australian mines. Abu Dhabi adopted it; our code is checked against the 63 published reference cases from that paper.



## Decision about Project Region Selection?

I'd keep me-central1 for the data and send only the model and speech calls to other regions. Moving everything to us-central1 would cost us the strongest governance point and gain very little.

What I checked

┌─────────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  Need                                   │                                                         Available in me-central1?                                                         │
├─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ BigQuery (data, vectors, telemetry)                                     │ Yes, already running there                                                                                                                │
├─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Cloud Run                                                               │ Yes, I checked the region list                                                                                                            │
├─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Gemini chat models                                                      │ No. Only the global endpoint works, and it isn't in us-central1 either, so moving wouldn't change this                                    │
├─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Embeddings (gemini-embedding-001, multilingual)                         │ Yes, tested                                                                                                                               │
├─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Vertex AI location                                                      │ Yes (me-central1 is listed)                                                                                                               │
├─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Speech-to-Text Chirp, Model Armor, Vertex AI RAG Engine, Vertex AI      │ Not confirmed. Speech isn't enabled yet, so I couldn't list its regions. From memory Chirp is offered in only a few regions (US, EU,      │
│ evaluation service                                                      │ Asia), so assume it's not in me-central1                                                                                                  │
└─────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘




## Eval Notes

 Here's a reading order that follows the flow of a run:



1. golden dataset for eval: supervisor.yaml
2. 
3. evals/metrics.py: how the checks are scored. score() at the bottom is the entry point.
4. tests/test_eval_metrics.py: tests for the scorer, especially test_each_check_can_fail and the regex cases.
5. evals/run_evals.py: the runner and BigQuery logging. main() is at the bottom.
6. agents/supervisor/session.py: the shared ask() that both evals and the terminal tool use.

To see the results yourself:

bq query --use_legacy_sql=false --location=me-central1 \
  'SELECT run_id, scenario_id, repeat, passed, failed_checks
   FROM `heat-safe-example.telemetry.eval_results` ORDER BY started_at, scenario_id, repeat'

To watch one scenario run end to end:

HEAT_SAFE_TELEMETRY=0 uv run python evals/run_evals.py -k new_starter --no-bq

A good exercise while reviewing: break something on purpose and check that the eval catches it. For example, delete the "unknown site" rule from the instruction in agents/supervisor/agent.py and run -k unknown_site -n 3. Seeing an eval catch a bug you planted is the best way to trust it.

## RAG Notes


The RAG notes I'd put in src/heat_safe/README.md earlier have moved there. That file is now a short overview of the package that links to the new guide. I also updated the links in the root README, evals/README.md, the guidance.py docstring and the plan.

What's in it:
1. The run commands, plus a diagram of the two flows: building the index once, and what happens on each search.
2. A table of files and what each one does.
3. A reading order of 16 steps. Each step gives the file, the line range and a question to keep in mind while reading. It follows the data:
   - Build (steps 2–6): corpus.py covers documents and authority tiers, then header removal and chunking, then the Table 1 workaround. Then the chunking tests as worked examples, and build_corpus.py for the cache and the BigQuery load.
   - Search (7–8): guidance.py, covering embeddings, VECTOR_SEARCH and the authority re-rank.
   - Retrieval eval (9–11): retrieval.yaml with its trap questions, then the metrics and the runner, then the table showing how the boost was chosen.
   - Agent use (12–15): the tool wrapper, the agent's instruction and callback, the citation check, and the three RAG scenarios.
   - Wrap-up (16): the remaining learning notes and next steps.
4. Six hands-on exercises, 5–15 minutes each, costing at most a few cents:
   - inspect a chunk next to the PDF page;
   - query the vector table in BigQuery;
   - turn the boost off and see which document wins;
   - write and label your own retrieval question;
   - fool the citation check on purpose;
   - change the chunk size and measure the effect.
5. The 10 learning notes, now including the case where an answer cited TG p. 3 for a claim the check couldn't verify. That shows what the citation check can't detect.





## Terraform

uv run --env-file .env terraform -chdir=infra destroy




