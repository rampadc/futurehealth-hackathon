import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssistantChat, readChatStream } from './AssistantChat';
import { initialStory, PERSONAS } from './story';

const person = PERSONAS.find(person => person.id === 'P03')!;
const props = { open: true, onClose: () => {}, person, story: initialStory(), capture: undefined, caseId: 'case-1' };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const answer = () => new Response('event: tool\ndata: {"name":"get_tasks","phase":"completed"}\n\nevent: answer\ndata: {"id":"a1","text":"Maya must issue the stop-work instruction.","sources":[{"view":"workspace","label":"View workspace"}]}\n\nevent: done\ndata: {}\n\n');
afterEach(() => vi.unstubAllGlobals());

it('loads history and sends a live request with its case identity', async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'POST' ? answer() : json({ messages: [] }));
  vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); const navigate = vi.fn();
  render(<AssistantChat {...props} onNavigate={navigate} />);
  expect(screen.getByText('Using your site case and work plan.')).toBeTruthy();
  await waitFor(() => expect((screen.getByRole('button', { name: 'What needs attention?' }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole('button', { name: 'What needs attention?' }));
  expect(await screen.findByText('Maya must issue the stop-work instruction.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'View workspace' }));
  expect(navigate).toHaveBeenCalledWith('workspace');
  const post = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(post![1]!.body as string)).toMatchObject({ case_id: 'case-1', message: 'What needs attention?' });
});

it('shows a real failure and retries without inventing an answer', async () => {
  let requests = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method !== 'POST') return json({ messages: [] });
    requests++;
    return requests === 1 ? new Response('event: error\ndata: {"message":"Gemini is unavailable."}\n\n') : answer();
  }));
  const user = userEvent.setup(); render(<AssistantChat {...props} />);
  await waitFor(() => expect((screen.getByRole('button', { name: 'What needs attention?' }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole('button', { name: 'What needs attention?' }));
  expect(await screen.findByText('Gemini is unavailable.')).toBeTruthy();
  expect(screen.queryByLabelText('Assistant reply')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Maya must issue the stop-work instruction.')).toBeTruthy();
  expect(screen.getAllByText('What needs attention?')).toHaveLength(1);
});

it('restores the persisted conversation and clears it through the backend', async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => json({ messages: options?.method === 'DELETE' ? [] : [{ id: 'old', author: 'assistant', text: 'Previously recorded answer.' }] }));
  vi.stubGlobal('fetch', fetch); const user = userEvent.setup(); render(<AssistantChat {...props} />);
  expect(await screen.findByText('Previously recorded answer.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'New chat' }));
  await waitFor(() => expect(screen.queryByText('Previously recorded answer.')).toBeNull());
  expect(fetch).toHaveBeenCalledWith('/api/chat/history', expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ 'X-Heat-Tab-ID': expect.any(String) }) }));
});

it('parses stream frames split across network chunks', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { for (const chunk of ['event: ans', 'wer\ndata: {"text":"Live"}\n', '\nevent: done\ndata: {}\n\n']) controller.enqueue(encoder.encode(chunk)); controller.close(); } });
  const receive = vi.fn(); await readChatStream(new Response(stream), receive);
  expect(receive).toHaveBeenCalledWith('answer', { text: 'Live' });
  expect(receive).toHaveBeenCalledWith('done', {});
});
