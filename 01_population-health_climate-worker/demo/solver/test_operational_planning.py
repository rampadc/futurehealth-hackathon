"""Focused hard-feasibility and timing tests for the operational planner."""
import copy
import itertools
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from operations.contracts import CheckRequest, Request
from operations.planning import check_plan, solve_plan
from operations.fixtures import canonical_request, cases, readiness_record
from operations.common import POLICY, catalog, metadata
from test_operational_decisions import at


def request(*, ready=('C05','C06','C07','C08'), horizon=60, demand=4):
    data = canonical_request()
    data['planning']['horizon_minutes'] = horizon
    data['snapshot']['workshop']['staffing_demand']['maximum'] = demand
    for worker in data['snapshot']['workers']:
        if worker['person_id'] in ready:
            worker['readiness'] = readiness_record(worker['person_id'],confirmed_at=at(8,11))
        else:
            worker['readiness'] = None
    return data


def review_request(*, horizon=5, boundary=at(8,13)):
    data = request(horizon=horizon)
    data['planning']['work_not_before'] = boundary
    for worker in data['snapshot']['workers']:
        worker['location_id'] = 'shelter_a' if int(worker['person_id'][1:]) <= 8 else 'shelter_b'
    return data


def _valid_timing(bits, *, initial=6, maximum=15, rest=15, observed_recovery=7):
    """Independent run-length oracle; deliberately does not use planner states."""
    work_run = 0
    cooled_since_work = observed_recovery
    worked_before = False
    for working in (*bits, *(False for _ in range(rest))):
        if working:
            if not work_run and cooled_since_work < (rest if worked_before else initial):
                return False
            work_run += 1
            if work_run > maximum:
                return False
            worked_before = True
            cooled_since_work = 0
        else:
            work_run = 0
            cooled_since_work += 1
    return not worked_before or cooled_since_work >= rest


def _score(bits_by_pid, *, tail=15):
    horizon = len(next(iter(bits_by_pid.values())))
    useful = sum(sum(bits) for bits in bits_by_pid.values())
    changes = 0
    early = 0
    stable = 0
    for pid,bits in bits_by_pid.items():
        trajectory = (*bits, *(False for _ in range(tail)))
        changes += int(not trajectory[0])  # C05/C06 currently occupy workshop.
        changes += sum(a != b for a,b in zip(trajectory,trajectory[1:]))
        early += sum((horizon-t)*working for t,working in enumerate(bits))
        stable += sum((11-(int(pid[1:])-2))*working for working in bits)
    return useful,-changes,early,stable


def _actual_bits(plan,pid,horizon):
    start = plan.decision_at
    return tuple(any(i.person_id == pid and i.kind == 'work' and
                     i.starts_at <= start+timedelta(minutes=t) < i.ends_at
                     for i in plan.intervals) for t in range(horizon))


