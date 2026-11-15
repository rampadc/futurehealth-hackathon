import { useRef, useState } from 'react';
import { Alert, AppBar, Box, Button, Chip, CircularProgress, Divider, List, ListItemButton, ListItemText, Paper, Stack, Toolbar, Typography } from '@mui/material';
import { nameOf } from './replay';
import { copy } from './copy';
import { CaseSummary } from './CaseSummary';
import { AssistantChat } from './AssistantChat';
import { DemoControl } from './DemoControl';
import { EvidenceAction } from './EvidenceAction';
import { Activity } from './Activity';
import { SignIn } from './SignIn';
import { navigate, parseRoute, usePath } from './router';
import { useCaseSession } from './session';
import { Schedule, revisedPlanPending, revisedPlanWait } from './shared/plan';
import { Identity, Panel, firstName, nextTask, readable } from './shared/ui';
import { DeviceShell } from './shells/DeviceShell';
import { Workspace, workspaceTitles } from './workspaces';

type Props = { onLockAccess?: () => void };

/** Routes between the current desktop app (`/`, `/demo-control`) and the wireframe device shells. */
export default function App({ onLockAccess }: Props = {}) {
  const route = parseRoute(usePath());
  if (route.kind === 'device') return <DeviceShell device={route.device} screen={route.screen} onLockAccess={onLockAccess} />;
  return <DesktopApp demoControl={route.kind === 'demo-control'} onLockAccess={onLockAccess} />;
}

