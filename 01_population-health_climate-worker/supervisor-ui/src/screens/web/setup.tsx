import { useState } from 'react';
import { heatNow, time } from '../data';
import { Badge, Head, List, Row, Section, Person } from '../kit';
import type { ScreenProps } from '../registry';
import { PINS, SENSORS, squadsFor, TONE, ZONES } from '../squads';

/**
 * Site setup: which sensors serve which squads and locations on the construction site.
 * A plan of the site, then the same facts as tables. Each squad's zone is outlined in its
 * section tone. Sensor t1 shows the live case's latest reading; the rest is the site fixture.
 */
export function SiteSetupScreen({ session }: ScreenProps) {
  const [selected, setSelected] = useState('t1');
  const squads = squadsFor(session.caseView);
  const heat = heatNow(session.caseView);
  const squadNames = (ids: string[]) => ids.length ? ids.map(id => squads.find(q => q.id === id)?.name ?? id).join(', ') : '—';
  const statusOf = (id: string, base: string) => id === 't1' && heat.reading ? `Live · ${heat.reading.twl} W/m² at ${time(heat.reading.measured_at)}` : base;
  const sensor = SENSORS.find(x => x.id === selected) ?? SENSORS[0];
  return <div className="hs-screen">
    <Head kicker="Site setup · Sandline–Dune, Mussafah" title="Site setup" sub="Which sensors serve which squads and locations. Fix gaps before work starts." />
    <Section title="Site plan">
      <svg className="hs-siteplan" viewBox="0 0 700 290" role="group" aria-label="Site plan">
        <rect x="1" y="1" width="698" height="288" fill="none" stroke="currentColor" strokeWidth="2" />
        {ZONES.map(z => {
          const tone = z.squads.length === 1 ? `var(--tone-${TONE[z.squads[0]]}-rule)` : 'currentColor';
          return <g key={z.id}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={z.shelter ? 'var(--color-sheet)' : 'var(--color-base)'} stroke={tone} strokeWidth={z.squads.length === 1 ? 3 : 1.5} />
            <text x={z.x + 8} y={z.y + 18} fontSize="12" fontWeight="700" fill="currentColor">{z.label}</text>
            <text x={z.x + 8} y={z.y + 33} fontSize="10" fill="var(--color-graphite)">{z.kind}</text>
          </g>;
        })}
        {SENSORS.map(x => { const [cx, cy] = PINS[x.id]; const on = x.id === sensor.id;
          return <g key={x.id} className="hs-pin" role="button" tabIndex={0} aria-label={`${x.id.toUpperCase()} · ${x.type} · ${x.loc}`} aria-pressed={on}
            onClick={() => setSelected(x.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(x.id); }}>
            <circle cx={cx} cy={cy} r={on ? 13 : 11} fill={x.off ? 'var(--color-signal-red)' : 'currentColor'} stroke="var(--color-base)" strokeWidth="2" />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-base)">{x.id.toUpperCase()}</text>
            {on && <circle cx={cx} cy={cy} r={17} fill="none" stroke="currentColor" strokeWidth="2" />}
          </g>; })}
      </svg>
      <p className="hs-small hs-legend">{squads.map(q => <span key={q.id}><i className="hs-tone-key" style={{ borderColor: `var(--tone-${TONE[q.id]}-rule)` }} />{q.name}</span>)}<span><i className="hs-pin-key" />Sensor or base station · red = offline</span></p>
    </Section>
    <Section title={`${sensor.id.toUpperCase()} · ${sensor.type}`} icon="sensor">
      <List>
        <Row title="Location" detail={sensor.loc} />
        <Row title="Squads" detail={squadNames(sensor.squads)} />
        <Row title="Relay" detail={sensor.relay} badge={<Badge tone={sensor.off ? 'over' : 'done'}>{sensor.off ? 'Offline' : 'Live'}</Badge>} />
        <Row title="Status" detail={statusOf(sensor.id, sensor.status)} />
      </List>
      {sensor.off && <p className="hs-error">No heartbeat since 07:52. Squads it covers fall back to the forecast and their band rises one level.</p>}
    </Section>
    <Section title="Squads and locations">
      <div className="hs-scroll"><table className="hs-table hs-table-sm">
        <thead><tr><th>Squad</th><th>Foreman</th><th>Location</th><th>Recovery</th><th>Sensors</th><th>Workers</th></tr></thead>
        <tbody>{squads.map(q => <tr key={q.id}><td><b>{q.name}</b></td><td><Person id={q.foremanId} size="xs">{q.foreman}</Person></td><td>{q.loc}</td><td>{q.shelter}</td>
          <td>{SENSORS.filter(x => x.squads.includes(q.id)).map(x => x.id.toUpperCase()).join(', ')}</td><td>{q.size}</td></tr>)}</tbody>
      </table></div>
    </Section>
    <Section title="Sensors">
      <div className="hs-scroll"><table className="hs-table hs-table-sm">
        <thead><tr><th>Sensor</th><th>Type</th><th>Location</th><th>Squads</th><th>Relay</th><th>Status</th></tr></thead>
        <tbody>{SENSORS.map(x => <tr key={x.id} className="hs-pick" aria-selected={x.id === sensor.id} onClick={() => setSelected(x.id)}>
          <td><b>{x.id.toUpperCase()}</b></td><td>{x.type}</td><td>{x.loc}</td><td>{squadNames(x.squads)}</td><td>{x.relay}</td>
          <td><Badge tone={x.off ? 'over' : 'done'}>{x.off ? 'Offline' : 'Live'}</Badge> {statusOf(x.id, x.status)}</td></tr>)}</tbody>
      </table></div>
    </Section>
    <Section title="Locations">
      <List>{ZONES.map(z => <Row key={z.id} title={z.label} detail={`${z.kind} · ${z.squads.length ? squadNames(z.squads) : 'Shared · workshop preparation'}`}
        badge={<Badge tone="muted">{SENSORS.filter(x => x.loc === z.label).map(x => x.id.toUpperCase()).join(', ') || 'No sensor'}</Badge>} />)}</List>
    </Section>
  </div>;
}
