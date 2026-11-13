import { Box, Chip, Stack, Typography } from '@mui/material';
import { assessThermalReading } from './thermal';
import { timeLabel } from './Timeline';

export type ThermalWorkLimitReading = {
  twl: number;
  quality: string;
  measured_at: string;
  zone_id: string;
};

type Props = { reading: ThermalWorkLimitReading | undefined; decisionAt: string };

export function classifyThermalWorkLimit(reading: Props['reading'], decisionAt: string) {
  return assessThermalReading(
    reading && { twl: reading.twl, at: reading.measured_at },
    decisionAt,
    reading?.quality === 'valid' ? 'serviceable' : 'invalid',
  );
}

export function ThermalWorkLimit({ reading, decisionAt }: Props) {
  const status = classifyThermalWorkLimit(reading, decisionAt);
  const measuredAt = reading && Number.isFinite(Date.parse(reading.measured_at)) ? timeLabel(reading.measured_at) : null;
  const current = status.reason === 'current';

  return <Stack spacing={2} aria-label="Thermal Work Limit">
    <Typography variant="h6" component="h3">Thermal Work Limit</Typography>
    <Stack direction="row" spacing={3} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Box>
        <Typography variant="h3" component="p">
          {current || status.reason === 'stale' ? status.lastValue : '—'}
          {(current || status.reason === 'stale') && <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>W/m²</Typography>}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {status.reason === 'stale' ? 'Last recorded value · historical' : 'Local environmental reading'}
        </Typography>
      </Box>
      <Box>
        <Chip label={status.label} color={status.band === 'red' ? 'error' : status.band === 'amber' ? 'warning' : status.band === 'green' ? 'success' : 'default'} />
        {!current && <Typography variant="body2" sx={{ mt: 1 }}>
          {status.reason === 'stale' ? 'Reading out of date' : 'Obtain a fresh valid local reading'}
        </Typography>}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Measured {measuredAt ?? '—'} GST
        </Typography>
      </Box>
    </Stack>
    <Typography variant="body2" color="text.secondary">
      Environmental heat band only. Check task-specific work restrictions.
    </Typography>
  </Stack>;
}
