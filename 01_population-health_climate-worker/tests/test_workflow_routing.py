"""A skipped planner must not mask a failed safety endpoint."""
import asyncio
import copy

import httpx

from heat_safe.application import workflow
from heat_safe.application.service import SEED


def test_restart_failure_wins_over_skipped_plan(monkeypatch):
    def respond(request):
        if request.url.path.endswith('/restart/evaluate'):
            return httpx.Response(503,json={'error':'restart unavailable'})
        return httpx.Response(200,json={'ok':True})

    original=httpx.AsyncClient
    transport=httpx.MockTransport(respond)
    monkeypatch.setattr(workflow.httpx,'AsyncClient',lambda *args,**kwargs: original(*args,transport=transport,**kwargs))
    status,response,_=asyncio.run(workflow.run_graph(copy.deepcopy(SEED),'http://solver'))
    assert status==503
    assert response['error']=='restart unavailable'
    assert response['solver_calls'][2]['http_status']==204
    assert response['solver_calls'][3]['http_status']==503
