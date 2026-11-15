import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, AppBar, Avatar, Box, Button,
  Chip, CircularProgress, Container, Divider,
  List, ListItemButton, ListItemText, Paper,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Toolbar, Typography,
} from '@mui/material';
import { nameOf, type ReplayCapture } from './replay';
import { PERSONAS, type Persona, type StoryState } from './story';
import { Timeline, timeLabel } from './Timeline';
import { ThermalWorkLimit } from './ThermalWorkLimit';
import { copy, reasonLabel } from './copy';
import { CaseSummary } from './CaseSummary';
import { AssistantChat } from './AssistantChat';
import { DemoControl } from './DemoControl';
import { EvidenceAction } from './EvidenceAction';
import { ApiError, live, type CaseView, type Task } from './live';

const readable = reasonLabel;
const firstName = (name: string) => name.split(' ')[0];
const initials = (name: string) => name.split(' ').filter((_, i) => i === 0 || i === 2).map(x => x[0]).join('');
const revisedPlanPending = (story: StoryState) => story.reported && (!story.removed || !story.firstaid);
const revisedPlanWait = (story: StoryState) => `Updated work and recovery times are waiting for ${[!story.removed && 'Huda’s removal and location confirmation', !story.firstaid && 'Salim’s first-aid contact'].filter(Boolean).join(' and ')}.`;

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <Paper variant="outlined" sx={{ p: 3, minWidth: 0 }}>
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
      <Typography variant="h6" component="h2">{title}</Typography>{action}
    </Stack>{children}
  </Paper>;
}

function LaterStep({ title, ready, children }: { title: string; ready: boolean; children: ReactNode }) {
  return ready ? <Panel title={title}>{children}</Panel> : <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<span aria-hidden="true">⌄</span>}><Box><Typography variant="subtitle2">After this · {title}</Typography><Typography variant="caption" color="text.secondary">Waiting for the required handoffs</Typography></Box></AccordionSummary>
    <AccordionDetails>{children}</AccordionDetails>
  </Accordion>;
}

export const workspaceTitles: Record<string, string> = {
  P03: 'Heat response', C01: 'Crew coordination', C05: 'Your work and recovery', C08: 'Work and assistance',
  P06: 'First-aid response', P04: 'Permit review', P05: 'Delivery coordination', P02: 'Restart and handover', P01: 'Project review',
};

function Identity({ person, compact = false }: { person: Persona; compact?: boolean }) {
  return <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
    <Avatar sx={{ bgcolor: 'primary.main', width: theme => theme.spacing(compact ? 4 : 5), height: theme => theme.spacing(compact ? 4 : 5), typography: 'body2' }}>{initials(person.name)}</Avatar>
    <Box><Typography variant={compact ? 'body2' : 'subtitle1'} component="p" sx={{ fontWeight: 600 }}>{person.name}</Typography><Typography variant="caption" color="text.secondary">{person.role} · {person.organisation}</Typography></Box>
  </Stack>;
}

const nextTask = (tasks: Task[]) => tasks.find(task => task.status === 'ready');
const isReady = (caseView: CaseView, id: string) => caseView.tasks.some(task => task.action === id && task.status === 'ready');

