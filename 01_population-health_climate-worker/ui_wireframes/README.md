# Heat-Safe Crew · navigable wireframes

A clickable prototype of every screen in `heat-safe-screen-spec.md`: supervisor web (W1–W9), site app (M1–M8), worker app (P1–P8) and the Shelter A kiosk (K1). It is drawn in the Heat-Safe design system, “Issued Sheet” (`../ui_design_system/`).

## Run

The wireframes load `../ui_design_system/`, so serve the parent folder over HTTP (opening the file directly also works in most browsers):

```bash
python -m http.server 8765 --directory 01_population-health_climate-worker
```

Then open http://localhost:8765/ui_wireframes/.

## Design system

- **Tokens.** Colours, rules, type, motion and focus come from `tokens.css`. The names in `styles.css` (`--ink`, `--paper`, `--band-red`, …) are aliases, so nothing hard-codes a colour.
- **Signal grammar.** An environmental band is a swatch with a word (■ Low band). A task hold is a prohibition stamp (■ Heavy-work hold). A recorded decision is an ink stamp. W1’s hourly strip shows both: at 145 W/m² the band is Low and heavy exposed work is still held.
- **Drafts.** AI output and proposals (W4 workshop, M5) sit on cool tracing paper with a dashed edge until a person records them.
- **Light.** Auto opens site and worker phones in glare (outdoor sun) and supervisor web and the kiosk in day. The left panel can force Day, Glare or Night shift for every frame.

## Company branding (W9)

Noura, the organisation admin, sets the company palette for the **platform** (supervisor web) and **mobile web** (site app, worker app, kiosk) separately in W9. W9 previews the draft in every light setting, lists the guardrail checks from `brand.js`, and publishes with a typed `PUBLISH` (8-second Undo). Only the admin role can publish.

- Brand colour appears only in the brand bar, logo mark, phone status bar (browser colour) and an optional rail tint. Never on stamps, bands, buttons or charts.
- Colours that read as Stop, Caution or Safe, or sit too close to a signal colour, are kept to the logo mark.
- Stop-work and emergency screens (M2, P3) drop the brand.
- The published brand is saved in `localStorage` (`hs-brand`). The left panel’s **Company brand** chips publish a fictional preset straight away, for a quick look across all screens.

## Use

- **Screen map** lists every screen by device and maps tutorial steps to screens.
- **Left panel**: step through the 4 August scenario, switch states (default, empty, error, alternates), change the signed-in role (only Rashid can record a restart; Maya issues the stop-work, Huda acknowledges; Salim sees the first-aider card; Noura publishes branding), set the light, and switch the published company brand.
- **Web keyboard**: `?` for shortcuts, `J`/`K` rows, `G` then `M` for Squad Monitoring, `G` then `B` for branding.
- Destructive and safety-critical actions use the typed-confirmation modal (`CONFIRM`, `RESTART`, `REMOVED`, `PUBLISH`).

## Languages (UAE)

Worker-facing screens (P1–P8) and the kiosk (K1) are fully translated into English, Arabic, Urdu, Hindi, Malayalam, Bengali and Tagalog (`i18n.js`). Tamil, Nepali and Pashto are listed as coming soon and fall back to English. The translations are drafts and need native-speaker review before use.

- **Direction:** the frame gets `lang` and `dir`. All CSS uses logical properties (`inset-inline-start`, `border-inline-start`, …), so Arabic and Urdu mirror automatically. Directional arrows and swipe flip; media ▶ does not.
- **Scripts:** DM Sans first, then the matching Noto family per script. Taller line height for Indic (1.6), Arabic (1.7) and Nastaliq Urdu (2.1). No uppercase or letter-spacing outside Latin.
- **Expansion:** no truncation in the worker app; CTAs, tabs and badges wrap.
- **Patterns:** language chosen first, by endonym, with audio; globe icon instead of a code or flag; hold-to-confirm instead of typing `CONFIRM`; gender-neutral first-person buttons; Western digits and 24-hour times; dates through `Intl`; per-message `lang` with labelled machine translation for supervisor free text.
- **SMS:** Arabic and Indic scripts force Unicode SMS (70 characters, not 160); M2 shows the part count per crew language.
- **Time direction:** in right-to-left layouts, time runs right to left in the Gantt, scrubber, hourly strip, hourly table and time ranges in text. Practice is split (many Arabic news charts keep left to right), so the panel can hold time axes left to right for user testing. Clocks and media seek bars, if added, should not mirror.
- **Test tools (left panel):** worker language, RTL mirror for supervisor screens, pseudo-locale +40%, highlight untranslated strings.

No build step: plain HTML, CSS and JS (`core.js` shells and components, `screens-*.js` per device, `screens-admin.js` for W9, `app.js` panel and map).

## Crew photos and account screens

People are drawn with their round crew photo from `../ui_design_system/people.js` (section 26 of the style guide). Software (agents, jobs, the kiosk) keeps a square ⚙ tile. Each person can add or replace their own photo on the account screens: **W10** (web, from your photo in the side bar), **M9** (site app, Me tab) and **P9** (worker app, from Me). Here the upload stays in this browser; the app stores it on the server.
