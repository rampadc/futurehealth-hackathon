import personnel from '../../demo/cross-scenario/personnel.json'
import siteSquads from '../../demo/cross-scenario/site-squads.json'

export const CASE_IDS = [
  'heat_trigger', 'canonical_timed', 'removal_unconfirmed', 'incident_no_substitute',
  'incident_substitute', 'restart_stale', 'restart_missing_check',
  'restart_midday', 'restart_ready',
] as const
export type CaseId = typeof CASE_IDS[number]
export type RestartCaseId = Extract<CaseId, `restart_${string}`>

type At = string
type Nullable<T> = T | null
export interface Action {
  code: string; owner_id: string; status: string; due_at: Nullable<At>
  person_ids: string[]; evidence_ids: string[]; policy_ids: string[]; message: string
}
export interface Interval {
  person_id: string; kind: string; task_id: Nullable<string>; zone_id: string
  starts_at: At; ends_at: At; requires_revalidation: boolean
}
export interface Occupancy {
  starts_at: At; ends_at: At; zone_id: string; count: number; capacity: number
}
export interface ReplayRequest {
  schema_version: '2.1'; request_id: string; profile_id: string; snapshot_id: string; decision_at: At
  locations: Array<{ id: string; label: string; capacity: number; capabilities: string[] }>
  task_locations: Record<string, string>
  snapshot: {
    readings: Array<{ evidence_id: string; sensor_id: string; zone_id: string; twl: number; unit: string; quality: string; measured_at: At; received_at: At }>
    held_task_ids: string[]
    workers: Array<{ person_id: string; availability: string; location_id: string; readiness: Nullable<{ status: string; task_id: string; confirmed_by: string; confirmed_at: At; valid_until: At; evidence_id: string; basis: string; source: string }> }>
    workshop: { staffing_demand: { minimum: number; maximum: number }; permit_status: string; resource_status: string; supervision_status: string }
    zone_windows: Array<{ zone_id: string; starts_at: At; ends_at: At; status: string; fixed_occupant_ids: string[] }>
    incidents: Array<{ evidence_id: string; person_id: string; reported_at: At; reported_by: string; removed_at: Nullable<At>; first_aid_contacted_at: Nullable<At>; location_id: Nullable<string>; responder_id: Nullable<string> }>
    recovery?: Nullable<{ recorded_at: At; person_ids: string[]; zone_id: string }>
  }
  planning: Nullable<{ policy_id: string; starts_at: At; horizon_minutes: number }>
  timing_policy: Nullable<{ id: string; initial_recovery_minutes: number; max_work_minutes: number; between_work_recovery_minutes: number }>
  restart: Nullable<{ proposed_at: At; task_id: string; permit: RestartCheck; personnel: RestartCheck; recovery: RestartCheck; water: RestartCheck; crew_readiness: RestartCheck }>
}
export interface RestartCheck { status: string; observed_at: Nullable<At>; actor_id: Nullable<string> }
interface ResponseMeta {
  schema_version: '2.1'; request_id: string; snapshot_id: string; decision_at: At; profile_id: string
  policy_versions: string[]; evidence_ids: string[]; input_fingerprint: string; applied: false
}
export interface ReplayResponse extends ResponseMeta {
  heat: ResponseMeta & { controls: Array<{ task_id: string; state: string; reason_codes: string[]; policy_ids: string[]; evidence_ids: string[] }>; held_task_ids: string[]; clearance_blockers: string[]; actions: Action[] }
  protective_response: ResponseMeta & { actions: Action[]; excluded_worker_ids: string[]; planning_blockers: string[] }
  crew_rest: ResponseMeta & {
    planning_status: string; solver_status: Nullable<string>; optimal: boolean; policy_id: Nullable<string>
    timing_policy: ReplayRequest['timing_policy']; policy_source: string
    horizon_end: Nullable<At>; recovery_reservation_end: Nullable<At>
    intervals: Interval[]; occupancy: Occupancy[]
    carry_forward_rest: Array<{ person_id: string; remaining_minutes: number; earliest_rest_complete_at: At }>
    useful_worker_minutes: Nullable<number>; unmet_worker_minutes: Nullable<number>
    blockers: string[]; assumptions: string[]; held_task_ids: string[]
  }
  restart: ResponseMeta & { status: string; blockers: string[]; required_owner_id: string; held_task_ids: string[]; actions: Action[] }
}
export interface Provenance { captured_at: At; transport: string; source: string; fixture_count: number; validation: string }
export interface ReplayCapture { case_id: string; request: ReplayRequest; response: ReplayResponse; http_status: number; provenance: Provenance }
export interface ReplayCorpus { schema_version: '2.1'; provenance: Provenance; cases: ReplayCapture[] }

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw Error(`${path} must be an object`)
  return value as Record<string, unknown>
}
const str = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !value) throw Error(`${path} must be a nonempty string`)
  return value
}
const num = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(`${path} must be a finite number`)
  return value
}
const bool = (value: unknown, path: string): void => { if (typeof value !== 'boolean') throw Error(`${path} must be a boolean`) }
const at = (value: unknown, path: string): string => {
  const s = str(value, path)
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s) || Number.isNaN(Date.parse(s))) throw Error(`${path} must be an ISO timestamp with offset`)
  return s
}
const nullable = (value: unknown, path: string, check: (v: unknown, p: string) => unknown): void => { if (value !== null) check(value, path) }
const array = (value: unknown, path: string, check: (v: unknown, p: string) => unknown): void => {
  if (!Array.isArray(value)) throw Error(`${path} must be an array`)
  value.forEach((v, i) => check(v, `${path}[${i}]`))
}
const strings = (v: unknown, p: string): void => array(v, p, str)
const interval = (v: unknown, p: string): void => {
  const x = object(v, p); str(x.person_id, `${p}.person_id`); str(x.kind, `${p}.kind`)
  nullable(x.task_id, `${p}.task_id`, str); str(x.zone_id, `${p}.zone_id`)
  const start = at(x.starts_at, `${p}.starts_at`), end = at(x.ends_at, `${p}.ends_at`)
  if (Date.parse(start) >= Date.parse(end)) throw Error(`${p} interval must end after it starts`)
  bool(x.requires_revalidation, `${p}.requires_revalidation`)
}
const action = (v: unknown, p: string): void => {
  const x = object(v, p)
  for (const key of ['code', 'owner_id', 'status', 'message']) str(x[key], `${p}.${key}`)
  nullable(x.due_at, `${p}.due_at`, at)
  for (const key of ['person_ids', 'evidence_ids', 'policy_ids']) strings(x[key], `${p}.${key}`)
}
const meta = (v: unknown, p: string): Record<string, unknown> => {
  const x = object(v, p)
  if (x.schema_version !== '2.1') throw Error(`${p}.schema_version must be 2.1`)
  for (const key of ['request_id', 'snapshot_id', 'profile_id', 'input_fingerprint']) str(x[key], `${p}.${key}`)
  at(x.decision_at, `${p}.decision_at`); strings(x.policy_versions, `${p}.policy_versions`); strings(x.evidence_ids, `${p}.evidence_ids`)
  if (x.applied !== false) throw Error(`${p}.applied must be false`)
  return x
}
const restartCheck = (v: unknown, p: string): void => {
  const x = object(v, p); str(x.status, `${p}.status`)
  nullable(x.observed_at, `${p}.observed_at`, at); nullable(x.actor_id, `${p}.actor_id`, str)
}
const timingPolicy = (v: unknown, p: string): void => {
  const x = object(v, p); str(x.id, `${p}.id`)
  for (const key of ['initial_recovery_minutes', 'max_work_minutes', 'between_work_recovery_minutes']) num(x[key], `${p}.${key}`)
}

