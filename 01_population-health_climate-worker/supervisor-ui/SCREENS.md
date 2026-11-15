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
| `src/contract.ts` | Agreed types for endpoints that do not exist yet (monitor, trust log, worker consent and data, brand). |
| `../ui_design_system/tokens.css` | Design tokens, imported once in `main.tsx` and copied into the Cloud Run image by `Dockerfile.cloudrun`. |

## Building a screen

1. Create `src/screens/<device>/<ID>.tsx` exporting a component that takes `{ session }` (`ScreenProps`).
2. Set `component` on that screen's entry in the registry. The shell then renders it instead of the placeholder.
3. Read from `session.caseView`; send case actions with `session.act(action, payload)`. Only use actions listed in the screen's `commands`.
4. Style with the token variables (`--color-ink`, `--rule-structure`, `--space-2`, …) and logical properties (`margin-inline-start`, not `margin-left`) so right-to-left layouts mirror.
5. Add a test next to the screen and check it on the PR's Cloud Run preview.

Do not import `ui_design_system/components.css` globally: it restyles `body`, `*` and buttons and would break the MUI desktop app. Copy the component rules you need into a scoped stylesheet, or move them under `.hs-shell` in one agreed PR.

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
