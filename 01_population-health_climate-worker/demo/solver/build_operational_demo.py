"""Export v2 contracts and capture the synthetic operational demo over HTTP."""

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from jsonschema import Draft202012Validator, FormatChecker

from operations.contracts import (
    CheckRequest, ErrorResponse, HeatResponse, PlanCheckResponse, PlanResponse,
    ProtectiveResponse, Request, ResponsePlan, RestartResponse, TimingPolicy,
)
from operations.fixtures import cases

ROOT = Path(__file__).resolve().parent
SCHEMAS = ROOT / 'operations' / 'schemas'
EXAMPLES = ROOT / 'operations' / 'examples'
MODELS = {
    'timing-policy': (TimingPolicy, 'validation'),
    'request': (Request, 'validation'),
    'check.request': (CheckRequest, 'validation'),
    'heat.response': (HeatResponse, 'serialization'),
    'protective.response': (ProtectiveResponse, 'serialization'),
    'crew-rest.response': (PlanResponse, 'serialization'),
    'check.response': (PlanCheckResponse, 'serialization'),
    'restart.response': (RestartResponse, 'serialization'),
    'response-plan.response': (ResponsePlan, 'serialization'),
    'error.response': (ErrorResponse, 'serialization'),
}
ROUTES = {
    'heat-controls.evaluate': ('/v2/heat-controls/evaluate', 'heat.response'),
    'protective-response.evaluate': ('/v2/protective-response/evaluate', 'protective.response'),
    'crew-rest.solve': ('/v2/crew-rest/solve', 'crew-rest.response'),
    'crew-rest.check': ('/v2/crew-rest/check', 'check.response'),
    'restart.evaluate': ('/v2/restart/evaluate', 'restart.response'),
    'response-plans.solve': ('/v2/response-plans/solve', 'response-plan.response'),
}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def export_schemas():
    schemas = {}
    for name, (model, mode) in MODELS.items():
        schema = model.model_json_schema(mode=mode)
        schema['$schema'] = 'https://json-schema.org/draft/2020-12/schema'
        Draft202012Validator.check_schema(schema)
        schemas[name] = schema
        write_json(SCHEMAS / f'{name}.schema.json', schema)
    return schemas


def validate(schemas, name, value):
    Draft202012Validator(schemas[name], format_checker=FormatChecker()).validate(value)


def post(client, schemas, path, request, response_schema):
    validate(schemas, 'check.request' if path.endswith('/check') else 'request', request)
    reply = client.post(path, json=request)
    response = reply.json()
    validate(schemas, response_schema if reply.status_code == 200 else 'error.response', response)
    if reply.status_code != 200:
        raise RuntimeError(f'{path}: HTTP {reply.status_code}: {response["error"]["message"]}')
    if response['applied'] is not False:
        raise RuntimeError(f'{path}: response claims to apply an operational action')
    return response, reply.status_code


def check_returned_plan(client, schemas, request, plan, case_id):
    if plan['solver_status'] not in ('OPTIMAL', 'FEASIBLE'):
        return
    proposed = dict(request, proposed_intervals=plan['intervals'])
    checked, _ = post(client, schemas, '/v2/crew-rest/check', proposed, 'check.response')
    if not checked['accepted']:
        raise RuntimeError(f'{case_id}: returned plan rejected by /v2/crew-rest/check: {checked["violations"]}')


