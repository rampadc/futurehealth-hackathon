import { useEffect, useState } from 'react';
import type { SiteConditions } from '../contract';
import { live } from '../live';
import type { CaseSession } from '../session';
import { Band, Badge, Computed, List, Note, Row, Section } from './kit';
import { time } from './data';
import { TwlChart, type TwlReadingPoint } from './twl';

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
export function ConditionsPanel({ session, compact, readings }: { session: CaseSession; compact?: boolean; readings?: TwlReadingPoint[] }) {
  const { conditions, error } = useConditions(session);
  const label = conditions?.status === 'ok' ? (conditions.kind === 'replay' ? 'Historical ERA5' : 'Forecast') : 'Forecast';
  return <Section title={readings ? 'Site conditions and readings' : `Site conditions · ${label}`} icon="sensor">
    {error ? <p role="alert" className="hs-error">{error}</p>
      : !conditions ? <p role="status" className="hs-muted">Loading conditions…</p>
      : conditions.status !== 'ok' ? <Note tone="red">Conditions unavailable: {conditions.message}. Treat site heat as unknown and rely on local readings.</Note>
      : <ConditionsBody conditions={conditions} compact={compact} readings={readings} label={label} now={session.caseView ? time(session.caseView.clock) : undefined} />}
  </Section>;
}

function ConditionsBody({ conditions: c, compact, readings, label, now: clock }: { conditions: Extract<SiteConditions, { status: 'ok' }>; compact?: boolean; readings?: TwlReadingPoint[]; label: string; now?: string }) {
  const now = c.current;
  return <>
    <List label="Conditions now">
      <Row title={now ? `${now.hour} · TWL ${now.twl_sun_wm2} W/m² in sun · ${now.twl_shade_wm2} in shade` : `No ${c.clock_hour} hour in the data`}
        detail={now ? `${zone(now.twl_zone_sun)} in sun, ${zone(now.twl_zone_shade).toLowerCase()} in shade · ${now.temperature_c} °C · WBGT ${now.wbgt_c} °C${now.midday_break_minutes ? ` · ${now.midday_break_minutes} min in the midday break` : ''}` : 'Rely on local readings.'}
        badge={now ? <Band band={now.band_sun} label={now.band_sun === 'red' ? 'Red' : now.band_sun === 'amber' ? 'Amber' : now.band_sun === 'green' ? 'Green' : 'Unknown'} /> : undefined} />
      <Row title={`Day: lowest TWL ${c.summary.min_twl_sun_wm2} W/m² · ${c.summary.hours_high_zone_sun} h in the High zone`}
        detail={`Peak ${c.summary.max_temperature_c} °C · WBGT ${c.summary.max_wbgt_c} °C · midday break ${c.summary.midday_break}`}
        badge={c.summary.heat_programme_required ? <Badge tone="wait">Heat programme</Badge> : undefined} />
    </List>
    <TwlChart kindLabel={label} now={clock ?? c.clock_hour} hourly={c.hourly.filter(h => SHIFT(h.hour)).map(h => ({ hour: h.hour, twl: h.twl_sun_wm2 }))} readings={readings} />
    <Computed>Computed by the heat-stress rules ({c.rules_version}) from {c.source.replace(/^cache:/, '')} · {c.site} · not AI</Computed>
    {!compact && c.citation.length > 0 && <p className="hs-muted">Zones: {c.citation.map((x, i) => <span key={x.cite}>{i ? '; ' : ''}{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.cite}</a> : x.cite}</span>)}</p>}
  </>;
}
