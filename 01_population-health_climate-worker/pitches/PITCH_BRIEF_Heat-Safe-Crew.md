> **Superseded brief — retained for traceability.** Read the [consolidated business and hackathon plan](../business/OPPORTUNITY_PLAN.md) for current research, buyer strategy, market analysis, objections, and validation requirements. Do not reuse the claims below without checking the new plan.

# Heat-Safe Crew — Hackathon Pitch Brief
### “Paid Stop, Shared Signal”

**Challenge track:** Population Health → Climate-resilient worker health  
**Stage:** Ideation + architecture; partial deterministic engine designed. Not a live product.  
**One-liner:** Shared heat signal that stops the whole crew, pays the rest, and gives the client an auditable delay log — without ranking workers.

**Pitch line:** Worker protection before productivity. Code computes and enforces; the agent explains and plans; every number is grounded and logged.

*This brief is the source pack for hackathon submission, demo narrative, and any later investor or sponsor conversation. It is not a meeting script.*  
*For commercial slides (buyers, ROI, market, objections):* [`../business/BUSINESS_OPPORTUNITY.md`](../business/BUSINESS_OPPORTUNITY.md)  
*Battlecards:* [`MARKET_BATTLECARDS_AND_OBJECTIONS.md`](MARKET_BATTLECARDS_AND_OBJECTIONS.md)

---

## 1. Why us

**Positioning:** For Abu Dhabi outdoor construction clients and principal contractors who must meet ADOSH TWL + MoHRE midday rules without destroying schedule or worker trust, Heat-Safe Crew is the **crew-level heat operating system** — deterministic TWL, shared beacons, multilingual alerts, and a heat-delay contract log — not another per-worker wearable.

| Claim | Meaning |
|---|---|
| ADOSH-native | TWL zones + midday hard rules in versioned code; LLM never invents thresholds |
| Crew stop, not ranking | Shared signal kills the “who admits weakness” failure mode |
| Money loop closed | Sensor log → claimable heat delay; rest stops eating subcontractor margin |
| Privacy by architecture | IAM wall + purpose-limitation refusals, not only a policy PDF |
| Field languages + offline | AR/HI/UR/ML/BN/TL/EN templates; PWA/SMS on dusty sites |

**Vs market:** Kenzen/SlateSafety answer “is *this* body hot?” Scarlet answers “is *this* air hot?” We answer “**can this crew keep working, who pays for the stop, and can we prove it without naming workers?**”

---

## 2. Problem

UAE outdoor work already has rules: MoHRE midday ban (12:30–15:00, 15 Jun–15 Sep) and ADOSH-SF *Safety in the Heat* (TWL zones, heat programme at ≥35 °C). Workers still get hurt; projects still lose schedule.

The failure is not missing policy. It is **unowned cost of rest** and **untrusted stop authority**.

| Money loop | Trust loop |
|---|---|
| Heat delay unpriced in bids | Workers cannot judge their own strain |
| Stopping costs pay and programme | Peer pressure hides symptoms |
| Those who can stop can’t afford to | False alarms → ignored tech |
| Harm invisible until an incident | New starters / off-shift strain unseen |

Heat risk flows down the contract; physical harm lands on the worker. A wearable that singles out “Worker 7” fails culturally and on labour relations. A beacon that stops *everyone* when the sensor log trips can work.

| Actor | Pain |
|---|---|
| Worker | Silent strain, stigma, unpaid rest risk |
| Subcontractor | Absorbs stoppage out of margin |
| Principal contractor | Fixed price + LDs; ADOSH heat programme |
| Client / developer | Delay without a clean claim narrative |
| MoHRE / ADPHC / DMT | Compliance, inspections, heat deaths / reputation |

---

## 3. Context (UAE)

- **MoHRE:** outdoor direct-sun ban; fines AED 5,000 / worker (cap AED 50,000).
- **ADPHC / ADOSH-SF CoP 11.0:** TWL-based controls; Safety in Heat programme (11+ years).
- **2024 signal:** ADPHC interest in UAE heat-stress index / heat-health warning (national intelligence ≠ site decisioning).
- **Market (directional):** UAE construction ~USD 127B (2026); ~1.4M construction-sector workers nationally in recent estimates; material productivity loss under extreme heat in construction literature.

---

## 4. RFQ / buyer signals

Use as evidence of demand in the hackathon story — not as a bid we complete this week.

| Signal | Implication |
|---|---|
| **DMT RFQ 635105000320** — Implementing ADOSH-SF in Building & Construction (closes 9 Nov 2026) | Live spend on construction OSH framework implementation; heat is a core CoP domain |
| ADPHC heat-index / warning tender (2024) | Public sector pays for heat intelligence; our wedge is site action + contract evidence |
| MoHRE fine schedule | Recurring summer compliance floor |

**Category gap:** crew stop + paid-rest evidence + supervisor decision support as one stack.

---

## 5. Solution

*Designed product. Near-term deliverable is a demo/prototype; full stack is the intended solution.*

### What it is

Site operating system for heat: environment truth → crew-level stop → paid rest evidence → supervisor plan → multilingual worker alerts — with worker health data walled off from the employer.

| Layer | Function | Enforcement |
|---|---|---|
| **L0 Environment** | Microclimate / forecast → **TWL** (WBGT for display) | Deterministic code — never the LLM |
| **L1 Crew control** | Beacon bands; whole-crew rest; midday hard rule | Versioned rules; fail-safe raises risk on missing data |
| **L2 Money** | Sensor log underwrites **heat-delay side letter** | Claims only against the log |
| **L3 Worker UX** | Graded alerts in AR/HI/UR/ML/BN/TL/EN | Pre-translated, human-reviewed templates |
| **L4 Supervisor agent** | Task timing, rotation, rest; cites guidance | Aggregates only; IAM blocks individual vitals |
| **L5 Trust** | Consent, purpose limitation, Metrics + Trust tabs | Guardrails + audit logs |

