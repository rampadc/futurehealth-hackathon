# Live local verification

Verified on 13 November 2026 with the three-service launcher and Vertex Gemini. No deployment was performed.

## Automated checks

- Root Python suite: 253 passed, 3 opt-in live tests skipped in the default run.
- Opt-in application journey: all 3 passed against the running operational solver, including the 120 → 90 → 120 worker-minute branches, stale evidence and midday restrictions.
- Existing isolated solver suite: 109 passed.
- Desktop UI suite: 43 passed. TypeScript and Vite production build passed.
- Independent review checked worker privacy and assistant session cleanup. Rejected observations/readings are tested to leave the event ledger unchanged.

The default Python suite reports an upstream Starlette/httpx deprecation warning. Vite reports the main bundle exceeds its advisory 500 kB threshold.

## Browser journey

The controlled 4 August 2025 case was completed through named sign-in/sign-out workspaces:

1. Maya issued the instruction. Advancing beyond acknowledgement time created Rashid’s overdue task; Rashid recorded follow-up.
2. Huda separately acknowledged, confirmed cessation, recorded recovery headcount and individual readiness. Rana recorded her own check-in.
3. Huda entered actual recovery intervals through 08:11, then confirmed the calculated 120 worker-minute assignment.
4. Advancing to 08:18 blocked calculation until Huda recorded actual workshop/recovery coverage. Bilal reported symptoms; Huda recorded the operational incident and removal; Salim recorded contact.
5. The live solver returned 90 worker-minutes without a substitute. Huda’s separate Leila readiness confirmation produced 120 worker-minutes.
6. Rashid handed over while restart and delivery decisions remained open. Noura separately recorded draft, approval, sending and supplier acceptance; the application sent no external message.
7. At 08:30 Huda recorded ten workers’ recovery and Bilal’s unavailable interval at Welfare. Maya supplied a fresh 180 W/m² local reading and water check; Huda supplied the personnel, recovery and crew-readiness checks; Tariq supplied the permit check.
8. Restart became ready for human review. Rashid recorded review while heavy trench work remained stopped. Amal recorded project review without creating a cost estimate.

A backend restart recovered the same case ID, version 37, clock, event chronology, tasks and pending decisions exactly. Refresh restored the named workspace; assistant messages and ADK sessions remained in the local databases. Desktop overflow was checked after removing the fixed minimum width.

## Live assistant

Live Gemini calls exercised case explanation, current calculated plans and a worker request that included unsupported ranking/other-worker details. Case tools remained persona-scoped; the worker response did not disclose other workers’ schedules. The recovered superintendent conversation used the real case tools and retained the work hold. Model calls, tool names and grounding results are visible only in presenter tools.

The browser uses the same-origin application API through Vite. Google credentials and Gemini calls remain on the local backend. This named-persona environment and loopback presenter API are development facilities, not production authentication.

Live guidance retrieval also completed through the assistant, with returned source citation and URL passing grounding checks.

A real `optimizer_unknown` result occurred during the long browser run. The product displayed the calculation problem while retaining protective decisions. Retrying from Rashid’s workspace produced a planned, accepted-check result at the same case version 37, with identical human events and `applied: false`; `civil_heavy` remained held.
