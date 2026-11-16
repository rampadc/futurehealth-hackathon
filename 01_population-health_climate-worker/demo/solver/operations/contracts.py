"""Closed, versioned JSON contracts for the synthetic operational solvers."""
from datetime import datetime
import math
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StrictBool, StrictInt, StrictStr, field_validator
from api_models import ClosedModel, StaffingDemand, timestamp_string

WorkerId = Literal['C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12']
ActivityKind = Literal['work','recovery','unavailable']
Availability = Literal['available','unavailable','unknown']
LocationId = Annotated[StrictStr, Field(min_length=1,max_length=100,pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$')]


class OperationalModel(ClosedModel):
    @field_validator('*', mode='before')
    @classmethod
    def date_strings(cls, value, info):
        # JSON Schema integer includes integral JSON numbers such as 6.0.
        if info.field_name in {'capacity','horizon_minutes','initial_recovery_minutes','max_work_minutes','between_work_recovery_minutes'} and type(value) is float and math.isfinite(value) and value.is_integer():
            return int(value)
        names = {'decision_at','measured_at','received_at','issued_at',
                 'acknowledged_at','confirmed_at','recorded_at','reported_at','removed_at',
                 'first_aid_contacted_at','starts_at','ends_at','observed_at','proposed_at',
                 'due_at','horizon_end','recovery_reservation_end','earliest_rest_complete_at','valid_until',
                 'work_not_before'}
        if info.field_name in names and value is not None and not isinstance(value, datetime):
            return timestamp_string(value)
        return value


class Reading(OperationalModel):
    evidence_id: StrictStr
    sensor_id: Literal['t1','t2','t3']
    zone_id: LocationId
    twl: Annotated[float, Field(strict=True, gt=0, lt=500, allow_inf_nan=False)]
    unit: Literal['W/m²']
    quality: Literal['valid','invalid']
    measured_at: AwareDatetime
    received_at: AwareDatetime


class Location(OperationalModel):
    id: LocationId
    label: StrictStr = Field(min_length=1,max_length=200)
    capacity: StrictInt = Field(ge=0,le=10000)
    capabilities: list[Literal['exposed_civil','exposed_electrical','yard','light_work','cooled_recovery','first_aid_support']] = Field(min_length=1)

class ReadinessConfirmation(OperationalModel):
    status: Literal['ready','not_ready']
    task_id: Literal['workshop_prep']
    confirmed_by: StrictStr
    confirmed_at: AwareDatetime
    valid_until: AwareDatetime
    evidence_id: StrictStr = Field(min_length=1,max_length=200)
    basis: StrictStr = Field(min_length=1,max_length=1000)
    source: Literal['synthetic_fixture','human_confirmation']


class Worker(OperationalModel):
    person_id: WorkerId
    readiness: ReadinessConfirmation | None
    availability: Literal['available','unavailable']
    location_id: LocationId


class Instruction(OperationalModel):
    evidence_id: StrictStr
    alert_id: StrictStr
    issued_at: AwareDatetime
    issued_by: Literal['P03']
    acknowledged_at: AwareDatetime | None
    acknowledged_by: Literal['C01'] | None


class Cessation(OperationalModel):
    evidence_id: StrictStr
    confirmed_at: AwareDatetime
    actor_id: Literal['C01']


class Recovery(OperationalModel):
    evidence_id: StrictStr
    recorded_at: AwareDatetime
    actor_id: Literal['C01']
    person_ids: list[WorkerId]
    zone_id: LocationId


class Incident(OperationalModel):
    evidence_id: StrictStr
    person_id: WorkerId
    reported_at: AwareDatetime
    reported_by: Literal['C01']
    removed_at: AwareDatetime | None
    first_aid_contacted_at: AwareDatetime | None
    location_id: LocationId | None
    responder_id: Literal['P06']


class Activity(OperationalModel):
    evidence_id: StrictStr
    person_id: WorkerId
    kind: ActivityKind
    task_id: Literal['civil_heavy','workshop_prep'] | None
    zone_id: LocationId
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    recorded_at: AwareDatetime
    observed: Literal[True]
    source: Literal['synthetic_fixture','human_confirmation']

    @field_validator('observed', mode='before')
    @classmethod
    def real_boolean(cls, value):
        if type(value) is not bool:
            raise ValueError('observed must be a boolean')
        return value


class ZoneWindow(OperationalModel):
    zone_id: LocationId
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    status: Availability
    fixed_occupant_ids: list[StrictStr]


class TaskWindow(OperationalModel):
    task_id: Literal['workshop_prep']
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    permit_status: Literal['valid','unavailable','unknown']
    resource_status: Availability
    supervision_status: Availability


class Workshop(OperationalModel):
    staffing_demand: StaffingDemand
    permit_status: Literal['valid','unavailable','unknown']
    resource_status: Availability
    supervision_status: Availability


class Confirmation(OperationalModel):
    status: Literal['confirmed','not_confirmed','unknown']
    observed_at: AwareDatetime | None
    actor_id: StrictStr | None


class RestartEvidence(OperationalModel):
    proposed_at: AwareDatetime
    task_id: Literal['civil_heavy']
    permit: Confirmation
    personnel: Confirmation
    recovery: Confirmation
    water: Confirmation
    crew_readiness: Confirmation


class Snapshot(OperationalModel):
    readings: list[Reading]
    sensor_status: dict[Literal['t1','t2','t3'], Literal['serviceable','failed','unknown']] = Field(min_length=3,max_length=3)
    held_task_ids: list[Literal['civil_heavy','civil_light','workshop_prep']]
    instruction: Instruction | None
    cessation: Cessation | None
    recovery: Recovery | None
    workers: list[Worker] = Field(min_length=11,max_length=11)
    activity_history: list[Activity]
    workshop: Workshop
    zone_windows: list[ZoneWindow]
    task_windows: list[TaskWindow]
    incidents: list[Incident]


class TimingPolicy(OperationalModel):
    id: StrictStr = Field(min_length=1,max_length=100,pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$')
    initial_recovery_minutes: StrictInt = Field(ge=0,le=120)
    max_work_minutes: StrictInt = Field(ge=1,le=120)
    between_work_recovery_minutes: StrictInt = Field(ge=1,le=120)


class PlanningOptions(OperationalModel):
    policy_id: StrictStr | None = None
    starts_at: AwareDatetime
    horizon_minutes: StrictInt = Field(ge=1,le=120)
    work_not_before: AwareDatetime | None = None


class Request(OperationalModel):
    schema_version: Literal['2.1']
    request_id: StrictStr = Field(min_length=1,max_length=100)
    profile_id: Literal['sandline_operational_demo_v1']
    snapshot_id: StrictStr = Field(min_length=1,max_length=100)
    decision_at: AwareDatetime
    locations: list[Location] = Field(min_length=1,max_length=32)
    task_locations: dict[Literal['civil_heavy','civil_light','workshop_prep'],LocationId] = Field(min_length=3,max_length=3)
    snapshot: Snapshot
    planning: PlanningOptions | None
    restart: RestartEvidence | None
    timing_policy: TimingPolicy | None = None



class Action(OperationalModel):
    code: StrictStr
    owner_id: StrictStr
    status: Literal['required','overdue']
    due_at: AwareDatetime | None
    person_ids: list[StrictStr]
    evidence_ids: list[StrictStr]
    policy_ids: list[StrictStr]
    message: StrictStr


class Control(OperationalModel):
    task_id: StrictStr
    state: Literal['hold_required','held','clearance_blocked','no_new_hold']
    reason_codes: list[StrictStr]
    policy_ids: list[StrictStr]
    evidence_ids: list[StrictStr]


class BaseResponse(OperationalModel):
    schema_version: Literal['2.1']
    request_id: StrictStr
    snapshot_id: StrictStr
    decision_at: AwareDatetime
    profile_id: Literal['sandline_operational_demo_v1']
    policy_versions: list[StrictStr]
    evidence_ids: list[StrictStr]
    input_fingerprint: StrictStr
    applied: Literal[False]


class HeatResponse(BaseResponse):
    controls: list[Control]
    held_task_ids: list[StrictStr]
    clearance_blockers: list[StrictStr]
    actions: list[Action]


class ProtectiveResponse(BaseResponse):
    actions: list[Action]
    excluded_worker_ids: list[StrictStr]
    planning_blockers: list[StrictStr]


class RestartResponse(BaseResponse):
    status: Literal['blocked','ready_for_human_review','not_requested']
    blockers: list[StrictStr]
    required_owner_id: Literal['P02']
    held_task_ids: list[StrictStr]
    actions: list[Action]


class Interval(OperationalModel):
    person_id: WorkerId
    kind: ActivityKind
    task_id: Literal['workshop_prep'] | None
    zone_id: LocationId
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    requires_revalidation: StrictBool


class Occupancy(OperationalModel):
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    zone_id: StrictStr
    count: StrictInt
    capacity: StrictInt


class RestObligation(OperationalModel):
    person_id: WorkerId
    remaining_minutes: StrictInt
    earliest_rest_complete_at: AwareDatetime


class PlanResponse(BaseResponse):
    planning_status: Literal['planned','recovery_only','blocked','missing_policy','missing_information','infeasible','unknown','model_invalid']
    solver_status: Literal['OPTIMAL','FEASIBLE','INFEASIBLE','UNKNOWN','MODEL_INVALID'] | None
    optimal: StrictBool
    policy_id: StrictStr | None
    timing_policy: TimingPolicy | None = None
    policy_source: Literal['supplied','registered','none'] = 'none'
    horizon_end: AwareDatetime | None
    recovery_reservation_end: AwareDatetime | None
    intervals: list[Interval]
    occupancy: list[Occupancy]
    carry_forward_rest: list[RestObligation]
    useful_worker_minutes: StrictInt | None
    unmet_worker_minutes: StrictInt | None
    blockers: list[StrictStr]
    assumptions: list[StrictStr]
    held_task_ids: list[StrictStr]


class CheckRequest(Request):
    proposed_intervals: list[Interval]


class PlanCheckResponse(BaseResponse):
    accepted: StrictBool
    violations: list[StrictStr]
    optimality: Literal['not_evaluated']


class ResponsePlan(BaseResponse):
    heat: HeatResponse
    protective_response: ProtectiveResponse
    crew_rest: PlanResponse
    restart: RestartResponse


class ErrorIssue(OperationalModel):
    location: list[StrictStr | StrictInt]
    message: StrictStr
    type: StrictStr


class ErrorDetail(OperationalModel):
    code: Literal['INVALID_REQUEST','INTERNAL_ERROR']
    message: StrictStr
    issues: list[ErrorIssue]


class ErrorResponse(OperationalModel):
    schema_version: Literal['2.1']
    error: ErrorDetail
