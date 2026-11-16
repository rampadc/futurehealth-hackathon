import { useEffect, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Container, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { live, type CaseView } from './live';
import { applyPreset, readingPayload, SCENARIO_PRESETS, type ReadingKind } from './scenarioPresets';
import { timeLabel } from './Timeline';
import { LiveClock } from './LiveClock';

type Props = { caseView: CaseView | null; onChange: (next: CaseView | null) => Promise<void>; onReturn: () => void };
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
function JsonDetails({ title, value }: { title: string; value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  return <Accordion variant="outlined" disableGutters expanded={expanded} onChange={(_, open) => setExpanded(open)}><AccordionSummary expandIcon={<span aria-hidden="true">⌄</span>}><Typography variant="subtitle2">{title}</Typography></AccordionSummary>{expanded && <AccordionDetails><Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, maxHeight: 360, overflow: 'auto', m: 0 }}>{pretty(value)}</Box></AccordionDetails>}</Accordion>;
}

type WorkflowRun = { id: string; version: number; status: string; http_status?: number | null; applied?: boolean; error?: string | null; graph_events?: string[]; started_at?: string; finished_at?: string; request?: unknown; response?: unknown };
type ModelRun = { id: string; persona_id?: string; recorded_at?: string; status?: string; [key: string]: unknown };
type SolverCall = { endpoint: string; http_status: number };

const READING_KINDS: Array<[ReadingKind, string]> = [['valid', 'Valid, measured now'], ['fault', 'Sensor fault (invalid)'], ['stale', 'Stale (measured 10 min ago)']];

