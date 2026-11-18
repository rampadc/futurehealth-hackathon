"""Presenter site settings (application/demo_site.py): hourly TWL, sensor state, health conditions, case time."""
import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from heat_safe.application import crew_risk, demo_site
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
    monkeypatch.setattr(crew_risk, 'site_twl', lambda day, hour: dict(MEDIUM))
    service = module.CaseService(tmp_path / 'case.sqlite3')
    asyncio.run(service.start())
    api = FastAPI()
    api.state.service = service
    api.include_router(demo_site.router)
    api.include_router(crew_risk.router)
    api.add_exception_handler(module.CaseError, lambda _r, e: __import__('fastapi').responses.JSONResponse({'detail': e.detail}, e.status))
    return api


def readings(service):
    return service.read_case(None)['request']['snapshot']['readings']


def test_defaults_leave_the_scenario_reading_alone(app):
    http = TestClient(app)
    body = http.get('/api/demo/site').json()
    assert body['settings'] == body['defaults'] and body['hours'] == [8, 9, 10]
    assert not asyncio.run(demo_site.sync(app.state.service))
    assert [r['twl'] for r in readings(app.state.service)] == [145.0]


def test_editing_the_live_sensor_records_one_reading_per_hour_and_setting(app):
    http, service = TestClient(app), app.state.service
    settings = http.get('/api/demo/site').json()['settings']
    settings['twl']['civil']['t1']['8'] = 110
    settings['twl']['civil']['t1']['9'] = 175
    assert http.put('/api/demo/site', json=settings).status_code == 200
    assert readings(service)[-1]['twl'] == 110 and readings(service)[-1]['quality'] == 'valid'
    assert not asyncio.run(demo_site.sync(service))  # same hour and setting: nothing new
    asyncio.run(demo_site.jump(service, '2025-08-04T09:05:00+04:00'))
    assert readings(service)[-1]['twl'] == 175
    assert http.get('/api/case/site-sensors').json()['squads']['civil']['t1'] == 175


def test_offline_and_stale_sensors_lose_the_local_reading(app):
    http, service = TestClient(app), app.state.service
    settings = http.get('/api/demo/site').json()['settings']
    settings['sensors']['t1'] = 'offline'
    http.put('/api/demo/site', json=settings)
    assert readings(service)[-1]['quality'] == 'invalid'
    assert crew_risk.assess(service.read_case(None))[1]['local_reading'] == 'lost'
    settings['sensors']['t1'] = 'stale'
    http.put('/api/demo/site', json=settings)
    last = readings(service)[-1]
    assert last['quality'] == 'valid' and last['measured_at'] < last['received_at']
    assert crew_risk.assess(service.read_case(None))[1]['local_reading'] == 'lost'


def test_restoring_defaults_puts_the_scenario_value_back(app):
    http, service = TestClient(app), app.state.service
    settings = http.get('/api/demo/site').json()['settings']
    settings['twl']['civil']['t1']['8'] = 100
    http.put('/api/demo/site', json=settings)
    http.post('/api/demo/site/defaults')
    assert readings(service)[-1]['twl'] == 145


def test_health_conditions_only_raise_bands(app):
    http, service = TestClient(app), app.state.service
    before = {r.person_id: r.band for r in crew_risk.assess(service.read_case(None))[0]}
    settings = http.get('/api/demo/site').json()['settings']
    settings['conditions'] = {'C07': ['heat_sensitive'], 'C09': ['red_flag'], 'C04': ['not_acclimatised', 'low_fluid']}
    http.put('/api/demo/site', json=settings)
    workers = {w['person_id']: w for w in http.get('/api/demo/crew-risk').json()['workers']}
    assert workers['C07']['band'] == 'red' and before['C07'].name == 'AMBER'
    assert 'A health condition on your record lowers your heat tolerance' in workers['C07']['factors']
    assert workers['C09']['band'] == 'emergency'
    assert all(workers[pid]['band'] != 'green' for pid in workers)
    # Supervisors see the raised band, never the condition.
    token, _ = service.create_session('P03')
    supervisor = TestClient(app)
    supervisor.cookies.set('heat_persona', token)
    crew = {w['person_id']: w for w in supervisor.get('/api/case/crew-risk').json()['workers']}
    assert crew['C07']['band'] == 'red' and 'factors' not in crew['C07']


def test_invalid_settings_are_rejected(app):
    http = TestClient(app)
    assert http.put('/api/demo/site', json={'twl': {'civil': {'t1': {'8': 900}}}}).status_code == 422
    assert http.put('/api/demo/site', json={'sensors': {'t1': 'melted'}}).status_code == 422
    assert http.put('/api/demo/site', json={'conditions': {'P03': ['unwell']}}).status_code == 422
    assert http.put('/api/demo/site', json={'twl': {'civil': {'t1': {'14': 120}}}}).status_code == 422


def test_case_time_moves_forward_and_back(app):
    service = app.state.service
    first = service.read_case(None)['case_id']
    view = asyncio.run(demo_site.jump(service, '2025-08-04T09:30:00+04:00'))
    assert view['case_id'] == first and view['clock'].startswith('2025-08-04T09:30')
    view = asyncio.run(demo_site.jump(service, '2025-08-04T08:15:00+04:00'))
    assert view['case_id'] != first and view['clock'].startswith('2025-08-04T08:15')
    with pytest.raises(module.CaseError):
        asyncio.run(demo_site.jump(service, '2025-08-04T11:00:00+04:00'))
