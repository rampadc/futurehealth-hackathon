"""Download and validate official HeatSafe safety references."""

import hashlib
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path


BASE = Path(__file__).resolve().parents[1] / "data"
SOURCES = [
    ("regulatory/adosh_sf_cop_11_safety_heat_v4_en.pdf", "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Codes-of-Practise/11---Safety-in-the-Heat-v31-English.pdf", "Safety in the Heat", "4.0", "pdf", "Safety in the Heat"),
    ("regulatory/adosh_sf_cop_11_safety_heat_v4_ar.pdf", "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Codes-of-Practise/11---Safety-in-the-Heat-v31-Arabic.pdf", "Safety in the Heat (Arabic)", "4.0", "pdf", "4.0"),
    ("regulatory/adosh_sf_tg_safety_heat_v4_en.pdf", "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Technical-Guidelines/Safety-in-the-Heat--Eng.pdf", "Safety in the Heat Technical Guideline", "4.0", "pdf", "Safety in the Heat"),
    ("regulatory/adosh_sf_cop_53_1_construction_v4_1_en.pdf", "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/Codes-of-Practise/2026/COP-531--OSH-Construction-Management-Plan-v41-English.pdf", "OSH Construction Management Plan", "4.1", "pdf", "Construction Management Plan"),
    ("regulatory/adphc_codes_of_practice_index.html", "https://www.adphc.gov.ae/en/Legislation/Code-of-Practices", "ADPHC Codes of Practice index", "current", "html", "Safety in the Heat"),
    ("regulatory/mohre_occupational_safety_guide_en.pdf", "https://www.mohre.gov.ae/assets/download/11018ec0/Occupational-Health-and-Safety-Guide-EN.pdf.aspx", "MoHRE Occupational Health and Safety Guide", "current", "pdf", "Occupational Heat Stress"),
    ("regulatory/mohre_midday_resolution_44_2022_en.pdf", "https://www.mohre.gov.ae/handlers/download.ashx?YXNzZXQ9NjY1NA%3D%3D=", "MoHRE Ministerial Resolution 44 of 2022", "2022", "pdf", "Ministerial Resolution"),
    ("regulatory/mohre_administrative_decision_19_2023_en.pdf", "https://mohre.gov.ae/assets/download/6786916a/administrative-decision-no-19-of-2023-relating-to-occupational-safety-and-health-and-labour.aspx", "MoHRE Administrative Decision 19 of 2023", "2023", "pdf", "ADMINISTRATIVE DECISION"),
    ("regulatory/uae_pdpl_fdl_45_2021_en.pdf", "https://www.uaelegislation.gov.ae/en/legislations/1972/download", "UAE Personal Data Protection Law", "2021", "pdf", "Protection of Personal Data"),
    ("regulatory/uae_health_ict_federal_law_2_2019_en.pdf", "https://uaelegislation.gov.ae/en/legislations/1209/download", "UAE Health ICT Law", "2019", "pdf", "Information and Communications Technology"),
    ("regulatory/uae_health_ict_regulation_32_2020_en.pdf", "https://uaelegislation.gov.ae/en/legislations/1444/download", "UAE Health ICT Executive Regulation", "2020", "pdf", "Information and Communication Technology"),
    ("regulatory/adhics_v2_standard.pdf", "https://www.doh.gov.ae/-/media/Feature/Resources/Standards/ADHICS-v2-standard.ashx", "Abu Dhabi Healthcare Information and Cyber Security Standard", "2", "pdf", "ADHICS"),
    ("regulatory/adhics_faq.pdf", "https://www.doh.gov.ae/-/media/Feature/Aamen/ADHICS-FAQ.ashx", "ADHICS FAQ", "current", "pdf", "ADHICS"),
    ("guidance/niosh_2016_106_heat.pdf", "https://www.cdc.gov/niosh/docs/2016-106/pdfs/2016-106.pdf", "NIOSH Occupational Exposure to Heat and Hot Environments", "2016-106", "pdf", "Criteria for a Recommended Standard"),
    ("guidance/ilo_working_on_a_warmer_planet_2019.pdf", "https://www.ilo.org/sites/default/files/wcmsp5/groups/public/%40dgreports/%40dcomm/%40publ/documents/publication/wcms_711919.pdf", "Working on a warmer planet", "2019", "pdf", "warmer planet"),
    ("guidance/who_wmo_heatwaves_warning_systems_2015.pdf", "https://cdn.who.int/media/docs/default-source/climate-change/heat-waves-and-health---guidance-on-warning-system-development.pdf?download=true&sfvrsn=e4813084_2", "Heatwaves and health: warning-system development", "2015/2016", "pdf", "HEATWAVES AND HEALTH"),
    ("guidance/who_wmo_workplace_heat_stress_2025.pdf", "https://iris.who.int/bitstream/handle/10665/382351/9789240099814-eng.pdf?sequence=1", "Climate change and workplace heat stress", "2025", "pdf", "workplace heat stress"),
    ("guidance/who_heat_and_health_factsheet.html", "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health", "WHO Heat and health fact sheet", "2026", "html", "Heat and health"),
    ("regulatory/mohre_heat_stress_policy.html", "https://observatory.mohre.gov.ae/en/uae-labour-market-priorities/social-protection-and-well-being-assurance", "MoHRE Heat Stress Prevention Policy", "2025/2026", "html", "Heat Stress Prevention Policy"),
    ("guidance/wmo_workplace_heat_stress_2025.html", "https://wmo.int/resources/publication-series/climate-change-and-workplace-heat-stress/climate-change-and-workplace-heat-stress", "WMO Climate change and workplace heat stress publication", "2025", "html", "Climate change and workplace heat stress"),
]


