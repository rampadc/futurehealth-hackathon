import { useEffect, useState } from 'react';
import type { TrustLogEntry } from '../../contract';
import { live } from '../../live';
import { nameOf } from '../../replay';
import { navigate } from '../../router';
import { crew, heatNow, SCREEN_FOR_ACTION, time, who } from '../data';
import { nextHandoff } from '../../story';
import { ActionButton, Badge, Band, Computed, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, taskBadge } from '../kit';
import type { ScreenProps } from '../registry';
import { ConditionsPanel } from '../conditions';

/** Squad Monitoring: within five seconds, does anyone need action now? */
export function SquadMonitoringScreen({ session }: ScreenProps) {
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  const story = caseView.story;
  const heat = heatNow(caseView);
  const people = crew(caseView);
  const accounted = people.filter(p => p.inRecovery).length;
  const open = caseView.tasks.filter(t => t.status === 'ready');
  const overdue = open.filter(t => t.due_at && Date.parse(t.due_at) <= Date.parse(caseView.clock));
  const needsHelp = people.filter(p => p.excluded);
  const byLocation = new Map<string, number>();
  for (const p of people) { const where = p.excluded ? 'welfare' : p.inRecovery ? 'shelter_a' : p.location ?? 'unknown'; byLocation.set(where, (byLocation.get(where) ?? 0) + 1); }
  const handoff = nextHandoff(story);
  const actions = [...open].sort((a, b) => Number(!!b.due_at && overdue.includes(b)) - Number(!!a.due_at && overdue.includes(a)));
  return <div className="hs-screen">
    <Head kicker={`Squad Monitoring · Civil area · ${time(caseView.clock)} GST`} title="Squad Monitoring" />
    <Hero>
      <Metric label="Needs action now" value={String(needsHelp.length + overdue.length)} sub={needsHelp.length ? `${needsHelp.map(p => who(p.id)).join(', ')} needs rest now` : overdue.length ? `${overdue.length} overdue` : 'Nothing urgent'} tone={needsHelp.length || overdue.length ? 'red' : 'ok'} />
      <Metric label="Stop-work" value={story.issued ? 'Active' : 'None'} sub={story.issued ? 'Heavy exposed civil work' : 'No heat controls recorded'} tone={story.issued ? 'red' : undefined} />
      <Metric label="Accounted for" value={`${accounted} / ${people.length}`} sub="Shelter A" />
    </Hero>
    <p className="hs-statusline"><Band band={heat.band.band} label={heat.reading ? `TWL ${heat.reading.twl} W/m² · ${heat.band.label}` : 'No reading'} /> · {heat.reading ? `sensor ${heat.reading.sensor_id} · ${time(heat.reading.measured_at)}` : ''} {heat.heavyHeld && <Hold />}</p>
    <div className="hs-grid">
      <Section title="Your actions" hint="Overdue first">
        {actions.length ? <List>{actions.filter(t => SCREEN_FOR_ACTION[t.action]?.web).map(t => <Row key={t.action} title={t.label} detail={`${nameOf(t.actor_id)}${t.due_at ? ` · due ${time(t.due_at)}` : ''}`} badge={taskBadge(session, t.action)} onClick={() => navigate(`/web/${SCREEN_FOR_ACTION[t.action].web}`)} />)}</List>
          : <Empty>Nothing waiting for you.</Empty>}
        {/* Actions with no dedicated wireframe screen (delivery, cost review) are recorded here. */}
        {actions.filter(t => !SCREEN_FOR_ACTION[t.action]?.web).map(t => <ActionButton key={t.action} session={session} action={t.action} label={t.label} />)}
        <p className="hs-statusline">Next site handoff: {handoff.actorId ? `${nameOf(handoff.actorId)} · ${handoff.title}` : handoff.title}</p>
      </Section>
      <Section title="Crew by location" hint="Aggregates only · no health data">
        <List>{[...byLocation.entries()].map(([where, n]) => <Row key={where} title={nameOf(where)} badge={<Badge tone="muted">{n}</Badge>} />)}</List>
      </Section>
    </div>
    <ConditionsPanel session={session} compact />
    <Section title="Readings">
      <div className="hs-strip" role="list">
        {(caseView.request?.snapshot.readings ?? caseView.capture?.request.snapshot.readings ?? []).map(r => <div key={r.evidence_id} role="listitem"><b>{time(r.measured_at)}</b><span>{r.twl} W/m²</span><span>{r.sensor_id}</span></div>)}
      </div>
      <Computed />
    </Section>
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
    <Hero>
      <Metric label="Services" value={ready === null ? '…' : ready ? 'Ready' : 'Degraded'} sub="database and solver" tone={ready === false ? 'red' : ready ? 'ok' : undefined} />
      <Metric label="Proposals" value={String(counts('solver_run') + counts('agent_run'))} sub={`${counts('solver_run')} solver · ${counts('agent_run')} agent`} />
      <Metric label="Applied on site by software" value={appliedOnSite ? 'Yes' : 'None'} sub="every proposal carries applied: false" tone={appliedOnSite ? 'red' : 'ok'} />
    </Hero>
    <Section title="Trust log" hint="Newest first · people’s records and system proposals">
      <div className="hs-chips" role="group" aria-label="Show entries">
        {TRUST_FILTERS.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}{log && ` · ${id === 'all' ? log.length : counts(id)}`}</button>)}
      </div>
      {error ? <Note tone="amber">{error}</Note> : !log ? <p className="hs-muted" role="status">Loading…</p> : shown.length ? <div className="hs-scroll"><table className="hs-table">
        <thead><tr><th>Time</th><th>Kind</th><th>What happened</th><th>Status</th></tr></thead>
        <tbody>{shown.map(e => <tr key={e.id}><td>{time(e.at)}</td><td>{e.kind === 'command' ? 'Person' : e.kind === 'solver_run' ? 'Solver' : e.kind === 'agent_run' ? 'Agent · AI' : e.kind === 'signal' ? 'Sensor or system' : 'Guardrail'}</td><td>{e.summary}</td><td>{e.status}</td></tr>)}</tbody>
      </table></div> : <Empty>{log.length ? 'No entries of this kind yet.' : 'Nothing recorded for this case yet.'}</Empty>}
    </Section>
    <Section title="Solver runs" hint={`Case version ${caseView.version}`}>
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
        <Row title="Demo sign-in" detail="Named personas are demo selection, not authentication." badge={<Badge tone="muted">Demo</Badge>} />
      </List>
    </Section>
  </div>;
}
