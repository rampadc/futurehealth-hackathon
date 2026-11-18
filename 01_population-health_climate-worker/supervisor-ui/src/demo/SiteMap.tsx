import { Box, Button, ButtonGroup, Checkbox, Chip, FormControlLabel, FormGroup, Stack, Typography } from '@mui/material';
import type { CaseView, DemoSite, PresenterCrewRisk, SensorState, SiteSettings } from '../live';
import { nameOf } from '../replay';
import { PERSONAS, ADMIN } from '../story';
import { squadsFor } from '../screens/squads';
import { PersonAvatar } from '../shared/ui';
import { BAND_COLOR, BAND_LABEL, BAND_TEXT, DEVICE_LABEL, devicesFor, homeDevice, layoutIn, MAP_ZONES, openPersona, peopleOnSite, SENSOR_LABEL, SENSOR_PINS, SQUAD_NAMES, STATE_LABEL, type MapPerson } from './model';

export type Selection = { kind: 'person'; id: string } | { kind: 'sensor'; id: string } | null;
type Props = { caseView: CaseView | null; site: DemoSite; risk: PresenterCrewRisk | null; selected: Selection; onSelect: (s: Selection) => void; busy: boolean; onChange: (next: SiteSettings) => void };

const SENSOR_NAME: Record<string, string> = { k1: 'K1 · Shelter A check-in kiosk', k2: 'K2 · Shelter B check-in kiosk', bs1: 'Base station 1 · site cabin', bs2: 'Base station 2 · relays T3' };
const personaOf = (id: string) => [...PERSONAS, ADMIN].find(p => p.id === id);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** Band for a dot: the case crew from presenter crew risk, fixture squads from their sensor, staff neutral. */
function bandFor(p: MapPerson, risk: PresenterCrewRisk | null, squadBands: Record<string, string>) {
  if (p.caseWorker) return risk?.workers.find(w => w.person_id === p.id)?.band ?? 'unknown';
  if (p.squad && p.squad !== 'civil') return squadBands[p.squad] ?? 'unknown';
  return null;
}