function SignIn({ caseView, onSignIn }: { caseView: CaseView | null; onSignIn: (person: Persona) => void }) {
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

type WorkProps = { story: StoryState; person: Persona; capture: ReplayCapture; caseView: CaseView; onAction: (id: string, payload: Record<string, unknown>) => Promise<void>; busy: boolean };

function Schedule({ capture, personId }: { capture: ReplayCapture; personId?: string }) {
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

function CrewProposal({ capture }: { capture: ReplayCapture }) {
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

function Workspace({ story, person, capture, caseView, onAction, busy }: WorkProps) {
  const actions = (ids: string[]) => ids.map(id => <EvidenceAction key={id} action={id} caseView={caseView} person={person} onAction={onAction} busy={busy} />);
  if (person.id === 'P03') {
    const reading = capture.request.snapshot.readings[0];
    return <Stack spacing={3}>
      <Panel title="Civil trench conditions">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 3, alignItems: 'start' }}>
          <ThermalWorkLimit reading={reading} decisionAt={capture.response.decision_at} />
          <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', pl: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Heavy trench work</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>{capture.response.heat.controls.find(control => control.task_id === 'civil_heavy')?.reason_codes.includes('twl_heavy_limit') ? story.issued ? 'The site’s heavy-work heat limit was reached. The stop-work instruction is recorded; the environmental band does not release it.' : 'The site’s heavy-work heat limit is reached. Stop heavy trench work even though the environmental band is green.' : 'The stop-work instruction remains active. Fresh local evidence and a separate review are required.'}</Typography>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>Site task rule · assessed {timeLabel(capture.response.decision_at)} GST</Typography>
            {actions(['issue'])}
          </Box>
        </Box>
      </Panel>
      <LaterStep title="Prepare the restart evidence" ready={isReady(caseView, 'fresh') || story.fresh}><Typography color="text.secondary" sx={{ mb: 1 }}>After the crew response and first-aid handoff, record the fresh local evidence for a separate restart review.</Typography>{actions(['fresh', 'water'])}</LaterStep>
    </Stack>;
  }
  if (person.id === 'C01') {
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
      {actions(['leila', 'personnel', 'recovery_check', 'crew_readiness'])}
      {!story.removed || !story.firstaid ? <Alert severity="info" sx={{ mt: 1 }}>Replanning is waiting for removal and first-aid contact.</Alert> : <Box sx={{ mt: 2 }}><Schedule capture={capture} /></Box>}
    </Panel>}
  </Stack>;
  }
  if (person.id === 'C05' || person.id === 'C08') return <Stack spacing={3}>
    <Panel title={story.reported && person.id === 'C08' ? 'Your work is paused' : 'Your next action'}>
      {story.reported && person.id === 'C08' ? <Alert severity="warning">You are excluded from work. Stay with the site support team. First-aid contact is {story.firstaid ? 'recorded' : 'pending'}.</Alert> : <Typography sx={{ mb: 2 }}>{story.stopped ? 'Trench work is stopped. Follow the crew’s recovery instructions.' : 'Wait for your foreman’s site instruction.'}</Typography>}
      {actions(person.id === 'C05' ? ['checkin'] : ['report'])}
    </Panel>
    <Panel title="Your work and recovery times">{revisedPlanPending(story) ? <Alert severity="info">{revisedPlanWait(story)}</Alert> : story.assigned ? <Schedule capture={capture} personId={person.id} /> : <Typography color="text.secondary">Your foreman has not confirmed the workshop assignment yet.</Typography>}</Panel>
  </Stack>;
  if (person.id === 'P06') return <Panel title="First-aid contact"><Typography sx={{ mb: 2 }}>{story.reported ? 'Bilal needs assistance. Huda confirms removal and location; record your contact separately.' : 'No assistance request is open in this case yet.'}</Typography>{actions(['firstaid'])}<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Clinical notes stay outside the shared operations record.</Typography></Panel>;
  if (person.id === 'P04') return <Panel title="Permit check for trench restart"><Typography sx={{ mb: 2 }}>Confirm the permit check after Maya has supplied the fresh local reading. Rashid retains the restart review.</Typography>{actions(['permit'])}</Panel>;
  if (person.id === 'P05') return <Panel title="Move the materials delivery"><Stack direction="row" spacing={5} sx={{ mb: 3 }}><Box><Typography variant="overline">Current booking</Typography><Typography variant="h4">{story.deliveryAccepted ? '15:30' : '11:30'}</Typography></Box><Box><Typography variant="overline">Requested slot</Typography><Typography variant="h4" color="primary">15:30</Typography></Box></Stack>
    <Typography color="text.secondary" sx={{ mb: 2 }}>The receiving yard is constrained. Keep the original booking until supplier acceptance is recorded.</Typography>{actions(['draftDelivery', 'approveDelivery', 'sendDelivery', 'acceptDelivery'])}<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Acceptance confirms the booking; arrival and unloading remain unconfirmed.</Typography>
  </Panel>;
  if (person.id === 'P02') return <Stack spacing={3}>
    {caseView.tasks.some(task => task.action === 'escalation_followup' && task.status !== 'waiting') && <Panel title="Overdue stop-work acknowledgment"><Typography variant="body2" color="text.secondary">The instruction was not acknowledged by its due time. Record your follow-up; Huda still owns confirmation that work stopped.</Typography>{actions(['escalation_followup'])}</Panel>}
    <Panel title="Conditions for resuming work" action={<Chip label={story.reviewed ? 'Review recorded' : story.fresh && story.permit && capture.response.restart.status === 'ready_for_human_review' ? 'Ready for human review' : 'Evidence pending'} size="small" color={story.fresh && story.permit && capture.response.restart.status === 'ready_for_human_review' ? 'primary' : 'warning'} />}>
      <List dense>{[
        ['Fresh local reading', story.fresh, 'Maya'], ['Permit check', story.permit, 'Tariq'], ['Worker removal', story.removed, 'Huda'], ['First-aid contact', story.firstaid, 'Salim'],
        ['Water check', caseView.capture?.request.restart?.water.status === 'confirmed', 'Maya'], ['Personnel check', caseView.capture?.request.restart?.personnel.status === 'confirmed', 'Huda'], ['Recovery check', caseView.capture?.request.restart?.recovery.status === 'confirmed', 'Huda'], ['Crew readiness check', caseView.capture?.request.restart?.crew_readiness.status === 'confirmed', 'Huda'],
      ].map(([label, done, owner]) => <Box key={String(label)} sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{label}<Typography component="span" color="text.secondary" sx={{ ml: 1 }}>· {owner}</Typography></Typography><Chip size="small" label={done ? 'Recorded' : 'Waiting'} color={done ? 'success' : 'default'} variant="outlined" /></Box>)}</List>
      {capture.response.restart.blockers.length > 0 && <Alert severity="warning" sx={{ my: 2 }}>Restart review is blocked: {capture.response.restart.blockers.map(readable).join(', ')}.</Alert>}
      {actions(['review'])}
      <Typography variant="body2" color="text.secondary">Recording the review does not authorise resuming work. The site decision remains with the superintendent.</Typography>
    </Panel>
    <LaterStep title="Hand over the shift" ready={isReady(caseView, 'handover') || story.handover}><Typography sx={{ mb: 2 }}>Carry the stopped trench work, crew plan and delivery status to the next shift. Restart review can remain open.</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Open decisions: {[!story.fresh && 'fresh reading · Maya', !story.permit && 'permit check · Tariq', !story.reviewed && 'restart review · Rashid', !story.deliveryAccepted && 'supplier acceptance · Noura'].filter(Boolean).join('; ') || 'Separate site decision to resume work'}. Heavy trench work remains stopped.</Typography>{actions(['handover'])}</LaterStep>
  </Stack>;
  return <Panel title="Project impact review"><Typography sx={{ mb: 2 }}>Review the shared chronology and the accepted delivery change after Rashid’s handover. Payroll, supplier charges and reimbursement remain unverified.</Typography>{actions(['costReview'])}<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No cost estimate or commercial entitlement is created by this action.</Typography></Panel>;
}

