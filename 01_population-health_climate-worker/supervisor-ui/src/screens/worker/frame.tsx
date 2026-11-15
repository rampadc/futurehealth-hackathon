import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { langOf, tr, useWorkerLanguage } from '../../i18n';
import type { CaseSession } from '../../session';

/** Language and network state for the worker app (P1–P8). */
type WorkerContext = { lang: string; chosen: boolean; choose: (code: string) => void; online: boolean };
const Ctx = createContext<WorkerContext>({ lang: 'en', chosen: false, choose: () => {}, online: true });
export const useWorker = () => useContext(Ctx);

/** Translated text. Strings missing in the chosen language fall back to English and say so. */
export function T({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  const { lang } = useWorker();
  const { text, fallback } = tr(k, lang, vars);
  return fallback ? <span lang="en" dir="ltr" className="hs-fallback-text">{text}</span> : <>{text}</>;
}
export const useT = () => { const { lang } = useWorker(); return (k: string, vars?: Record<string, string | number>) => tr(k, lang, vars).text; };

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

/**
 * Wraps each worker screen: sets `lang` and `dir` so Arabic and Urdu mirror, and shows the
 * P7 offline banner when the phone loses its network.
 */
export function WorkerFrame({ session, children, forceOffline }: { session: CaseSession; children: ReactNode; forceOffline?: boolean }) {
  const [stored, choose] = useWorkerLanguage(session.person?.id);
  const online = useOnline() && !forceOffline;
  const lang = stored ?? 'en';
  const meta = langOf(lang);
  return <Ctx.Provider value={{ lang, chosen: !!stored, choose, online }}>
    <div lang={lang} dir={meta.dir} className="hs-worker" data-script={lang}>
      {!online && <p className="hs-offline" role="status">{tr('p2.offline', lang).text}</p>}
      {children}
    </div>
  </Ctx.Provider>;
}
