"""compute_worker_risk (README_WORKER_RISK.md): same air, different answers, and only ever upward."""
from datetime import date
from itertools import product

import pytest

from heat_safe import rules
from heat_safe.acclimatisation import acclimatisation_status
from heat_safe.forecast import get_replay
from heat_safe.heat_stress import compute_heat_stress
from heat_safe.rules import Band
from heat_safe.worker_risk import WorkerFactors, compute_worker_risk, crew_risk, with_local_reading

MEDIUM = {'work_wear': 127.0, 'cloth_coveralls': 121.0, 'coveralls_over_work_wear': 94.0}


@pytest.fixture(scope='module')
def mussafah_0500():
    w = get_replay('2025-08-01')
    w = w[w.site == 'mussafah']
    return {name: float(compute_heat_stress(w, icl=c.icl).query('time.dt.hour == 5').iloc[0].twl_wm2)
            for name, c in rules.CLOTHING.items() if c.in_twl_model}


def test_same_air_three_bands_at_0500(mussafah_0500):
    w07 = acclimatisation_status(date(2025, 8, 1), new_starter_since=date(2025, 7, 28))
    risks = [compute_worker_risk(mussafah_0500, WorkerFactors('W03')),
             compute_worker_risk(mussafah_0500, WorkerFactors('W07', acclimatisation=w07)),
             compute_worker_risk(mussafah_0500, WorkerFactors('W09', clothing='coveralls_over_work_wear'))]
    assert [r.band for r in risks] == [Band.GREEN, Band.AMBER, Band.RED]
    assert [r.twl_wm2 for r in risks] == [144, 144, 112]
    assert crew_risk(risks) == {'band': 'red', 'at_or_above_amber': 2, 'total': 3,
                                'counts': {'green': 1, 'amber': 1, 'red': 1, 'emergency': 0}}


def test_vapour_barrier_is_red_with_special_controls_without_twl():
    r = compute_worker_risk(MEDIUM, WorkerFactors('W1', clothing='vapour_barrier'))
    assert r.band == Band.RED and r.twl_wm2 is None and r.special_controls
    assert 'special controls' in r.action.lower()


def test_missing_weather_is_red_and_says_so():
    r = compute_worker_risk(None, WorkerFactors('W1'))
    assert r.band == Band.RED and r.missing_inputs == ('site heat',)


def test_workload_sets_the_work_rest_limits():
    heavy = compute_worker_risk(MEDIUM, WorkerFactors('W1'))
    light = compute_worker_risk(MEDIUM, WorkerFactors('W2', work_intensity='light'))
    assert heavy.band == light.band == Band.AMBER
    assert heavy.work_rest == '45 min work / 15 min rest'
    assert light.work_rest == 'continuous self-paced light work'
    assert heavy.action == 'Paced work: 45 min work / 15 min rest. Drink more than 1.2 litres an hour.'
    assert light.action.endswith('Drink 1.0-1.2 litres an hour.')


def test_a_raised_band_uses_the_stricter_zone_limits():
    r = compute_worker_risk(MEDIUM, WorkerFactors('W1', low_fluid=True))
    assert r.band == Band.RED and r.work_rest == '20 min work / 40 min rest'
    assert r.action.startswith('Drink now')


def test_new_starter_may_not_work_outside_the_low_zone():
    day2 = acclimatisation_status(date(2025, 8, 4), new_starter_since=date(2025, 8, 3))
    r = compute_worker_risk(MEDIUM, WorkerFactors('C13', acclimatisation=day2))
    assert not r.may_work_here and r.band == Band.RED
    assert 'acclimatisation' in r.supervisor_action


def test_lost_wearable_raises_and_tells_supervisor():
    ok = compute_worker_risk(MEDIUM, WorkerFactors('W1', wearable='ok'))
    lost = compute_worker_risk(MEDIUM, WorkerFactors('W1', wearable='lost'))
    assert lost.band == ok.band.raised(1) and lost.missing_inputs == ('wearable',)
    assert lost.check_in_person and lost.supervisor_action.startswith('Check in person')


def test_strain_counts_only_from_a_working_wearable():
    assert compute_worker_risk(MEDIUM, WorkerFactors('W1', strain_rising=True)).band == Band.AMBER
    strained = compute_worker_risk(MEDIUM, WorkerFactors('W1', wearable='ok', strain_rising=True))
    assert strained.band == Band.RED and strained.needs_rest


def test_red_flag_is_emergency():
    r = compute_worker_risk({'work_wear': 160.0}, WorkerFactors('W1', red_flag=True))
    assert r.band == Band.EMERGENCY and '998' in r.supervisor_action and r.work_rest is None


def test_adding_any_factor_never_lowers_the_band():
    new = acclimatisation_status(date(2025, 8, 4), new_starter_since=date(2025, 8, 3))
    for clothing, twl in product(rules.CLOTHING, (160.0, 127.0, 94.0)):
        heat = {name: twl - i * 5 for i, name in enumerate(MEDIUM)}
        base = WorkerFactors('W1', clothing=clothing)
        before = compute_worker_risk(heat, base).band
        for change in [dict(acclimatisation=new), dict(symptoms_reported=True), dict(low_fluid=True),
                       dict(red_flag=True), dict(wearable='lost'), dict(wearable='ok', strain_rising=True)]:
            after = compute_worker_risk(heat, WorkerFactors('W1', clothing=clothing, **change)).band
            assert after >= before, (clothing, twl, change)
        assert compute_worker_risk(heat, base, environment_ok=False).band >= before


def test_local_reading_only_corrects_toward_caution():
    hotter = with_local_reading(MEDIUM, 110.0)
    assert hotter == {name: twl - 17.0 for name, twl in MEDIUM.items()}
    assert with_local_reading(MEDIUM, 175.0) == MEDIUM
    assert with_local_reading(MEDIUM, None) == MEDIUM


def test_supervisor_view_has_band_and_action_only():
    r = compute_worker_risk(MEDIUM, WorkerFactors('C08', symptoms_reported=True, clothing='cloth_coveralls'))
    view = r.for_supervisor()
    assert set(view) == {'person_id', 'band', 'action', 'needs_rest', 'check_in_person'}
    assert view['needs_rest'] and 'unwell' not in str(view).lower()
    assert 'You reported feeling unwell' in r.for_worker()['factors']
