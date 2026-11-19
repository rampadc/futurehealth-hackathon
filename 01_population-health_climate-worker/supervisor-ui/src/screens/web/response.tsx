import { reasonLabel } from '../../copy';
import { nameOf } from '../../replay';
import { navigate } from '../../router';
import { crew, heatNow, progress, time } from '../data';
import { ActionButton, Avatar, Band, Computed, Draft, Empty, Head, Hero, Hold, List, Metric, NoCase, Note, Row, Section, Statement, taskBadge, taskLine, Person } from '../kit';
import type { ScreenProps } from '../registry';
import { ConditionsPanel } from '../conditions';
import { StatusIcon } from '../../shared/icons';
import { bandOf, OtherSquadScreen, SquadItems, SquadPicker, squadsFor, useSquad } from '../squads';

const CONTROL_LABEL: Record<string, string> = { hold_required: 'Hold required', held: 'Held', stopped: 'Stopped', clearance_blocked: 'Clearance blocked', no_new_hold: 'No hold' };
const controlLabel = (state: string) => CONTROL_LABEL[state] ?? state.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

/** Heat controls: what must stop, why, and what evidence will clear it, for the chosen squad. */
export function HeatControlsScreen({ session }: ScreenProps) {
  const [squadId] = useSquad();
  const { caseView } = session;
  if (!caseView) return <NoCase session={session} />;
  const heat = heatNow(caseView);
  const r = heat.reading;
  const response = caseView.capture?.response;
  const controls = response?.heat.controls ?? [];
  const heavy = controls.find(c => c.task_id === 'civil_heavy');
  const siteLimit = heavy?.reason_codes.includes('twl_heavy_limit');
  const story = caseView.story;
  const issuedAt = story.events.find(e => e.id === 'issue')?.occurred_at;
  const squads = squadsFor(caseView);
  const sq = squads.find(q => q.id === squadId) ?? squads[0];
  const held = squads.filter(q => q.hold);
  const nextStep: { tone: 'red' | 'amber' | undefined; text: string } = held.length && !story.issued
    ? { tone: 'red', text: `Heavy-work limit reached for the ${held.map(q => q.name.toLowerCase()).join(', ')}. Issue the stop-work instruction below.` }
    : story.issued && !story.acknowledged ? { tone: 'amber', text: 'Stop-work instruction issued. Huda acknowledges it next; Rashid follows up if it is overdue.' }
      : story.issued ? { tone: undefined, text: 'Stop-work instruction acknowledged. Keep heavy work held until the restart review clears it.' }
        : { tone: undefined, text: 'No squad needs a stop-work instruction. Continue to monitor readings.' };
  // The squad's own sensor: for the case crew the recorded reading, for the others the site sensor setting.
  const FRESHNESS: Record<string, string> = { current: 'fresh', stale: 'stale', missing: 'no reading', failed: 'failed', future: 'time in the future', invalid: 'invalid' };
  const sensorLine = (q: typeof sq) => {
    if (q.live) {
      const ok = heat.freshness === 'current';
      return <>{!ok && <StatusIcon status="error" />} Sensor {(r?.sensor_id ?? q.sensor).toUpperCase()} · {r ? `measured ${time(r.measured_at)} · received ${time(r.received_at)} · quality ${r.quality} · ` : ''}<b>{FRESHNESS[heat.freshness] ?? heat.freshness}</b></>;
    }
    const state = q.reading.fresh ? `reading ${q.reading.at} · ` : '';
    const word = q.reading.fresh ? 'fresh' : q.reading.at === 'forecast' ? 'offline · forecast in use' : 'stale · forecast in use';
    return <>{!q.reading.fresh && <StatusIcon status="error" />} Sensor {q.sensor.toUpperCase()} · {state}<b>{word}</b></>;
  };
  // Each squad card carries its stop-work status: hold, foreman, sensor and, once issued, the instruction.
  const stopLine = (q: typeof sq) => q.live && story.issued
    ? `Stop-work issued${issuedAt ? ` at ${time(issuedAt)}` : ''} · ${story.acknowledged ? 'acknowledged by Huda' : 'awaiting Huda’s acknowledgement'}`
    : q.hold ? 'Heavy-work hold · stop-work needed' : 'No hold · no stop-work needed';
  const lines = (q: typeof sq) => [bandOf(q), <>{q.hold && <Hold />} {stopLine(q)}</>, `${q.loc} · foreman ${q.foreman}`, sensorLine(q)];
  const civil = squads.find(q => q.live);
  // A fixture squad's band is already raised one level when its sensor is offline or stale.
  const BAND_LABEL: Record<string, string> = { red: 'High risk', amber: 'Caution', green: 'Low environmental risk' };
  const band = sq.live ? heat.band.label : `${BAND_LABEL[sq.band] ?? 'Unknown'}${sq.estimated ? ' · raised one level, sensor not fresh' : ''}`;
  const limitReached = sq.live ? siteLimit : sq.hold;
  const HOLD_TEXT = 'Heavy-work limit reached: TWL ≤ 150 stops heavy exposed work.';
  const EVIDENCE = 'A fresh same-zone reading, the permit check and a separate restart review by the superintendent.';
  return <div className="hs-screen">
    <Head kicker={`Heat controls · ${sq.name} · ${time(caseView.clock)} GST`} title="Heat controls" sub="The environmental band and the site’s heavy-work hold are separate decisions." />
    <SquadPicker squads={squads} lines={lines} />
    <Computed>Holds are computed by the site rules · not AI. Only a squad with a heavy-work hold needs a stop-work instruction.</Computed>
    <Statement tone={nextStep.tone} compact>{nextStep.text}</Statement>
    {civil?.hold && !story.issued && <ActionButton session={session} action="issue" label={`Issue stop-work to ${civil.name}`} primary />}
    <Section title={`Task controls · ${sq.name}`}>
      {!sq.live ? <List cols={3}><Row title={`${sq.name} heavy work`} detail={sq.hold ? HOLD_TEXT : sq.reading.fresh ? 'No restriction' : 'Local reading is not fresh · forecast in use'} badge={sq.hold ? <Hold /> : <span className="hs-badge" data-tone="muted">No hold</span>} /></List>
        : controls.length ? <List cols={3}>{controls.map(c => <Row key={c.task_id} title={nameOf(c.task_id)} detail={c.reason_codes.map(reasonLabel).join(' · ') || 'No restriction'} badge={c.state === 'held' || c.state === 'stopped' || c.state === 'hold_required' ? <Hold>{controlLabel(c.state)}</Hold> : <span className="hs-badge" data-tone="muted">{controlLabel(c.state)}</span>} />)}</List>
        : <Empty>The solver has not assessed this case yet.</Empty>}
    </Section>
    <ConditionsPanel session={session} />
    <div className="hs-grid" data-cols="2">
      <Section title="Policy stack">
        <p className="hs-policy-row"><span><b>Site rule</b> TWL ≤ 150 · stop heavy work · Sandline heat plan</span><span><b>Legal zone</b> {band} · ADOSH display bands</span></p>
        <List>
          <Row title="Legal: ADOSH heat stress bands" detail="Display bands for environmental risk." />
          <Row title="Site: Sandline heat plan" detail={limitReached ? HOLD_TEXT : 'Heavy-work limit not reached at this reading.'} badge={limitReached ? <Hold /> : undefined} />
          {response?.policy_versions.map(v => <Row key={v} title={v} detail="Policy version used by the solver" />)}
        </List>
      </Section>
      <Section title="Evidence needed before clearance">
        {sq.live && response?.heat.clearance_blockers.length ? <List>{response.heat.clearance_blockers.map(b => <Row key={b} title={reasonLabel(b)} badge={<span className="hs-badge" data-tone="wait">Missing</span>} />)}</List>
          : sq.live || sq.hold ? <Note>{EVIDENCE}</Note>
          : <p className="hs-statusline">The {sq.name.toLowerCase()} has no heavy-work hold to clear.</p>}
      </Section>
    </div>
  </div>;
}

