"""Focused safety boundaries for the stateless operational decisions."""
import copy
import unittest
from datetime import datetime, timedelta, timezone

from operations.contracts import Request
from operations.decisions import evaluate_heat, evaluate_protective, evaluate_restart
from operations.fixtures import readiness_record, site_inputs


TZ = timezone(timedelta(hours=4))


def at(hour=8, minute=10, second=0):
    return datetime(2025, 8, 4, hour, minute, second, tzinfo=TZ).isoformat()


def raw_request(*, twl=175.0, measured_at=None, received_at=None, decision_at=None,
                held=(), zone='civil_exposed', quality='valid', sensor='serviceable'):
    now = decision_at or at()
    measured = measured_at or now
    received = received_at or now
    return {
        'schema_version': '2.1', 'request_id': 'decision-test',
        'profile_id': 'sandline_operational_demo_v1', 'snapshot_id': 'test-snapshot',
        'decision_at': now, 'planning': None, 'restart': None, **site_inputs(),
        'snapshot': {
            'readings': [{'evidence_id': 'reading-t1', 'sensor_id': 't1',
                          'zone_id': zone, 'twl': twl, 'unit': 'W/m²',
                          'quality': quality, 'measured_at': measured,
                          'received_at': received}],
            'sensor_status': {'t1': sensor, 't2': 'serviceable', 't3': 'serviceable'},
            'held_task_ids': list(held), 'instruction': None, 'cessation': None,
            'recovery': None,
            'workers': [{'person_id': f'C{i:02d}', 'readiness': None,
                         'availability': 'available',
                         'location_id': 'shelter_a'} for i in range(2, 13)],
            'activity_history': [],
            'workshop': {'staffing_demand': {'minimum': 1, 'maximum': 4},
                         'permit_status': 'valid', 'resource_status': 'available',
                         'supervision_status': 'available'},
            'zone_windows': [], 'task_windows': [], 'incidents': [],
        },
    }


def responded(data, *, recovered=True):
    snap = data['snapshot']
    snap['instruction'] = {'evidence_id': 'instruction-1', 'alert_id': 'heat-1',
                           'issued_at': at(8, 1), 'issued_by': 'P03',
                           'acknowledged_at': at(8, 2), 'acknowledged_by': 'C01'}
    snap['cessation'] = {'evidence_id': 'cessation-1', 'confirmed_at': at(8, 3),
                         'actor_id': 'C01'}
    if recovered:
        snap['recovery'] = {'evidence_id': 'recovery-1', 'recorded_at': at(8, 4),
                            'actor_id': 'C01',
                            'person_ids': [f'C{i:02d}' for i in range(2, 13)],
                            'zone_id': 'shelter_a'}
    return data


def request(data):
    return Request.model_validate(data)


def control(heat, task):
    return next(item for item in heat.controls if item.task_id == task)


