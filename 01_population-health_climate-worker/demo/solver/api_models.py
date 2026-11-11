"""Versioned, closed JSON contract for the fictional allocation service."""

import math
import re
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, field_validator

RFC3339 = re.compile(r'\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})\Z')


def timestamp_string(value: object) -> object:
    if type(value) is not str or not RFC3339.fullmatch(value):
        raise ValueError('must be an RFC 3339 timestamp string with a timezone')
    return value


class ClosedModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class WorkerInput(ClosedModel):
    person_id: Literal['C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09',
                       'C10', 'C11', 'C12'] = Field(description='One member of the frozen recovery pool.')
    readiness: Literal['ready', 'not_ready', 'unknown'] = Field(
        description='Caller supplied immediate suitability for light supervised workshop work; not a medical diagnosis.')
    availability: Literal['available', 'unavailable']


class StaffingDemand(ClosedModel):
    minimum: Literal[1]
    maximum: StrictInt | None = Field(ge=1, description='Null means the useful staffing limit is unknown.')

    @field_validator('minimum', mode='before')
    @classmethod
    def exact_minimum(cls, value: object) -> object:
        if type(value) is float and math.isfinite(value) and value.is_integer():
            value = int(value)
        if type(value) is not int or value != 1:
            raise ValueError('minimum must be the integer 1')
        return value

    @field_validator('maximum', mode='before')
    @classmethod
    def integral_json_number(cls, value: object) -> object:
        if type(value) is float and math.isfinite(value) and value.is_integer():
            return int(value)
        return value


class WorkshopInput(ClosedModel):
    fixed_occupant_ids: list[StrictStr] = Field(min_length=2, max_length=6,
        description='People already in the six-seat workshop, including P07 and P08.')
    staffing_demand: StaffingDemand
    permit_status: Literal['valid', 'unavailable', 'unknown'] = Field(
        description='Caller claim about the frozen workshop permit; the server retains the permit definition.')
    resource_status: Literal['available', 'unavailable', 'unknown']
    supervision_status: Literal['available', 'unavailable', 'unknown'] = Field(
        description='Shared external C01 supervision approved by P02 for workshop_prep and civil_light.')


class IncidentInput(ClosedModel):
    person_id: StrictStr
    location_id: Literal['welfare']
    responder_id: Literal['P06']
    responder_status: Literal['contacted']


class MeasurementInput(ClosedModel):
    sensor_id: Literal['t1']
    zone_id: Literal['civil_exposed']
    twl: Annotated[float, Field(strict=True, gt=0, lt=500, allow_inf_nan=False)]
    measured_at: AwareDatetime
    unit: Literal['W/m²']
    quality: Literal['valid']

    @field_validator('measured_at', mode='before')
    @classmethod
    def measured_at_string(cls, value: object) -> object:
        return timestamp_string(value)


class SolveRequest(ClosedModel):
    schema_version: Literal['1.0']
    request_id: StrictStr = Field(min_length=1, max_length=100)
    profile_id: Literal['sandline_demo_v1'] = Field(
        description='Fixed fictional site profile with server-owned workers, qualifications, capacities and gates.')
    decision_at: AwareDatetime
    workers: list[WorkerInput] = Field(min_length=11, max_length=11,
                                       description='Exactly the original eleven C02–C12 recovery workers.')
    workshop: WorkshopInput
    incidents: list[IncidentInput]
    civil_measurement: MeasurementInput | None

    @field_validator('decision_at', mode='before')
    @classmethod
    def decision_at_string(cls, value: object) -> object:
        return timestamp_string(value)


class CheckRequest(SolveRequest):
    proposed_worker_ids: list[StrictStr]


class IncidentContact(ClosedModel):
    responder_id: Literal['P06']
    status: Literal['contacted']


class Diagnostics(ClosedModel):
    blockers: list[StrictStr]
    free_workshop_places: StrictInt
    useful_staffing_limit: StrictInt | None
    missing_prerequisites: list[StrictStr]
    ineligible_workers: dict[StrictStr, list[StrictStr]]


class AllocationProjection(ClosedModel):
    task_id: Literal['workshop_prep']
    worker_ids: list[StrictStr]
    projected_assignments: dict[StrictStr, list[StrictStr]]
    projected_occupancy: dict[StrictStr, list[StrictStr]]
    projected_task_status: dict[StrictStr, Literal['active', 'held', 'idle']]


class SolverParameters(ClosedModel):
    workers: StrictInt
    seed: StrictInt
    time_limit_seconds: Annotated[float, Field(strict=True, allow_inf_nan=False)]


class SolverInfo(ClosedModel):
    status: Literal['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'MODEL_INVALID']
    optimal: StrictBool
    version: StrictStr
    parameters: SolverParameters


class ResponseBase(ClosedModel):
    schema_version: Literal['1.0']
    request_id: StrictStr
    profile_id: Literal['sandline_demo_v1']
    decision_at: AwareDatetime
    input_fingerprint: StrictStr
    held_task_ids: list[StrictStr]
    unavailable_worker_ids: list[StrictStr]
    responder_status: dict[StrictStr, IncidentContact]
    diagnostics: Diagnostics
    applied: Literal[False]


class SolveResponse(ResponseBase):
    solver: SolverInfo
    allocation: AllocationProjection | None


class CheckResponse(ResponseBase):
    accepted: StrictBool
    violations: list[StrictStr]
    optimality: Literal['not_evaluated']
    allocation: AllocationProjection


class ErrorIssue(ClosedModel):
    location: list[StrictStr | StrictInt]
    message: StrictStr
    type: StrictStr


class ErrorDetail(ClosedModel):
    code: Literal['INVALID_REQUEST', 'INTERNAL_ERROR']
    message: StrictStr
    issues: list[ErrorIssue]


class ErrorResponse(ClosedModel):
    schema_version: Literal['1.0']
    error: ErrorDetail


class HealthResponse(ClosedModel):
    status: Literal['ok']
