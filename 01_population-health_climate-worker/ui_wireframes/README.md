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

No build step: plain HTML, CSS and JS (`core.js` shells and components, `screens-*.js` per device, `app.js` panel and map).
