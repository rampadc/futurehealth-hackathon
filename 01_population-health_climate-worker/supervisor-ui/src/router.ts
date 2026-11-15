import { useEffect, useState } from 'react';

/** Minimal history router: no dependency, same-origin paths only. */
const CHANGE = 'heat-route-change';

export function navigate(target: string) {
  window.history.pushState(null, '', target);
  window.dispatchEvent(new Event(CHANGE));
}

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const changed = () => setPath(window.location.pathname);
    window.addEventListener('popstate', changed);
    window.addEventListener(CHANGE, changed);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener(CHANGE, changed); };
  }, []);
  return path;
}

export type Route =
  | { kind: 'classic' }
  | { kind: 'demo-control' }
  | { kind: 'device'; device: 'web' | 'site' | 'worker' | 'kiosk'; screen?: string };

const DEVICES = ['web', 'site', 'worker', 'kiosk'] as const;

/**
 * `/` and unknown paths open the supervisor web shell. The original nine-workspace desktop app
 * stays available at `/classic`; presenter controls stay at `/demo-control`.
 */
export function parseRoute(path: string): Route {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] === 'demo-control' && parts.length === 1) return { kind: 'demo-control' };
  if (parts[0] === 'classic' && parts.length === 1) return { kind: 'classic' };
  const device = DEVICES.find(d => d === parts[0]);
  if (device) return { kind: 'device', device, screen: parts[1]?.toLowerCase() };
  return { kind: 'device', device: 'web' };
}
