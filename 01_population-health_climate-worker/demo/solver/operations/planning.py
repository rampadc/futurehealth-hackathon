"""Minute-grid, advisory work/rest planning for the fictional operational demo."""

from datetime import timedelta
from math import ceil
from time import monotonic

from ortools.sat.python import cp_model

from .common import (catalog, effective_timing_policy, location_map, metadata,
                     planning_locations, ready_for_work, recovery_locations,
                     task_location, validate_request)
from .contracts import CheckRequest, Interval, Occupancy, PlanCheckResponse, PlanResponse, RestObligation
from .decisions import evaluate_heat, evaluate_protective
from .timing import TimingRules, lexicographic_weights

CREW = tuple(f'C{i:02d}' for i in range(2, 13))


def _at(start, minute):
    return start + timedelta(minutes=minute)


def _window_at(windows, zone_or_task, at, key):
    return next((w for w in windows if getattr(w, key) == zone_or_task and
                 w.starts_at <= at and at + timedelta(minutes=1) <= w.ends_at), None)


def _qualified(pid):
    data = catalog()
    return set(data['tasks']['workshop_prep']['required_qualifications']) <= set(data['people'][pid]['qualifications'])


def _history_state(req, pid, rules):
    """State before slot zero from observed contiguous work or cooled recovery."""
    history = sorted((a for a in req.snapshot.activity_history if a.person_id == pid and a.ends_at <= req.decision_at),
                     key=lambda a: (a.ends_at, a.starts_at))
    if not history:
        return 0
    latest = history[-1]
    if latest.ends_at != req.decision_at:
        # A gap is not evidence of completed cooled recovery.
        return 0
    workshop = task_location(req, 'workshop_prep')
    recovery = set(recovery_locations(req))
    last_work = next((i for i in range(len(history)-1,-1,-1)
                      if history[i].kind == 'work' and history[i].zone_id == workshop),None)
    if last_work is not None and last_work == len(history)-1:
        boundary = req.decision_at
        for activity in reversed(history):
            if activity.ends_at != boundary or activity.kind != 'work' or activity.zone_id != workshop:
                break
            boundary = activity.starts_at
        minutes = ceil((req.decision_at - boundary).total_seconds() / 60)
        return rules.work_state(minutes)
    if last_work is not None:
        # A noncooled interruption cannot erase outstanding post-work recovery.
        # Once enough contiguous cooled minutes have been observed, unrelated
        # later activity does not recreate the old debt.
        cooled = timedelta(0)
        completed = False
        for activity in history[last_work+1:]:
            if activity.kind == 'recovery' and activity.zone_id in recovery:
                if not completed:
                    cooled += activity.ends_at-activity.starts_at
                    completed = cooled >= timedelta(minutes=rules.rest)
            elif not completed:
                cooled = timedelta(0)
        return rules.recovered if completed else rules.post_work_state(int(cooled // timedelta(minutes=1)))
    if latest.kind == 'recovery' and latest.zone_id in recovery:
        boundary = req.decision_at
        for activity in reversed(history):
            if activity.ends_at != boundary:
                break
            if activity.kind == 'recovery' and activity.zone_id in recovery:
                boundary = activity.starts_at
            else:
                break
        minutes = int((req.decision_at-boundary)//timedelta(minutes=1))
        return min(rules.initial, minutes)
    return 0


def _context(req):
    validate_request(req)
    planning = req.planning
    policy = effective_timing_policy(req)
    rules = TimingRules.from_policy(policy) if policy else None
    heat = evaluate_heat(req)
    protective = evaluate_protective(req, heat)
    if planning is None or policy is None:
        return {'status': 'missing_policy', 'blockers': ['planning_policy_missing'], 'heat': heat,
                'protective': protective, 'planning': planning, 'policy': policy, 'rules': rules}
    if protective.planning_blockers:
        return {'status': 'blocked', 'blockers': list(protective.planning_blockers), 'heat': heat,
                'protective': protective, 'planning': planning, 'policy': policy, 'rules': rules}
    if req.snapshot.workshop.staffing_demand.maximum is None:
        return {'status': 'missing_information', 'blockers': ['useful_staffing_limit_unknown'],
                'heat': heat, 'protective': protective, 'planning': planning,
                'policy': policy, 'rules': rules}
    start = planning.starts_at
    if start < req.decision_at:
        raise ValueError('planning starts_at precedes decision_at')
    horizon = planning.horizon_minutes
    work_not_before = planning.work_not_before or start
    zones = planning_locations(req)
    recovery = recovery_locations(req)
    workshop = task_location(req, 'workshop_prep')
    capacity = {z: item.capacity for z, item in location_map(req).items() if z in zones}
    workers = {w.person_id: w for w in req.snapshot.workers}
    excluded = set(protective.excluded_worker_ids)
    if work_not_before > start:
        unknown = sorted(pid for pid in CREW if pid not in excluded and
                         workers[pid].location_id not in recovery)
        if unknown:
            return {'status': 'blocked',
                    'blockers': [f'review_lead_in_location_not_cooled:{pid}' for pid in unknown],
                    'heat': heat, 'protective': protective, 'planning': planning,
                    'policy': policy, 'rules': rules}
    incident_locations = {i.person_id: i.location_id for i in req.snapshot.incidents}
    recorded = {a.person_id for a in req.snapshot.activity_history}
    absent = sorted(set(CREW) - excluded - recorded)
    if absent:
        return {'status': 'missing_information',
                'blockers': [f'activity_history_missing:{pid}' for pid in absent],
                'heat': heat, 'protective': protective, 'planning': planning,
                'policy': policy, 'rules': rules}
    zone = {z: [] for z in zones}
    task = []
    missing = []
    for t in range(horizon):
        at = _at(start,t)
        for z in zones:
            w = _window_at(req.snapshot.zone_windows, z, at, 'zone_id')
            zone[z].append(w)
            if w is None:
                missing.append(f'zone_window_missing:{z}:{t}')
        w = _window_at(req.snapshot.task_windows, 'workshop_prep', at, 'task_id')
        task.append(w)
        if w is None:
            missing.append(f'task_window_missing:workshop_prep:{t}')
    if missing:
        return {'status': 'missing_information', 'blockers': sorted(set(missing)), 'heat': heat,
                'protective': protective, 'planning': planning, 'policy': policy, 'rules': rules}
    for t in range(horizon, horizon + max(rules.initial, rules.rest)):
        at = _at(start,t)
        windows = {z:_window_at(req.snapshot.zone_windows,z,at,'zone_id') for z in zones}
        if any(w is None for w in windows.values()):
            break
        available_places = 0
        for z in recovery:
            if windows[z].status == 'available':
                occupied = len(windows[z].fixed_occupant_ids)
                occupied += sum(pid in excluded and workers[pid].location_id == z
                                for pid in CREW)
                available_places += max(0,capacity[z]-occupied)
        if available_places < len(CREW)-len(excluded):
            break
        excluded_locations = [incident_locations.get(pid) or workers[pid].location_id for pid in excluded]
        if any(z not in zones or windows[z].status != 'available' for z in excluded_locations):
            break
        for z in zones:
            zone[z].append(windows[z])
    length = len(zone[workshop])
    fixed = {z: [set(w.fixed_occupant_ids) for w in zone[z]] for z in zones}
    for t in range(length):
        for z in zones:
            if fixed[z][t] & set(CREW):
                raise ValueError('zone fixed occupants must exclude affected workers')
    gates = []
    for t in range(horizon):
        at = _at(start, t)
        w = task[t]
        enabled = (at >= work_not_before and zone[workshop][t].status == 'available' and
                   w.permit_status == 'valid' and w.resource_status == 'available' and
                   w.supervision_status == 'available' and
                   req.snapshot.workshop.permit_status == 'valid' and
                   req.snapshot.workshop.resource_status == 'available' and
                   req.snapshot.workshop.supervision_status == 'available' and
                   'workshop_prep' not in heat.held_task_ids)
        gates.append(enabled)
    return {'status': None, 'blockers': [], 'heat': heat, 'protective': protective,
            'planning': planning, 'policy': policy, 'rules': rules,
            'start': start, 'horizon': horizon, 'length': length,
            'zone': zone, 'task': task, 'fixed': fixed, 'gates': gates, 'workers': workers,
            'excluded': excluded, 'zones': zones, 'recovery': recovery, 'workshop': workshop,
            'capacity': capacity, 'incident_locations': incident_locations,
            'work_not_before': work_not_before}


def _response(req, ctx, **extra):
    planning = ctx.get('planning')
    policy = ctx.get('policy')
    rules = ctx.get('rules')
    start = planning.starts_at if planning else None
    horizon = planning.horizon_minutes if planning else 0
    fields = dict(metadata(req), planning_status=ctx['status'], solver_status=None, optimal=False,
                  policy_id=policy.id if policy else None,
                  timing_policy=policy,
                  policy_source=('supplied' if policy and req.timing_policy is not None else
                                 'registered' if policy else 'none'),
                  horizon_end=_at(start, horizon) if start else None,
                  recovery_reservation_end=_at(start, horizon) if start else None,
                  intervals=[], occupancy=[], carry_forward_rest=[], useful_worker_minutes=None,
                  unmet_worker_minutes=None, blockers=ctx['blockers'],
                  assumptions=(['fictional_demo_assumption',
                    'Location changes are instantaneous at minute boundaries.',
                    'Readiness is a separate caller assertion and is never inferred from elapsed recovery.',
                    'Future work requires rechecking worker suitability and task prerequisites.',
                    f'Mandatory recovery beyond the requested horizon is reserved only for owed minutes, up to {max(rules.initial, rules.rest)} additional minutes.',
                    'The timing policy applies only to the eleven affected workers and light workshop work.',
                    'P07/P08 remain fixed workshop occupants; C01 supervises externally under the supplied demo arrangement.',
                    'C01 and C13/C14 retain their existing commitments; this is not full-site scheduling.']
                    if planning and rules else []),
                  held_task_ids=ctx['heat'].held_task_ids)
    fields.update(extra)
    return PlanResponse(**fields)


def _minute_checker(req, ctx, intervals):
    """Independent hard-feasibility check; returns stable violation codes."""
    if ctx['status'] is not None:
        return list(ctx['blockers'])
    start, horizon, length = ctx['start'], ctx['horizon'], ctx['length']
    rules = ctx['rules']
    zones, recovery, workshop = ctx['zones'], ctx['recovery'], ctx['workshop']
    maximum_length = horizon + max(rules.initial, rules.rest)
    grid = {pid: [None] * maximum_length for pid in CREW}
    violations = set()
    for i, interval in enumerate(intervals):
        pid = interval.person_id
        if pid not in grid:
            violations.add(f'unknown_worker:{pid}')
            continue
        a = (interval.starts_at - start).total_seconds() / 60
        b = (interval.ends_at - start).total_seconds() / 60
        if (a != int(a) or b != int(b) or a < 0 or b > maximum_length or a >= b):
            violations.add(f'interval_grid:{pid}:{i}')
            continue
        if not interval.requires_revalidation:
            violations.add(f'revalidation_required:{pid}:{i}')
        if interval.kind == 'work' and (interval.task_id != 'workshop_prep' or interval.zone_id != workshop):
            violations.add(f'work_task_zone:{pid}:{i}')
        if interval.kind == 'recovery' and (interval.task_id is not None or interval.zone_id not in recovery):
            violations.add(f'recovery_zone:{pid}:{i}')
        if interval.kind == 'unavailable' and interval.task_id is not None:
            violations.add(f'unavailable_task:{pid}:{i}')
        if interval.zone_id not in zones:
            violations.add(f'unknown_plan_location:{pid}:{i}')
            continue
        for t in range(int(a), int(b)):
            if grid[pid][t] is not None:
                violations.add(f'overlap:{pid}:{t}')
            grid[pid][t] = (interval.kind, interval.zone_id)
    for pid in CREW:
        if any(v is None for v in grid[pid][:horizon]):
            violations.add(f'coverage:{pid}')
    if violations:
        return sorted(violations)
    for pid in ctx['excluded']:
        for t in range(horizon):
            zone = grid[pid][t][1]
            if ctx['zone'][zone][t].status != 'available':
                violations.add(f'excluded_zone_unavailable:{pid}:{zone}:{t}')
    if violations:
        return sorted(violations)
    max_remaining = 0
    for pid in CREW:
        if pid in ctx['excluded']:
            continue
        state = _history_state(req, pid, rules)
        for t in range(horizon):
            next_state = rules.next_state(state, grid[pid][t][0] == 'work')
            if next_state is None:
                violations.add(f'work_rest_policy:{pid}:{t}')
                break
            state = next_state
        else:
            max_remaining = max(max_remaining, rules.remaining(state))
    if violations:
        return sorted(violations)
    required_length = horizon + max_remaining
    if required_length > length:
        violations.add('rest_tail_unreserved')
        return sorted(violations)
    for pid in CREW:
        if any(v is None for v in grid[pid][:required_length]):
            violations.add(f'coverage:{pid}')
        if any(v is not None for v in grid[pid][required_length:]):
            violations.add(f'unneeded_rest_tail:{pid}')
    if violations:
        return sorted(violations)
    for t in range(required_length):
        occupants = {z: len(ctx['fixed'][z][t]) for z in zones}
        work_count = 0
        for pid in CREW:
            kind, zone = grid[pid][t]
            occupants[zone] += 1
            worker = ctx['workers'][pid]
            if pid in ctx['excluded']:
                expected_zone = ctx['incident_locations'].get(pid) or worker.location_id
                if kind != 'unavailable' or zone != expected_zone:
                    violations.add(f'excluded_location:{pid}:{t}')
                if ctx['zone'][zone][t].status != 'available':
                    violations.add(f'excluded_zone_unavailable:{pid}:{zone}:{t}')
            else:
                if kind == 'unavailable':
                    violations.add(f'available_worker_unavailable:{pid}:{t}')
                if _at(start,t) < ctx['work_not_before'] and (kind != 'recovery' or zone != worker.location_id):
                    violations.add(f'review_lead_in_location:{pid}:{t}')
                if kind == 'work':
                    work_count += 1
                    if t >= horizon:
                        violations.add(f'work_in_rest_tail:{pid}:{t}')
                    elif not ctx['gates'][t]:
                        violations.add(f'task_gate:{pid}:{t}')
                    if not ready_for_work(req, worker, _at(start,t), _at(start,t+1)):
                        violations.add(f'worker_not_ready:{pid}:{t}')
                    if worker.availability != 'available':
                        violations.add(f'worker_unavailable:{pid}')
                    if not _qualified(pid):
                        violations.add(f'qualification:{pid}')
                if kind == 'recovery' and ctx['zone'][zone][t].status != 'available':
                    violations.add(f'zone_unavailable:{zone}:{t}')
        for z in zones:
            if occupants[z] > ctx['capacity'][z]:
                violations.add(f'capacity:{z}:{t}')
        if work_count > (req.snapshot.workshop.staffing_demand.maximum or 0):
            violations.add(f'demand:{t}')
        if work_count and work_count < req.snapshot.workshop.staffing_demand.minimum:
            violations.add(f'demand_minimum:{t}')
    for pid in CREW:
        if pid in ctx['excluded']:
            continue
        state = _history_state(req, pid, rules)
        for t, value in enumerate(grid[pid][:required_length]):
            next_state = rules.next_state(state, value[0] == 'work')
            if next_state is None:
                violations.add(f'work_rest_policy:{pid}:{t}')
                break
            state = next_state
        if state not in rules.final_states:
            violations.add(f'rest_tail_incomplete:{pid}')
    return sorted(violations)


def _compress(req, ctx, grid):
    start, horizon = ctx['start'], ctx['horizon']
    zones = ctx['zones']
    rules = ctx['rules']
    carry = []
    for pid in CREW:
        if pid in ctx['excluded']:
            continue
        state = _history_state(req, pid, rules)
        for t in range(horizon):
            state = rules.next_state(state, grid[pid][t][0] == 'work')
        remaining = rules.remaining(state)
        if remaining:
            carry.append(RestObligation(person_id=pid, remaining_minutes=remaining,
                                        earliest_rest_complete_at=_at(start, horizon + remaining)))
    length = horizon + max((o.remaining_minutes for o in carry), default=0)
    intervals = []
    for pid in CREW:
        values = grid[pid][:length]
        i = 0
        while i < length:
            j = i + 1
            while j < length and values[j] == values[i]:
                j += 1
            kind, zone = values[i]
            intervals.append(Interval(person_id=pid, kind=kind,
                                      task_id='workshop_prep' if kind == 'work' else None,
                                      zone_id=zone, starts_at=_at(start, i), ends_at=_at(start, j),
                                      requires_revalidation=True))
            i = j
    occupancy = []
    for z in zones:
        counts = [len(ctx['fixed'][z][t]) + sum(grid[pid][t][1] == z for pid in CREW)
                  for t in range(length)]
        i = 0
        while i < length:
            j = i + 1
            while j < length and counts[j] == counts[i]:
                j += 1
            occupancy.append(Occupancy(starts_at=_at(start, i), ends_at=_at(start, j),
                                       zone_id=z, count=counts[i], capacity=ctx['capacity'][z]))
            i = j
    return intervals, occupancy, carry


def _recovery_placement(req, ctx, ids):
    """Fix an all-rest placement only when it adds no initial move or time variation."""
    recovery = ctx['recovery']
    if ctx['workshop'] in recovery:
        return {}
    placement = {}
    for t in range(ctx['length']):
        remaining = {z: ctx['capacity'][z] - len(ctx['fixed'][z][t]) for z in recovery}
        for pid in ctx['excluded']:
            zone = ctx['incident_locations'].get(pid) or ctx['workers'][pid].location_id
            if zone in recovery:
                remaining[zone] -= 1
        if any(remaining[z] < 0 for z in recovery):
            continue
        local = {}
        for pid in ids:
            preferred = ctx['workers'][pid].location_id
            if _at(ctx['start'],t) < ctx['work_not_before']:
                order = (preferred,)
            else:
                order = (preferred, *(z for z in recovery if z != preferred)) if preferred in recovery else recovery
            chosen = next((z for z in order if ctx['zone'][z][t].status == 'available' and remaining[z] > 0), None)
            if chosen is None:
                break
            local[pid] = chosen
            remaining[chosen] -= 1
        if len(local) == len(ids):
            placement[t] = local
    if len(placement) != ctx['length']:
        return {}
    first = placement[0]
    # A forced initial room move could disappear when that worker starts work.
    # Leave such choices to CP-SAT so the secondary objective stays exact.
    if any(ctx['workers'][pid].location_id in recovery and
           first[pid] != ctx['workers'][pid].location_id for pid in ids):
        return {}
    return placement if all(value == first for value in placement.values()) else {}


def _hint_earliest_work(model, req, ctx, ids, placement, work, rec):
    """Seed a valid early-work pattern where all-rest shelter placement exists."""
    if len(placement) != ctx['length']:
        return
    rules = ctx['rules']
    states = {pid:_history_state(req,pid,rules) for pid in ids}
    workers = ctx['workers']
    for t in range(ctx['length']):
        cap = min(req.snapshot.workshop.staffing_demand.maximum or 0,
                  ctx['capacity'][ctx['workshop']]-len(ctx['fixed'][ctx['workshop']][t]))
        if t >= ctx['horizon'] or not ctx['gates'][t]:
            cap = 0
        allowed = [pid for pid in ids if ready_for_work(req, workers[pid], _at(ctx['start'],t),
                                                      _at(ctx['start'],t+1)) and
                   _qualified(pid) and rules.can_work(states[pid])]
        # Finish a current tour before opening a new one; ties use stable IDs.
        allowed.sort(key=lambda pid:(states[pid] in rules.final_states,pid))
        selected = set(allowed[:max(0,cap)])
        for pid in ids:
            on = pid in selected
            zone = placement[t][pid]
            model.add_hint(work[pid,t],int(on))
            for recovery_zone in ctx['recovery']:
                model.add_hint(rec[pid,recovery_zone,t], int(not on and zone == recovery_zone))
            states[pid] = rules.next_state(states[pid], on)


def solve_plan(req):
    started = monotonic()
    ctx = _context(req)
    if ctx['status'] is not None:
        return _response(req, ctx)
    horizon, length = ctx['horizon'], ctx['length']
    rules = ctx['rules']
    arcs = rules.arcs()
    model = cp_model.CpModel()
    work, rec = {}, {}
    flips = []
    ids = [pid for pid in CREW if pid not in ctx['excluded']]
    placement = _recovery_placement(req, ctx, ids)
    recovery, workshop, zones = ctx['recovery'], ctx['workshop'], ctx['zones']
    for pid in ids:
        worker = ctx['workers'][pid]
        for t in range(length):
            w = model.new_bool_var(f'w_{pid}_{t}')
            work[pid,t] = w
            for z in recovery:
                rec[pid,z,t] = model.new_bool_var(f'r_{pid}_{z}_{t}')
            model.add(w + sum(rec[pid,z,t] for z in recovery) == 1)
            if t in placement:
                model.add(rec[pid,placement[t][pid],t] + w == 1)
            can_work = (t < horizon and ctx['gates'][t] and worker.availability == 'available' and
                        ready_for_work(req, worker, _at(ctx['start'],t), _at(ctx['start'],t+1)) and
                        _qualified(pid))
            if not can_work:
                model.add(w == 0)
            if _at(ctx['start'],t) < ctx['work_not_before']:
                model.add(rec[pid,worker.location_id,t] == 1)
            for z in recovery:
                if ctx['zone'][z][t].status != 'available':
                    model.add(rec[pid,z,t] == 0)
            if t:
                flip = model.new_bool_var(f'flip_{pid}_{t}')
                model.add(w != work[pid,t-1]).only_enforce_if(flip)
                model.add(w == work[pid,t-1]).only_enforce_if(flip.Not())
                flips.append(flip)
                if not placement:
                    room_move = model.new_bool_var(f'room_move_{pid}_{t}')
                    model.add(room_move <= 1-w)
                    model.add(room_move <= 1-work[pid,t-1])
                    for z in recovery:
                        model.add(room_move >= rec[pid,z,t]-rec[pid,z,t-1]-work[pid,t-1])
                    flips.append(room_move)
            elif worker.location_id in recovery or worker.location_id == workshop:
                current = (w if worker.location_id == workshop else 0)
                if worker.location_id in recovery:
                    current += rec[pid,worker.location_id,t]
                move = model.new_bool_var(f'initial_move_{pid}')
                model.add(current + move == 1)
                flips.append(move)
        model.add_automaton([work[pid,t] for t in range(length)],
                            _history_state(req, pid, rules), rules.final_states, arcs)
    _hint_earliest_work(model, req, ctx, ids, placement, work, rec)
    demand = req.snapshot.workshop.staffing_demand.maximum
    for t in range(length):
        active = sum(work[pid,t] for pid in ids)
        if t < horizon:
            model.add(active <= demand)
        for z in zones:
            fixed = len(ctx['fixed'][z][t])
            fixed += sum(pid in ctx['excluded'] and
                         (ctx['incident_locations'].get(pid) or ctx['workers'][pid].location_id) == z
                         for pid in CREW)
            varsum = (active if z == workshop else 0)
            if z in recovery:
                varsum += sum(rec[pid,z,t] for pid in ids)
            model.add(varsum + fixed <= ctx['capacity'][z])
        for pid in ctx['excluded']:
            excluded_zone = ctx['incident_locations'].get(pid) or ctx['workers'][pid].location_id
            if excluded_zone not in zones or ctx['zone'][excluded_zone][t].status != 'available':
                model.add(0 == 1)
    # Bounds cover the full 120-minute horizon plus 120-minute recovery tail.
    primary = sum(work[pid,t] for pid in ids for t in range(horizon))
    early = sum((horizon-t)*work[pid,t] for pid in ids for t in range(horizon))
    stable = sum((len(CREW)-CREW.index(pid))*work[pid,t] for pid in ids for t in range(horizon))
    useful_weight, change_weight, early_weight, stable_weight = lexicographic_weights(horizon, length-horizon)
    model.maximize(useful_weight*primary - change_weight*sum(flips) + early_weight*early + stable_weight*stable)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.01, 5.0 - (monotonic()-started))
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    status = solver.solve(model)
    names = {cp_model.OPTIMAL:'OPTIMAL', cp_model.FEASIBLE:'FEASIBLE', cp_model.INFEASIBLE:'INFEASIBLE',
             cp_model.UNKNOWN:'UNKNOWN', cp_model.MODEL_INVALID:'MODEL_INVALID'}
    name = names[status]
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        ctx['status'] = name.lower()
        ctx['blockers'] = [f'optimizer_{name.lower()}']
        return _response(req, ctx, solver_status=name)
    grid = {}
    for pid in CREW:
        if pid in ctx['excluded']:
            zone = ctx['incident_locations'].get(pid) or ctx['workers'][pid].location_id
            if zone not in zones:
                ctx['status'] = 'infeasible'
                ctx['blockers'] = [f'excluded_location_unrepresentable:{pid}']
                return _response(req, ctx, solver_status='INFEASIBLE')
            grid[pid] = [('unavailable',zone)]*length
        else:
            grid[pid] = [('work',workshop) if solver.value(work[pid,t]) else
                         ('recovery',next(z for z in recovery if solver.value(rec[pid,z,t])))
                         for t in range(length)]
    intervals, occupancy, carry = _compress(req,ctx,grid)
    violations = _minute_checker(req,ctx,intervals)
    if violations:
        ctx['status'] = 'model_invalid'
        ctx['blockers'] = violations
        return _response(req,ctx,solver_status='MODEL_INVALID')
    useful = sum(grid[pid][t][0] == 'work' for pid in CREW for t in range(horizon))
    unmet = sum(max(0,demand-sum(grid[pid][t][0]=='work' for pid in CREW)) for t in range(horizon))
    ctx['status'] = 'planned' if useful else 'recovery_only'
    return _response(req,ctx,solver_status=name,optimal=(status==cp_model.OPTIMAL),
                     intervals=intervals,occupancy=occupancy,carry_forward_rest=carry,
                     recovery_reservation_end=_at(ctx['start'],horizon+max((o.remaining_minutes for o in carry),default=0)),
                     useful_worker_minutes=useful,unmet_worker_minutes=unmet)


def check_plan(req: CheckRequest):
    ctx = _context(req)
    violations = _minute_checker(req,ctx,req.proposed_intervals)
    return PlanCheckResponse(**metadata(req), accepted=not violations,
                             violations=violations,
                             optimality='not_evaluated')
