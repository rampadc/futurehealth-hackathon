"""Generate or check fictional immediate workshop allocations, without applying them."""
import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path

import ortools
from jsonschema import ValidationError
from ortools.sat.python import cp_model

from inputs import prepare_problem, read, require, validate_problem

ROOT = Path(__file__).resolve().parent


def worker_reasons(problem, pid):
    context, people = problem['context'], problem['people']
    reasons = []
    if pid not in context['candidate_pool']:
        reasons.append('outside_candidate_pool')
    task = problem['tasks']['workshop_prep']
    if not set(task['required_qualifications']) <= set(people[pid]['qualifications']):
        reasons.append('qualification')
    if task['kind'] != 'light_supervised' and people[pid]['acclimatisation'] != 'complete':
        reasons.append('acclimatisation')
    if context['readiness'].get(pid) is not True:
        reasons.append('readiness')
    if pid in context['unavailable']:
        reasons.append('unavailable')
    return reasons


def constraints(problem):
    context = problem['context']
    free = problem['zones']['workshop']['capacity'] - len(problem['state']['occupancy']['workshop'])
    gates = [key for key in ('permit', 'resources', 'supervision') if not context[key]]
    if context['demand'] is None:
        gates.append('demand')
    eligible = [pid for pid in context['candidate_pool'] if not worker_reasons(problem, pid)]
    return free, context['demand'], gates, eligible


def diagnostics(problem):
    free, demand, gates, eligible = constraints(problem)
    reasons = set(gates)
    if len(eligible) < min(free, demand if demand is not None else free):
        reasons.add('readiness')
    if len(eligible) > free:
        reasons.add('capacity')
    if demand is not None and len(eligible) > demand:
        reasons.add('demand')
    if problem['context']['unavailable']:
        reasons.add('unavailable')
    return {'blockers': sorted(reasons), 'free_workshop_places': free,
            'useful_staffing_limit': demand, 'missing_prerequisites': sorted(gates),
            'ineligible_workers': {pid: worker_reasons(problem, pid)
                                   for pid in problem['context']['candidate_pool']
                                   if worker_reasons(problem, pid)}}


def projection(problem, selected):
    state = copy.deepcopy(problem['state'])
    for pid in selected:
        for assigned in state['assignments'].values():
            if pid in assigned:
                assigned.remove(pid)
        for occupants in state['occupancy'].values():
            if pid in occupants:
                occupants.remove(pid)
        state['occupancy']['workshop'].append(pid)
    state['assignments']['workshop_prep'] = sorted(selected)
    if selected:
        state['task_status']['workshop_prep'] = 'active'
    return state


def envelope(problem):
    fingerprint = hashlib.sha256(json.dumps(problem, sort_keys=True, separators=(',', ':'),
                                           allow_nan=False).encode()).hexdigest()
    return {'case_id': problem['case_id'], 'decision_at': problem['decision_at'],
            'input_fingerprint': fingerprint, 'synthetic': True, 'applied': False,
            'held_tasks': sorted(tid for tid, status in problem['state']['task_status'].items() if status == 'held'),
            'unavailable': sorted(problem['context']['unavailable']),
            'responder_status': copy.deepcopy(problem['context']['response']),
            'diagnostics': diagnostics(problem)}


def _solve_model(model):
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.max_time_in_seconds = 5.0
    return solver.solve(model), solver


def solve_allocation(problem):
    """Return a CP-SAT proposal from validated facts; never read fixture answers."""
    validate_problem(problem)
    free, demand, gates, eligible = constraints(problem)
    candidates = sorted(problem['context']['candidate_pool'])
    model = cp_model.CpModel()
    assignments = {pid: model.new_bool_var(f'workshop_{pid}') for pid in candidates}
    for pid in candidates:
        if gates or pid not in eligible:
            model.add(assignments[pid] == 0)
    model.add(sum(assignments.values()) <= free)
    if demand is not None:
        model.add(sum(assignments.values()) <= min(demand, len(candidates)))
    # One cardinality point outweighs every binary ID preference combined.
    cardinality_weight = 1 << len(candidates)
    model.maximize(sum((cardinality_weight + (1 << (len(candidates) - index - 1))) * assignments[pid]
                       for index, pid in enumerate(candidates)))
    status, solver = _solve_model(model)
    names = {cp_model.OPTIMAL: 'OPTIMAL', cp_model.FEASIBLE: 'FEASIBLE',
             cp_model.INFEASIBLE: 'INFEASIBLE', cp_model.MODEL_INVALID: 'MODEL_INVALID',
             cp_model.UNKNOWN: 'UNKNOWN'}
    require(status in names, 'unrecognised solver status')
    result = envelope(problem)
    result.update({'solver_status': names[status], 'solver_version': ortools.__version__,
                   'optimal': status == cp_model.OPTIMAL,
                   'solver_parameters': {'workers': 1, 'seed': 0, 'time_limit_seconds': 5.0},
                   'assignees': None, 'projected_state': None, 'objective_value': None})
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        selected = [pid for pid in candidates if solver.value(assignments[pid])]
        # Independently guard extraction before publishing a projected allocation.
        require(check_proposal(problem, selected)['accepted'], 'solver returned an invalid allocation')
        result.update({'assignees': selected, 'projected_state': projection(problem, selected),
                       'objective_value': int(round(solver.objective_value))})
    return result


