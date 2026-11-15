import { useEffect, useState } from 'react';
import data from './strings.json';

/**
 * Worker-facing strings, generated from the wireframe prototype by
 * `scripts/sync-wireframe-strings.mjs`. Translations are drafts that need native-speaker review.
 */
export type Lang = { code: string; endonym: string; english: string; dir: 'ltr' | 'rtl'; status: string };
export const LANGS = data.langs as Lang[];
const STRINGS = data.strings as Record<string, Record<string, string>>;
/** Preferred language per worker, keyed by wireframe first name. */
const PREFERRED = data.preferred as Record<string, string>;

export const langOf = (code: string) => LANGS.find(l => l.code === code) ?? LANGS[0];
export const isReady = (code: string) => langOf(code).status === 'ready' && !!STRINGS[code];

/** Plain text in `lang`, falling back to English. `fallback` tells the caller to mark it `lang="en"`. */
export function tr(key: string, lang: string, vars?: Record<string, string | number>) {
  let text = STRINGS[lang]?.[key];
  const fallback = text == null && lang !== 'en';
  if (text == null) text = STRINGS.en[key] ?? key;
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replace(`{${name}}`, String(value));
  return { text, fallback };
}

export function preferredLanguage(name: string, id?: string) {
  return PREFERRED[name.split(' ')[0].toLowerCase()] ?? (id ? PREFERRED[id.toLowerCase()] : undefined) ?? 'en';
}

/** SMS sizing: any Arabic or Indic character forces UCS-2, which fits 70 characters instead of 160. */
export function smsInfo(text: string) {
  const gsm = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅå_ÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
  const n = [...text].length;
  const one = gsm ? 160 : 70, part = gsm ? 153 : 67;
  return { encoding: gsm ? 'GSM-7' : 'Unicode (UCS-2)', length: n, limit: one, parts: n <= one ? 1 : Math.ceil(n / part) };
}

const KEY = 'hs-worker-lang';
const CHANGED = 'hs-worker-lang-change';
/** The worker's chosen language, kept on this device only and shared by every hook on the page. */
export function useWorkerLanguage(personId: string | undefined) {
  const read = () => { if (!personId) return null; try { return localStorage.getItem(`${KEY}:${personId}`); } catch { return null; } };
  const [lang, setLang] = useState<string | null>(read);
  useEffect(() => {
    setLang(read());
    const changed = () => setLang(read());
    window.addEventListener(CHANGED, changed);
    return () => window.removeEventListener(CHANGED, changed);
  }, [personId]);
  const choose = (code: string) => {
    setLang(code);
    try { localStorage.setItem(`${KEY}:${personId}`, code); } catch { /* Private mode: keep it for this session. */ }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [lang, choose] as const;
}
