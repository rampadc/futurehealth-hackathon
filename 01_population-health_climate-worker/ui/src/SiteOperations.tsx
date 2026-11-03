import { useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, MapPin, Radio, Users } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { crews, deliveries, organisations, people, tasks, zones } from './fixtures';
import { WorkSchedule } from './WorkSchedule';
import { shortOrg, shortTask } from './workScheduleModel';
import { assessThermalReading } from './thermal';
import { ThermalReading } from './ThermalReading';
import layout from '../../demo/cross-scenario/site_layout.json';
import plan from '../../demo/cross-scenario/schedule_plan.json';
import './SiteOperations.css';

type Props = { session: any; onOpenRegister?: () => void };
type SiteZone = typeof zones[number];

const time = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const shortZone: Record<string, string> = {
  civil_exposed: 'Civil trench', electrical_exposed: 'Electrical laydown', yard: 'Receiving yard',
  workshop: 'Cooled workshop', shelter_a: 'Recovery shelter A', shelter_b: 'Recovery shelter B', welfare: 'Welfare / first aid',
};

function zonePresence(zone: SiteZone, state: any): string[] {
  if (zone.type === 'cooled') return [...new Set(state.occupancy[zone.id] || [])] as string[];
  const inCooled = new Set<string>(Object.values(state.occupancy as Record<string, string[]>).flat());
  return [...new Set(tasks.filter(task => task.zone_id === zone.id && state.task_status[task.id] === 'active')
    .flatMap(task => state.assignments[task.id] || []).filter(id => !inCooled.has(id)))];
}

function zoneTone(zone: SiteZone, state: any): string {
  if (!zone.sensor_id) return 'cooled';
  const reading = state.readings[zone.id];
  return assessThermalReading(reading?.sensor_id === zone.sensor_id ? reading : null, state.clock, state.sensor_status[zone.sensor_id]).band;
}

