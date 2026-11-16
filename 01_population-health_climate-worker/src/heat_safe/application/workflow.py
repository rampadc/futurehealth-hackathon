"""Deterministic ADK Workflow graph over the live stateless solver endpoints."""
from __future__ import annotations

import json
import copy

import httpx
from google.adk.events import Event, EventActions
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.workflow import FunctionNode, START, Workflow
from google.genai import types


async def run_graph(request: dict, base_url: str) -> tuple[int, dict, list[str]]:
    """Run actual ADK nodes and edges; retain protective results if planning fails."""
    safety_request=copy.deepcopy(request)
    safety_request['planning']=None
    safety_request['snapshot']['activity_history']=[]
    async def project_evidence(ctx):
        return Event(output='evidence projected', actions=EventActions(state_delta={
            'input_fingerprint': json.dumps(request, sort_keys=True),
        }))

    def solver_node(path: str, key: str):
        async def invoke(ctx):
            if key=='plan' and request.get('planning') is None:
                return Event(output='plan:skipped', actions=EventActions(state_delta={
                    'plan_status':204,'plan_response':{'skipped':'No complete observed planning batch'},
                }))
            try:
                async with httpx.AsyncClient(timeout=45) as client:
                    result = await client.post(f'{base_url}/v2/{path}', json=request if key=='plan' else safety_request)
                status, body = result.status_code, result.json()
            except httpx.HTTPError as exc:
                status, body = 0, {'error': f'{type(exc).__name__}: {exc}'}
            return Event(output=f'{key}:{status}', actions=EventActions(state_delta={
                f'{key}_status': status, f'{key}_response': body,
            }))
        return FunctionNode(func=invoke, name=key)

    async def assemble_and_route(ctx):
        state = ctx.state
        statuses = [state.get(f'{key}_status',0) for key in ('heat','protective','plan','restart')]
        if statuses[0] != 200 or statuses[1] != 200 or statuses[3] != 200:
            failed=next((key for key in ('heat','protective','restart') if state.get(f'{key}_status') != 200),None)
            status=state.get(f'{failed}_status',500)
            body=state.get(f'{failed}_response',{'error':'solver call failed'})
            route = 'solver_error'
        else:
            heat, protective, restart = (state[f'{key}_response'] for key in ('heat','protective','restart'))
            meta = {field:heat[field] for field in ('schema_version','request_id','snapshot_id','decision_at','profile_id','policy_versions','evidence_ids','input_fingerprint','applied')}
            if statuses[2] == 200:
                plan = state['plan_response']
            else:
                missing=statuses[2]==204
                plan = {**meta,'planning_status':'blocked' if missing else 'model_invalid','solver_status':None if missing else 'MODEL_INVALID','optimal':False,
                    'policy_id':None,'timing_policy':None,'policy_source':'none','horizon_end':None,
                    'recovery_reservation_end':None,'intervals':[],'occupancy':[],'carry_forward_rest':[],
                    'useful_worker_minutes':None,'unmet_worker_minutes':None,'blockers':['observed_activity_missing' if missing else 'planner_http_error'],
                    'assumptions':[],'held_task_ids':heat['held_task_ids']}
            body = {**meta,'heat':heat,'protective_response':protective,'crew_rest':plan,'restart':restart}
            status = 200
            route = 'planned' if plan['planning_status']=='planned' else 'blocked'
        body = dict(body)
        body['solver_calls'] = [
            {'endpoint': endpoint, 'http_status': state.get(f'{key}_status', 0),
             'response': state.get(f'{key}_response')}
            for key, endpoint in (
                ('heat', '/v2/heat-controls/evaluate'),
                ('protective', '/v2/protective-response/evaluate'),
                ('plan', '/v2/crew-rest/solve'),
                ('restart', '/v2/restart/evaluate'),
            )
        ]
        return Event(output=route, actions=EventActions(route=route, state_delta={
            'solver_http_status':status,'solver_response':body,
        }))

    async def check_plan(ctx):
        proposal = ctx.state['solver_response']['crew_rest']['intervals']
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                result = await client.post(f'{base_url}/v2/crew-rest/check', json={**request,'proposed_intervals':proposal})
            status, check = result.status_code, result.json()
        except httpx.HTTPError as exc:
            status, check = 0, {'error': f'{type(exc).__name__}: {exc}'}
        response = dict(ctx.state['solver_response'])
        response['plan_check'] = check
        response['solver_calls'] = [*response['solver_calls'], {
            'endpoint': '/v2/crew-rest/check', 'http_status': status, 'response': check,
        }]
        return Event(output=f'plan_check:{status}', actions=EventActions(state_delta={
            'solver_response': response, 'plan_check_status': status,
        }))

    async def planned_path(ctx):
        return Event(output='workshop plan checked')

    async def blocked_path(ctx):
        return Event(output='protective hold or planning blocker retained')

    async def error_path(ctx):
        return Event(output='solver error retained for inspection')

    project=FunctionNode(func=project_evidence,name='project_evidence')
    heat=solver_node('heat-controls/evaluate','heat')
    protective=solver_node('protective-response/evaluate','protective')
    plan=solver_node('crew-rest/solve','plan')
    restart=solver_node('restart/evaluate','restart')
    route=FunctionNode(func=assemble_and_route,name='route_decision')
    checked=FunctionNode(func=check_plan,name='check_plan')
    planned=FunctionNode(func=planned_path,name='planned_path')
    blocked=FunctionNode(func=blocked_path,name='blocked_path')
    error=FunctionNode(func=error_path,name='error_path')
    graph=Workflow(name='case_workflow', edges=[
        (START,project,heat,protective,plan,restart,route,{
            'planned':checked,'blocked':blocked,'solver_error':error,
        }),
        (checked,planned),
    ])
    sessions=InMemorySessionService()
    session=await sessions.create_session(app_name='heat_case',user_id='case',state={'request':request})
    runner=Runner(node=graph,app_name='heat_case',session_service=sessions)
    visited=[]
    try:
        async for event in runner.run_async(user_id='case', session_id=session.id,
            new_message=types.Content(role='user',parts=[types.Part(text='Evaluate recorded case evidence')])):
            path=event.node_info.path
            if path and '/' in path:
                visited.append(path.split('/')[-1].split('@')[0])
        result=await sessions.get_session(app_name='heat_case',user_id='case',session_id=session.id)
        return result.state['solver_http_status'], result.state['solver_response'], visited
    finally:
        await runner.close()
