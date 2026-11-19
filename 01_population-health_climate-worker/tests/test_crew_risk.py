"""Per-worker heat risk on the case (application/crew_risk.py): who sees what, and inputs that only raise."""
import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from heat_safe.application import crew_risk, platform_api
from heat_safe.application import service as module

MEDIUM = {'work_wear': 127.0, 'cloth_coveralls': 121.0, 'coveralls_over_work_wear': 94.0}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('HEAT_SAFE_LOCAL_DIR', str(tmp_path))

    async def graph(request, _url):
        return 200, {'heat': {'held_task_ids': []}, 'protective_response': {},
                     'crew_rest': {'planning_status': 'planned', 'intervals': [], 'blockers': []},
                     'restart': {'status': 'blocked'}}, ['stub']
    monkeypatch.setattr(module, 'run_graph', graph)
    service = module.CaseService(tmp_path / 'case.sqlite3')
    asyncio.run(service.start())
    api = FastAPI()
    api.state.service = service
    api.include_router(crew_risk.router)
    return api


@pytest.fixture
def medium(monkeypatch):
    monkeypatch.setattr(crew_risk, 'site_twl', lambda day, hour: dict(MEDIUM))


def client(app, persona):
    token, _ = app.state.service.create_session(persona)
    http = TestClient(app)
    http.cookies.set('heat_persona', token)
    return http


def by_id(body):
    return {w['person_id']: w for w in body['workers']}


def test_supervisors_see_band_and_action_only(app, medium):
    body = client(app, 'C01').get('/api/case/crew-risk').json()
    workers = by_id(body)
    assert len(workers) == 11 and all(set(w) == {'person_id', 'band', 'action', 'needs_rest', 'check_in_person'} for w in workers.values())
    assert workers['C06']['band'] == 'red' and workers['C05']['band'] == 'amber'
    assert workers['C07']['action'] == 'Paced work: 45 min work / 15 min rest'
    assert workers['C02']['action'] == 'Paced work: continuous self-paced light work'
    assert body['crew'] == {'band': 'red', 'at_or_above_amber': 11, 'total': 11,
                            'counts': {'green': 0, 'amber': 9, 'red': 2, 'emergency': 0}}
    assert body['inputs']['local_reading'] == 'used'
    assert client(app, 'C05').get('/api/case/crew-risk').status_code == 403
    assert client(app, 'P10').get('/api/case/crew-risk').status_code == 403
    project = client(app, 'P01').get('/api/case/crew-risk').json()
    assert project['workers'] == [] and project['crew'] == body['crew']
    assert TestClient(app).get('/api/case/crew-risk').status_code == 401


def test_a_worker_sees_only_their_own_risk_with_reasons(app, medium):
    rana = client(app, 'C05').get('/api/worker/risk').json()
    assert rana['person_id'] == 'C05' and rana['band'] == 'amber' and rana['twl_wm2'] == 121
    assert 'factors' in rana and 'workers' not in rana
    assert client(app, 'P02').get('/api/worker/risk').status_code == 403


def test_a_faulty_local_reading_raises_every_band(app, medium):
    service = app.state.service
    asyncio.run(service.advance_clock('2025-08-04T08:04:00+04:00'))
    asyncio.run(service.signal('reading', {'sensor_id': 't1', 'zone_id': 'civil_exposed', 'twl': 145, 'unit': 'W/m²',
                                           'quality': 'invalid', 'measured_at': '2025-08-04T08:04:00+04:00',
                                           'received_at': '2025-08-04T08:04:00+04:00'}))
    body = client(app, 'P03').get('/api/case/crew-risk').json()
    assert body['inputs']['local_reading'] == 'lost'
    assert {w['band'] for w in body['workers']} == {'red'}
    assert 'local heat reading' in client(app, 'C08').get('/api/worker/risk').json()['missing_inputs']


