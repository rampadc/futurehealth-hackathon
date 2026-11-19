import { useState } from 'react';
import { Box, Button, Link, Paper, Stack, Typography } from '@mui/material';
import type { CaseView } from '../live';
import { ADMIN, PERSONAS } from '../story';
import { PersonAvatar } from '../shared/ui';
import { DEVICE_LABEL } from './model';
import { prepareStep, stepUrl, stepWindow, TUTORIAL_STEPS, type TutorialStep } from './tutorialSteps';

const nameOf = (id: string) => [...PERSONAS, ADMIN].find(p => p.id === id)?.name ?? id;

const SHOTS = import.meta.glob('./tutorial/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const shotFor = (step: TutorialStep) => SHOTS[`./tutorial/${step.id}.png`];

const KEY = 'heat-demo-tutorial-step';
function readStep(): number | null {
  try { const value = localStorage.getItem(KEY); const n = value === null ? NaN : Number(value); return Number.isInteger(n) && n >= 0 && n < TUTORIAL_STEPS.length ? n : null; } catch { return null; }
}
function writeStep(value: number | null) {
  try { if (value === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(value)); } catch { /* The tutorial still works without storage. */ }
}

type Props = {
  busy: boolean;
  /** Runs a case operation through the presenter page, so progress, errors and refresh behave as for the other controls. */
  run: (label: string, operation: () => Promise<CaseView | null>) => Promise<boolean>;
};

/**
 * Presenter tutorial: one row to start, then the shift story as a vertical list where only the
 * current step can be used. Each step's link prepares the case and opens that persona's screen.
 */
export function Tutorial({ busy, run }: Props) {
  const [current, setCurrent] = useState<number | null>(readStep);
  const [progress, setProgress] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const go = (next: number | null) => { setCurrent(next); setOpened(null); setProgress(''); writeStep(next); };

  const open = async (step: TutorialStep) => {
    const { name, features } = stepWindow(step);
    // Open the window inside the click, so it is not blocked, then load the screen once the case is ready.
    const win = window.open('about:blank', name, features);
    try { if (win) { win.document.title = 'Preparing the case'; win.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">Preparing the case…</p>'; } } catch { /* A reused window may still be on another page. */ }
    setOpened(null);
    const ok = await run(`Tutorial step ${TUTORIAL_STEPS.indexOf(step) + 1}`, () => prepareStep(step, setProgress));
    setProgress('');
    if (!ok) { win?.close(); return; }
    if (win) { win.location.href = stepUrl(step); win.focus(); }
    else window.open(stepUrl(step), name, features);
    setOpened(step.id);
  };

  if (current === null) return <Paper variant="outlined" sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
    <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <Box><Typography variant="h6" component="h2">Tutorial</Typography><Typography variant="body2" color="text.secondary">{TUTORIAL_STEPS.length} guided steps through one shift. Each step prepares the case and opens the screen to use.</Typography></Box>
      <Button variant="contained" onClick={() => go(0)}>Start tutorial</Button>
    </Stack>
  </Paper>;

  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}><Stack spacing={2}>
    <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <Box><Typography variant="h6" component="h2">Tutorial</Typography><Typography variant="body2" color="text.secondary">Step {current + 1} of {TUTORIAL_STEPS.length}. Opening a step continues the current case and records any earlier steps that are missing.</Typography></Box>
      <Button variant="outlined" onClick={() => go(null)}>End tutorial</Button>
    </Stack>
    <Box component="ol" aria-label="Tutorial steps" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {TUTORIAL_STEPS.map((step, index) => {
        const active = index === current;
        const done = index < current;
        return <Box component="li" key={step.id} aria-current={active ? 'step' : undefined}
          sx={{ border: '1px solid', borderColor: active ? 'primary.main' : 'divider', borderWidth: active ? 2 : 1, bgcolor: 'background.paper', opacity: active ? 1 : 0.6 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 1.5, py: 1 }}>
            <Box aria-hidden="true" sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600,
              bgcolor: done ? 'success.main' : active ? 'primary.main' : 'transparent', color: done || active ? '#fff' : 'text.secondary', border: done || active ? 0 : '1px solid', borderColor: 'divider' }}>{done ? '✓' : index + 1}</Box>
            <Typography variant="subtitle2" sx={{ flexGrow: 1, minWidth: 0 }}>{step.title}<Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{done ? ' (done)' : active ? ' (current step)' : ''}</Box></Typography>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexShrink: 0, display: { xs: 'none', sm: 'flex' } }}>
              <PersonAvatar id={step.persona} size={3} /><Typography variant="caption" color="text.secondary">{nameOf(step.persona)} · {DEVICE_LABEL[step.device]}</Typography>
            </Stack>
          </Stack>
          {active && <StepDetail step={step} busy={busy} progress={progress} opened={opened === step.id} onOpen={() => void open(step)}
            onNext={() => go(index + 1 < TUTORIAL_STEPS.length ? index + 1 : null)} onBack={index > 0 ? () => go(index - 1) : undefined} last={index + 1 === TUTORIAL_STEPS.length} />}
        </Box>;
      })}
    </Box>
  </Stack></Paper>;
}

