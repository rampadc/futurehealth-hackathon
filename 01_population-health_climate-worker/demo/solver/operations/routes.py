"""HTTP adapters and deterministic composition; no agents or operational side effects."""
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .common import effective_timing_policy, metadata, validate_request
from .contracts import (CheckRequest, ErrorDetail, ErrorIssue, ErrorResponse, HeatResponse,
                        PlanCheckResponse, PlanResponse, ProtectiveResponse, Request,
                        ResponsePlan, RestartResponse)
from .decisions import evaluate_heat, evaluate_protective, evaluate_restart
from .planning import check_plan, solve_plan

router = APIRouter(prefix='/v2', tags=['operational solvers'])
RESPONSES = {422:{'model':ErrorResponse},500:{'model':ErrorResponse}}


class InvalidOperationalRequest(Exception):
    pass


def error_response(status, code, message, issues=None):
    converted = [ErrorIssue(**issue) if isinstance(issue,dict) else issue for issue in (issues or [])]
    body = ErrorResponse(schema_version='2.1',error=ErrorDetail(code=code,message=message,issues=converted))
    return JSONResponse(status_code=status,content=body.model_dump(mode='json'))


def _checked(req):
    try:
        return validate_request(req)
    except ValueError as error:
        raise InvalidOperationalRequest(str(error)) from error


@router.post('/heat-controls/evaluate',response_model=HeatResponse,responses=RESPONSES)
def heat_controls(req: Request):
    return evaluate_heat(_checked(req))


@router.post('/protective-response/evaluate',response_model=ProtectiveResponse,responses=RESPONSES)
def protective_response(req: Request):
    return evaluate_protective(_checked(req))


@router.post('/crew-rest/solve',response_model=PlanResponse,responses=RESPONSES)
def crew_rest(req: Request):
    return solve_plan(_checked(req))


@router.post('/crew-rest/check',response_model=PlanCheckResponse,responses=RESPONSES)
def crew_rest_check(req: CheckRequest):
    return check_plan(_checked(req))


@router.post('/restart/evaluate',response_model=RestartResponse,responses=RESPONSES)
def restart(req: Request):
    return evaluate_restart(_checked(req))


def solve_response_plan(req: Request):
    validate_request(req)
    heat = evaluate_heat(req)
    protective = evaluate_protective(req,heat)
    restart_result = evaluate_restart(req,heat)
    try:
        plan = solve_plan(req)
    except Exception:
        # Preserve independently computed protective decisions if planning fails.
        logging.getLogger(__name__).exception('Operational planning component failed')
        policy = effective_timing_policy(req)
        plan = PlanResponse(**metadata(req),planning_status='model_invalid',solver_status='MODEL_INVALID',
            optimal=False,policy_id=policy.id if policy else None,timing_policy=policy,
            policy_source=('supplied' if req.timing_policy is not None else 'registered') if policy else 'none',
            horizon_end=None,recovery_reservation_end=None,intervals=[],occupancy=[],
            carry_forward_rest=[],useful_worker_minutes=None,unmet_worker_minutes=None,
            blockers=['planner_internal_error'],assumptions=[],held_task_ids=heat.held_task_ids)
    return ResponsePlan(**metadata(req),heat=heat,protective_response=protective,
                        crew_rest=plan,restart=restart_result)


@router.post('/response-plans/solve',response_model=ResponsePlan,responses=RESPONSES)
def response_plans(req: Request):
    return solve_response_plan(_checked(req))


def install(app):
    app.include_router(router)

    @app.exception_handler(InvalidOperationalRequest)
    def invalid_request(_request,error):
        return error_response(422,'INVALID_REQUEST',str(error),[
            {'location':['body'],'message':str(error),'type':'value_error'}])