def check_case_semantics(case_id, response):
    heat, plan, restart = response['heat'], response['crew_rest'], response['restart']
    if case_id not in ('wrong_zone', 'symptoms_without_heat_hold') and (
            'civil_heavy' not in heat['held_task_ids'] or 'civil_heavy' not in plan['held_task_ids']):
        raise RuntimeError(f'{case_id}: civil heat hold was lost')
    if case_id == 'canonical_timed':
        if plan['planning_status'] != 'planned' or plan['useful_worker_minutes'] != 120:
            raise RuntimeError('canonical_timed: expected 120 useful worker-minutes')
        tours = [(i['kind'], i['starts_at'][11:19], i['ends_at'][11:19])
                 for i in plan['intervals'] if i['person_id'] == 'C05']
        expected = [('work', '08:11:00', '08:26:00'),
                    ('recovery', '08:26:00', '08:41:00'),
                    ('work', '08:41:00', '08:56:00'),
                    ('recovery', '08:56:00', '09:11:00')]
        if tours[:4] != expected:
            raise RuntimeError(f'canonical_timed: unexpected C05 tours: {tours}')
    if case_id == 'eight_ready' and plan['useful_worker_minutes'] != 240:
        raise RuntimeError('eight_ready: expected 240 useful worker-minutes')
    if case_id == 'missing_policy' and plan['planning_status'] != 'missing_policy':
        raise RuntimeError('missing_policy: planning must remain unavailable')
    if case_id in ('removal_unconfirmed', 'stop_unconfirmed', 'accounting_incomplete'):
        if plan['planning_status'] not in ('blocked', 'missing_information'):
            raise RuntimeError(f'{case_id}: incomplete protective evidence enabled a plan')
    if case_id == 'restart_ready':
        if restart['status'] != 'ready_for_human_review' or 'civil_heavy' not in restart['held_task_ids']:
            raise RuntimeError('restart_ready: restart must require human review and preserve hold')
    if case_id == 'expired_readiness' and (plan['planning_status'] != 'recovery_only' or plan['useful_worker_minutes'] != 0):
        raise RuntimeError('expired_readiness: expired confirmations cannot support work')
    if case_id == 'dynamic_locations':
        if plan['useful_worker_minutes'] != 120 or any(i['zone_id'] in ('workshop','shelter_a','shelter_b','welfare') for i in plan['intervals']):
            raise RuntimeError('dynamic_locations: output must use the supplied catalogue IDs')
    if case_id in ('alternate_timing_policy','long_recovery_policy','zero_initial_recovery'):
        if plan['policy_source'] != 'supplied' or plan['timing_policy'] is None:
            raise RuntimeError(f'{case_id}: supplied numeric policy was not echoed')
        work = [interval for interval in plan['intervals'] if interval['kind']=='work']
        if not work:
            raise RuntimeError(f'{case_id}: expected a productive custom-policy plan')
        if case_id == 'alternate_timing_policy' and min(i['starts_at'] for i in work)[11:19] < '08:14:00':
            raise RuntimeError('alternate_timing_policy: initial recovery was skipped')


def capture(base_url, schemas):
    fixtures = cases()
    records = []
    with httpx.Client(base_url=base_url, timeout=20) as client:
        for index, (case_id, request) in enumerate(fixtures.items(), 1):
            response, status = post(client, schemas, ROUTES['response-plans.solve'][0], request,
                                    'response-plan.response')
            check_case_semantics(case_id, response)
            check_returned_plan(client, schemas, request, response['crew_rest'], case_id)
            records.append({'case_id': case_id, 'request': request, 'response': response,
                            'http_status': status})
            print(f'Captured {index}/{len(fixtures)}: {case_id}', flush=True)

        canonical = fixtures['canonical_timed']
        plan = next(record['response']['crew_rest'] for record in records
                    if record['case_id'] == 'canonical_timed')
        for name, (path, response_schema) in ROUTES.items():
            request = (dict(canonical, proposed_intervals=plan['intervals'])
                       if name == 'crew-rest.check' else
                       fixtures['restart_ready'] if name == 'restart.evaluate' else canonical)
            response, _ = post(client, schemas, path, request, response_schema)
            write_json(EXAMPLES / f'{name}.request.json', request)
            write_json(EXAMPLES / f'{name}.response.json', response)
        for case_id in ('alternate_timing_policy','long_recovery_policy','zero_initial_recovery'):
            request = fixtures[case_id]
            response, _ = post(client, schemas, '/v2/crew-rest/solve', request, 'crew-rest.response')
            check_returned_plan(client, schemas, request, response, case_id)
            write_json(EXAMPLES / f'crew-rest.{case_id}.request.json', request)
            write_json(EXAMPLES / f'crew-rest.{case_id}.response.json', response)
    return {
        'schema_version': '2.1',
        'provenance': {
            'captured_at': datetime.now(ZoneInfo('Australia/Sydney')).isoformat(timespec='seconds'),
            'transport': 'HTTP',
            'source': 'operations.fixtures.cases() against a local running API',
            'fixture_count': len(fixtures),
            'validation': 'Standalone Draft 2020-12 JSON Schemas with FormatChecker; feasible schedules rechecked by HTTP',
        },
        'cases': records,
    }


def embed_if_present(evidence):
    html = ROOT / 'walkthrough.html'
    if not html.exists():
        return
    document = html.read_text()
    pattern = r'(<script\b[^>]*\bid="operational-data"[^>]*>).*?(</script>)'
    if not re.search(pattern, document, flags=re.DOTALL):
        return
    encoded = json.dumps(evidence, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    updated, count = re.subn(pattern, lambda match: match[1] + encoded + match[2],
                             document, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError('expected exactly one operational-data script')
    html.write_text(updated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8765')
    parser.add_argument('--schemas-only', action='store_true')
    parser.add_argument('--no-embed', action='store_true', help='leave walkthrough.html untouched')
    args = parser.parse_args()
    schemas = export_schemas()
    if args.schemas_only:
        print(f'Exported {len(schemas)} standalone schemas')
        return
    evidence = capture(args.base_url, schemas)
    write_json(ROOT / 'operational-results.json', evidence)
    if not args.no_embed:
        embed_if_present(evidence)
    print(f'PASS: {len(evidence["cases"])} operational cases captured and checked')


if __name__ == '__main__':
    main()