const RESPONSE_ACTIONS = ['acknowledge', 'stop', 'recover', 'escalation_followup', 'incident_record', 'remove', 'firstaid'];
const LABELS: Record<string, string> = {
  acknowledge: 'Acknowledge the stop-work instruction', stop: 'Confirm heavy work has stopped', recover: 'Account for the crew in recovery',
  escalation_followup: 'Follow up the overdue acknowledgement', incident_record: 'Record the site incident', remove: 'Confirm removal from heat and location', firstaid: 'Record first-aid contact',
};

/** Protective response: outstanding confirmations and who owns each. */
export function ProtectiveResponseScreen({ session }: ScreenProps) {
  const [squadId] = useSquad();
  const { caseView, person } = session;
  if (!caseView) return <NoCase session={session} />;
  const story = caseView.story;
  const relevant = RESPONSE_ACTIONS.filter(a => a !== 'escalation_followup' || caseView.tasks.some(t => t.action === a && t.status !== 'waiting'))
    .filter(a => !['incident_record', 'remove', 'firstaid'].includes(a) || story.reported);
  const rows = relevant.map(action => ({ action, ...progress(caseView, action) }));
  const outstanding = rows.filter(r => r.status !== 'recorded');
  const people = crew(caseView);
  const accounted = caseView.headcount?.confirmed_count ?? 0;
  const expected = caseView.headcount?.expected_count ?? people.length;
  const protective = caseView.capture?.response.protective_response;
  const locked = (protective?.planning_blockers.length ?? 0) > 0 || !caseView.story.recovered;
  const mine = caseView.tasks.filter(t => RESPONSE_ACTIONS.includes(t.action) && t.actor_id === person?.id && t.status === 'ready');
  /* An overview of every squad's actions, responses and headcount; pick one for its detail. */
  const squads = squadsFor(caseView);
  const sq = squads.find(q => q.id === squadId) ?? squads[0];
  const lines = (q: typeof sq) => q.live
    ? [<>Actions <b>{outstanding.length}</b> open</>, <>Responses <b>{rows.length - outstanding.length} / {rows.length}</b></>, <>Headcount <b>{accounted} / {expected}</b> · Shelter A</>, locked ? 'Crew planning locked' : 'Crew planning unlocked']
    : [<>Actions <b>{q.actions.open}</b> open · {q.actions.done} done</>, <>Responses <b>{q.responses.done} / {q.responses.total}</b></>, <>Headcount <b>{q.headcount}</b> · {q.shelter}</>];
  if (!sq.live) return <OtherSquadScreen title="Protective response" squad={sq} squads={squads} lines={lines}>
    <Section title={`${sq.name} · Required actions`}><SquadItems squad={sq} /></Section>
    <Section title={`Headcount · ${sq.shelter}`}><p className="hs-ok">{sq.headcount} accounted for · {sq.loc}</p></Section>
  </OtherSquadScreen>;
  return <div className="hs-screen">
    <Head kicker={`Protective response · ${time(caseView.clock)} GST`} title="Protective response" sub="People act first; these records follow. Crew planning stays locked until they are complete." />
    <SquadPicker squads={squads} lines={lines} />
    {locked && <Note tone="amber">Crew planning locked: {protective?.planning_blockers.map(reasonLabel).join(', ') || 'until the headcount is recorded'}.</Note>}
    <Section title="Required confirmations">
      <List>{rows.map(r => <Row key={r.action} title={LABELS[r.action] ?? r.action} detail={taskLine(session, r.action)} badge={taskBadge(session, r.action)} />)}</List>
    </Section>
    {mine.length > 0 && <Section title="Record yours">
      {mine.map(t => t.action === 'recover' ? <button key={t.action} type="button" className="hs-button is-primary" onClick={() => navigate('/site/account-for-crew')}>Open physical headcount</button> : <ActionButton key={t.action} session={session} action={t.action} label={t.label} primary
        confirm={t.action === 'remove' ? { word: 'REMOVED', title: 'Confirm the worker is out of the heat', body: 'This records your human confirmation for the protective response. Software cannot record it for you.' } : undefined} />)}
    </Section>}
    {protective && protective.actions.length > 0 && <Section title="Solver’s protective actions">
      <Draft><ul className="hs-plain">{protective.actions.map(a => <li key={a.code + a.owner_id}>{reasonLabel(a.code)} · <Person id={a.owner_id}>{nameOf(a.owner_id)}</Person> · {a.status}{a.due_at ? ` · due ${time(a.due_at)}` : ''}{a.message ? ` — ${a.message}` : ''}</li>)}</ul></Draft>
    </Section>}
    <Note>No health detail appears here. A worker’s own health record stays with them and occupational health.</Note>
  </div>;
}
