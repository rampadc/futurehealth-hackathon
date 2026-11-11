"""Exercise the HTTP contract independently of CLI or preset selection."""
import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker
from ortools.sat.python import cp_model

import api
import inputs

ROOT = Path(__file__).resolve().parent


class HttpContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(api.app, raise_server_exceptions=False)
        cls.canonical = inputs.read(ROOT / 'examples/solve.request.json')

    def post(self, request, endpoint='solve'):
        return self.client.post(f'/v1/allocations/{endpoint}', json=request)

    def test_canonical_and_schema_validation(self):
        response = self.post(self.canonical)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['allocation']['worker_ids'], ['C05', 'C06', 'C07', 'C08'])
        self.assertEqual(body['allocation']['projected_task_status']['civil_heavy'], 'held')
        self.assertEqual(len(body['allocation']['projected_occupancy']['shelter_a']), 7)
        self.assertFalse(body['applied'])
        self.assertEqual(body['solver']['status'], 'OPTIMAL')
        self.assertEqual(body['request_id'], self.canonical['request_id'])
        for name, payload in [('solve.request', self.canonical), ('solve.response', body)]:
            schema = inputs.read(ROOT / 'schemas' / f'{name}.schema.json')
            Draft202012Validator.check_schema(schema)
            Draft202012Validator(schema, format_checker=FormatChecker()).validate(payload)

    def test_all_fixture_cases_through_http(self):
        data = inputs.read(ROOT / 'dataset.json')
        for case in data['cases']:
            with self.subTest(case=case['id']):
                p = inputs.prepare_problem(data, case['id'])
                c = p['context']
                request = copy.deepcopy(self.canonical)
                request['request_id'] = case['id']
                request['decision_at'] = p['decision_at']
                request['workers'] = [
                    {'person_id': pid,
                     'readiness': 'unknown' if pid not in c['readiness'] else
                                  'ready' if c['readiness'][pid] else 'not_ready',
                     'availability': 'unavailable' if pid in c['unavailable'] else 'available'}
                    for pid in c['candidate_pool']]
                w = request['workshop']
                w['fixed_occupant_ids'] = p['state']['occupancy']['workshop']
                w['staffing_demand']['maximum'] = c['demand']
                for field, key in [('permit_status', 'permit'), ('resource_status', 'resources'),
                                   ('supervision_status', 'supervision')]:
                    w[field] = ('valid' if key == 'permit' else 'available') if c[key] else 'unavailable'
                request['incidents'] = [{'person_id': pid, 'location_id': 'welfare',
                                         'responder_id': c['response'][pid]['responder_id'],
                                         'responder_status': c['response'][pid]['status']}
                                        for pid in c['unavailable']]
                if case['id'] == 'improved_reading':
                    reading = p['state']['readings']['civil_exposed']
                    request['civil_measurement'] = {'sensor_id': reading['sensor_id'],
                        'zone_id': 'civil_exposed', 'twl': reading['twl'],
                        'measured_at': reading['at'], 'unit': 'W/m²', 'quality': 'valid'}
                response = self.post(request)
                self.assertEqual(response.status_code, 200, response.text)
                body = response.json()
                self.assertEqual(body['solver']['status'], 'OPTIMAL')
                expected = case['expected']
                selected = expected['assignees'] if expected['accepted'] else ['C05', 'C06', 'C07', 'C08']
                self.assertEqual(body['allocation']['worker_ids'], selected)
                request['proposed_worker_ids'] = case['proposal']
                checked = self.post(request, 'check')
                self.assertEqual(checked.status_code, 200, checked.text)
                self.assertEqual(checked.json()['accepted'], expected['accepted'])

    def test_callers_change_structured_fields(self):
        request = copy.deepcopy(self.canonical)
        request['workshop']['staffing_demand']['maximum'] = 2
        response = self.post(request)
        self.assertEqual(response.json()['allocation']['worker_ids'], ['C05', 'C06'])
        request['workshop']['permit_status'] = 'unknown'
        response = self.post(request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['allocation']['worker_ids'], [])
        self.assertIn('permit', response.json()['diagnostics']['missing_prerequisites'])

    def test_check_contract_and_suboptimal_proposal(self):
        request = inputs.read(ROOT / 'examples/check.request.json')
        response = self.post(request, 'check')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()['accepted'])
        self.assertIn('capacity', response.json()['violations'])
        request['proposed_worker_ids'] = ['C05']
        response = self.post(request, 'check')
        self.assertTrue(response.json()['accepted'])
        self.assertEqual(response.json()['optimality'], 'not_evaluated')
        for name, payload in [('check.request', request), ('check.response', response.json())]:
            schema = inputs.read(ROOT / 'schemas' / f'{name}.schema.json')
            Draft202012Validator(schema, format_checker=FormatChecker()).validate(payload)

    def test_malformed_inputs_and_domain_errors_use_one_contract(self):
        mutations = [
            lambda r: r.update(context={'permit': True}),
            lambda r: r.update(expected={'worker_ids': ['C12']}),
            lambda r: r.update(profile_id='other_site'),
            lambda r: r['workshop']['staffing_demand'].update(maximum=True),
            lambda r: r['workshop']['staffing_demand'].update(maximum='4'),
            lambda r: r['workshop']['staffing_demand'].update(maximum=4.5),
            lambda r: r['workers'][0].update(readiness='probably_ready'),
            lambda r: r['workers'].pop(),
            lambda r: r['workers'][0].update(person_id='C99'),
            lambda r: r['workers'][0].update(person_id='C03'),
            lambda r: r['workers'][0].update(availability='unavailable'),
            lambda r: r['workshop'].update(fixed_occupant_ids=['P07']),
            lambda r: r['workshop'].update(fixed_occupant_ids=['P07', 'P08', 'C01']),
            lambda r: r.update(decision_at='2025-08-04T08:03:00+04:00'),
            lambda r: r.update(decision_at='2025-08-04T08:10:45'),
        ]
        for index, change in enumerate(mutations):
            with self.subTest(mutation=index):
                request = copy.deepcopy(self.canonical)
                change(request)
                response = self.post(request)
                self.assertEqual(response.status_code, 422, response.text)
                body = response.json()
                self.assertEqual(body['error']['code'], 'INVALID_REQUEST')
                schema = inputs.read(ROOT / 'schemas/error.response.schema.json')
                Draft202012Validator(schema).validate(body)
        response = self.client.post('/v1/allocations/solve', content='{',
                                    headers={'content-type': 'application/json'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['error']['code'], 'INVALID_REQUEST')

    def test_unknown_solver_status_has_no_allocation(self):
        with patch('solve._solve_model', return_value=(cp_model.UNKNOWN, None)):
            response = self.post(self.canonical)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['solver']['status'], 'UNKNOWN')
        self.assertIsNone(response.json()['allocation'])

    def test_integral_json_numbers_and_rfc3339_case(self):
        request = copy.deepcopy(self.canonical)
        request['workshop']['staffing_demand'] = {'minimum': 1.0, 'maximum': 4.0}
        request['decision_at'] = '2025-08-04t08:10:45+04:00'
        response = self.post(request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['allocation']['worker_ids'], ['C05', 'C06', 'C07', 'C08'])

    def test_invalid_utf8_uses_versioned_error_contract(self):
        for content in (b'\xff', b'{"request_id":"\xff"}'):
            response = self.client.post('/v1/allocations/solve', content=content,
                                        headers={'content-type': 'application/json'})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()['error']['code'], 'INVALID_REQUEST')

    def test_source_failures_are_internal_errors(self):
        with patch('api._source', side_effect=ValueError('private corrupted source detail')):
            response = self.post(self.canonical)
        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(response.json()['error']['code'], 'INTERNAL_ERROR')
        self.assertNotIn('private corrupted source detail', response.text)

    def test_supplied_measurement_must_follow_source_cutoff_even_when_identical(self):
        for measured_at in ('2025-08-04T08:00:00+04:00', '2025-08-04T08:11:00+04:00'):
            request = copy.deepcopy(self.canonical)
            request['civil_measurement'] = {'sensor_id': 't1', 'zone_id': 'civil_exposed',
                'twl': 145, 'measured_at': measured_at, 'unit': 'W/m²', 'quality': 'valid'}
            response = self.post(request)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()['error']['code'], 'INVALID_REQUEST')

    def test_internal_errors_are_structured_and_do_not_disclose_traceback(self):
        with patch('solve._solve_model', side_effect=RuntimeError('private internal detail')):
            response = self.post(self.canonical)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()['error']['code'], 'INTERNAL_ERROR')
        self.assertNotIn('private internal detail', response.text)

    def test_openapi_and_saved_contracts_agree(self):
        response = self.client.get('/openapi.json')
        self.assertEqual(response.status_code, 200)
        document = response.json()
        for path in ('/v1/allocations/solve', '/v1/allocations/check'):
            operation = document['paths'][path]['post']
            self.assertIn('$ref', operation['requestBody']['content']['application/json']['schema'])
            self.assertIn('422', operation['responses'])
            self.assertIn('500', operation['responses'])
        self.assertEqual(self.client.get('/docs').status_code, 404)
        for model, filename, mode in [
            (api.SolveRequest, 'solve.request', 'validation'),
            (api.CheckRequest, 'check.request', 'validation'),
            (api.SolveResponse, 'solve.response', 'serialization'),
            (api.CheckResponse, 'check.response', 'serialization'),
            (api.ErrorResponse, 'error.response', 'serialization')]:
            self.assertEqual(model.model_json_schema(mode=mode),
                             inputs.read(ROOT / 'schemas' / f'{filename}.schema.json'))


if __name__ == '__main__':
    unittest.main()
