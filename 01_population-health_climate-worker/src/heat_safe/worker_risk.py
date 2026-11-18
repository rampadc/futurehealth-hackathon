"""compute_worker_risk: one worker's heat-risk band for one hour, and the crew roll-up. Pure code.

Same air, different answers: the site's heat is recomputed for the worker's clothing, then raised for what
is true about them (README_WORKER_RISK.md, "The six layers"). Built here: L1 environment, L2 clothing, L3
modifiers (acclimatisation, reported symptoms, low fluid, a heat-sensitive health condition), L4 as a strain flag from a consented wearable,
L5 fail-safe for lost inputs, the red-flag rule and the L6 crew roll-up. Not built: the planned-baseline
table and the alert triggers. This module gives the state (band), never the events (alerts).

Every layer can only raise the band, so adding a factor or losing an input never makes anyone safer on paper.
"""
from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass

from heat_safe import rules
from heat_safe.acclimatisation import ACCLIMATISED, Acclimatisation
from heat_safe.rules import Band

WEARABLE_STATES = ('not_used', 'ok', 'lost')
# The zone whose work/rest controls apply at each band: a raised band means the stricter zone's limits.
BAND_ZONE = {Band.GREEN: rules.ZONE_LOW, Band.AMBER: rules.ZONE_MEDIUM, Band.RED: rules.ZONE_HIGH}


@dataclass(frozen=True)
class WorkerFactors:
    person_id: str
    work_intensity: str = 'heavy'  # ADOSH-SF TWL table: 'light' | 'heavy'
    clothing: str = rules.DEFAULT_CLOTHING
    acclimatisation: Acclimatisation = ACCLIMATISED
    symptoms_reported: bool = False  # a non-red-flag symptom at a check-in or report
    low_fluid: bool = False
    heat_sensitive: bool = False  # a health condition or medicine on record that lowers heat tolerance
    red_flag: bool = False  # confusion, collapse, vomiting, stopped sweating
    wearable: str = 'not_used'  # only 'ok' when consented, paired and sending
    strain_rising: bool = False  # read only from a working wearable

    def __post_init__(self):
        if self.work_intensity not in ('light', 'heavy'):
            raise ValueError(f'unknown work intensity {self.work_intensity!r}')
        if self.wearable not in WEARABLE_STATES:
            raise ValueError(f'unknown wearable state {self.wearable!r}')
        rules.clothing(self.clothing)


@dataclass(frozen=True)
class WorkerRisk:
    person_id: str
    band: Band
    twl_wm2: int | None  # the worker's own TWL for their clothing; None outside the model or when unknown
    zone: str | None
    factors: tuple[str, ...]  # why, in plain language: for the worker only
    missing_inputs: tuple[str, ...]
    special_controls: bool
    may_work_here: bool
    work_rest: str | None
    action: str  # the worker's instruction, fixed text
    supervisor_action: str  # band and action only: no symptoms, readings or check-in answers
    needs_rest: bool
    check_in_person: bool

    def for_worker(self) -> dict:
        return {'person_id': self.person_id, 'band': self.band.name.lower(), 'twl_wm2': self.twl_wm2, 'zone': self.zone,
                'factors': list(self.factors), 'missing_inputs': list(self.missing_inputs),
                'special_controls': self.special_controls, 'may_work_here': self.may_work_here,
                'work_rest': self.work_rest, 'action': self.action}

    def for_supervisor(self) -> dict:
        return {'person_id': self.person_id, 'band': self.band.name.lower(), 'action': self.supervisor_action,
                'needs_rest': self.needs_rest, 'check_in_person': self.check_in_person}


def _fluid(controls: rules.ZoneControls, intensity: str) -> str:
    """The zone's fluid rate for this workload, as words: '1.0-1.2', 'more than 1.2'."""
    parts = [p.strip() for p in controls.fluid_l_per_hr.split(';')]
    part = next((p for p in parts if intensity in p), parts[0])
    amount = re.sub(r'\s*\(.*\)|\s*(light|heavy|all work)$', '', part).strip()
    return f'more than {amount[1:]}' if amount.startswith('>') else amount


def _known(value) -> bool:
    return value is not None and not (isinstance(value, float) and math.isnan(value))


def with_local_reading(twl_by_clothing: Mapping[str, float], local_twl: float | None) -> dict[str, float]:
    """Correct the weather's TWL with a valid local reading, only ever toward caution.

    A local reading measures the site in ordinary work wear. If it is hotter (lower TWL) than the weather
    says, every ensemble drops by the same amount; a cooler reading changes nothing, like the forecast bias
    rule (rules.SENSOR_BIAS_FADE_HOURS).
    """
    base = twl_by_clothing.get(rules.DEFAULT_CLOTHING)
    if not _known(local_twl) or not _known(base):
        return dict(twl_by_clothing)
    drop = max(0.0, base - local_twl)
    return {name: twl - drop for name, twl in twl_by_clothing.items()}


