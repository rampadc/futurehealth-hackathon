"""The Planning Agent's what-if tool: real solver request shape, nothing recorded or applied.

The last test is opt-in: RUN_LIVE_APPLICATION=1 with the solver at HEAT_SOLVER_URL (default 127.0.0.1:8765).
"""
import asyncio
import json
import os

import pytest

from heat_safe.application import what_if
from heat_safe.paths import ROOT

REQUEST = json.loads((ROOT / 'demo/solver/operations/examples/crew-rest.solve.request.json').read_text(encoding='utf-8'))
PLAN = {'planning_status': 'planned', 'useful_worker_minutes': 120, 'unmet_worker_minutes': 0, 'blockers': [],
        'intervals': [{'person_id': 'C05', 'kind': 'work'}, {'person_id': 'C06', 'kind': 'recovery'}]}


def view():
    return {'version': 9, 'capture': {'request': REQUEST, 'response': {'crew_rest': PLAN}}}


def run_tool(post, **kwargs):
    return asyncio.run(what_if.make_tool(view, 'http://solver', post)(**kwargs))


def test_changes_a_copy_and_calls_the_solver():
    sent = []

    async def post(url, body):
        sent.append((url, body))
        return 200, {**PLAN, 'useful_worker_minutes': 90, 'intervals': [{'person_id': 'C07', 'kind': 'work'}]}

    result = run_tool(post, unavailable=['C05'], ready=['C09'])
    url, body = sent[0]
    assert url == 'http://solver/v2/crew-rest/solve'
    workers = {w['person_id']: w for w in body['snapshot']['workers']}
    assert workers['C05']['availability'] == 'unavailable'
    assert workers['C09']['readiness']['status'] == 'ready'
    assert workers['C09']['readiness']['source'] == 'synthetic_fixture'
    # The case evidence itself is untouched.
    assert {w['person_id']: w for w in REQUEST['snapshot']['workers']}['C05']['availability'] == 'available'
    assert result['applied'] is False and result['recorded'] is False and result['hypothetical'] is True
    assert result['current_plan']['working'] == ['C05'] and result['what_if_plan']['working'] == ['C07']
    assert result['what_if_plan']['useful_worker_minutes'] == 90


def test_rejects_unknown_workers_and_empty_questions_without_calling_the_solver():
    async def post(url, body):
        raise AssertionError('solver must not be called')

    assert run_tool(post, unavailable=['P02'])['status'] == 'error'
    assert run_tool(post)['status'] == 'error'


def test_reports_a_solver_rejection():
    async def post(url, body):
        return 422, {'error': 'bad'}

    result = run_tool(post, ready=['C09'])
    assert result['status'] == 'error' and 'HTTP 422' in result['message']


@pytest.mark.skipif(os.getenv('RUN_LIVE_APPLICATION') != '1', reason='opt-in live solver check')
def test_live_solver_accepts_hypothetical_changes():
    url = os.getenv('HEAT_SOLVER_URL', 'http://127.0.0.1:8765').rstrip('/')
    tool = what_if.make_tool(view, url)
    without_rana = asyncio.run(tool(unavailable=['C05']))
    assert without_rana['status'] == 'ok', without_rana
    assert 'C05' not in without_rana['what_if_plan']['working']
    with_leila = asyncio.run(tool(unavailable=['C05'], ready=['C09']))
    assert with_leila['status'] == 'ok', with_leila
    assert 'C09' in with_leila['what_if_plan']['working']
