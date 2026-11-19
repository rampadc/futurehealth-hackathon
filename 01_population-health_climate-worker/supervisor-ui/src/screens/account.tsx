import { useId, useRef, useState, type DragEvent } from 'react';
import { hasIssuedPhoto, hasUploadedPhoto, removeOwnPhoto, resizePhoto, uploadOwnPhoto, usePhotos } from '../people';
import { LANGS } from '../i18n';
import { Avatar, Badge, Head, List, Note, Row, Section } from './kit';
import type { ScreenProps } from './registry';
import { T, useT, useWorker, WorkerFrame } from './worker/frame';

const ROLE_KEY: Record<string, string> = { 'Civil worker': 'role.civil' };

/**
 * My account: the signed-in person adds, replaces or removes their own crew photo.
 * Only they can change it (PUT/DELETE /api/people/me/photo). The photo is square-cropped and
 * shrunk to 256px on the device before upload. Removing it returns to the issued photo or initials.
 * Outside the worker app there is no language context, so the text is English.
 */
export function AccountScreen({ session, languages }: ScreenProps & { languages?: boolean }) {
  usePhotos();
  const t = useT();
  const person = session.person!;
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const uploaded = hasUploadedPhoto(person.id);
  const issued = hasIssuedPhoto(person.id);
  const role = ROLE_KEY[person.role] ? t(ROLE_KEY[person.role]) : person.role;

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setError(''); setStatus(t('acc.preparing'));
    try {
      await uploadOwnPhoto(person.id, await resizePhoto(file));
      setStatus(t('acc.updated'));
    } catch (cause) {
      setStatus('');
      setError(cause instanceof Error ? cause.message : t('acc.saveFail'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try {
      await removeOwnPhoto(person.id);
      setStatus(issued ? t('acc.backIssued') : t('acc.removed'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('acc.removeFail')); }
    finally { setBusy(false); }
  };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void take(event.dataTransfer.files[0]); };
  const current = uploaded ? t('acc.added') : issued ? t('acc.issued') : t('acc.none');

  return <div className="hs-screen">
    <Head kicker={<T k="acc.kicker" />} title={person.name} sub={<>{role} · {person.organisation} · {person.id}</>} />
    {languages && <LanguageSection />}
    <Section icon="camera" title={<T k="acc.photo" />}>
      <div className="hs-photo-upload" data-dragover={dragging || undefined}
        onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <Avatar id={person.id} size="xl" />
        <div className="hs-stack">
          <p className="hs-muted" style={{ margin: 0 }}>{current}</p>
          <div className="hs-photo-actions">
            <label className="hs-button is-primary" htmlFor={inputId} aria-disabled={busy || undefined}>{uploaded || issued ? t('acc.replace') : t('acc.add')}</label>
            <input ref={input} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => void take(event.target.files?.[0])} />
            {uploaded && <button type="button" className="hs-button" disabled={busy} onClick={() => void remove()}>{issued ? t('acc.useIssued') : t('acc.remove')}</button>}
          </div>
          {error && <p role="alert" className="hs-error">{error}</p>}
          <p role="status" aria-live="polite" className="hs-small" style={{ margin: 0 }}>{status}</p>
        </div>
        <p className="hs-photo-note"><T k="acc.formats" /></p>
      </div>
    </Section>
    <Section icon="camera" title={<T k="acc.where" />}>
      <List label={t('acc.where')}>
        <Row lead={<Avatar id={person.id} size="md" />} title={`${person.name} · ${role}`} detail={<T k="acc.appears" />} badge={<Badge tone="done"><T k="acc.shown" /></Badge>} />
      </List>
    </Section>
    <Note><T k="acc.only" /></Note>
  </div>;
}

/** Worker app language, changed here at any time. Kept on this phone, like the first choice on Welcome. */
function LanguageSection() {
  const { lang, choose } = useWorker();
  return <Section icon="globe" title={<T k="acc.lang" />}>
    <p className="hs-muted" style={{ margin: 0 }}><T k="acc.langNote" /></p>
    <ul className="hs-langs" data-compact>{LANGS.filter(l => l.status === 'ready').map(l => <li key={l.code}>
      <button type="button" lang={l.code} dir={l.dir} aria-pressed={lang === l.code} onClick={() => choose(l.code)}>
        {l.endonym}<small lang="en" dir="ltr">{l.english}</small>
      </button></li>)}
    </ul>
  </Section>;
}

/** The worker app's account screen: in the worker's language, with the language setting. */
export function WorkerAccountScreen(props: ScreenProps) {
  return <WorkerFrame session={props.session}><AccountScreen {...props} languages /></WorkerFrame>;
}
