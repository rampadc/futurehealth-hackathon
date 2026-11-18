import { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tooltip, Typography } from '@mui/material';
import type { CaseView } from '../live';
import { liveInstant } from '../LiveClock';
import { nameOf } from '../replay';
import { clockLabel, isoAt, minuteOf, WINDOW_MINUTES } from './model';

type Props = { caseView: CaseView | null; busy: boolean; onJump: (iso: string) => void; hours: number[] };

/** The live case minute, ticking between polls. */
function useCaseMinute(caseView: CaseView | null) {
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setReceivedAt(Date.now()); }, [caseView?.time?.server_now, caseView?.version, caseView?.clock]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(id); }, []);
  return caseView ? minuteOf(liveInstant(caseView, receivedAt, now)) : null;
}

const pct = (minute: number) => `${(Math.max(0, Math.min(WINDOW_MINUTES, minute)) / WINDOW_MINUTES) * 100}%`;

/**
 * The case day, 08:00 to 10:30: hour bands, recorded case events and the current case time.
 * Click or use the arrow keys to move case time. Earlier times start the day again.
 */
export function DayTimeline({ caseView, busy, onJump, hours }: Props) {
  const minute = useCaseMinute(caseView);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const events = (caseView?.story?.events ?? []).filter(e => e.occurred_at).map(e => ({ ...e, minute: minuteOf(e.occurred_at!) }));
  const at = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return Math.round(((clientX - box.left) / box.width) * WINDOW_MINUTES);
  };
  const request = (target: number) => {
    const t = Math.max(0, Math.min(WINDOW_MINUTES - 1, target));
    if (minute !== null && t < minute - 0.1 && events.some(e => !['sensor_reading', 'escalate'].includes(e.id))) setPending(t);
    else onJump(isoAt(t));
  };
  const ended = caseView?.time?.status === 'ended';
  return <Box>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline', mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
      <Typography variant="h3" component="p" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }} aria-live="polite">{minute === null ? '--:--' : clockLabel(Math.min(minute, WINDOW_MINUTES))}</Typography>
      <Typography color="text.secondary">GST · 4 August 2025 · {!caseView ? 'no active case' : ended ? 'case window ended' : 'live, one case minute per real minute'}</Typography>
    </Stack>
    <Box sx={{ position: 'relative', pt: 4, pb: 3, userSelect: 'none' }}>
      {/* Event markers */}
      {events.map((e, i) => <Tooltip key={`${e.id}-${i}`} title={`${clockLabel(e.minute)} · ${e.title}${e.actorId && e.actorId !== 'sensor' && e.actorId !== 'system' ? ` (${nameOf(e.actorId)})` : ''}`} arrow>
        <Box component="span" aria-label={`${clockLabel(e.minute)} ${e.title}`} role="img" sx={{ position: 'absolute', top: 6 + (i % 2) * 10, left: pct(e.minute), transform: 'translateX(-50%)', width: 10, height: 10, borderRadius: '50%', bgcolor: e.id === 'sensor_reading' ? 'warning.main' : e.id === 'escalate' ? 'error.main' : 'primary.main', border: '2px solid', borderColor: 'background.paper', cursor: 'help' }} />
      </Tooltip>)}
      <Box ref={track} role="slider" tabIndex={busy || !caseView ? -1 : 0} aria-label="Case time" aria-valuemin={0} aria-valuemax={WINDOW_MINUTES - 1} aria-valuenow={minute === null ? 0 : Math.floor(minute)} aria-valuetext={minute === null ? 'No active case' : `${clockLabel(minute)} GST`} aria-disabled={busy || !caseView}
        onMouseMove={e => setHover(at(e.clientX))} onMouseLeave={() => setHover(null)}
        onClick={e => { if (!busy && caseView) request(at(e.clientX)); }}
        onKeyDown={e => {
          if (busy || minute === null) return;
          const step = e.shiftKey ? 15 : 1;
          if (e.key === 'ArrowRight') { e.preventDefault(); request(Math.floor(minute) + step); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); request(Math.floor(minute) - step); }
          if (e.key === 'Home') { e.preventDefault(); request(0); }
        }}
        sx={{ position: 'relative', height: 44, display: 'flex', border: '2px solid', borderColor: 'text.primary', cursor: busy || !caseView ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3 } }}>
        {hours.map(h => { const start = (h - 8) * 60; const len = Math.min(60, WINDOW_MINUTES - start);
          return <Box key={h} sx={{ flex: `${len} 0 0`, borderRight: '1px solid', borderColor: 'divider', bgcolor: h % 2 ? 'action.hover' : 'background.paper', px: 1, display: 'flex', alignItems: 'center' }}><Typography variant="caption" color="text.secondary">{String(h).padStart(2, '0')}:00</Typography></Box>; })}
        {minute !== null && <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(minute), bgcolor: 'primary.main', opacity: 0.12, pointerEvents: 'none' }} />}
        {minute !== null && <Box aria-hidden="true" sx={{ position: 'absolute', top: -8, bottom: -8, left: pct(minute), width: 3, ml: '-1.5px', bgcolor: 'error.main', pointerEvents: 'none' }} />}
        {hover !== null && !busy && caseView && <Box aria-hidden="true" sx={{ position: 'absolute', top: 0, bottom: 0, left: pct(hover), width: 0, borderLeft: '2px dashed', borderColor: 'text.secondary', pointerEvents: 'none' }}><Typography variant="caption" sx={{ position: 'absolute', top: 46, left: 4, bgcolor: 'background.paper', px: 0.5, border: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap' }}>Go to {clockLabel(hover)}</Typography></Box>}
      </Box>
      {/* Quarter-hour ticks */}
      {Array.from({ length: WINDOW_MINUTES / 15 + 1 }, (_, i) => i * 15).map(m => <Typography key={m} variant="caption" color="text.secondary" sx={{ position: 'absolute', bottom: 0, left: pct(m), transform: m === 0 ? 'none' : m === WINDOW_MINUTES ? 'translateX(-100%)' : 'translateX(-50%)' }}>{clockLabel(m)}</Typography>)}
    </Box>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
      {[1, 5, 15, 30].map(step => <Button key={step} size="small" variant="outlined" disabled={busy || minute === null || minute + step >= WINDOW_MINUTES} onClick={() => request(Math.floor(minute!) + step)}>+{step} min</Button>)}
      {hours.map(h => <Button key={h} size="small" disabled={busy || !caseView} onClick={() => request((h - 8) * 60)}>Go to {String(h).padStart(2, '0')}:00</Button>)}
    </Stack>
    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>Blue dots are recorded actions, yellow dots sensor readings and red dots escalations. Hover a dot for details. Arrow keys move one minute, Shift + arrow 15 minutes.</Typography>
    <Dialog open={pending !== null} onClose={() => setPending(null)}>
      <DialogTitle>Go back to {pending !== null ? clockLabel(pending) : ''}?</DialogTitle>
      <DialogContent><Typography>Earlier times start the day again at 08:00 and move it forward. Every action people recorded in this case is cleared. Site settings are kept.</Typography></DialogContent>
      <DialogActions><Button onClick={() => setPending(null)}>Cancel</Button><Button color="error" variant="contained" onClick={() => { const t = pending!; setPending(null); onJump(isoAt(t)); }}>Start again at {pending !== null ? clockLabel(pending) : ''}</Button></DialogActions>
    </Dialog>
  </Box>;
}
