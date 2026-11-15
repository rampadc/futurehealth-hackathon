import { Avatar, Box, Stack, Typography } from '@mui/material';
import { nameOf } from './replay';
import type { StoryState } from './story';
import { Panel } from './shared/ui';

export function Activity({ story }: { story: StoryState }) {
  return <Panel title="Case activity">
    {story.events.length ? <Stack spacing={0}>{story.events.map((event, index) => <Stack key={event.id} direction="row" spacing={2} sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider' }}><Avatar sx={{ width: theme => theme.spacing(4), height: theme => theme.spacing(4), typography: 'caption', bgcolor: 'action.selected', color: 'primary.main' }}>{index + 1}</Avatar><Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{event.title}</Typography><Typography variant="caption" color="text.secondary">{nameOf(event.actorId)} · Recorded action</Typography></Box></Stack>)}</Stack> : <Typography color="text.secondary">No actions recorded. Maya owns the first site response.</Typography>}
  </Panel>;
}
