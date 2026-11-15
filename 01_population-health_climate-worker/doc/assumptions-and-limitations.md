# Assumptions and limitations

Heat-Safe Crew is a hackathon prototype. It shows how site heat evidence, people's confirmations, a constraint solver and a grounded agent can work together on one replayed shift. It is not field-ready and must not be used to make real safety decisions.

## What is real and what is simulated

| Part | Real in the prototype | Simulated or fictional |
|---|---|---|
| Weather and heat stress | ERA5 reanalysis for Mussafah (4 Aug 2025 for the case, 1 Aug 2025 for the metrics replay); TWL and WBGT computed in code | No live forecast in the demo; no live site sensors |
| Local readings | Validation of zone, quality and freshness (five-minute limit) | Readings are seeded or injected from presenter controls. The metrics replay sensor is synthetic, with an added spike and one fault |
| Site, people and policies | Abu Dhabi heat rules (ADOSH-SF CoP 11.0 and Technical Guideline, the midday break) as cited | Sandline, Dune Civil Works, every person, the 150 W/m² heavy-work site rule, the workshop timing policy and the permit, resource and supervision facts are fictional |
| Solver | OR-Tools CP-SAT plans and checks over the case evidence | Its inputs are the fictional case; "useful worker-minutes" is a fixture measure, not productivity or fairness |
| Planning Agent | Gemini through ADK, with read-only case tools, guidance search over a curated corpus, and grounding checks on numbers and citations | Answers can be wrong; they never change the case |
| Sign-in | Persona selection, scoped on the server | Not authentication. Hosted access uses shared entry codes |
| Messages | Text of the stop-work instruction and alerts | Nothing is sent: no SMS, voice call, push notification or supplier message |

## Key assumptions

- TWL from weather data is an estimate. Sun TWL in the replay sits at the model's 60 W/m² floor through midday because modelled radiant temperature is high; it has not been checked against measured TWL in the Gulf.
- Only a fresh, valid local reading from the same zone, a permit check and a named human review can support a restart. A forecast, a replay, another zone's reading or an earlier approval never can. The prototype enforces this; a real site would need its own procedure.
- Readiness for covered work is a foreman's individual, in-person confirmation. Time in a cooled shelter is not readiness, and missing readiness is "unknown", not a symptom.
- Required recovery in a rostered shift is treated as paid rest under a fictional Heat Rest Schedule. Pay and cost questions go to the employer and contract processes, not the app.
- A symptom report starts the first-aid route regardless of the heat band. The app records that a responder acted; it records no diagnosis, treatment or clearance.
- Per-worker heat risk uses each worker's clothing, type of work and acclimatisation. In the demo, clothing and work type are synthetic (two civil workers in coveralls over work wear, one in cloth coveralls, the two plant operators on light work), and the whole crew is acclimatised per the roster. The clothing values are NIOSH differences on our TWL baseline, an interpretation pending OHS review.
- Per-worker bands use TWL in the sun for exposed trench work. A valid local reading lowers every worker's TWL if it is hotter than the weather says, for up to an hour; a cooler reading never raises it. A faulty reading, or one already stale when it arrives, raises every band one level.
- A report of feeling unwell raises that worker's band one level and shows the supervisor "needs rest now". The supervisor never sees the reason. Each factor raises the band, and a raised band uses the stricter zone's work/rest limits: a project rule, not an ADOSH-SF one.

## Not built (roadmap)

- Per-worker risk inputs: hydration from voice check-ins, cumulative dose, Ramadan fasting, respirators on dust days, and any wearable feed (the function takes a strain flag; nothing sends one).
- The planned baseline and alert triggers for per-worker bands (README_WORKER_RISK.md): bands are shown, never pushed.
- Live sensor and wearable adapters, Pub/Sub ingestion and the 15-minute risk monitor job.
- SMS, voice and push delivery with receipts; the separate worker check-in agent with Speech-to-Text and translation.
- Real authentication and roles, per-agent service accounts, BigQuery row-level security, Model Armor and durable shared audit.
- Health-data isolation beyond the app's own access rules.
- Native-speaker review of translations; Tamil, Nepali and Pashto translations.
- Offline rule table and cached forecast on the phone, and SMS fallback.
- A full-summer backtest; the metrics cover one replay day.
- A live golden eval for the case agent (its tool access is unit-tested).

## Data and privacy in the demo

All people and records are fictional. The worker's own check-ins, reports and consent are visible only to that worker, and supervisors see only "needs rest now". Clinical notes are never stored in the shared record. Conversation history and case records are kept in local SQLite or the hosted PostgreSQL database for the demo only.

## Hosting

The app runs locally from `tools/dev_local.py`. The Cloud Run deployment needs IAM grants from the project owner (`cloud/README.md`); until then, the demo runs locally.
