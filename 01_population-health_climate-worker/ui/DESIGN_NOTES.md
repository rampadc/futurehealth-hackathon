# From readings to a completed crew response

The opportunity plan positions Heat-Safe as an execution layer for an existing heat programme. The initial UI overemphasised fixture navigation, readings and generic case cards. It did not establish the consequence of a reading, an accountable owner, feasible alternatives or evidence that instructions reached the crew.

## Product priorities

| Documented pain | UI response |
|---|---|
| A meter cannot decide what the crew does next | Condition → affected task/contractor → owned next action |
| Supervisor must assemble context across records | Contextual response plan with policy references and current prerequisites |
| Moving everyone is often impossible | Workshop capacity, qualification and restriction checks; explain rejected options |
| Subcontractor and supplier coordination remains open | Keep approval, transmission, acceptance and completion distinct |
| Instructions must reach a mixed-language workforce | Foreman communication preview; unreviewed translations visibly marked |
| Compliance records are fragmented | Timestamped decisions and handover with unresolved work preserved |
| Green readings may falsely reassure | Environmental bands separate from task holds, symptoms and restart gates |

## TWL interpretation

The archived ADOSH-SF Technical Guideline, Safety in the Heat v4 July 2024, Table 1 p5 shows Low/green from 140 W/m², caution/amber from 115 to below 140, and high/red below 115. The UI uses 140 in green to match the team's idea Markdown boundary. Conditions assume hydration, acclimatisation and self-pacing; colour is not task permission.

The synthetic Sandline heavy-work hold at TWL ≤150 W/m² is a separate fictional site policy. At 145, show green environmental band AND a heavy-work hold. Stale/failed readings show Unknown, never a reassuring traffic light. Symptoms and midday/restart restrictions remain independent.

## Design reference

Tracecat's actual frontend styles (`frontend/src/styles/globals.scss` in https://github.com/TracecatHQ/tracecat) informed the neutral white/zinc surfaces, restrained typography, thin borders, compact controls and operational density. The response case/approval/evidence structure follows its product model rather than its marketing page.

No claimed health improvement, payable delay entitlement or monetary saving is inferred from synthetic replay. The demo can demonstrate response preparation, coordination and evidence completeness; buyer ROI requires an observed baseline.

## Visual composition review

Compared the rendered case interface on Tracecat's public product page with Heat-Safe at desktop size. Tracecat groups a title and compact metadata, keeps case content on a continuous surface, and places assistance in a stable right-hand panel. Repeated type sizes, aligned controls, restrained section dividers and consistent table rows establish hierarchy without many large card containers.

The earlier Heat-Safe version stacked separate panels with repeated headings and nested borders; tiny secondary text competed with oversized whitespace. The polish pass changes the composition rather than merely copying colour tokens: case document and copilot columns, a consistent readable type scale, a smaller set of spacing/radius rules, compact metadata and one clear primary decision. The reference is Tracecat's published product interface, not an authenticated live customer workspace.

## Persona and stakeholder correction

The demo previously asked viewers to assemble its value from reference screens. Its primary experience must instead carry one incident across accountable handoffs:

1. HSE sees the local trigger, affected contractor/crew and outstanding response.
2. The foreman acknowledges an instruction, confirms cessation and accounts for recovery separately.
3. The planner/foreman sees named eligible workers, available workshop capacity and a delivery change with draft/approval/sent/accepted states.
4. The superintendent receives a handover with actual outcomes and unresolved restart conditions.

The selected role is a persistent simulated viewing role, not automatic impersonation of whoever owns the next action. Other roles see who is being waited on. Site data supports these decisions in context; policy links explain a specific restriction; workflow inspection explains execution history. These are supporting references, not the value proposition.

For stakeholders, the demonstrable value is continuity across people and organisations with fewer missing handoffs—not the existence of five navigation pages or synthetic ROI. Presenter controls remain separate from operator actions.
