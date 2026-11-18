import { useEffect, useState } from 'react';
import type { TrustLogEntry } from '../../contract';
import { live } from '../../live';
import { nameOf } from '../../replay';
import { navigate } from '../../router';
import { crew, heatNow, SCREEN_FOR_ACTION, time, who } from '../data';
import { nextHandoff } from '../../story';
import { ActionButton, Badge, Band, Computed, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, taskBadge, Avatar, Avatars, Person } from '../kit';
import type { ScreenProps } from '../registry';
import { CrewRiskPanel } from '../risk';
import { TwlReadout } from '../twl';
import { bandOf, OtherSquadScreen, SquadItems, SquadPicker, squadsFor, useSquad, sensorsNow } from '../squads';

/** Squad Monitoring: within five seconds, does anyone need action now? */
export function SquadMonitoringScreen({ session }: ScreenProps) {
  const [squadId] = useSquad();
  const { caseView, person } = session;
  if (!caseView) return <NoCase session={session} />;
  if (person?.id === 'P01') return <div className="hs-screen">
    <Head kicker={`Project monitoring · ${time(caseView.clock)} GST`} title="Project monitoring" sub="Case-linked operations and commercial review" />
    <Hero>
      <Metric label="Heavy work" value={caseView.story.stopped ? 'Stopped' : caseView.story.issued ? 'Stop instructed' : 'Awaiting instruction'} tone={caseView.story.issued ? 'red' : undefined} />
      <Metric label="Foreman headcount" value={`${caseView.headcount?.confirmed_count ?? 0} / ${caseView.headcount?.expected_count ?? 11}`} />
    </Hero>
    <Section title="Project evidence"><p>Review the case chronology, confirmed work and recovery duration, employer coverage and delivery state.</p><button type="button" className="hs-button is-primary" onClick={() => navigate('/web/heat-rest')}>Open project heat and rest view</button></Section>
    <Section title="Cost impact review"><ActionButton session={session} action="costReview" label="Record cost impact review" /></Section>
  </div>;
  const story = caseView.story;
  const heat = heatNow(caseView);
  const people = crew(caseView);
  const accounted = caseView.headcount?.confirmed_count ?? 0;
  const open = caseView.tasks.filter(t => t.status === 'ready');
  const overdue = open.filter(t => t.due_at && Date.parse(t.due_at) <= Date.parse(caseView.clock));
  const needsHelp = people.filter(p => p.excluded);
  const byLocation = new Map<string, number>();
  for (const p of people) { const where = p.excluded ? 'welfare' : p.inRecovery ? 'shelter_a' : p.location ?? 'unknown'; byLocation.set(where, (byLocation.get(where) ?? 0) + 1); }
  const handoff = nextHandoff(story);
  const actions = [...open].sort((a, b) => Number(!!b.due_at && overdue.includes(b)) - Number(!!a.due_at && overdue.includes(a)));
  /* No summary readouts: a squad selector with each squad's alerts and warnings. */
  const squads = squadsFor(caseView);
  const sq = squads.find(q => q.id === squadId) ?? squads[0];
  const lines = (q: typeof sq) => q.live
    ? [q.status, bandOf(q), <>Headcount <b>{accounted} / {caseView.headcount?.expected_count ?? people.length}</b></>, caseView.headcount?.confirmed_at ? `Huda confirmed at ${time(caseView.headcount.confirmed_at)}` : 'Awaiting Huda’s confirmation']
    : [q.status, bandOf(q), <>Headcount <b>{q.headcount}</b></>];
  if (!sq.live) return <OtherSquadScreen title="Squad Monitoring" squad={sq} squads={squads} lines={lines}>
    <Section title="Needs action"><SquadItems squad={sq} /></Section>
    <Section title="Crew by location"><List><Row title={`${sq.loc} · ${sq.headcount} workers`} detail={`${sq.status}. Recovery: ${sq.shelter}.`} badge={<Badge tone="muted">{sq.hold ? 'Hold' : 'Working'}</Badge>} /></List></Section>
  </OtherSquadScreen>;
  return <div className="hs-screen">
    <Head kicker={`Squad Monitoring · Civil crew · ${time(caseView.clock)} GST`} title="Squad Monitoring" />
    <SquadPicker squads={squads} lines={lines} />
    <p className="hs-statusline"><TwlReadout twl={heat.reading?.twl ?? null} band={heat.band.band} /> {heat.reading ? `· sensor ${heat.reading.sensor_id} · ${time(heat.reading.measured_at)}` : ''} {heat.heavyHeld && <Hold />}</p>
    <div className="hs-grid">
      <Section title="Your actions">
        {actions.length ? <List>{actions.filter(t => SCREEN_FOR_ACTION[t.action]?.web).map(t => <Row key={t.action} lead={<Avatar id={t.actor_id} size="md" />} title={t.label} detail={`${nameOf(t.actor_id)}${t.due_at ? ` · due ${time(t.due_at)}` : ''}`} badge={taskBadge(session, t.action)} onClick={() => navigate(`/web/${SCREEN_FOR_ACTION[t.action].web}`)} />)}</List>
          : <Empty>Nothing waiting for you.</Empty>}
        {/* Actions with no dedicated wireframe screen (delivery, cost review) are recorded here. */}
        {actions.filter(t => !SCREEN_FOR_ACTION[t.action]?.web).map(t => <ActionButton key={t.action} session={session} action={t.action} label={t.label} />)}
        <p className="hs-statusline">Next site handoff: {handoff.actorId ? <Person id={handoff.actorId} size="sm">{`${nameOf(handoff.actorId)} · ${handoff.title}`}</Person> : handoff.title}</p>
      </Section>
      <Section title="Crew by location">
        <List>{[...byLocation.entries()].map(([where, n]) => <Row key={where} title={nameOf(where)} badge={<Badge tone="muted">{n}</Badge>} />)}</List>
      </Section>
    </div>
    <CrewRiskPanel session={session} />
  </div>;
}

