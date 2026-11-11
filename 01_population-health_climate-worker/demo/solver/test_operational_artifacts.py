"""Keep exported contracts, captured projections and their examples reviewable."""
import json
import unittest

from build_operational_demo import ROOT, MODELS, ROUTES
from jsonschema import Draft202012Validator, FormatChecker
from operations.common import metadata
from operations.contracts import CheckRequest, PlanResponse, Request, ResponsePlan
from operations.planning import check_plan
from operations.fixtures import cases


class OperationalArtifactTests(unittest.TestCase):
    def test_custom_policy_http_examples(self):
        for name in ('alternate_timing_policy','long_recovery_policy','zero_initial_recovery'):
            with self.subTest(case=name):
                request = json.loads((ROOT/'operations'/'examples'/f'crew-rest.{name}.request.json').read_text())
                response = json.loads((ROOT/'operations'/'examples'/f'crew-rest.{name}.response.json').read_text())
                for document, schema in [(request,'request'),(response,'crew-rest.response')]:
                    exported = json.loads((ROOT/'operations'/'schemas'/f'{schema}.schema.json').read_text())
                    Draft202012Validator(exported,format_checker=FormatChecker()).validate(document)
                plan = PlanResponse.model_validate(response)
                self.assertEqual(plan.policy_source,'supplied')
                self.assertEqual(plan.timing_policy.model_dump(),request['timing_policy'])
                self.assertEqual(plan.input_fingerprint,metadata(Request.model_validate(request))['input_fingerprint'])
                checked = check_plan(CheckRequest.model_validate({**request,'proposed_intervals':response['intervals']}))
                self.assertTrue(checked.accepted,checked.violations)

    def test_exported_contracts_and_examples_match_models(self):
        for name, (model, mode) in MODELS.items():
            expected = model.model_json_schema(mode=mode)
            expected['$schema'] = 'https://json-schema.org/draft/2020-12/schema'
            actual = json.loads((ROOT/'operations'/'schemas'/f'{name}.schema.json').read_text())
            self.assertEqual(actual, expected, name)
        for route, (_path, response_schema) in ROUTES.items():
            for suffix, schema in [('request', 'check.request' if route=='crew-rest.check' else 'request'),
                                   ('response', response_schema)]:
                document = json.loads((ROOT/'operations'/'examples'/f'{route}.{suffix}.json').read_text())
                exported = json.loads((ROOT/'operations'/'schemas'/f'{schema}.schema.json').read_text())
                Draft202012Validator(exported, format_checker=FormatChecker()).validate(document)

    def test_captured_evidence_and_every_projected_minute(self):
        evidence = json.loads((ROOT/'operational-results.json').read_text())
        self.assertEqual({record['case_id'] for record in evidence['cases']},set(cases()))
        for record in evidence['cases']:
            with self.subTest(case=record['case_id']):
                request = Request.model_validate(record['request'])
                response = ResponsePlan.model_validate(record['response'])
                self.assertEqual(response.input_fingerprint, metadata(request)['input_fingerprint'])
                expected_readiness = {w.readiness.evidence_id for w in request.snapshot.workers
                                      if w.readiness is not None}
                self.assertTrue(expected_readiness <= set(response.evidence_ids))
                self.assertFalse(response.applied)
                plan = response.crew_rest
                if plan.solver_status in ('OPTIMAL', 'FEASIBLE'):
                    checked = check_plan(CheckRequest.model_validate({**record['request'],
                        'proposed_intervals':[i.model_dump(mode='json') for i in plan.intervals]}))
                    self.assertTrue(checked.accepted, checked.violations)


if __name__ == '__main__':
    unittest.main()
