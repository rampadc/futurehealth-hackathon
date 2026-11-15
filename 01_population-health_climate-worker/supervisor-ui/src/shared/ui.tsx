import type { ReactNode } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Avatar, Box, Paper, Stack, Typography } from '@mui/material';
import type { Persona } from '../story';
import type { CaseView, Task } from '../live';
import { reasonLabel } from '../copy';

export const readable = reasonLabel;
export const firstName = (name: string) => name.split(' ')[0];
export const initials = (name: string) => name.split(' ').filter((_, i) => i === 0 || i === 2).map(x => x[0]).join('');
export const nextTask = (tasks: Task[]) => tasks.find(task => task.status === 'ready');
export const isReady = (caseView: CaseView, id: string) => caseView.tasks.some(task => task.action === id && task.status === 'ready');

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <Paper variant="outlined" sx={{ p: 3, minWidth: 0 }}>
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
      <Typography variant="h6" component="h2">{title}</Typography>{action}
    </Stack>{children}
  </Paper>;
}

export function LaterStep({ title, ready, children }: { title: string; ready: boolean; children: ReactNode }) {
  return ready ? <Panel title={title}>{children}</Panel> : <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<span aria-hidden="true">⌄</span>}><Box><Typography variant="subtitle2">After this · {title}</Typography><Typography variant="caption" color="text.secondary">Waiting for the required handoffs</Typography></Box></AccordionSummary>
    <AccordionDetails>{children}</AccordionDetails>
  </Accordion>;
}

export function Identity({ person, compact = false }: { person: Persona; compact?: boolean }) {
  return <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
    <Avatar sx={{ bgcolor: 'primary.main', width: theme => theme.spacing(compact ? 4 : 5), height: theme => theme.spacing(compact ? 4 : 5), typography: 'body2' }}>{initials(person.name)}</Avatar>
    <Box><Typography variant={compact ? 'body2' : 'subtitle1'} component="p" sx={{ fontWeight: 600 }}>{person.name}</Typography><Typography variant="caption" color="text.secondary">{person.role} · {person.organisation}</Typography></Box>
  </Stack>;
}
