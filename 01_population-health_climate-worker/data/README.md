# Heat-Safe public data archive

Downloaded locally on 3 November 2026. Start with **[manifest.json](manifest.json)** for the combined provenance and verified file inventory. The individual source manifests preserve request URLs, retrieval timestamps, coverage, units, checksums and gaps. This archive replaces neither a calibrated work-front instrument nor a worker-health study.

## What is here

| Dataset | Saved coverage | Usable records | Location |
|---|---|---:|---|
| ERA5 historical weather via Open-Meteo | 1 June–30 September in each of 2023, 2024 and 2025; four UAE locality points | 35,136 hourly site records | [raw/weather](raw/weather/) |
| CAMS global air quality via Open-Meteo | Same three summers and four locality points | 35,136 hourly API site records | [raw/air_quality](raw/air_quality/) |
| Current weather forecasts | A newly retrieved 16-day forecast for each point; these are not the old October snapshots | 1,536 hourly slots, with 1 missing final hour per site | [manifest_weather.json](manifest_weather.json) |
| Current air-quality forecasts | A newly retrieved 5-day forecast for each point | 480 hourly slots; final 7 hours missing for most variables, 6 for US AQI | [manifest_weather.json](manifest_weather.json) |
| NOAA GSOD station observations | Abu Dhabi International, Al Bateen and Al Ain; available observations for 2020–2025 | 6,125 daily station records | [raw/noaa_gsod](raw/noaa_gsod/) |
| NASA POWER cross-check | Mussafah: two hourly replay dates; June–September daily data for 2023–2025 | 48 hourly + 366 daily records | [raw/nasa_power](raw/nasa_power/) |
| O*NET 30.1 | Full official text database ZIP plus selected extracted tables | 297,676 Work Context rows; 1,016 occupation rows; 281 category rows | [raw/onet](raw/onet/) |
| Occupation proxy extract | Construction labourers, reinforcing iron/rebar workers, roofers, heavy truck drivers and light truck drivers | 90 selected exposure/category rows | [processed/onet_30_1_work_context_heat_proxy.csv](processed/onet_30_1_work_context_heat_proxy.csv) |
| Safety and legal references | Downloaded official documents and explicit unavailable-source records | See the source manifest | [manifest_safety.json](manifest_safety.json) |

**Replay files:** [processed/replay](processed/replay/) contains 24-hour weather and air-quality extracts for **1 August 2025** and **4 August 2024**, at each of the four locality points. These 384 extracted rows are already included in the historical totals; do not count them again. The dates come from the original plan. Their selection does not itself verify a heat emergency or dust event.

## Reference-document download status

13 reference files were downloaded and validated, including Abu Dhabi heat-safety codes and guidance, ADHICS v2 and its FAQ, NIOSH, ILO, WHO/WMO guidance, and MoHRE policy information. Seven requested PDFs remain unavailable: three MoHRE endpoints timed out; three UAE legislation endpoints returned HTTP 403; the WHO 2025 workplace-heat report endpoint returned a non-PDF response. The related WMO publication page is saved, but is not the full report. Exact URLs and errors are recorded in [manifest_safety.json](manifest_safety.json).

## Locations, models and time

The locality points are Abu Dhabi city (24.4539, 54.3773), Mussafah (24.35, 54.50), Al Ain (24.2075, 55.7447) and Ruwais (24.08, 52.73). See [sites.json](sites.json). They are representative reference points chosen for this retrieval because the original implementation's coordinate file was absent. They are not contractor locations. Every Open-Meteo entry records both requested and returned grid coordinates.

Historical weather requests explicitly pin `models=era5`; air quality pins `domains=cams_global`. Forecast weather uses the service's default model selection. ERA5 and CAMS describe regional conditions, not the microclimate at a worker's task. CAMS global source fields are generally three-hourly model output exposed through the API's hourly time series; hourly rows should not be mistaken for independent hourly station observations.

