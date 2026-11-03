import { ArrowRight, Clock3, Inbox, ShieldAlert } from 'lucide-react';
import type { Session } from './engine';
import { buildResponseQueue, queueOwner, type QueueAction } from './responseQueueModel';
import './ResponseQueue.css';

type Props = { session: Session; actingAs: string; onOpen: (action?: QueueAction) => void };
const time = (value: string) => new Date(value).toLocaleTimeString('en-AU', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false });

function ActionGroup({ title, actions, empty, onOpen, sessionClock }: { title: string; actions: QueueAction[]; empty: string; onOpen: Props['onOpen']; sessionClock: string }) {
  return <section className="response-queue__group" aria-label={title}>
    <div className="response-queue__group-head"><h2>{title}</h2><span>{actions.length}</span></div>
    {actions.length ? <div className="response-queue__rows">{actions.map(action => <button key={action.id} type="button" className="response-queue__row" onClick={() => onOpen(action)}>
      <span className="response-queue__row-main"><strong>{action.title}</strong><small>{action.detail}</small></span>
      <span className="response-queue__owner">{queueOwner(action.actorId)}</span>
      <span className={`response-queue__timing ${action.overdue ? 'is-overdue' : ''}`}><Clock3 size={14}/>{action.dueAt ? `${action.overdue ? 'Overdue · ' : 'Due · '}${time(action.dueAt)} GST` : action.plannedAt && Date.parse(action.plannedAt) > Date.parse(sessionClock) ? `Planned · ${time(action.plannedAt)} GST` : action.ready ? 'Ready for review' : 'Awaiting site step'}</span>
      <ArrowRight size={17} className="response-queue__arrow"/>
    </button>)}</div> : <p className="response-queue__empty"><Inbox size={16}/>{empty}</p>}
  </section>;
}

export default function ResponseQueue({ session, actingAs, onOpen }: Props) {
  const actions = buildResponseQueue(session);
  const mine = actions.filter(action => action.actorId === actingAs && action.ready);
  const others = actions.filter(action => action.actorId !== actingAs || !action.ready);
  const incidentId = session.state.case_id;
  const held = session.state.task_status.civil_heavy === 'held';
  const alert = Object.values(session.state.alerts).find(item => item.task_id === 'civil_heavy');
  const active = !!incidentId || !!alert || held;
  const incidentTitle = session.scenarioId === '08_symptom_escalation' ? 'Bilal reported dizziness'
    : session.scenarioId === '06_sensor_failure' ? 'Civil trench monitor unavailable'
    : session.scenarioId === '07_unacknowledged_alert' ? 'Trench hold without acknowledgment'
    : session.scenarioId === '09_restart_review' ? 'Trench restart under review'
    : held ? 'Heavy trench work held' : 'Civil trench work response';
  const incidentScope = session.scenarioId === '08_symptom_escalation' ? 'Bilal · Dune civil crew'
    : session.scenarioId === '06_sensor_failure' ? 'Civil exposed zone · local monitor'
    : 'Dune Civil · 11 workers + Huda';
  const first = actions[0];
  const overdue = actions.filter(action => action.overdue).length;
  return <div className="response-queue">
    <div className="page-intro response-queue__intro"><div><div className="eyebrow">PROJECT SANDLINE · RESPONSE DESK</div><h1>Response queue</h1><p>Current site record and named follow-ups at {time(session.state.clock)} GST.</p></div></div>
    <div className="response-queue__summary" aria-label="Queue summary"><span><strong>{mine.length}</strong> Needs you</span><span><strong>{others.length}</strong> Waiting</span><span className={overdue ? 'is-overdue' : ''}><strong>{overdue}</strong> Overdue</span><span><strong>{active ? 1 : 0}</strong> Active incident</span></div>
    <ActionGroup title="Needs your action" actions={mine} empty="No open action for the selected role." onOpen={onOpen} sessionClock={session.state.clock}/>
    <ActionGroup title="Waiting" actions={others} empty="No other open responsibility." onOpen={onOpen} sessionClock={session.state.clock}/>
    <section className="response-queue__group" aria-label="Active incidents"><div className="response-queue__group-head"><h2>Active incidents</h2><span>{active ? 1 : 0}</span></div>
      {active ? <button type="button" className="response-queue__incident" onClick={() => onOpen()}>
        <span className="response-queue__incident-icon"><ShieldAlert size={19}/></span><span className="response-queue__incident-main"><strong>{incidentTitle}</strong><small>{incidentId === 'sandline_case_01' ? 'SL-001' : incidentId ?? 'Current site response'} · {incidentScope}</small></span>
        <span className="response-queue__incident-next">{first ? queueOwner(first.actorId) : session.scenarioId === '08_symptom_escalation' ? 'Salim · first aider' : 'Rashid · superintendent'}<br/>{first ? `Next: ${first.title}${first.dueAt ? ` · ${first.overdue ? 'overdue' : 'due'} ${time(first.dueAt)} GST` : ''}` : 'No queued action'}</span><span className={`response-queue__incident-status ${held ? 'is-held' : ''}`}>{held ? 'Held' : 'In progress'}</span><ArrowRight size={18}/>
      </button> : <div className="response-queue__empty"><Inbox size={16}/><span>No incident recorded yet.</span><button type="button" className="response-queue__open-record" onClick={() => onOpen()}>Open current work record <ArrowRight size={14}/></button></div>}
    </section>
  </div>;
}
