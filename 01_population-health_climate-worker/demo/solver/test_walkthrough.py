"""Check that the HTML's evidence is real, complete and schema-valid."""
import json
import re
import unittest

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker

import api
from build_walkthrough import ROOT, embed
from inputs import read


class WalkthroughTests(unittest.TestCase):
    def test_served_html_embeds_verified_requests_and_responses(self):
        client = TestClient(api.app)
        response = client.get('/walkthrough')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/html', response.headers['content-type'])
        match = re.search(r'<script\b[^>]*\bid="verified-data"[^>]*>(.*?)</script>', response.text, re.DOTALL)
        self.assertIsNotNone(match)
        evidence = json.loads(match[1])
        self.assertEqual(evidence, read(ROOT / 'walkthrough-results.json'))
        self.assertEqual(evidence['verification']['case_count'], 12)
        self.assertEqual(evidence['verification']['transport'], 'HTTP')
        self.assertEqual(len(evidence['cases']), 12)
        for case in evidence['cases']:
            for operation in ('solve', 'check'):
                for direction in ('request', 'response'):
                    key = f'{operation}_{direction}'
                    schema = evidence['schema'][key]
                    Draft202012Validator(schema, format_checker=FormatChecker()).validate(case[key])
                result = case[f'{operation}_response']
                replayed = client.post(f'/v1/allocations/{operation}', json=case[f'{operation}_request'])
                self.assertEqual(replayed.status_code, 200, replayed.text)
                self.assertEqual(replayed.json(), result, f"stale captured response: {case['id']} {operation}")
                self.assertFalse(result['applied'])
                self.assertIn('civil_heavy', result['held_task_ids'])
            solved = case['solve_response']
            self.assertEqual(solved['solver']['status'], 'OPTIMAL')
            selected = set(solved['allocation']['worker_ids'])
            places = solved['allocation']['projected_occupancy']
            self.assertEqual(selected | set(places['shelter_a']) | set(places['welfare']),
                             {f'C{i:02d}' for i in range(2, 13)})
            self.assertLessEqual(len(places['workshop']), 6)
        whole = next(case for case in evidence['cases'] if case['id'] == 'whole_crew')
        self.assertFalse(whole['check_response']['accepted'])
        self.assertEqual(whole['solve_response']['allocation']['worker_ids'], ['C05', 'C06', 'C07', 'C08'])

    def test_embedding_cannot_close_evidence_script(self):
        document = '<script type="application/json" id="verified-data">old</script>'
        evidence = {'text': '</script><script>window.injected=true</script>'}
        result = embed(document, evidence)
        self.assertEqual(result.count('</script>'), 1)
        self.assertEqual(json.loads(result.split('>', 1)[1].rsplit('</script>', 1)[0]), evidence)


if __name__ == '__main__':
    unittest.main()