def check_proposal(problem, person_ids):
    """Check hard feasibility, accepting valid subsets without claiming optimality."""
    validate_problem(problem)
    require(isinstance(person_ids, list) and all(isinstance(pid, str) for pid in person_ids),
            'proposal must be a list of worker IDs')
    require(len(person_ids) == len(set(person_ids)), 'duplicate proposed worker')
    require(set(person_ids) <= set(problem['people']), 'unknown proposed worker')
    free, demand, gates, _ = constraints(problem)
    reasons = {reason for pid in person_ids for reason in worker_reasons(problem, pid)}
    if len(person_ids) > free:
        reasons.add('capacity')
    if person_ids:
        reasons.update(gates)
        if demand is not None and len(person_ids) > demand:
            reasons.add('demand')
    result = envelope(problem)
    accepted = not reasons
    result.update({'solver_status': None, 'optimality': 'not_evaluated', 'accepted': accepted,
                   'violations': sorted(reasons), 'assignees': sorted(person_ids) if accepted else [],
                   'projected_state': projection(problem, person_ids if accepted else [])})
    return result


def verify(data):
    """Compare independently generated results to the authored output oracles."""
    results = []
    for case in data['cases']:
        problem = prepare_problem(data, case['id'])
        recommendation = solve_allocation(problem)
        checked = check_proposal(problem, case['proposal'])
        expected = case['expected']
        require(recommendation['solver_status'] == 'OPTIMAL', f"{case['id']}: optimum not established")
        require(checked['accepted'] == expected['accepted'], f"{case['id']}: proposal acceptance mismatch")
        # Rejected proposals have a distinct, independently generated replacement.
        if expected['accepted']:
            state = recommendation['projected_state']
            actual = {'assignees': recommendation['assignees'],
                      'recovery': sorted(state['occupancy']['shelter_a']),
                      'workshop_occupants': sorted(state['occupancy']['workshop']),
                      'unavailable': recommendation['unavailable'],
                      'blockers': recommendation['diagnostics']['blockers']}
            require(actual == {key: sorted(expected[key]) for key in actual},
                    f"{case['id']}: recommendation differs from authored expectation")
        else:
            require(checked['violations'] == sorted(expected['blockers']),
                    f"{case['id']}: rejection reasons mismatch")
            require(checked['assignees'] == expected['assignees'], 'rejected proposal applied')
            require(recommendation['assignees'] == ['C05', 'C06', 'C07', 'C08'],
                    'whole-crew replacement mismatch')
        results.append({'case_id': case['id'], 'solver_status': recommendation['solver_status'],
                        'assignees': recommendation['assignees'], 'proposal_accepted': checked['accepted']})
    return {'status': 'passed', 'cases': results}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest='command', required=True)
    for command in ('recommend', 'check', 'verify'):
        sub = subcommands.add_parser(command)
        sub.add_argument('--dataset', type=Path, default=ROOT / 'dataset.json')
        if command != 'verify':
            sub.add_argument('--case', required=True)
    args = parser.parse_args(argv)
    try:
        data = read(args.dataset)
        if args.command == 'verify':
            result = verify(data)
        else:
            problem = prepare_problem(data, args.case)
            if args.command == 'recommend':
                result = solve_allocation(problem)
            else:
                case = next(c for c in data['cases'] if c['id'] == args.case)
                result = check_proposal(problem, case['proposal'])
        print(json.dumps(result, indent=2, allow_nan=False))
        return 1 if result.get('solver_status') in ('MODEL_INVALID', 'UNKNOWN', 'INFEASIBLE') else 0
    except (ValueError, TypeError, KeyError, AssertionError, OSError, ValidationError) as error:
        print(json.dumps({'status': 'error', 'error_type': type(error).__name__, 'message': str(error)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
