# Heat-Safe Crew — opportunity companion for team discussion

**3 November 2026 · Hackathon proposal with a longer-term commercial perspective**

This companion builds on the team's [discovery PDF](../ideation/FHD-Climate-Resilient-Worker-Health-Discovery-1.pdf) and [idea / agent-design Markdown](../ideation/heat-safe-crew-agent-plan.md). Those remain the references for the original concept, technical approach and identified datasets. The purpose here is to follow one site decision from the heat signal to a crew response, then ask who would buy that workflow and whether it could become a viable service.

Buyer benefits, prices and operating costs below are worked assumptions, not measured savings or supplier quotes. Named companies are research candidates, not customers or confirmed partners. The longer-term financial case is a discussion aid; it is not funding required for the hackathon demo. **Currency note:** USD equivalents are approximate, rounded to the nearest dollar at **1 USD = 3.6725 AED**, using the [CBUAE published rate](https://centralbank.ae/en/forex-eibor/exchange-rates/). AED remains the calculation basis, so rounded USD figures may not sum exactly.

## A heat alert at one work front

Imagine a fictional Abu Dhabi construction project in summer. A crew is doing a permitted morning task on an exposed work front, with a delivery booked later. A local instrument reports conditions that cross a heat guideline boundary. The supervisor must decide what the crew does, whether the delivery or task moves, how to explain the action in workers’ languages, and what to record. A meter reading alone does not complete that work.

The employer already owes workers a heat programme. The current ADOSH-SF CoP 11.0 calls for a site risk assessment; an effective programme where a shift could reach 35 °C unless documented risk assessment and Thermal Work Limit (TWL) show no risk; assessment against TWL; and communication of conditions, rest, water, shade, acclimatisation and training in a language workers understand. [ADPHC CoP 11.0, sections 2–3](https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Codes-of-Practise/11---Safety-in-the-Heat-v31-English.pdf).

The UAE midday break also restricts outdoor work under direct sun from 12:30 to 15:00 between 15 June and 15 September, subject to specified exemptions. These are existing obligations, not a new market created by software. [MoHRE guide](https://www.mohre.gov.ae/assets/download/11018ec0/Occupational-Health-and-Safety-Guide-EN.pdf.aspx); [MoHRE administrative decision, article 11](https://www.mohre.gov.ae/assets/download/6786916a/administrative-decision-no-19-of-2023-relating-to-occupational-safety-and-health-and-labour.aspx).

Heat-Safe Crew proposes a narrowly scoped operating service: measured conditions at the work front, a pre-agreed crew action and a clear supervisor record. It should make required controls easier to execute consistently and provide a trustworthy account of what happened. The commercial hypothesis is that an employer or principal contractor will pay for this execution layer when its existing heat plan is hard to operate or audit.

The [ILO's 2024 review](https://www.ilo.org/publications/heat-work-implications-safety-and-health) documents occupational heat illness and wider health consequences. It supports the importance of prevention, but global injury or productivity estimates are not a site-specific avoided-cost calculation. The local discovery deck's account of stigma, lost wages and subcontractor incentives is a plausible working model, not interviewed evidence. A pilot must ask workers and subcontractors whether these mechanisms are actually present on its site.

## The response workflow

The proposed chain is **local sensor reading → deterministic approved rule → AI-assisted coordination → supervisor approval → timestamped record**. The minimum offer is a supervised, one-site summer programme:

1. A competent occupational hygienist and the employer agree where conditions differ enough to require measurement. Calibrated TWL-capable instruments record dry-bulb, wet-bulb, globe temperature and air speed at representative work fronts.
2. A deterministic, versioned rule table presents the locally approved action for each work type and zone. Crew-facing signs and reviewed translations explain it.
3. The supervisor records actual controls, overrides, data gaps and restart decisions. The programme exports a timestamped record for health, safety and environment (HSE) and project review.

The forecast may help plan the morning, but field measurements and the employer's risk assessment govern the action.

The thermal rules and their source documents are covered in the original idea Markdown. The commercial limitation is that a published risk zone does not automatically authorise a universal stop or certify this implementation as safe. Work/rest and withdrawal decisions need task-specific employer and qualified reviewer approval; the mandatory code and supporting technical guidance are not interchangeable. [ADPHC technical guideline register](https://www.adphc.gov.ae/en/Legislation/Technical-Guidelines).

The differentiator worth testing is a shared crew instruction plus a commercially usable event record. A work-front signal may reduce the need for one worker to disclose weakness; this is a behavioural hypothesis, not a proven cultural fact.

Individual symptoms still need a confidential first-aid escalation path, because a crew-level sensor cannot detect personal illness. The first version should collect no worker biometrics, individual symptom history or worker ranking. If someone identifies symptoms, the employer's trained response takes priority. This boundary reduces privacy work and shortens the path to a site pilot, though data protection duties for logs and contact details remain.

### What AI adds and where sensors fit

**Every heat alert comes with a site-specific response plan.** The LLM helps the supervisor answer “What do I do with this crew now?” Using the approved procedure, crew/task/location list and available recovery facilities, it prepares a sourced response checklist, flags schedule conflicts and drafts messages for review. For example, an alert for Zone B could identify the assigned crew, highlight an incoming delivery and suggest an alternative task, explicitly asking for confirmation of capacity and qualifications. Start with checklists and communication; broader replanning needs reliable task and resource data.

The deterministic rules engine sets restrictions and supplies approved safety wording. The LLM may retrieve context and propose operational options, but cannot change thresholds, invent safe conditions or authorise a restart. Supervisors approve changes and messages; alerts and local records must work without AI. Test whether the assistant reduces response-preparation time and missed steps, rather than claiming health outcomes.

| Supplier / manufacturer | Candidate hardware and practical route |
|---|---|
| **Scarlet Tech, through Anaum International in Abu Dhabi** | **TWL-1SV** fixed station supplies TWL/WBGT, environmental readings, logs and RS485/Modbus integration; **TWL-1S** is a portable option. Approach Anaum for a demo unit, sample logs and integration details. [Station](https://scarlet-tech.com/products/heat-stress-meter-twl-1sv/) · [Portable meter](https://scarlet-tech.com/products/heat-stress-meter-twl-1s/) · [Authorised distributors](https://scarlet-tech.com/partner-distributors/) |
| **Kestrel / Nielsen-Kellerman** | **Kestrel 5400** portable TWL/WBGT meter with logging and optional LiNK Bluetooth: a candidate for the hackathon and portable comparison readings. Confirm export access, configuration and UAE delivery. [Product](https://kestrelinstruments.com/kestrel-5400-heat-stress-tracker) |

**Demo without hardware:** replay clearly labelled synthetic readings in a common application schema (time, work area, TWL, environmental inputs, source and freshness), exercising rising heat, stale readings and sensor failure. These are simulated inputs for the intended hardware workflow, not vendor measurements or a verified device integration. Add a fictional roster and approved-rule mock to demonstrate alert → response checklist → supervisor approval → event record. Live adapters follow sample-file/register-map verification. Supplier willingness, stock, loan/rental terms, calibration and prices remain unconfirmed.

### Data feasibility and limits

The existing [idea Markdown — Data sources](../ideation/heat-safe-crew-agent-plan.md#data-sources) is the reference for dataset names, API links, geographic coverage, reported downloads and synthetic inputs. The [discovery PDF](../ideation/FHD-Climate-Resilient-Worker-Health-Discovery-1.pdf) sets out the proposed site measurements and field-validation questions. That inventory is not repeated here; the opportunity plan carries the limitations and their consequences:

- **UAE coverage is not work-front accuracy.** International datasets queried for UAE locations describe regional conditions. They do not resolve each work front's radiant heat, shade, enclosure, local airflow or protective clothing. Use them for planning and replay; a live site pilot needs calibrated local measurements and a placement assessment.
- **Calculated heat stress still needs validation.** The idea Markdown itself reports that its full-sun calculation reaches the model floor for much of the replay day and requires checking against measured conditions. The estimated index and its warnings are not validated field performance.
- **Foreign occupation data are contextual proxies.** They do not establish UAE task intensity, clothing, work practices or safe limits. Confirm those inputs with the actual site's operations team and qualified reviewer.
- **Synthetic cases establish software behaviour, not health outcomes.** Simulated crews, sensors, wearables and incidents can test rules, failure handling and the demonstration. They cannot establish real illness prediction, clinical false-alarm rates, adherence or incidents prevented.
- **Local operational and buyer evidence remain unverified.** Access to contractor sensor logs, worker outcomes, contracts, payroll practices and baseline workflow costs has not been established. The discovery PDF's actor map and illustrative day are hypotheses to test through permitted site research; neither proves customer ROI or a right to recover delay costs.
- **Reported assets are not yet independently verified here.** The idea Markdown reports downloaded datasets, cloud tables, implemented code and passing tests. The referenced implementation and data files were not found in this archive. Locate the original project and verify its manifest and test results before duplicating work or claiming readiness; absence here does not establish that those assets do not exist elsewhere.
- **Access terms and reviews affect delivery cost.** The original plan flags a commercial-use restriction on the free weather service. Confirm the selected service's current licence, commercial access, attribution and reliability terms before a paid pilot. Worker-facing translations, site rules and any health-data handling also need appropriate review before live use.

These limitations permit a clearly labelled prototype using the existing data strategy. They make a qualified site pilot the next validation step before operational safety or financial-outcome claims.

## The buyer and the decision window

### Who uses and approves it

The first customer should be one principal contractor responsible for an Abu Dhabi outdoor construction site. The proposed buying group has distinct roles:

- **HSE lead:** sponsors the heat protocol and safety review.
- **Operations director or project manager:** approves changes to work sequencing.
- **Procurement or project commercial lead:** approves the purchase.
- **Supervisors and foremen:** use the signal and record daily.
- **Workers:** receive understandable instructions and retain the right to report symptoms and stop unsafe work irrespective of a meter reading.

The employer, not the software supplier, remains responsible for legal compliance, first aid, medical referral and wage obligations. These role assignments are proposed sales discovery questions, not established purchasing facts.

The client or developer is a distinct decision maker. It may pay for a heat allowance or agree a prospective change to time or cost treatment, but only if its contract governance permits it. The principal contractor may buy the site service without a clause; the clause adds value only where the client and relevant subcontract tiers sign workable terms.

A subcontractor may benefit from documented instructions and less ambiguity but is unlikely to purchase a site-wide system that the principal contractor does not recognise. ADPHC and the Department of Municipalities and Transport (DMT) are regulators or potential programme partners, not presumed product customers.

### Why a decision might be timely

Three credible triggers could prompt a conversation: a contractor preparing its next summer heat programme, a project planning a new outdoor work package, or a client negotiating the next contract or variation. As of 3 November 2026, the annual midday restriction has ended; the practical buying window for a 2027 summer pilot is a pre-summer HSE and procurement cycle.

The calendar alone is insufficient. A principal contractor with calibrated meters, good rest facilities and reliable records may have little reason to switch. A named operational problem, budget owner and decision date are needed before this becomes a sales opportunity.

**Conditional compelling reason to act, for a buyer meeting.** *If* this contractor will approve its 2027 site heat plan, measurement budget or subcontract terms in the first quarter, waiting until the June restriction begins leaves little time for instrument placement checks, worker-language testing and any negotiated treatment of exceptional heat disruption. The annual restriction dates come from [MoHRE's occupational health and safety guide](https://www.mohre.gov.ae/assets/download/11018ec0/Occupational-Health-and-Safety-Guide-EN.pdf.aspx).

Ask for a named HSE and commercial owner for one site, access to its current heat plan and contract schedule, and a decision on a four-week shadow evaluation before those documents are fixed. This is a discovery proposition, not evidence of a gap or a known planning date. If the documents are settled and controls work well, the urgency and perhaps the sale disappear.

An [official Abu Dhabi procurement listing](https://supplier.adgpg.gov.ae/pages/tender-detail.html?tenderid=1424654) records DMT RFQ **635105000320**, “Implementing Abu Dhabi OSH System Framework in Building & Construction Sector,” opened 20 October and due 9 November 2026. The indexed listing places it under management advisory services and displays AED 0–0 (≈ USD 0–0) as estimated value. The publicly rendered page does not reveal specifications or a real budget.

It shows procurement activity around OSH implementation; it does **not** show demand for Heat-Safe Crew, a sensor purchase, a pilot budget or an award. Treat it as a possible route to learning how implementation is procured, not as a near-term revenue forecast.

### Worked buyer value and the cost of inaction

**The buyer pays for less avoidable coordination, duplicated administration and disruption—not for another heat alert.** Sensors establish local conditions; the response assistant could shorten the work needed to identify affected tasks, prepare instructions and coordinate a safe alternative. Existing meters and procedures are the baseline. Only improvement beyond that baseline counts as product value.

The following is a **worked hypothesis for one 13-week site-season**, not observed savings or UAE wage evidence. Use actual site records to replace every time and cost assumption.

| Potential benefit | Illustrative calculation | Seasonal value |
|---|---|---:|
| Less duplicated reporting and record reconciliation | 3 staff-hours/week × 13 weeks × AED 250 (≈ USD 68)/hour | AED 9,750 (≈ USD 2,655) |
| Faster response preparation and coordination | 5 separate supervisor/planner hours/week × 13 weeks × AED 250 (≈ USD 68)/hour | AED 16,250 (≈ USD 4,425) |
| Less avoidable waiting after a safe alternative is available | 30 workers × 1 hour × 20 events × AED 30 (≈ USD 8)/worker-hour | AED 18,000 (≈ USD 4,901) |
| **Total potential usable capacity value** | **Sum of distinct hours above** | **AED 44,000 (≈ USD 11,981)** |

Against an illustrative **all-in fee of AED 30,000 (≈ USD 8,169)**, that scenario leaves **AED 14,000 (≈ USD 3,812) net economic value**, or about **47% return on the fee**. The fee must include agreed equipment, installation, training and support; any additional buyer cost reduces the result.

Staff capacity is not automatically cash saved: it must support useful work, reduce overtime or external spend, or avoid an evidenced downstream cost. The calculation counts distinct hours and excludes project-delay savings already represented by them. Required rest, recovery and restrictions are never “waste” to eliminate; the waiting scenario applies only where an approved alternative genuinely exists.

**The purchase can also fail the value test.** If only one reporting hour and one coordination hour per week are saved, plus 15 minutes per worker per event for 30 workers across the same 20 events, gross value falls to **AED 11,000 (≈ USD 2,995)**. At the same fee, net value is **negative AED 19,000 (≈ USD 5,174)**. In that case, the buyer should keep its existing process, seek a cheaper workflow improvement or require a narrower offer. A safety need alone does not prove that this particular product is worth its price.

**Cost of inaction:** if the stronger scenario is verified, leaving the workflow unchanged for another comparable season forgoes up to **AED 44,000 (≈ USD 11,981)** in usable capacity; after the avoided purchase fee, the net opportunity forgone is **AED 14,000 (≈ USD 3,812)**. This is conditional, not an automatic loss or an urgency claim. Hypothetical prevented illness, fines, insurance discounts and delay claims are not included in this calculation. If the existing process already performs well, the incremental opportunity may be zero.

For the hackathon, show the supervisor completing the same alert-response task with and without the assistant: time taken, missed steps and record completeness. This can support a narrow workflow claim, not seasonal ROI. A later buyer evaluation must establish baseline event frequency, distinct staff time, safely recoverable waiting, actual loaded costs and whether released capacity is usable. **The commercial question is whether verified incremental value exceeds the full cost of adoption.**

## Market boundary and commercial model

There is no defensible worker-count TAM in the present evidence. An [Abu Dhabi Chamber report published 30 June 2026](https://www.abudhabichamber.ae/ar-AE/media-centre/news/AbuDhabi-Chamber-Construction-Report-2026) says the emirate had more than 38,600 active construction licences in February 2026, but licences include many businesses that are not suitable outdoor sites and do not identify purchasing entities. That number cannot be multiplied by a price. The older brief's UAE construction-dollar value, 1.4 million workers, 0.4 million Abu Dhabi outdoor workers, USD 16–48 million annual serviceable market and year-three ARR are therefore removed from the case until independently substantiated and filtered to reachable sites.

The addressable unit is a **contracted site-season**, with extra measurement fronts priced for the work required. The next exercise is to assemble a named list of active or planned Abu Dhabi projects, identify the principal contractor and client, check outdoor labour intensity and contract timing, then record which sites meet the technical and commercial qualification criteria. A counted, deduplicated list with named decision makers would make a serviceable market estimate possible. Until then, the following is a capacity scenario, **not** a forecast or statement of market size:

| Hypothetical paid site-seasons in one year | At AED 20,000 (≈ USD 5,446) per site-season | At AED 40,000 (≈ USD 10,892) per site-season |
|---:|---:|---:|
| 5 | AED 100,000 (≈ USD 27,229) | AED 200,000 (≈ USD 54,459) |
| 20 | AED 400,000 (≈ USD 108,918) | AED 800,000 (≈ USD 217,835) |
| 50 | AED 1,000,000 (≈ USD 272,294) | AED 2,000,000 (≈ USD 544,588) |

The AED 20,000–40,000 (≈ USD 5,446–10,892) price is an unvalidated willingness-to-pay hypothesis for software, setup, training and ordinary support on one site; calibrated equipment, installation, data connectivity, added fronts, clinical services and contract legal work must be quoted separately or transparently included. The older USD 8,000–20,000 kit and USD 2–5 per worker-month are similarly unvalidated and awkwardly tied to headcount rather than measurement coverage. Interview buyers on their current heat-programme spend, quote real sensor and service costs, and test whether a seasonal site fee matches the procurement line they can actually use.

The optional commercial artefact is a draft heat-delay schedule for counsel and the project parties to negotiate before use. It would define the measurement source, qualifying events, notification deadlines, contemporaneous evidence, shared costs, exclusions, dispute process and subcontractor treatment. Every rest cycle is not a compensable delay, and a side letter cannot override labour rights. If the client refuses these terms, the site service has to stand on operational safety and audit value; its financial thesis becomes smaller.

### Existing alternatives and the competitive boundary

The status quo is meaningful competition. Employers can implement the existing ADPHC [Safety in Heat programme](https://www.adphc.gov.ae/en/Public-Health-Programs/Injury-Prevention/Safety-in-Heat) using training, printed materials, shade, water, supervisors and a TWL meter. ADPHC already provides materials in several worker languages, so translation alone is no differentiator. This is credible, relatively cheap and may be entirely sufficient. MoHRE reports roughly 99% company compliance with the midday break; that figure is about the break, not proof that all heat exposures or records are well managed. [MoHRE labour market observatory](https://observatory.mohre.gov.ae/en/uae-labour-market-priorities/social-protection-and-well-being-assurance).

The equipment market is not empty:

- [Scarlet's TWL-1SV](https://scarlet-tech.com/products/heat-stress-meter-twl-1sv/) advertises real-time TWL/WBGT readings, LED risk alerts, browser and email alerts, local logs, export and a multi-site portal. It could be a measurement partner; Heat-Safe Crew cannot claim unique live TWL, alerts or logs.
- [SlateSafety's BEACON V2](https://slatesafety.com/products/beacon-v2/) monitors local ambient conditions and estimated WBGT within its system; [BAND V2](https://slatesafety.com/products/band-v2/) adds physiological monitoring. They may suit employers who want individual heat-strain detection.
- EGA reported a [2023 expansion of a Kenzen wearable trial to 350 volunteers](https://media.ega.ae/ega-extends-use-of-wearable-technology-to-beat-the-heat-in-the-uae-summer/). This is a UAE industrial use case, not a construction contract or a 2026 purchasing commitment.

A credible comparison must test installation, calibration, local support, export rights, integration and total cost against these alternatives.

Heat-Safe Crew should win only if the buyer values a field-tested work protocol and cross-party record beyond what existing instruments and HSE systems already provide. No evidence yet establishes an exclusive data advantage, superior heat prediction or a defensible software moat. If a supplier can add a suitable crew workflow and contract export at lower cost, partnering or licensing may be better than building a competing sensor stack.

### First ten accounts and distribution

**Target account, not lead:** the economic unit is a principal contractor with an outdoor Abu Dhabi work front expected to operate in summer 2027. Score candidates before contact on:

1. Outdoor labour intensity and distinct sun/shade or PPE conditions.
2. A 2027 programme or contract decision still open.
3. An HSE owner willing to show the heat plan and meter process, and an operations owner able to change crew instructions.
4. A procurement route and site-level budget owner.
5. Worker-language and paid-rest safeguards, plus permission to measure a baseline.

A project page proves relevance to investigate, not a live work front, decision maker, gap or willingness to buy. De-duplicate related companies before estimating the reachable market.

| Discovery priority | Named account and public reason to investigate | First qualification question |
|---|---|---|
| 1 | [National Projects & Construction (NPC)](https://npc.ae/) lists Abu Dhabi infrastructure and public-realm work, including Hudayriyat and Saadiyat. | Which listed package will still have outdoor crews in summer 2027? |
| 2 | [Al Geemi Contracting](https://algeemi.com/ongoing-project/) lists ongoing Abu Dhabi roads, utilities and site-logistics work. | Who owns work-front TWL measurement on its current packages? |
| 3 | [ASGC](https://www.asgcgroup.com/news/asgc-increases-its-market-share-with-four-new-projects) names Aldar's Grove and Al Gurm Abu Dhabi awards. | Is there an upcoming outdoor work package where a new process can be trialled? |
| 4 | [Trojan General Contracting](https://www.trojan.ae/) lists Abu Dhabi housing and mixed-use projects. | Is its central HSE programme open to a one-site comparison? |
| 5 | [Al Jaber Transport & General Contracting](https://aljaber.com/contact-us/contact-details/) is an Abu Dhabi road and infrastructure contractor. | Which 2027 site, if any, has an unfilled measurement or record need? |
| 6 | [Al Jaber Building](https://aljaber.com/companies/al-jaber-building/) has Abu Dhabi housing and villa construction experience. | Does a villa or public-realm site have a separate budget for heat programme operations? |
| 7 | [ALEC](https://www.alec.ae/) has an Abu Dhabi office and a UAE construction business. | Is there a qualifying Abu Dhabi work front rather than only historic projects? |
| 8 | [BESIX / Six Construct](https://www.besix.com/en/projects/guggenheim-abu-dhabi) names its Abu Dhabi Guggenheim construction joint venture. | What post-2026 site could support a 2027 evaluation? |
| 9 | [NMDC Dredging & Marine](https://www.nmdc-group.com/en/projects/) lists ongoing Abu Dhabi marine projects. | Do its marine sites have a separate heat protocol and procurement route? |
| 10 | [NMDC Infra](https://www.nmdc-group.com/en/projects/) describes Abu Dhabi civil and marine work in the group portfolio. | Is a land-based construction front suitable, or would marine exposure require a different product? |

This is a **research queue**, not ten independent sales opportunities. NPC and Trojan share a group; the Al Jaber and NMDC entities may share purchasing authority; BESIX's named project is scheduled through 2026. No relationship with these firms is implied.

Begin with these ten and replace stale or duplicate accounts with another ten to twenty researched candidates. Work toward ten qualified conversations, three site-specific problem briefs, two priced evaluations and one signed conditional evaluation order. Those are acquisition targets, not conversion benchmarks or a forecast.

Build an account sheet recording project, likely season, current method, named HSE sponsor, operations approver, economic buyer, procurement path, disqualifier and next decision date. Approach contractor HSE and project operations jointly through an introduction or direct professional contact. Bring a one-page workflow comparison and request a 30-minute process walk-through, not a broad innovation pitch.

**Direct distribution is the first path.** Founder identifies the site and buying group; HSE and a qualified heat-safety reviewer approve a shadow protocol; operations selects the work front; procurement and legal approve a fixed-scope evaluation; the vendor delivers training and logs; HSE and operations decide on live use; a budget owner buys the site-season. This keeps safety accountability explicit and exposes procurement friction early. The proposed sales path is through the contractor rather than individual workers or app-store distribution.

**Partner distribution is a later multiplier, not the assumed first sale.** [Anaum International](https://scarlet-tech.com/partner-distributors/) is listed by Scarlet as its Abu Dhabi distributor and could supply or service a TWL instrument. [SGS UAE](https://www.sgs.com/en-ae/services/occupational-and-industrial-hygiene-services) offers occupational hygiene exposure assessment and training and could independently review a site protocol. A contractor's existing HSE consultant may be a better integrator than either.

For each channel, test three roles: referral only, resell and install, or joint evaluation. Offer a disclosed referral fee or wholesale margin only after the partner proves site access, support capability and acceptable conflicts. Initial terms need no exclusivity. Confirm data export/API rights and calibration responsibility before integration; do not assume a hardware partner shares data or accounts.

A meter vendor may prefer its own portal; a consultant may not want to certify a product it resells. The independent reviewer must be free to reject unsafe thresholds, and compensation must never depend on fewer recorded heat events.

The employer is the controller/decision maker for its site and employment records under the proposed contract; Heat-Safe Crew is a limited service provider for environmental and crew-event records. Workers get a clear language-appropriate notice and a symptom route outside the commercial log. Give the employer export and deletion rights, specify access and retention, and forbid resale or cross-customer use of identifiable site data. The client gets only agreed event evidence, not worker-level information. A distributor gets instrument service data only; a reviewer gets minimum necessary site evidence. Contractual roles and local law need counsel review before a field pilot.

### Sale and procurement motion

1. **Discovery and qualification (weeks 0–3).** Obtain the current heat plan, measurement map, sample redacted records, upcoming work schedule, current meter/vendor list and purchase process. Ask what budget line pays for HSE software/service, whether vendor onboarding and information-security review apply, and who can sign a site purchase order. Reject the lead if no operational gap, no paid-rest protection, no named owner, or no relevant 2027 site.
2. **Paid shadow evaluation (4 weeks, indicative AED 12,000 (≈ USD 3,268)).** Sign a capped statement of work for **one measurement front**: existing employer controls authoritative, instrument rental and calibration, reference checks and protocol review by a qualified reviewer, no worker health data, no automatic work stoppage, defined incident escalation and data deletion. Deliver a baseline workflow map, tested translations, timestamped evaluation logs and a readout. Itemise the instrument and reviewer allowances inside the quoted fee; quote any additional front or unusually costly site access separately. A free pilot would obscure delivery economics.
3. **Decision and site-season order (2–6 weeks after readout).** HSE signs the rule/placement and fallback procedure; operations accepts work-plan effects; procurement/security/legal complete supplier, data and insurance checks; commercial owner accepts a fixed site-season fee and extra-front quote. A client heat-delay schedule is a parallel, optional counsel-led negotiation and need not block the HSE sale. Ask for a written purchase order, not an informal letter of interest.
4. **Rollout (next hot season).** Train each shift and language group, audit placement and manual fallback, hold weekly HSE reviews and one monthly commercial review, and renew only after an agreed measurement of action reliability, worker comprehension and support cost. Multi-site expansion requires a new site map and procurement approval, not merely copying dashboard access.

This process could take months; a hackathon introduction is the start of discovery, not a distribution channel or sales commitment. If a public agency later wishes to buy, use its formal supplier/competition route. [Abu Dhabi Government Procurement Gate guidance](https://adgpg.gov.ae/Trading-With-Government/Becoming-a-Registered-Supplier) states that registration or qualification does not guarantee shortlisting; the DMT RFQ mentioned above is adjacent research, not a bid pipeline.

### Objections that decide whether there is a business

| Objection | Grounded response and possible concession | Discovery question | Proof required before a sale claim |
|---|---|---|---|
| “We already comply with the midday break.” | Accept that it is a strong baseline. Scope the trial to work-front conditions, permitted working hours, acclimatisation and the quality of actual records. If these are already handled well, do not add a system. | Which heat decisions or audit records are still difficult outside the restricted midday hours? | Existing heat plan, measured TWL logs, rest and inspection records, supervisor observation. |
| “Our meter and HSE software already do this.” | Integrate existing certified meters and exports where possible; sell the protocol and event record only if a real workflow gap remains. | What happens from a high reading to an authorised work change, and how is it documented? | Side-by-side workflow and cost test against current tools, including Scarlet or equivalent. |
| “A red light will stop productive work all day.” | A red indicator does not mean a blanket shutdown. Define task-specific controls and, where justified, a stop rule with an occupational hygienist and employer. Start in advisory mode before live triggers. | What work can be resequenced or moved to shade, and who approves restart? | Threshold validation, control adherence, false-trigger review and production schedule impact. |
| “The client will never pay for weather.” | Make contractual cost sharing optional. Offer a site HSE service if it has independent value; limit contract drafting to an agreed pilot rather than promising claims. | Does the current contract allocate exceptional heat delay or mandated rest? | Relevant contract clauses, counsel's review and written client decision. |
| “Subcontractors or workers will ignore breaks if pay suffers.” | This is a potential deal breaker. Test the wage and flow-down arrangements, and offer a pilot only where the employer commits to the required pay and protected rest. | How are scheduled and unscheduled rest, piecework and downtime paid today? | Worker interviews in their languages, payroll or contract evidence, observed adherence. |
| “The device can be wrong or tampered with.” | Use calibrated reference checks, documented placement, fault flags and a manual fallback. Missing data cannot imply safe conditions. | Who maintains meters and what happens when readings are unavailable? | Calibration records, placement audit, uptime and deliberate failure tests. |
| “You are collecting health data on migrants.” | The base offer uses environmental and crew-event data, with no biometric or individual performance profile. Workers can report symptoms through existing confidential safety channels. | Which data is necessary for the decision, and who can access each record? | Data map, retention/access review, worker-facing explanation and independent privacy review. |
| “This is a hackathon prototype.” | Offer a paid or bounded evaluation, not production safety automation. The employer's existing controls remain authoritative until qualified review and field validation. | What procurement and HSE gates govern a trial on this site? | Signed test protocol, qualified safety sign-off, insurance and procurement requirements. |

## What the vendor economics require

The buyer-value calculation above concerns the customer. The separate cost-to-serve model below asks whether the supplier can deliver profitably. **Illustrative January–December 2027 case, AED, excluding VAT; not a forecast.** The case assumes two four-week paid shadow evaluations and four distinct site-season orders. Each covers **one measurement front**. A pilot may convert into a season: count its fee once and price the later order separately.

| Order and price assumption | Quantity | AED per order | ≈ USD per order |
|---|---:|---:|---:|
| Four-week shadow evaluation | 2 | 12,000 | 3,268 |
| Site-season | 4 | 30,000 | 8,169 |

The variable delivery costs below are **unquoted allowances**, not supplier prices or evidence that a suitable instrument or reviewer can be bought for them.

| Shadow evaluation cost allocation, per evaluation | AED | ≈ USD |
|---|---:|---:|
| Instrument rental/calibration | 2,400 | 654 |
| Independent qualified protocol and reference-check reviewer | 2,600 | 708 |
| Installation/field visits | 1,500 | 408 |
| Training and reviewed translations | 1,000 | 272 |
| Connectivity/support | 500 | 136 |
| **Total variable cost** | **8,000** | **2,178** |

| Site-season cost allocation, per season | AED | ≈ USD |
|---|---:|---:|
| Instrument rental/calibration | 3,500 | 953 |
| Qualified review and periodic checks | 3,000 | 817 |
| Field visits/training | 2,000 | 545 |
| Connectivity/support | 1,500 | 408 |
| **Total variable cost** | **10,000** | **2,723** |

Reprice or redesign if mandatory one-front costs exceed these allowances. Added fronts, hardware ownership, extraordinary access and separate legal work need new quotes.

| Annual fixed cash-cost assumption | Basis | AED | ≈ USD |
|---|---|---:|---:|
| Founder/commercial effort | 0.4 full-time equivalent at AED 240,000 (≈ USD 65,351) annual fully loaded | 96,000 | 26,140 |
| Product/engineering and safety operations | 0.6 at the same annual rate | 144,000 | 39,210 |
| Insurance, hosting, bookkeeping and travel | Allowance | 30,000 | 8,169 |
| **Total fixed cash cost** | | **270,000** | **73,519** |

Validate these planning allowances with local quotes and an actual delivery schedule before treating the model as financeable.

| Item | Arithmetic (AED) | AED | ≈ USD |
|---|---:|---:|---:|
| Shadow evaluation revenue | 2 × 12,000 | 24,000 | 6,535 |
| Site-season revenue | 4 × 30,000 | 120,000 | 32,675 |
| **Total collected revenue if all invoices pay** | 24,000 + 120,000 | **144,000** | **39,210** |
| Variable delivery cost | (2 × 8,000) + (4 × 10,000) | (56,000) | (15,248) |
| Founder/commercial time | 0.4 × 240,000 | (96,000) | (26,140) |
| Product/engineering and safety operations time | 0.6 × 240,000 | (144,000) | (39,210) |
| Other fixed cash cost | allowance | (30,000) | (8,169) |
| **Illustrative operating cash result** | 144,000 − 56,000 − 270,000 | **(182,000)** | **(49,558)** |

At an AED 30,000 (≈ USD 8,169) season price and AED 10,000 (≈ USD 2,723) variable cost, contribution is AED 20,000 (≈ USD 5,446) per season. Against AED 270,000 (≈ USD 73,519) annual fixed cash cost, simple operating break-even needs **14 paid site-seasons** (13.5 rounded up). This assumes no pilots, bad debt or added hardware purchase, and steady staffing.

Two pilot fees contribute AED 8,000 (≈ USD 2,178) combined. Even then, 14 season orders are needed to cover the remaining AED 262,000 (≈ USD 71,341). Four seasons are a stretch sales case; fourteen require a validated repeatable channel and delivery capacity, neither established now. The earlier 5/20/50-site sensitivity is a capacity illustration, not a forecast.

**Reseller sensitivity.** If a later reseller retains an illustrative 20% of the AED 30,000 (≈ USD 8,169) season price and we still bear AED 10,000 (≈ USD 2,723) delivery cost, contribution falls to AED 14,000 (≈ USD 3,812). Covering AED 270,000 (≈ USD 73,519) fixed cost would then require 20 site-seasons, before pilot contribution. This is not an agreed commission. Accept the margin only if the partner demonstrably reduces acquisition/delivery effort or opens enough additional qualified sites; do not assume both the direct-sales margin and free partner reach.

For cash planning, invoice 50% at signature and 50% at accepted evaluation or mid-season milestone. Even if every AED 144,000 (≈ USD 39,210) invoice is collected by year-end, the base case consumes AED 182,000 (≈ USD 49,558).

**AED 225,000 (≈ USD 61,266) is a provisional base-case funding target:** the modeled AED 182,000 (≈ USD 49,558) loss plus an illustrative AED 43,000 (≈ USD 11,709) timing/overrun buffer. It is not a guaranteed peak cash need. Build a monthly cash schedule from actual instrument/reviewer quotes, deposits, supplier prepayments and buyer payment terms before making commitments.

If only two pilots sell and no seasons, revenue is AED 24,000 (≈ USD 6,535), variable cost AED 16,000 (≈ USD 4,357), and the unchanged fixed plan would consume AED 262,000 (≈ USD 71,341)—already more than the AED 225,000 (≈ USD 61,266) target. At that gate, cut at least AED 37,000 (≈ USD 10,075) of fixed spend or secure more funding. Delayed invoices do not solve the gap; do not promise a paid site-season until delivery, liability and insurance costs fit the quote.

## The hackathon demonstration

**Distinctive thesis.** The first health intervention is a crew instruction the foreman can carry out, backed by measured work-front conditions and an auditable record. The defensible demonstration is the transition from heat signal → approved action → worker-language communication → human acknowledgement → event evidence, including what happens when the signal fails. This is clinically relevant prevention and an HSE workflow, not diagnosis or a claim to predict individual heat illness. The optional contract schedule explains why a contractor might fund the workflow, but no judge needs to believe a delay claim will pay for the safety case.

The selected official statement is **Climate-Resilient Worker Health, Challenge 07**, verified through the interactive [challenge page](https://hack2skill.com/event/futurehealthchallenge/). The demonstration below maps our implementation to it; it is not an official scorecard. See the [shared competition strategy](../../00_cross-cutting/FHDIC_Ideation_Assessment_Business_Plans.md) for dates, eligibility, assessment dimensions and submission terms.

### Prototype boundary and evidence by submission

Build **one end-to-end browser demo** using the idea Markdown's replay and synthetic-input strategy, with the [limitations above](#data-feasibility-and-limits) visible. The reviewer can change work type, sun/shade, **simulated or manually entered TWL input visibly labelled by source**, and sensor status.

The demo follows a complete response sequence:

1. A versioned deterministic table returns the guideline zone and an *illustrative action awaiting employer and qualified reviewer approval*.
2. A supervisor acknowledges it, changes a task or invokes a manual override with reason. A worker view shows two fixed language templates and an icon, labelled if fluent review is pending, plus a symptom/emergency route.
3. The export preserves source, time, rule version, input freshness, decision, acknowledgement and override. A planning view shows how a work package might move to a cooler period, with lost time recorded rather than erased.

The LLM response assistant may explain the computed result, retrieve site context and draft the supervisor checklist and operational options. Mandatory safety action text comes from approved fixed templates, and changes require supervisor approval. A November replay and winter bench demonstration cannot prove that thresholds, placement, worker instructions or response times are safe in summer field conditions.

**Non-goals by 20 November:** field control of a live site, a medical risk score, a symptom detector, wearables, a new sensor design, a claims engine, automated stop-work authority, production integration, a population incidence reduction claim, or a full summer backtest presented as clinical validation. Apply the [data limitations](#data-feasibility-and-limits) when describing prototype readiness and results.

The minimum honest evidence pack contains:

1. Cited CoP and technical-guideline rule transcription checked against the current PDF, with employer-specific assumptions marked.
2. Ten to twenty predeclared scenarios: zone boundaries, heavy/light work, midday-restriction hours, unacclimatised worker, stale/missing meter, network loss, override and emergency report.
3. A test log with input, expected result, observed result and remaining defect; and a screen recording of the complete flow and offline fallback.
4. Two language templates checked by a fluent reviewer if available. Otherwise label them **unreviewed demo text** and never use them as safety instructions.
5. A clinician or occupational-health/HSE review of the *protocol* if schedulable, with reviewer role and objections recorded.

A November replay can show functional correctness against selected scenarios and workflow usability. It cannot establish real-world alert false-positive rates, illness prevention, worker trust or legal compliance. Label simulated lead-time, false-alarm, adherence, symptom and lost-time numbers as simulated; do not turn synthetic symptom events into clinical performance claims.

### Working demo storyboard and fallback

| Scene | What the judge sees and what actually works | Proof point |
|---|---|---|
| 1. Baseline | A named *fictional* site and crew begin a permitted morning task; the view shows source, timezone, sun/shade, work type and input age. | No ambiguous “live site” implication. |
| 2. Heat change | Replay advances; a TWL input crosses a guideline boundary. The deterministic function reveals the applicable zone, rule version, work/rest example and a link to the specific guidance. | Technical and safety logic visible, not an opaque AI score. |
| 3. Shared action | Supervisor accepts an approved rest/rotation instruction; worker view switches between two templates; the event log records acknowledgement time. | A health action is connected to a real role and language. |
| 4. Failure injection | Disconnect the network and mark the meter stale/missing. Cached rule information and a conspicuous manual-check instruction remain available; queued acknowledgement syncs later. No green/safe state is inferred from missing input. | Safe fallback and data integrity. |
| 5. Commercial record | Export the event, rest and resequencing timeline with source/override provenance; show an illustrative contract-schedule field as **not agreed**. | A buyer can inspect the evidence without a fictitious claim entitlement. |
| 6. Limits | A short evidence screen separates verified source rules, simulated data, planned field validation and unresolved assumptions. | Responsible demonstration and pilot readiness. |

Use a cached local replay for the judged flow. The fallback depends on what is unavailable:

- **Instrument:** type or replay an explicitly **simulated site TWL reading** and show the future calibration interface; do not call it a measured field value.
- **Contractor heat plan:** use a clearly fictional plan and show what a qualified reviewer and employer must replace.
- **Language reviewer:** demonstrate English and a visibly unreviewed translated mock; remove translated safety advice from any deployment claim.
- **AI or cloud:** keep the deterministic path and local recording demonstrable, and record the failure honestly.

This backup preserves the working prototype requirement without fabricating partners, sensors or outcomes.

### Demo verification

The technical-depth story should show a real state transition and invariant tests, not a cloud-service inventory. The safety owner should attempt adversarial scenarios: a symptom report while TWL is low, sensor failure, a foreman override, a worker without a phone, an unacclimatised crew, and an instruction outside the allowed work window. For each, show the rule that prevents an unsafe “all clear” and the human response. The LLM cannot change thresholds or send novel safety advice.

### Pitch spine and hard questions

Rehearse a compact seven-slide narrative:

1. Worker and site decision.
2. Current CoP obligation and where execution can fail.
3. The crew-action thesis.
4. The live end-to-end demo.
5. Measured versus simulated evidence and failure handling.
6. Buyer, first ten-account qualification, paid evaluation and unit economics.
7. The precise ask for an HSE reviewer and a suitable 2027 shadow site.

Slide 6 should say that the base year-one case loses AED 182,000 (≈ USD 49,558) and scale requires roughly fourteen paid seasons at the assumed price/cost; that candour is stronger than a worker-count TAM. Keep the pitch focused on the demonstration, with architecture and sources available for questions. Show the working artifact before the presentation's midway point.

| Likely judge question | Answer to rehearse without overclaiming |
|---|---|
| “Why is this a health solution rather than project software?” | The core deliverable is timely, understandable execution of heat controls and an escalation route; commercial records fund and audit it. Demonstrate the action chain. |
| “What is new versus Scarlet, a meter or an HSE app?” | Existing products measure and alert. Our unproven differentiation is the cross-party crew protocol and event evidence. Show an actual workflow comparison; partner or stop if an incumbent already does it better. |
| “Can you claim fewer heat illnesses or a false-alarm rate?” | No. The November data are replayed/synthetic. We can report scenario correctness and latency in the demo; field reliability and health outcomes require a qualified summer pilot. |
| “Does low TWL mean a universal stop?” | No. The ADPHC guideline defines zones and work/rest examples by workload. A site-specific stop/withdrawal rule requires employer and qualified review. |
| “What if the worker is ill with a green reading?” | Individual symptoms bypass the crew signal and trigger the employer's first-aid/emergency process. Environmental readings never clear a symptomatic person. |
| “Who pays, and what if the client rejects the clause?” | Contractor HSE/operations buys a fixed-site service if measured workflow value clears procurement. The clause is optional; without it the service must pass an HSE-only willingness-to-pay test. |
| “Why can it scale?” | Reusable rule/versioning, export and training templates could lower marginal software effort, but each work front still needs placement, language and safety review. The AED 10,000 (≈ USD 2,723) variable cost is a hypothesis to validate. |
| “What is your most likely reason to fail?” | Contractor compliance may already be strong, procurement may outlast the season, or paid rest/data rights may block adoption. Buyer discovery and a potential shadow evaluation would test those assumptions. |

## After the demonstration: what the team needs to decide

The hackathon should establish that the alert-to-response workflow is useful and technically credible. The larger opportunity is a contractor-funded site service combining calibrated measurements, approved crew responses, AI-assisted coordination and auditable records. The commercial model above is a hypothesis, not a committed rollout. A sensor supplier could be both a hardware partner and a route to customers; the optional heat-delay agreement remains an upside to test.

Before pursuing a real deployment, validate three things: a contractor has a workflow gap and budget; local equipment, calibration and delivery costs support the price; and a qualified reviewer and employer can approve the site protocol. A potential shadow evaluation would compare response time, record completeness and supervisor effort while the existing safety programme remains in control. Worker understanding, protected rest and trustworthy measurements are essential; a hackathon demo cannot establish reduced illness or product-market fit. The next commercial ask is access to a suitable site and reviewer to test these assumptions, rather than a promised implementation timetable.

### Evidence and reference checks

The present evidence establishes a real Abu Dhabi heat obligation, published TWL guidance, a seasonal federal restriction, available competing instruments and an adjacent DMT OSH consulting RFQ. It does not establish a paying construction customer, national heat-delay market, legal right to recover rest time, worker preference for a crew signal or validated local ROI.

Points to carry into the pitch and any later technical validation:

- **High-risk TWL is not universally “stop.”** The technical guideline is guidance rather than the CoP itself; current CoP 11.0 is version 4.0 despite the official file's “v31” path.
- DMT's AED 0–0 (≈ USD 0–0) notice is not evidence of budget. EGA's 2023 Kenzen trial is industrial evidence rather than a 2026 construction purchase.
- Earlier market and payback estimates remain hypotheses until their assumptions and addressable customer counts are substantiated.
- The [ADPHC code register](https://www.adphc.gov.ae/en/Legislation/Code-of-Practices) now marks CoP 5.0 on medical surveillance cancelled and points to an August 2026 DoH standard. Recheck the idea Markdown's CoP 5.0 reference before any clinical work.

Revise this plan after site interviews, legal review and pilot data, tying each new assertion to its source and date.

### Questions for the team

- Does the alert-to-response assistant strengthen the original idea, and what existing implementation can we reuse?
- Can we demonstrate one complete supervisor workflow with the data and time available?
- Which buyer-value assumptions seem plausible, and which need a contractor's input?
- Do we have access to a sensor, sample logs or a qualified reviewer? If not, can we agree the simulated demo boundary?

The immediate decision is the hackathon story and scope. Customer validation and deployment decisions follow only if the team wants to pursue the larger opportunity.