class PlanningTests(unittest.TestCase):
    def test_review_boundary_gates_work_and_checker_accepts_equality(self):
        data = review_request()
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status, 'planned')
        self.assertTrue(all(i.starts_at >= datetime.fromisoformat(at(8,13))
                            for i in plan.intervals if i.kind == 'work'))
        self.assertTrue(any(i.starts_at == datetime.fromisoformat(at(8,13))
                            for i in plan.intervals if i.kind == 'work'))
        proposed = [i.model_dump(mode='json') for i in plan.intervals]
        checked = check_plan(CheckRequest.model_validate({**data, 'proposed_intervals': proposed}))
        self.assertTrue(checked.accepted, checked.violations)
        early = copy.deepcopy(proposed)
        first = next(i for i in early if i['person_id'] == 'C05' and i['starts_at'] == at(8,11))
        first.update(kind='work', task_id='workshop_prep', zone_id='workshop')
        rejected = check_plan(CheckRequest.model_validate({**data, 'proposed_intervals': early}))
        self.assertFalse(rejected.accepted)
        self.assertTrue(any(v.startswith('task_gate:C05:0') for v in rejected.violations))
        wrong_room = copy.deepcopy(proposed)
        next(i for i in wrong_room if i['person_id'] == 'C05' and i['starts_at'] == at(8,11))['zone_id'] = 'shelter_b'
        rejected = check_plan(CheckRequest.model_validate({**data, 'proposed_intervals': wrong_room}))
        self.assertIn('review_lead_in_location:C05:0', rejected.violations)

    def test_review_lead_in_advances_initial_recovery_without_new_observations(self):
        data = review_request(horizon=4)
        data['timing_policy'] = {'id': 'review-initial-nine', 'initial_recovery_minutes': 9,
                                 'max_work_minutes': 15, 'between_work_recovery_minutes': 15}
        data['planning']['policy_id'] = None
        plan = solve_plan(Request.model_validate(data))
        first = min(i.starts_at for i in plan.intervals if i.kind == 'work')
        self.assertEqual(first, datetime.fromisoformat(at(8,13)))

    def test_review_lead_in_uses_current_cooling_capacity_and_rest(self):
        data = review_request()
        for location in data['locations']:
            if location['id'] == 'shelter_a':
                location['capacity'] = 7
            if location['id'] == 'shelter_b':
                location['capacity'] = 4
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status, 'planned')
        for zone, count in (('shelter_a', 7), ('shelter_b', 4)):
            self.assertTrue(any(row.zone_id == zone and row.starts_at == datetime.fromisoformat(at(8,11))
                                and row.count == count for row in plan.occupancy))
        self.assertTrue(all(i.kind == 'recovery' and i.zone_id ==
                            next(w['location_id'] for w in data['snapshot']['workers'] if w['person_id'] == i.person_id)
                            for i in plan.intervals if i.starts_at == datetime.fromisoformat(at(8,11))))
        data['locations'][4]['capacity'] = 6
        blocked = solve_plan(Request.model_validate(data))
        self.assertIn(blocked.planning_status, ('infeasible', 'blocked'))
        self.assertEqual(blocked.intervals, [])

    def test_review_lead_in_noncooled_location_blocks_and_end_boundary_has_no_work(self):
        data = review_request()
        next(w for w in data['snapshot']['workers'] if w['person_id'] == 'C05')['location_id'] = 'workshop'
        blocked = solve_plan(Request.model_validate(data))
        self.assertEqual(blocked.planning_status, 'blocked')
        self.assertIn('review_lead_in_location_not_cooled:C05', blocked.blockers)
        no_work = review_request(horizon=2, boundary=at(8,13))
        plan = solve_plan(Request.model_validate(no_work))
        self.assertEqual(plan.planning_status, 'recovery_only')
        self.assertEqual(plan.useful_worker_minutes, 0)
        self.assertTrue(all(i.kind == 'recovery' for i in plan.intervals))

    def test_review_boundary_validation_and_optional_fingerprint(self):
        legacy = request(horizon=5)
        base = metadata(Request.model_validate(legacy))['input_fingerprint']
        for invalid in (at(8,10), at(8,12,30), '2025-08-05T08:13:00+04:00',
                        '2025-08-04T08:13:00+03:00'):
            data = review_request(boundary=invalid)
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                solve_plan(Request.model_validate(data))
        data = review_request()
        self.assertNotEqual(metadata(Request.model_validate(data))['input_fingerprint'], base)
        self.assertEqual(metadata(Request.model_validate(legacy))['input_fingerprint'], base)

    def test_reduced_exhaustive_one_worker_max_tour_and_ties(self):
        horizon = 16
        feasible = (bits for bits in itertools.product((False,True),repeat=horizon)
                    if _valid_timing(bits))
        best = max(_score({'C05':bits}) for bits in feasible)
        plan = solve_plan(Request.model_validate(request(ready=('C05',),horizon=horizon,demand=1)))
        self.assertEqual(_score({'C05':_actual_bits(plan,'C05',horizon)}),best)

    def test_reduced_exhaustive_two_worker_capacity_and_id_tie(self):
        horizon = 3
        patterns = [bits for bits in itertools.product((False,True),repeat=horizon)
                    if _valid_timing(bits)]
        best = max(_score({'C05':a,'C06':b}) for a in patterns for b in patterns
                   if all(not (x and y) for x,y in zip(a,b)))
        plan = solve_plan(Request.model_validate(request(ready=('C05','C06'),horizon=horizon,demand=1)))
        actual = {'C05':_actual_bits(plan,'C05',horizon),
                  'C06':_actual_bits(plan,'C06',horizon)}
        self.assertEqual(_score(actual),best)
        self.assertEqual(actual['C05'],(True,True,True))

    def test_lexicographic_weights_dominate_all_lower_tiers(self):
        # The public helper bounds every lower tier at the largest allowed horizon and tail.
        from operations.timing import lexicographic_weights
        useful, changes, early, stable = lexicographic_weights(horizon=120, tail=120)
        max_changes = 11 * (120 + 120 + 1)
        max_early = 11 * 120 * 121 // 2
        max_stable = 11 * 120 * 11
        self.assertGreater(early, max_stable * stable)
        self.assertGreater(changes, max_early * early + max_stable * stable)
        self.assertGreater(useful, max_changes * changes + max_early * early + max_stable * stable)

    def test_reduced_exhaustive_supplied_timing_policies(self):
        for initial, maximum, rest, horizon, observed in (
            (0,2,4,6,7), (9,3,2,6,7), (5,2,4,7,2), (0,5,1,5,7),
        ):
            with self.subTest(initial=initial, maximum=maximum, rest=rest, horizon=horizon):
                data = request(ready=('C05',),horizon=horizon,demand=1)
                data['timing_policy'] = dict(id=f'custom-{initial}-{maximum}-{rest}',
                    initial_recovery_minutes=initial,max_work_minutes=maximum,
                    between_work_recovery_minutes=rest)
                data['planning']['policy_id'] = None
                for history in data['snapshot']['activity_history']:
                    history['starts_at'] = at(8,11-observed)
                patterns = (bits for bits in itertools.product((False,True),repeat=horizon)
                    if _valid_timing(bits,initial=initial,maximum=maximum,rest=rest,
                                     observed_recovery=observed))
                best = max(_score({'C05':bits},tail=rest) for bits in patterns)
                plan = solve_plan(Request.model_validate(data))
                self.assertEqual(plan.planning_status,'planned')
                self.assertEqual(_score({'C05':_actual_bits(plan,'C05',horizon)},tail=rest),best)

    def test_canonical_tours_and_check(self):
        data = request()
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status, 'planned')
        self.assertEqual(plan.useful_worker_minutes, 120)
        self.assertEqual(plan.unmet_worker_minutes, 120)
        self.assertIn(plan.solver_status, ('OPTIMAL','FEASIBLE'))
        self.assertTrue(all(i.requires_revalidation for i in plan.intervals))
        checked = check_plan(CheckRequest.model_validate({**data,
            'proposed_intervals':[i.model_dump(mode='json') for i in plan.intervals]}))
        self.assertTrue(checked.accepted, checked.violations)
        self.assertEqual({i.person_id for i in plan.intervals}, {f'C{n:02d}' for n in range(2,13)})
        self.assertTrue(all(i.ends_at <= plan.recovery_reservation_end for i in plan.intervals))
        tours = [(i.kind,i.starts_at.time().isoformat(),i.ends_at.time().isoformat())
                 for i in plan.intervals if i.person_id == 'C05']
        self.assertEqual(tours[:4], [('work','08:11:00','08:26:00'),
                                     ('recovery','08:26:00','08:41:00'),
                                     ('work','08:41:00','08:56:00'),
                                     ('recovery','08:56:00','09:11:00')])
        self.assertEqual(plan.recovery_reservation_end.time().isoformat(),'09:11:00')

    def test_supplied_policy_changes_tours_and_is_checked(self):
        expected_first = {'alternate_timing_policy':'08:14:00',
                          'long_recovery_policy':'08:11:00',
                          'zero_initial_recovery':'08:11:00'}
        for name, first_at in expected_first.items():
            with self.subTest(case=name):
                data = cases()[name]
                plan = solve_plan(Request.model_validate(data))
                self.assertEqual(plan.planning_status,'planned')
                self.assertEqual(plan.policy_source,'supplied')
                self.assertEqual(plan.policy_id,data['timing_policy']['id'])
                self.assertEqual(plan.timing_policy.model_dump(),data['timing_policy'])
                first = next(i for i in plan.intervals if i.person_id=='C05' and i.kind=='work')
                self.assertEqual(first.starts_at.time().isoformat(),first_at)
                checked = check_plan(CheckRequest.model_validate({**data,
                    'proposed_intervals':[i.model_dump(mode='json') for i in plan.intervals]}))
                self.assertTrue(checked.accepted,checked.violations)

    def test_registered_fallback_reads_policy_file_values(self):
        data = request(ready=('C05',),horizon=4,demand=1)
        data['timing_policy'] = None
        with patch.dict(POLICY, {'initial_recovery_minutes':9,'max_work_minutes':2,
                                 'between_work_recovery_minutes':3}):
            plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.policy_source,'registered')
        self.assertEqual(plan.timing_policy.initial_recovery_minutes,9)
        first = next(i for i in plan.intervals if i.person_id=='C05' and i.kind=='work')
        self.assertEqual(first.starts_at.time().isoformat(),'08:13:00')

    def test_stricter_supplied_policy_rejects_canonical_schedule(self):
        canonical = canonical_request()
        plan = solve_plan(Request.model_validate(canonical))
        proposed = [i.model_dump(mode='json') for i in plan.intervals]
        for name in ('alternate_timing_policy','long_recovery_policy'):
            with self.subTest(case=name):
                data = cases()[name]
                checked = check_plan(CheckRequest.model_validate({**data,'proposed_intervals':proposed}))
                self.assertFalse(checked.accepted)
                self.assertTrue(any(v.startswith('work_rest_policy') for v in checked.violations))

    def test_long_recovery_extends_reservation_beyond_horizon(self):
        data = cases()['long_recovery_policy']
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.useful_worker_minutes,120)
        self.assertEqual(plan.recovery_reservation_end.time().isoformat(),'09:41:00')
        self.assertTrue(all(item.remaining_minutes == 30 for item in plan.carry_forward_rest))

    def test_long_recovery_avoids_work_when_tail_windows_end(self):
        data = cases()['long_recovery_policy']
        data['planning']['horizon_minutes'] = 15
        for window in data['snapshot']['zone_windows']:
            window['ends_at'] = at(8,26)
        data['snapshot']['task_windows'][0]['ends_at'] = at(8,26)
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status,'recovery_only')
        self.assertEqual(plan.useful_worker_minutes,0)
        self.assertEqual(plan.carry_forward_rest,[])

    def test_zero_initial_still_requires_observed_history(self):
        data = cases()['zero_initial_recovery']
        data['snapshot']['activity_history'] = []
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status,'missing_information')
        self.assertIn('activity_history_missing:C05',plan.blockers)

    def test_history_longer_than_new_maximum_requires_recovery(self):
        data = request(ready=('C05',),horizon=8,demand=1)
        data['timing_policy'] = {'id':'shorter-work-after-history',
            'initial_recovery_minutes':0,'max_work_minutes':3,
            'between_work_recovery_minutes':5}
        data['planning']['policy_id'] = None
        history = data['snapshot']['activity_history']
        history[:] = [item for item in history if item['person_id']!='C05']
        history.append({'evidence_id':'prior-work-C05','person_id':'C05','kind':'work',
            'task_id':'workshop_prep','zone_id':'workshop','starts_at':at(8,7),
            'ends_at':at(8,11),'recorded_at':at(8,11),'observed':True,
            'source':'synthetic_fixture'})
        plan = solve_plan(Request.model_validate(data))
        first = next(i for i in plan.intervals if i.person_id=='C05' and i.kind=='work')
        self.assertGreaterEqual(first.starts_at,datetime.fromisoformat(at(8,16)))
        checked = check_plan(CheckRequest.model_validate({**data,
            'proposed_intervals':[i.model_dump(mode='json') for i in plan.intervals]}))
        self.assertTrue(checked.accepted,checked.violations)

    def test_initial_recovery_rounds_partial_minute_down(self):
        data = request(ready=('C05',),horizon=4,demand=1)
        data['timing_policy'] = {'id':'eight-full-minutes','initial_recovery_minutes':8,
            'max_work_minutes':4,'between_work_recovery_minutes':2}
        data['planning']['policy_id'] = None
        for history in data['snapshot']['activity_history']:
            history['starts_at'] = at(8,3,30)
        plan = solve_plan(Request.model_validate(data))
        first = next(i for i in plan.intervals if i.person_id=='C05' and i.kind=='work')
        self.assertEqual(first.starts_at.time().isoformat(),'08:12:00')

    def test_initial_debt_larger_than_between_work_rest(self):
        data = request(ready=('C05',),horizon=25,demand=1)
        data['timing_policy'] = {'id':'large-initial-debt','initial_recovery_minutes':30,
            'max_work_minutes':2,'between_work_recovery_minutes':5}
        data['planning']['policy_id'] = None
        for window in data['snapshot']['zone_windows']:
            window['ends_at'] = at(8,41)
        data['snapshot']['task_windows'][0]['ends_at'] = at(8,36)
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.useful_worker_minutes,2)
        first = next(i for i in plan.intervals if i.person_id=='C05' and i.kind=='work')
        self.assertEqual(first.starts_at.time().isoformat(),'08:34:00')
        self.assertEqual(plan.recovery_reservation_end.time().isoformat(),'08:41:00')

    def test_eight_ready_rotate_to_fill_four_seats(self):
        data = request(ready=tuple(f'C{i:02d}' for i in range(5,13)))
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.useful_worker_minutes, 240)
        self.assertEqual(plan.unmet_worker_minutes, 0)

    def test_supplied_capacity_limits_workshop_seats(self):
        data = request(horizon=15)
        workshop = next(loc for loc in data['locations'] if loc['id']=='workshop')
        workshop['capacity'] = 3  # Two fixed occupants leave one worker seat.
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.useful_worker_minutes,15)
        self.assertTrue(all(row.count <= row.capacity for row in plan.occupancy))
        self.assertTrue(all(row.capacity == 3 for row in plan.occupancy
                            if row.zone_id == 'workshop'))

    def test_readiness_expiry_midminute_limits_entire_work_interval(self):
        data = request(ready=('C05',),horizon=10,demand=1)
        expires = at(8,17,30)
        next(w for w in data['snapshot']['workers']
             if w['person_id']=='C05')['readiness']['valid_until'] = expires
        plan = solve_plan(Request.model_validate(data))
        work = [i for i in plan.intervals if i.person_id=='C05' and i.kind=='work']
        self.assertEqual(plan.useful_worker_minutes,6)
        self.assertTrue(work)
        self.assertTrue(all(i.ends_at <= datetime.fromisoformat(expires) for i in work))

    def test_arbitrary_location_names_and_third_cooling_shelter(self):
        data = cases()['dynamic_locations']
        data['planning']['horizon_minutes'] = 15
        for window in data['snapshot']['zone_windows']:
            if window['zone_id'] in ('cool_room_7','shelter_7'):
                window['status'] = 'unavailable'
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status,'planned')
        self.assertTrue(any(i.kind == 'work' and i.zone_id == 'annex_7'
                            for i in plan.intervals))
        self.assertTrue(any(i.kind == 'recovery' and i.zone_id == 'third_shelter_7'
                            for i in plan.intervals))
        checked = check_plan(CheckRequest.model_validate({**data,
            'proposed_intervals':[i.model_dump(mode='json') for i in plan.intervals]}))
        self.assertTrue(checked.accepted,checked.violations)

    def test_actual_work_history_carries_through_replan(self):
        data = cases()['incident_no_substitute']
        self.assertEqual(next(w for w in data['snapshot']['workers']
                              if w['person_id']=='C08')['readiness']['status'],'ready')
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status, 'planned')
        self.assertNotIn('C08',{i.person_id for i in plan.intervals if i.kind == 'work'})
        self.assertTrue(all(i.kind == 'unavailable' and i.zone_id == 'welfare'
                            for i in plan.intervals if i.person_id == 'C08'))
        checked = check_plan(CheckRequest.model_validate({**data,
            'proposed_intervals':[i.model_dump(mode='json') for i in plan.intervals]}))
        self.assertTrue(checked.accepted,checked.violations)
        unavailable_welfare = copy.deepcopy(data)
        next(w for w in unavailable_welfare['snapshot']['zone_windows'] if w['zone_id']=='welfare')['status'] = 'unavailable'
        rejected = check_plan(CheckRequest.model_validate({**unavailable_welfare,
            'proposed_intervals':[i.model_dump(mode='json') for i in plan.intervals]}))
        self.assertFalse(rejected.accepted)
        self.assertTrue(any(v.startswith('excluded_zone_unavailable:C08:welfare') for v in rejected.violations))

    def test_unready_never_work_and_tail_reserved(self):
        data = request(ready=('C05',), horizon=15, demand=1)
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.useful_worker_minutes, 15)
        self.assertEqual({i.person_id for i in plan.intervals if i.kind == 'work'}, {'C05'})
        self.assertTrue(any(i.person_id == 'C05' and i.kind == 'recovery' and i.ends_at > plan.horizon_end
                            for i in plan.intervals))
        self.assertEqual(plan.carry_forward_rest[0].remaining_minutes,15)

    def test_missing_window_and_policy_have_no_schedule(self):
        data = request()
        data['snapshot']['zone_windows'][2]['ends_at'] = at(8,30)
        missing = solve_plan(Request.model_validate(data))
        self.assertEqual(missing.planning_status, 'missing_information')
        self.assertEqual(missing.intervals, [])
        data = request()
        data['planning']['policy_id'] = None
        data['timing_policy'] = None
        missing = solve_plan(Request.model_validate(data))
        self.assertEqual(missing.planning_status, 'missing_policy')
        self.assertEqual(missing.intervals, [])

    def test_checker_rejects_early_work_and_tail_work(self):
        data = request(ready=('C05',), horizon=30, demand=1)
        plan = solve_plan(Request.model_validate(data))
        proposed = [i.model_dump(mode='json') for i in plan.intervals]
        idx = next(i for i,x in enumerate(proposed) if x['person_id']=='C05' and x['kind']=='recovery')
        proposed[idx] = dict(proposed[idx],kind='work',task_id='workshop_prep',zone_id='workshop')
        result = check_plan(CheckRequest.model_validate({**data,'proposed_intervals':proposed}))
        self.assertFalse(result.accepted)
        self.assertTrue(any(v.startswith('work_rest_policy') for v in result.violations))

    def test_protective_block_precedes_optimizer(self):
        data = request()
        data['snapshot']['cessation'] = None
        data['snapshot']['recovery'] = None
        result = solve_plan(Request.model_validate(data))
        self.assertEqual(result.planning_status,'blocked')
        self.assertIsNone(result.solver_status)
        self.assertEqual(result.intervals,[])

    def test_missing_history_is_not_invented(self):
        data = request()
        data['snapshot']['activity_history'] = []
        plan = solve_plan(Request.model_validate(data))
        self.assertEqual(plan.planning_status,'missing_information')
        self.assertEqual(plan.intervals,[])

    def test_partial_minute_window_does_not_cover_slot(self):
        data = request()
        data['snapshot']['zone_windows'][0]['ends_at'] = at(8,11,30)
        result = solve_plan(Request.model_validate(data))
        self.assertEqual(result.planning_status,'missing_information')
        self.assertTrue(any(b.startswith('zone_window_missing:workshop:0') for b in result.blockers))

    def test_no_tail_windows_needed_when_no_rest_is_owed(self):
        data = request(ready=(),horizon=1)
        for window in data['snapshot']['zone_windows']:
            window['ends_at'] = at(8,12)
        data['snapshot']['task_windows'][0]['ends_at'] = at(8,12)
        result = solve_plan(Request.model_validate(data))
        self.assertEqual(result.planning_status,'recovery_only')
        self.assertEqual(result.recovery_reservation_end.time().isoformat(),'08:12:00')
        self.assertEqual(result.carry_forward_rest,[])

    def test_tail_ignores_unused_workshop_and_welfare_status(self):
        data = request(ready=('C05',),horizon=15,demand=1)
        for zone in ('workshop','welfare'):
            original = next(w for w in data['snapshot']['zone_windows'] if w['zone_id']==zone)
            original['ends_at'] = at(8,26)
            later = copy.deepcopy(original)
            later.update(starts_at=at(8,26),ends_at=at(10,30),status='unavailable')
            data['snapshot']['zone_windows'].append(later)
        result = solve_plan(Request.model_validate(data))
        self.assertEqual(result.useful_worker_minutes,15)
        self.assertEqual(result.recovery_reservation_end.time().isoformat(),'08:41:00')

    def test_room_choice_can_stay_constant_through_capacity_change(self):
        data = request(ready=(),horizon=3)
        outsiders = [pid for pid in catalog()['people'] if pid not in
                    {f'C{i:02d}' for i in range(2,13)} | {'P07','P08'}][:14]
        self.assertEqual(len(outsiders),14)
        a = next(w for w in data['snapshot']['zone_windows'] if w['zone_id']=='shelter_a')
        a['ends_at'] = at(8,12)
        crowded = copy.deepcopy(a); crowded.update(starts_at=at(8,12),ends_at=at(8,13),fixed_occupant_ids=outsiders)
        later = copy.deepcopy(a); later.update(starts_at=at(8,13),ends_at=at(10,30))
        data['snapshot']['zone_windows'].extend([crowded,later])
        result = solve_plan(Request.model_validate(data))
        self.assertEqual(result.planning_status,'recovery_only')
        self.assertEqual(sum(i.zone_id=='shelter_b' for i in result.intervals),1)
        self.assertEqual(len(result.intervals),11)

    def test_checker_rejects_owed_tail_without_windows(self):
        data = request(ready=('C05',),horizon=1)
        for window in data['snapshot']['zone_windows']:
            window['ends_at'] = at(8,12)
        data['snapshot']['task_windows'][0]['ends_at'] = at(8,12)
        intervals = []
        for pid in (f'C{i:02d}' for i in range(2,13)):
            working = pid == 'C05'
            intervals.append({'person_id':pid,'kind':'work' if working else 'recovery',
                              'task_id':'workshop_prep' if working else None,
                              'zone_id':'workshop' if working else 'shelter_a',
                              'starts_at':at(8,11),'ends_at':at(8,12),
                              'requires_revalidation':True})
        result = check_plan(CheckRequest.model_validate({**data,'proposed_intervals':intervals}))
        self.assertFalse(result.accepted)
        self.assertIn('rest_tail_unreserved',result.violations)

    def test_interrupted_recovery_keeps_workshop_debt(self):
        data = request()
        history = data['snapshot']['activity_history']
        history[:] = [a for a in history if a['person_id'] != 'C05']
        history.extend([
            {'evidence_id':'prior-work-C05','person_id':'C05','kind':'work',
             'task_id':'workshop_prep','zone_id':'workshop','starts_at':at(7,49),
             'ends_at':at(8,4),'recorded_at':at(8,11),'observed':True,'source':'synthetic_fixture'},
            {'evidence_id':'interruption-C05','person_id':'C05','kind':'unavailable',
             'task_id':None,'zone_id':'welfare','starts_at':at(8,4),
             'ends_at':at(8,5),'recorded_at':at(8,11),'observed':True,'source':'synthetic_fixture'},
            {'evidence_id':'post-work-rest-C05','person_id':'C05','kind':'recovery',
             'task_id':None,'zone_id':'shelter_a','starts_at':at(8,5),
             'ends_at':at(8,11),'recorded_at':at(8,11),'observed':True,'source':'synthetic_fixture'},
        ])
        proposed = []
        for pid in (f'C{i:02d}' for i in range(2,13)):
            if pid == 'C05':
                proposed.append({'person_id':pid,'kind':'work','task_id':'workshop_prep',
                                 'zone_id':'workshop','starts_at':at(8,11),'ends_at':at(8,26),
                                 'requires_revalidation':True})
                begin = at(8,26)
            else:
                begin = at(8,11)
            proposed.append({'person_id':pid,'kind':'recovery','task_id':None,
                             'zone_id':'shelter_a','starts_at':begin,'ends_at':at(9,11),
                             'requires_revalidation':True})
        result = check_plan(CheckRequest.model_validate({**data,'proposed_intervals':proposed}))
        self.assertFalse(result.accepted)
        self.assertIn('work_rest_policy:C05:0',result.violations)


if __name__ == '__main__':
    unittest.main()
