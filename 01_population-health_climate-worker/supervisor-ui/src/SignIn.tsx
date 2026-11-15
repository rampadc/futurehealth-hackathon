import { Alert, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { nameOf } from './replay';
import { PERSONAS, type Persona } from './story';
import { copy } from './copy';
import type { CaseView } from './live';
import { Identity, firstName, nextTask } from './shared/ui';

export function SignIn({ caseView, onSignIn }: { caseView: CaseView | null; onSignIn: (person: Persona) => void }) {
  const next = nextTask(caseView?.tasks ?? []);
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: 5 }}>
    <Container maxWidth="lg" disableGutters>
      <Typography variant="h6" color="primary" sx={{ mb: 5 }}>Heat-Safe Crew</Typography>
      <Stack direction="row" spacing={5} sx={{ alignItems: 'start', mb: 4 }}>
        <Box sx={{ flex: 1 }}><Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>Sign in to your workspace</Typography>
          <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 700 }}>{copy.signInDescription}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{copy.accountHint}</Typography>
        </Box>
      </Stack>
      {next && <Alert severity="info" sx={{ mb: 3 }}><strong>Next handoff: {firstName(nameOf(next.actor_id))}</strong> · {next.label}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2 }}>
        {PERSONAS.map(person => <Paper variant="outlined" key={person.id} sx={{ p: 3, display: 'flex', flexDirection: 'column', borderColor: next?.actor_id === person.id ? 'primary.main' : 'divider' }}>
          <Identity person={person} />
          <Typography color="text.secondary" variant="body2" sx={{ my: 2, flexGrow: 1 }}>{person.description}</Typography>
          <Button variant={next?.actor_id === person.id ? 'contained' : 'outlined'} onClick={() => onSignIn(person)}>Sign in as {firstName(person.name)}</Button>
        </Paper>)}
      </Box>
    </Container>
  </Box>;
}
