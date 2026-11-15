import { useId, useRef, useState, type DragEvent } from 'react';
import { hasIssuedPhoto, hasUploadedPhoto, removeOwnPhoto, resizePhoto, uploadOwnPhoto, usePhotos } from '../people';
import { Avatar, Badge, Head, List, Note, Row, Section } from './kit';
import type { ScreenProps } from './registry';

/**
 * My account: the signed-in person adds, replaces or removes their own crew photo.
 * Only they can change it (PUT/DELETE /api/people/me/photo). The photo is square-cropped and
 * shrunk to 256px on the device before upload. Removing it returns to the issued photo or initials.
 */
export function AccountScreen({ session }: ScreenProps) {
  usePhotos();
  const person = session.person!;
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const uploaded = hasUploadedPhoto(person.id);
  const issued = hasIssuedPhoto(person.id);

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setError(''); setStatus('Preparing your photo…');
    try {
      await uploadOwnPhoto(person.id, await resizePhoto(file));
      setStatus('Photo updated. Your crew sees it next to your name.');
    } catch (cause) {
      setStatus('');
      setError(cause instanceof Error ? cause.message : 'The photo could not be saved.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try {
      await removeOwnPhoto(person.id);
      setStatus(issued ? 'Back to the photo issued with your account.' : 'Photo removed. Your initials are shown instead.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The photo could not be removed.'); }
    finally { setBusy(false); }
  };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void take(event.dataTransfer.files[0]); };
  const current = uploaded ? 'This is the photo you added.' : issued ? 'This is the photo issued with your account. You can replace it.' : 'No photo yet. Your initials are shown next to your name.';

  return <div className="hs-screen">
    <Head kicker="My account" title={person.name} sub={`${person.role} · ${person.organisation} · ${person.id}`} />
    <Section title="Your crew photo">
      <div className="hs-photo-upload" data-dragover={dragging || undefined}
        onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <Avatar id={person.id} size="xl" />
        <div className="hs-stack">
          <p className="hs-muted" style={{ margin: 0 }}>{current}</p>
          <div className="hs-photo-actions">
            <label className="hs-button is-primary" htmlFor={inputId} aria-disabled={busy || undefined}>{uploaded || issued ? 'Replace my photo' : 'Add my photo'}</label>
            <input ref={input} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => void take(event.target.files?.[0])} />
            {uploaded && <button type="button" className="hs-button" disabled={busy} onClick={() => void remove()}>{issued ? 'Use issued photo' : 'Remove my photo'}</button>}
          </div>
          {error && <p role="alert" className="hs-error">{error}</p>}
          <p role="status" aria-live="polite" className="hs-small" style={{ margin: 0 }}>{status}</p>
        </div>
        <p className="hs-photo-note">JPEG, PNG or WebP. Drop a photo on this area, or take one with your phone camera. Head and shoulders, face visible.</p>
      </div>
    </Section>
    <Section title="Where your photo appears">
      <List label="Preview">
        <Row lead={<Avatar id={person.id} size="md" />} title={`${person.name} · ${person.role}`} detail="Next to your name in crew lists, tasks, handoffs and records." badge={<Badge tone="done">Recorded</Badge>} />
      </List>
    </Section>
    <Note>Only you can change your photo. Your crew and supervisors see it next to your name. It is never used to recognise you automatically.</Note>
  </div>;
}