function StepDetail({ step, busy, progress, opened, onOpen, onNext, onBack, last }: { step: TutorialStep; busy: boolean; progress: string; opened: boolean; onOpen: () => void; onNext: () => void; onBack?: () => void; last: boolean }) {
  const shot = shotFor(step);
  const linkText = `Open ${nameOf(step.persona)}’s ${DEVICE_LABEL[step.device].toLowerCase()}`;
  return <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: { xs: 1.5, md: 2 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 300px' } }}>
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Box>
        <Typography variant="overline" color="text.secondary">1 · Prepare and open</Typography>
        <Typography variant="body2" sx={{ mb: 0.5 }}>{step.setup === null ? 'Keeps the current case as it is.' : step.reset ? 'Resets the case to 08:00.' : 'Continues the current case and records any missing earlier steps behind the scenes. The case is reset only if this step was already recorded.'}</Typography>
        <Link component="button" type="button" variant="body1" disabled={busy} onClick={onOpen} sx={{ fontWeight: 600, textAlign: 'left', '&[disabled]': { color: 'text.disabled', cursor: 'default', textDecoration: 'none' } }}>{linkText} → {stepUrl(step).split('?')[0]}</Link>
        {progress && <Typography variant="caption" component="p" role="status" color="text.secondary">{progress}…</Typography>}
        {opened && <Typography variant="caption" component="p" role="status" color="success.main">Case ready. The window is open.</Typography>}
      </Box>
      <Box><Typography variant="overline" color="text.secondary">2 · Do this</Typography><Typography variant="body2">{step.click}</Typography></Box>
      <Box><Typography variant="overline" color="text.secondary">On site</Typography><Typography variant="body2">{step.onSite}</Typography></Box>
      <Box><Typography variant="overline" color="text.secondary">In the system</Typography><Typography variant="body2">{step.system}</Typography></Box>
      <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
        <Button variant="contained" disabled={busy} onClick={onNext}>{last ? 'Finish tutorial' : 'Next step'}</Button>
        {onBack && <Button disabled={busy} onClick={onBack}>Previous step</Button>}
      </Stack>
    </Stack>
    <Box sx={{ width: 300, maxWidth: '100%', justifySelf: { xs: 'start', md: 'end' } }}>
      {shot ? <Box component="img" src={shot} alt={`Where to click: ${step.click}`} width={300} height={300} sx={{ display: 'block', width: 300, maxWidth: '100%', height: 'auto', aspectRatio: '1 / 1', objectFit: 'cover', border: '1px solid', borderColor: 'divider' }} />
        : <Box sx={{ width: 300, maxWidth: '100%', aspectRatio: '1 / 1', border: '1px dashed', borderColor: 'divider', display: 'grid', placeItems: 'center', p: 2 }}><Typography variant="caption" color="text.secondary" align="center">{step.click}</Typography></Box>}
      <Typography variant="caption" color="text.secondary">What to select</Typography>
    </Box>
  </Box>;
}
