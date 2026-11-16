const KEY = 'heat-tab-id';
const nonce = crypto.randomUUID();
const stored = sessionStorage.getItem(KEY);
const inherited = !!stored;
let tabId = stored && /^[A-Za-z0-9_-]{16,128}$/.test(stored) ? stored : crypto.randomUUID();
sessionStorage.setItem(KEY, tabId);
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('heat-tab-session');
let claim: Promise<string> | null = null;

channel?.addEventListener('message', event => {
  const message = event.data as { type?: string; id?: string; nonce?: string };
  if (message.id === tabId && message.nonce !== nonce && message.type === 'probe')
    channel.postMessage({ type: 'occupied', id: tabId, nonce });
});

function newId() {
  tabId = crypto.randomUUID();
  sessionStorage.setItem(KEY, tabId);
}

/** Hold the exclusive claim until the document unloads. The request itself stays pending. */
function tryLock(id: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      void navigator.locks.request(`heat-tab:${id}`, { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return; }
        resolve(true);
        return new Promise<void>(() => {});
      }).catch(() => resolve(false));
    } catch { resolve(false); }
  });
}

/** Claim the identity before any persona request; copied tabs get a new identity. */
export function establishTabId(): Promise<string> {
  if (claim) return claim;
  claim = (async () => {
    channel?.postMessage({ type: 'probe', id: tabId, nonce });
    if (!navigator.locks) {
      // Without an atomic tab lock, never reuse a possibly copied sessionStorage id.
      if (inherited) newId();
      return tabId;
    }
    if (await tryLock(tabId)) return tabId;
    // A reload may briefly overlap its previous document. Give that lock a chance to release.
    await new Promise(resolve => setTimeout(resolve, 150));
    if (await tryLock(tabId)) return tabId;
    newId();
    await tryLock(tabId);
    return tabId;
  })();
  return claim;
}

/** Recover safely if the server ever reports a different viewer for this tab. */
export async function rotateTabId(): Promise<string> {
  newId();
  if (navigator.locks) await tryLock(tabId);
  claim = Promise.resolve(tabId);
  return tabId;
}

export function tabSessionHeader(): Record<string, string> { return { 'X-Heat-Tab-ID': tabId }; }
