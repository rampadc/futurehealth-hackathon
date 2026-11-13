# Manual data collection

These sources block scripted downloads (bot protection, broken certificate chains, JavaScript-only pages) or have no stable file link. Collect them in a normal browser.

**Where to save:** `data/raw/regulatory/manual/`, using the exact file name given. The next run of
`uv run python tools/download_data.py` lists every file in that folder in `data/manifest.json` with status `manual`.

**For every item:** note the version, date and URL in the "Collected" column below, so citations in the RAG corpus stay traceable.
If a page has no PDF, save it with the browser's *Print → Save as PDF* (keeps the URL and date in the footer).

Already downloaded automatically (no action): ADOSH-SF CoP 11.0 *Safety in the Heat* v4.0 (Jul 2024), its Technical Guideline v4.0,
CoP 53.1 *OSH in Construction*, and the ADPHC Codes of Practice index page (all in `data/raw/regulatory/`).

## Priority 1: needed for Week 1–2 (risk model and governance)

### 1. TWL zone table (transcribe; do not download)
The Abu Dhabi heat code requires the **Thermal Work Limit (TWL)** index (W/m²), not WBGT. Its zone table is an image in the PDF.
1. Open `data/raw/regulatory/adosh_sf_tg_safety_in_the_heat_v4_2024_en.pdf`, page 5, "Table 1 – Thermal Work Limit Zones and Interventions for Management of Work".
2. Type it into `data/raw/regulatory/manual/twl_zones_adosh_tg_v4.csv` with columns:
   `zone,twl_min_wm2,twl_max_wm2,interventions,source_page`
3. Have a second team member check every number against the PDF.