def test_a_hotter_local_reading_lowers_every_limit(app, medium):
    view = app.state.service.read_case(None)
    view['request']['snapshot']['readings'][-1]['twl'] = 110
    risks, inputs = crew_risk.assess(view)
    assert inputs['local_reading'] == 'used'
    assert {r.band.name for r in risks} == {'RED'}


def test_a_report_of_feeling_unwell_shows_as_needs_rest_without_detail(app, medium):
    view = app.state.service.read_case(None)
    view['story']['events'].append({'id': 'report', 'actorId': 'C08'})
    risks = {r.person_id: r for r in crew_risk.assess(view)[0]}
    bilal = risks['C08']
    assert bilal.for_supervisor()['needs_rest'] and bilal.for_supervisor()['action'].startswith('Needs rest now')
    assert 'You reported feeling unwell' in bilal.for_worker()['factors']
    assert not risks['C07'].needs_rest


def test_unknown_weather_is_red_not_safe(app, monkeypatch):
    monkeypatch.setattr(crew_risk, 'site_twl', lambda day, hour: None)
    body = client(app, 'P02').get('/api/case/crew-risk').json()
    assert body['inputs']['weather'] == 'unavailable' and {w['band'] for w in body['workers']} == {'red'}


def test_acclimatisation_comes_from_the_roster():
    from datetime import date
    assert crew_risk.acclimatisation_for('C05', date(2025, 8, 4)).status == 'acclimatised'
    day2 = crew_risk.acclimatisation_for('C13', date(2025, 8, 4))
    assert day2.status == 'new_starter' and day2.day == 2 and day2.low_zone_only


def test_real_replay_weather_at_0800_separates_the_crew(app):
    """4 Aug 2025, 08:00, Mussafah ERA5: work wear Medium (127), coveralls over work wear High (94)."""
    workers = by_id(client(app, 'P02').get('/api/case/crew-risk').json())
    assert workers['C04']['band'] == 'amber' and workers['C06']['band'] == 'red' and workers['C10']['band'] == 'red'


def test_other_squads_use_their_roster_and_own_sensor(app, medium):
    # Formwork: sensor t2 is live (156 W/m² at 08:00, Low zone in work wear).
    form = client(app, 'P03').get('/api/case/crew-risk', params={'squad': 'form'}).json()
    workers = by_id(form)
    assert len(workers) == 9 and form['inputs']['squad'] == 'form' and form['inputs']['local_reading'] == 'used'
    assert workers['F01']['band'] == 'green' and workers['F01']['action'] == 'Work as planned'
    assert workers['F09']['band'] == 'amber'  # day 3 of acclimatisation: one level higher
    assert all(set(w) == {'person_id', 'band', 'action', 'needs_rest', 'check_in_person'} for w in workers.values())

    # Steel fixing: sensor t3 is offline, so the forecast stands and every band is one level higher.
    steel = client(app, 'P03').get('/api/case/crew-risk', params={'squad': 'steel'}).json()
    workers = by_id(steel)
    assert len(workers) == 12 and steel['inputs']['local_reading'] == 'lost'
    assert workers['S01']['band'] == 'red' and steel['crew']['band'] == 'red'


def test_other_squads_keep_access_rules(app, medium):
    assert client(app, 'C05').get('/api/case/crew-risk', params={'squad': 'steel'}).status_code == 403
    assert client(app, 'P03').get('/api/case/crew-risk', params={'squad': 'nope'}).status_code == 404
    project = client(app, 'P01').get('/api/case/crew-risk', params={'squad': 'steel'}).json()
    assert project['workers'] == [] and project['crew']['total'] == 12


def test_presenter_conditions_reach_other_squads(app, medium):
    from heat_safe.application import demo_site
    settings = demo_site.defaults()
    settings['conditions'] = {'S02': ['unwell']}
    demo_site.save(app.state.service, settings)
    workers = by_id(client(app, 'P03').get('/api/case/crew-risk', params={'squad': 'steel'}).json())
    assert workers['S02']['needs_rest'] and not workers['S01']['needs_rest']
