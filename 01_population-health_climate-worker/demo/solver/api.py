"""HTTP JSON entry point for the fictional, non-applying allocation solver."""

import copy
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException

from api_models import (
    AllocationProjection, CheckRequest, CheckResponse, Diagnostics, ErrorDetail, ErrorIssue,
    ErrorResponse, HealthResponse, IncidentContact, SolveRequest, SolveResponse, SolverInfo,
)
from inputs import _source, require, time, validate_problem
from solve import check_proposal, solve_allocation


app = FastAPI(title='Heat-Safe operational API', version='2.1', docs_url=None, redoc_url=None)


class InvalidRequest(Exception):
    def __init__(self, message: str, location: list[str | int] | None = None):
        super().__init__(message)
        self.location = location or ['body']


def build_problem(request: SolveRequest) -> dict:
    """Rebuild the frozen scenario 02 recovery state from caller supplied facts."""
    try:
        reference, base = _source()
    except ValueError as error:
        raise RuntimeError('frozen source validation failed') from error
    state = copy.deepcopy(base)
    pool = sorted(base['occupancy']['shelter_a'])
    worker_ids = [worker.person_id for worker in request.workers]
    require(len(worker_ids) == len(set(worker_ids)) and sorted(worker_ids) == pool,
            'workers must contain each original recovery worker exactly once')
    unavailable = sorted(worker.person_id for worker in request.workers
                         if worker.availability == 'unavailable')
    incident_ids = [incident.person_id for incident in request.incidents]
    require(len(incident_ids) == len(set(incident_ids)) and sorted(incident_ids) == unavailable,
            'incidents must match unavailable workers exactly')

    fixed_ids = request.workshop.fixed_occupant_ids
    baseline_fixed = base['occupancy']['workshop']
    require(len(fixed_ids) == len(set(fixed_ids)) and set(baseline_fixed) <= set(fixed_ids),
            'fixed occupants must uniquely include P07 and P08')
    state['occupancy']['workshop'] = baseline_fixed + [pid for pid in fixed_ids if pid not in baseline_fixed]
    for pid in unavailable:
        for assigned in state['assignments'].values():
            if pid in assigned:
                assigned.remove(pid)
        state['occupancy']['shelter_a'].remove(pid)
        state['occupancy']['welfare'].append(pid)

    decision_at = request.decision_at.isoformat()
    state['clock'] = decision_at
    if request.civil_measurement is not None:
        measurement = request.civil_measurement
        require(time(base['clock']) <= time(measurement.measured_at.isoformat()) <= time(decision_at),
                'replacement measurement must be between source cutoff and decision time')
        state['readings']['civil_exposed'] = {
            'twl': measurement.twl, 'at': measurement.measured_at.isoformat(),
            'sensor_id': measurement.sensor_id,
        }

    readiness = {worker.person_id: worker.readiness == 'ready' for worker in request.workers
                 if worker.readiness != 'unknown'}
    context = {
        'candidate_pool': pool,
        'readiness': readiness,
        'permit': request.workshop.permit_status == 'valid',
        'resources': request.workshop.resource_status == 'available',
        'demand': request.workshop.staffing_demand.maximum,
        'supervision': request.workshop.supervision_status == 'available',
        'unavailable': unavailable,
        'response': {pid: {'responder_id': 'P06', 'status': 'contacted'} for pid in unavailable},
    }
    problem = {
        'case_id': request.request_id, 'decision_at': decision_at, 'state': state,
        'context': context, 'people': copy.deepcopy(reference.people),
        'tasks': copy.deepcopy(reference.tasks), 'zones': copy.deepcopy(reference.zones),
    }
    return validate_problem(problem)


def _base_response(request: SolveRequest, result: dict) -> dict:
    return {
        'schema_version': '1.0', 'request_id': request.request_id,
        'profile_id': request.profile_id, 'decision_at': request.decision_at,
        'input_fingerprint': result['input_fingerprint'],
        'held_task_ids': result['held_tasks'],
        'unavailable_worker_ids': result['unavailable'],
        'responder_status': {pid: IncidentContact(**contact)
                             for pid, contact in result['responder_status'].items()},
        'diagnostics': Diagnostics(**result['diagnostics']),
        'applied': False,
    }


