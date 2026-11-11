"""Independent checks of the allocation engine and its input boundary."""
import contextlib
import copy
import io
import itertools
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jsonschema import ValidationError
from ortools.sat.python import cp_model

import inputs
import solve


ROOT = Path(__file__).resolve().parent


def feasible(problem, crew):
    """Evaluate the facts directly, without calling production constraint helpers."""
    context = problem['context']
    task = problem['tasks']['workshop_prep']
    people = problem['people']
    selected = set(crew)
    if not selected <= set(context['candidate_pool']):
        return False
    if len(selected) > problem['zones']['workshop']['capacity'] - len(problem['state']['occupancy']['workshop']):
        return False
    if context['demand'] is not None and len(selected) > context['demand']:
        return False
    if not selected:
        return True
    if not all(context[key] for key in ('permit', 'resources', 'supervision')):
        return False
    if context['demand'] is None:
        return False
    for pid in selected:
        person = people[pid]
        if context['readiness'].get(pid) is not True or pid in context['unavailable']:
            return False
        if not set(task['required_qualifications']).issubset(person['qualifications']):
            return False
        if task['kind'] != 'light_supervised' and person['acclimatisation'] != 'complete':
            return False
    return True


def all_feasible(problem):
    pool = sorted(problem['context']['candidate_pool'])
    return [list(crew) for count in range(len(pool) + 1)
            for crew in itertools.combinations(pool, count) if feasible(problem, crew)]


class SolverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = inputs.read(ROOT / 'dataset.json')
        cls.problems = {case['id']: inputs.prepare_problem(cls.data, case['id'])
                        for case in cls.data['cases']}

    def case(self, case_id):
        return next(case for case in self.data['cases'] if case['id'] == case_id)

    def test_exhaustive_optima_and_projection_for_every_case(self):
        self.assertEqual(len(self.problems), 12)
        for case_id, problem in self.problems.items():
            with self.subTest(case=case_id):
                possible = all_feasible(problem)
                best_size = max(map(len, possible))
                optimum = min(crew for crew in possible if len(crew) == best_size)
                result = solve.solve_allocation(problem)
                self.assertEqual(result['solver_status'], 'OPTIMAL')
                self.assertTrue(result['optimal'])
                self.assertEqual(result['assignees'], optimum)
                self.assertTrue(result['synthetic'])
                self.assertFalse(result['applied'])
                self.assertEqual(result['held_tasks'], sorted(
                    tid for tid, status in problem['state']['task_status'].items() if status == 'held'))
                self.assertEqual(result['responder_status'], problem['context']['response'])

                state = result['projected_state']
                self.assertEqual(state['assignments']['workshop_prep'], optimum)
                self.assertEqual(set(state['occupancy']['workshop']),
                                 set(problem['state']['occupancy']['workshop']) | set(optimum))
                self.assertEqual(set(state['occupancy']['shelter_a']),
                                 set(problem['state']['occupancy']['shelter_a']) - set(optimum))
                self.assertEqual(state['task_status']['civil_heavy'], 'held')
                self.assertEqual(state['assignments']['civil_light'], ['C13', 'C14'])
                self.assertEqual(state['task_status']['workshop_prep'],
                                 'active' if optimum else problem['state']['task_status']['workshop_prep'])
                self.assertEqual(state['occupancy']['welfare'], problem['state']['occupancy']['welfare'])
                civil = {pid for pid, person in problem['people'].items() if person['crew_id'] == 'civil'}
                self.assertEqual(len(civil), 14)
                self.assertEqual(civil, set(problem['context']['candidate_pool']) | {'C01', 'C13', 'C14'})
                accounted = (set(state['occupancy']['shelter_a']) | set(optimum)
                             | set(problem['context']['unavailable']))
                self.assertEqual(accounted, set(problem['context']['candidate_pool']))
                self.assertEqual(len(state['occupancy']['workshop']),
                                 len(set(state['occupancy']['workshop'])))

    def test_canonical_and_independently_valid_alternatives(self):
        problem = self.problems['canonical']
        self.assertEqual(solve.solve_allocation(problem)['assignees'], ['C05', 'C06', 'C07', 'C08'])
        for proposed in ([], ['C05'], ['C06', 'C07'], ['C05', 'C06', 'C07', 'C08']):
            with self.subTest(proposal=proposed):
                self.assertTrue(feasible(problem, proposed))
                checked = solve.check_proposal(problem, proposed)
                self.assertTrue(checked['accepted'])
                self.assertEqual(checked['violations'], [])
                self.assertEqual(checked['optimality'], 'not_evaluated')
                self.assertIsNone(checked['solver_status'])
                self.assertEqual(checked['assignees'], proposed)
        rejected = solve.check_proposal(self.problems['whole_crew'], self.case('whole_crew')['proposal'])
        self.assertFalse(rejected['accepted'])
        self.assertEqual(rejected['assignees'], [])
        self.assertTrue(rejected['violations'])
        self.assertEqual(rejected['projected_state']['assignments']['workshop_prep'], [])
        self.assertEqual(solve.solve_allocation(self.problems['whole_crew'])['assignees'],
                         ['C05', 'C06', 'C07', 'C08'])
        eight_ready = self.problems['eight_ready']
        alternate = ['C09', 'C10', 'C11', 'C12']
        self.assertTrue(feasible(eight_ready, alternate))
        self.assertEqual(solve.solve_allocation(eight_ready)['assignees'], ['C05', 'C06', 'C07', 'C08'])
        checked = solve.check_proposal(eight_ready, alternate)
        self.assertTrue(checked['accepted'])
        self.assertEqual(checked['assignees'], alternate)
        self.assertEqual(checked['optimality'], 'not_evaluated')

    def test_malformed_proposal_ids_rejected(self):
        problem = self.problems['canonical']
        for proposed in (['C05', 'C05'], ['C99'], 'C05'):
            with self.subTest(proposal=proposed), self.assertRaises(ValueError):
                solve.check_proposal(problem, proposed)

    def test_oversized_nonbinding_demand(self):
        problem = copy.deepcopy(self.problems['canonical'])
        problem['context']['demand'] = 2**63
        result = solve.solve_allocation(problem)
        self.assertEqual(result['solver_status'], 'OPTIMAL')
        self.assertEqual(result['assignees'], ['C05', 'C06', 'C07', 'C08'])

    def test_every_authored_proposal_has_independent_feasibility_result(self):
        for case in self.data['cases']:
            with self.subTest(case=case['id']):
                problem = self.problems[case['id']]
                checked = solve.check_proposal(problem, case['proposal'])
                self.assertEqual(checked['accepted'], feasible(problem, case['proposal']))
                if checked['accepted']:
                    self.assertEqual(checked['assignees'], sorted(case['proposal']))
                else:
                    self.assertEqual(checked['assignees'], [])

    def test_oracles_do_not_enter_solver_input_or_fingerprint(self):
        case_id = 'canonical'
        baseline = self.problems[case_id]
        changed = copy.deepcopy(self.data)
        target = next(case for case in changed['cases'] if case['id'] == case_id)
        target['proposal'] = {'malformed': ['C12']}
        target['expected'] = {'arbitrary': 'answer'}
        self.assertEqual(inputs.prepare_problem(changed, case_id), baseline)
        for case in changed['cases']:
            case.pop('proposal', None)
            case.pop('expected', None)
        self.assertEqual(inputs.prepare_problem(changed, case_id), baseline)
        changed['cases'].reverse()
        changed['snapshots'].reverse()
        self.assertEqual(inputs.prepare_problem(changed, case_id), baseline)
        self.assertEqual(solve.solve_allocation(baseline)['input_fingerprint'],
                         solve.solve_allocation(inputs.prepare_problem(changed, case_id))['input_fingerprint'])
        self.assertNotIn('proposal', json.dumps(baseline))
        self.assertNotIn('expected', json.dumps(baseline))

    def test_immutable_repeatable_and_order_independent(self):
        cases_before = copy.deepcopy(self.data)
        problems_before = copy.deepcopy(self.problems)
        forward = {name: solve.solve_allocation(problem) for name, problem in self.problems.items()}
        reverse = {name: solve.solve_allocation(problem)
                   for name, problem in reversed(list(self.problems.items()))}
        self.assertEqual(forward, reverse)
        self.assertEqual(self.data, cases_before)
        self.assertEqual(self.problems, problems_before)
        for name, problem in self.problems.items():
            self.assertEqual(forward[name], solve.solve_allocation(problem))

    def test_solver_statuses_are_not_misreported_as_optimal(self):
        problem = self.problems['canonical']
        original = solve._solve_model

        def feasible_result(model):
            status, solver = original(model)
            self.assertEqual(status, cp_model.OPTIMAL)
            return cp_model.FEASIBLE, solver

        with patch.object(solve, '_solve_model', side_effect=feasible_result):
            result = solve.solve_allocation(problem)
        self.assertEqual(result['solver_status'], 'FEASIBLE')
        self.assertFalse(result['optimal'])
        self.assertEqual(result['assignees'], ['C05', 'C06', 'C07', 'C08'])

        for status, name in ((cp_model.UNKNOWN, 'UNKNOWN'),
                             (cp_model.INFEASIBLE, 'INFEASIBLE'),
                             (cp_model.MODEL_INVALID, 'MODEL_INVALID')):
            with self.subTest(status=name), patch.object(solve, '_solve_model', return_value=(status, None)):
                result = solve.solve_allocation(problem)
                self.assertEqual(result['solver_status'], name)
                self.assertFalse(result['optimal'])
                self.assertIsNone(result['assignees'])
                self.assertIsNone(result['projected_state'])
                self.assertIsNone(result['objective_value'])

    def test_source_cutoff_and_prepared_input_controls(self):
        altered = copy.deepcopy(self.data)
        snapshot = next(s for s in altered['snapshots'] if s['id'] == 'canonical_081030')
        readiness = next(f for f in snapshot['facts'] if f['kind'] == 'readiness')
        readiness['recorded_at'] = '2025-08-04T08:11:00+04:00'
        with self.assertRaises((ValueError, ValidationError)):
            inputs.prepare_problem(altered, 'canonical')
        for mutation in (
            lambda p: p['context']['readiness'].clear(),
            lambda p: p['context'].update(permit=False),
            lambda p: p['context'].update(resources=False),
            lambda p: p['context'].update(supervision=False),
        ):
            problem = copy.deepcopy(self.problems['canonical'])
            mutation(problem)
            result = solve.solve_allocation(problem)
            self.assertEqual(result['assignees'], [])
            self.assertFalse(solve.check_proposal(problem, ['C05'])['accepted'])
        for key in ('readiness', 'permit', 'resources', 'supervision'):
            problem = copy.deepcopy(self.problems['canonical'])
            del problem['context'][key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                solve.solve_allocation(problem)

    def test_frozen_definitions_and_evidence_are_type_sensitive(self):
        for mutation in (
            lambda p: p['zones']['workshop'].update(capacity=6.0),
            lambda p: p['state']['alerts']['heat_case_01'].update(acknowledged=1),
            lambda p: p['context'].update(demand=True),
            lambda p: p['context'].update(permit=1),
        ):
            problem = copy.deepcopy(self.problems['canonical'])
            mutation(problem)
            with self.assertRaises(ValueError):
                solve.solve_allocation(problem)

    def test_schema_integer_demand_normalises_integral_json_number(self):
        data = copy.deepcopy(self.data)
        snapshot = next(s for s in data['snapshots'] if s['id'] == 'canonical_081030')
        fact = next(f for f in snapshot['facts'] if f['kind'] == 'demand')
        fact['payload']['max_workers'] = 4.0
        problem = inputs.prepare_problem(data, 'canonical')
        self.assertIs(type(problem['context']['demand']), int)
        self.assertEqual(solve.solve_allocation(problem)['assignees'], ['C05', 'C06', 'C07', 'C08'])

    def test_cli_outputs_json_and_rejects_bad_input(self):
        def run(*args):
            return subprocess.run([sys.executable, str(ROOT / 'solve.py'), *args],
                                  capture_output=True, text=True, check=False)

        for command in ('recommend', 'check'):
            process = run(command, '--case', 'canonical')
            self.assertEqual(process.returncode, 0, process.stderr)
            self.assertEqual(json.loads(process.stdout)['case_id'], 'canonical')
        process = run('check', '--case', 'whole_crew')
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertFalse(json.loads(process.stdout)['accepted'])
        process = run('verify')
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(json.loads(process.stdout)['status'], 'passed')
        process = run('recommend', '--case', 'missing_case')
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(json.loads(process.stdout)['status'], 'error')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'invalid.json'
            path.write_text('{"cases": []}')
            process = run('recommend', '--case', 'canonical', '--dataset', str(path))
            self.assertNotEqual(process.returncode, 0)
            self.assertEqual(json.loads(process.stdout)['status'], 'error')

        for status, name in ((cp_model.UNKNOWN, 'UNKNOWN'),
                             (cp_model.INFEASIBLE, 'INFEASIBLE'),
                             (cp_model.MODEL_INVALID, 'MODEL_INVALID')):
            with self.subTest(status=name), patch.object(solve, 'read', return_value=self.data), patch.object(
                    solve, '_solve_model', return_value=(status, None)):
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    code = solve.main(['recommend', '--case', 'canonical'])
                self.assertEqual(code, 1)
                self.assertEqual(json.loads(output.getvalue())['solver_status'], name)


if __name__ == '__main__':
    unittest.main()
