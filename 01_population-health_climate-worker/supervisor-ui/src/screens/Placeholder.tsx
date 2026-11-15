import type { CaseSession } from '../session';
import type { ScreenDef } from './registry';

/** Shown until a screen's component is built. Lists the data contract from the registry. */
export function Placeholder({ screen, session }: { screen: ScreenDef; session: CaseSession }) {
  const { caseView, person } = session;
  const mine = caseView?.tasks.filter(task => task.actor_id === person?.id && task.status === 'ready') ?? [];
  return <section className="hs-sheet" aria-labelledby="hs-title">
    <p className="hs-label">{screen.clock} GST · Slice {screen.slice}{screen.slice === 5 ? ' (stretch)' : ''} · Owner {screen.owner}</p>
    <h1 id="hs-title">{screen.name}</h1>
    <p className="hs-draft">Planned screen. Wireframe: <code>ui_wireframes/</code> → {screen.name}.</p>
    <dl className="hs-contract">
      <dt>Used by</dt><dd>{screen.personas.join(', ')}</dd>
      <dt>Reads</dt><dd>{screen.reads.length ? screen.reads.map(r => <code key={r}>{r}</code>) : '—'}</dd>
      <dt>Commands</dt><dd>{screen.commands.length ? screen.commands.map(c => <code key={c}>{c}</code>) : '—'}</dd>
      {screen.needs && <><dt>Still needs</dt><dd>{screen.needs}</dd></>}
    </dl>
    <h2>Live case</h2>
    {caseView ? <ul className="hs-plain">
      <li>Case <code>{caseView.case_id}</code> · version {caseView.version} · clock {caseView.clock}</li>
      <li>Your ready actions: {mine.length ? mine.map(task => task.label).join('; ') : 'none'}</li>
    </ul> : <p className="hs-muted">No active case. Start one from presenter controls.</p>}
  </section>;
}