def _allocation(result: dict) -> AllocationProjection:
    state = result['projected_state']
    return AllocationProjection(
        task_id='workshop_prep', worker_ids=result['assignees'],
        projected_assignments=state['assignments'],
        projected_occupancy=state['occupancy'],
        projected_task_status=state['task_status'],
    )


@app.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status='ok')


@app.get('/walkthrough', response_class=FileResponse, include_in_schema=False)
def walkthrough() -> FileResponse:
    return FileResponse(Path(__file__).resolve().parent / 'walkthrough.html', media_type='text/html')


@app.post('/v1/allocations/solve', response_model=SolveResponse,
          responses={422: {'model': ErrorResponse}, 500: {'model': ErrorResponse}})
def solve(request: SolveRequest) -> SolveResponse:
    try:
        problem = build_problem(request)
    except ValueError as error:
        raise InvalidRequest(str(error)) from error
    result = solve_allocation(problem)
    allocation = _allocation(result) if result['projected_state'] is not None else None
    return SolveResponse(
        **_base_response(request, result),
        solver=SolverInfo(status=result['solver_status'], optimal=result['optimal'],
                          version=result['solver_version'], parameters=result['solver_parameters']),
        allocation=allocation,
    )


@app.post('/v1/allocations/check', response_model=CheckResponse,
          responses={422: {'model': ErrorResponse}, 500: {'model': ErrorResponse}})
def check(request: CheckRequest) -> CheckResponse:
    try:
        problem = build_problem(request)
    except ValueError as error:
        raise InvalidRequest(str(error)) from error
    proposed = request.proposed_worker_ids
    if len(proposed) != len(set(proposed)):
        raise InvalidRequest('duplicate proposed worker', ['body', 'proposed_worker_ids'])
    if not set(proposed) <= set(problem['people']):
        raise InvalidRequest('unknown proposed worker', ['body', 'proposed_worker_ids'])
    result = check_proposal(problem, proposed)
    return CheckResponse(
        **_base_response(request, result), accepted=result['accepted'],
        violations=result['violations'], optimality='not_evaluated', allocation=_allocation(result),
    )


def _error(status: int, code: str, message: str, issues: list[ErrorIssue]) -> JSONResponse:
    body = ErrorResponse(schema_version='1.0', error=ErrorDetail(
        code=code, message=message, issues=issues))
    return JSONResponse(status_code=status, content=body.model_dump(mode='json'))


@app.exception_handler(RequestValidationError)
def invalid_json(_request: Request, error: RequestValidationError) -> JSONResponse:
    issues = [ErrorIssue(location=list(item['loc']), message=item['msg'], type=item['type'])
              for item in error.errors()]
    if _request.url.path.startswith('/v2/'):
        from operations.routes import error_response
        return error_response(422, 'INVALID_REQUEST', 'Request validation failed',
                              [issue.model_dump() for issue in issues])
    return _error(422, 'INVALID_REQUEST', 'Request validation failed', issues)


@app.exception_handler(HTTPException)
async def malformed_body(request: Request, error: HTTPException):
    if error.status_code == 400 and request.url.path.startswith('/v2/'):
        from operations.routes import error_response
        return error_response(422, 'INVALID_REQUEST', 'Request body must be valid UTF-8 JSON', [
            {'location':['body'],'message':'Invalid JSON body','type':'json_invalid'}])
    if error.status_code == 400:
        return _error(422, 'INVALID_REQUEST', 'Request body must be valid UTF-8 JSON', [
            ErrorIssue(location=['body'], message='Invalid JSON body', type='json_invalid')])
    return await http_exception_handler(request, error)


@app.exception_handler(InvalidRequest)
def invalid_facts(_request: Request, error: InvalidRequest) -> JSONResponse:
    return _error(422, 'INVALID_REQUEST', str(error), [
        ErrorIssue(location=error.location, message=str(error), type='value_error')])


@app.exception_handler(Exception)
def internal_error(_request: Request, _error_value: Exception) -> JSONResponse:
    if _request.url.path.startswith('/v2/'):
        from operations.routes import error_response
        return error_response(500, 'INTERNAL_ERROR', 'Internal server error', [])
    return _error(500, 'INTERNAL_ERROR', 'Internal server error', [])


from operations.routes import install as install_operational_routes
install_operational_routes(app)
