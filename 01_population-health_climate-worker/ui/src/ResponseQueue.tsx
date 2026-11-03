import { useState } from 'react';
import { ArrowRight, Clock3, Inbox, ShieldAlert } from 'lucide-react';
import type { Session } from './engine';
import { buildResponseQueue, queueOwner, type QueueAction } from './responseQueueModel';
import './ResponseQueue.css';

type Props = { session: Session; actingAs: string; onOpen: (action?: QueueAction) => void };
const time = (value: string) => new Date(value).toLocaleTimeString('en-AU', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false });
const urgentFirst = (actions: QueueAction[]) => [...actions].sort((a, b) => Number(!!b.overdue) - Number(!!a.overdue));
const actionCta = (action: QueueAction) => action.id === 'crew-briefing' ? 'Review briefing'
  : action.id === 'commercial-concern' ? action.title.startsWith('Raise') ? 'Raise concern' : action.title.startsWith('Route') ? 'Route concern' : 'Record receipt'
  : action.id === 'cost:recovery_roster' ? 'Confirm roster'
  : action.id === 'cost:supplier_quote_request' ? 'Prepare enquiry'
  : action.id === 'cost:exposure_review' ? 'Review exposure'
  : action.ready ? action.title : ({
    'hold-ack': 'Review hold status', 'hold-verify': 'Review stop status', 'crew-stop': 'Review stop status',
    'crew-recovery': 'Review crew locations', 'supplier-response': 'Check supplier status',
    'supplier-request': 'Review supplier request', 'workshop-move': 'Review workshop move',
    'restart-measurement': 'Review trench reading', 'restart-review': 'Review restart checks',
    'restart-authority': 'Review restart status', 'shift-handover': 'Review handover status',
  } as Record<string, string>)[action.id] ?? 'Review incident';

function ActionGroup({ id, title, actions, empty, onOpen, sessionClock }: { id: string; title: string; actions: QueueAction[]; empty: string; onOpen: Props['onOpen']; sessionClock: string }) {
  return <section id={id} className="response-queue__group" aria-label={title}>
    <div className="response-queue__group-head"><h2>{title}</h2><span>{actions.length}</span></div>
    {actions.length ? <div className="response-queue__rows">{urgentFirst(actions).map(action => <button key={action.id} type="button" className={`response-queue__row ${action.overdue ? 'is-overdue' : ''}`} onClick={() => onOpen(action)}>
      <span className="response-queue__row-main"><strong>{action.title}</strong><small>{action.detail}</small></span>
      <span className="response-queue__owner"><small>OWNER</small>{queueOwner(action.actorId)}</span>
      <span className={`response-queue__timing ${action.overdue ? 'is-overdue' : ''}`}><Clock3 size={14}/>{action.dueAt ? `${action.overdue ? 'Overdue since' : 'Due'} ${time(action.dueAt)} GST` : action.plannedAt && Date.parse(action.plannedAt) > Date.parse(sessionClock) ? `Planned ${time(action.plannedAt)} GST` : action.ready ? 'Ready now' : 'Awaiting site step'}</span>
      <span className="response-queue__row-link">{actionCta(action)} <ArrowRight size={15}/></span>
    </button>)}</div> : <p className="response-queue__empty"><Inbox size={16}/>{empty}</p>}
  </section>;
}