/** Plan of the site: zones, sensors and everyone on site at the case clock. Click a person or sensor. */
export function SiteMap({ caseView, site, risk, selected, onSelect, busy, onChange }: Props) {
  const people = peopleOnSite(caseView);
  const squads = squadsFor(caseView);
  const squadBands = Object.fromEntries(squads.map(q => [q.id, q.band]));
  const conditions = site.settings.conditions;
  const byZone = MAP_ZONES.map(z => ({ zone: z, people: people.filter(p => p.zone === z.id) }));
  const sensorState = (id: string): SensorState | null => site.settings.sensors[id === 'bs2' ? 't3' : id] ?? null;
  const sensorTwl = (id: string) => Object.values(site.squads).map(by => by[id]).find(v => v !== undefined);
  const civilReading = caseView?.request?.snapshot.readings.at(-1);
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 2 }}>
    <Box>
      <Box component="svg" viewBox="0 0 1000 560" role="group" aria-label="Site map" sx={{ width: '100%', height: 'auto', display: 'block', border: '2px solid', borderColor: 'text.primary', bgcolor: '#F2EFE8', fontFamily: 'inherit' }}>
        {byZone.map(({ zone: z, people: here }) => <g key={z.id}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={z.cooled ? '#E6F0F7' : '#FFFFFF'} stroke={z.tone ? `var(--tone-${z.tone}-rule)` : '#14120F'} strokeWidth={z.tone ? 3 : 1.5} strokeDasharray={z.cooled ? '0' : undefined} />
          <text x={z.x + 10} y={z.y + 20} fontSize="15" fontWeight="700" fill="#14120F">{z.label}</text>
          <text x={z.x + 10} y={z.y + 37} fontSize="11" fill="#4A453E">{z.kind}{here.length ? ` · ${here.length} ${here.length === 1 ? 'person' : 'people'}` : ''}</text>
          {here.map((p, i) => {
            const [cx, cy] = layoutIn(z, i);
            const band = bandFor(p, risk, squadBands);
            const personId = p.id.includes(':') ? p.id.split(':')[1] : p.id;
            const name = nameOf(personId);
            const on = selected?.kind === 'person' && selected.id === p.id;
            const has = (conditions[p.id] ?? []).length > 0;
            return <g key={p.id} role="button" tabIndex={0} aria-pressed={on} style={{ cursor: 'pointer' }}
              aria-label={`${name}${p.squad ? ` · ${SQUAD_NAMES[p.squad]}` : ''}${band ? ` · heat risk ${BAND_LABEL[band].toLowerCase()}` : ''}${has ? ' · health condition assigned' : ''}${p.persona ? ' · persona' : ''}`}
              onClick={() => onSelect({ kind: 'person', id: p.id })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect({ kind: 'person', id: p.id }); } }}>
              <title>{name}{band ? ` · ${BAND_LABEL[band]}` : ''}</title>
              {on && <circle cx={cx} cy={cy} r={15} fill="none" stroke="#1D4A86" strokeWidth={3} />}
              <circle cx={cx} cy={cy} r={11} fill={band ? BAND_COLOR[band] : '#1D4A86'} stroke={p.persona ? '#14120F' : '#FFFFFF'} strokeWidth={p.persona ? 2.5 : 1.5} strokeDasharray={has ? '3 2' : undefined} />
              <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill={band ? BAND_TEXT[band] : '#fff'} style={{ pointerEvents: 'none' }}>{initials(name)}</text>
              {has && <circle cx={cx + 9} cy={cy - 9} r={4.5} fill="#5B1A8C" stroke="#fff" strokeWidth={1.2} />}
            </g>;
          })}
        </g>)}
        {Object.entries(SENSOR_PINS).map(([id, [x, y, kind]]) => {
          const state = sensorState(id);
          const on = selected?.kind === 'sensor' && selected.id === id;
          const bad = state === 'offline' || state === 'stale';
          const twl = id === 't1' ? civilReading?.twl : sensorTwl(id);
          const editable = id in site.settings.sensors;
          return <g key={id} role="button" tabIndex={0} aria-pressed={on} style={{ cursor: 'pointer' }}
            aria-label={`${SENSOR_LABEL[id] ?? SENSOR_NAME[id]}${state ? ` · ${STATE_LABEL[state]}` : ' · live'}`}
            onClick={() => onSelect({ kind: 'sensor', id })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect({ kind: 'sensor', id }); } }}>
            <title>{SENSOR_LABEL[id] ?? SENSOR_NAME[id]}</title>
            {on && <rect x={x - 22} y={y - 16} width={44} height={32} fill="none" stroke="#1D4A86" strokeWidth={3} />}
            <rect x={x - 18} y={y - 12} width={36} height={24} fill={state === 'offline' ? '#A31F24' : state === 'stale' ? '#F2A900' : kind === 'zone' ? '#14120F' : '#4A453E'} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={state === 'stale' ? '#14120F' : '#fff'} style={{ pointerEvents: 'none' }}>{id.toUpperCase()}</text>
            {editable && <text x={x} y={y + 26} textAnchor="middle" fontSize="11" fontWeight="700" fill={bad ? '#A31F24' : '#14120F'} style={{ pointerEvents: 'none' }}>{bad ? STATE_LABEL[state!] : twl !== undefined ? `${Math.round(twl)} W/m²` : ''}</text>}
          </g>;
        })}
      </Box>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
        {(['green', 'amber', 'red', 'emergency'] as const).map(b => <Stack key={b} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: BAND_COLOR[b] }} /><Typography variant="caption">{BAND_LABEL[b]}</Typography></Stack>)}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#1D4A86' }} /><Typography variant="caption">Staff</Typography></Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Box sx={{ width: 14, height: 14, borderRadius: '50%', border: '2.5px solid', borderColor: 'text.primary' }} /><Typography variant="caption">Persona you can open</Typography></Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#5B1A8C' }} /><Typography variant="caption">Health condition assigned</Typography></Stack>
      </Stack>
    </Box>
    <Box sx={{ border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: 2, alignSelf: 'start' }} aria-live="polite">
      {!selected ? <Typography color="text.secondary">Select a person or a sensor on the map.</Typography>
        : selected.kind === 'sensor' ? <SensorPanel id={selected.id} site={site} busy={busy} onChange={onChange} twl={selected.id === 't1' ? civilReading?.twl : sensorTwl(selected.id)} />
          : <PersonPanel person={people.find(p => p.id === selected.id) ?? null} site={site} risk={risk} squadBands={squadBands} busy={busy} onChange={onChange} />}
    </Box>
  </Box>;
}

function SensorPanel({ id, site, busy, onChange, twl }: { id: string; site: DemoSite; busy: boolean; onChange: (next: SiteSettings) => void; twl?: number }) {
  const editable = id in site.settings.sensors;
  const state = site.settings.sensors[id] ?? null;
  const squads = Object.entries(site.settings.twl).filter(([, by]) => id in by).map(([q]) => SQUAD_NAMES[q] ?? q);
  return <Stack spacing={1.5}>
    <Typography variant="overline" color="text.secondary">Sensor</Typography>
    <Typography variant="h6" component="h3">{SENSOR_LABEL[id] ?? SENSOR_NAME[id]}</Typography>
    {editable ? <>
      <Typography variant="body2">Serves {squads.join(', ')}. {id === 't1' ? 'Readings feed the live case and the civil crew’s heat-risk bands.' : 'Readings feed the squad screens.'}</Typography>
      <Typography variant="body2">{state === 'live' ? `Reading this hour: ${twl !== undefined ? `${twl} W/m²` : '—'}` : state === 'stale' ? 'Readings arrive more than 5 minutes old. Squads fall back to the forecast and their band rises one level.' : 'No valid reading. Squads fall back to the forecast and their band rises one level.'}</Typography>
      <ButtonGroup aria-label={`${id.toUpperCase()} state`} disabled={busy}>
        {(['live', 'stale', 'offline'] as SensorState[]).map(s => <Button key={s} aria-pressed={state === s} variant={state === s ? 'contained' : 'outlined'} color={s === 'live' ? 'success' : s === 'stale' ? 'warning' : 'error'} onClick={() => onChange({ ...site.settings, sensors: { ...site.settings.sensors, [id]: s } })}>{s === 'live' ? 'Live' : s === 'stale' ? 'Make stale' : 'Disable'}</Button>)}
      </ButtonGroup>
      <Typography variant="caption" color="text.secondary">Edit hourly values in the Thermal Work Limit table.</Typography>
    </> : <Typography variant="body2">{id === 'bs2' ? 'Follows the state of T3.' : 'Infrastructure. Its state is fixed in this demonstration.'}</Typography>}
  </Stack>;
}