function Activity({ story }: { story: StoryState }) {
  return <Panel title="Case activity">
    {story.events.length ? <Stack spacing={0}>{story.events.map((event, index) => <Stack key={event.id} direction="row" spacing={2} sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider' }}><Avatar sx={{ width: theme => theme.spacing(4), height: theme => theme.spacing(4), typography: 'caption', bgcolor: 'action.selected', color: 'primary.main' }}>{index + 1}</Avatar><Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{event.title}</Typography><Typography variant="caption" color="text.secondary">{nameOf(event.actorId)} · Recorded action</Typography></Box></Stack>)}</Stack> : <Typography color="text.secondary">No actions recorded. Maya owns the first site response.</Typography>}
  </Panel>;
}

export default function App({ onLockAccess }: { onLockAccess?: () => void } = {}) {
  const [person, setPerson] = useState<Persona | null>(null);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [view, setView] = useState<'workspace' | 'plan' | 'activity'>('workspace');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const assistantButton = useRef<HTMLButtonElement>(null);
  const requestNumber = useRef(0);
  const [path, setPath] = useState(() => window.location.pathname);
  const navigate = (target: string) => { window.history.pushState(null, '', target); setPath(target); };
  const refreshCase = async () => {
    const current = ++requestNumber.current;
    try {
      const next = await live.case();
      if (current === requestNumber.current) { setCaseView(next); setError(''); }
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { setPerson(null); setCaseView(null); }
      if (current === requestNumber.current) setError(cause instanceof Error ? cause.message : copy.loadError);
      return false;
    }
  };
  useEffect(() => {
    let active = true;
    const changed = () => setPath(window.location.pathname);
    window.addEventListener('popstate', changed);
    (async () => {
      try {
        const session = await live.session();
        const currentCase = session.person ? await live.case() : null;
        if (active) { setPerson(session.person); setCaseView(currentCase); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : copy.loadError);
      } finally { if (active) setInitialising(false); }
    })();
    return () => { active = false; requestNumber.current++; window.removeEventListener('popstate', changed); };
  }, []);
  useEffect(() => {
    if (!person) return;
    const events = typeof EventSource === 'undefined' ? null : new EventSource('/api/case/events', { withCredentials: true });
    if (events) events.onmessage = () => { void refreshCase(); };
    const polling = window.setInterval(() => { void refreshCase(); }, 10_000);
    return () => { events?.close(); window.clearInterval(polling); };
  }, [person?.id]);
  const signIn = async (selected: Persona) => {
    setBusy(true); setError('');
    try {
      const result = await live.signIn(selected.id);
      setPerson(result.person); setView('workspace'); setAssistantOpen(false);
      await refreshCase();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in'); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); setError('');
    try {
      await live.signOut();
      requestNumber.current++; setPerson(null); setCaseView(null); setAssistantOpen(false); setDetailsOpen(false); setFeedback('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign out'); }
    finally { setBusy(false); }
  };
  const act = async (action: string, payload: Record<string, unknown>) => {
    if (!caseView || !person || !isReady(caseView, action) || busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      await live.command(caseView, action, payload);
      if (await refreshCase()) setFeedback(`${caseView.tasks.find(task => task.action === action)?.label ?? action}.`);
    } catch (cause) {
      await refreshCase();
      setError(cause instanceof Error ? cause.message : 'The action could not be recorded');
    } finally { setBusy(false); }
  };
  const retryCalculation = async () => {
    if (!caseView?.retry_available || busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      await live.retry(caseView.version);
      if (await refreshCase()) setFeedback('Calculation retried. Review the latest solver status.');
    } catch (cause) {
      await refreshCase();
      setError(cause instanceof Error ? cause.message : 'The calculation could not be retried');
    } finally { setBusy(false); }
  };
  if (initialising) return <Box sx={{ p: 5 }} role="status"><CircularProgress size={24} /> Loading case…</Box>;
  if (path.replace(/\/$/, '') === '/demo-control') return <DemoControl caseView={caseView} onReturn={() => navigate('/')} onChange={async next => { if (person) await refreshCase(); else setCaseView(next); setFeedback(''); }} />;
  if (!person) return <><SignIn caseView={caseView} onSignIn={selected => { void signIn(selected); }} />{error && <Alert severity="error" role="alert" sx={{ position: 'fixed', bottom: 24, right: 24 }}>{error}</Alert>}</>;
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
      <Identity person={person} compact /><Button disabled={busy} onClick={() => void signOut()}>Sign out</Button>
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