export default function ResponseQueue({ session, actingAs, onOpen }: Props) {
  const [filter, setFilter] = useState<'all' | 'mine' | 'others' | 'overdue'>('all');
  const { state } = session;
  const actions = buildResponseQueue(session);
  const mine = actions.filter(action => action.actorId === actingAs && action.ready);
  const others = actions.filter(action => action.actorId !== actingAs || !action.ready);
  const selectFilter = (next: typeof filter) => {
    setFilter(next);
    if (next !== 'all') window.setTimeout(() => document.getElementById(next === 'others' || next === 'overdue' && !mine.some(action => action.overdue) ? 'queue-group-others' : 'queue-group-mine')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };
  const next = urgentFirst(actions)[0];
  const overdue = actions.filter(action => action.overdue).length;
  const alert = Object.values(state.alerts).find(item => item.task_id === 'civil_heavy');
  const held = state.task_status.civil_heavy === 'held';
  const active = !!state.case_id || !!alert || held;
  const affected = new Set(['C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12']);
  const recovery = ['shelter_a', 'shelter_b', 'welfare'].flatMap(id => state.occupancy[id] ?? []).filter(id => affected.has(id)).length;
  const workshop = (state.assignments.workshop_prep ?? []).filter(id => affected.has(id)).length;
  const moved = recovery + workshop;
  const trenchWorkers = (state.assignments.civil_heavy ?? []).filter(id => affected.has(id)).length;
  const booking = state.delivery.status === 'confirmed' ? `${time(state.delivery.slot)} GST confirmed` : `${time(state.delivery.slot)} GST remains booked`;
  const request = state.delivery.status === 'sent' ? 'Later request sent; supplier acceptance pending' : state.delivery.status === 'draft' || state.delivery.status === 'approved' ? 'Later request is not yet accepted' : null;
  const incidentTitle = session.scenarioId === '08_symptom_escalation' ? 'Bilal reported dizziness'
    : session.scenarioId === '06_sensor_failure' ? 'Civil trench monitor unavailable'
    : session.scenarioId === '07_unacknowledged_alert' && alert?.status === 'escalated' ? 'Trench hold escalated'
    : held ? 'Heavy trench work held' : 'Civil trench response';
  const control = held ? alert?.status === 'stopped' ? 'Stop confirmed; hold remains' : alert?.acknowledged ? 'Hold acknowledged; stop unconfirmed' : alert?.status === 'escalated' ? 'Escalated; stop unconfirmed' : 'Hold issued; acknowledgment pending' : 'Heavy trench work active';
  return <div className="response-queue">
    <div className="page-intro response-queue__intro"><div><div className="eyebrow">PROJECT SANDLINE · SUPERVISOR DESK</div><h1>Response queue</h1><p>Current site record · {time(state.clock)} GST</p></div></div>
    <div className="response-queue__summary" role="group" aria-label="Filter queue actions"><button type="button" aria-pressed={filter === 'mine'} className={filter === 'mine' ? 'is-selected' : ''} onClick={() => selectFilter(filter === 'mine' ? 'all' : 'mine')}><strong>{mine.length}</strong> Needs you</button><button type="button" aria-pressed={filter === 'others'} className={filter === 'others' ? 'is-selected' : ''} onClick={() => selectFilter(filter === 'others' ? 'all' : 'others')}><strong>{others.length}</strong> With others or waiting</button><button type="button" aria-pressed={filter === 'overdue'} className={`${overdue ? 'is-overdue' : ''} ${filter === 'overdue' ? 'is-selected' : ''}`} onClick={() => selectFilter(filter === 'overdue' ? 'all' : 'overdue')}><strong>{overdue}</strong> Overdue</button></div>
    <section className={`response-queue__incident ${active ? 'is-active' : ''}`} aria-label="Current incident">
      <div className="response-queue__incident-head"><div className="response-queue__incident-icon"><ShieldAlert size={19}/></div><div><span className="eyebrow">{active ? `CURRENT INCIDENT · ${state.case_id ?? 'SITE RESPONSE'}` : 'CURRENT WORK'}</span><h2>{active ? incidentTitle : 'No incident recorded'}</h2></div><span className={`response-queue__incident-status ${held ? 'is-held' : ''}`}>{held ? 'Work held' : active ? 'In progress' : 'Monitoring'}</span></div>
      <div className="response-queue__facts"><div><small>WORK CONTROL</small><strong>{control}</strong></div><div><small>AFFECTED CREW</small><strong>{held ? `${moved} of 11 moved to recovery or workshop` : `${trenchWorkers} workers + Huda on trench roster`}</strong><span>{held ? `${recovery} cooled recovery · ${workshop} workshop · Huda separate` : 'No recovery move recorded'}</span></div><div><small>AGGREGATE BOOKING</small><strong>{booking}</strong><span>{request ?? 'No pending supplier change recorded'}</span></div></div>
      <div className="response-queue__incident-foot"><div><small>NEXT NAMED STEP</small><strong>{next ? `${queueOwner(next.actorId)} · ${next.title}` : active ? 'No open action in this record' : 'Continue local monitoring'}</strong>{next?.dueAt && <span className={next.overdue ? 'is-overdue' : ''}>{next.overdue ? 'Overdue since' : 'Due'} {time(next.dueAt)} GST</span>}</div><button type="button" onClick={() => onOpen(next)}>{next ? actionCta(next) : active ? 'Review incident' : 'Review work record'} <ArrowRight size={16}/></button></div>
    </section>
    <div className="response-queue__columns">{filter !== 'others' && <ActionGroup id="queue-group-mine" title={filter === 'overdue' ? 'Your overdue actions' : 'Needs your action'} actions={filter === 'overdue' ? mine.filter(action => action.overdue) : mine} empty={filter === 'overdue' ? 'No overdue action for this role.' : 'Nothing needs this role now.'} onOpen={onOpen} sessionClock={state.clock}/ >}{filter !== 'mine' && <ActionGroup id="queue-group-others" title={filter === 'overdue' ? 'Other overdue actions' : 'Waiting on people or site steps'} actions={filter === 'overdue' ? others.filter(action => action.overdue) : others} empty={filter === 'overdue' ? 'No other overdue action.' : 'No other open responsibility.'} onOpen={onOpen} sessionClock={state.clock}/>}</div>
    {active && <p className="response-queue__handover">Pass on: {held ? 'Keep heavy trench work held until the named restart review.' : 'Continue local heat monitoring.'} {request ?? `Supplier booking: ${booking}.`}</p>}
  </div>;
}
