"""No-result statuses must never leak a proposed schedule."""
import copy
import unittest
from unittest.mock import patch

from ortools.sat.python import cp_model

from operations.contracts import Request
from operations.fixtures import canonical_request
from operations.planning import solve_plan
from operations.common import catalog


class PlanningStatusTests(unittest.TestCase):
    def test_room_reduction_does_not_force_an_unnecessary_initial_move(self):
        raw = canonical_request()
        raw['planning']['horizon_minutes'] = 3
        raw['snapshot']['workshop']['staffing_demand']['maximum'] = 1
        for worker in raw['snapshot']['workers']:
            worker['location_id'] = 'shelter_a'
            if worker['person_id'] != 'C05':
                worker['readiness'] = None
        fixed = [pid for pid in catalog()['people'] if not pid.startswith('C') and pid not in ('P07','P08')][:14]
        self.assertEqual(len(fixed), 14)
        next(w for w in raw['snapshot']['zone_windows'] if w['zone_id']=='shelter_a')['fixed_occupant_ids'] = fixed
        result = solve_plan(Request.model_validate(raw))
        self.assertTrue(result.optimal)
        self.assertEqual(result.useful_worker_minutes, 3)
        # C05 can recover in B after working; nobody else needs an initial move.
        self.assertTrue(all(i.person_id == 'C05' for i in result.intervals if i.zone_id == 'shelter_b'))

    def test_unknown_useful_demand_is_missing_information(self):
        raw = canonical_request()
        raw['snapshot']['workshop']['staffing_demand']['maximum'] = None
        with patch('operations.planning.cp_model.CpSolver.solve', side_effect=AssertionError('must not solve')):
            result = solve_plan(Request.model_validate(raw))
        self.assertEqual(result.planning_status, 'missing_information')
        self.assertEqual(result.blockers, ['useful_staffing_limit_unknown'])
        self.assertEqual(result.intervals, [])

    def test_no_solution_statuses_return_no_allocation(self):
        request = Request.model_validate(canonical_request())
        before = request.model_dump(mode='json')
        for status, name in [(cp_model.UNKNOWN, 'UNKNOWN'),
                             (cp_model.INFEASIBLE, 'INFEASIBLE'),
                             (cp_model.MODEL_INVALID, 'MODEL_INVALID')]:
            with self.subTest(status=name), patch(
                    'operations.planning.cp_model.CpSolver.solve', return_value=status):
                result = solve_plan(request)
                self.assertEqual(result.solver_status, name)
                self.assertFalse(result.optimal)
                self.assertEqual(result.intervals, [])
                self.assertIsNone(result.useful_worker_minutes)
        self.assertEqual(request.model_dump(mode='json'), before)

    def test_short_plan_repeatability_and_input_order(self):
        raw = canonical_request()
        raw['planning']['horizon_minutes'] = 3
        first = solve_plan(Request.model_validate(raw))
        alternate = copy.deepcopy(raw)
        alternate['snapshot']['workers'].reverse()
        alternate['snapshot']['activity_history'].reverse()
        second = solve_plan(Request.model_validate(alternate))
        third = solve_plan(Request.model_validate(raw))
        for result in (second, third):
            self.assertEqual(result.intervals, first.intervals)
            self.assertEqual(result.occupancy, first.occupancy)
            self.assertEqual(result.useful_worker_minutes, first.useful_worker_minutes)


if __name__ == '__main__':
    unittest.main()
