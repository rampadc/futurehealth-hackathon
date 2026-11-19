import { useEffect, useRef, useState } from 'react';
import { T, useT, useWorker } from './frame';

/** Browser speech recognition (Chrome, Edge, Safari). Absent elsewhere, so voice is optional. */
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionCtor = new () => Recognition;

const LOCALES: Record<string, string> = { en: 'en-AE', ar: 'ar-AE', ur: 'ur-PK', hi: 'hi-IN', ml: 'ml-IN', bn: 'bn-BD', tl: 'fil-PH' };

export function speechRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Voice check-in: tap to speak, tap again to finish, see what was understood, then confirm. The transcript stays on
 * this phone and is never sent to Heat-Safe or the supervisor; only the worker's confirmed action is.
 * The browser's own speech service does the transcription, which the note says plainly.
 */
export function VoiceCheckIn({ onUnderstood }: { onUnderstood: (text: string) => void }) {
  const t = useT();
  const { lang } = useWorker();
  const Ctor = speechRecognition();
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => () => recognition.current?.abort(), []);
  if (!Ctor) return null;
  const start = () => {
    if (listening) return;
    setError(''); setText('');
    const r = new Ctor();
    r.lang = LOCALES[lang] ?? 'en-AE'; r.interimResults = true; r.continuous = false;
    r.onresult = event => setText(Array.from(event.results).map(result => result[0].transcript).join(' '));
    r.onerror = event => setError(event.error === 'not-allowed' ? t('v.denied') : t('v.failed'));
    r.onend = () => setListening(false);
    recognition.current = r;
    try { r.start(); setListening(true); } catch { setError(t('v.failed')); }
  };
  const stop = () => recognition.current?.stop();
  return <div className="hs-form">
    <button type="button" className="hs-button is-primary" aria-pressed={listening} onClick={() => listening ? stop() : start()}>
      🎙 {listening ? t('p4.listen') : t('p4.hold')}
    </button>
    {text && <div className="hs-draft" aria-live="polite">
      <p className="hs-label"><T k="p4.understood" /></p>
      <p>“{text}”</p>
      <p className="hs-small"><T k="p4.vn" /></p>
      {!listening && <div className="hs-form-row">
        <button type="button" className="hs-button is-danger" onClick={() => onUnderstood(text)}><T k="unwell" /></button>
        <button type="button" className="hs-button" onClick={() => setText('')}><T k="p4.retry" /></button>
      </div>}
    </div>}
    {error && <p role="alert" className="hs-error">{error}</p>}
    <p className="hs-small hs-muted"><T k="v.note" /></p>
  </div>;
}
