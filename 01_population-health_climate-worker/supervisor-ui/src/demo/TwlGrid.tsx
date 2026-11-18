import { useEffect, useState } from 'react';
import { Box, Button, ButtonGroup, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import type { SensorState, SiteSettings } from '../live';
import { BAND_COLOR, BAND_LABEL, BAND_TEXT, isEdited, SENSOR_LABEL, SQUAD_NAMES, STATE_LABEL, twlBand } from './model';

type Props = { settings: SiteSettings; defaults: SiteSettings; hours: number[]; currentHour: number; busy: boolean; onChange: (next: SiteSettings) => void };

/** One editable TWL cell. Commits on Enter or when focus leaves; Escape restores the saved value. */
function Cell({ value, label, edited, current, disabled, onCommit }: { value: number; label: string; edited: boolean; current: boolean; disabled: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const n = Number(draft);
  const valid = draft !== '' && Number.isFinite(n) && n > 0 && n < 500;
  const band = twlBand(valid ? n : value);
  const commit = () => { if (valid && n !== value) onCommit(n); else setDraft(String(value)); };
  return <TableCell sx={{ p: 0.75, bgcolor: current ? 'action.selected' : undefined }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <TextField size="small" type="number" value={draft} disabled={disabled} error={!valid}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDraft(String(value)); }}
        slotProps={{ htmlInput: { 'aria-label': label, min: 1, max: 499, step: 1, style: { width: 64, fontVariantNumeric: 'tabular-nums', fontWeight: 600 } } }}
        sx={{ '& .MuiOutlinedInput-root': { bgcolor: BAND_COLOR[band], color: BAND_TEXT[band] }, '& input': { color: BAND_TEXT[band] } }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" component="p" sx={{ lineHeight: 1.2 }}>{BAND_LABEL[band]}</Typography>
        {edited && <Typography variant="caption" component="p" color="primary" sx={{ lineHeight: 1.2, fontWeight: 600 }}>Edited</Typography>}
      </Box>
    </Box>
  </TableCell>;
}

/**
 * Hourly Thermal Work Limit (W/m²) for each squad's sensor, and each sensor's state.
 * Lower TWL is hotter: below 140 is caution, below 115 high risk (ADOSH TG v4).
 */
export function TwlGrid({ settings, defaults, hours, currentHour, busy, onChange }: Props) {
  const setTwl = (squad: string, sensor: string, hour: number, value: number) =>
    onChange({ ...settings, twl: { ...settings.twl, [squad]: { ...settings.twl[squad], [sensor]: { ...settings.twl[squad][sensor], [String(hour)]: value } } } });
  const setState = (sensor: string, state: SensorState) => onChange({ ...settings, sensors: { ...settings.sensors, [sensor]: state } });
  const fill = (squad: string, sensor: string, value: number) =>
    onChange({ ...settings, twl: { ...settings.twl, [squad]: { ...settings.twl[squad], [sensor]: Object.fromEntries(hours.map(h => [String(h), value])) } } });
  return <TableContainer sx={{ overflowX: 'auto' }}>
    <Table size="small" aria-label="Thermal Work Limit by squad, sensor and hour">
      <TableHead><TableRow>
        <TableCell>Squad and sensor</TableCell>
        <TableCell>Sensor state</TableCell>
        {hours.map(h => <TableCell key={h} sx={{ bgcolor: h === currentHour ? 'action.selected' : undefined }}>{String(h).padStart(2, '0')}:00{h === currentHour && <Typography variant="caption" component="span" color="error" sx={{ ml: 0.5, fontWeight: 700 }}>now</Typography>}</TableCell>)}
        <TableCell>Quick set</TableCell>
      </TableRow></TableHead>
      <TableBody>{Object.entries(settings.twl).flatMap(([squad, sensors]) => Object.keys(sensors).map(sensor => {
        const state = settings.sensors[sensor] ?? 'live';
        return <TableRow key={`${squad}-${sensor}`}>
          <TableCell sx={{ minWidth: 170 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{SQUAD_NAMES[squad] ?? squad}</Typography>
            <Typography variant="caption" color="text.secondary">{SENSOR_LABEL[sensor] ?? sensor}{sensor === 't1' ? ' · feeds the live case' : ' · site fixture'}</Typography>
          </TableCell>
          <TableCell>
            <ButtonGroup size="small" aria-label={`${sensor.toUpperCase()} state`} disabled={busy}>
              {(['live', 'stale', 'offline'] as SensorState[]).map(s => <Tooltip key={s} title={s === 'live' ? 'Fresh valid readings' : s === 'stale' ? 'Readings arrive more than 5 minutes old' : 'No valid reading (sensor fault)'}>
                <Button aria-pressed={state === s} variant={state === s ? 'contained' : 'outlined'} color={s === 'live' ? 'success' : s === 'stale' ? 'warning' : 'error'} onClick={() => setState(sensor, s)}>{STATE_LABEL[s]}</Button>
              </Tooltip>)}
            </ButtonGroup>
          </TableCell>
          {hours.map(h => <Cell key={h} value={sensors[sensor][String(h)]} label={`${SQUAD_NAMES[squad] ?? squad} ${sensor.toUpperCase()} TWL at ${String(h).padStart(2, '0')}:00`} edited={isEdited(settings, defaults, squad, sensor, h)} current={h === currentHour} disabled={busy} onCommit={v => setTwl(squad, sensor, h, v)} />)}
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            {[['Mild', 170], ['Caution', 130], ['Extreme', 105]].map(([label, v]) => <Button key={label} size="small" disabled={busy} onClick={() => fill(squad, sensor, v as number)}>{label}</Button>)}
          </TableCell>
        </TableRow>;
      }))}</TableBody>
    </Table>
  </TableContainer>;
}
