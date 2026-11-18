# Data

Real, public data for the Heat-Safe Crew Agent (see `doc/heat-safe-crew-agent-plan.md`, "Data sources").
Regenerate with `uv run python tools/download_data.py` (add `--force` to refresh). Every file's source URL,
retrieval time and status is in `manifest.json`. Synthetic data (crews, sensors, wearables, check-ins, incidents)
is not here yet.

Sites: `abu_dhabi_city`, `mussafah`, `al_ain`, `ruwais` (coordinates in `src/heat_safe/sites.py`). Hourly times are local (Asia/Dubai).

| Folder | Content | Source | Used by |
|---|---|---|---|
| `raw/weather/forecast_snapshot_<date>.csv` | 16-day hourly forecast, all sites, incl. UV | Open-Meteo Forecast | `get_forecast` live path |
| `raw/weather/era5_replay_2025-08-01.csv` | Heat replay day | Open-Meteo Historical (ERA5) | Replay demo |
| `raw/weather/era5_replay_2024-08-04.csv` | Dust replay day | Open-Meteo Historical (ERA5) | Dust demo |
| `raw/weather/era5_summer_<yyyy>.csv` | 1 Jun–30 Sep, 2023–2025, hourly | Open-Meteo Historical (ERA5) | Backtest, Metrics tab |
| `raw/air_quality/` | PM10, PM2.5, dust, AOD, UV, US AQI: forecast snapshot, both replay days, summers 2023–2025 | Open-Meteo Air Quality (CAMS) | `get_air_quality` |
| `raw/noaa_gsod/` | Daily station observations 2020–2025: Abu Dhabi Intl, Al Bateen, Al Ain Intl | NOAA NCEI GSOD | Validating ERA5 |
| `raw/nasa_power/` | Mussafah hourly for both replay days; daily summers 2023–2025 (CSV with a text header) | NASA POWER | Cross-check |
| `raw/onet/` | O*NET 30.1 Work Context, categories, occupation list | O*NET Resource Center | `lookup_job_profile` |
| `processed/onet_work_context_plan_roles.csv` | Work Context for roofer, steel fixer, labourer, driver (US proxy) | Derived | `lookup_job_profile` |
| `raw/guidance/` | ILO 2019, NIOSH 2016-106, WHO/WMO 2015 warning systems, Sharjah OSHJ-CoP-33 (2024), WHO heat fact sheet | Publishers | RAG corpus |
| `raw/regulatory/` | ADOSH-SF CoP 11.0 *Safety in the Heat* v4.0 and its Technical Guideline v4.0 (Jul 2024), CoP 53.1 *OSH in Construction*, ADPHC CoP index | ADPHC | Risk model, RAG corpus |
| `raw/regulatory/manual/` | Documents collected by hand (MoHRE, PDPL, health data law, DoH, NCM, ...) | See "Collected by hand" below | RAG corpus, governance |

## Notes

- ERA5 and CAMS are ~10–40 km grids. Mussafah and Abu Dhabi city fall in the same air-quality cell, so their values are identical.
- The Abu Dhabi heat code (CoP 11.0) mandates the **Thermal Work Limit (TWL, W/m²)** index and a 5-day acclimatisation schedule.
  The plan and `src/heat_safe/rules.py` use both. The Sharjah CoP in `raw/guidance/` is reference only.
- The ERA5 replay day peaks at 45 °C, 30 % RH and 29.6 °C wet bulb at 12:00; `compute_heat_stress` gives a peak WBGT of 40.0 °C.
- BigQuery: `uv run python tools/load_bigquery.py` loads the tabular files into dataset `raw` (table list in the plan's "Data sources").

## Collected by hand

| # | File | Version / date | URL | Collected by / on |
|---|---|---|---|---|
| 1 | twl_zones_adosh_tg_v4.csv | TG v4.0, 15 Jul 2024; checked against p. 5 | (from local PDF) | 30 Oct 2026 |
| 1b | Table 1 notes (a)–(d), (\*), incl. note b, the definition of unacclimatised: `TWL_TABLE_NOTES` in `src/heat_safe/corpus.py` (not in the CSV) | TG v4.0, p. 5; transcribed from the rendered page image | (from local PDF) | 6 Nov 2026; checked by a second person 6 Nov |
| 2 | `middaybreakannouncements/WAM_Midday_Break_Announcement_2024.pdf`, `WAM_Midday_Break_Anouncement_2025.pdf`, `WAM_Midday_Break_Anouncement_2026.pdf`, `WAM_End_Of_Season_Release_2026.pdf` (in `data/raw/regulatory/`, not `manual/`) | WAM releases of 31 May 2024, 3 Jun 2025, 8 Jun 2026, 15 Sep 2026; browser prints | wam.ae | 6 Nov 2026. A compiled 2025 summary (WeasyPrint, not an original print) was replaced by the WAM print |
| 3 | uae_pdpl_fdl_45_2021_en.pdf (English only; Arabic still to collect) | | | 30 Oct 2026 |
| 4 | uae_health_ict_law_2_2019_en.pdf (Cabinet Resolution 32/2020 still to collect) | | | 30 Oct 2026 |
| 5 | ADHICS-FAQ.pdf (full ADHICS standard still to collect) | | | 30 Oct 2026 |