/** Validate the fields used by the replay UI and return the original captured objects. */
export function parseCapture(input: unknown): ReplayCorpus {
  const root = object(input, 'capture')
  if (root.schema_version !== '2.1') throw Error('capture.schema_version must be 2.1')
  const provenance = object(root.provenance, 'capture.provenance')
  at(provenance.captured_at, 'provenance.captured_at')
  for (const key of ['transport', 'source', 'validation']) str(provenance[key], `provenance.${key}`)
  num(provenance.fixture_count, 'provenance.fixture_count')
  const cases = root.cases
  if (!Array.isArray(cases)) throw Error('capture.cases must be an array')
  const seen = new Set<string>()
  for (const raw of cases) {
    const c = object(raw, 'case')
    const id = str(c.case_id, 'case.case_id')
    if (seen.has(id)) throw Error(`duplicate case ${id}`)
    seen.add(id)
    if (!CASE_IDS.includes(id as CaseId)) continue
    if (num(c.http_status, `${id}.http_status`) !== 200) throw Error(`${id}.http_status must be 200`)
    const q = object(c.request, `${id}.request`), r = meta(c.response, `${id}.response`)
    if (q.schema_version !== '2.1') throw Error(`${id}.request.schema_version must be 2.1`)
    for (const key of ['request_id', 'profile_id', 'snapshot_id']) str(q[key], `${id}.request.${key}`)
    at(q.decision_at, `${id}.request.decision_at`)
    if (q.request_id !== id || r.request_id !== id || q.snapshot_id !== r.snapshot_id || q.decision_at !== r.decision_at || q.profile_id !== r.profile_id) throw Error(`${id} request/response identity mismatch`)
    array(q.locations, `${id}.request.locations`, (v, p) => { const x = object(v, p); str(x.id, `${p}.id`); str(x.label, `${p}.label`); num(x.capacity, `${p}.capacity`); strings(x.capabilities, `${p}.capabilities`) })
    const taskLocations = object(q.task_locations, `${id}.request.task_locations`)
    Object.entries(taskLocations).forEach(([key, value]) => str(value, `${id}.request.task_locations.${key}`))
    const s = object(q.snapshot, `${id}.request.snapshot`)
    array(s.readings, `${id}.request.snapshot.readings`, (v, p) => { const x = object(v, p); for (const key of ['evidence_id', 'sensor_id', 'zone_id', 'unit', 'quality']) str(x[key], `${p}.${key}`); num(x.twl, `${p}.twl`); at(x.measured_at, `${p}.measured_at`); at(x.received_at, `${p}.received_at`) })
    strings(s.held_task_ids, `${id}.request.snapshot.held_task_ids`)
    array(s.workers, `${id}.request.snapshot.workers`, (v, p) => { const x = object(v, p); for (const key of ['person_id', 'availability', 'location_id']) str(x[key], `${p}.${key}`); nullable(x.readiness, `${p}.readiness`, (value, path) => { const rd = object(value, path); for (const key of ['status', 'task_id', 'confirmed_by', 'evidence_id', 'basis', 'source']) str(rd[key], `${path}.${key}`); at(rd.confirmed_at, `${path}.confirmed_at`); at(rd.valid_until, `${path}.valid_until`) }) })
    const workshop = object(s.workshop, `${id}.request.snapshot.workshop`)
    const staffing = object(workshop.staffing_demand, `${id}.request.snapshot.workshop.staffing_demand`)
    num(staffing.minimum, `${id}.request.snapshot.workshop.staffing_demand.minimum`)
    num(staffing.maximum, `${id}.request.snapshot.workshop.staffing_demand.maximum`)
    for (const key of ['permit_status', 'resource_status', 'supervision_status']) str(workshop[key], `${id}.request.snapshot.workshop.${key}`)
    array(s.zone_windows, `${id}.request.snapshot.zone_windows`, (v, p) => { const x = object(v, p); str(x.zone_id, `${p}.zone_id`); const start = at(x.starts_at, `${p}.starts_at`), end = at(x.ends_at, `${p}.ends_at`); if (Date.parse(start) >= Date.parse(end)) throw Error(`${p} interval must end after it starts`); str(x.status, `${p}.status`); strings(x.fixed_occupant_ids, `${p}.fixed_occupant_ids`) })
    array(s.incidents, `${id}.request.snapshot.incidents`, (v, p) => { const x = object(v, p); for (const key of ['evidence_id', 'person_id', 'reported_by']) str(x[key], `${p}.${key}`); at(x.reported_at, `${p}.reported_at`); for (const key of ['removed_at', 'first_aid_contacted_at']) nullable(x[key], `${p}.${key}`, at); for (const key of ['location_id', 'responder_id']) nullable(x[key], `${p}.${key}`, str) })
    nullable(q.planning, `${id}.request.planning`, (v, p) => { const x = object(v, p); str(x.policy_id, `${p}.policy_id`); at(x.starts_at, `${p}.starts_at`); num(x.horizon_minutes, `${p}.horizon_minutes`) })
    nullable(q.timing_policy, `${id}.request.timing_policy`, timingPolicy)
    nullable(q.restart, `${id}.request.restart`, (v, p) => { const x = object(v, p); at(x.proposed_at, `${p}.proposed_at`); str(x.task_id, `${p}.task_id`); for (const key of ['permit', 'personnel', 'recovery', 'water', 'crew_readiness']) restartCheck(x[key], `${p}.${key}`) })
    const heat = meta(r.heat, `${id}.response.heat`)
    array(heat.controls, `${id}.response.heat.controls`, (v, p) => { const x = object(v, p); str(x.task_id, `${p}.task_id`); str(x.state, `${p}.state`); for (const key of ['reason_codes', 'policy_ids', 'evidence_ids']) strings(x[key], `${p}.${key}`) })
    for (const key of ['held_task_ids', 'clearance_blockers']) strings(heat[key], `${id}.response.heat.${key}`)
    array(heat.actions, `${id}.response.heat.actions`, action)
    const protective = meta(r.protective_response, `${id}.response.protective_response`)
    array(protective.actions, `${id}.response.protective_response.actions`, action)
    for (const key of ['excluded_worker_ids', 'planning_blockers']) strings(protective[key], `${id}.response.protective_response.${key}`)
    const crew = meta(r.crew_rest, `${id}.response.crew_rest`)
    str(crew.planning_status, `${id}.response.crew_rest.planning_status`); nullable(crew.solver_status, 'crew.solver_status', str); bool(crew.optimal, 'crew.optimal'); nullable(crew.policy_id, 'crew.policy_id', str)
    nullable(crew.timing_policy, 'crew.timing_policy', timingPolicy); str(crew.policy_source, 'crew.policy_source')
    nullable(crew.horizon_end, 'crew.horizon_end', at); nullable(crew.recovery_reservation_end, 'crew.recovery_reservation_end', at)
    array(crew.intervals, 'crew.intervals', interval)
    array(crew.occupancy, 'crew.occupancy', (v, p) => { const x = object(v, p); const start = at(x.starts_at, `${p}.starts_at`), end = at(x.ends_at, `${p}.ends_at`); if (Date.parse(start) >= Date.parse(end)) throw Error(`${p} interval must end after it starts`); str(x.zone_id, `${p}.zone_id`); num(x.count, `${p}.count`); num(x.capacity, `${p}.capacity`) })
    array(crew.carry_forward_rest, 'crew.carry_forward_rest', (v, p) => { const x = object(v, p); str(x.person_id, `${p}.person_id`); num(x.remaining_minutes, `${p}.remaining_minutes`); at(x.earliest_rest_complete_at, `${p}.earliest_rest_complete_at`) })
    nullable(crew.useful_worker_minutes, 'crew.useful_worker_minutes', num); nullable(crew.unmet_worker_minutes, 'crew.unmet_worker_minutes', num)
    for (const key of ['blockers', 'assumptions', 'held_task_ids']) strings(crew[key], `crew.${key}`)
    const restart = meta(r.restart, `${id}.response.restart`)
    str(restart.status, 'restart.status'); str(restart.required_owner_id, 'restart.required_owner_id')
    strings(restart.blockers, 'restart.blockers'); strings(restart.held_task_ids, 'restart.held_task_ids'); array(restart.actions, 'restart.actions', action)
  }
  for (const id of CASE_IDS) if (!seen.has(id)) throw Error(`missing case ${id}`)
  return { schema_version: '2.1', provenance: provenance as unknown as Provenance, cases: cases.filter((c) => CASE_IDS.includes(c.case_id as CaseId)).map((c) => ({ ...c, provenance })) as ReplayCapture[] }
}

