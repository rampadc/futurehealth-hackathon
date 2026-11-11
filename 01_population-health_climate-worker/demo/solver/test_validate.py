"""Adversarial checks for the dataset's information and allocation boundaries."""
import copy
import unittest

from jsonschema import ValidationError

import validate as fixture


class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture.read(fixture.ROOT / 'dataset.json')

    def case(self, name):
        return next(c for c in self.data['cases'] if c['id'] == name)

    def snapshot(self):
        return next(s for s in self.data['snapshots'] if s['id'] == 'canonical_081030')

    def fact(self, kind):
        return next(f for f in self.snapshot()['facts'] if f['kind'] == kind)

    def rejected(self):
        with self.assertRaises((ValueError, ValidationError, AssertionError)):
            fixture.validate(self.data)

    def test_complete_dataset(self):
        results = fixture.validate(self.data)
        self.assertEqual(len(results), 12)
        self.assertEqual(results['canonical']['assignments']['workshop_prep'], ['C05', 'C06', 'C07', 'C08'])
        self.assertEqual(results['canonical']['task_status']['civil_heavy'], 'held')

    def test_future_recorded_confirmation(self):
        self.fact('readiness')['recorded_at'] = '2025-08-04T08:11:00+04:00'
        self.rejected()

    def test_empty_snapshot_cannot_precede_original_recovery(self):
        snapshot = next(s for s in self.data['snapshots'] if s['id'] == 'recovery_0804')
        snapshot['decision_at'] = '2025-08-04T08:03:00+04:00'
        self.case('readiness_missing')['decision_at'] = snapshot['decision_at']
        self.rejected()

    def test_future_occurrence(self):
        self.fact('readiness')['occurred_at'] = '2025-08-04T08:11:00+04:00'
        self.rejected()

    def test_branch_cannot_rewrite_snapshot_past(self):
        self.case('eight_ready')['facts'][0]['occurred_at'] = '2025-08-04T08:09:00+04:00'
        self.rejected()

    def test_attendance_not_readiness(self):
        self.snapshot()['facts'].remove(self.fact('readiness'))
        self.rejected()

    def test_wrong_readiness_authority(self):
        self.fact('readiness')['actor_id'] = 'P01'
        self.rejected()

    def test_wrong_task_permit(self):
        self.fact('permit')['payload']['permit_id'] = 'permit_civil_01'
        self.rejected()

    def test_no_supervision_approval(self):
        self.fact('supervision')['payload']['approved_by'] = 'C01'
        self.rejected()

    def test_wrong_sensor(self):
        self.case('improved_reading')['facts'][0]['payload']['sensor_id'] = 't2'
        self.rejected()

    def test_overcrowded_proposal(self):
        self.case('extra_occupant')['proposal'].append('C08')
        self.rejected()

    def test_unknown_reference(self):
        self.fact('readiness')['payload']['person_ids'].append('C99')
        self.rejected()

    def test_duplicate_fact_id(self):
        self.snapshot()['facts'].append(copy.deepcopy(self.snapshot()['facts'][-1]))
        self.rejected()

    def test_wrong_projected_recovery_count(self):
        self.case('canonical')['expected']['recovery'].remove('C09')
        self.rejected()

    def test_symptomatic_worker_not_available(self):
        case = self.case('symptom_substitute')
        case['proposal'] = ['C05', 'C06', 'C07', 'C08']
        case['expected']['assignees'] = list(case['proposal'])
        self.rejected()

    def test_schema_disallows_unmarked_fact(self):
        self.fact('readiness')['synthetic'] = False
        self.rejected()

    def test_schema_disallows_medical_clearance_claim(self):
        self.fact('readiness')['payload']['medical_clearance'] = True
        self.rejected()

    def test_expected_plan_not_silently_optional(self):
        self.case('canonical')['proposal'] = []
        self.case('canonical')['expected']['assignees'] = []
        self.rejected()


if __name__ == '__main__':
    unittest.main()
