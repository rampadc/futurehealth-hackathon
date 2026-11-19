import { useEffect, useState } from 'react';
import type { SiteConditions } from '../contract';
import { live } from '../live';
import type { CaseSession } from '../session';
import { Badge, Head, NoCase, Note, Section } from './kit';
import { navigate } from '../router';
import type { ScreenProps } from './registry';
import { time } from './data';
import { TwlChart, twlBandWord, type TwlReadingPoint } from './twl';

const ZONE: Record<string, string> = { low: 'Low zone', medium: 'Medium zone', high: 'High zone' };
const zone = (z: string) => ZONE[z] ?? z;
const SHIFT = (h: string) => h >= '05:00' && h <= '18:00';

/** Site heat conditions for the case day, refreshed when the case clock moves. */
export function useConditions(session: CaseSession) {
  const [conditions, setConditions] = useState<SiteConditions | null>(null);
  const [error, setError] = useState('');
  const hasCase = !!session.caseView;
  // The hourly data only changes when the case clock reaches another hour.
  const hour = session.caseView?.clock.slice(0, 13);
  useEffect(() => {
    if (!hasCase) { setConditions(null); return; }
    let current = true;
    live.conditions().then(c => { if (current) { setConditions(c); setError(''); } }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'Conditions unavailable'); });
    return () => { current = false; };
  }, [hour, hasCase]);
  return { conditions, error };
}

/**
 * Hourly Thermal Work Limit for the site and day from the risk core. It is planning context only:
 * a forecast or replay never clears a hold; a fresh local reading and a human review do.
 */
export function ConditionsPanel({ session, readings }: { session: CaseSession; readings?: TwlReadingPoint[] }) {
  const { conditions, error } = useConditions(session);
  return <Section title={readings ? 'Site conditions and readings' : 'Site conditions'} icon="sensor">
    {error ? <p role="alert" className="hs-error">{error}</p>
      : !conditions ? <p role="status" className="hs-muted">Loading conditions…</p>
      : conditions.status !== 'ok' ? <Note tone="red">Conditions unavailable: {conditions.message}. Treat site heat as unknown and rely on local readings.</Note>
      : <ConditionsBody conditions={conditions} readings={readings} now={session.caseView ? time(session.caseView.clock) : undefined} />}
  </Section>;
}

type OkConditions = Extract<SiteConditions, { status: 'ok' }>;
const sourceLabel = (c: OkConditions) => c.kind === 'replay' ? 'Historical ERA5' : 'Forecast';
const shiftHours = (c: OkConditions) => c.hourly.filter(h => SHIFT(h.hour));

function ConditionsBody({ conditions: c, readings, now: clock }: { conditions: OkConditions; readings?: TwlReadingPoint[]; now?: string }) {
  const now = c.current;
  const s = c.summary;
  const rows: Array<[string, string, string]> = [
    ['TWL in sun', now ? `${now.twl_sun_wm2} W/m² · ${zone(now.twl_zone_sun)}` : '—', `${s.min_twl_sun_wm2} W/m² lowest · ${s.hours_high_zone_sun} h in the High zone`],
    ['TWL in shade', now ? `${now.twl_shade_wm2} W/m² · ${zone(now.twl_zone_shade)}` : '—', '—'],
    ['Air temperature', now ? `${now.temperature_c} °C` : '—', `${s.max_temperature_c} °C peak`],
    ['WBGT', now ? `${now.wbgt_c} °C` : '—', `${s.max_wbgt_c} °C peak`],
    ['Midday break', now ? (now.midday_break_minutes ? `${now.midday_break_minutes} min in this hour` : 'Not in this hour') : '—', s.midday_break],
  ];
  const table = <div className="hs-scroll"><table className="hs-table hs-table-sm hs-conditions-table" aria-label="Site conditions this hour and the worst of the day">
      <thead><tr><th>Measure</th><th>This hour{now ? ` · ${now.hour}` : ''}</th><th>Worst of the day</th></tr></thead>
      <tbody>{rows.map(([label, hour, day]) => <tr key={label}><td>{label}</td><td>{hour}</td><td>{day}</td></tr>)}</tbody>
    </table></div>;
  return <>
    <TwlChart kindLabel={sourceLabel(c)} now={clock ?? c.clock_hour} readings={readings} onTable={() => navigate('/web/site-conditions')}
      hourly={shiftHours(c).map(h => ({ hour: h.hour, twl: h.twl_sun_wm2, temperature_c: h.temperature_c, wbgt_c: h.wbgt_c }))} />
    {table}
    {s.heat_programme_required && <p className="hs-statusline"><Badge tone="wait">Heat programme</Badge> A heat stress programme is required for this day.</p>}
  </>;
}

/** Site conditions as a table: every shift hour, with the data source and the zone citations. */
export function SiteConditionsTableScreen({ session }: ScreenProps) {
  const { conditions: c, error } = useConditions(session);
  if (!session.caseView) return <NoCase session={session} />;
  const nowM = time(session.caseView.clock);
  return <div className="hs-screen">
    <Head kicker={`Heat controls · ${nowM} GST`} title="Site conditions table" sub="Hourly site heat for the case day. For planning only: a forecast or replay never clears a hold." />
    {error ? <p role="alert" className="hs-error">{error}</p>
      : !c ? <p role="status" className="hs-muted">Loading conditions…</p>
      : c.status !== 'ok' ? <Note tone="red">Conditions unavailable: {c.message}. Treat site heat as unknown and rely on local readings.</Note>
      : <Section title={`Site conditions · ${sourceLabel(c)}`} icon="sensor">
        <div className="hs-scroll"><table className="hs-table hs-table-sm" aria-label="Site conditions by hour">
          <thead><tr><th>Hour</th><th>TWL sun W/m²</th><th>TWL shade W/m²</th><th>Environmental band</th><th>Air °C</th><th>WBGT °C</th><th>Midday break</th><th>Source</th></tr></thead>
          <tbody>{shiftHours(c).map(h => <tr key={h.hour}><td>{h.hour}</td><td>{h.twl_sun_wm2}</td><td>{h.twl_shade_wm2}</td><td>{twlBandWord(h.twl_sun_wm2)}</td><td>{h.temperature_c}</td><td>{h.wbgt_c}</td><td>{h.midday_break_minutes ? `${h.midday_break_minutes} min` : '—'}</td><td>{h.hour > nowM ? 'Predicted' : sourceLabel(c)}{h.data_issue ? ` · ${h.data_issue}` : ''}</td></tr>)}</tbody>
        </table></div>
        <p className="hs-muted">{c.kind === 'replay' ? 'Historical weather data' : 'Weather forecast'} · {c.site === 'mussafah' ? 'Mussafah' : c.site} · For planning only</p>
        {c.citation.length > 0 && <p className="hs-muted">Zones: {c.citation.map((x, i) => <span key={x.cite}>{i ? '; ' : ''}{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.cite}</a> : x.cite}</span>)}</p>}
      </Section>}
  </div>;
}
