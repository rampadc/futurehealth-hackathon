# Wireframe screens: build guide

How the screens in [`../ui_wireframes/`](../ui_wireframes/) (the clickable prototype) become real screens in this app. **The source of truth for each screen's data contract is [`src/screens/registry.ts`](src/screens/registry.ts)**; this page explains how to work with it. A test fails if a screen is missing from the registry or names an unknown case action.

## Where things live

| Path | What |
|---|---|
| `/` | The supervisor web shell, opening on Squad Monitoring. Unknown paths land here too. |
| `/classic` | The original MUI desktop app (nine persona workspaces), kept as a fallback. |
| `/web/<id>`, `/site/<id>`, `/worker/<id>`, `/kiosk` | Device shells for the wireframe screens, e.g. `/site/stop-work`. The full list is in [Screen URLs](#screen-urls). A screen without a component shows a placeholder listing its contract and the live case. |
| `src/App.tsx` | Router plus the classic desktop app. |
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

## Screen URLs

Screens are addressed by name. The clickable prototype in `ui_wireframes/` keeps its own short codes as a design reference; the app, its URLs and these docs do not use them.

| Device | Screens (path `/<device>/<id>`) |
|---|---|
| Supervisor web | `monitoring` Squad Monitoring · `heat-controls` · `response` Protective response · `crew` Crew & workshop · `work-rest` Work/rest plan · `restart-review` · `ask` Ask the Planning Agent · `trust` System & trust · `site-setup` Site setup · `settings` Admin settings (Branding, People and roles tabs; `/web/branding` still opens it) |
| Site app | `today` · `stop-work` · `headcount` · `report-unwell` Report an unwell worker · `readiness` · `proposal` · `action-card` · `fresh-reading` · `ask` |
| Worker app | `welcome` · `now` · `alert` · `check-in` · `my-plan` · `shelter` · `offline` · `my-data` |
| Kiosk | `check-in` Shelter A check-in and "I feel unwell" |

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
| Unwell reports | Real: `report` carries `person_id` and `via`. A worker reports themself on the worker app or the Shelter A kiosk (`via: phone/kiosk`); Huda reports any crew member who has no phone or is too unwell to use one (`via: foreman`, web Protective response, site `report-unwell`, desktop workspace). One report per worker. The first report opens the removal and first-aid steps; later reports remove that worker from planned work. No symptom detail is stored |
| Planning Agent (web and site Ask) | Real: `/api/chat` (ADK + Gemini on the backend). Each answer lists the tools it used. Supervisors and responders also get `what_if_crew_plan`, which asks the solver about a hypothetical change and records nothing; its answers are marked "Hypothetical · not recorded". Workers do not get it |
| Solver proposals, work/rest plan | Real solver output, shown as drafts with `applied: false` |
| Site conditions (Squad Monitoring, Heat controls) | Real: `/api/case/conditions`, hourly TWL from the risk core (ERA5 replay for 4 Aug 2025, Mussafah). Planning context only; never clears a hold |
| Heat risk by worker (Squad Monitoring, Crew & workshop) and My heat risk (worker Now) | Real: `/api/case/crew-risk` gives supervisors each worker's band and action, never the reasons; `/api/worker/risk` gives a worker their own band and why. The reasons are English only for now |
| Presenter readings (`/demo-control`) | Valid, sensor fault (`quality: invalid`) or stale (measured 10 minutes earlier), plus presets for scenarios 02, 06, 08 and 09 that set the clock and reading |
| Worker consent (Welcome, My data) and data export (My data) | Real: `/api/worker/consent`, `/api/worker/data` (signed-in worker only) |
| Trust log (System & trust) | Real: `/api/trust-log` (supervisors; workers are refused). Filter by All, Solver, People or Agent |
| Admin settings (branding) | Real: `/api/brand`; server guardrails for contrast and signal colours; admin `P09` publishes with typed `PUBLISH`. The stop-work instruction and the worker alert drop the brand. People and roles is read-only |
| Worker language | Chosen on the phone and saved with consent; a new phone picks it up from the server. Untranslated English is marked `lang="en"` |
| Kiosk badges | Web NFC on Android Chrome (text record with the worker id); name tiles elsewhere |
| SMS preview (stop-work instruction) | Display only; nothing is sent |
| Offline | A worker's check-in and report are queued on the phone and sent on reconnect with the same command id; supervisor decisions are never queued. A network-first service worker keeps the app shell available |
| Voice check-in | Browser speech recognition where available; the transcript stays on the phone and leads to the same fixed red-flag question |

Backend for the platform screens: `src/heat_safe/application/platform_api.py`, tests in `tests/test_platform_api.py`. Fonts (DM Sans and Noto for Arabic, Urdu, Devanagari, Malayalam and Bengali) are self-hosted from `@fontsource` and load with the device shells only.

Still to do: native-speaker review of translations, and translations for Tamil, Nepali and Pashto. SMS sending needs a provider and is out of scope for the demo.

## Ownership

| Owner | Area | Screens |
|---|---|---|
| A | Supervisor web | All web screens except Admin settings |
| B | Mobile | Site app, worker app, kiosk |
| C | Platform and backend | Shared components, endpoints in `contract.ts`, tests and previews, Admin settings |

Changes to `session.ts`, `router.ts`, `contract.ts`, `live.ts` and the shell go through owner C. Changes to a screen's registry entry are one line each, so conflicts stay small.

## Demo slices

Each slice should run end to end on a preview URL with presenter controls before the next starts.

| Slice | Moment | Screens |
|---|---|---|
| 1 | 08:00–08:04 stop-work | Heat controls, Protective response; site Today, Stop-work, Headcount; worker Now, Alert, Shelter |
| 2 | 08:10–08:20 plan and assistance | Crew & workshop, Work/rest plan; site Readiness, Proposal, Action card; worker Check in, My plan |
| 3 | 15:06–15:08 restart review | Site Fresh reading, web Restart review |
| 4 | Supporting screens | Squad Monitoring, web and site Ask, System & trust, worker Welcome and My data, kiosk |
| 5 | Stretch, label as planned | Worker offline, Admin settings (branding) |

## Definition of done (per screen)

- Matches the wireframe in its default, empty, error and waiting states.
- Live data from `/api`, nothing hard-coded.
- Works in the day and glare themes; worker screens also in right-to-left (Arabic).
- Keyboard accessible, with visible focus.
- Keeps the existing wording that proposals are not approvals (`applied: false`) and that nothing is sent.
- One test, and checked on the PR preview.

## Open decisions

- **Squads.** The live case covers the civil crew. Formwork, steel-fixing and MEP squads are a fictional fixture in `src/screens/squads.tsx` so supervisors can compare squads (squad selector on Squad Monitoring, Protective response, Crew & workshop and Work/rest plan; per-squad tables on Heat controls and Restart review; Site setup). Replace the fixture with an API read when the backend models more than one squad.
- **Admin persona.** System & trust and Admin settings use a new organisation admin, Hessa Al Qamar (`P09`), because Noura is the logistics coordinator in the app but the admin in the wireframes. Admin settings sits in its own Admin group at the end of the web rail; other personas see it read-only. `P09` exists only on the backend and in the device shells; the desktop story keeps its nine personas.
- **Retiring `/classic`.** Squad Monitoring now records the delivery and cost-review actions that had no wireframe screen. Once the team no longer needs the classic app, remove `/classic` and `src/workspaces/`.
