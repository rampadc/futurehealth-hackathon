import { ThermalReading } from './ThermalReading';
import { assessThermalReading } from './thermal';
import type { Session } from './engine';
import './ScenarioVisual.css';

const time = (at: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at));
const originalSlot = '2025-08-04T11:30:00+04:00';
const affected = ['C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'];

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="scenario-visual" aria-label={title}>
    <header className="scenario-visual__head"><div><span>Site situation · GST</span><h3>{title}</h3></div><p>{note}</p></header>
    <div className="scenario-visual__body">{children}</div>
  </section>;
}

function Metric({ label, value, detail, attention = false }: { label: string; value: string; detail?: string; attention?: boolean }) {
  return <div className={`scenario-visual__metric${attention ? ' scenario-visual__metric--attention' : ''}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function Crew({ session }: { session: Session }) {
  const occupancy = session.state.occupancy;
  const recovery = affected.filter(id => (occupancy.shelter_a || []).includes(id) || (occupancy.shelter_b || []).includes(id));
  const workshop = affected.filter(id => (occupancy.workshop || []).includes(id));
  const unlocated = affected.length - recovery.length - workshop.length;
  const count = (zone: string) => (occupancy[zone] || []).length;
  return <Panel title="Eleven affected workers" note="Huda is the foreman and is counted separately.">
    <div className="scenario-visual__metrics"><Metric label="Cooled recovery" value={`${recovery.length} / 11`} detail="Shelters A and B"/><Metric label="Workshop" value={`${workshop.length} / 11`} detail="Cooled preparation"/><Metric label="Location not recorded" value={`${unlocated} / 11`} attention={unlocated > 0}/></div>
    <div className="scenario-visual__bars" role="group" aria-label="Affected worker locations">
      {[['Recovery', recovery.length], ['Workshop', workshop.length], ['Unlocated', unlocated]].map(([label, value]) => <div className="scenario-visual__bar-row" key={label}><span>{label}</span><div className="scenario-visual__track"><div style={{ width: `${Number(value) / 11 * 100}%` }}/></div><strong>{value}</strong></div>)}
    </div>
    <p className="scenario-visual__foot">Workshop capacity: {count('workshop')} / 6 occupied · Shelter A: {count('shelter_a')} / 24 · Shelter B: {count('shelter_b')} / 16.</p>
  </Panel>;
}

function Heat({ session }: { session: Session }) {
  const state = session.state;
  const alert = Object.values(state.alerts).find(item => item.task_id === 'civil_heavy');
  const status = state.task_status.civil_heavy;
  const deadline = alert?.at ? new Date(Date.parse(alert.at) + 2 * 60_000).toISOString() : null;
  const due = deadline && Date.parse(state.clock) >= Date.parse(deadline);
  const response = alert?.status === 'stopped' ? 'Stop confirmed' : alert?.status === 'escalated' ? 'Escalated to Rashid' : alert?.acknowledged ? 'Huda acknowledged' : alert ? 'Awaiting Huda' : 'No alert issued';
  const restartScenario = session.scenarioId === '09_restart_review';
  const decision = restartScenario ? session.history.some(item => item.event.type === 'restart' && item.status === 'applied') ? status === 'held' ? 'Prior restart recorded' : 'Restart recorded' : 'Not authorised' : response;
  const local = state.readings.civil_exposed?.sensor_id === 't1' ? state.readings.civil_exposed : null;
  const fresh = assessThermalReading(local, state.clock, state.sensor_status.t1).reason === 'current';
  const review = session.review ? status === 'held' && !fresh ? 'Fresh check needed' : 'Rashid review recorded' : status === 'held' ? 'Review required' : 'No review pending';
  return <Panel title={restartScenario ? 'Restart requires human review' : 'Trench heat response'} note={status === 'held' ? 'Heavy trench work remains held until the site process allows a restart.' : 'The current task state is shown separately from the reading.'}>
    <div className="scenario-visual__metrics"><Metric label="Heavy trench work" value={status === 'held' ? 'Held' : 'Active'} attention={status === 'held'}/><Metric label={restartScenario ? 'Restart decision' : 'Alert response'} value={decision}/><Metric label="Restart review" value={review}/></div>
    <div className="scenario-visual__reading"><div><span className="scenario-visual__label">Local trench sensor · T1</span><ThermalReading reading={local} clock={state.clock} sensorStatus={state.sensor_status.t1} compact/></div>
      {alert && !alert.acknowledged && alert.status !== 'escalated' && deadline && <div className="scenario-visual__deadline"><span className="scenario-visual__label">Acknowledgment window</span><strong>{due ? 'Two minutes elapsed' : `Due by ${time(deadline)} GST`}</strong><small>{due ? 'Escalation is due; acknowledgment is still unrecorded.' : `From alert at ${time(alert.at!)} GST; only this window is scheduled.`}</small></div>}
    </div>
  </Panel>;
}

function Delivery({ session }: { session: Session }) {
  const delivery = session.state.delivery;
  const proposed = session.pendingDeliverySlot;
  const confirmedChange = delivery.status === 'confirmed' && delivery.slot !== originalSlot;
  const stage = confirmedChange ? 'Supplier accepted' : delivery.status === 'sent' ? 'Request sent' : delivery.status === 'approved' ? 'Approved to send' : delivery.status === 'draft' ? 'Draft prepared' : 'Original booking';
  return <Panel title="Aggregate delivery coordination" note="The supplier controls acceptance of the revised booking.">
    <div className="scenario-visual__metrics"><Metric label="Original booking" value={`${time(originalSlot)} GST`} detail="Confirmed at scenario start"/><Metric label={confirmedChange ? 'Confirmed new slot' : 'Proposed new slot'} value={confirmedChange ? `${time(delivery.slot)} GST` : proposed ? `${time(proposed)} GST` : 'Not proposed'} detail={confirmedChange ? 'Accepted by Oasis' : proposed ? 'Awaiting supplier acceptance' : undefined}/><Metric label="Coordination stage" value={stage} attention={delivery.status !== 'confirmed'}/></div>
    <div className="scenario-visual__stages" aria-label={`Delivery stage: ${stage}`}>{['Draft', 'Approved', 'Sent', 'Accepted'].map((label, index) => <span key={label} className={index <= (confirmedChange ? 3 : delivery.status === 'sent' ? 2 : delivery.status === 'approved' ? 1 : delivery.status === 'draft' ? 0 : -1) ? 'is-done' : ''}>{label}</span>)}</div>
  </Panel>;
}

function Restricted({ session }: { session: Session }) {
  const assignment = session.state.assignments;
  const worker = (id: string, name: string) => <div className="scenario-visual__person" key={id}><div><strong>{name}</strong><span>Day 2 · restricted acclimatisation</span></div><b>{assignment.civil_light?.includes(id) ? 'Supervised light work' : 'Light assignment not recorded'}</b></div>;
  return <Panel title="Restricted worker assignments" note="Neither worker is eligible for heavy exposed trench work."><div className="scenario-visual__people">{worker('C13', 'Noor Al Nadir')}{worker('C14', 'Adil Al Wadi')}</div><p className="scenario-visual__foot">Heavy trench assignment: {['C13', 'C14'].some(id => assignment.civil_heavy?.includes(id)) ? 'Check required' : 'Neither worker assigned'}.</p></Panel>;
}

function Sensor({ session }: { session: Session }) {
  const state = session.state;
  return <Panel title="Local sensors remain separate" note="An electrical-area reading cannot establish conditions at the trench."><div className="scenario-visual__sensor-grid"><div><span className="scenario-visual__label">T1 · civil trench</span><ThermalReading reading={state.readings.civil_exposed?.sensor_id === 't1' ? state.readings.civil_exposed : null} clock={state.clock} sensorStatus={state.sensor_status.t1} compact/></div><div><span className="scenario-visual__label">T2 · electrical area</span><ThermalReading reading={state.readings.electrical_exposed?.sensor_id === 't2' ? state.readings.electrical_exposed : null} clock={state.clock} sensorStatus={state.sensor_status.t2} compact/></div></div><p className="scenario-visual__foot">Heavy trench work: <strong>{state.task_status.civil_heavy === 'held' ? 'held' : 'active'}</strong>. T2 is never a substitute for T1.</p></Panel>;
}

function Symptom({ session }: { session: Session }) {
  const reported = session.notifiedSymptoms.includes('C08');
  const firstAid = session.state.evidence.some(item => item.kind === 'first_aid' && item.person_id === 'C08');
  const onTask = session.state.assignments.civil_heavy.includes('C08');
  return <Panel title="Bilal’s report and response" note="Recorded actions only; no diagnosis or automatic return to work."><div className="scenario-visual__metrics"><Metric label="Dizziness report" value={reported ? 'Reported' : 'Not yet reported'} attention={reported && !firstAid}/><Metric label="First aid" value={firstAid ? 'Response recorded' : reported ? 'Follow-up needed' : 'Not yet recorded'}/><Metric label="Trench assignment" value={onTask ? 'Assigned' : 'Removed'} attention={reported && onTask}/></div><p className="scenario-visual__foot">{firstAid ? 'Salim’s assessment and referral decision are recorded. No work clearance is recorded.' : reported ? 'Salim, the first aider, needs to assess Bilal and decide on referral.' : 'Awaiting the worker report in this scenario.'}</p></Panel>;
}

export default function ScenarioVisual({ session }: { session: Session }) {
  switch (session.scenarioId) {
    case '02_heat_alert_response': case '07_unacknowledged_alert': case '09_restart_review': return <Heat session={session}/>;
    case '03_constrained_reassignment': case '10_handover_and_evidence': return <Crew session={session}/>;
    case '04_delivery_coordination': return <Delivery session={session}/>;
    case '05_restricted_worker_assignment': return <Restricted session={session}/>;
    case '06_sensor_failure': return <Sensor session={session}/>;
    case '08_symptom_escalation': return <Symptom session={session}/>;
    default: return null;
  }
}