class OperationalDecisionTests(unittest.TestCase):
    def test_threshold_hold_and_recorded_hold_persist(self):
        held = evaluate_heat(request(raw_request(twl=150.0)))
        self.assertEqual(control(held, 'civil_heavy').state, 'hold_required')
        self.assertEqual(control(held, 'civil_light').state, 'no_new_hold')
        self.assertEqual(control(held, 'workshop_prep').state, 'no_new_hold')
        self.assertIn('civil_heavy', held.held_task_ids)
        self.assertEqual([a.code for a in held.actions], ['issue_hold'])

        improved = evaluate_heat(request(raw_request(twl=175.0, held=['civil_heavy'])))
        self.assertEqual(control(improved, 'civil_heavy').state, 'held')
        self.assertIn('human_restart_required', improved.clearance_blockers)
        self.assertIn('civil_heavy', improved.held_task_ids)

    def test_freshness_boundary_and_wrong_zone_do_not_clear(self):
        boundary = evaluate_heat(request(raw_request(measured_at=at(8, 5),
                                                     received_at=at(8, 5))))
        self.assertEqual(control(boundary, 'civil_heavy').state, 'no_new_hold')
        stale = evaluate_heat(request(raw_request(measured_at=at(8, 4, 59),
                                                  received_at=at(8, 10),
                                                  held=['civil_heavy'])))
        self.assertEqual(control(stale, 'civil_heavy').state, 'held')
        self.assertIn('reading_stale', stale.clearance_blockers)
        self.assertIn('gather_fresh_local_reading', [a.code for a in stale.actions])
        wrong = evaluate_heat(request(raw_request(zone='yard')))
        self.assertEqual(control(wrong, 'civil_heavy').state, 'clearance_blocked')
        self.assertIn('reading_wrong_zone', wrong.clearance_blockers)

    def test_failed_monitor_and_midday_apply_to_both_exposed_tasks(self):
        failed = evaluate_heat(request(raw_request(sensor='failed')))
        self.assertEqual({c.task_id for c in failed.controls if c.state == 'hold_required'},
                         {'civil_heavy', 'civil_light'})
        self.assertEqual(control(failed, 'workshop_prep').state, 'no_new_hold')
        start = evaluate_heat(request(raw_request(decision_at=at(12, 30),
                                                  measured_at=at(12, 30),
                                                  received_at=at(12, 30))))
        self.assertEqual({c.task_id for c in start.controls if c.state == 'hold_required'},
                         {'civil_heavy', 'civil_light'})
        end = evaluate_heat(request(raw_request(decision_at=at(15, 0),
                                                measured_at=at(15, 0),
                                                received_at=at(15, 0))))
        self.assertEqual(control(end, 'civil_heavy').state, 'no_new_hold')

    def test_acknowledgment_deadline_and_cessation_are_separate(self):
        data = raw_request(twl=150.0, decision_at=at(8, 10))
        data['snapshot']['instruction'] = {
            'evidence_id': 'instruction-1', 'alert_id': 'heat-1',
            'issued_at': at(8, 8), 'issued_by': 'P03',
            'acknowledged_at': None, 'acknowledged_by': None,
        }
        protective = evaluate_protective(request(data))
        ack = next(a for a in protective.actions if a.code == 'acknowledge_instruction')
        self.assertEqual(ack.status, 'overdue')
        self.assertIn('escalate_missing_acknowledgement', [a.code for a in protective.actions])
        self.assertIn('cessation_unconfirmed', protective.planning_blockers)
        data['snapshot']['instruction']['acknowledged_at'] = at(8, 9)
        data['snapshot']['instruction']['acknowledged_by'] = 'C01'
        acknowledged = evaluate_protective(request(data))
        self.assertNotIn('acknowledgement_missing', acknowledged.planning_blockers)
        self.assertIn('cessation_unconfirmed', acknowledged.planning_blockers)

    def test_missing_hold_instruction_and_planning_require_crew_response(self):
        held = evaluate_protective(request(raw_request(twl=150.0)))
        self.assertIn('instruction_missing', held.planning_blockers)
        self.assertIn(('issue_hold', 'P03'), [(a.code, a.owner_id) for a in held.actions])
        planned = raw_request(twl=175.0)
        planned['planning'] = {'policy_id': 'demo-work-rest-v1',
                               'starts_at': at(8, 10), 'horizon_minutes': 30}
        improved = evaluate_protective(request(planned))
        self.assertNotIn('instruction_missing', improved.planning_blockers)
        self.assertIn('cessation_unconfirmed', improved.planning_blockers)
        self.assertIn('crew_accountability_missing', improved.planning_blockers)

    def test_isolated_symptom_does_not_invent_whole_crew_heat_response(self):
        data = raw_request(twl=175.0)
        data['snapshot']['incidents'] = [{
            'evidence_id': 'incident-1', 'person_id': 'C08',
            'reported_at': at(8, 7), 'reported_by': 'C01',
            'removed_at': None, 'first_aid_contacted_at': None,
            'location_id': None, 'responder_id': 'P06',
        }]
        result = evaluate_protective(request(data))
        self.assertEqual(result.excluded_worker_ids, ['C08'])
        self.assertEqual(result.planning_blockers,
                         ['removal_unconfirmed', 'first_aid_contact_missing'])
        self.assertEqual({a.code for a in result.actions},
                         {'confirm_removal_to_first_aid', 'contact_first_aid'})

    def test_recorded_instruction_preserves_heavy_hold(self):
        data = raw_request(twl=175.0)
        data['snapshot']['instruction'] = {
            'evidence_id': 'instruction-1', 'alert_id': 'heat-1',
            'issued_at': at(8, 8), 'issued_by': 'P03',
            'acknowledged_at': None, 'acknowledged_by': None,
        }
        heat = evaluate_heat(request(data))
        self.assertEqual(control(heat, 'civil_heavy').state, 'held')
        self.assertIn('civil_heavy', heat.held_task_ids)
        self.assertIn('human_restart_required', heat.clearance_blockers)

    def test_full_cohort_accountability_and_symptom_response(self):
        data = responded(raw_request(twl=175.0, held=['civil_heavy']))
        data['snapshot']['recovery']['person_ids'].remove('C08')
        data['snapshot']['incidents'].append({
            'evidence_id': 'incident-1', 'person_id': 'C08',
            'reported_at': at(8, 7), 'reported_by': 'C01',
            'removed_at': None, 'first_aid_contacted_at': None,
            'location_id': None, 'responder_id': 'P06',
        })
        result = evaluate_protective(request(data))
        self.assertIn('C08', result.excluded_worker_ids)
        self.assertIn('crew_accountability_missing', result.planning_blockers)
        self.assertIn('removal_unconfirmed', result.planning_blockers)
        self.assertIn('first_aid_contact_missing', result.planning_blockers)
        self.assertEqual(next(a.owner_id for a in result.actions if a.code == 'contact_first_aid'), 'P06')
        data['snapshot']['workers'][6]['location_id'] = 'welfare'
        data['snapshot']['incidents'][0]['removed_at'] = at(8, 8)
        data['snapshot']['incidents'][0]['location_id'] = 'welfare'
        result = evaluate_protective(request(data))
        self.assertNotIn('crew_accountability_missing', result.planning_blockers)
        self.assertIn('C08', result.excluded_worker_ids)

    def test_restart_is_human_review_only_and_requires_current_checks(self):
        data = responded(raw_request(twl=175.0, held=['civil_heavy']))
        data['restart'] = {'proposed_at': at(), 'task_id': 'civil_heavy'}
        for name, actor in {'permit': 'P04', 'personnel': 'C01', 'recovery': 'C01',
                            'water': 'P03', 'crew_readiness': 'C01'}.items():
            data['restart'][name] = {'status': 'confirmed', 'observed_at': at(), 'actor_id': actor}
        ready = evaluate_restart(request(data))
        self.assertEqual(ready.status, 'ready_for_human_review')
        self.assertIn('civil_heavy', ready.held_task_ids)
        self.assertEqual(ready.actions[-1].owner_id, 'P02')
        old = copy.deepcopy(data)
        old['restart']['water']['observed_at'] = at(8, 4)
        blocked = evaluate_restart(request(old))
        self.assertEqual(blocked.status, 'blocked')
        self.assertIn('water_confirmation_required', blocked.blockers)
        future_proposal = copy.deepcopy(data)
        future_proposal['restart']['proposed_at'] = at(8, 11)
        self.assertIn('revalidate_at_restart_time', evaluate_restart(request(future_proposal)).blockers)

    def test_restart_checks_must_follow_later_recovery_and_readiness(self):
        data = responded(raw_request(twl=175.0, held=['civil_heavy'],
                                     decision_at=at(8, 12), measured_at=at(8, 9),
                                     received_at=at(8, 9)))
        data['snapshot']['recovery']['recorded_at'] = at(8, 11)
        data['snapshot']['workers'][0]['readiness'] = readiness_record(
            'C02', confirmed_at=at(8, 11, 30))
        data['restart'] = {'proposed_at': at(8, 12), 'task_id': 'civil_heavy'}
        for name, actor in {'permit': 'P04', 'personnel': 'C01', 'recovery': 'C01',
                            'water': 'P03', 'crew_readiness': 'C01'}.items():
            data['restart'][name] = {'status': 'confirmed', 'observed_at': at(8, 10),
                                     'actor_id': actor}
        blocked = evaluate_restart(request(data))
        self.assertEqual(blocked.status, 'blocked')
        self.assertEqual({f'{name}_confirmation_required' for name in
                          ('permit', 'personnel', 'recovery', 'water', 'crew_readiness')},
                         set(blocked.blockers))

    def test_missing_restart_has_no_actions_and_inputs_are_unchanged(self):
        data = responded(raw_request(held=['civil_heavy']))
        req = request(data)
        before = req.model_dump(mode='json')
        result = evaluate_restart(req)
        self.assertEqual(result.status, 'not_requested')
        self.assertEqual(result.actions, [])
        self.assertEqual(req.model_dump(mode='json'), before)


if __name__ == '__main__':
    unittest.main()
