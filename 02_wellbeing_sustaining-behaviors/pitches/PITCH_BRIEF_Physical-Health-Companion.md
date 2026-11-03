> **Superseded brief — retained for traceability.** Read the [consolidated business and hackathon plan](../business/OPPORTUNITY_PLAN.md) for current research, buyer strategy, market analysis, objections, and validation requirements. Do not reuse the claims below without checking the new plan.

# Physical Health Companion — Hackathon Pitch Brief
### “The pet that keeps the habit when the app does not”

**Challenge track:** Wellbeing → Sustaining healthy behaviors  
**Stage:** Concept specification and proposed pilot designs. No certified device, no efficacy claim, no shipment.  
**One-liner:** Clinic-configured pocket companion that turns approved real-world activities into care for a pet — offline, shame-free, programme-bounded.

*Source pack for hackathon narrative. Not a meeting script.*  
*For commercial slides (buyers, ROI, market, objections):* [`../business/BUSINESS_OPPORTUNITY.md`](../business/BUSINESS_OPPORTUNITY.md) · *Battlecards:* [`MARKET_BATTLECARDS_AND_OBJECTIONS.md`](MARKET_BATTLECARDS_AND_OBJECTIONS.md)

---

## 1. Problem

Abu Dhabi already runs serious behaviour programmes (Weight Management on Sahatna, Healthy Horizons, school health). The hard part is not starting a plan — it is **still being on the plan in week 12** after a lapse, without shame, without another muted notification.

| Stakeholder | Pain |
|---|---|
| Participant | App fatigue; stigma; low literacy / limited phone use; streak-shame |
| Parent / caregiver | Support without nagging or surveillance theatre |
| Clinician / programme | Drop-off after week 4–8; self-report noise; unclear evidence quality |
| System buyer | KPIs and reimbursement need sustained behaviour, not downloads |

**Context (directional):** Weight Management 6,500+ Thiqa participants Y1, ~14% average weight loss among participants; Sahatna already device-agnostic with wearable analytics; ~19% of UAE children meet MVPA guidelines; adolescent overweight/obesity often cited mid-30%s in school studies; Healthy Horizons onboards seniors who may need non-phone paths.

**Insight:** the market does not need another step counter. It needs **shame-free, offline, programme-bounded habit infrastructure** that recovers after lapses.

---

## 2. RFQ / buyer signals

| Signal | Implication |
|---|---|
| DoH + ADPHC Weight Management + Sahatna engagement reimbursement | Paying clinical channel that prices adherence |
| **ADEK RFQ 811105005569** — Student Wearable Devices & Digital Wellbeing (closes 9 Nov 2026) | Education procuring wearables + wellbeing platforms now |
| ADPHC school wearables pilot (closed Apr 2025) | Precedent for public health buying activity kits |
| ADPHC SEHHI digital tools (closed Apr 2026) | ADPHC buys medical software / reporting shapes |
| Sahatna × Ultrahuman Ultra Age | Do not fight the app — integrate as offline adjunct |

**Category gap:** clinic-configured, non-punitive, 30-day-offline companion with provenance-labelled evidence for programme teams.

---

## 3. Solution

*Intended product. Hackathon proof is simulator / policy engine / reports unless hardware already exists.*

### What it is

Standalone Tamagotchi-class device: participants care for a pet through simple physical interactions; completing **clinician-approved** activities gives immediate pet care and world progress. **Missed goals never injure the pet, erase achievements, or create shame.** Ordinary play always works; health goals are additive.

| Pillar | Design |
|---|---|
| Offline first | No required phone / watch / cloud for daily use; ~30-day battery target |
| Three-button UX | Back / Next / Select; AR/EN icons; no voice assistant required |
| Pet-first, clinical-second | Health goals unlock adventures; they are not the condition for the pet staying alive |
| Programme-bounded | Clinic defines activities, caps, adaptations; device never auto-prescribes outside bounds |
| Evidence provenance | sensor-estimated / timed / self-reported / caregiver-confirmed / clinical-external |
| Privacy | No employer/insurer punitive feed; child assent + parental controls; minimise on-screen health identifiers |

### Intended journey

