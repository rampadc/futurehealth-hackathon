import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { CrewProposal, Schedule } from '../shared/plan';
import { Panel } from '../shared/ui';
import type { WorkspaceProps } from './types';

/** C01 · Huda, civil foreman. Screens: protective response, crew & workshop, stop-work to action card. */
export function ForemanWorkspace({ story, capture, caseView, actions }: WorkspaceProps) {
  const incidentRecorded = caseView.tasks.find(task => task.action === 'incident_record')?.status === 'recorded';
  const revisedEvidencePending = story.reported && (!story.removed || !story.firstaid);
  return <Stack spacing={3}>
    <Panel title="Account for the crew">{actions(['acknowledge', 'stop', 'recover'])}</Panel>
    <Panel title="Record observed readiness and activity"><Typography variant="body2" color="text.secondary">Confirm each worker’s readiness and actual activity. The proposed plan is not an observation.</Typography>{actions(['readiness', 'activity'])}</Panel>
    <Panel title={story.reported ? 'Review the revised crew plan' : 'Move the crew to workshop preparation'} action={<Chip label={revisedEvidencePending ? 'Evidence pending' : story.reported ? 'Revised proposal' : story.assigned ? 'Assignment recorded' : 'Proposal'} color={revisedEvidencePending ? 'warning' : story.assigned && !story.reported ? 'success' : 'primary'} size="small" />}>
      {!story.recovered ? <Alert severity="info">Confirm the stop and recovery headcount before assigning work.</Alert> : revisedEvidencePending ? <Alert severity="warning">Revised crew planning is waiting for recorded assistance: {!incidentRecorded && 'Huda must record Bilal’s site incident. '}{!story.removed && 'Huda must confirm Bilal’s removal and location. '}{!story.firstaid && 'Salim must record first-aid contact.'}</Alert> : <CrewProposal capture={capture} />}
      {!story.reported && actions(['assign'])}
    </Panel>
    {story.reported && <Panel title="Bilal needs assistance" action={<Chip label="Needs rest now" color="error" size="small" />}>
      <Typography sx={{ mb: 1 }}>Keep Bilal off work and confirm his location. Salim records first-aid contact in his own workspace.</Typography>
      {actions(['incident_record', 'remove'])}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>First-aid contact: {story.firstaid ? 'Recorded by Salim' : 'Waiting for Salim'}. A contact record does not clear Bilal to return.</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>After first-aid contact, record a fresh local reading at the trench and the water check for the separate restart review.</Typography>
      {actions(['fresh', 'water', 'leila', 'personnel', 'recovery_check', 'crew_readiness'])}
      {!story.removed || !story.firstaid ? <Alert severity="info" sx={{ mt: 1 }}>Replanning is waiting for removal and first-aid contact.</Alert> : <Box sx={{ mt: 2 }}><Schedule capture={capture} /></Box>}
    </Panel>}
  </Stack>;
}
