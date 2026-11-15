import { Alert, Avatar, Box, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { nameOf, type ReplayCapture } from '../replay';
import type { StoryState } from '../story';
import { Timeline, timeLabel } from '../Timeline';
import { initials, readable } from './ui';

export const revisedPlanPending = (story: StoryState) => story.reported && (!story.removed || !story.firstaid);
export const revisedPlanWait = (story: StoryState) => `Updated work and recovery times are waiting for ${[!story.removed && 'Huda’s removal and location confirmation', !story.firstaid && 'Salim’s first-aid contact'].filter(Boolean).join(' and ')}.`;

export function Schedule({ capture, personId }: { capture: ReplayCapture; personId?: string }) {
  const plan = capture.response.crew_rest;
  const intervals = personId ? plan.intervals.filter(i => i.person_id === personId) : plan.intervals;
  const start = capture.request.planning?.starts_at;
  if (plan.planning_status !== 'planned' || !start || !plan.horizon_end) return <Alert severity="info">A work plan will be available when the required response and readiness checks are complete.</Alert>;
  return <>
    {!personId && <Stack direction="row" spacing={4} sx={{ mb: 3 }}>
      <Box><Typography variant="h4" component="p" data-testid="useful-minutes">{plan.useful_worker_minutes}</Typography><Typography variant="caption" color="text.secondary">planned worker-minutes</Typography></Box>
      <Box><Typography variant="h4" component="p">{plan.unmet_worker_minutes}</Typography><Typography variant="caption" color="text.secondary">unfilled worker-minutes</Typography></Box>
      <Box><Typography variant="h4" component="p">{timeLabel(plan.recovery_reservation_end!)}</Typography><Typography variant="caption" color="text.secondary">recovery reserved until · GST</Typography></Box>
    </Stack>}
    <Timeline key={capture.case_id + (personId ?? '')} intervals={intervals} start={start} horizonEnd={plan.horizon_end} reservationEnd={plan.recovery_reservation_end} locations={capture.request.locations} />
  </>;
}

export function CrewProposal({ capture }: { capture: ReplayCapture }) {
  const assigned = [...new Set(capture.response.crew_rest.intervals.filter(i => i.kind === 'work').map(i => i.person_id))];
  const workshopId = capture.request.task_locations.workshop_prep;
  const workshop = capture.request.locations.find(l => l.id === workshopId);
  const fixed = capture.request.snapshot.zone_windows.find(w => w.zone_id === workshopId)?.fixed_occupant_ids ?? [];
  return <>
    {capture.response.crew_rest.planning_status !== 'planned' && <Alert severity="info" sx={{ mb: 2 }}>Workshop planning is waiting for: {capture.response.crew_rest.blockers.map(readable).join(', ') || 'current readiness and observed activity for all crew'}.</Alert>}
    <Typography color="text.secondary" sx={{ mb: 2 }}>{workshop?.label} · {workshop ? workshop.capacity - fixed.length : 0} available places of {workshop?.capacity}. Heavy trench work remains stopped.</Typography>
    <TableContainer><Table size="small" aria-label="Proposed workshop crew"><TableHead><TableRow><TableCell>Worker</TableCell><TableCell>Task</TableCell><TableCell>Readiness</TableCell></TableRow></TableHead>
      <TableBody>{assigned.map(id => <TableRow key={id}><TableCell><Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><Avatar sx={{ width: theme => theme.spacing(4), height: theme => theme.spacing(4), bgcolor: 'action.selected', color: 'primary.main', typography: 'caption' }}>{initials(nameOf(id))}</Avatar><Typography variant="body2">{nameOf(id)}</Typography></Stack></TableCell><TableCell>Workshop preparation</TableCell><TableCell><Chip label="Confirmed" size="small" color="success" variant="outlined" /></TableCell></TableRow>)}</TableBody>
    </Table></TableContainer>
    {!assigned.length && <Typography sx={{ py: 2 }}>No productive assignment is available yet.</Typography>}
    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{capture.request.snapshot.workers.length - assigned.length - capture.response.protective_response.excluded_worker_ids.length} workers remain outside this productive assignment. Recovery and assistance take priority.</Typography>
  </>;
}
