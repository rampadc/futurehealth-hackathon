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

25 of 26 screens are built on live case data and real case commands. W9 (branding) is the remaining stretch screen.

What is real and what is simulated:

| Area | State |
|---|---|
| Case actions (stop-work, headcount, readiness, assignment, removal, first aid, fresh reading, checks, review, handover) | Real: `/api/case/commands`, same rules and owners as the desktop app |
| Planning Agent (W7, M8) | Real: `/api/chat` (ADK + Gemini on the backend) |
| Solver proposals, work/rest plan | Real solver output, shown as drafts with `applied: false` |
| Worker language (P1) and consent (P1, P8) | Saved on the phone (`localStorage`); the consent endpoint is planned |
| P8 download | Built in the browser from the live case; the export endpoint is planned |
| SMS preview (M2), kiosk badge taps (K1) | Display or simulated only; nothing is sent, no NFC |
| Offline (P7) | Banner and disabled sending; no service worker or queue yet |
| Agent telemetry (W8) | Presenter access only; a supervisor trust log is planned |
| Voice check-in (P4) | Planned; tap answers only |

Still to do: W9 with `brand.js` and an admin persona, the endpoints in `contract.ts`, self-hosted fonts, native review of translations, and pointing `/` at the web shell.

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

- **Personas.** The wireframes use five roles; the app has nine personas. W8 and W9 refer to an organisation admin (`P09`) who does not exist in `story.ts` or the backend yet, and Noura is the logistics coordinator in the app but the admin in the wireframes.
- **Fonts.** The tokens ask for DM Sans and Noto families. The page's content security policy only allows same-origin fonts, so they must be self-hosted under `public/` or the screens fall back to system fonts.
- **Retiring `/`.** Once W2–W7 cover the desktop workspaces, point `/` at the web shell and remove `src/workspaces/`.