function DesktopApp({ onLockAccess, demoControl }: Props & { demoControl: boolean }) {
  const [view, setView] = useState<'workspace' | 'plan' | 'activity'>('workspace');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const assistantButton = useRef<HTMLButtonElement>(null);
  const session = useCaseSession({
    onSignedIn: () => { setView('workspace'); setAssistantOpen(false); },
    onSignedOut: () => { setAssistantOpen(false); setDetailsOpen(false); },
  });
  const { person, caseView, initialising, busy, error, feedback, setFeedback, refreshCase, act, retryCalculation } = session;

  if (initialising) return <Box sx={{ p: 5 }} role="status"><CircularProgress size={24} /> Loading case…</Box>;
  if (demoControl) return <DemoControl caseView={caseView} onReturn={() => navigate('/')} onChange={async next => { if (person) await refreshCase(); else session.setCaseView(next); setFeedback(''); }} />;
  if (!person) return <><SignIn caseView={caseView} onSignIn={selected => { void session.signIn(selected); }} />{error && <Alert severity="error" role="alert" sx={{ position: 'fixed', bottom: 24, right: 24 }}>{error}</Alert>}</>;
  const story = caseView?.story;
  const capture = caseView?.capture ?? undefined;
  const worker = person.id === 'C05' || person.id === 'C08';
  const retryAvailable = caseView?.retry_available === true;
  const planningStatus = capture?.response.crew_rest.planning_status;
  const planningIssue = planningStatus === 'unknown' || planningStatus === 'model_invalid' || planningStatus === 'infeasible';
  const planningMessage = planningStatus === 'unknown' ? 'A reliable crew plan could not be calculated.' : planningStatus === 'model_invalid' ? 'The current crew plan did not pass validation.' : 'No crew plan meets the current recorded constraints.';
  const retryButton = <Button color="inherit" disabled={busy} onClick={() => void retryCalculation()}>{busy ? 'Retrying…' : 'Retry calculation'}</Button>;
  const remaining = caseView?.tasks.filter(task => task.actor_id === person.id && task.status === 'ready').length ?? 0;
  const next = nextTask(caseView?.tasks ?? []);
  return <Box sx={{ minWidth: 0, minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
    <a href="#main" className="skip-link">Skip to workspace</a>
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}><Toolbar sx={{ gap: 2, minWidth: 0 }}>
      <Typography variant="h6" component="div" color="primary" sx={{ fontWeight: 700 }}>Heat-Safe Crew</Typography><Divider orientation="vertical" flexItem sx={{ my: 2 }} />
      <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, minWidth: 0 }}>Sandline site · Civil area</Typography>
      {caseView && <Button ref={assistantButton} variant={assistantOpen ? 'contained' : 'outlined'} startIcon={<span aria-hidden="true">✦</span>} aria-label={assistantOpen ? 'Hide planning assistant' : 'Open planning assistant'} aria-expanded={assistantOpen} onClick={() => setAssistantOpen(open => !open)}>Ask assistant</Button>}
      <Identity person={person} compact /><Button disabled={busy} onClick={() => void session.signOut()}>Sign out</Button>
      {onLockAccess && <Button onClick={onLockAccess}>Lock access</Button>}
    </Toolbar></AppBar>
    <Box sx={{ display: 'flex', flex: 1, minWidth: 0 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: theme => `${theme.spacing(27)} minmax(0, 1fr)`, flex: 1, minWidth: 0 }}>
        <Box component="aside" sx={{ bgcolor: 'background.paper', borderRight: '1px solid', borderColor: 'divider', p: 2, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 2, pt: 1 }}>YOUR WORKSPACE</Typography>
          <List component="nav" aria-label="Workspace navigation">
            {([['workspace', 'My workspace', remaining ? `${remaining} action${remaining === 1 ? '' : 's'} ready` : 'Your responsibilities'], ['plan', worker ? 'My work & recovery' : 'Crew work & recovery', 'Work and rest times'], ['activity', 'Case activity', 'Shared handoff record']] as const).map(([id, label, detail]) => <ListItemButton key={id} selected={view === id} onClick={() => { setView(id); setFeedback(''); }} sx={{ borderRadius: 1, mb: 0.5 }}><ListItemText primary={label} secondary={detail} slotProps={{ primary: { sx: { typography: 'body2', fontWeight: view === id ? 600 : 400 } }, secondary: { sx: { typography: 'caption' } } }} /></ListItemButton>)}
          </List>
          <Stack spacing={1} sx={{ mt: 'auto', p: 2, alignItems: 'flex-start' }}><Typography variant="caption" component="p" color="text.secondary">{caseView ? `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(caseView.clock)).toUpperCase()} · GST` : 'No active case'}</Typography><Typography variant="body2">Dune civil crew</Typography><Typography variant="caption" component="p" color="text.secondary">Sandline · Dune Civil Works</Typography>{caseView && <Button size="small" onClick={() => setDetailsOpen(true)} sx={{ px: 0 }}>Case summary</Button>}</Stack>
        </Box>
        <Box id="main" component="main" tabIndex={-1} sx={{ p: 3, minWidth: 0 }}><Stack spacing={3} sx={{ maxWidth: theme => theme.spacing(120), mx: 'auto' }}>
          <Box><Typography variant="overline" color="text.secondary">{person.role} · {person.organisation}</Typography><Typography variant="h4" component="h1" sx={{ mt: 0.5, fontWeight: 600 }}>{view === 'workspace' ? workspaceTitles[person.id] : view === 'plan' ? worker ? 'Your work and recovery' : 'Crew work and recovery' : 'Case activity'}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{view === 'workspace' ? `Sandline civil area · ${firstName(person.name)}’s workspace` : view === 'plan' ? 'Workshop preparation and cooled recovery. Heavy trench work remains stopped.' : 'Accountable handoffs across the crew, safety and project teams.'}</Typography></Box>
          {error && <Alert severity="error" role="alert" action={<Button color="inherit" onClick={() => void refreshCase()}>Retry</Button>}>{error}</Alert>}
          {feedback && <Alert severity="success" role="status" onClose={() => setFeedback('')}>{feedback}</Alert>}
          {planningIssue && <Alert severity="warning" action={retryAvailable ? retryButton : undefined}><strong>Crew planning needs review.</strong> {planningMessage} {capture?.response.crew_rest.blockers.length ? `Reasons: ${capture.response.crew_rest.blockers.map(readable).join(', ')}.` : 'Review the current evidence and constraints.'} Heavy trench work remains stopped.</Alert>}
          {!caseView ? <Alert severity="info">There is no active case. Your workspace will show the current case when one is started.</Alert> : !capture || !story ? <>
            {story && <Paper variant="outlined" sx={{ px: 2.5, py: 2, borderLeft: '4px solid', borderLeftColor: story.issued ? 'error.main' : 'warning.main' }}><Typography variant="subtitle2">{story.stopped ? copy.stoppedTitle : story.issued ? copy.instructionTitle : copy.pendingTitle}</Typography><Typography variant="body2" color="text.secondary">{story.stopped ? copy.stoppedDetail : story.issued ? copy.instructionDetail : copy.pendingDetail}</Typography></Paper>}
            <Alert severity={caseView.runs?.[0]?.status === 'processing' ? 'info' : 'error'} action={retryAvailable ? retryButton : undefined}>{caseView.runs?.[0]?.status === 'processing' ? 'The live solver is calculating this case.' : `The current solver response is unavailable. ${caseView.runs?.[0]?.error ?? 'Record the missing current evidence or check the service.'}`}</Alert>
            {view === 'activity' && story && <Activity story={story} />}
            {view === 'workspace' && <Panel title="Record current evidence"><Typography variant="body2" color="text.secondary">The case remains available for your authorised confirmations. Current observed activity may be needed after a clock change.</Typography>{caseView.tasks.filter(task => task.status === 'ready').map(task => <EvidenceAction key={task.action} action={task.action} caseView={caseView} person={person} onAction={act} busy={busy} />)}</Panel>}
          </> : <>
            <Paper variant="outlined" sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, borderLeft: '4px solid', borderLeftColor: story.issued ? 'error.main' : 'warning.main' }}>
              <Box><Typography variant="subtitle2">{story.stopped ? copy.stoppedTitle : story.issued ? copy.instructionTitle : copy.pendingTitle}</Typography><Typography variant="body2" color="text.secondary">{story.stopped ? copy.stoppedDetail : story.issued ? copy.instructionDetail : copy.pendingDetail}</Typography></Box><Chip label={story.stopped ? copy.stoppedStatus : story.issued ? 'Stop-work active' : person.id === 'P03' ? 'Safety review due' : 'Awaiting safety review'} color={story.issued ? 'error' : 'warning'} size="small" />
            </Paper>
            {!worker && next && next.actor_id !== person.id && <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 1 }}><Typography variant="subtitle2" component="h2" sx={{ flexShrink: 0 }}>Next handoff</Typography><Divider orientation="vertical" flexItem /><Typography variant="body2" color="text.secondary">{nameOf(next.actor_id)} · {next.label}</Typography></Stack>}
            {view === 'activity' ? <Activity story={story} /> : view === 'plan' ? <Panel title={worker ? 'Your schedule' : 'Crew schedule'}>{revisedPlanPending(story) ? <Alert severity="info">{revisedPlanWait(story)}</Alert> : story.assigned ? <Schedule capture={capture} personId={worker ? person.id : undefined} /> : <Typography color="text.secondary">The workshop assignment is waiting for the crew response and Huda’s confirmation.</Typography>}</Panel> : <Workspace story={story} person={person} capture={capture} caseView={caseView} onAction={act} busy={busy} />}
          </>}
        </Stack></Box>
      </Box>
      {caseView && story && <AssistantChat key={`${person.id}:${caseView.case_id}`} open={assistantOpen} onClose={() => { setAssistantOpen(false); assistantButton.current?.focus(); }} person={person} story={story} capture={capture} caseId={caseView.case_id} onNavigate={target => { setView(target); setFeedback(''); }} />}
    </Box>
    {caseView && story && <CaseSummary open={detailsOpen} onClose={() => setDetailsOpen(false)} story={story} person={person} capture={capture} tasks={caseView.tasks} onWorkspace={() => { setView('workspace'); setDetailsOpen(false); }} onActivity={() => { setView('activity'); setDetailsOpen(false); }} />}
  </Box>;
}
