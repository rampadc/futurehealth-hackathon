import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch, live } from './live';
import { nameOf } from './replay';

/**
 * Crew photos (ui_design_system section 26). Every person-related row, cell and message shows a
 * small round photo beside the name. The photo issued with each demo account ships with the
 * bundle from `ui_design_system/people/<ID>.webp`; a photo the person uploads on their account
 * page (PUT /api/people/me/photo) wins over it for everyone. No photo: initials.
 */
const ISSUED_FILES = import.meta.glob('../../ui_design_system/people/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ISSUED: Record<string, string> = Object.fromEntries(
  Object.entries(ISSUED_FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]),
);

/** person id → upload version, from GET /api/people/photos. */
let uploaded: Record<string, string> = {};
const photoData: Record<string, string> = {};
let generation = 0;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const hasIssuedPhoto = (id: string) => id in ISSUED;
export const hasUploadedPhoto = (id: string) => id in uploaded;

/** The photo to draw for a person, or null to draw initials. */
export function photoUrl(id: string): string | null {
  if (uploaded[id] && photoData[id]) return photoData[id];
  return ISSUED[id] ?? null;
}

export function initialsOf(id: string) {
  const parts = nameOf(id).split(' ').filter(word => !/^(al|bin|bint)$/i.test(word));
  if (parts.length === 1 && /^[A-Z]\d+$/.test(parts[0])) return parts[0];
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Re-render when any uploaded photo changes. */
export function usePhotos() { return useSyncExternalStore(subscribe, () => version, () => version); }

export async function refreshPhotos() {
  const current = generation;
  try {
    const next = (await live.photos()).photos ?? {};
    if (current !== generation) return;
    for (const id of Object.keys(photoData)) if (uploaded[id] !== next[id]) delete photoData[id];
    uploaded = next; emit();
    await Promise.all(Object.keys(next).filter(id => !photoData[id]).map(async id => {
      try {
        const response = await apiFetch(`/api/people/${encodeURIComponent(id)}/photo?v=${encodeURIComponent(next[id])}`);
        if (!response.ok) return;
        const mime = response.headers.get('Content-Type')?.split(';')[0];
        if (!mime || !ACCEPTED.test(mime)) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const data = `data:${mime};base64,${btoa(binary)}`;
        if (current === generation && uploaded[id] === next[id]) { photoData[id] = data; emit(); }
      } catch { /* The issued photo remains available. */ }
    }));
  }
  catch { /* Issued photos and initials still show; uploads appear on the next refresh. */ }
}

export function clearPhotos() {
  generation++;
  uploaded = {};
  for (const id of Object.keys(photoData)) delete photoData[id];
  emit();
}

/** Load uploaded photos while someone is signed in, and again whenever the case changes. */
export function usePhotoSync(signedIn: boolean, caseVersion?: number) {
  useEffect(() => { if (signedIn) void refreshPhotos(); else clearPhotos(); }, [signedIn, caseVersion]);
}

export async function uploadOwnPhoto(personId: string, image: string) {
  const saved = await live.uploadPhoto(image);
  uploaded = { ...uploaded, [personId]: saved.updated_at };
  photoData[personId] = image;
  emit();
}

export async function removeOwnPhoto(personId: string) {
  await live.removePhoto();
  const { [personId]: _removed, ...rest } = uploaded;
  uploaded = rest;
  delete photoData[personId];
  emit();
}

const ACCEPTED = /^image\/(jpeg|png|webp)$/i;
/** Square-crop and shrink a picked photo to 256px WebP (JPEG where the browser can't encode WebP). */
export function resizePhoto(file: File, px = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED.test(file.type)) { reject(new Error('Choose a JPEG, PNG or WebP photo.')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('That photo is over 15 MB. Choose a smaller one.')); return; }
    // Read as a data: URL, not a blob: URL, so the page CSP (img-src 'self' data:) allows it.
    const reader = new FileReader();
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px;
      const context = canvas.getContext('2d');
      if (!context || !side) { reject(new Error('That file could not be read as a photo.')); return; }
      context.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, px, px);
      let out = canvas.toDataURL('image/webp', 0.85);
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', 0.85);
      resolve(out);
    };
    img.onerror = () => reject(new Error('That file could not be read as a photo.'));
    reader.onload = () => { img.src = String(reader.result); };
    reader.onerror = () => reject(new Error('That file could not be read as a photo.'));
    reader.readAsDataURL(file);
  });
}
