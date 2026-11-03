import { people, tasks, deliveries, policies, type ScenarioId } from './fixtures';
import siteContext from '../../demo/cross-scenario/SITE_CONTEXT.md?raw';
import heatRestSchedule from '../../demo/cross-scenario/HEAT_REST_SCHEDULE.md?raw';
import './RecommendationBasis.css';

type Basis = {
  people: string[];
  task?: string;
  policy?: string;
  delivery?: boolean;
  conclusion: string;
  source: 'site' | 'heat';
  excerpt: string;
};

const basis: Record<ScenarioId, Basis> = {
  '01_pre_shift_planning': {
    people: ['P02', 'C01', 'P05', 'P01'], task: 'civil_heavy', policy: 'p_midday', delivery: true,
    conclusion: 'Rashid reviews the morning trench sequence with Huda and Noura; a forecast does not clear work.', source: 'site',
    excerpt: 'The client commissioned a small utility corridor; trench preparation, de-energised cable-kit preparation, and aggregate receipt have linked schedule milestones.',
  },
  '02_heat_alert_response': {
    people: ['P03', 'C01', 'P02'], task: 'civil_heavy', policy: 'p_heavy_hold',
    conclusion: 'Maya issues the hold; Huda must confirm the crew stopped and reached recovery.', source: 'site',
    excerpt: 'The principal contractor may issue site-wide safety controls; each subcontractor foreman must confirm crew instructions and cessation.',
  },
  '03_constrained_reassignment': {
    people: ['C01', 'C05', 'C06', 'C07', 'C08'], task: 'workshop_prep',
    conclusion: 'Huda may assign four qualified civil workers to workshop preparation while the trench hold stays in force.', source: 'site',
    excerpt: 'During the civil hold, four qualified civil workers can do lightweight pipe-marker preparation in the workshop as a separate schedule recovery action; it never clears civil work or transfers another zone’s TWL to the civil zone.',
  },
  '04_delivery_coordination': {
    people: ['P05', 'P01'], task: 'yard_receive', delivery: true,
    conclusion: 'Noura requests a later slot; only supplier acceptance confirms it. Amal reviews any resulting cost.', source: 'site',
    excerpt: 'Supplier rescheduling is commercial coordination: a proposed slot needs logistics approval, outbound request, and supplier acceptance before it is confirmed.',
  },
  '05_restricted_worker_assignment': {
    people: ['C13', 'C14', 'C01'], task: 'civil_light', policy: 'p_heat_program',
    conclusion: 'Huda keeps Noor and Adil on supervised light work instead of heavy trench work.', source: 'site',
    excerpt: 'Civil C13 and C14 are on acclimatisation day 2 and start on supervised light work under C01\'s supervision.',
  },
  '06_sensor_failure': {
    people: ['P03', 'C01', 'P02'], task: 'civil_heavy', policy: 'p_stale',
    conclusion: 'Maya tells Huda the civil reading is unavailable; Rashid needs a fresh local assessment before review.', source: 'site',
    excerpt: 'A software recommendation cannot replace supervisor, first aider, permit issuer, employer or supplier authority.',
  },
  '07_unacknowledged_alert': {
    people: ['P02', 'C01', 'P03'], task: 'civil_heavy', policy: 'p_escalate',
    conclusion: 'Rashid follows up with Huda to verify receipt and actual cessation; the hold remains open.', source: 'site',
    excerpt: 'A beacon indicates an applicable band; it does not prove receipt of an instruction, task cessation, recovery attendance or supplier acceptance.',
  },
  '08_symptom_escalation': {
    people: ['C08', 'C01', 'P06'], task: 'civil_heavy', policy: 'p_symptoms',
    conclusion: 'Huda removes Bilal from the task and calls Salim for first aid regardless of the heat band.', source: 'site',
    excerpt: 'A worker can report symptoms or refuse unsafe work through the existing supervisor and first-aid routes without waiting for any cost decision.',
  },
  '09_restart_review': {
    people: ['P02', 'P04', 'C01'], task: 'civil_heavy', policy: 'p_restart',
    conclusion: 'Rashid reviews the permit, crew and fresh local reading before authorising a restart.', source: 'site',
    excerpt: 'P02 owns the site safety instruction and restart review; C01 carries it out for the civil crew.',
  },
  '10_handover_and_evidence': {
    people: ['P02', 'P05', 'P01'], task: 'workshop_prep', delivery: true,
    conclusion: 'Rashid hands over task states; Noura checks the booking; Amal reviews costs separately from recovery pay.', source: 'heat',
    excerpt: 'Dune\'s lost output, any payment from Sandline to Dune, supplier charges and a claim against the client remain open to the relevant contract processes.',
  },
};

