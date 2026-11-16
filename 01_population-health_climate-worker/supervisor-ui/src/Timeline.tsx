import { useId, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Chip, Slider, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useTheme,
} from '@mui/material';
import { nameOf } from './replay';
import { initialsOf, photoUrl, usePhotos } from './people';
import type { Interval } from './replay';
export type { Interval } from './replay';

interface TimelineProps {
  intervals: Interval[];
  start: string;
  horizonEnd: string;
  reservationEnd: string | null;
  locations: { id: string; label: string }[];
}

const dubaiTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const dubaiDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric',
});

export function timeLabel(timestamp: string): string {
  return dubaiTime.format(new Date(timestamp));
}

export function dateLabel(timestamp: string): string {
  return dubaiDate.format(new Date(timestamp));
}

const kindLabel = (kind: string) => kind.replaceAll('_', ' ');

export function Timeline({ intervals, start, horizonEnd, reservationEnd, locations }: TimelineProps) {
  const theme = useTheme();
  usePhotos();
  const colors: Record<string, string> = {
    work: theme.palette.primary.main,
    recovery: theme.palette.success.main,
    unavailable: theme.palette.error.main,
    welfare: theme.palette.error.main,
  };
  const titleId = useId();
  const startMs = Date.parse(start);
  const horizonMs = Date.parse(horizonEnd);
  const endMs = Math.max(horizonMs, reservationEnd ? Date.parse(reservationEnd) : horizonMs);
  const totalMinutes = Math.max(0, Math.ceil((endMs - startMs) / 60_000));
  const [selectedMinute, setSelectedMinute] = useState(0);
  const minute = Math.min(selectedMinute, totalMinutes);
  const currentMs = startMs + minute * 60_000;
  const workers = [...new Set(intervals.map((interval) => interval.person_id))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const locationById = new Map(locations.map((location) => [location.id, location.label]));
  const locationLabel = (id: string) => locationById.get(id) ?? id;

  const chartWidth = 760;
  const chartLeft = 152;
  const chartRight = 20;
  const chartTop = 30;
  const laneHeight = 24;
  const chartHeight = chartTop + workers.length * laneHeight + 30;
  const plotWidth = chartWidth - chartLeft - chartRight;
  const spanMs = Math.max(endMs - startMs, 1);
  const x = (timestamp: number) => chartLeft + ((timestamp - startMs) / spanMs) * plotWidth;
  const horizonX = x(horizonMs);
  const endX = x(endMs);
  const nowX = x(currentMs);
  const ticks = [...new Set([startMs, startMs + (horizonMs - startMs) / 2, horizonMs, endMs])]
    .filter((timestamp) => timestamp >= startMs && timestamp <= endMs);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Crew plan</Typography>
        {Object.entries(colors).filter(([kind]) => kind !== 'welfare').map(([kind, color]) => (
          <Stack key={kind} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 11, height: 11, borderRadius: 0.5, bgcolor: color }} />
            <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{kindLabel(kind)}</Typography>
          </Stack>
        ))}
        {endMs > horizonMs && <Typography variant="caption">Shaded: reserved recovery after horizon</Typography>}
      </Stack>

      {workers.length ? (
        <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
          <svg
            role="img"
            aria-labelledby={titleId}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            style={{ display: 'block', width: '100%', minWidth: 620, height: 'auto' }}
          >
            <title id={titleId}>Crew work and recovery timeline on {dateLabel(start)}, Dubai time</title>
            {endMs > horizonMs && (
              <rect x={horizonX} y={chartTop - 10} width={endX - horizonX} height={workers.length * laneHeight + 16} fill={theme.palette.action.hover} />
            )}
            {workers.map((worker, index) => {
              const y = chartTop + index * laneHeight;
              return (
                <g key={worker}>
                  {/* Each lane leads with the person's round crew photo (initials when there is none). */}
                  <clipPath id={`${titleId}-face-${index}`}><circle cx={14} cy={y + 11} r={10} /></clipPath>
                  <circle cx={14} cy={y + 11} r={10.5} fill={theme.palette.background.paper} stroke={theme.palette.text.primary} strokeWidth="1" />
                  {photoUrl(worker)
                    ? <image href={photoUrl(worker)!} x={4} y={y + 1} width={20} height={20} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${titleId}-face-${index})`} />
                    : <text x={14} y={y + 15} textAnchor="middle" fontSize="8" fontWeight="700" fill={theme.palette.text.primary}>{initialsOf(worker)}</text>}
                  <text x={30} y={y + 15} textAnchor="start" fontSize="12" fill={theme.palette.text.primary}>{nameOf(worker)}</text>
                  <line x1={chartLeft} y1={y + laneHeight - 1} x2={endX} y2={y + laneHeight - 1} stroke={theme.palette.divider} />
                </g>
              );
            })}
            {intervals.map((interval, index) => {
              const lane = workers.indexOf(interval.person_id);
              const from = Math.max(startMs, Date.parse(interval.starts_at));
              const to = Math.min(endMs, Date.parse(interval.ends_at));
              if (lane < 0 || to <= from) return null;
              const y = chartTop + lane * laneHeight + 3;
              const fill = colors[interval.kind] ?? theme.palette.text.secondary;
              const baseTo = Math.min(to, horizonMs);
              const reservationFrom = Math.max(from, horizonMs);
              const description = `${nameOf(interval.person_id)} (${interval.person_id}): ${kindLabel(interval.kind)} at ${locationLabel(interval.zone_id)}, ${timeLabel(interval.starts_at)}–${timeLabel(interval.ends_at)} Dubai time${interval.task_id ? `, task ${interval.task_id}` : ''}`;
              return (
                <g key={`${interval.person_id}-${interval.starts_at}-${interval.kind}-${index}`}>
                  <title>{description}</title>
                  {baseTo > from && <rect x={x(from)} y={y} width={Math.max(1, x(baseTo) - x(from))} height={17} rx="3" fill={fill} />}
                  {to > reservationFrom && (
                    <rect x={x(reservationFrom)} y={y} width={Math.max(1, x(to) - x(reservationFrom))} height={17} rx="3" fill={fill} fillOpacity="0.55" stroke={fill} strokeDasharray="3 2" />
                  )}
                </g>
              );
            })}
            {ticks.map((timestamp) => (
              <g key={timestamp}>
                <line x1={x(timestamp)} y1={chartTop - 13} x2={x(timestamp)} y2={chartTop + workers.length * laneHeight + 2} stroke={timestamp === horizonMs ? theme.palette.text.secondary : theme.palette.divider} strokeDasharray={timestamp === horizonMs ? '4 3' : '2 4'} />
                <text x={x(timestamp)} y={chartHeight - 8} textAnchor={timestamp === startMs ? 'start' : timestamp === endMs ? 'end' : 'middle'} fontSize="11" fill={theme.palette.text.secondary}>{timeLabel(new Date(timestamp).toISOString())}</text>
              </g>
            ))}
            <line x1={nowX} y1={chartTop - 13} x2={nowX} y2={chartTop + workers.length * laneHeight + 2} stroke={theme.palette.text.primary} strokeWidth="2" />
          </svg>
        </Box>
      ) : <Typography color="text.secondary">No crew intervals in this plan.</Typography>}

      <Box sx={{ px: 1, pt: 2 }}>
        <Typography id={`${titleId}-slider`} variant="body2" sx={{ fontWeight: 600 }}>
          Inspect minute · {timeLabel(new Date(currentMs).toISOString())} Dubai time
        </Typography>
        <Slider
          aria-labelledby={`${titleId}-slider`}
          min={0}
          max={totalMinutes}
          step={1}
          value={minute}
          onChange={(_, value) => setSelectedMinute(value as number)}
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => timeLabel(new Date(startMs + value * 60_000).toISOString())}
          disabled={totalMinutes === 0}
        />
      </Box>

      <Stack direction="row" spacing={0.75} useFlexGap sx={{ mb: 2, flexWrap: 'wrap' }} aria-live="polite">
        {workers.map((worker) => {
          const active = intervals.find((interval) => interval.person_id === worker &&
            Date.parse(interval.starts_at) <= currentMs && currentMs < Date.parse(interval.ends_at));
          return (
            <Chip
              key={worker}
              size="small"
              variant="outlined"
              label={`${nameOf(worker)}: ${active ? `${kindLabel(active.kind)} · ${locationLabel(active.zone_id)}` : 'no interval'}`}
              sx={{ borderColor: active ? colors[active.kind] ?? theme.palette.text.secondary : undefined }}
            />
          );
        })}
      </Stack>

      <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <AccordionSummary expandIcon={<span aria-hidden="true">⌄</span>}>
          <Typography sx={{ fontWeight: 600 }}>Exact intervals ({intervals.length})</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
            <Table size="small" aria-label="Exact crew intervals" sx={{ minWidth: 560 }}>
              <TableHead><TableRow>
                <TableCell>Worker</TableCell><TableCell>Kind</TableCell><TableCell>Location</TableCell>
                <TableCell>From (Dubai)</TableCell><TableCell>To (Dubai)</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {intervals.map((interval, index) => (
                  <TableRow key={`${interval.person_id}-${interval.starts_at}-${interval.kind}-${index}`}>
                    <TableCell>{nameOf(interval.person_id)} ({interval.person_id})</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{kindLabel(interval.kind)}{interval.task_id ? ` · ${interval.task_id}` : ''}</TableCell>
                    <TableCell>{locationLabel(interval.zone_id)}</TableCell>
                    <TableCell>{timeLabel(interval.starts_at)}</TableCell>
                    <TableCell>{timeLabel(interval.ends_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

export default Timeline;
