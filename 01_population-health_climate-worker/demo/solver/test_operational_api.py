"""Versioned HTTP integration and source/observation boundaries."""
import copy
import math
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError

import api
from operations.contracts import (CheckRequest, ErrorResponse, HeatResponse, PlanCheckResponse,
    PlanResponse, ProtectiveResponse, Request, ResponsePlan, RestartResponse)
from operations.fixtures import canonical_request, cases, readiness_record
from operations.common import POLICY


class OperationalApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(api.app,raise_server_exceptions=False)

    def post(self,path,payload):
        return self.client.post('/v2/'+path,json=payload)

    def test_canonical_composition_and_schedule_check(self):
        payload = canonical_request(); before = copy.deepcopy(payload)
        response = self.post('response-plans/solve',payload)
        self.assertEqual(response.status_code,200,response.text)
        result = ResponsePlan.model_validate(response.json())
        self.assertFalse(result.applied)
        self.assertIn('civil_heavy',result.heat.held_task_ids)
        self.assertEqual(result.protective_response.planning_blockers,[])
        self.assertEqual(result.crew_rest.useful_worker_minutes,120)
        self.assertEqual(result.crew_rest.horizon_end.isoformat(),'2025-08-04T09:11:00+04:00')
        self.assertEqual(result.crew_rest.recovery_reservation_end,result.crew_rest.horizon_end)
        self.assertEqual(result.restart.status,'not_requested')
        checked = self.post('crew-rest/check',{**payload,
            'proposed_intervals':[i.model_dump(mode='json') for i in result.crew_rest.intervals]})
        self.assertEqual(checked.status_code,200,checked.text)
        self.assertTrue(checked.json()['accepted'],checked.text)
        self.assertEqual(payload,before)
        for model,document,mode in [(Request,payload,'validation'),(ResponsePlan,response.json(),'serialization')]:
            Draft202012Validator(model.model_json_schema(mode=mode),format_checker=FormatChecker()).validate(document)

    def test_independent_safety_operations(self):
        fixtures = cases()
        for path,name,model in [
            ('heat-controls/evaluate','heat_trigger',HeatResponse),
            ('protective-response/evaluate','unacknowledged_hold',ProtectiveResponse),
            ('restart/evaluate','restart_ready',RestartResponse)]:
            with self.subTest(path=path):
                response = self.post(path,fixtures[name])
                self.assertEqual(response.status_code,200,response.text)
                model.model_validate(response.json())
        actions = self.post('protective-response/evaluate',fixtures['unacknowledged_hold']).json()['actions']
        self.assertTrue(any(a['owner_id']=='P02' and a['status']=='overdue' for a in actions))
        ready = self.post('restart/evaluate',fixtures['restart_ready']).json()
        self.assertEqual(ready['status'],'ready_for_human_review')
        self.assertIn('civil_heavy',ready['held_task_ids'])
        for name in ('restart_stale','restart_missing_check','restart_midday','restart_future'):
            self.assertEqual(self.post('restart/evaluate',fixtures[name]).json()['status'],'blocked')

    def test_missing_policy_and_protection_do_not_invoke_optimizer(self):
        with patch('operations.planning.cp_model.CpSolver.solve',side_effect=AssertionError('must not optimise')):
            for name,status in [('missing_policy','missing_policy'),('removal_unconfirmed','blocked')]:
                response = self.post('response-plans/solve',cases()[name])
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()['crew_rest']['planning_status'],status)
                if name == 'missing_policy':
                    self.assertEqual(response.json()['crew_rest']['policy_source'],'none')
                    self.assertIsNone(response.json()['crew_rest']['timing_policy'])
                self.assertIn('civil_heavy',response.json()['heat']['held_task_ids'])

    def test_planning_failure_preserves_protective_result(self):
        with patch('operations.routes.solve_plan',side_effect=RuntimeError('private failure')):
            with self.assertLogs('operations.routes',level='ERROR'):
                response = self.post('response-plans/solve',cases()['removal_unconfirmed'])
        self.assertEqual(response.status_code,200,response.text)
        body = response.json()
        self.assertEqual(body['crew_rest']['planning_status'],'model_invalid')
        self.assertIn('C08',body['protective_response']['excluded_worker_ids'])
        self.assertTrue(body['protective_response']['actions'])
        self.assertNotIn('private failure',response.text)

    def test_v2_malformed_input_versioned_errors(self):
        mutations = [lambda r:r.update(extra='forbidden'),
                     lambda r:r['snapshot']['sensor_status'].pop('t1'),
                     lambda r:r['snapshot']['workers'][0].update(readiness=readiness_record(
                         'C02',confirmed_at='2025-08-04T08:12:00+04:00')),
                     lambda r:r['snapshot']['activity_history'][0].update(observed=False),
                     lambda r:r['snapshot']['activity_history'][0].update(ends_at='2025-08-04T08:12:00+04:00'),
                     lambda r:r['planning'].update(policy_id='unknown-policy'),
                     lambda r:r['planning'].update(horizon_minutes=True),
                     lambda r:r['planning'].update(starts_at='2025-08-04T08:12:00+04:00')]
        for index,change in enumerate(mutations):
            data=canonical_request();change(data)
            with self.subTest(index=index):
                response=self.post('crew-rest/solve',data)
                self.assertEqual(response.status_code,422,response.text)
                self.assertEqual(response.json()['schema_version'],'2.1')
                ErrorResponse.model_validate(response.json())
        response=self.client.post('/v2/heat-controls/evaluate',content=b'\xff',headers={'content-type':'application/json'})
        self.assertEqual(response.status_code,422)
        self.assertEqual(response.json()['schema_version'],'2.1')

    def test_v2_internal_error_and_v1_contract_unchanged(self):
        with patch('operations.routes.evaluate_heat',side_effect=RuntimeError('private failure')):
            response=self.post('heat-controls/evaluate',canonical_request())
        self.assertEqual(response.status_code,500)
        self.assertEqual(response.json()['schema_version'],'2.1')
        self.assertNotIn('private failure',response.text)
        response=self.client.post('/v1/allocations/solve',json={})
        self.assertEqual(response.status_code,422)
        self.assertEqual(response.json()['schema_version'],'1.0')

    def test_catalogue_and_readiness_reject_invalid_inputs(self):
        mutations = {
            'duplicate_location':lambda r:r['locations'][1].update(id='civil_exposed'),
            'negative_capacity':lambda r:r['locations'][3].update(capacity=-1),
            'boolean_capacity':lambda r:r['locations'][3].update(capacity=True),
            'unknown_worker_location':lambda r:r['snapshot']['workers'][0].update(location_id='lost_room'),
            'unknown_reading_location':lambda r:r['snapshot']['readings'][0].update(zone_id='lost_room'),
            'unknown_window_location':lambda r:r['snapshot']['zone_windows'][0].update(zone_id='lost_room'),
            'unknown_history_location':lambda r:r['snapshot']['activity_history'][0].update(zone_id='lost_room'),
            'unknown_recovery_location':lambda r:r['snapshot']['recovery'].update(zone_id='lost_room'),
            'unknown_task_location':lambda r:r['task_locations'].update(workshop_prep='lost_room'),
            'wrong_task_capability':lambda r:r['task_locations'].update(workshop_prep='yard'),
            'wrong_exposed_capability':lambda r:r['task_locations'].update(civil_light='workshop'),
            'wrong_recovery_capability':lambda r:r['locations'][4].update(capabilities=['yard']),
            'bad_supervisor':lambda r:r['snapshot']['workers'][3]['readiness'].update(confirmed_by='P02'),
            'wrong_readiness_task':lambda r:r['snapshot']['workers'][3]['readiness'].update(task_id='civil_heavy'),
            'missing_readiness_evidence':lambda r:r['snapshot']['workers'][3]['readiness'].update(evidence_id=''),
            'duplicate_readiness_evidence':lambda r:r['snapshot']['workers'][4]['readiness'].update(evidence_id='readiness-C05'),
            'reused_reading_evidence':lambda r:r['snapshot']['workers'][3]['readiness'].update(evidence_id='02_heat_alert_response_e01'),
            'future_confirmation':lambda r:r['snapshot']['workers'][3]['readiness'].update(confirmed_at='2025-08-04T08:12:00+04:00'),
            'expiry_before_confirmation':lambda r:r['snapshot']['workers'][3]['readiness'].update(valid_until='2025-08-04T08:10:00+04:00'),
            'missing_readiness_basis':lambda r:r['snapshot']['workers'][3]['readiness'].update(basis=''),
            'bad_readiness_source':lambda r:r['snapshot']['workers'][3]['readiness'].update(source='assumed'),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                data = canonical_request()
                mutate(data)
                response = self.post('crew-rest/solve',data)
                self.assertEqual(response.status_code,422,response.text)
                ErrorResponse.model_validate(response.json())

    def test_expired_readiness_is_valid_but_cannot_authorize_work(self):
        response = self.post('crew-rest/solve',cases()['expired_readiness'])
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['useful_worker_minutes'],0)

    def test_incident_uses_the_supplied_first_aid_destination(self):
        from operations.fixtures import _rename_locations
        data = _rename_locations(cases()['incident_no_substitute'], {'welfare':'aid_point_17'})
        data['planning']['horizon_minutes'] = 3
        response = self.post('response-plans/solve',data)
        self.assertEqual(response.status_code,200,response.text)
        plan = response.json()['crew_rest']
        self.assertEqual(plan['planning_status'],'planned')
        patient_intervals = [i for i in plan['intervals'] if i['person_id']=='C08']
        self.assertTrue(patient_intervals)
        self.assertTrue(all(i['kind']=='unavailable' and i['zone_id']=='aid_point_17'
                            for i in patient_intervals))
        checked = self.post('crew-rest/check',{**data,'proposed_intervals':plan['intervals']})
        self.assertTrue(checked.json()['accepted'],checked.text)

    def test_location_capacity_matches_json_schema_integer_semantics(self):
        data = canonical_request()
        data['locations'][3]['capacity'] = 6.0
        data['planning']['horizon_minutes'] = 60.0
        Draft202012Validator(Request.model_json_schema(),format_checker=FormatChecker()).validate(data)
        response = self.post('heat-controls/evaluate',data)
        self.assertEqual(response.status_code,200,response.text)
        for capacity in (True,'6',6.5):
            data['locations'][3]['capacity'] = capacity
            self.assertEqual(self.post('heat-controls/evaluate',data).status_code,422)
        data['locations'][3]['capacity'] = 6
        for horizon in (True,'60',60.5):
            data['planning']['horizon_minutes'] = horizon
            self.assertEqual(self.post('heat-controls/evaluate',data).status_code,422)

    def test_supplied_and_registered_policy_resolution(self):
        supplied = canonical_request()
        supplied['timing_policy']['id'] = 'site-specific-timing'
        supplied['planning']['policy_id'] = None
        response = self.post('crew-rest/solve',supplied)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['policy_id'],'site-specific-timing')
        self.assertEqual(response.json()['policy_source'],'supplied')
        self.assertEqual(response.json()['timing_policy'],supplied['timing_policy'])

        registered = canonical_request()
        registered['timing_policy'] = None
        response = self.post('crew-rest/solve',registered)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['policy_source'],'registered')
        self.assertEqual(response.json()['policy_id'],POLICY['id'])
        self.assertEqual(response.json()['timing_policy'],{key:POLICY[key] for key in
            ('id','initial_recovery_minutes','max_work_minutes','between_work_recovery_minutes')})

        unknown = canonical_request()
        unknown['timing_policy'] = None
        unknown['planning']['policy_id'] = 'unregistered'
        mismatch = canonical_request()
        mismatch['planning']['policy_id'] = 'different-id'
        for data in (unknown,mismatch):
            self.assertEqual(self.post('crew-rest/solve',data).status_code,422)

    def test_supplied_policy_value_bounds_and_types(self):
        fields = {'initial_recovery_minutes':(0,120,-1,121),
                  'max_work_minutes':(1,120,0,121),
                  'between_work_recovery_minutes':(1,120,0,121)}
        for field,(minimum,maximum,below,above) in fields.items():
            for value in (minimum,maximum,float(minimum),float(maximum)):
                with self.subTest(field=field,valid=value):
                    data = canonical_request()
                    data['timing_policy'][field] = value
                    Draft202012Validator(Request.model_json_schema(),format_checker=FormatChecker()).validate(data)
                    self.assertEqual(Request.model_validate(data).timing_policy.model_dump()[field],int(value))
            for value in (below,above,True,str(minimum),minimum+0.5):
                with self.subTest(field=field,invalid=value):
                    data = canonical_request()
                    data['timing_policy'][field] = value
                    self.assertEqual(self.post('heat-controls/evaluate',data).status_code,422)
            for value in (math.inf,-math.inf,math.nan):
                data = canonical_request()
                data['timing_policy'][field] = value
                with self.assertRaises(ValidationError):
                    Request.model_validate(data)
        data = canonical_request()
        data['timing_policy']['code'] = 'return true'
        self.assertEqual(self.post('crew-rest/solve',data).status_code,422)
        for bad_id in ('',True,'bad policy id'):
            data = canonical_request()
            data['timing_policy']['id'] = bad_id
            self.assertEqual(self.post('heat-controls/evaluate',data).status_code,422)
        data = canonical_request()
        data['timing_policy'].update(initial_recovery_minutes=6.0,
            max_work_minutes=15.0,between_work_recovery_minutes=15.0)
        response = self.post('crew-rest/solve',data)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['timing_policy'],canonical_request()['timing_policy'])

    def test_policy_values_change_fingerprint_with_same_id(self):
        original = canonical_request()
        first = self.post('crew-rest/solve',original)
        changed = canonical_request()
        changed['timing_policy']['max_work_minutes'] = 14
        second = self.post('crew-rest/solve',changed)
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual(second.status_code,200,second.text)
        self.assertEqual(first.json()['policy_id'],second.json()['policy_id'])
        self.assertNotEqual(first.json()['input_fingerprint'],second.json()['input_fingerprint'])
        self.assertEqual(second.json()['timing_policy']['max_work_minutes'],14)

    def test_registered_policy_fingerprint_covers_effective_values(self):
        from operations.common import effective_timing_policy, metadata
        data = canonical_request()
        data['timing_policy'] = None
        request = Request.model_validate(data)
        original = metadata(request)['input_fingerprint']
        with patch.dict('operations.common.POLICY',{'max_work_minutes':14}):
            self.assertEqual(effective_timing_policy(request).max_work_minutes,14)
            self.assertNotEqual(metadata(request)['input_fingerprint'],original)

    def test_no_planning_has_no_effective_policy_source(self):
        data = canonical_request()
        data['planning'] = None
        response = self.post('crew-rest/solve',data)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['policy_source'],'none')
        self.assertIsNone(response.json()['timing_policy'])
        self.assertIsNone(response.json()['policy_id'])

    def test_human_readiness_evidence_is_auditable(self):
        data = canonical_request()
        data['snapshot']['workers'][3]['readiness']['source'] = 'human_confirmation'
        response = self.post('crew-rest/solve',data)
        self.assertEqual(response.status_code,200,response.text)
        self.assertIn('readiness-C05',response.json()['evidence_ids'])
        original = self.post('crew-rest/solve',canonical_request())
        self.assertNotEqual(response.json()['input_fingerprint'],original.json()['input_fingerprint'])

    def test_all_six_routes_have_typed_openapi(self):
        paths=self.client.get('/openapi.json').json()['paths']
        for path in ('heat-controls/evaluate','protective-response/evaluate','crew-rest/solve',
                     'crew-rest/check','restart/evaluate','response-plans/solve'):
            operation=paths['/v2/'+path]['post']
            self.assertIn('$ref',operation['requestBody']['content']['application/json']['schema'])
            self.assertIn('$ref',operation['responses']['200']['content']['application/json']['schema'])
            self.assertIn('422',operation['responses'])
            self.assertIn('500',operation['responses'])


if __name__=='__main__': unittest.main()
