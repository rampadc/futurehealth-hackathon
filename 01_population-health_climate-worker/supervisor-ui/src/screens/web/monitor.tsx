import { useEffect, useState } from 'react';
import { nameOf } from '../../replay';
import { navigate } from '../../router';
import { crew, heatNow, SCREEN_FOR_ACTION, time, who } from '../data';
import { Badge, Band, Computed, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, taskBadge } from '../kit';
import type { ScreenProps } from '../registry';

/** W1 · Squad Monitoring: within five seconds, does anyone need action now? */
export function W1SquadMonitoring({ session }: ScreenProps) {
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
      <Section title="Needs action" hint="Overdue first">
        {actions.length ? <List>{actions.map(t => { const target = SCREEN_FOR_ACTION[t.action]?.web; return <Row key={t.action} title={t.label} detail={`${nameOf(t.actor_id)}${t.due_at ? ` · due ${time(t.due_at)}` : ''}`} badge={taskBadge(session, t.action)} onClick={target ? () => navigate(`/web/${target}`) : undefined} />; })}</List>
          : <Empty>Nothing waiting.</Empty>}
      </Section>
      <Section title="Crew by location" hint="Aggregates only · no health data">
        <List>{[...byLocation.entries()].map(([where, n]) => <Row key={where} title={nameOf(where)} badge={<Badge tone="muted">{n}</Badge>} />)}</List>
      </Section>
    </div>
    <Section title="Readings">
      <div className="hs-strip" role="list">
        {(caseView.request?.snapshot.readings ?? caseView.capture?.request.snapshot.readings ?? []).map(r => <div key={r.evidence_id} role="listitem"><b>{time(r.measured_at)}</b><span>{r.twl} W/m²</span><span>{r.sensor_id}</span></div>)}
      </div>
      <Computed />
    </Section>
  </div>;
}

type AgentRun = { id: string; persona_id: string; recorded_at: string; status?: string; model?: string; tools?: Array<{ name: string }>; latency_ms?: number };

/** W8 · System & trust: what the solver and agent did, and that none of it was applied by software. */
export function W8SystemTrust({ session }: ScreenProps) {
  const { caseView } = session;
  const [ready, setReady] = useState<boolean | null>(null);
  const [agentRuns, setAgentRuns] = useState<AgentRun[] | 'presenter-only' | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/ready').then(r => { if (live) setReady(r.ok); }).catch(() => { if (live) setReady(false); });
    fetch('/api/demo/agent-runs', { credentials: 'same-origin' }).then(async r => { if (!live) return; if (r.status === 401 || r.status === 403) setAgentRuns('presenter-only'); else if (r.ok) setAgentRuns(await r.json()); else setAgentRuns([]); }).catch(() => { if (live) setAgentRuns([]); });
    return () => { live = false; };
  }, [caseView?.version]);
  if (!caseView) return <NoCase session={session} />;
  const runs = caseView.runs ?? [];
  const applied = runs.some(r => r.applied);
  return <div className="hs-screen">
    <Head kicker="System & trust" title="System & trust" sub="Every solver run and agent answer is a proposal. People record every action." />
    <Hero>
      <Metric label="Services" value={ready === null ? '…' : ready ? 'Ready' : 'Degraded'} sub="database and solver" tone={ready === false ? 'red' : ready ? 'ok' : undefined} />
      <Metric label="Solver runs" value={String(runs.length)} sub={`latest ${runs[0]?.status ?? '—'}`} />
      <Metric label="Applied by software" value={applied ? 'Yes' : 'None'} sub="applied: false on every run" tone={applied ? 'red' : 'ok'} />
    </Hero>
    <Section title="Solver runs" hint={`Case version ${caseView.version}`}>
      {runs.length ? <div className="hs-scroll"><table className="hs-table">
        <thead><tr><th>Version</th><th>Status</th><th>HTTP</th><th>Graph</th><th>Applied</th></tr></thead>
        <tbody>{runs.map(r => <tr key={r.id}><td>{r.version}</td><td>{r.status}{r.error ? ` · ${r.error}` : ''}</td><td>{r.http_status ?? '—'}</td><td>{r.graph_events?.join(' → ') ?? '—'}</td><td>{r.applied ? 'yes' : 'no'}</td></tr>)}</tbody>
      </table></div> : <Empty>No solver runs for this case yet.</Empty>}
    </Section>
    <Section title="Planning Agent runs">
      {agentRuns === 'presenter-only' ? <Note>Agent run telemetry is limited to presenter access in this demo.</Note>
        : agentRuns?.length ? <List>{agentRuns.slice(0, 20).map(r => <Row key={r.id} title={`${nameOf(r.persona_id)} · ${time(r.recorded_at)}`} detail={`${r.status ?? '—'}${r.model ? ` · ${r.model}` : ''}${r.tools?.length ? ` · tools: ${[...new Set(r.tools.map(t => t.name))].join(', ')}` : ''}${r.latency_ms ? ` · ${Math.round(r.latency_ms)} ms` : ''}`} />)}</List>
          : <Empty>No agent answers yet.</Empty>}
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