export function DemoControl({ caseView, onChange, onReturn }: Props) {
  const [presenterCase, setPresenterCase] = useState<CaseView | null>(caseView);
  const [twl, setTwl] = useState('145');
  const [readingKind, setReadingKind] = useState<ReadingKind>('valid');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [agentRuns, setAgentRuns] = useState<ModelRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedModelRunId, setSelectedModelRunId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const loadSequence = useRef(0);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const loadRuns = async () => {
    const sequence = ++loadSequence.current;
    try { const value = await live.demoState(); if (sequence === loadSequence.current) setPresenterCase(value); } catch (cause) { if (sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : 'Unable to load presenter case'); }
    try { const value = await live.runs(); if (sequence === loadSequence.current) setRuns(Array.isArray(value) ? value as WorkflowRun[] : []); } catch (cause) { if (sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : 'Unable to load workflow runs'); }
    try { const value = await live.agentRuns(); if (sequence === loadSequence.current) setAgentRuns(Array.isArray(value) ? value as ModelRun[] : []); } catch (cause) { if (sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : 'Unable to load model runs'); }
  };
  useEffect(() => {
    const refresh = () => { if (!busyRef.current) void loadRuns(); };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); loadSequence.current++; };
  }, [caseView?.version]);
  const execute = async (label: string, operation: () => Promise<unknown>) => {
    loadSequence.current++;
    setBusy(true); setError(''); setMessage('');
    try { const next = await operation(); setPresenterCase(next as CaseView | null); await onChange(next as CaseView | null); await loadRuns(); setMessage(`${label} complete.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `${label} failed`); }
    finally { setBusy(false); }
  };
  const selectedRun = runs.find(run => run.id === selectedRunId) ?? runs[0];
  const selectedModelRun = agentRuns.find(run => run.id === selectedModelRunId) ?? agentRuns[0];
  const solverCalls = (selectedRun?.response as { solver_calls?: SolverCall[] } | null)?.solver_calls ?? [];
  return <Box component="main" sx={{ minHeight: '100vh', bgcolor: 'background.default', p: 4 }}><Container maxWidth="md"><Stack spacing={3}>
    <Box><Typography variant="overline" color="text.secondary">Heat-Safe Crew · Presenter tools</Typography><Typography variant="h4" component="h1">Demo controls</Typography></Box>
    <Alert severity="info">These controls operate the live local case. They are separate from the product workspace.</Alert>
    {error && <Alert severity="error" role="alert">{error}</Alert>}{message && <Alert severity="success" role="status">{message}</Alert>}
    <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
      <Typography variant="h6" component="h2">Case</Typography>
      <Typography variant="body2">{presenterCase ? <>Active case {presenterCase.case_id} · version {presenterCase.version} · <LiveClock view={presenterCase} /></> : 'No active case'}</Typography>
      <Stack direction="row" spacing={2}><Button variant="contained" disabled={busy || !!presenterCase} onClick={() => void execute('Case start', live.start)}>Start heat response case</Button><Button color="error" variant="outlined" disabled={busy || !presenterCase} onClick={() => void execute('Case reset', live.reset)}>Reset active case</Button></Stack>
    </Stack></Paper>
    <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
      <Typography variant="h6" component="h2">Scenario presets</Typography>
      <Typography variant="body2" color="text.secondary">Each preset resets the case, then sets a local reading. It does not record a person’s instruction, stop, headcount or symptom report.</Typography>
      <Stack spacing={1.5}>{SCENARIO_PRESETS.map(preset => <Stack key={preset.id} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Button variant="outlined" disabled={busy} sx={{ flexShrink: 0 }} onClick={() => void execute(preset.title, () => applyPreset(preset, live))}>{preset.title}</Button>
        <Typography variant="body2">{preset.detail}</Typography>
      </Stack>)}</Stack>
    </Stack></Paper>
    <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
      <Typography variant="h6" component="h2">Local reading signal</Typography>
      <Typography variant="body2" color="text.secondary">A sensor fault or a stale reading never clears a hold. Use them to show the sensor-failure and stale-evidence countercases.</Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <TextField label="Thermal Work Limit (W/m²)" type="number" size="small" disabled={busy} value={twl} onChange={event => setTwl(event.target.value)} />
        <TextField select label="Reading" size="small" disabled={busy} value={readingKind} onChange={event => setReadingKind(event.target.value as ReadingKind)} sx={{ minWidth: 220 }}>
          {READING_KINDS.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <Button variant="contained" disabled={busy || !presenterCase || !Number.isFinite(Number(twl)) || Number(twl) <= 0 || Number(twl) >= 500} onClick={() => void execute('Reading signal', () => live.signal(presenterCase!.case_id, readingPayload(presenterCase!, Number(twl), readingKind)))}>Inject reading</Button>
      </Stack>
    </Stack></Paper>
    {presenterCase && <Paper variant="outlined" sx={{ p: 3 }}><Typography variant="h6" component="h2" sx={{ mb: 2 }}>Current workflow</Typography><Stack spacing={1}>{presenterCase.tasks.map(task => <Typography variant="body2" key={`${task.actor_id}:${task.action}`}>{task.actor_id} · {task.label} · {task.status}{task.reason ? ` · ${task.reason}` : ''}</Typography>)}</Stack><Box sx={{ mt: 2 }}><JsonDetails title="Solver response" value={{ status: presenterCase.capture?.http_status, provenance: presenterCase.capture?.provenance, response: presenterCase.capture?.response ?? null }} /></Box></Paper>}
    <Paper variant="outlined" sx={{ p: 3 }}><Typography variant="h6" component="h2" sx={{ mb: 2 }}>Run evidence</Typography><Stack spacing={2}>
      <Typography variant="subtitle1">Workflow and solver runs · {runs.length}</Typography>
      {selectedRun ? <><TextField select label="Workflow run" size="small" value={selectedRun.id} onChange={event => setSelectedRunId(event.target.value)}>{runs.map(run => <MenuItem key={run.id} value={run.id}>Version {run.version} · {run.status} · HTTP {run.http_status ?? '—'}</MenuItem>)}</TextField><Typography variant="body2">Version {selectedRun.version} · {selectedRun.status} · solver HTTP {selectedRun.http_status ?? '—'} · {selectedRun.applied ? 'Published to case' : 'Not published to case'}{selectedRun.error ? ` · ${selectedRun.error}` : ''}</Typography><Typography variant="caption" color="text.secondary">Graph: {selectedRun.graph_events?.join(' → ') || 'No graph nodes recorded'}</Typography><Box><Typography variant="subtitle2">Solver endpoint calls</Typography>{solverCalls.length ? solverCalls.map((call, index) => <Typography key={`${call.endpoint}-${index}`} variant="body2">POST {call.endpoint} · HTTP {call.http_status}</Typography>) : <Typography variant="body2" color="text.secondary">No endpoint calls recorded.</Typography>}</Box><JsonDetails key={selectedRun.id} title="Selected workflow run JSON" value={selectedRun} /></> : <Typography variant="body2" color="text.secondary">No workflow runs recorded.</Typography>}
      <Typography variant="subtitle1">Model runs · {agentRuns.length}</Typography>
      {selectedModelRun ? <><TextField select label="Model run" size="small" value={selectedModelRun.id} onChange={event => setSelectedModelRunId(event.target.value)}>{agentRuns.map(run => <MenuItem key={run.id} value={run.id}>{run.persona_id ?? 'Agent'} · {run.recorded_at ?? run.id}</MenuItem>)}</TextField><Typography variant="body2">{selectedModelRun.persona_id ?? 'Agent'} · {selectedModelRun.recorded_at ?? 'Time unavailable'}{selectedModelRun.status ? ` · ${selectedModelRun.status}` : ''}</Typography><JsonDetails key={selectedModelRun.id} title="Selected model run JSON" value={selectedModelRun} /></> : <Typography variant="body2" color="text.secondary">No model runs recorded.</Typography>}
    </Stack></Paper>
    <Button variant="outlined" onClick={onReturn}>Return to app</Button>
  </Stack></Container></Box>;
}