function sourceRecord(id: string) {
  const person = people.find(item => item.id === id);
  if (!person) return null;
  return {
    id: person.id, name: person.name, role: person.role,
    organisation_id: person.organisation_id,
    qualifications: person.qualifications, acclimatisation: person.acclimatisation,
    supervisor_id: person.supervisor_id,
  };
}

export default function RecommendationBasis({ scenarioId }: { scenarioId: ScenarioId }) {
  const item = basis[scenarioId];
  const task = item.task && tasks.find(record => record.id === item.task);
  const policy = item.policy && policies.find(record => record.id === item.policy);
  const delivery = item.delivery && deliveries[0];
  const document = item.source === 'heat' ? heatRestSchedule : siteContext;
  const documentName = item.source === 'heat' ? 'HEAT_REST_SCHEDULE.md' : 'SITE_CONTEXT.md';
  const costOwner = people.find(person => person.id === 'P01')!;
  const costExcerpt = 'P01 owns the cross-party review; a sensor event or this schedule alone does not make a delay claim payable.';

  return <details className="recommendation-basis">
    <summary><span>Why these people?</span><span className="recommendation-basis-hint">View source records</span></summary>
    <div className="recommendation-basis-body">
      <div className="recommendation-basis-flow">
        <div><small>1 · People and roles</small><ul>{item.people.map(id => { const person = people.find(record => record.id === id); return person && <li key={id}><strong>{person.name}</strong> · {person.role.replaceAll('_', ' ')}</li>; })}</ul></div>
        <div><small>2 · Work and booking</small><p>{task?.description ?? 'Task record unavailable'}{delivery ? ` · Aggregate booking ${new Date(delivery.site_slot).toLocaleTimeString('en-GB', {timeZone:'Asia/Dubai', hour:'2-digit', minute:'2-digit'})} GST` : ''}</p></div>
        <div><small>3 · Next step</small><p>{item.conclusion}</p></div>
      </div>
      <p className="recommendation-basis-cost"><strong>Cost review:</strong> {costOwner.name}, {costOwner.role.replaceAll('_', ' ')}. {scenarioId === '08_symptom_escalation' ? 'Mina Rahman handles Dune employer pay questions.' : 'Cross-party charges remain open.'}</p>
      <p className="recommendation-basis-boundary">This site record supports planning options. Named people decide on crew safety, permits, supplier bookings and employer matters.</p>
      <div className="recommendation-basis-sources">
        <details><summary>People · personnel.json</summary><pre>{[...new Set([...item.people, 'P01'])].map(id => JSON.stringify(sourceRecord(id), null, 2)).join('\n\n')}</pre></details>
        {task && <details><summary>Task · tasks.json</summary><pre>{JSON.stringify(task, null, 2)}</pre></details>}
        {policy && <details><summary>Rule · policies.json</summary><pre>{JSON.stringify(policy, null, 2)}</pre></details>}
        {delivery && <details><summary>Booking · deliveries.json</summary><pre>{JSON.stringify(delivery, null, 2)}</pre></details>}
        <details><summary>Site commitment · {documentName}</summary><blockquote>{document.includes(item.excerpt) ? item.excerpt : 'Source excerpt unavailable.'}</blockquote></details>
        <details><summary>Cost authority · HEAT_REST_SCHEDULE.md</summary><blockquote>{heatRestSchedule.includes(costExcerpt) ? costExcerpt : 'Source excerpt unavailable.'}</blockquote></details>
      </div>
    </div>
  </details>;
}