def compute_worker_risk(twl_by_clothing: Mapping[str, float] | None, worker: WorkerFactors, *,
                        environment_ok: bool = True) -> WorkerRisk:
    """One worker's band for one hour.

    Args:
        twl_by_clothing: the site's TWL for this hour for each clothing ensemble in the TWL model (sun or
            shade, whichever the work is in), from compute_heat_stress. None when the weather is unknown.
        worker: what is true about this worker now.
        environment_ok: False when the site's local reading is faulty or stale (a lost input).
    """
    clothing = rules.clothing(worker.clothing)
    factors: list[str] = []
    missing: list[str] = []
    twl = (twl_by_clothing or {}).get(worker.clothing)

    # L1 environment + L2 clothing
    if not clothing.in_twl_model:
        band, own, zone = Band.RED, None, None
        factors.append(f'{clothing.description.capitalize()}: sweat cannot evaporate, so no work limit applies')
    elif not _known(twl):
        band, own, zone = Band.RED, None, None
        missing.append('site heat')
    else:
        own = rules.display_twl(twl)
        zone = rules.twl_zone(twl)
        band = rules.ZONE_BAND[zone]
        site = (twl_by_clothing or {}).get(rules.DEFAULT_CLOTHING)
        if worker.clothing != rules.DEFAULT_CLOTHING and _known(site) and rules.twl_zone(site) != zone:
            factors.append(f'{clothing.description.capitalize()} lower your work limit to {own} W/m² '
                           f'({zone} zone; work wear is {rules.twl_zone(site)})')

    # L3 modifiers: one level each
    modifiers = []
    if worker.acclimatisation.status != 'acclimatised':
        modifiers.append(f'Still acclimatising: {worker.acclimatisation.reason}')
    if worker.symptoms_reported:
        modifiers.append('You reported feeling unwell')
    if worker.low_fluid:
        modifiers.append('You have drunk less than this heat needs')
    if worker.heat_sensitive:
        modifiers.append('A health condition on your record lowers your heat tolerance')
    band = band.raised(len(modifiers))
    factors += modifiers

    # L4 physiology adds caution, never removes it
    strain = worker.wearable == 'ok' and worker.strain_rising
    if strain:
        band = max(band, Band.RED)
        factors.append('Your heart rate has kept rising at the same work')

    # L5 fail-safe: an unknown is treated as worse
    if worker.wearable == 'lost':
        missing.append('wearable')
    if not environment_ok:
        missing.append('local heat reading')
    if missing and own is not None:
        band = band.raised(1)
    if missing:
        factors.append(f'Set one level higher because {" and ".join(missing)} {"is" if len(missing) == 1 else "are"} missing')

    if worker.red_flag:
        band = Band.EMERGENCY

    may_work_here = not (worker.acclimatisation.low_zone_only and zone != rules.ZONE_LOW)
    controls = rules.ZONE_CONTROLS.get(BAND_ZONE.get(band, rules.ZONE_HIGH))
    work_rest = None if band == Band.EMERGENCY else getattr(controls, f'work_rest_{worker.work_intensity}').replace(' (paced work)', '')
    fluid = None if band == Band.EMERGENCY else _fluid(controls, worker.work_intensity)
    needs_rest = worker.symptoms_reported or strain
    check_in_person = worker.wearable == 'lost'

    if band == Band.EMERGENCY:
        action = 'Stop now and call for help. Your buddy stays with you.'
        supervisor = 'Emergency: call 998 and start cooling'
    elif needs_rest:
        action = 'Stop work, rest in the cooled shelter and tell your foreman.'
        supervisor = 'Needs rest now: remove from heat and check in within 10 minutes'
    elif not may_work_here:
        action = 'Low zone work only while you acclimatise. Ask your foreman for covered work.'
        supervisor = 'Low zone work only (acclimatisation): move to covered work'
    elif not clothing.in_twl_model:
        action = 'Work only with special controls: a cooling garment and short exposures.'
        supervisor = 'Special controls only: cooling garment and short exposures'
    elif worker.low_fluid:
        action = f'Drink now, then {fluid} litres an hour. {work_rest.capitalize()}.'
        supervisor = f'Prompt to drink now · {work_rest}'
    elif band == Band.GREEN:
        action = 'Work as planned and drink regularly.'
        supervisor = 'Work as planned'
    elif band == Band.AMBER:
        action = f'Paced work: {work_rest}. Drink {fluid} litres an hour.'
        supervisor = f'Paced work: {work_rest}'
    else:
        action = (f'Strict work and rest: {work_rest}. Drink every 15 minutes. '
                  'Stop and tell your supervisor if you feel unwell.')
        supervisor = f'Strict work and rest: {work_rest}'
    if check_in_person and band != Band.EMERGENCY:
        supervisor = f'Check in person: wearable data lost · {supervisor}'

    return WorkerRisk(worker.person_id, band, own, zone, tuple(factors), tuple(missing), not clothing.in_twl_model,
                      may_work_here, work_rest, action, supervisor, needs_rest, check_in_person)


def crew_risk(risks: list[WorkerRisk]) -> dict:
    """L6: the crew's band is its highest worker band, with the share at Amber or above."""
    counts = {b.name.lower(): sum(r.band == b for r in risks) for b in Band}
    return {'band': max((r.band for r in risks), default=Band.GREEN).name.lower(),
            'at_or_above_amber': sum(r.band >= Band.AMBER for r in risks), 'total': len(risks), 'counts': counts}
