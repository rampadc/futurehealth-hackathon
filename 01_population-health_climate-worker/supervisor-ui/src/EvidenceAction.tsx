import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ACTIONS, type ActionId, type Persona } from './story';
import { buttonLabels, taskReason } from './copy';
import { nameOf } from './replay';
import type { CaseView, Task } from './live';
import { atDubai, caseWorkers, payloads, simplePayload, toIso } from './commands';

const extraLabels: Record<string, string> = {
  incident_record: 'Record Bilal’s site incident', readiness: 'Confirm individual workshop readiness',
  activity: 'Record observed crew activity', water: 'Confirm water check',
  personnel: 'Confirm personnel check', recovery_check: 'Confirm recovery check',
  crew_readiness: 'Confirm crew readiness check',
  escalation_followup: 'Record overdue acknowledgment follow-up',
};

export function EvidenceAction({ action, caseView, person, onAction, busy }: {
  action: string; caseView: CaseView; person: Persona;
  onAction: (action: string, payload: Record<string, unknown>) => Promise<void>; busy: boolean;
}) {
  const task: Task | undefined = caseView.tasks.find(item => item.action === action && item.actor_id === person.id);
  const label = ACTIONS[action as ActionId]?.label ?? extraLabels[action] ?? task?.label ?? action.replaceAll('_', ' ');
  const known = caseWorkers(caseView);
  const workers = known.length ? known : Array.from({ length: 11 }, (_, index) => ({ person_id: `C${String(index + 2).padStart(2, '0')}` }));
  const activeWorkers = workers.filter(w => !(w.person_id === 'C08' && caseView.story.reported));
  const rosterKey = activeWorkers.map(worker => worker.person_id).join(',');
  const [twl, setTwl] = useState('145');
  const [basis, setBasis] = useState('Foreman checked the worker in person');
  const [readinessStatus, setReadinessStatus] = useState<'ready' | 'not_ready'>('ready');
  const [validUntil, setValidUntil] = useState(atDubai(new Date(Date.parse(caseView.clock) + 2 * 60 * 60_000).toISOString()));
  const [selected, setSelected] = useState<string[]>([]);
  const [accounted, setAccounted] = useState(false);
  const [activity, setActivity] = useState<Record<string, 'work' | 'recovery'>>({});
  const [observed, setObserved] = useState(false);
  useEffect(() => {
    setObserved(false);
    setAccounted(false);
    setActivity({});
    setSelected([]);
    setValidUntil(atDubai(new Date(Date.parse(caseView.clock) + 2 * 60 * 60_000).toISOString()));
  }, [caseView.case_id, action, rosterKey]);
  const displayLabel = label;
  const status = task?.status ?? 'waiting';
  const payload = (): Record<string, unknown> => {
    if (action === 'recover') return payloads.recover(caseView);
    if (action === 'fresh') return payloads.fresh(caseView, Number(twl), caseView.clock);
    if (action === 'readiness' || action === 'leila') return payloads.readiness(action === 'leila' ? ['C09'] : selected, readinessStatus, basis, toIso(validUntil));
    if (action === 'activity') return { through_now: true, observed: true, groups: ['work', 'recovery'].map(kind => ({ kind, zone_id: kind === 'work' ? 'workshop' : 'shelter_a', person_ids: activeWorkers.filter(w => activity[w.person_id] === kind).map(w => w.person_id) })).filter(group => group.person_ids.length) };
    return simplePayload(action, caseView) ?? {};
  };
  const invalid = (action === 'fresh' && (!Number.isFinite(Number(twl)) || Number(twl) <= 0)) ||
    (action === 'recover' && (!accounted || workers.length !== (caseView.headcount?.expected_count ?? 11))) ||
    (action === 'readiness' && !selected.length) ||
    ((action === 'readiness' || action === 'leila') && (!basis.trim() || !validUntil)) ||
    (action === 'activity' && (activeWorkers.some(w => !activity[w.person_id]) || !observed));
  return <Box sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{displayLabel}</Typography>
        <Typography variant="caption" color="text.secondary">{status === 'recorded' ? 'Recorded' : taskReason(task?.reason) || (status === 'ready' ? 'Ready for your confirmation' : 'Waiting for the required evidence or handoff')}{task?.due_at ? ` · due ${atDubai(task.due_at).replace('T', ' ')} GST` : ''}</Typography></Box>
      {status === 'recorded' ? <Typography color="success.main" variant="caption">Recorded</Typography> : <Button variant="contained" disabled={status !== 'ready' || busy || invalid} onClick={() => void onAction(action, payload())} aria-label={displayLabel}>{buttonLabels[action as ActionId] ?? 'Record'}</Button>}
    </Stack>
    {status === 'ready' && action === 'fresh' && <Stack direction="row" spacing={2} sx={{ mt: 2 }}><TextField label="Local TWL (W/m²)" type="number" value={twl} onChange={e => setTwl(e.target.value)} size="small" /><Typography variant="caption">Measured now</Typography></Stack>}
    {status === 'ready' && action === 'recover' && <Stack sx={{ mt: 2 }}><Typography variant="caption" color="text.secondary">{caseView.headcount?.checked_in_count ?? 0} personal arrivals are recorded. Huda confirms the full {caseView.headcount?.expected_count ?? 11}-person roster from direct observation, including anyone in Welfare.</Typography><FormControlLabel control={<Checkbox checked={accounted} onChange={e => setAccounted(e.target.checked)} />} label="I personally accounted for all affected workers at their current safe locations" /></Stack>}
    {status === 'ready' && (action === 'readiness' || action === 'leila') && <Stack spacing={1.5} sx={{ mt: 2 }}>
      {action === 'readiness' && <Box><Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><Typography variant="caption">Select workers whose readiness you personally confirmed:</Typography>{caseView.workers?.some(w => w.readiness === 'unknown') && <Button size="small" onClick={() => setSelected(caseView.workers!.filter(w => w.readiness === 'unknown').map(w => w.person_id))}>Select unconfirmed workers</Button>}</Stack><Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap' }}>{workers.map(w => <FormControlLabel key={w.person_id} control={<Checkbox size="small" checked={selected.includes(w.person_id)} onChange={e => setSelected(old => e.target.checked ? [...old, w.person_id] : old.filter(id => id !== w.person_id))} />} label={nameOf(w.person_id)} />)}</Stack></Box>}
      <TextField select label="Readiness status" value={readinessStatus} onChange={e => setReadinessStatus(e.target.value as 'ready' | 'not_ready')} size="small"><MenuItem value="ready">Ready</MenuItem><MenuItem value="not_ready">Not ready</MenuItem></TextField>
      <TextField label="Basis of confirmation" value={basis} onChange={e => setBasis(e.target.value)} size="small" />
      <TextField label="Valid until (GST)" type="datetime-local" value={validUntil} onChange={e => setValidUntil(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} />
    </Stack>}
    {status === 'ready' && action === 'activity' && <Stack spacing={1.5} sx={{ mt: 2 }}>
      <Alert severity="info">Confirm each active worker’s actual activity through now. The proposal is not evidence of activity.</Alert>
      <Button size="small" onClick={() => setActivity(Object.fromEntries(activeWorkers.map(w => [w.person_id, 'recovery'])))}>Choose recovery for all after observing</Button>
      <Stack spacing={1}>{activeWorkers.map(w => <TextField key={w.person_id} select size="small" label={nameOf(w.person_id)} value={activity[w.person_id] ?? ''} onChange={e => setActivity(old => ({ ...old, [w.person_id]: e.target.value as 'work' | 'recovery' }))}><MenuItem value="recovery">Recovery · Shelter A</MenuItem><MenuItem value="work">Workshop work</MenuItem></TextField>)}</Stack>
      <FormControlLabel control={<Checkbox checked={observed} onChange={e => setObserved(e.target.checked)} />} label={`I observed all ${activeWorkers.length} active workers through now`} />
    </Stack>}
  </Box>;
}
