import { Box, Button, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { CaseView, DemoSite, PresenterCrewRisk, SiteSettings } from '../live';
import { nameOf } from '../replay';
import { ADMIN, PERSONAS } from '../story';
import { PersonAvatar } from '../shared/ui';
import { BAND_COLOR, BAND_LABEL, BAND_TEXT, DEVICE_LABEL, devicesFor, homeDevice, MAP_ZONES, openPersona } from './model';

/** One card per persona. Each opens that persona's own screens in a new window, already signed in. */
export function PersonaLauncher({ caseView }: { caseView: CaseView | null }) {
  const ready = (id: string) => caseView?.tasks.filter(t => t.actor_id === id && t.status === 'ready').length ?? 0;
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 1.5 }}>
    {[...PERSONAS, ADMIN].map(p => {
      const open = ready(p.id);
      return <Box key={p.id} sx={{ border: '1px solid', borderColor: open ? 'primary.main' : 'divider', borderWidth: open ? 2 : 1, bgcolor: 'background.paper', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <PersonAvatar id={p.id} size={5} />
          <Box sx={{ minWidth: 0 }}><Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>{p.name}</Typography><Typography variant="caption" color="text.secondary">{p.role} · {p.organisation}</Typography></Box>
        </Stack>
        <Typography variant="caption" color={open ? 'primary' : 'text.secondary'} sx={{ fontWeight: open ? 600 : 400 }}>{open ? `${open} action${open === 1 ? '' : 's'} ready now` : 'No action ready now'}</Typography>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 'auto' }}>
          <Button size="small" variant="contained" onClick={() => openPersona(p.id)} aria-label={`Open ${p.name} on ${DEVICE_LABEL[homeDevice(p.id)]}`}>Open {DEVICE_LABEL[homeDevice(p.id)].toLowerCase()}</Button>
          {devicesFor(p.id).filter(d => d !== homeDevice(p.id)).map(d => <Button key={d} size="small" onClick={() => openPersona(p.id, d)} aria-label={`Open ${p.name} on ${DEVICE_LABEL[d]}`}>{DEVICE_LABEL[d]}</Button>)}
        </Stack>
      </Box>;
    })}
  </Box>;
}

/** The civil crew in the live case: location, current band, and health conditions as toggles. */
export function HealthRoster({ caseView, site, risk, busy, onChange }: { caseView: CaseView | null; site: DemoSite; risk: PresenterCrewRisk | null; busy: boolean; onChange: (next: SiteSettings) => void }) {
  const snapshot = caseView?.request?.snapshot;
  const toggle = (id: string, condition: string) => {
    const mine = site.settings.conditions[id] ?? [];
    const next = mine.includes(condition) ? mine.filter(c => c !== condition) : [...mine, condition];
    const conditions = { ...site.settings.conditions, [id]: next };
    if (!next.length) delete conditions[id];
    onChange({ ...site.settings, conditions });
  };
  return <TableContainer sx={{ overflowX: 'auto' }}>
    <Table size="small" aria-label="Civil crew health conditions">
      <TableHead><TableRow><TableCell>Worker</TableCell><TableCell>Location</TableCell><TableCell>Heat risk</TableCell><TableCell>Health conditions</TableCell></TableRow></TableHead>
      <TableBody>{site.workers.map(id => {
        const band = risk?.workers.find(w => w.person_id === id)?.band ?? 'unknown';
        const location = snapshot?.workers.find(w => w.person_id === id)?.location_id;
        const mine = site.settings.conditions[id] ?? [];
        return <TableRow key={id}>
          <TableCell><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><PersonAvatar id={id} size={3.5} /><Typography variant="body2">{nameOf(id)}</Typography></Stack></TableCell>
          <TableCell><Typography variant="body2">{MAP_ZONES.find(z => z.id === location)?.label ?? location ?? '—'}</Typography></TableCell>
          <TableCell><Chip size="small" label={BAND_LABEL[band]} sx={{ bgcolor: BAND_COLOR[band], color: BAND_TEXT[band], fontWeight: 600, minWidth: 84 }} /></TableCell>
          <TableCell><Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {Object.entries(site.conditions).map(([key, label]) => <Chip key={key} size="small" disabled={busy} label={label.replace(/ \(.*\)$/, '')} title={label}
              color={mine.includes(key) ? 'secondary' : 'default'} variant={mine.includes(key) ? 'filled' : 'outlined'}
              aria-pressed={mine.includes(key)} aria-label={`${label} · ${nameOf(id)}`} onClick={() => toggle(id, key)} />)}
          </Stack></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </TableContainer>;
}
