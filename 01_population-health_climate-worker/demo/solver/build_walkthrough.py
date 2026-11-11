"""Capture real HTTP solver results and embed them in the HTML walkthrough."""
import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from jsonschema import Draft202012Validator, FormatChecker

from inputs import prepare_problem, read, require

ROOT = Path(__file__).resolve().parent
LABELS = {
    'readiness_missing': ('Recovery confirmed, readiness unknown', 'No productive assignment until the relevant prerequisites are confirmed.'),
    'canonical': ('Four ready workers, four places', 'The canonical independent recommendation; compare to the later authored assignment.'),
    'two_ready': ('Only two workers ready', 'Available seats do not establish readiness for the task.'),
    'eight_ready': ('Eight ready, four places', 'Capacity and useful staffing cap the allocation; worker ID breaks equivalent choices.'),
    'extra_occupant': ('One more existing occupant', 'P01 occupies a third fixed workshop place, leaving three places.'),
    'demand_two': ('Useful work for only two', 'Free seats do not imply useful work for everyone.'),
    'permit_unavailable': ('Workshop permit unavailable', 'A mandatory prerequisite blocks productive assignment.'),
    'supervision_unavailable': ('Shared supervision unavailable', 'The workshop cannot start; original new-starter supervision remains intact.'),
    'symptom_no_substitute': ('Worker removed, no ready substitute', 'C08 moves to welfare with P06 contacted; no medical outcome is inferred.'),
    'symptom_substitute': ('Worker removed, substitute confirmed', 'C09 has a separate readiness confirmation and can replace unavailable C08.'),
    'whole_crew': ('Whole-crew proposal rejected', 'Check rejects fourteen workers; a separate solve call proposes a four-worker replacement.'),
    'improved_reading': ('Reading improves, hold remains', 'A new TWL reading does not authorise a restart.'),
}


def request_for_case(data, case):
    problem = prepare_problem(data, case['id'])
    context = problem['context']
    snapshot = next(s for s in data['snapshots'] if s['id'] == case['snapshot_id'])
    facts = snapshot['facts'] + case['facts']
    known = {fact['kind'] for fact in facts}
    workshop = {
        'fixed_occupant_ids': problem['state']['occupancy']['workshop'],
        'staffing_demand': {'minimum': 1, 'maximum': context['demand']},
        'permit_status': 'valid' if context['permit'] else 'unavailable' if 'permit' in known else 'unknown',
        'resource_status': 'available' if context['resources'] else 'unavailable' if 'resources' in known else 'unknown',
        'supervision_status': 'available' if context['supervision'] else 'unavailable' if 'supervision' in known else 'unknown',
    }
    request = {
        'schema_version': '1.0', 'request_id': f"walkthrough-{case['id']}",
        'profile_id': 'sandline_demo_v1', 'decision_at': problem['decision_at'],
        'workers': [{'person_id': pid,
                     'readiness': 'unknown' if pid not in context['readiness'] else
                                  'ready' if context['readiness'][pid] else 'not_ready',
                     'availability': 'unavailable' if pid in context['unavailable'] else 'available'}
                    for pid in context['candidate_pool']],
        'workshop': workshop,
        'incidents': [{'person_id': pid, 'location_id': 'welfare',
                       'responder_id': contact['responder_id'], 'responder_status': contact['status']}
                      for pid, contact in context['response'].items()],
        'civil_measurement': None,
    }
    if any(fact['kind'] == 'reading' for fact in facts):
        reading = problem['state']['readings']['civil_exposed']
        request['civil_measurement'] = {'sensor_id': reading['sensor_id'], 'zone_id': 'civil_exposed',
            'twl': reading['twl'], 'measured_at': reading['at'], 'unit': 'W/m²', 'quality': 'valid'}
    return request


def capture(base_url):
    data = read(ROOT / 'dataset.json')
    schemas = {name.replace('.', '_'): read(ROOT / 'schemas' / f'{name}.schema.json')
               for name in ('solve.request', 'solve.response', 'check.request', 'check.response', 'error.response')}
    records = []
    with httpx.Client(base_url=base_url, timeout=15) as client:
        for case in data['cases']:
            request = request_for_case(data, case)
            check = dict(request, proposed_worker_ids=case['proposal'])
            responses = {}
            for operation, body in [('solve', request), ('check', check)]:
                Draft202012Validator(schemas[f'{operation}_request'], format_checker=FormatChecker()).validate(body)
                response = client.post(f'/v1/allocations/{operation}', json=body)
                response.raise_for_status()
                result = response.json()
                Draft202012Validator(schemas[f'{operation}_response'], format_checker=FormatChecker()).validate(result)
                require(result['applied'] is False, 'solver response claims an action was applied')
                require('civil_heavy' in result['held_task_ids'], 'heat hold was lost')
                responses[operation] = result
            solve, checked, expected = responses['solve'], responses['check'], case['expected']
            require(solve['solver']['status'] == 'OPTIMAL', 'captured optimum not established')
            require(checked['accepted'] == expected['accepted'], f"{case['id']}: proposal mismatch")
            if expected['accepted']:
                require(solve['allocation']['worker_ids'] == expected['assignees'], 'allocation mismatch')
                require(sorted(solve['allocation']['projected_occupancy']['shelter_a']) == sorted(expected['recovery']),
                        'recovery accounting mismatch')
                require(sorted(solve['allocation']['projected_occupancy']['workshop']) == sorted(expected['workshop_occupants']),
                        'workshop accounting mismatch')
            else:
                require(sorted(checked['violations']) == sorted(expected['blockers']), 'rejection mismatch')
                require(solve['allocation']['worker_ids'] == ['C05', 'C06', 'C07', 'C08'], 'replacement mismatch')
            require(solve['unavailable_worker_ids'] == expected['unavailable'], 'welfare accounting mismatch')
            label, description = LABELS[case['id']]
            records.append({'id': case['id'], 'label': label, 'description': description,
                            'solve_request': request, 'solve_response': solve,
                            'check_request': check, 'check_response': checked})
    require(len(records) == 12, 'expected all twelve scenario branches')
    return {'verified_at': datetime.now(ZoneInfo('Australia/Sydney')).isoformat(timespec='seconds'),
            'profile_id': 'sandline_demo_v1', 'cases': records, 'schema': schemas,
            'verification': {'case_count': len(records), 'transport': 'HTTP',
                             'source': 'Actual local solver responses, checked against synthetic fixtures'}}


def embed(document, evidence):
    encoded = json.dumps(evidence, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    pattern = r'(<script\b[^>]*\bid="verified-data"[^>]*>).*?(</script>)'
    require(len(re.findall(pattern, document, flags=re.DOTALL)) == 1, 'expected one evidence block')
    return re.sub(pattern, lambda match: match[1] + encoded + match[2], document, flags=re.DOTALL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8765')
    args = parser.parse_args()
    evidence = capture(args.base_url)
    html = ROOT / 'walkthrough.html'
    document = embed(html.read_text(), evidence)
    (ROOT / 'walkthrough-results.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n')
    html.write_text(document)
    print('PASS: 24 real HTTP calls captured; 12 scenario branches verified and embedded in HTML')


if __name__ == '__main__':
    main()
