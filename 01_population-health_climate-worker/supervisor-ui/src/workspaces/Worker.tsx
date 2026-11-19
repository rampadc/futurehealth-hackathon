import { Alert, Stack, Typography } from '@mui/material';
import { Schedule, revisedPlanPending, revisedPlanWait } from '../shared/plan';
import { Panel } from '../shared/ui';
import type { WorkspaceProps } from './types';

/** C05 · Rana and C08 · Bilal, civil workers. Desktop stand-in for the worker app. */
export function WorkerWorkspace({ story, person, capture, actions }: WorkspaceProps) {
  return <Stack spacing={3}>
    <Panel title={story.reported ? 'Your work is paused' : 'Your next action'}>
      {story.reported ? <Alert severity="warning">You are excluded from work. Stay with the site support team. First-aid contact is {story.firstaid ? 'recorded' : 'pending'}.</Alert> : <Typography sx={{ mb: 2 }}>{story.stopped ? 'Trench work is stopped. Follow the crew’s recovery instructions.' : 'Wait for your foreman’s site instruction.'}</Typography>}
      {actions(person.id === 'C05' ? ['checkin', 'report'] : ['report'])}
    </Panel>
    <Panel title="Your work and recovery times">{revisedPlanPending(story) ? <Alert severity="info">{revisedPlanWait(story)}</Alert> : story.assigned ? <Schedule capture={capture} personId={person.id} /> : <Typography color="text.secondary">Your foreman has not confirmed the workshop assignment yet.</Typography>}</Panel>
  </Stack>;
}