Open-Meteo CSV times are local **Asia/Dubai, UTC+04:00**. NASA is explicitly **UTC**, including its daily aggregation boundaries. NOAA retains the provider's GSOD date basis. Align the time basis before comparison. NASA's requested UTC replay day is not the same 24-hour interval as the Dubai-local replay day.

## Units and missing data

- Weather temperatures are Celsius, relative humidity percent, pressure hPa, wind **m/s at 10 m**, radiation W/m². Wind at 10 m is not a measurement at a worker's height. Raw JSON and manifests retain the provider's units.
- NOAA source CSVs retain Fahrenheit, knots, miles and inches where specified; do not join them numerically to metric model data without conversion. Missing-value sentinels remain unchanged and are described in the station manifest.
- **NOAA's 2025 files stop on 24 August 2025**, and other years have some missing dates. The downloader does not manufacture a complete calendar.
- JSON nulls become empty CSV cells. Forecast missing tails remain missing. No forward filling, interpolation by this project, synthetic weather, TWL calculation or health-risk label has been added.
- O*NET is a **US occupational proxy**, not UAE exposure evidence. Its temperature question combines very hot and very cold conditions. Keep category/frequency scales distinct; 90 extract rows are not 90 workers.

## Source and licensing references

- [Open-Meteo historical API](https://open-meteo.com/en/docs/historical-weather-api), [weather API](https://open-meteo.com/en/docs), [air-quality API](https://open-meteo.com/en/docs/air-quality-api), [terms](https://open-meteo.com/en/terms), [commercial plans](https://open-meteo.com/en/pricing). Attribute Open-Meteo and the underlying ERA5/Copernicus/CAMS providers. The free service is for non-commercial use; arrange appropriate access before commercial operation.
- [NOAA NCEI GSOD](https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/) and the downloaded official station-history file identify the three UAE stations. The NASA source URLs, parameters and metadata are retained in [manifest_station_nasa.json](manifest_station_nasa.json).
- [O*NET archive releases](https://www.onetcenter.org/db_releases.html), [licensing](https://www.onetcenter.org/license_db.html). O*NET 30.1 Database by the U.S. Department of Labor, Employment and Training Administration, under CC BY 4.0. The occupation extract is modified by selection; USDOL/ETA has not approved, endorsed or tested it.
- Safety PDFs and HTML retain their own publisher terms. Their download is not permission to redistribute them or evidence of legal/regulatory approval for a product.

## Reproduce and verify

Run from the project root with Python 3. The safety downloader also uses the installed `pdftotext` command to check PDF content. No cloud account or paid API key was used.

```sh
python3 01_population-health_climate-worker/tools/download_weather.py
python3 01_population-health_climate-worker/tools/download_station_nasa.py
python3 01_population-health_climate-worker/tools/download_onet.py
python3 01_population-health_climate-worker/tools/download_safety.py
python3 01_population-health_climate-worker/tools/verify_data.py
```

Downloaders contact only the public providers. Weather runs save timestamped new forecasts and refresh the historical files; other scripts may reuse or refresh their source files. Re-run verification after a refresh: the combined manifest is a snapshot, not a live catalogue. Old forecast snapshots can remain on disk; inspect their filename and source-manifest coverage before using them.

The verification checks file hashes and lengths, recorded CSV/table row counts, PDF signatures and ZIP integrity. Weather also has assertions for timestamp uniqueness/order, hourly coverage, variable lengths and missing counts. A separate read-only review checked JSON-to-CSV consistency and replay slices. These checks establish archive integrity and transformation consistency, not instrument accuracy or clinical validity.

No worker records, actual contractor site logs, wearable recordings, incident outcomes, interviews or synthetic crews were downloaded or generated. These remain separate inputs for a future approved pilot or clearly labelled demonstration. The architecture note's original BigQuery uploads and test-suite claims have not been recreated by this data-download task.
