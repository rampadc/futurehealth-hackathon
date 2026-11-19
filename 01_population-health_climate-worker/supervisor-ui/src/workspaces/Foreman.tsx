import { useState } from 'react';
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { caseWorkers } from '../commands';
import { nameOf } from '../replay';
import { CrewProposal, Schedule } from '../shared/plan';
import { Panel } from '../shared/ui';
import { incidentPersonId } from '../story';
import type { WorkspaceProps } from './types';

const first = (id: string) => nameOf(id).split(' ')[0];

/** C01 · Huda, civil foreman. Screens: protective response, crew & workshop, stop-work to action card. */
export function ForemanWorkspace(props: WorkspaceProps) {
  const { story, capture, caseView, actions } = props;
  const incidentRecorded = caseView.tasks.find(task => task.action === 'incident_record')?.status === 'recorded';
  const revisedEvidencePending = story.reported && (!story.removed || !story.firstaid);
  const id = incidentPersonId(story);
  const name = id ? first(id) : '';
  return <Stack spacing={3}>
    <Panel title="Account for the crew">{actions(['acknowledge', 'stop', 'recover'])}</Panel>
    <ReportPanel {...props} />
    <Panel title="Record observed readiness and activity"><Typography variant="body2" color="text.secondary">Confirm each worker’s readiness and actual activity. The proposed plan is not an observation.</Typography>{actions(['readiness', 'activity'])}</Panel>
    <Panel title={story.reported ? 'Review the revised crew plan' : 'Move the crew to workshop preparation'} action={<Chip label={revisedEvidencePending ? 'Evidence pending' : story.reported ? 'Revised proposal' : story.assigned ? 'Assignment recorded' : 'Proposal'} color={revisedEvidencePending ? 'warning' : story.assigned && !story.reported ? 'success' : 'primary'} size="small" />}>
      {!story.recovered ? <Alert severity="info">Confirm the stop and recovery headcount before assigning work.</Alert> : revisedEvidencePending ? <Alert severity="warning">Revised crew planning is waiting for recorded assistance: {!incidentRecorded && `Huda must record ${name}’s site incident. `}{!story.removed && `Huda must confirm ${name}’s removal and location. `}{!story.firstaid && 'Salim must record first-aid contact.'}</Alert> : <CrewProposal capture={capture} />}
      {!story.reported && actions(['assign'])}
    </Panel>
    {id && <Panel title={`${name} needs assistance`} action={<Chip label="Needs rest now" color="error" size="small" />}>
      <Typography sx={{ mb: 1 }}>Keep {name} off work and confirm {name}’s location. Salim records first-aid contact in his own workspace.</Typography>
      {actions(['incident_record', 'remove'])}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>First-aid contact: {story.firstaid ? 'Recorded by Salim' : 'Waiting for Salim'}. A contact record does not clear {name} to return.</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>After first-aid contact, record a fresh local reading at the trench and the water check for the separate restart review.</Typography>
      {actions(['fresh', 'water', 'leila', 'personnel', 'recovery_check', 'crew_readiness'])}
      {!story.removed || !story.firstaid ? <Alert severity="info" sx={{ mt: 1 }}>Replanning is waiting for removal and first-aid contact.</Alert> : <Box sx={{ mt: 2 }}><Schedule capture={capture} /></Box>}
    </Panel>}
  </Stack>;
}

/** Report a crew member who has no phone or is too unwell to use one. No symptom detail is recorded. */
function ReportPanel({ story, caseView, onAction, busy }: WorkspaceProps) {
  const [pick, setPick] = useState('');
  const [answer, setAnswer] = useState<'no' | 'yes' | null>(null);
  const reports = story.reports ?? [];
  const reported = new Set(reports.map(r => r.person_id));
  const known = caseWorkers(caseView).map(w => w.person_id);
  const ids = (known.length ? known : Array.from({ length: 11 }, (_, i) => `C${String(i + 2).padStart(2, '0')}`)).filter(id => !reported.has(id));
  const task = caseView.tasks.find(t => t.action === 'report' && t.actor_id === 'C01');
  const record = () => void onAction('report', { person_id: pick }).then(() => { setPick(''); setAnswer(null); });
  return <Panel title="Report an unwell worker">
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>For a worker without a phone or too unwell to use one. Their name is recorded; no health detail is recorded.</Typography>
    {reports.length > 0 && <Stack spacing={0.5} sx={{ mb: 2 }}>{reports.map(r => <Typography key={r.person_id} variant="body2"><Chip label="Needs rest now" color="error" size="small" sx={{ mr: 1 }} />{nameOf(r.person_id)} ({r.person_id}) · {r.via === 'foreman' ? 'reported by Huda' : r.via === 'kiosk' ? 'reported at the Shelter A kiosk' : 'reported on the worker app'}</Typography>)}</Stack>}
    {task && ids.length > 0 && <Stack spacing={2} sx={{ maxWidth: 480 }}>
      <TextField select size="small" label="Worker" value={pick} onChange={e => { setPick(e.target.value); setAnswer(null); }}>
        {ids.map(id => <MenuItem key={id} value={id}>{nameOf(id)} ({id})</MenuItem>)}
      </TextField>
      {pick && <>
        <Typography>Is {first(pick)} confused, have they vomited, or have they stopped sweating?</Typography>
        <ToggleButtonGroup exclusive size="small" value={answer} onChange={(_, value) => setAnswer(value)}>
          <ToggleButton value="no">No</ToggleButton>
          <ToggleButton value="yes" color="error">Yes, one of these</ToggleButton>
        </ToggleButtonGroup>
        {answer === 'yes' && <Alert severity="error">Emergency. Call 998 now. Start cooling and keep someone with {first(pick)}.</Alert>}
        <Button variant="contained" color="error" disabled={!answer || busy} onClick={record}>Report {first(pick)} unwell</Button>
      </>}
    </Stack>}
  </Panel>;
}