### Intended journey (solution behaviour)

1. Morning plan shifts high-exertion work out of peak sun; midday locked.
2. Green beacon → hydrate prompts in worker language; no individual body surveillance.
3. Amber → whole crew takes scheduled shaded rest; pay continues under clause.
4. Red / withdrawal limits → crew stop; delay logged for claim.
5. New starters on acclimatisation ramp by rule.
6. “Who complains most?” → **refused** and logged.

### Non-goals (v1)

Individual wearables as safety trigger; ranking / disciplinary analytics; gate IR screening; camp HVAC redesign.

### Demo vs full product

| Hackathon / near-term | Full solution |
|---|---|
| Replay past August day (public weather) | Live site nodes + forecast fusion |
| Synthetic crews + mock clause | Real client side letter |
| Supervisor agent + Trust/Metrics | Multi-site fleet + HSE pack |
| Offline PWA rule table | Rugged beacons + SMS |

---

## 6. Future state

*Target operating reality if pilots clear gates — aspirational, not current.*

- Shared beacon, not supervisor gut feel, on high-heat work fronts.
- Stopping is normal: rule called it; no face loss; rest still paid.
- Heat delay is a **priced contract line**, settled against sensor logs.
- MoHRE midday compliance visible live, not reconstructed after inspection.
- ADPHC / DMT see aggregate trends without named worker health dossiers.
- Multilingual alerts as routine as toolbox talks.
- Productivity KPIs include **safe available hours**, not only raw output.

| Stakeholder | Future state |
|---|---|
| Worker | Red light → we all stop; I still get paid |
| Crew leader | Point at the beacon, not a person |
| Supervisor / PM | Rest is planned before it is an emergency |
| Subcontractor | Heat stop is claimable, not a silent margin hit |
| Client | Heat allowance budgeted and auditable |
| Regulator | Live compliance, fewer illnesses, no surveillance state |

**Category endgame:** default digital heat programme for ADOSH-covered outdoor work in Abu Dhabi → UAE → Gulf analogues. Long-term asset = rules engine + clause network + site data — not the chatbot.

**Gates:** (A) workers accept crew-triggered paid stops → (B) one client signs heat-delay side letter → (C) pilot beats compliance-only crews → (D) contractors copy the clause. Fail A → redesign or stop.

---

## 7. Commercial (investor-ready facts)

**Buyers:** principal contractor HSE (kit + summer SaaS); client (priced heat allowance once delay is auditable); Future Health / ADPHC as pilot path.

**Sketch economics (ideation-grade, not audited):** AD construction heat SAM roughly USD 16–48M / year at USD 40–120 / worker / summer; Year-1 beachhead USD 0.4–0.7M; Year-3 SOM USD 1.5–2.5M ARR before GCC expansion.

**Buyer ROI sketch:** ~USD 25k Year-1 on a 250-worker site pays back on one avoided serious heat event *or* two days of clean claimable delay vs penalty.

**GTM:** challenge readiness → one client side letter → subcontract flow-down → sell “ADOSH heat programme, digitised” → energy / logistics / municipal outdoor.

**Moat (early):** ADOSH-aligned deterministic engine + multilingual field UX + contractual artifact; harden with site data and clause templates.

**Competitors (summary):** Kenzen / SlateSafety (individual wearables, UAE presence via EGA & GCC distributors); Scarlet TWL stations; HeatGuard / 36Zero (broad GCC HSE); compliance-only programmes. Full battlecards + objections → [`MARKET_BATTLECARDS_AND_OBJECTIONS.md`](MARKET_BATTLECARDS_AND_OBJECTIONS.md).

**Illustrative ask (if used with sponsors/investors):** fund 1–2 summer pilots (nodes, recovery kit, evaluation, legal for clause pack). 12-month success: ≥1 signed side letter; ≥3 sites; false-Red under threshold; zero individual-ranking incidents; next-summer LOIs.

---

## 8. Hackathon narrative (use this arc)

1. **Why us:** crew stop + paid rest + ADOSH-native TWL — not another wearable.  
2. **Problem:** policy exists; paid, trusted stop does not.  
3. **Insight:** money loop + trust loop share who may stop and whether rest is funded.  
4. **Solution:** deterministic TWL + crew beacon + clause log + multilingual alerts + supervisor plan with privacy by IAM.  
5. **Demo:** August replay → Amber/Red crew stop → mock claim → purpose-limitation refusal → offline fallback.  
6. **Future state:** heat delay priced; rest normal; regulators see compliance without naming workers.  
7. **Ask of judges / pathway:** readiness assessment and intro to a site pilot sponsor.

---

## 9. Leave-behind strip

```
TODAY (idea)          SOLUTION                         FUTURE STATE
─────────────         ────────                         ────────────
Pain + policy maps    TWL engine, beacons, alerts      Shared stop is normal
No owned delay cost   Heat-delay side letter + log     Clients budget heat allowance
Supervisor gut feel   Crew/site agent + Trust tab      Live compliance, no named vitals
```

## Archive anchors

`../rfqs/`, `../research/`, `../ideation/`, `../../00_cross-cutting/FHDIC_Ideation_Assessment_Business_Plans.md`