let captured: ReplayCorpus | undefined
export async function loadCase(caseId: CaseId, options: { delayMs?: number; fail?: boolean } = {}): Promise<ReplayCapture> {
  await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 150))
  if (options.fail) throw Error('Replay capture unavailable')
  captured ??= parseCapture((await import('../../demo/solver/operational-results.json')).default)
  const found = captured.cases.find((c) => c.case_id === caseId)
  if (!found) throw Error(`Unknown replay case: ${caseId}`)
  return structuredClone(found)
}
export function resolveCase(stage: number, removal: boolean, firstaid: boolean, leila: boolean, restartCase: RestartCaseId): CaseId {
  if (stage < 2) return 'canonical_timed'
  if (stage === 2) return removal && firstaid ? (leila ? 'incident_substitute' : 'incident_no_substitute') : 'removal_unconfirmed'
  return restartCase
}
const names: Record<string, string> = {
  civil_exposed: 'Civil trench preparation', electrical_exposed: 'Electrical preparation laydown', yard: 'Receiving yard',
  workshop: 'Cooled preparation workshop', shelter_a: 'Cooled recovery shelter A', shelter_b: 'Cooled recovery shelter B', welfare: 'Welfare and first aid',
  civil_heavy: 'Civil heavy work', civil_light: 'Civil light work', workshop_prep: 'Workshop preparation',
}
const squadNames: Record<string, string> = Object.fromEntries(siteSquads.flatMap((squad) => squad.workers.map((worker) => [worker.id, worker.name])))
export function nameOf(id: string): string { return personnel.find((person) => person.id === id)?.name ?? squadNames[id] ?? names[id] ?? id }