function PersonPanel({ person, site, risk, squadBands, busy, onChange }: { person: MapPerson | null; site: DemoSite; risk: PresenterCrewRisk | null; squadBands: Record<string, string>; busy: boolean; onChange: (next: SiteSettings) => void }) {
  if (!person) return <Typography color="text.secondary">This person is no longer on the map.</Typography>;
  const id = person.id.includes(':') ? person.id.split(':')[1] : person.id;
  const persona = personaOf(id);
  const zone = MAP_ZONES.find(z => z.id === person.zone);
  const workerRisk = risk?.workers.find(w => w.person_id === id && person.caseWorker);
  const band = bandFor(person, risk, squadBands);
  const mine = site.settings.conditions[id] ?? [];
  const toggle = (condition: string, on: boolean) => {
    const next = on ? [...mine, condition] : mine.filter(c => c !== condition);
    const conditions = { ...site.settings.conditions, [id]: next };
    if (!next.length) delete conditions[id];
    onChange({ ...site.settings, conditions });
  };
  return <Stack spacing={1.5}>
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><PersonAvatar id={id} size={6} /><Box><Typography variant="h6" component="h3" sx={{ lineHeight: 1.2 }}>{nameOf(id)}</Typography><Typography variant="body2" color="text.secondary">{persona ? `${persona.role} · ${persona.organisation}` : person.squad ? SQUAD_NAMES[person.squad] : 'Site staff'}</Typography></Box></Stack>
    <Typography variant="body2">Location: <b>{zone?.label ?? person.zone}</b>{person.squad && persona === undefined ? ` · ${SQUAD_NAMES[person.squad]}` : ''}</Typography>
    {band && <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Chip size="small" label={`Heat risk: ${BAND_LABEL[band]}`} sx={{ bgcolor: BAND_COLOR[band], color: BAND_TEXT[band], fontWeight: 600 }} />{workerRisk?.twl_wm2 != null && <Typography variant="caption">Own TWL {workerRisk.twl_wm2} W/m²</Typography>}</Stack>}
    {workerRisk && <Box><Typography variant="subtitle2">Supervisor sees</Typography><Typography variant="body2">{workerRisk.supervisor_action}</Typography>
      {workerRisk.factors.length > 0 && <><Typography variant="subtitle2" sx={{ mt: 1 }}>Worker sees why</Typography><Box component="ul" sx={{ m: 0, pl: 2.5 }}>{workerRisk.factors.map(f => <Typography component="li" variant="body2" key={f}>{f}</Typography>)}</Box></>}</Box>}
    {person.caseWorker ? <Box>
      <Typography variant="subtitle2">Health conditions</Typography>
      <FormGroup>{Object.entries(site.conditions).map(([key, label]) => <FormControlLabel key={key} disabled={busy} control={<Checkbox size="small" checked={mine.includes(key)} onChange={e => toggle(key, e.target.checked)} />} label={<Typography variant="body2">{label}</Typography>} />)}</FormGroup>
      <Typography variant="caption" color="text.secondary">Conditions raise this worker’s heat-risk band. Supervisors see the band and action only; the worker sees the reasons. Nothing is recorded in the case.</Typography>
    </Box> : person.squad && person.squad !== 'civil' ? <Typography variant="caption" color="text.secondary">Fixture squad member. Health conditions apply to the civil crew in the live case.</Typography> : null}
    {persona && <Box><Typography variant="subtitle2" sx={{ mb: 0.5 }}>Open {persona.name.split(' ')[0]}’s screens</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {devicesFor(persona.id).map(d => <Button key={d} size="small" variant={d === homeDevice(persona.id) ? 'contained' : 'outlined'} onClick={() => openPersona(persona.id, d)}>{DEVICE_LABEL[d]}</Button>)}
    </Stack></Box>}
  </Stack>;
}
