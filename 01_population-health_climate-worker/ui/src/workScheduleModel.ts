import type { TimelineGroup, DataItem } from 'vis-timeline';
import { crews, deliveries, organisations, tasks, zones } from './fixtures';
import plan from '../../demo/cross-scenario/schedule_plan.json';

export const shortTask: Record<string, string> = {
  civil_heavy: 'Trench excavation', civil_light: 'Supervised light work', electrical_prep: 'Cable tray prep',
  yard_receive: 'Aggregate receiving', workshop_prep: 'Workshop preparation',
};
export const shortOrg: Record<string, string> = {
  sandline: 'Sandline', civilco: 'Dune Civil', electroco: 'Copper Palm', logco: 'Sirocco Logistics',
  supplyco: 'Oasis Aggregate', clientco: 'Mussafah Water Assets',
};
export const gstDate = (clock: string) => new Date(`${plan.date}T${clock}:00+04:00`);
export const dayStart = gstDate(plan.window.start);
export const dayEnd = gstDate(plan.window.end);

export function workScheduleModel(state: any, contractor: string, earlyWindowSuggested: boolean, proposalLabel: string, accepted: boolean) {
  const groups: TimelineGroup[] = [];
  const items: DataItem[] = [];
  for (const [order, lane] of plan.lanes.entries()) {
    const task = tasks.find(item => item.id === lane.task_id)!;
    const crew = crews.find(item => item.id === task.crew_id)!;
    if (contractor !== 'all' && contractor !== crew.organisation_id) continue;
    const org = organisations.find(item => item.id === crew.organisation_id)!;
    const status = state.task_status[task.id] || 'unknown';
    const statusLabel = status === 'held' ? 'Held now' : status === 'idle' ? 'Not started' : status;
    const group = task.id;
    groups.push({ id: group, content: shortTask[task.id], title: org.name, order, className: 'work-group' });
    if (zones.find(zone => zone.id === task.zone_id)?.type === 'exposed') {
      items.push({ id: `restriction-${group}`, group, content: '', start: gstDate(plan.midday_restriction.start), end: gstDate(plan.midday_restriction.end), type: 'background', className: 'work-restriction', selectable: false });
    }
    items.push({ id: group, group, content: shortTask[task.id], start: gstDate(lane.start), end: gstDate(lane.end), type: 'range', className: `work-task work-${status}${'contingent' in lane && lane.contingent ? ' work-contingent' : ''}`, title: `${shortTask[task.id]} · ${lane.start}–${lane.end} GST · ${statusLabel} · ${(state.assignments[task.id] || []).length} assigned` });
    if (earlyWindowSuggested && task.id === 'civil_heavy') items.push({ id: 'suggested-civil-heavy', group, content: 'Suggested 08:00–11:00; no clearance', start: gstDate('08:00'), end: gstDate('11:00'), type: 'range', className: 'work-suggested', selectable: false });
  }
  const delivery = deliveries[0];
  groups.push({ id: 'delivery', content: 'Aggregate delivery', title: shortOrg.supplyco, order: 100, className: 'work-group work-delivery-group' });
  items.push({ id: 'delivery-original', group: 'delivery', content: 'Original · 11:30', start: gstDate(plan.delivery.original_slot), type: 'point', className: 'work-delivery work-original', title: `Original aggregate delivery slot ${plan.delivery.original_slot}` });
  items.push({ id: 'delivery-proposed', group: 'delivery', content: `${accepted ? 'Accepted' : 'Proposed'} · 15:30`, start: gstDate(plan.delivery.proposed_slot), type: 'point', className: `work-delivery work-proposed${accepted ? ' work-accepted' : ''}`, title: `${proposalLabel} aggregate delivery slot ${plan.delivery.proposed_slot}` });
  return { groups, items, delivery };
}
