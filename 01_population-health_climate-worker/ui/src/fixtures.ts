import baseline from '../../demo/cross-scenario/baseline_state.json';
import people from '../../demo/cross-scenario/personnel.json';
import tasks from '../../demo/cross-scenario/tasks.json';
import zones from '../../demo/cross-scenario/zones.json';
import crews from '../../demo/cross-scenario/crews.json';
import assets from '../../demo/cross-scenario/assets.json';
import deliveries from '../../demo/cross-scenario/deliveries.json';
import organisations from '../../demo/cross-scenario/organisations.json';
import policies from '../../demo/cross-scenario/policies.json';
import sources from '../../demo/cross-scenario/sources.json';
import meta01 from '../../demo/01_pre_shift_planning/scenario.json';
import expected01 from '../../demo/01_pre_shift_planning/expected_outcomes.json';
import signals01 from '../../demo/01_pre_shift_planning/signals.jsonl?raw';
import meta02 from '../../demo/02_heat_alert_response/scenario.json';
import expected02 from '../../demo/02_heat_alert_response/expected_outcomes.json';
import signals02 from '../../demo/02_heat_alert_response/signals.jsonl?raw';
import meta03 from '../../demo/03_constrained_reassignment/scenario.json';
import expected03 from '../../demo/03_constrained_reassignment/expected_outcomes.json';
import signals03 from '../../demo/03_constrained_reassignment/signals.jsonl?raw';
import meta04 from '../../demo/04_delivery_coordination/scenario.json';
import expected04 from '../../demo/04_delivery_coordination/expected_outcomes.json';
import signals04 from '../../demo/04_delivery_coordination/signals.jsonl?raw';
import meta05 from '../../demo/05_restricted_worker_assignment/scenario.json';
import expected05 from '../../demo/05_restricted_worker_assignment/expected_outcomes.json';
import signals05 from '../../demo/05_restricted_worker_assignment/signals.jsonl?raw';
import meta06 from '../../demo/06_sensor_failure/scenario.json';
import expected06 from '../../demo/06_sensor_failure/expected_outcomes.json';
import signals06 from '../../demo/06_sensor_failure/signals.jsonl?raw';
import meta07 from '../../demo/07_unacknowledged_alert/scenario.json';
import expected07 from '../../demo/07_unacknowledged_alert/expected_outcomes.json';
import signals07 from '../../demo/07_unacknowledged_alert/signals.jsonl?raw';
import meta08 from '../../demo/08_symptom_escalation/scenario.json';
import expected08 from '../../demo/08_symptom_escalation/expected_outcomes.json';
import signals08 from '../../demo/08_symptom_escalation/signals.jsonl?raw';
import meta09 from '../../demo/09_restart_review/scenario.json';
import expected09 from '../../demo/09_restart_review/expected_outcomes.json';
import signals09 from '../../demo/09_restart_review/signals.jsonl?raw';
import meta10 from '../../demo/10_handover_and_evidence/scenario.json';
import expected10 from '../../demo/10_handover_and_evidence/expected_outcomes.json';
import signals10 from '../../demo/10_handover_and_evidence/signals.jsonl?raw';

export { baseline, people, tasks, zones, crews, assets, deliveries, organisations, policies, sources };
export const siteData = { baseline, people, tasks, zones, crews, assets, deliveries, organisations, policies, sources };
export const scenarioIds = [
  '01_pre_shift_planning',
  '02_heat_alert_response',
  '03_constrained_reassignment',
  '04_delivery_coordination',
  '05_restricted_worker_assignment',
  '06_sensor_failure',
  '07_unacknowledged_alert',
  '08_symptom_escalation',
  '09_restart_review',
  '10_handover_and_evidence',
] as const;
export type ScenarioId = typeof scenarioIds[number];
export const connectedSequence: ScenarioId[] = [scenarioIds[1], scenarioIds[2], scenarioIds[3], scenarioIds[9]];
export type FixtureEvent = { event_id: string; scenario_id: string; occurred_at: string; received_at: string; source: string; synthetic: boolean; type: string; actor_id?: string; payload: Record<string, any> };
export type ScenarioFixture = { meta: { id: string; title: string; connected_predecessor: string | null; initial_overrides: Record<string, any> }; expected: { semantic_assertions: string[]; expected_rejections: string[]; forbidden_actions: string[] }; events: FixtureEvent[] };
const parse = (raw: string): FixtureEvent[] => raw.trim().split('\n').map(line => JSON.parse(line));
export const fixtures: Record<ScenarioId, ScenarioFixture> = {
  '01_pre_shift_planning': { meta: meta01, expected: expected01, events: parse(signals01) },
  '02_heat_alert_response': { meta: meta02, expected: expected02, events: parse(signals02) },
  '03_constrained_reassignment': { meta: meta03, expected: expected03, events: parse(signals03) },
  '04_delivery_coordination': { meta: meta04, expected: expected04, events: parse(signals04) },
  '05_restricted_worker_assignment': { meta: meta05, expected: expected05, events: parse(signals05) },
  '06_sensor_failure': { meta: meta06, expected: expected06, events: parse(signals06) },
  '07_unacknowledged_alert': { meta: meta07, expected: expected07, events: parse(signals07) },
  '08_symptom_escalation': { meta: meta08, expected: expected08, events: parse(signals08) },
  '09_restart_review': { meta: meta09, expected: expected09, events: parse(signals09) },
  '10_handover_and_evidence': { meta: meta10, expected: expected10, events: parse(signals10) },
};
