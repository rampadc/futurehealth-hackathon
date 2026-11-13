"""lookup_job_profile: role → work intensity, metabolic class and typical PPE. Deterministic.

Work intensity follows the ADOSH-SF Technical Guideline Table 1 notes: light = sitting or standing,
light arm work; heavy = carrying, climbing, lifting, pushing, whole-body work. Metabolic classes are
ISO 8996 (Table 2). Heat-exposure context comes from O*NET 30.1 Work Context, a US proxy
(data/heat_safe/processed/onet_work_context_plan_roles.csv), and is labelled as such.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from functools import cache

import pandas as pd

from heat_safe.paths import PROCESSED

ONET_EXTRACT = PROCESSED / "onet_work_context_plan_roles.csv"

# ISO 8996 metabolic rate classes, typical W/m²
ISO8996_CLASSES = {1: ("low", 100), 2: ("moderate", 165), 3: ("high", 230), 4: ("very high", 290)}

ONET_CONTEXT = {
    "Outdoors, Exposed to All Weather Conditions": "outdoors",
    "Exposed to Very Hot or Cold Temperatures": "very_hot_or_cold",
    "Wear Common Protective or Safety Equipment such as Safety Shoes, Glasses, Gloves, Hearing Protection, Hard Hats, or Life Jackets": "common_ppe",
    "Wear Specialized Protective or Safety Equipment such as Breathing Apparatus, Safety Harness, Full Protection Suits, or Radiation Protection": "specialized_ppe",
}


@dataclass(frozen=True)
class JobProfile:
    role: str
    work_intensity: str            # "light" | "heavy" (ADOSH-SF TWL table)
    iso8996_class: int
    metabolic_rate_wm2: int
    typical_ppe: tuple[str, ...]
    clothing_clo: float            # for compute_worker_risk PPE adjustment
    onet_soc_code: str
    onet_title: str
    onet_context: dict = field(default_factory=dict)  # 1-5 scale; US proxy

    def to_dict(self) -> dict:
        d = asdict(self)
        d["metabolic_class_name"] = ISO8996_CLASSES[self.iso8996_class][0]
        return d


_ROLES = {
    "roofer": dict(
        work_intensity="heavy", iso8996_class=3,
        typical_ppe=("hard hat", "safety harness", "gloves", "safety boots", "long-sleeved work wear"),
        clothing_clo=0.6, onet_soc_code="47-2181.00", onet_title="Roofers"),
    "steel_fixer": dict(
        work_intensity="heavy", iso8996_class=3,
        typical_ppe=("hard hat", "gloves", "safety boots", "eye protection", "long-sleeved work wear"),
        clothing_clo=0.6, onet_soc_code="47-2171.00", onet_title="Reinforcing Iron and Rebar Workers"),
    "labourer": dict(
        work_intensity="heavy", iso8996_class=3,
        typical_ppe=("hard hat", "gloves", "safety boots", "hi-vis vest", "long-sleeved work wear"),
        clothing_clo=0.6, onet_soc_code="47-2061.00", onet_title="Construction Laborers"),
    "driver": dict(
        work_intensity="light", iso8996_class=1,
        typical_ppe=("hi-vis vest", "safety boots"),
        clothing_clo=0.5, onet_soc_code="53-3032.00", onet_title="Heavy and Tractor-Trailer Truck Drivers"),
}
ALIASES = {"rebar worker": "steel_fixer", "steel fixer": "steel_fixer", "laborer": "labourer",
           "general labourer": "labourer", "truck driver": "driver",
           # Concrete work is heavy, like labouring (added 6 Nov after the concrete-pour eval). O*NET context
           # stays the labourer's (47-2061); concrete finishers (47-2051) could get their own role later.
           "concrete worker": "labourer", "concrete pourer": "labourer"}


@cache
def _onet_context(soc: str) -> dict:
    if not ONET_EXTRACT.exists():
        return {}
    df = pd.read_csv(ONET_EXTRACT)
    df = df[(df["O*NET-SOC Code"] == soc) & (df["Scale ID"] == "CX") & df["Element Name"].isin(ONET_CONTEXT)]
    return {ONET_CONTEXT[n]: round(float(v), 2) for n, v in zip(df["Element Name"], df["Data Value"])}


def lookup_job_profile(role: str) -> JobProfile:
    key = role.strip().lower().replace("-", " ")
    key = ALIASES.get(key, key.replace(" ", "_"))
    if key not in _ROLES:
        raise KeyError(f"unknown role {role!r}; known: {sorted(_ROLES)}")
    spec = _ROLES[key]
    return JobProfile(
        role=key,
        metabolic_rate_wm2=ISO8996_CLASSES[spec["iso8996_class"]][1],
        onet_context=_onet_context(spec["onet_soc_code"]),
        **spec,
    )
