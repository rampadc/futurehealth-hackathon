import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ACTIONS, type ActionId, type Persona } from './story';
import { buttonLabels, taskReason } from './copy';
import { nameOf } from './replay';
import type { CaseView, Task } from './live';

const atDubai = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Dubai', hour12: false }).replace(' ', 'T').slice(0, 16);
const toIso = (local: string) => `${local}:00+04:00`;
const checkActions = new Set(['water', 'personnel', 'recovery_check', 'crew_readiness', 'permit']);
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
  const [twl, setTwl] = useState('145');
  const [measured, setMeasured] = useState(atDubai(caseView.clock));
  const [basis, setBasis] = useState('Foreman checked the worker in person');
  const [readinessStatus, setReadinessStatus] = useState<'ready' | 'not_ready'>('ready');
  const [validUntil, setValidUntil] = useState(atDubai(new Date(Date.parse(caseView.clock) + 2 * 60 * 60_000).toISOString()));
  const [selected, setSelected] = useState<string[]>([]);
  const [activitySelected, setActivitySelected] = useState<string[]>([]);
  const recoveryAt = caseView.request?.snapshot.recovery?.recorded_at ?? caseView.capture?.request.snapshot.recovery?.recorded_at ?? caseView.clock;
  const latestObserved = caseView.workers?.map(w => w.last_observed_at).filter((value): value is string => !!value).sort().at(-1);
  const [kind, setKind] = useState('recovery');
  const [zone, setZone] = useState('shelter_a');
  const [starts, setStarts] = useState(atDubai(latestObserved ?? recoveryAt));
  const [ends, setEnds] = useState(atDubai(caseView.clock));
  const [observed, setObserved] = useState(false);
  useEffect(() => {
    setObserved(false);
    setEnds(atDubai(caseView.clock));
    const selectedLast = activitySelected.length === 1 ? caseView.workers?.find(w => w.person_id === activitySelected[0])?.last_observed_at : null;
    setStarts(atDubai(selectedLast ?? latestObserved ?? recoveryAt));
    setMeasured(atDubai(caseView.clock));
    setValidUntil(atDubai(new Date(Date.parse(caseView.clock) + 2 * 60 * 60_000).toISOString()));
  }, [caseView.clock, caseView.version]);
  const workers = caseView.workers?.length ? caseView.workers : caseView.request?.snapshot.workers ?? caseView.capture?.request.snapshot.workers ?? Array.from({ length: 11 }, (_, index) => ({ person_id: `C${String(index + 2).padStart(2, '0')}` }));
  const currentReading = caseView.request?.snapshot.readings[0] ?? caseView.capture?.request.snapshot.readings[0];
  const displayLabel = label;
  const selectedWorkers = activitySelected;
  const historyDeterminesStart = selectedWorkers.some(id => caseView.workers?.find(w => w.person_id === id)?.last_observed_at);
  const intervalStart = (personId: string) => caseView.workers?.find(w => w.person_id === personId)?.last_observed_at ?? (historyDeterminesStart ? recoveryAt : toIso(starts));
  const status = task?.status ?? 'waiting';
  const payload = (): Record<string, unknown> => {
    if (action === 'fresh') return { reading: { sensor_id: currentReading?.sensor_id ?? 't1', zone_id: currentReading?.zone_id ?? 'civil_exposed', twl: Number(twl), unit: 'W/m²', quality: 'valid', measured_at: toIso(measured), received_at: caseView.clock } };
    if (action === 'recover') return { person_ids: workers.map(w => w.person_id), zone_id: 'shelter_a' };
    if (action === 'assign') return { person_ids: [...new Set(caseView.capture?.response.crew_rest.intervals.filter(i => i.kind === 'work' && i.task_id === 'workshop_prep').map(i => i.person_id) ?? [])] };
    if (action === 'readiness' || action === 'leila') return { confirmations: (action === 'leila' ? ['C09'] : selected).map(person_id => ({ person_id, status: readinessStatus, basis, valid_until: toIso(validUntil) })) };
    if (action === 'activity') return { intervals: selectedWorkers.map(person_id => ({ person_id, kind, task_id: kind === 'work' ? 'workshop_prep' : null, zone_id: zone, starts_at: intervalStart(person_id), ends_at: toIso(ends), recorded_at: caseView.clock, observed: true, source: 'human_confirmation' })) };
    if (action === 'remove') return { location_id: 'welfare' };
    if (checkActions.has(action)) return { status: 'confirmed' };
    return {};
  };
  const invalid = (action === 'fresh' && (!Number.isFinite(Number(twl)) || Number(twl) <= 0 || !measured)) ||
    (action === 'readiness' && !selected.length) ||
    ((action === 'readiness' || action === 'leila') && (!basis.trim() || !validUntil)) ||
    (action === 'activity' && (!activitySelected.length || !starts || !ends || selectedWorkers.some(id => Date.parse(intervalStart(id)) >= Date.parse(toIso(ends))) || Date.parse(toIso(ends)) > Date.parse(caseView.clock) || !observed));
  return <Box sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{displayLabel}</Typography>
        <Typography variant="caption" color="text.secondary">{status === 'recorded' ? 'Recorded' : taskReason(task?.reason) || (status === 'ready' ? 'Ready for your confirmation' : 'Waiting for the required evidence or handoff')}{task?.due_at ? ` · due ${atDubai(task.due_at).replace('T', ' ')} GST` : ''}</Typography></Box>
      {status === 'recorded' ? <Typography color="success.main" variant="caption">Recorded</Typography> : <Button variant="contained" disabled={status !== 'ready' || busy || invalid} onClick={() => void onAction(action, payload())} aria-label={displayLabel}>{buttonLabels[action as ActionId] ?? 'Record'}</Button>}
    </Stack>
    {status === 'ready' && action === 'fresh' && <Stack direction="row" spacing={2} sx={{ mt: 2 }}><TextField label="Local TWL (W/m²)" type="number" value={twl} onChange={e => setTwl(e.target.value)} size="small" /><TextField label="Measured at (GST)" type="datetime-local" value={measured} onChange={e => setMeasured(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} /></Stack>}
    {status === 'ready' && action === 'recover' && <Typography variant="caption" color="text.secondary">Confirm all {workers.length} people are accounted for in cooled recovery at shelter A.</Typography>}
    {status === 'ready' && (action === 'readiness' || action === 'leila') && <Stack spacing={1.5} sx={{ mt: 2 }}>
      {action === 'readiness' && <Box><Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><Typography variant="caption">Select workers whose readiness you personally confirmed:</Typography>{caseView.workers?.some(w => w.readiness === 'unknown') && <Button size="small" onClick={() => setSelected(caseView.workers!.filter(w => w.readiness === 'unknown').map(w => w.person_id))}>Select unconfirmed workers</Button>}</Stack><Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap' }}>{workers.map(w => <FormControlLabel key={w.person_id} control={<Checkbox size="small" checked={selected.includes(w.person_id)} onChange={e => setSelected(old => e.target.checked ? [...old, w.person_id] : old.filter(id => id !== w.person_id))} />} label={nameOf(w.person_id)} />)}</Stack></Box>}
      <TextField select label="Readiness status" value={readinessStatus} onChange={e => setReadinessStatus(e.target.value as 'ready' | 'not_ready')} size="small"><MenuItem value="ready">Ready</MenuItem><MenuItem value="not_ready">Not ready</MenuItem></TextField>
      <TextField label="Basis of confirmation" value={basis} onChange={e => setBasis(e.target.value)} size="small" />
      <TextField label="Valid until (GST)" type="datetime-local" value={validUntil} onChange={e => setValidUntil(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} />
    </Stack>}
    {status === 'ready' && action === 'activity' && <Stack spacing={1.5} sx={{ mt: 2 }}>
      <Alert severity="info">Record an interval only after observing it. Planned work and rest times do not become observations automatically.</Alert>
      <Box><Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><Typography variant="caption">Workers observed in this activity:</Typography>{caseView.workers?.some(w => w.reason?.includes('Observed activity missing')) && <Button size="small" onClick={() => setActivitySelected(caseView.workers!.filter(w => w.reason?.includes('Observed activity missing')).map(w => w.person_id))}>Select workers with missing activity</Button>}</Stack><Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap' }}><FormControlLabel control={<Checkbox size="small" checked={activitySelected.length === workers.length} onChange={e => setActivitySelected(e.target.checked ? workers.map(w => w.person_id) : [])} />} label="All 11 crew members" />{workers.map(w => <FormControlLabel key={w.person_id} control={<Checkbox size="small" checked={activitySelected.includes(w.person_id)} onChange={e => { setActivitySelected(old => e.target.checked ? [...old, w.person_id] : old.filter(id => id !== w.person_id)); if (e.target.checked && activitySelected.length === 0) { const last = caseView.workers?.find(item => item.person_id === w.person_id)?.last_observed_at; setStarts(atDubai(last ?? recoveryAt)); } }} />} label={nameOf(w.person_id)} />)}</Stack></Box>
      <Stack direction="row" spacing={1}><TextField select label="Activity" value={kind} onChange={e => { setKind(e.target.value); setZone(e.target.value === 'work' ? 'workshop' : 'shelter_a'); }} size="small"><MenuItem value="recovery">Recovery</MenuItem><MenuItem value="work">Workshop work</MenuItem><MenuItem value="unavailable">Unavailable</MenuItem></TextField><TextField select label="Location" value={zone} onChange={e => setZone(e.target.value)} size="small"><MenuItem value="shelter_a">Shelter A</MenuItem><MenuItem value="workshop">Workshop</MenuItem><MenuItem value="welfare">Welfare</MenuItem></TextField></Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>{historyDeterminesStart ? <Typography variant="body2">From (GST): each worker’s last recorded end, shown below</Typography> : <TextField label="From (GST)" type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} />}<TextField label="To (GST)" type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} /></Stack>
      {activitySelected.length > 0 && <Box sx={{ maxHeight: 150, overflow: 'auto' }}><Typography variant="caption">Intervals to record:</Typography>{workers.filter(w => activitySelected.includes(w.person_id)).map(w => <Typography key={w.person_id} variant="caption" component="p">{nameOf(w.person_id)} · {atDubai(intervalStart(w.person_id)).replace('T', ' ')}–{ends.replace('T', ' ')} GST</Typography>)}</Box>}
      <FormControlLabel control={<Checkbox checked={observed} onChange={e => setObserved(e.target.checked)} />} label="I observed this activity and confirm every selected worker’s interval" />
    </Stack>}
  </Box>;
}
