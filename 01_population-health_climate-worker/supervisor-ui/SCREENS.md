# Wireframe screens: build guide

How the screens in [`../ui_wireframes/`](../ui_wireframes/) (the clickable prototype) become real screens in this app. **The source of truth for each screen's data contract is [`src/screens/registry.ts`](src/screens/registry.ts)**; this page explains how to work with it. A test fails if a screen is missing from the registry or names an unknown case action.

## Where things live

| Path | What |
|---|---|
| `/` | The current MUI desktop app (nine persona workspaces). It stays live until the web shell replaces it. |
| `/web/<id>`, `/site/<id>`, `/worker/<id>`, `/kiosk` | Device shells for the wireframe screens, e.g. `/site/m2`. A screen without a component shows a placeholder listing its contract and the live case. |
| `src/App.tsx` | Router plus the current desktop app. |
| `src/session.ts` | `useCaseSession()`: persona session, live case, the event stream and the `act()` command call. Every shell uses it. |
| `src/workspaces/*.tsx` | One file per persona workspace of the current desktop app. |
| `src/shared/` | Pieces shared by the current workspaces (panels, schedule, crew proposal). |
| `src/shells/` | `DeviceShell` and its CSS. Plain CSS on the Issued Sheet tokens, no MUI. |
| `src/screens/registry.ts` | Every wireframe screen: device, owner, slice, personas, what it reads, which commands it sends, missing backend work. |
| `src/screens/kit.tsx`, `screens.css` | Shared Issued Sheet components: metrics, rows, badges, band swatch, hold stamp, draft (proposal) block, action button, typed confirm, press-and-hold. |
| `src/screens/data.ts` | Read-only selectors over the live case (crew, heat and freshness, a worker's intervals, which screen handles each action). |
| `src/commands.ts` | Command payloads, shared with the desktop app's evidence forms so both send the same shapes. |
| `src/screens/{web,site,worker}/`, `restart.tsx`, `ask.tsx`, `kiosk.tsx` | The screens. |
| `src/i18n/` | Worker strings. `strings.json` is generated from `../ui_wireframes/i18n.js` by `node scripts/sync-wireframe-strings.mjs`; do not edit it by hand. |
| `src/contract.ts` | Agreed types for endpoints that do not exist yet (monitor, trust log, worker consent and data, brand). |
| `../ui_design_system/tokens.css` | Design tokens, imported once in `main.tsx` and copied into the Cloud Run image by `Dockerfile.cloudrun`. |

## Building a screen

1. Create `src/screens/<device>/<ID>.tsx` exporting a component that takes `{ session }` (`ScreenProps`).
2. Set `component` on that screen's entry in the registry. The shell then renders it instead of the placeholder.
3. Read from `session.caseView`; send case actions with `session.act(action, payload)`. Only use actions listed in the screen's `commands`.
4. Style with the token variables (`--color-ink`, `--rule-structure`, `--space-2`, …) and logical properties (`margin-inline-start`, not `margin-left`) so right-to-left layouts mirror.
5. Add a test next to the screen and check it on the PR's Cloud Run preview.

Do not import `ui_design_system/components.css` globally: it restyles `body`, `*` and buttons and would break the MUI desktop app. Copy the component rules you need into a scoped stylesheet, or move them under `.hs-shell` in one agreed PR.

## Status

All 26 wireframe screens are built on live case data and real case commands.

What is real and what is simulated:

| Area | State |
|---|---|
| Case actions (stop-work, headcount, readiness, assignment, removal, first aid, fresh reading, checks, review, handover) | Real: `/api/case/commands`, same rules and owners as the desktop app |
| Planning Agent (W7, M8) | Real: `/api/chat` (ADK + Gemini on the backend) |
| Solver proposals, work/rest plan | Real solver output, shown as drafts with `applied: false` |
| Worker consent (P1, P8) and data export (P8) | Real: `/api/worker/consent`, `/api/worker/data` (signed-in worker only) |
| Trust log (W8) | Real: `/api/trust-log` (supervisors; workers are refused) |
| Branding (W9) | Real: `/api/brand`; server guardrails for contrast and signal colours; admin `P09` publishes with typed `PUBLISH`. M2 and P3 drop the brand |
| Worker language | Chosen on the phone (`localStorage`) and saved with consent |
| SMS preview (M2), kiosk badge taps (K1) | Display or simulated only; nothing is sent, no NFC |
| Offline (P7) | Banner and disabled sending; no service worker or queue yet |
| Voice check-in (P4) | Planned; tap answers only |

Backend for the platform screens: `src/heat_safe/application/platform_api.py`, tests in `tests/test_platform_api.py`. Fonts (DM Sans and Noto for Arabic, Urdu, Devanagari, Malayalam and Bengali) are self-hosted from `@fontsource` and load with the device shells only.

Still to do: native review of translations, an offline queue, voice check-in, and pointing `/` at the web shell.

## Ownership

| Owner | Area | Screens |
|---|---|---|
| A | Supervisor web | W1–W8 |
| B | Mobile | M1–M8, P1–P8, K1 |
| C | Platform and backend | Shared components, endpoints in `contract.ts`, tests and previews, W9 |

Changes to `session.ts`, `router.ts`, `contract.ts`, `live.ts` and the shell go through owner C. Changes to a screen's registry entry are one line each, so conflicts stay small.

## Demo slices

Each slice should run end to end on a preview URL with presenter controls before the next starts.

| Slice | Moment | Screens |
|---|---|---|
| 1 | 08:00–08:04 stop-work | W2, W3, M1, M2, M3, P2, P3, P6 |
| 2 | 08:10–08:20 plan and assistance | W4, W5, M4, M5, M6, P4, P5 |
| 3 | 15:06–15:08 restart review | M7, W6 |
| 4 | Supporting screens | W1, W7, W8, M8, P1, P8, K1 |
| 5 | Stretch, label as planned | P7 offline, W9 branding |

## Definition of done (per screen)

- Matches the wireframe in its default, empty, error and waiting states.
- Live data from `/api`, nothing hard-coded.
- Works in the day and glare themes; worker screens also in right-to-left (Arabic).
- Keyboard accessible, with visible focus.
- Keeps the existing wording that proposals are not approvals (`applied: false`) and that nothing is sent.
- One test, and checked on the PR preview.

## Open decisions

- **Admin persona.** W8 and W9 use a new organisation admin, Hessa Al Qamar (`P09`), because Noura is the logistics coordinator in the app but the admin in the wireframes. `P09` exists only on the backend and in the device shells; the desktop story keeps its nine personas.
- **Retiring `/`.** Once W2–W7 cover the desktop workspaces, point `/` at the web shell and remove `src/workspaces/`.
