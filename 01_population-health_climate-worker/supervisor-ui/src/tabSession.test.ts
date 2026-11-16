import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); vi.resetModules(); });

it('regenerates a copied tab id before the first persona request', async () => {
  sessionStorage.setItem('heat-tab-id', 'copied-tab-identity');
  class OtherTab {
    listener?: (event: { data: unknown }) => void;
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listener = listener; }
    postMessage(message: { type: string; id: string }) {
      if (message.type === 'probe') this.listener?.({ data: { type: 'occupied', id: message.id, nonce: 'other-tab' } });
    }
  }
  vi.stubGlobal('BroadcastChannel', OtherTab);
  const session = await import('./tabSession');
  const id = await session.establishTabId();
  expect(id).not.toBe('copied-tab-identity');
  expect(session.tabSessionHeader()['X-Heat-Tab-ID']).toBe(id);
  expect(sessionStorage.getItem('heat-tab-id')).toBe(id);
});

it('keeps a tab id across reloads when nobody else claims it', async () => {
  sessionStorage.setItem('heat-tab-id', 'existing-tab-identity');
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('navigator', { locks: { request: (_name: string, _options: unknown, callback: (lock: object) => unknown) => { void callback({}); return new Promise(() => {}); } } });
  const session = await import('./tabSession');
  expect(await session.establishTabId()).toBe('existing-tab-identity');
});

it('rejects a copied id even if the original tab responds after the probe timeout', async () => {
  sessionStorage.setItem('heat-tab-id', 'copied-tab-identity');
  class DelayedTab {
    listener?: (event: { data: unknown }) => void;
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listener = listener; }
    postMessage(message: { type: string; id: string }) {
      if (message.type === 'probe') setTimeout(() => this.listener?.({ data: { type: 'occupied', id: message.id, nonce: 'old-tab' } }), 250);
    }
  }
  vi.stubGlobal('BroadcastChannel', DelayedTab);
  vi.stubGlobal('navigator', { locks: { request: (name: string, _options: unknown, callback: (lock: object | null) => unknown) => { void callback(name.endsWith('copied-tab-identity') ? null : {}); return Promise.resolve(); } } });
  const session = await import('./tabSession');
  expect(await session.establishTabId()).not.toBe('copied-tab-identity');
  const claimed = session.tabSessionHeader()['X-Heat-Tab-ID'];
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(session.tabSessionHeader()['X-Heat-Tab-ID']).toBe(claimed);
});
