# Heat-Safe Crew · navigable wireframes

A clickable prototype of every screen in `heat-safe-screen-spec.md`: supervisor web (W1–W8), site app (M1–M8), worker app (P1–P8) and the Shelter A kiosk (K1).

## Run

Serve the folder over HTTP (opening the file directly also works in most browsers):

```bash
python -m http.server 8765 --directory 01_population-health_climate-worker/ui_wireframes
```

Then open http://localhost:8765.

## Use

- **Screen map** lists every screen by device and maps tutorial steps to screens.
- **Left panel**: step through the 4 August scenario, switch states (default, empty, error, alternates), and change the signed-in role (only Rashid can record a restart; Maya issues the stop-work, Huda acknowledges; Salim sees the first-aider card).
- **Web keyboard**: `?` for shortcuts, `J`/`K` rows, `G` then `M` for Squad Monitoring.
- Destructive and safety-critical actions use the typed-confirmation modal (`CONFIRM`, `RESTART`, `REMOVED`).

## Languages (UAE)

Worker-facing screens (P1–P8) and the kiosk (K1) are fully translated into English, Arabic, Urdu, Hindi, Malayalam, Bengali and Tagalog (`i18n.js`). Tamil, Nepali and Pashto are listed as coming soon and fall back to English. The translations are drafts and need native-speaker review before use.

- **Direction:** the frame gets `lang` and `dir`. All CSS uses logical properties (`inset-inline-start`, `border-inline-start`, …), so Arabic and Urdu mirror automatically. Directional arrows and swipe flip; media ▶ does not.
- **Scripts:** DM Sans first, then the matching Noto family per script. Taller line height for Indic (1.6), Arabic (1.7) and Nastaliq Urdu (2.1). No uppercase or letter-spacing outside Latin.
- **Expansion:** no truncation in the worker app; CTAs, tabs and badges wrap.
- **Patterns:** language chosen first, by endonym, with audio; globe icon instead of a code or flag; hold-to-confirm instead of typing `CONFIRM`; gender-neutral first-person buttons; Western digits and 24-hour times; dates through `Intl`; per-message `lang` with labelled machine translation for supervisor free text.
- **SMS:** Arabic and Indic scripts force Unicode SMS (70 characters, not 160); M2 shows the part count per crew language.
- **Time direction:** in right-to-left layouts, time runs right to left in the Gantt, scrubber, hourly strip, hourly table and time ranges in text. Practice is split (many Arabic news charts keep left to right), so the panel can hold time axes left to right for user testing. Clocks and media seek bars, if added, should not mirror.
- **Test tools (left panel):** worker language, RTL mirror for supervisor screens, pseudo-locale +40%, highlight untranslated strings.

No build step: plain HTML, CSS and JS (`core.js` shells and components, `screens-*.js` per device, `app.js` panel and map).
