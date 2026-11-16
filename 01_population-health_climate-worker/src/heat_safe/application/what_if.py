"""Hypothetical crew plans for the Planning Agent: the real solver on a copy of the case evidence.

The agent can ask "what if C06 were unavailable?" or "what if C09 were confirmed ready?". The copy
is changed, sent to the solver's stateless `/v2/crew-rest/solve`, and the answer is returned as a
draft. Nothing is written to the case: a hypothetical readiness is never a recorded confirmation,
and the proposal is never applied.
"""
from __future__ import annotations

import copy
from datetime import datetime, timedelta
from typing import Awaitable, Callable

import httpx

Post = Callable[[str, dict], Awaitable[tuple[int, dict]]]
WORKERS = tuple(f'C{i:02}' for i in range(2, 13))


async def http_post(url: str, body: dict) -> tuple[int, dict]:
    async with httpx.AsyncClient(timeout=45) as client:
        result = await client.post(url, json=body)
    return result.status_code, result.json()


def hypothetical_request(request: dict, unavailable: list[str], ready: list[str]) -> dict:
    """The case's latest solver request with the hypothetical changes applied to a copy."""
    changed = copy.deepcopy(request)
    decided = datetime.fromisoformat(changed['decision_at'])
    for worker in changed['snapshot']['workers']:
        pid = worker['person_id']
        if pid in unavailable:
            worker['availability'] = 'unavailable'
        if pid in ready:
            worker['readiness'] = {
                'status': 'ready', 'task_id': 'workshop_prep', 'confirmed_by': 'C01',
                'confirmed_at': decided.isoformat(), 'valid_until': (decided + timedelta(minutes=60)).isoformat(),
                'evidence_id': f'what-if-{pid}', 'basis': 'Hypothetical what-if; not a recorded confirmation',
                'source': 'synthetic_fixture',
            }
    return changed


def summarise(plan: dict) -> dict:
    working = sorted({i['person_id'] for i in plan.get('intervals', []) if i.get('kind') == 'work'})
    return {key: plan.get(key) for key in ('planning_status', 'useful_worker_minutes', 'unmet_worker_minutes', 'blockers')} | {'working': working}


def make_tool(read_view: Callable[[], dict], solver_url: str, post: Post = http_post):
    async def what_if_crew_plan(unavailable: list[str] | None = None, ready: list[str] | None = None) -> dict:
        """Ask the solver for a hypothetical crew plan. Nothing is recorded or applied.

        Use this for "what if" questions about the workshop plan: a worker becoming unavailable, or
        a worker's readiness being confirmed. The result is a draft to discuss, never a decision;
        only people record readiness, availability and assignments in the workspace.

        Args:
            unavailable: Worker ids (C02 to C12) to treat as unavailable.
            ready: Worker ids (C02 to C12) to treat as confirmed ready for workshop preparation.
        """
        unavailable, ready = list(unavailable or []), list(ready or [])
        unknown = sorted(set(unavailable + ready) - set(WORKERS))
        if unknown:
            return {'status': 'error', 'message': f'Unknown worker ids: {", ".join(unknown)}. Use C02 to C12.'}
        if not unavailable and not ready:
            return {'status': 'error', 'message': 'Name at least one worker to change.'}
        view = read_view()
        capture = (view or {}).get('capture') or {}
        assessment = (view or {}).get('plan_assessment')
        if assessment is not None:
            if assessment.get('status') not in {'proposed', 'approved'}:
                return {'status': 'error', 'message': 'Confirm current observed activity before calculating a new what-if plan.'}
            capture = assessment
        request = capture.get('request')
        if not request:
            return {'status': 'error', 'message': 'There is no calculated case evidence to change yet.'}
        current = (capture.get('response') or {}).get('crew_rest') or {}
        try:
            status, plan = await post(f'{solver_url}/v2/crew-rest/solve', hypothetical_request(request, unavailable, ready))
        except httpx.HTTPError as error:
            return {'status': 'error', 'message': f'The solver is unavailable ({type(error).__name__}).'}
        if status != 200:
            return {'status': 'error', 'message': f'The solver rejected the hypothetical request (HTTP {status}).', 'detail': plan}
        return {'status': 'ok', 'hypothetical': True, 'applied': False, 'recorded': False,
                'changes': {'unavailable': unavailable, 'ready': ready},
                'case_version': view.get('version'), 'decision_at': request.get('decision_at'),
                'current_plan': summarise(current), 'what_if_plan': summarise(plan),
                'note': 'Draft from the solver. Readiness and availability here are hypothetical; '
                        'people must record them before any assignment.'}
    return what_if_crew_plan


def tools_for(actor: str, read_view: Callable[[], dict], solver_url: str) -> list:
    """Workers only see their own plan, so a crew-wide what-if is for supervisors and responders."""
    from heat_safe.application.platform_api import WORKERS
    return [] if actor in WORKERS or actor in {'P01', 'P10'} else [make_tool(read_view, solver_url)]
