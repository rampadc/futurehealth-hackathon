"""Validate authored allocation examples; does not search for allocation plans."""
import argparse
import copy
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from inputs import (read, require, time, reference_validator, apply_fact,
                    prepare_case, prepare_problem, validate_problem)

ROOT = Path(__file__).resolve().parent
DEMO = ROOT.parent


def check_case(case, snapshot, base, people, tasks, zones, reference):
    problem = prepare_case(case, snapshot, base, people, tasks, zones, reference)
    state, context = problem['state'], problem['context']
    pool = set(context['candidate_pool'])
    context['unavailable'] = set(context['unavailable'])
    workshop = tasks['workshop_prep']
    qualified = {pid for pid in pool if set(workshop['required_qualifications']) <= set(people[pid]['qualifications'])
                 and people[pid]['acclimatisation'] == 'complete'}
    eligible = {pid for pid in qualified if context['readiness'].get(pid) is True} - context['unavailable']
    free = zones['workshop']['capacity'] - len(state['occupancy']['workshop'])
    require(free >= 0, 'fixed workshop overcrowding')
    demand = context['demand']
    gates = [name for name in ('permit', 'resources', 'supervision') if not context[name]]
    if demand is None:
        gates.append('demand')
    limit = min(free, demand if demand is not None else free)
    expected_count = 0 if gates else min(len(eligible), limit)
    proposal = case['proposal']
    require(set(proposal) <= set(people), 'unknown proposed person')
    violations = set()
    if len(proposal) > free:
        violations.add('capacity')
    if any(not set(workshop['required_qualifications']) <= set(people[pid]['qualifications']) for pid in proposal):
        violations.add('qualification')
    if any(context['readiness'].get(pid) is not True for pid in proposal):
        violations.add('readiness')
    if not set(proposal) <= pool:
        violations.add('outside_candidate_pool')
    if set(proposal) & context['unavailable']:
        violations.add('unavailable')
    if proposal:
        violations.update(gates)
        if demand is not None and len(proposal) > demand:
            violations.add('demand')
        if workshop['kind'] != 'light_supervised' and any(people[pid]['acclimatisation'] != 'complete' for pid in proposal):
            violations.add('acclimatisation')
    accepted = not violations
    blockers = set(violations)
    if accepted:
        # Check authored cardinality and declared tie-break; no allocation search.
        require(len(proposal) == expected_count, 'expected plan leaves eligible useful slots unfilled')
        require(proposal == sorted(eligible)[:expected_count], 'plan violates stable ID tie-break')
        blockers.update(gates)
        if len(eligible) < limit:
            blockers.add('readiness')
        if len(eligible) > free:
            blockers.add('capacity')
        if demand is not None and len(eligible) > demand:
            blockers.add('demand')
        if context['unavailable']:
            blockers.add('unavailable')
    selected = proposal if accepted else []
    for pid in selected:
        for assigned in state['assignments'].values():
            if pid in assigned:
                assigned.remove(pid)
        for occupants in state['occupancy'].values():
            if pid in occupants:
                occupants.remove(pid)
        state['occupancy']['workshop'].append(pid)
    state['assignments']['workshop_prep'] = list(selected)
    if selected:
        state['task_status']['workshop_prep'] = 'active'
    state['clock'] = case['decision_at']
    reference.validate_state(state)
    require(state['assignments']['civil_light'] == ['C13', 'C14'], 'new-starter assignments changed')
    require('C01' in state['assignments']['civil_heavy'], 'foreman reservation lost')
    require(all(pid in state['occupancy']['workshop'] for pid in ('P07', 'P08')), 'welfare attendants displaced')
    accountability = set(selected) | set(state['occupancy']['shelter_a']) | context['unavailable']
    require(accountability == pool, 'affected eleven not accounted for')
    civil = {pid for pid, person in people.items() if person['crew_id'] == 'civil'}
    require(accountability | {'C01', 'C13', 'C14'} == civil and len(civil) == 14, 'civil roster mismatch')
    require(set(state['occupancy']['welfare']) == context['unavailable'], 'incident location not accounted for')
    require(set(context['response']) == context['unavailable'], 'missing responder status')
    actual = {'accepted': accepted, 'assignees': selected,
              'recovery': sorted(state['occupancy']['shelter_a']),
              'workshop_occupants': sorted(state['occupancy']['workshop']),
              'blockers': sorted(blockers), 'unavailable': sorted(context['unavailable'])}
    expected = copy.deepcopy(case['expected'])
    for key in ('recovery', 'workshop_occupants', 'blockers', 'unavailable'):
        expected[key] = sorted(expected[key])
    require(actual == expected, f"{case['id']}: result mismatch\nactual={actual}\nexpected={expected}")
    return state


def validate(data):
    schema = read(ROOT / 'dataset.schema.json')
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(data)
    from inputs import _check_ids, _source
    _check_ids(data)
    reference, base = _source()
    people, tasks, zones = reference.people, reference.tasks, reference.zones
    snapshots = {s['id']: s for s in data['snapshots']}
    results = {}
    for case in data['cases']:
        require(case['snapshot_id'] in snapshots, 'unknown snapshot reference')
        try:
            results[case['id']] = check_case(case, snapshots[case['snapshot_id']], base,
                                            people, tasks, zones, reference)
        except (ValueError, AssertionError) as error:
            raise ValueError(f"case {case['id']}: {error}") from error
    canonical = results['canonical']
    # Scenario 03 is an output oracle only, never a source of selection inputs.
    target, _ = reference.replay(DEMO / '03_constrained_reassignment', copy.deepcopy(base))
    for key in ('assignments', 'occupancy', 'task_status'):
        require(canonical[key] == target[key], f'canonical differs from scenario 03: {key}')
    require(len(canonical['occupancy']['shelter_a']) == 7, 'canonical recovery count')
    return results


def check_original():
    with tempfile.TemporaryDirectory(prefix='sandline-fixtures-') as temp:
        destination = Path(temp) / 'demo'
        shutil.copytree(DEMO, destination, ignore=shutil.ignore_patterns('solver', '__pycache__'))
        for script in ('validate.py', 'mutation_checks.py'):
            subprocess.run([sys.executable, str(destination / 'validation' / script)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-original', action='store_true', help='run original checks in a temporary copy')
    args = parser.parse_args()
    require(__debug__, 'run without -O: reference fixture validator uses assertions')
    results = validate(read(ROOT / 'dataset.json'))
    print(f'PASS: {len(results)} synthetic allocation cases; canonical matches scenario 03')
    if args.check_original:
        check_original()


if __name__ == '__main__':
    main()