1. Programme issues a signed **programme bundle** (goals, quiet hours, safety exclusions).  
2. Reader provisions the device; later pulls consented summaries.  
3. Daily: pet offers “Explore?”; motion estimates a walk; pet finds a seed — or timed wind-down → pet sleeps.  
4. Lapse: goal AT_RISK → LAPSE under policy; pet does not die; offers shorter approved adventure.  
5. Recovery recorded; clinician sees lapse length and recovery separately from game points.  
6. Provider report: adherence, wear coverage, evidence mix, adaptations — no BMI leaderboard.

### Beachhead

**Primary:** DoH/ADPHC Personalised Weight Management adjunct (retention / lapse recovery).  
**Secondary:** ADEK / school wellbeing kits (RFQ-shaped).  
**Later:** Healthy Horizons mobility + caregiver mode.

### Demo vs full product

| Near-term | Full solution |
|---|---|
| Three-button simulator + policy JSON | nRF52-class board, Memory LCD, 30-day battery |
| Event ledger + mock clinician reports | Sahatna / programme API integration |
| BOM + claim-boundary one-pager | Manufacturing, warranty, certification |

**Kill criterion:** no incremental value vs cheap pedometer/reminder in a controlled pilot → stop hardware thesis or pivot to software-only behaviour OS.

---

## 4. Future state

*Aspirational 24–36 months if evidence clears — not present capability.*

- Weight Management issues a companion kit at week 0 for participants who drop phone tracking.
- After a bad week, the first feeling is the pet welcoming them back — not a red streak.
- Clinicians see provenance-labelled activity (sensor vs self-report) for coaching and reimbursement.
- Schools run Active Kids without public ranking by weight or steps; parents see authorised summaries only.
- Seniors use discreet themes with caregiver confirmation — digital inclusion without forced smartphone fluency.
- Programme KPIs emphasise 12–16 week retention and lapse→recovery time, not app opens.
- Consumer entertainment pet exists as fallback; healthcare remains opt-in and claim-bounded.

| Stakeholder | Future state |
|---|---|
| Participant | Miss two days and still want to open the pet |
| Parent / carer | Confirm a walk without turning home into a clinic |
| Clinician | Provenance-labelled trends change coaching |
| Programme buyer | Completion / reimbursement KPIs move; support burden stays manageable |

**Category endgame:** behaviour OS accessory for Abu Dhabi preventive programmes (hardware + signed content + reporting), then GCC public programmes. Asset = programme content + evidence schema + trust brand.

**Gates:** usability → feasibility cohorts → outcome study vs pedometer/reminder → institutional WTP. Fail efficacy gate → pivot or stop.

---

## 5. Commercial (investor-ready facts)

**Model:** B2G / B2-provider kits + reader + templates + evaluation; optional consumer entertainment pet later.  
**Illustrative unit (unverified):** ~USD 69 concept retail — validate BOM/cert/warranty before pricing.  
**Honesty:** without bulk programme issuance, this stays small; upside is ADPHC/ADEK-scale kits, not DTC CAC wars.  
**Competition:** Sahatna / Ultrahuman / Apple/Garmin win sensing; we win where phones fail (kids, seniors, shame-sensitive adults, offline).  
**Risks:** hardware timeline, medical-device classification, child data, UAE heat/battery, adult pet aesthetics, unknown efficacy.  
**Illustrative ask:** Prototype 1 boards + 20–30 usability users + feasibility protocol — not a factory. 12-month success: power budget met; one programme LOI; usability pass; ethics path for feasibility.

---

## 6. Hackathon narrative

1. **Problem:** programmes work when people stay; apps lose them after lapses.  
2. **Insight:** emotional attachment + offline UX + no punishment beats another notification.  
3. **Solution:** programme-bounded pet, provenance-labelled events, clinician reports.  
4. **Demo:** simulator mission → lapse → recovery → provider report with evidence types.  
5. **Future state:** kits issued at enrolment as retention infrastructure.  
6. **Pathway ask:** design partner in Weight Management or ADEK wellbeing.

---

## 7. Leave-behind strip

```
TODAY (idea)              SOLUTION                            FUTURE STATE
─────────────             ────────                            ────────────
Concept + programmes      Offline 3-button companion          Kits at enrolment
App drop-off              Shame-free lapse / recovery         Welcome back, not punish
Noisy self-report         Provenance-labelled ledger          Clinicians trust the data
```

## Archive anchors

`../rfqs/`, `../research/`, `../ideation/`, `../../00_cross-cutting/FHDIC_Ideation_Assessment_Business_Plans.md`
