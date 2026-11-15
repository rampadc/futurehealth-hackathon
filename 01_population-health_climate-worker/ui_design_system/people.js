/* Heat-Safe crew photos. One helper for the style guide and the wireframes
   (the React app has its own version in supervisor-ui/src/people.ts).

   HSPeople.avatar('C08', { size: 'md' })        → '<span class="avatar avatar--md">…</span>'
   HSPeople.person('C08', { meta: 'Civil worker' }) → photo + name
   HSPeople.stack(['C05', 'C06', 'C07'])           → overlapping crew faces
   HSPeople.hydrate(root)                           → fills every [data-person] element

   Bundled photos live in ./people/<ID>.webp (256px, square). A photo someone uploads on
   their account page wins over the bundled one. In these static pages the upload stays
   in this browser (localStorage); the app stores it on the server. */
(function () {
  const here = (document.currentScript && document.currentScript.src) || location.href;
  const BASE = new URL('people/', here).href;
  const PHOTOS = new Set(['C01', 'C02', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C12', 'L02', 'L04', 'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P08', 'P09']);
  const ROSTER = {
    P01: ['Amal Al Nadir', 'Project manager'],
    P02: ['Rashid Al Wadi', 'Superintendent'],
    P03: ['Maya Al Qamar', 'Safety officer'],
    P04: ['Tariq Al Safa', 'Permit coordinator'],
    P05: ['Noura Al Nadir', 'Logistics coordinator'],
    P06: ['Salim Al Wadi', 'First aider'],
    P07: ['Lina Al Qamar', 'Welfare attendant'],
    P08: ['Omar Al Safa', 'Welfare attendant'],
    P09: ['Hessa Al Qamar', 'HSE systems admin'],
    C01: ['Huda Al Nadir', 'Civil foreman'],
    C02: ['Faris Al Wadi', 'Plant operator'],
    C03: ['Sara Al Qamar', 'Plant operator'],
    C04: ['Khalid Al Safa', 'Banksman'],
    C05: ['Rana Al Nadir', 'Civil worker'],
    C06: ['Yusuf Al Wadi', 'Civil worker'],
    C07: ['Dana Al Qamar', 'Civil worker'],
    C08: ['Bilal Al Safa', 'Civil worker'],
    C09: ['Leila Al Nadir', 'Civil worker'],
    C10: ['Zaid Al Wadi', 'Civil worker'],
    C11: ['Mariam Al Qamar', 'Civil worker'],
    C12: ['Samir Al Safa', 'Civil worker'],
    C13: ['Noor Al Nadir', 'Civil worker'],
    C14: ['Adil Al Wadi', 'Civil worker'],
    E01: ['Aisha Al Qamar', 'Electrical foreman'],
    E02: ['Karim Al Safa', 'Electrician'],
    E03: ['Fatima Al Nadir', 'Electrician'],
    E04: ['Nabil Al Wadi', 'Electrician'],
    E05: ['Reem Al Qamar', 'Electrician'],
    E06: ['Jamal Al Safa', 'Electrician'],
    E07: ['Mona Al Nadir', 'Electrical assistant'],
    E08: ['Hassan Al Wadi', 'Electrical assistant'],
    E09: ['Layla Al Qamar', 'Electrical assistant'],
    E10: ['Saeed Al Safa', 'Electrical assistant'],
    L01: ['Dalia Al Nadir', 'Driver'],
    L02: ['Ibrahim Al Wadi', 'Driver'],
    L03: ['Yara Al Qamar', 'Forklift operator'],
    L04: ['Hamza Al Safa', 'Storekeeper'],
  };
  const KEY = id => 'hs-photo:' + id;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

  function uploaded(id) { try { return localStorage.getItem(KEY(id)); } catch (e) { return null; } }
  function name(id) { return (ROSTER[id] || [id])[0]; }
  function role(id) { return (ROSTER[id] || [id, ''])[1]; }
  function first(id) { return name(id).split(' ')[0]; }
  function initials(id) {
    const parts = name(id).split(' ').filter(w => !/^(al|bin|bint)$/i.test(w));
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  /** Uploaded photo, else the bundled one, else null (initials are drawn instead). */
  function photo(id) { return uploaded(id) || (PHOTOS.has(id) ? BASE + id + '.webp' : null); }
  /** Find a person by first name, for copy that only says "Bilal". */
  function byFirst(word) { return Object.keys(ROSTER).find(id => first(id) === word) || null; }

  function inner(id) {
    const src = photo(id);
    return src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : esc(initials(id));
  }
  /** The photo circle. Decorative by default, because the name is always written beside it. */
  function avatar(id, opts) {
    opts = opts || {};
    const size = opts.size ? ' avatar--' + opts.size : '';
    const extra = opts.cls ? ' ' + opts.cls : '';
    const label = opts.label ? ` role="img" aria-label="${esc(name(id))}"` : ' aria-hidden="true"';
    return `<span class="avatar${size}${extra}" data-avatar="${esc(id)}"${label}>${inner(id)}</span>`;
  }
  function person(id, opts) {
    opts = opts || {};
    const meta = opts.meta === undefined ? role(id) : opts.meta;
    return `<span class="person">${avatar(id, { size: opts.size || 'sm', cls: opts.cls })}<span class="person__text"><span class="person__name">${esc(opts.short ? first(id) : name(id))}</span>` +
      (meta ? `<span class="person__meta">${esc(meta)}</span>` : '') + '</span></span>';
  }
  function stack(ids, opts) {
    opts = opts || {};
    const max = opts.max || 4;
    const shown = ids.slice(0, max).map(id => avatar(id, { size: opts.size || 'sm' })).join('');
    const more = ids.length > max ? `<span class="avatars__more">+${ids.length - max}</span>` : '';
    return `<span class="avatars" role="img" aria-label="${esc(ids.map(name).join(', '))}">${shown}${more}</span>`;
  }
  /** Replace each [data-person="ID"] (optional data-size, data-mode="person") with markup. */
  function hydrate(root) {
    (root || document).querySelectorAll('[data-person]').forEach(el => {
      const id = el.getAttribute('data-person');
      const size = el.getAttribute('data-size') || undefined;
      el.innerHTML = el.getAttribute('data-mode') === 'person' ? person(id, { size }) : avatar(id, { size });
      el.removeAttribute('data-person');
    });
  }
  /** Square-crop and shrink a picked image to 256px WebP (JPEG where WebP encoding is missing). */
  function resize(file, px) {
    px = px || 256;
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) return reject(new Error('Choose a JPEG, PNG or WebP photo.'));
      if (file.size > 15 * 1024 * 1024) return reject(new Error('That photo is over 15 MB. Choose a smaller one.'));
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas'); c.width = c.height = px;
        c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, px, px);
        let out = c.toDataURL('image/webp', 0.85);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.85);
        resolve(out);
      };
      img.onerror = () => reject(new Error('That file could not be read as a photo.'));
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = () => reject(new Error('That file could not be read as a photo.'));
      reader.readAsDataURL(file);
    });
  }
  function changed(id) {
    document.querySelectorAll(`[data-avatar="${id}"]`).forEach(el => { el.innerHTML = inner(id); });
    window.dispatchEvent(new CustomEvent('hs-photo-change', { detail: { id } }));
  }
  function setPhoto(id, dataUrl) {
    try { localStorage.setItem(KEY(id), dataUrl); } catch (e) { throw new Error('This browser could not keep the photo.'); }
    changed(id);
  }
  function clearPhoto(id) { try { localStorage.removeItem(KEY(id)); } catch (e) { /* nothing stored */ } changed(id); }
  function isUploaded(id) { return !!uploaded(id); }
  function hasBundled(id) { return PHOTOS.has(id); }

  window.HSPeople = { ROSTER, name, role, first, initials, photo, byFirst, avatar, person, stack, hydrate, resize, setPhoto, clearPhoto, isUploaded, hasBundled };
})();
