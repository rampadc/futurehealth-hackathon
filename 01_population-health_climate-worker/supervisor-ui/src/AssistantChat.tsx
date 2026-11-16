import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Alert, Box, Button, Divider, Drawer, IconButton, InputAdornment, Stack, SvgIcon, TextField, Typography } from '@mui/material';
import type { ReplayCapture } from './replay';
import type { Persona, StoryState } from './story';
import { apiFetch } from './live';

export interface AssistantChatProps {
  open: boolean; onClose: () => void; person: Persona; story: StoryState;
  capture: ReplayCapture | undefined; caseId?: string;
  onNavigate?: (view: 'workspace' | 'plan' | 'activity') => void;
}
type Source = { view: 'workspace' | 'plan' | 'activity'; label: string };
type Message = { id: string; author: 'user' | 'assistant'; text: string; sources?: Source[]; case_clock?: string };
const suggestions = ['Who can work in the workshop?', 'What needs attention?', 'Can trench work restart?'];
const workerSuggestions = ['What is my work and recovery schedule?', 'What needs attention?', 'Can trench work restart?'];
const worker = (person: Persona) => person.id === 'C05' || person.id === 'C08';

export async function readChatStream(response: Response, receive: (kind: string, data: Record<string, unknown>) => void) {
  if (!response.ok) throw new Error('The assistant is unavailable. Please try again.');
  if (!response.body) throw new Error('The assistant returned no response stream.');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const result = await reader.read();
    buffer += decoder.decode(result.value, { stream: !result.done });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      const kind = block.split('\n').find(line => line.startsWith('event: '))?.slice(7);
      const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
      if (kind && data) receive(kind, JSON.parse(data));
    }
    if (result.done) break;
  }
}

export function AssistantChat({ open, onClose, onNavigate, person, caseId }: AssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(''); const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false); const [error, setError] = useState('');
  const [failed, setFailed] = useState<{text:string; id:string}>();
  const log = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, pending]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(false); setMessages([]); setError(''); setPending(false); setFailed(undefined);
    if (caseId) apiFetch('/api/chat/history', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Conversation history could not be loaded.');
      const result = await response.json(); if (!controller.signal.aborted) { setMessages(result.messages); setLoaded(true); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); abort.current?.abort(); };
  }, [person.id, caseId]);
  const newChat = async () => {
    abort.current?.abort(); setPending(false);
    try {
      const response = await apiFetch('/api/chat/history', { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not start a new conversation.');
      setMessages([]); setDraft(''); setError(''); setFailed(undefined); setLoaded(true); input.current?.focus();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not start a new conversation.'); }
  };
  const send = async (value = draft, retryId?: string) => {
    const text = value.trim(); if (!text || pending || !caseId || !loaded) return;
    const id = retryId ?? crypto.randomUUID(); setDraft(''); setPending(true); setError(''); setFailed(undefined);
    if (!retryId) setMessages(previous => [...previous, { id, author: 'user', text }]);
    const controller = new AbortController(); abort.current = controller; let answered = false;
    try {
      const response = await apiFetch('/api/chat', { method: 'POST', signal: controller.signal, body: JSON.stringify({ message: text, message_id: id, case_id: caseId }) });
      await readChatStream(response, (kind, data) => {
        if (kind === 'error') throw new Error(String(data.message));
        if (kind === 'answer') {
          answered = true;
          setMessages(previous => [...previous.filter(message => message.id !== String(data.id)), { id: String(data.id), author: 'assistant', text: String(data.text), sources: data.sources as Source[], case_clock: data.case_clock as string | undefined }]);
        }
      });
      if (!answered) throw new Error('The assistant connection closed before an answer arrived.');
    } catch (error) {
      if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : 'The live assistant is unavailable.'); setFailed({ text, id }); }
    } finally { if (!controller.signal.aborted) setPending(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(); };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  };
  return <Drawer variant="persistent" anchor="right" open={open} sx={{ width: theme => open ? theme.spacing(44) : 0, flexShrink: 0, overflowX: open ? 'visible' : 'clip', '& .MuiDrawer-paper': { width: theme => theme.spacing(44), boxSizing: 'border-box', position: 'sticky', top: theme => theme.spacing(8), height: theme => `calc(100dvh - ${theme.spacing(8)})`, borderLeft: '1px solid', borderColor: 'divider' } }}>
    <Stack onKeyDown={event => { if (event.key === 'Escape') onClose(); }} sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, py: 1.5 }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, flexGrow: 1 }}>Planning assistant</Typography>
        <IconButton aria-label="New chat" title="New chat" onClick={() => void newChat()} disabled={pending || !caseId} size="small"><SvgIcon fontSize="small"><path d="M19 3H5a2 2 0 0 0-2 2v14l4-4h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-6 9h-2V9H8V7h3V4h2v3h3v2h-3v3Z" /></SvgIcon></IconButton>
        <IconButton aria-label="Close planning assistant" onClick={onClose} size="small"><SvgIcon fontSize="small"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12Z" /></SvgIcon></IconButton>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>Using your site case and work plan.</Typography>
      <Divider />
      <Box ref={log} role="log" aria-label="Planning assistant conversation" aria-live="polite" sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {!caseId && <Typography color="text.secondary">No active site case is available.</Typography>}
        {error && <Alert severity="error" sx={{ mb: 2 }} action={failed ? <Button color="inherit" onClick={() => void send(failed.text, failed.id)}>Retry</Button> : <Button color="inherit" onClick={() => void newChat()}>Reconnect</Button>}>{error}</Alert>}
        {!messages.length && caseId && <Stack spacing={2} sx={{ py: 3 }}>
          <Typography variant="h6">How can I help?</Typography>
          <Typography variant="body2" color="text.secondary">Ask about this case, your next action or the current work plan.</Typography>
          {(worker(person) ? workerSuggestions : suggestions).map(question => <Button key={question} variant="outlined" onClick={() => void send(question)} disabled={!loaded || pending} sx={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}>{question}</Button>)}
        </Stack>}
        <Stack spacing={2}>{messages.map(message => <Box component="article" aria-label={message.author === 'user' ? 'Your message' : 'Assistant reply'} key={message.id} sx={{ alignSelf: message.author === 'user' ? 'flex-end' : 'stretch', maxWidth: message.author === 'user' ? '90%' : '100%', px: message.author === 'user' ? 1.5 : 0, py: message.author === 'user' ? 1 : 0, borderRadius: 2, bgcolor: message.author === 'user' ? 'action.selected' : 'transparent' }}><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{message.text}</Typography>{message.case_clock && <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>Case at {new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(message.case_clock))} GST</Typography>}{message.sources?.map(source => onNavigate && <Button key={source.view} size="small" onClick={() => onNavigate(source.view)} sx={{ mt: 1, mr: 2, px: 0, minWidth: 0 }}>{source.label}</Button>)}</Box>)}</Stack>
        {pending && <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 2 }}>Consulting the live assistant…</Typography>}
      </Box>
      <Divider />
      <Box component="form" onSubmit={submit} sx={{ p: 2 }}>
        <TextField inputRef={input} label="Ask about this case" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={keyDown} multiline minRows={1} maxRows={5} fullWidth slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton type="submit" aria-label="Send" disabled={!draft.trim() || pending || !loaded || !caseId} color="primary" size="small"><SvgIcon fontSize="small"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2Z" /></SvgIcon></IconButton></InputAdornment> } }} />
      </Box>
    </Stack>
  </Drawer>;
}