def fetch(url):
    timeout = 60 if "ADHICS-v2" in url else (8 if "mohre.gov.ae" in url else 20)
    result = subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error", "--max-time", str(timeout), url], capture_output=True, timeout=timeout + 4)
    if result.returncode:
        raise OSError(result.stderr.decode("utf-8", "replace").strip())
    return result.stdout, url


def validate(data, kind, needle):
    if kind == "pdf":
        assert data.startswith(b"%PDF-"), "missing PDF signature"
        result = subprocess.run(["pdftotext", "-f", "1", "-l", "3", "-", "-"], input=data, capture_output=True, timeout=30)
        assert result.returncode == 0, "pdftotext failed"
        assert needle.casefold() in result.stdout.decode("utf-8", "replace").casefold(), f"title marker missing: {needle}"
    else:
        text = data.decode("utf-8", "replace")
        assert "<html" in text.lower() and needle.casefold() in text.casefold(), "invalid HTML or title marker missing"
        assert "<title>error" not in text.lower(), "error page"
    assert len(data) > 1000, "suspiciously small response"


def download(source):
    relative, url, title, version, kind, needle = source
    path = BASE / "raw" / relative
    entry = {"source_url": url, "relative_path": str(path.relative_to(BASE)), "title": title, "version": version}
    entry["attempted_utc"] = datetime.now(timezone.utc).isoformat()
    try:
        if path.exists():
            data = path.read_bytes()
            validate(data, kind, needle)
            final_url = url
            retrieved = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
            entry["notes"] = "Fresh download from interrupted prior run; reused after validation"
        else:
            data, final_url = fetch(url)
            validate(data, kind, needle)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            retrieved = datetime.now(timezone.utc).isoformat()
        entry.update(status="downloaded", retrieved_utc=retrieved, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), final_url=final_url)
        print("OK", relative, len(data), flush=True)
    except (OSError, ValueError, AssertionError, subprocess.TimeoutExpired) as error:
        entry.update(status="unavailable", notes=f"{type(error).__name__}: {error}")
        print("FAIL", relative, entry["notes"], flush=True)
    return entry


def main():
    assert len({s[0] for s in SOURCES}) == len(SOURCES)
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(download, SOURCES))
    (BASE / "manifest_safety.json").write_text(json.dumps({"generated_utc": datetime.now(timezone.utc).isoformat(), "sources": records}, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
