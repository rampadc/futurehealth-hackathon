import { useEffect, useState, type ReactNode } from 'react';
import type { CrewRisk, OwnRisk, RiskBand } from '../contract';
import { live } from '../live';
import type { CaseSession } from '../session';
import { who } from './data';
import { nameOf } from '../replay';
import { Band, Computed, List, Note, Row, Section, Person } from './kit';

const LABEL: Record<RiskBand, string> = { green: 'Green', amber: 'Amber', red: 'Red', emergency: 'Emergency' };
const ORDER: RiskBand[] = ['emergency', 'red', 'amber', 'green'];

/** Fetch a risk view again whenever the case changes (a new record, reading or clock time). */
function useRisk<T>(session: CaseSession, load: () => Promise<T | null>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState('');
  const key = session.caseView ? `${session.caseView.version}|${session.caseView.clock}` : '';
  useEffect(() => {
    if (!key) { setValue(null); return; }
    let current = true;
    load().then(v => { if (current) { setValue(v); setError(''); } }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'Heat risk unavailable'); });
    return () => { current = false; };
  }, [key, load]);
  return { value, error };
}

function InputNotes({ inputs }: { inputs: CrewRisk['inputs'] }) {
  return <>
    {inputs.weather === 'unavailable' && <Note tone="red">Site weather unavailable: every band is Red until it returns.</Note>}
    {inputs.local_reading === 'lost' && <Note tone="red">Local reading faulty or stale: every band is one level higher until a valid reading arrives.</Note>}
  </>;
}

/**
 * Each worker's heat-risk band and action for supervisors: the site's heat recomputed for their clothing,
 * work type and acclimatisation, raised for a report or a lost input. Never the reasons or health detail.
 */
export function CrewRiskPanel({ session }: { session: CaseSession }) {
  const { value: risk, error } = useRisk(session, live.crewRisk);
  return <Section title="Heat risk by worker">
    {error ? <p role="alert" className="hs-error">{error}</p>
      : !risk ? <p role="status" className="hs-muted">Loading heat risk…</p>
      : <>
        <List label="Crew heat risk">
          <Row title={`Crew band ${LABEL[risk.crew.band]} · ${risk.crew.at_or_above_amber} of ${risk.crew.total} at Amber or above`}
            detail={ORDER.filter(b => risk.crew.counts[b]).map(b => `${risk.crew.counts[b]} ${LABEL[b]}`).join(' · ')}
            badge={<Band band={risk.crew.band} label={LABEL[risk.crew.band]} />} />
        </List>
        <InputNotes inputs={risk.inputs} />
        {ORDER.filter(b => risk.workers.some(w => w.band === b)).map(b => <BandTable key={b} band={b} workers={risk.workers.filter(w => w.band === b)} />)}
        <Computed>Computed by the heat-stress rules ({risk.inputs.rules_version}) for {risk.inputs.hour} · each worker’s clothing, work type and acclimatisation · not AI · never clears a hold</Computed>
      </>}
  </Section>;
}

/** Supervisor actions that ask nothing of anyone; shown grey. */
const NO_ACTION = /^work as planned$/i;
type CrewWorker = CrewRisk['workers'][number];
type SortKey = 'worker' | 'action' | 'rest' | 'check';
const SORT: Record<SortKey, (w: CrewWorker) => string | number> = {
  worker: w => nameOf(w.person_id), action: w => w.action, rest: w => Number(w.needs_rest), check: w => Number(w.check_in_person),
};
const COLUMNS: Array<[SortKey, string]> = [['worker', 'Worker'], ['action', 'Action'], ['rest', 'Rest now'], ['check', 'Check in person']];

/** One band's workers in their own table, sortable by any column. Red and emergency carry the red signal frame. */
function BandTable({ band, workers }: { band: RiskBand; workers: CrewWorker[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'worker', dir: 1 });
  const rows = [...workers].sort((a, b) => {
    const x = SORT[sort.key](a), y = SORT[sort.key](b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const signal = band === 'red' || band === 'emergency';
  return <div className="hs-band-table" data-band={band} data-signal={signal ? 'red' : undefined}>
    <h3><Band band={band} label={LABEL[band]} /> <span className="hs-muted">· {workers.length} worker{workers.length === 1 ? '' : 's'}</span></h3>
    <div className="hs-scroll"><table className="hs-table" aria-label={`${LABEL[band]} band workers`}>
      <thead><tr>{COLUMNS.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="hs-sort" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
          {label}<span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ' ↕'}</span>
        </button></th>)}</tr></thead>
      <tbody>{rows.map(w => <tr key={w.person_id}>
        <td><Person id={w.person_id} size="sm">{who(w.person_id)}</Person></td>
        <td className={NO_ACTION.test(w.action.trim()) || !w.action.trim() ? 'hs-no-action' : undefined}>{w.needs_rest ? <b>{w.action}</b> : w.action || 'No action'}</td>
        <td>{w.needs_rest ? <b>Yes</b> : <span className="hs-no-action">No</span>}</td>
        <td>{w.check_in_person ? <b>Yes</b> : <span className="hs-no-action">No</span>}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

/** The worker's own band with the reasons, which only they see. */
export function OwnRiskPanel({ session, title, wrap = (s: string) => s }: { session: CaseSession; title: ReactNode; wrap?: (s: string) => ReactNode }) {
  const { value: risk, error } = useRisk<OwnRisk>(session, live.ownRisk);
  if (!risk) return error ? <Section title={title}><Note tone="amber">{wrap('Heat risk unavailable. Follow your foreman and the work/rest times.')}</Note></Section> : null;
  const why = risk.factors.length ? risk.factors
    : [risk.zone ? `${risk.zone[0].toUpperCase()}${risk.zone.slice(1)} zone in the sun at ${risk.inputs.hour} for your clothing (TWL ${risk.twl_wm2} W/m²)` : 'Site heat unknown'];
  return <Section title={title}>
    <List label="My heat risk">
      <Row title={wrap(risk.action)} badge={<Band band={risk.band} label={LABEL[risk.band]} />} />
      {why.map(f => <Row key={f} title={wrap(f)} />)}
    </List>
    <Computed>{wrap(`Your supervisor sees your band and action, never the reasons · rules ${risk.inputs.rules_version}`)}</Computed>
  </Section>;
}
