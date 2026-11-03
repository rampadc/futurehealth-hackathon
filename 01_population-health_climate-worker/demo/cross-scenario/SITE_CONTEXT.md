# Project Sandline site context

Project Sandline is an entirely fictional utilities construction site in Mussafah, Abu Dhabi. Replay date: 4 August 2025, Asia/Dubai (UTC+04:00). All people, organisations, vehicle numbers and records are invented. This is a training and product demo, not operational safety advice. The client commissioned a small utility corridor; trench preparation, de-energised cable-kit preparation, and aggregate receipt have linked schedule milestones. No live electrical operations occur.

The 36 regular staff comprise principal contractor 8, civil subcontractor 14, electrical subcontractor 10, and logistics subcontractor 4. Client and supplier contacts are visitors and excluded from these counts. Civil C13 and C14 are on acclimatisation day 2 and start on supervised light work under C01's supervision. The six-seat workshop has two existing welfare attendants P07/P08 preparing cooled-space supplies and hydration records, leaving four seats; cooled recovery shelters have capacities 24 and 16. Workshop occupancy means the 14-person civil crew cannot move there wholesale.

| Organisation | Crew | Headcount | Site control |
| --- | --- | ---: | --- |
| Sandline Infrastructure | principal | 8 | Site programme, superintendent, HSE, permits, welfare and first aid |
| Dune Civil Works | civil | 14 | Civil foreman directs trench and light task assignments |
| Copper Palm Electromechanical | electrical | 10 | De-energised preparation only; qualified subset may use workshop |
| Sirocco Site Logistics | logistics | 4 | Drivers, forklift operator, storekeeper; delivery execution |

P02 is superintendent, P03 is HSE officer, P04 coordinates permits, P05 coordinates logistics and P06 is the first aider. C01 and E01 are subcontractor foremen. L04 is logistics crew lead. P07/P08 are workshop occupants during setup, not electrical workers.

The principal contractor may issue site-wide safety controls; each subcontractor foreman must confirm crew instructions and cessation. A client milestone does not override a safety hold. During the civil hold, four qualified civil workers can do lightweight pipe-marker preparation in the workshop as a separate schedule recovery action; it never clears civil work or transfers another zone’s TWL to the civil zone. Supplier rescheduling is commercial coordination: a proposed slot needs logistics approval, outbound request, and supplier acceptance before it is confirmed. A software recommendation cannot replace supervisor, first aider, permit issuer, employer or supplier authority. The safety log records acknowledgments and task state; contractual variation remains a separate client process.

Each scenario starts from `baseline_state.json` plus its `initial_overrides`, except the connected replay 02→03→04→10, which carries actual final state between folders. In connected replay, scenario 03/04/10 standalone overrides are ignored; actual clock and state carry forward. No live external systems are contacted.