type TrustFilter = 'all' | TrustLogEntry['kind'];
const TRUST_FILTERS: Array<[TrustFilter, string]> = [['all', 'All'], ['solver_run', 'Solver'], ['command', 'People'], ['agent_run', 'Agent']];

/** System & trust: what the solver and agent did, and that none of it was applied on site by software. */
export function SystemTrustScreen({ session }: ScreenProps) {
  const { caseView } = session;
  const [filter, setFilter] = useState<TrustFilter>('all');
  const [ready, setReady] = useState<boolean | null>(null);
  const [log, setLog] = useState<TrustLogEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    fetch('/api/ready').then(r => { if (current) setReady(r.ok); }).catch(() => { if (current) setReady(false); });
    live.trustLog().then(entries => { if (current) { setLog(entries); setError(''); } }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [caseView?.version]);
  if (!caseView) return <NoCase session={session} />;
  const runs = caseView.runs ?? [];
  const appliedOnSite = (caseView.capture?.response.applied as boolean | undefined) === true || (log ?? []).some(e => e.kind !== 'command' && e.applied);
  const counts = (kind: TrustLogEntry['kind']) => (log ?? []).filter(e => e.kind === kind).length;
  const shown = (log ?? []).filter(e => filter === 'all' || e.kind === filter);
  return <div className="hs-screen">
    <Head kicker="System & trust" title="System & trust" sub="Every solver run and agent answer is a proposal. People record every action." />
    <Section title="System map">
      {/* The system map as a list of lists: one list per lane. */}
      <ul className="hs-syslist">
        <li><h3>Inputs</h3><ul>{sensorsNow().filter(x => !x.id.startsWith('k')).map(x => <li key={x.id}><span><b>{x.id.toUpperCase()} · {x.type}</b><small>{x.loc} · {x.relay}</small></span><Badge tone={x.off || x.stale ? 'over' : 'done'}>{x.off ? 'Offline' : x.stale ? 'Stale' : 'Live'}</Badge></li>)}
          <li><span><b>Weather forecast</b><small>Hourly, Mussafah · planning context only</small></span><Badge tone="muted">Context</Badge></li></ul></li>
        <li><h3>Rules (no AI)</h3><ul>
          <li><span><b>Risk monitor and heat rules</b><small>Bands, holds and escalations · deterministic</small></span><Badge tone={ready === false ? 'over' : 'done'}>{ready === null ? 'Checking' : ready ? 'Ready' : 'Degraded'}</Badge></li>
          <li><span><b>Operational solver</b><small>{counts('solver_run')} runs this case · every result applied: false</small></span><Badge tone={appliedOnSite ? 'over' : 'done'}>{appliedOnSite ? 'Applied' : 'Proposals only'}</Badge></li>
          <li><span><b>Case database</b><small>Commands, events and evidence</small></span><Badge tone={ready === false ? 'over' : 'done'}>{ready === false ? 'Degraded' : 'Ready'}</Badge></li></ul></li>
        <li><h3>Agents</h3><ul>
          <li><span><b>Planning Agent · AI</b><small>{counts('agent_run')} answers this case · explains and drafts, never writes</small></span><Badge tone="done">Ready</Badge></li>
          <li><span><b>Worker Aid Agent · AI</b><small>Check-ins in the worker’s language</small></span><Badge tone="muted">Planned</Badge></li></ul></li>
      </ul>
    </Section>
    <Section title="Trust log">
      <div className="hs-chips" role="group" aria-label="Show entries">
        {TRUST_FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}{log && ` · ${id === 'all' ? log.length : counts(id)}`}</button>)}
      </div>
      {error ? <Note tone="amber">{error}</Note> : !log ? <p className="hs-muted" role="status">Loading…</p> : shown.length ? <div className="hs-scroll"><table className="hs-table">
        <thead><tr><th>Time</th><th>Kind</th><th>What happened</th><th>Status</th></tr></thead>
        <tbody>{shown.map(e => <tr key={e.id}><td>{time(e.at)}</td><td>{e.kind === 'command' ? 'Person' : e.kind === 'solver_run' ? 'Solver' : e.kind === 'agent_run' ? 'Agent · AI' : e.kind === 'signal' ? 'Sensor or system' : 'Guardrail'}</td><td>{e.summary}</td><td>{e.status}</td></tr>)}</tbody>
      </table></div> : <Empty>{log.length ? 'No entries of this kind yet.' : 'Nothing recorded for this case yet.'}</Empty>}
    </Section>
    <Section title="Solver runs">
      {runs.length ? <div className="hs-scroll"><table className="hs-table">
        <thead><tr><th>Version</th><th>Status</th><th>HTTP</th><th>Graph</th><th>Shown now</th></tr></thead>
        <tbody>{runs.map(r => <tr key={r.id}><td>{r.version}</td><td>{r.status}{r.error ? ` · ${r.error}` : ''}</td><td>{r.http_status ?? '—'}</td><td>{r.graph_events?.join(' → ') ?? '—'}</td><td>{r.applied && r.version === caseView.version ? 'Current result' : r.applied ? 'Result for that version' : '—'}</td></tr>)}</tbody>
      </table></div> : <Empty>No solver runs for this case yet.</Empty>}
    </Section>
    <Section title="Guardrails">
      <List>
        <Row title="Proposals are never applied" detail="Solver responses carry applied: false; assignments, holds and restarts need a named person." badge={<Badge tone="done">Enforced</Badge>} />
        <Row title="Purpose limitation" detail="The agent refuses worker ranking, discipline, attendance and contract decisions, and does not diagnose." badge={<Badge tone="done">Enforced</Badge>} />
        <Row title="Health data stays with the worker" detail="Supervisors see “needs rest now”, never answers or body data." badge={<Badge tone="done">Enforced</Badge>} />
        <Row title="Role selection" detail="Role selection does not verify identity; case actions follow server-side role rules." badge={<Badge tone="muted">Access</Badge>} />
      </List>
    </Section>
  </div>;
}
