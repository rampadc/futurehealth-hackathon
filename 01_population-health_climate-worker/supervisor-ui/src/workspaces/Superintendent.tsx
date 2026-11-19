import { Alert, Box, Chip, List, Stack, Typography } from '@mui/material';
import { LaterStep, Panel, isReady, readable } from '../shared/ui';
import type { WorkspaceProps } from './types';

/** P02 · Rashid, superintendent. Screen: restart review. */
export function SuperintendentWorkspace({ story, capture, caseView, actions }: WorkspaceProps) {
  const reviewReady = story.fresh && story.permit && capture.response.restart.status === 'ready_for_human_review';
  const restart = caseView.capture?.request.restart;
  return <Stack spacing={3}>
    {caseView.tasks.some(task => task.action === 'escalation_followup' && task.status !== 'waiting') && <Panel title="Overdue stop-work acknowledgment"><Typography variant="body2" color="text.secondary">The instruction was not acknowledged by its due time. Record your follow-up; Huda still owns confirmation that work stopped.</Typography>{actions(['escalation_followup'])}</Panel>}
    <Panel title="Conditions for resuming work" action={<Chip label={story.reviewed ? 'Review recorded' : reviewReady ? 'Ready for human review' : 'Evidence pending'} size="small" color={reviewReady ? 'primary' : 'warning'} />}>
      <List dense>{[
        ['Fresh local reading', story.fresh, 'Huda'], ['Permit check', story.permit, 'Tariq'], ['Worker removal', story.removed, 'Huda'], ['First-aid contact', story.firstaid, 'Salim'],
        ['Water check', restart?.water.status === 'confirmed', 'Huda'], ['Personnel check', restart?.personnel.status === 'confirmed', 'Huda'], ['Recovery check', restart?.recovery.status === 'confirmed', 'Huda'], ['Crew readiness check', restart?.crew_readiness.status === 'confirmed', 'Huda'],
      ].map(([label, done, owner]) => <Box key={String(label)} sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{label}<Typography component="span" color="text.secondary" sx={{ ml: 1 }}>· {owner}</Typography></Typography><Chip size="small" label={done ? 'Recorded' : 'Waiting'} color={done ? 'success' : 'default'} variant="outlined" /></Box>)}</List>
      {capture.response.restart.blockers.length > 0 && <Alert severity="warning" sx={{ my: 2 }}>Restart review is blocked: {capture.response.restart.blockers.map(readable).join(', ')}.</Alert>}
      {actions(['review'])}
      <Typography variant="body2" color="text.secondary">Recording the review does not authorise resuming work. The site decision remains with the superintendent.</Typography>
    </Panel>
    <LaterStep title="Hand over the shift" ready={isReady(caseView, 'handover') || story.handover}><Typography sx={{ mb: 2 }}>Carry the stopped trench work, crew plan and delivery status to the next shift. Restart review can remain open.</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Open decisions: {[!story.fresh && 'fresh reading · Maya', !story.permit && 'permit check · Tariq', !story.reviewed && 'restart review · Rashid', !story.deliveryAccepted && 'supplier acceptance · Noura'].filter(Boolean).join('; ') || 'Separate site decision to resume work'}. Heavy trench work remains stopped.</Typography>{actions(['handover'])}</LaterStep>
  </Stack>;
}
