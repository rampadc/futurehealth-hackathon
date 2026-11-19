import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, Typography,
} from '@mui/material';
import { incidentPersonId, isStanding, type Persona, type StoryState } from './story';
import { nameOf, type ReplayCapture } from './replay';
import type { Task } from './live';
import { taskReason } from './copy';

export function caseSituation(story: StoryState): string {
  if (story.handover) return 'Rashid has recorded the shift handover. The next shift inherits the stopped trench work, crew recovery arrangements and the delivery booking.';
  const reported = incidentPersonId(story);
  if (reported) {
    const name = nameOf(reported).split(' ')[0];
    return story.firstaid
      ? `${name}’s removal from work and contact with Salim are recorded. ${name}’s return to work has not been confirmed. The remaining crew plan can be reviewed separately.`
      : `${name} is reported unwell. Huda needs to confirm ${name}’s removal and location, and Salim needs to record first-aid contact.`;
  }
  if (story.assigned) return 'Huda has confirmed the workshop assignment. The crew’s work and recovery times are available in the schedule. Heavy trench work remains stopped.';
  if (story.recovered) return 'Huda has accounted for the affected crew in cooled recovery. The next decision is who can move to workshop preparation.';
  if (story.stopped) return 'Huda has confirmed that heavy trench work has stopped. The crew’s recovery headcount still needs confirmation.';
  if (story.issued) return 'Maya has issued the stop-work instruction. Huda still needs to acknowledge it and confirm that heavy trench work has stopped.';
  return 'A local heat reading at the civil trench needs review. Maya needs to decide on the stop-work instruction for heavy trench work.';
}

type Props = {
  open: boolean; onClose: () => void; story: StoryState; person: Persona;
  capture: ReplayCapture | undefined; tasks: Task[]; onWorkspace: () => void; onActivity: () => void;
};

export function CaseSummary({ open, onClose, story, person, capture, tasks, onWorkspace, onActivity }: Props) {
  const next = tasks.find(task => task.status === 'ready' && !isStanding(task.action));
  const waiting = tasks.find(task => task.status === 'waiting');
  const isWorker = person.id === 'C05' || person.id === 'C08';
  const mine = tasks.filter(task => task.actor_id === person.id && task.status === 'ready' && !isStanding(task.action));
  const progress = [
    ['Heavy work stopped', story.stopped ? 'Confirmed by Huda' : 'Awaiting Huda’s confirmation'],
    ['Crew in cooled recovery', story.recovered ? 'Headcount confirmed by Huda' : 'Headcount not yet confirmed'],
    ['Workshop assignment', story.assigned ? 'Confirmed by Huda' : 'Not yet confirmed'],
    ...(story.reported && !isWorker ? [[`Assistance for ${nameOf(incidentPersonId(story) ?? 'C08').split(' ')[0]}`, story.firstaid ? 'Contact with Salim recorded' : 'Waiting for first-aid contact']] : []),
    ...(story.deliveryDrafted ? [['Materials delivery', story.deliveryAccepted ? '15:30 booking accepted by the supplier' : story.deliverySent ? 'Supplier response pending; 11:30 remains booked' : 'Later booking request being prepared']] : []),
  ];
  return <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="case-summary-title">
    <DialogTitle id="case-summary-title">Case summary</DialogTitle>
    <DialogContent>
      <Stack spacing={3}>
        <Box><Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>What’s happening</Typography><Typography variant="body2">{isWorker ? 'Follow the work restriction and your foreman’s instructions. Your own work and recovery times are available in your workspace once assigned.' : caseSituation(story)}</Typography></Box>
        <Box><Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>People and work affected</Typography><Typography variant="body2">{capture ? `${capture.request.snapshot.workers.length} people in the Dune civil crew` : 'The Dune civil crew'} · Sandline civil area. The restriction applies to heavy trench work; workshop preparation has its own readiness and recovery requirements.</Typography></Box>
        <Alert severity={story.issued ? 'error' : 'warning'}>
          <Typography variant="subtitle2" component="h2">Work status</Typography>
          <Typography variant="body2">{story.stopped ? 'Heavy trench work is stopped. Conditions must be reviewed by Rashid before any decision to resume.' : story.issued ? 'The stop-work instruction has been issued. Confirmation that work has stopped is still outstanding.' : 'The local heat finding is awaiting Maya’s review.'}</Typography>
        </Alert>
        <Box><Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>What happens next</Typography>
          {isWorker ? <Typography variant="body2">Your foreman coordinates crew handoffs. Check your workspace for your own action.</Typography> : next ? <><Typography variant="body2" sx={{ fontWeight: 600 }}>{nameOf(next.actor_id)}</Typography><Typography variant="body2">{next.label}</Typography></> : waiting ? <Typography variant="body2">Your next handoff is waiting for other recorded evidence. {taskReason(waiting.reason)}</Typography> : <Typography variant="body2">Your recorded handoffs are complete. Heavy trench work still needs a separate site decision before it can resume.</Typography>}
        </Box>
        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1 }}><Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>Your next action</Typography>
          {mine.length ? <Stack spacing={1} sx={{ alignItems: 'flex-start' }}><Typography variant="body2">{mine[0].label}</Typography><Button variant="contained" size="small" onClick={onWorkspace}>Go to my workspace</Button></Stack> : <Typography variant="body2">{taskReason(waiting?.reason) ?? 'Your recorded actions are available in the case activity.'}</Typography>}
        </Box>
        <Divider />
        <Stack spacing={1.5}>{progress.map(([label, status]) => <Box key={label}><Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography><Typography variant="body2" color="text.secondary">{status}</Typography></Box>)}</Stack>
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={onActivity}>View case activity</Button><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
