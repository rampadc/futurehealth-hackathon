import { useEffect, useRef, useState, type FormEvent } from 'react';
import { readChatStream } from '../AssistantChat';
import { apiFetch } from '../live';
import { Computed, Draft, Head, NoCase, Note, Section } from './kit';
import type { ScreenProps } from './registry';
import { AgentIntro } from './squads';

/** One guardrail result from check_grounding (agents/supervisor/agent.py): values in the answer vs tool outputs. */
type Check = { checked: number; passed: boolean; ungrounded: string[] };
type Grounding = { grounding?: Check | null; citations?: Check | null; links?: Check | null };
type Message = { id: string; author: 'user' | 'assistant'; text: string; case_clock?: string; tools?: string[]; grounding?: Grounding };
const SUGGESTIONS = ['Who can work in the workshop?', 'What needs attention?', 'Can trench work restart?', 'What if Rana were unavailable?'];
const HYPOTHETICAL = new Set(['what_if_crew_plan']);

/** A what-if answer is a solver draft that was never recorded; it says so on the answer itself. */
function Hypothetical({ tools }: { tools?: string[] }) {
  return tools?.some(t => HYPOTHETICAL.has(t)) ? <p><span className="hs-badge" data-tone="wait">Hypothetical · not recorded</span></p> : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The guardrail made visible: every number, page citation and link in the answer was checked against what
 * the tools returned (check_grounding on the backend). Shows nothing when there was nothing to check.
 */
function Checked({ g }: { g?: Grounding }) {
  const checks: Array<[Check | null | undefined, string, string]> = [
    [g?.grounding, 'number', 'match tool results'], [g?.citations, 'citation', 'verified'], [g?.links, 'link', 'verified']];
  const bad = checks.flatMap(([c]) => c && !c.passed ? c.ungrounded : []);
  if (bad.length) return <p aria-label="Checks on this answer"><span className="hs-badge" data-tone="wait">⚠ Not found in tool results: {bad.join(', ')} · check before acting</span></p>;
  const done = checks.filter(([c]) => c && c.checked > 0).map(([c, word, verb]) => `✓ ${plural(c!.checked, word)} ${verb}`);
  return done.length ? <p className="hs-computed" aria-label="Checks on this answer">{done.join(' · ')}</p> : null;
}

/** The latest answer's sources: one small row at the base of the conversation, above the suggestions. */
function Sources({ tools }: { tools?: string[] }) {
  return <p className="hs-src-row" aria-label="Sources for the latest answer"><span className="hs-src-k">Sources</span>{tools?.length ? `Used: ${tools.join(', ')}` : 'None cited'}</p>;
}

/** Live Planning Agent conversation over `/api/chat` (ADK + Gemini on the backend). */
export function Conversation({ session, compact }: ScreenProps & { compact?: boolean }) {
  const caseId = session.caseView?.case_id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    setMessages([]); setLoaded(false); setError('');
    if (caseId) apiFetch('/api/chat/history', { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('Conversation history could not be loaded.'); const body = await r.json(); setMessages(body.messages ?? []); setLoaded(true); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); abort.current?.abort(); };
  }, [caseId, session.person?.id]);
  const send = async (value: string) => {
    const text = value.trim();
    if (!text || pending || !caseId || !loaded) return;
    const id = crypto.randomUUID();
    setDraft(''); setPending(true); setError(''); setTools([]);
    setMessages(m => [...m, { id, author: 'user', text }]);
    const controller = new AbortController(); abort.current = controller;
    let answered = false;
    const used: string[] = [];
    try {
      const response = await apiFetch('/api/chat', { method: 'POST', signal: controller.signal, body: JSON.stringify({ message: text, message_id: id, case_id: caseId }) });
      await readChatStream(response, (kind, data) => {
        if (kind === 'error') throw new Error(String(data.message));
        if (kind === 'tool' && data.phase === 'started') { setTools(t => [...t, String(data.name)]); if (!used.includes(String(data.name))) used.push(String(data.name)); }
        if (kind === 'answer') { answered = true; setMessages(m => [...m.filter(x => x.id !== String(data.id)), { id: String(data.id), author: 'assistant', text: String(data.text), case_clock: data.case_clock as string | undefined, tools: Array.isArray(data.tools) ? data.tools.map(String) : used, grounding: data.grounding as Grounding | undefined }]); }
      });
      if (!answered) throw new Error('The connection closed before an answer arrived.');
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'The Planning Agent is unavailable.');
    } finally { if (!controller.signal.aborted) setPending(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(draft); };
  const latest = [...messages].reverse().find(m => m.author === 'assistant');
  return <div className="hs-chat">
    <Section title={compact ? 'Conversation' : 'AI Planning Agent'} icon="ai">
      {!compact && <AgentIntro />}
      {messages.length === 0 && loaded && <Note>Ask about today’s heat, the plan or the rules. Answers use the live case and cite the tools they called.</Note>}
      <div className="hs-chat" aria-live="polite">
        {messages.map(m => m.author === 'assistant'
          ? <Draft key={m.id} title={`Planning Agent · AI${m.case_clock ? ` · case at ${m.case_clock.slice(11, 16)}` : ''}`}><p className="hs-msg-text">{m.text}</p><Hypothetical tools={m.tools} /><Checked g={m.grounding} /></Draft>
          : <p key={m.id} className="hs-msg" data-author="user">{m.text}</p>)}
        {pending && <p className="hs-computed" role="status">Thinking…{tools.length ? ` · tools: ${tools.join(', ')}` : ''}</p>}
      </div>
      {latest && <Sources tools={latest.tools} />}
      {error && <p role="alert" className="hs-error">{error}</p>}
    </Section>
    <Section title="Suggested">
      <div className="hs-chips">{SUGGESTIONS.map(s => <button key={s} type="button" disabled={pending || !loaded} onClick={() => void send(s)}>{s}</button>)}</div>
    </Section>
    <form className="hs-composer" onSubmit={submit}>
      <input aria-label="Your question" placeholder="Ask a question" value={draft} onChange={e => setDraft(e.target.value)} autoComplete="off" disabled={!loaded} />
      <button type="submit" className="hs-button is-primary" disabled={pending || !draft.trim() || !loaded}>Send</button>
    </form>
    {!compact && <Computed>Answers are AI and may be wrong. Numbers and citations are checked against tool results. They never change the case; only people record actions. Worker ranking, discipline and diagnosis are refused.</Computed>}
  </div>;
}

/** Ask the Planning Agent (supervisor web). */
export function WebAskScreen({ session }: ScreenProps) {
  if (!session.caseView) return <NoCase session={session} />;
  return <div className="hs-screen"><Head kicker="Planning Agent" title="Ask the Planning Agent" sub="Cited answers from the live case, the solver and the guidance corpus." /><Conversation session={session} /></div>;
}

/** Ask (site app). */
export function SiteAskScreen({ session }: ScreenProps) {
  if (!session.caseView) return <NoCase session={session} />;
  return <div className="hs-screen"><Head kicker="Planning Agent" title="Ask" /><Conversation session={session} compact /><Computed>AI answers · only people record actions</Computed></div>;
}