export default function SiteOperations({ session, onOpenRegister }: Props) {
  const [selectedZone, setSelectedZone] = useState('civil_exposed');
  const [contractor, setContractor] = useState('all');
  const [detail, setDetail] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const state = session.state;
  const selected = zones.find(zone => zone.id === selectedZone) || zones[0];
  const selectedTasks = tasks.filter(task => task.zone_id === selected.id);
  const present = zonePresence(selected, state);
  const delivery = deliveries[0];
  const supplier = organisations.find(org => org.id === delivery.supplier_id)!;
  const deliveryStage = state.delivery.status;
  const proposed = session.pendingDeliverySlot || '2025-08-04T15:30:00+04:00';
  const accepted = deliveryStage === 'confirmed' && state.delivery.slot !== delivery.site_slot;
  const proposalLabel = accepted ? 'Supplier accepted' : deliveryStage === 'sent' ? 'Awaiting supplier' : deliveryStage === 'approved' ? 'Approved to request' : deliveryStage === 'draft' ? 'Draft slot change' : 'Planning option · not requested';
  const earlyWindowSuggested = session.scenarioId === '01_pre_shift_planning' && session.history?.some((item: any) => item.status === 'applied' && item.event.type === 'recommendation');
  const detailTask = tasks.find(task => task.id === detail);
  const detailLane = plan.lanes.find(lane => lane.task_id === detail);
  const detailCrew = detailTask && crews.find(crew => crew.id === detailTask.crew_id);
  const detailZone = detailTask && zones.find(zone => zone.id === detailTask.zone_id);
  const detailAssignees = detailTask ? (state.assignments[detailTask.id] || []).map((id: string) => people.find(person => person.id === id)).filter(Boolean) : [];
  const openDetail = (id: string, trigger: HTMLButtonElement) => { detailTrigger.current = trigger; setDetail(id); };
  const viewZone = (id: string) => { setSelectedZone(id); setDetail(null); requestAnimationFrame(() => document.getElementById('so-map-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };

  return <div className="so-root">
    <div className="so-heading">
      <div><div className="so-eyebrow">PROJECT SANDLINE / SITE OPERATIONS</div><h1>Crew &amp; work</h1><p>Today’s plan, crews and site conditions.</p></div>
      <div className="so-site-meta"><span><MapPin size={15}/> {layout.subtitle}</span><strong><CalendarDays size={16}/> Mon 4 Aug 2025 · GST</strong></div>
    </div>
    <div className="so-site-strip"><span className="so-site-dot"/><div><small>SELECTED SITE</small><strong>{layout.name}</strong></div><span className="so-site-count">1 site selected</span>{onOpenRegister && <button onClick={onOpenRegister}>Open site register <ArrowUpRight size={14}/></button>}</div>

    <section className="so-panel so-schedule" aria-labelledby="so-schedule-title">
      <div className="so-section-head"><div><div className="so-eyebrow">DAY PLAN · 07:00–16:00 GST</div><h2 id="so-schedule-title">Contractor work schedule</h2></div><div className="so-now"><span/> Site clock {time(state.clock)}</div></div>
      <p className="so-note">Planned windows; badges show the current site record, not actual start or stop times.</p>
      <div className="so-filter" role="group" aria-label="Filter schedule by contractor">
        <button className={contractor === 'all' ? 'selected' : ''} aria-pressed={contractor === 'all'} onClick={() => setContractor('all')}>All contractors</button>
        {organisations.filter(org => ['civilco', 'electroco', 'logco'].includes(org.id)).map(org => <button key={org.id} className={contractor === org.id ? 'selected' : ''} aria-pressed={contractor === org.id} onClick={() => setContractor(org.id)}>{shortOrg[org.id]}</button>)}
      </div>
      <WorkSchedule state={state} contractor={contractor} earlyWindowSuggested={earlyWindowSuggested} proposalLabel={proposalLabel} accepted={accepted} onOpen={openDetail}/>
      <div className="so-schedule-foot"><span><i className="so-key-plan"/> Planned work</span><span><i className="so-key-held"/> Current hold over plan</span>{earlyWindowSuggested && <span><i className="so-key-suggested"/> Suggested 08:00–11:00; no clearance</span>}<span><i className="so-key-restricted"/> Outdoor restriction 12:30–15:00</span><span><i className="so-key-clock"/> Site clock</span></div>
      <p className="so-delivery-note">Aggregate: original {time(delivery.site_slot)} slot · {accepted ? `current confirmed booking ${time(state.delivery.slot)}` : `${time(proposed)} ${proposalLabel.toLowerCase()}`}. A slot changes only after supplier acceptance.</p>
    </section>

    <div className="so-lower">
      <section className="so-panel so-map-panel" aria-labelledby="so-map-title"><div className="so-section-head"><div><div className="so-eyebrow">SITE SCHEMATIC</div><h2 id="so-map-title">Work fronts &amp; local conditions</h2></div><span className="so-map-chip"><Radio size={14}/> T1–T3 local sensors</span></div>
        <p className="so-note">Zone colours use the latest local reading. Cooled spaces have no TWL reading.</p>
        <div className="so-map" role="group" aria-label="Select a site zone">
          <svg viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="1000" height="520" fill="#f4f7f6"/><path d="M 0 260 H 780 M 430 0 V 520 M 0 400 H 1000" stroke="#dce6e3" strokeWidth="20"/><path d="M 0 260 H 780 M 430 0 V 520 M 0 400 H 1000" stroke="#fff" strokeWidth="13" strokeDasharray="28 14"/><text x="22" y="35" fill="#8b9a99" fontSize="16" letterSpacing="3">PROJECT SANDLINE · SCHEMATIC</text></svg>
          {layout.zones.map(box => {
            const zone = zones.find(item => item.id === box.zone_id)!;
            const tone = zoneTone(zone, state);
            const localReading = zone.sensor_id && state.readings[zone.id]?.sensor_id === zone.sensor_id ? state.readings[zone.id] : null;
            const readingStatus = zone.sensor_id ? assessThermalReading(localReading, state.clock, state.sensor_status[zone.sensor_id]) : null;
            const count = zonePresence(zone, state).length;
            const held = tasks.some(task => task.zone_id === zone.id && state.task_status[task.id] === 'held');
            return <button key={zone.id} className={`so-zone ${tone} ${selectedZone === zone.id ? 'selected' : ''}`} style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }} aria-pressed={selectedZone === zone.id} aria-label={`${zone.name}; ${zone.sensor_id ? `${zone.sensor_id.toUpperCase()} ${tone === 'unknown' ? 'reading unavailable' : `${tone} environmental band`}` : 'cooled space'}; ${count} ${zone.type === 'cooled' ? 'recorded present' : 'assigned to active tasks'}${held ? '; work held' : ''}`} onClick={() => setSelectedZone(zone.id)}><strong>{shortZone[zone.id]}</strong><span>{zone.sensor_id ? <><Radio size={12}/> {zone.sensor_id.toUpperCase()} · {readingStatus?.reason === 'current' ? `${readingStatus.lastValue} W/m² · ${tone}` : 'unverified'}</> : <>{count} recorded present</>}</span>{held && <em>WORK HELD</em>}</button>;
          })}
        </div>
        <div className="so-heat-legend"><span><i className="red"/> High risk</span><span><i className="amber"/> Caution</span><span><i className="green"/> Low environmental risk</span><span><i className="unknown"/> Stale / unavailable</span><span><i className="cooled"/> Cooled, no reading</span></div>
      </section>
      <aside className="so-panel so-zone-detail" aria-live="polite"><div className="so-eyebrow">SELECTED ZONE</div><h2>{selected.name}</h2><p>{selected.type === 'cooled' ? 'Cooled indoor or recovery space' : 'Exposed outdoor work front'}{selected.sensor_id ? ` · local monitor ${selected.sensor_id.toUpperCase()}` : ''}</p>
        {selected.sensor_id ? <ThermalReading reading={state.readings[selected.id]?.sensor_id === selected.sensor_id ? state.readings[selected.id] : null} clock={state.clock} sensorStatus={state.sensor_status[selected.sensor_id]} compact/> : <div className="so-no-reading">Cooled area · no local TWL monitor assigned. No environmental band inferred.</div>}
        <div className="so-detail-metric"><span><Users size={15}/> {selected.type === 'cooled' ? 'Recorded present' : 'Assigned to active work'}</span><strong>{present.length}{selected.capacity ? ` / ${selected.capacity} places` : ''}</strong></div>
        <small className="so-presence-source">{selected.type === 'cooled' ? 'Occupancy recorded in the site record.' : 'Active assignments exclude people in cooled spaces and held tasks. Assignment does not confirm physical presence.'}</small>
        {present.length > 0 && <details className="so-people"><summary>{selected.type === 'cooled' ? 'People recorded here' : 'People assigned to active work'}</summary><p>{present.map(id => people.find(person => person.id === id)?.name || id).join(', ')}</p></details>}
        <div className="so-detail-tasks"><h3>Work assigned to this zone</h3>{selectedTasks.length ? selectedTasks.map(task => <div key={task.id}><strong>{shortTask[task.id]}</strong><span>{shortOrg[crews.find(crew => crew.id === task.crew_id)!.organisation_id]} · {(state.assignments[task.id] || []).length} assigned</span><em className={`so-status ${state.task_status[task.id]}`}>{state.task_status[task.id] === 'idle' ? 'Not started' : state.task_status[task.id] === 'held' ? 'Held now' : state.task_status[task.id]}</em></div>) : <p>No work task assigned. Occupancy is tracked separately.</p>}</div>
      </aside>
    </div>
    <section className="so-panel so-topology" aria-labelledby="so-topology-title"><div className="so-section-head"><div><div className="so-eyebrow">WHO DIRECTS THE WORK</div><h2 id="so-topology-title">Contractor topology</h2></div><span>Choose a subcontractor to filter the schedule</span></div><div className="so-topology-grid"><div className="so-principal"><small>PRINCIPAL CONTRACTOR</small><strong>{organisations[0].name}</strong><span>Site programme, safety controls and welfare · {crews[0].member_ids.length} staff</span></div><div className="so-subcontractors">{organisations.filter(org => ['civilco', 'electroco', 'logco'].includes(org.id)).map(org => { const crew = crews.find(item => item.organisation_id === org.id)!; const lead = people.find(person => person.id === crew.lead_id); return <button key={org.id} className={contractor === org.id ? 'selected' : ''} onClick={() => { setContractor(org.id); document.getElementById('so-schedule-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><small>{org.role.toUpperCase()}</small><strong>{org.name}</strong><span>{crew.member_ids.length} crew · lead {lead?.name || crew.lead_id}</span></button>; })}</div><div className="so-external"><div><small>SUPPLIER</small><strong>{supplier.name}</strong><span>Aggregate booking and slot acceptance</span></div><div><small>CLIENT</small><strong>{organisations.find(org => org.id === 'clientco')!.name}</strong><span>Contractual milestones</span></div></div></div></section>
    <p className="so-provenance">Readings, tasks, occupancy and supplier responses are shown from the site record.</p>
    <Dialog.Root open={detail !== null} onOpenChange={open => { if (!open) setDetail(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="so-dialog-overlay"/>
        <Dialog.Content className="so-dialog" onCloseAutoFocus={event => { event.preventDefault(); detailTrigger.current?.focus(); }}>
          <div className="so-dialog-head"><div><div className="so-eyebrow">{detailTask ? 'WORK DETAIL' : 'DELIVERY DETAIL'}</div><Dialog.Title>{detailTask ? shortTask[detailTask.id] : 'Aggregate delivery'}</Dialog.Title></div><Dialog.Close className="so-dialog-close" aria-label="Close details">×</Dialog.Close></div>
          {detailTask && detailLane && detailCrew && detailZone ? <>
            <Dialog.Description className="so-dialog-intro">{detailTask.description}</Dialog.Description>
            <dl className="so-detail-list">
              <div><dt>Planned window</dt><dd>{detailLane.start}–{detailLane.end} GST{'contingent' in detailLane && detailLane.contingent ? ' · contingent opportunity' : ''}</dd></div>
              <div><dt>Current site record</dt><dd><span className={`so-status ${state.task_status[detailTask.id]}`}>{state.task_status[detailTask.id] === 'idle' ? 'Not started' : state.task_status[detailTask.id] === 'held' ? 'Held now' : state.task_status[detailTask.id]}</span></dd></div>
              <div><dt>Crew owner</dt><dd>{shortOrg[detailCrew.organisation_id]} · {people.find(person => person.id === detailCrew.lead_id)?.name || detailCrew.lead_id} (lead)</dd></div>
              <div><dt>Work front</dt><dd>{detailZone.name}</dd></div>
              <div><dt>Requirements</dt><dd>{detailTask.required_qualifications.length ? detailTask.required_qualifications.join(', ').replaceAll('_', ' ') : 'No task-wide qualification specified'}{'supervisor_id' in detailTask && detailTask.supervisor_id ? ` · supervisor ${people.find(person => person.id === detailTask.supervisor_id)?.name || detailTask.supervisor_id}` : ''}{'role_requirements' in detailTask && detailTask.role_requirements ? ` · ${Object.values(detailTask.role_requirements).join(', ').replaceAll('_', ' ')}` : ''}</dd></div>
              <div><dt>Local condition</dt><dd>{detailZone.sensor_id ? <ThermalReading reading={state.readings[detailZone.id]?.sensor_id === detailZone.sensor_id ? state.readings[detailZone.id] : null} clock={state.clock} sensorStatus={state.sensor_status[detailZone.sensor_id]} compact/> : 'Cooled space · no local TWL monitor'}</dd></div>
            </dl>
            <div className="so-dialog-people"><h3>Assigned people ({detailAssignees.length})</h3>{detailAssignees.length ? <ul>{detailAssignees.map((person: any) => <li key={person.id}><strong>{person.name}</strong><span>{person.role.replaceAll('_', ' ')} · {person.qualifications.length ? person.qualifications.join(', ').replaceAll('_', ' ') : 'no qualification recorded'}{person.acclimatisation !== 'complete' ? ` · ${person.acclimatisation.replaceAll('_', ' ')} restriction` : ''}</span></li>)}</ul> : <p>No one is currently assigned.</p>}</div>
            <p className="so-dialog-note">Planning times do not record actual start or stop. Assignment does not confirm physical presence.{state.task_status[detailTask.id] === 'held' ? ' This task is held now; a planned bar is not a work clearance.' : ''}</p>
            <button className="so-dialog-action" onClick={() => viewZone(detailZone.id)}>View zone <ArrowUpRight size={14}/></button>
          </> : <>
            <Dialog.Description className="so-dialog-intro">{supplier.name} · aggregate supplier booking</Dialog.Description>
            <dl className="so-detail-list">
              <div><dt>Original slot</dt><dd>{time(delivery.site_slot)} GST · confirmed booking</dd></div>
              <div><dt>Proposed slot</dt><dd>{time(proposed)} GST · {proposalLabel}</dd></div>
              <div><dt>Current booking</dt><dd>{time(state.delivery.slot)} GST · {accepted ? 'supplier accepted revised slot' : 'original confirmed slot'}</dd></div>
              <div><dt>Approval stage</dt><dd>{deliveryStage === 'confirmed' ? accepted ? 'Supplier accepted' : 'No revised slot requested' : deliveryStage === 'sent' ? 'Sent; awaiting supplier response' : deliveryStage === 'approved' ? 'Approved to request; not sent' : deliveryStage === 'draft' ? 'Draft; not approved' : deliveryStage}</dd></div>
            </dl>
            <p className="so-dialog-note">The planning option is not a booking. The slot changes only after supplier acceptance.</p>
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