### 2. MoHRE midday break: 2025 announcement (and 2026 if published)
- Go to <https://www.mohre.gov.ae> → Media Center → News. Search "midday break".
- The 2025 item is "MoHRE to implement Midday Break for the 21st consecutive year from 15 June to 15 September 2025" (3 Jun 2025).
- Save as `mohre_midday_break_2025_en.pdf` (Print → Save as PDF). Also save the 2024 item as `mohre_midday_break_2024_en.pdf`.
- Note: exemptions (for example, work that can't be stopped for technical reasons, or that needs a government permit), the fine, and whether a ministerial resolution number is cited. If so, look it up on <https://uaelegislation.gov.ae>.
- If mohre.gov.ae doesn't load from your network, use the WAM version: <https://www.wam.ae> and search "Midday Break 2025".

### 3. UAE PDPL: Federal Decree-Law No. 45 of 2021
- English: <https://uaelegislation.gov.ae/en/legislations/1972>, then click **Download**. Save as `uae_pdpl_fdl_45_2021_en.pdf`.
- Arabic (official): <https://government.ae/-/media/Documents-2023/ArFederal-Decree-Law-No-45-of-2021-regarding-the-Protection-of-Personal-Data.pdf>. Save as `uae_pdpl_fdl_45_2021_ar.pdf`.
- On the legislation page, check for **executive regulations** or amendments. Save any as `uae_pdpl_exec_regs_<year>_en.pdf`.
- Articles to note for the governance section: consent, sensitive data (health/biometric), data minimisation, retention, data-subject rights.

### 4. UAE health data law: Federal Law No. 2 of 2019 (ICT in health fields)
- <https://uaelegislation.gov.ae/en/legislations/1209>, then **Download**. Save as `uae_health_ict_law_2_2019_en.pdf`.
- Also look for its executive regulation (Cabinet Resolution No. 32 of 2020). Save as `uae_health_ict_exec_regs_2020_en.pdf`.
- Why it matters: it covers health data confidentiality and data localisation, which supports keeping worker health data in a UAE-region GCP setup. If GCP has no UAE region, write that down as a limitation.

### 5. Abu Dhabi DoH: ADHICS (Healthcare Information and Cyber Security Standard)
- <https://www.doh.gov.ae/en/resources/standards.aspx>. Find "Abu Dhabi Healthcare Information and Cyber Security Standard (ADHICS)". Save the current version as `doh_adhics_standard_<version>.pdf`.
- FAQ: <https://www.doh.gov.ae/-/media/Feature/Aamen/ADHICS-FAQ.ashx>. Save as `doh_adhics_faq.pdf`. The script couldn't fetch it because the site's certificate chain is incomplete for Python, but a browser works.
- Also look on the same Standards page for any DoH policy on health data or privacy, and save it with a descriptive `doh_*` name.

## Priority 2: RAG corpus and alerts (Week 2–3)

### 6. NCM warning text samples
- <https://www.ncm.gov.ae>. Find the warnings / early-warning section (extreme heat, dust/sand, fog).
- Copy 3–5 real warnings of each type in English and Arabic into `ncm_warning_samples.csv` with columns:
  `type,level_colour,issued_at,valid_from,valid_to,region,text_en,text_ar,source_url`
- NCM's X/Twitter account (@NCMS_media) also posts warnings. Record the post URL as `source_url`.

### 7. WHO/WMO *Climate change and workplace heat stress* (Aug 2025)
- <https://www.who.int/publications>. Search for the title, download the PDF and save as `who_wmo_workplace_heat_stress_2025.pdf`.

### 8. Ramadan working hours and heat work
- No official regulator guidance specific to heat work during Ramadan turned up. Collect:
  - The current MoHRE Ramadan working-hours announcement (private sector hours cut by 2 h/day). Save as `mohre_ramadan_hours_<year>_en.pdf`.
  - UAE Labour Law, Federal Decree-Law No. 33 of 2021, and its executive regulation, Cabinet Resolution No. 1 of 2022 (working hours, worker health and safety). Both are on <https://uaelegislation.gov.ae>. Save as `uae_labour_law_fdl_33_2021_en.pdf` and `uae_labour_exec_regs_1_2022_en.pdf`.
  - If you find guidance from the DoH or ADPHC on fasting and heat, save it as `ramadan_heat_guidance_<source>.pdf`.
- In the plan, keep "fasting" as a **modifier that raises the band** (code). Cite the documents for the rationale only.

### 9. CoP 11.0 Arabic version (optional, for multilingual alerts)
- <https://www.adphc.gov.ae/en/Legislation/Code-of-Practices>, row 11.0, Arabic attachment. Save as `adosh_sf_cop_11_safety_in_the_heat_v4_2024_ar.pdf`.

## Priority 3: Metrics tab and pitch (Week 4)

### 10. EAD air-quality station data
- <https://www.adairquality.ae> (EAD air-quality portal). Pick the stations nearest Mussafah (for example, Mussafah, Khalifa City, Abu Dhabi city stations).
- Export hourly PM10 and PM2.5 for 1–7 Aug 2024 and Jun–Sep 2025 (if export is available). Save as `ead_aq_<station>_<period>.csv`.
- Use it to validate the CAMS model data in `data/raw/air_quality/`.

### 11. Workforce statistics
- Statistics Centre Abu Dhabi: <https://www.scad.gov.ae>. Find labour force by sector/nationality (construction). Save as `scad_labour_<year>.xlsx` (or `.pdf`).
- FCSC (federal): <https://fcsc.gov.ae>. Find the labour force survey. Save as `fcsc_labour_force_<year>.xlsx`.
- ILO heat-stress estimates for the UAE are already in `data/raw/guidance/ilo_working_on_a_warmer_planet_2019.pdf`.

## Collected

| # | File | Version / date | URL | Collected by / on |
|---|---|---|---|---|
| 1 | twl_zones_adosh_tg_v4.csv | TG v4.0, 15 Jul 2024; checked against p. 5 | (from local PDF) | 30 Oct 2026 |
| 1b | Table 1 notes (a)–(d), (\*), incl. note b, the definition of unacclimatised: `TWL_TABLE_NOTES` in `src/heat_safe/corpus.py` (not in the CSV) | TG v4.0, p. 5; transcribed from the rendered page image | (from local PDF) | 6 Nov 2026; checked by a second person 6 Nov |
| 2 | `middaybreakannouncements/WAM_Midday_Break_Announcement_2024.pdf`, `WAM_Midday_Break_Anouncement_2025.pdf`, `WAM_Midday_Break_Anouncement_2026.pdf`, `WAM_End_Of_Season_Release_2026.pdf` (in `data/raw/regulatory/`, not `manual/`) | WAM releases of 31 May 2024, 3 Jun 2025, 8 Jun 2026, 15 Sep 2026; browser prints | wam.ae | 6 Nov 2026. A compiled 2025 summary (WeasyPrint, not an original print) was replaced by the WAM print |
| 3 | uae_pdpl_fdl_45_2021_en.pdf (English only; Arabic still to collect) | | | 30 Oct 2026 |
| 4 | uae_health_ict_law_2_2019_en.pdf (Cabinet Resolution 32/2020 still to collect) | | | 30 Oct 2026 |
| 5 | ADHICS-FAQ.pdf (full ADHICS standard still to collect) | | | 30 Oct 2026 |
