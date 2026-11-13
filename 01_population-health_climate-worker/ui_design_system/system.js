/* Heat-Safe component behaviour. Declarative: components opt in with data attributes,
   so every control drawn in the style guide is real (keyboard, ARIA, focus), not a picture. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const isRTL = el => getComputedStyle(el).direction === 'rtl';
  let uid = 0; const id = p => `${p}-${++uid}`;

  /* ── Toast (aria-live, 8 s with Undo, 3 s without) ───────────────── */
  const region = Object.assign(document.createElement('div'), { className: 'toast-region' });
  region.setAttribute('role', 'status'); region.setAttribute('aria-live', 'polite');
  document.body.append(region);
  window.toast = (msg, undo) => {
    region.innerHTML = '';
    const t = Object.assign(document.createElement('div'), { className: 'toast' });
    t.innerHTML = `<span>${msg}</span>`;
    if (undo) { const b = Object.assign(document.createElement('button'), { className: 'btn btn--quiet', textContent: 'Undo' }); b.onclick = () => { t.remove(); undo(); }; t.append(b); }
    region.append(t);
    clearTimeout(window.__tt); window.__tt = setTimeout(() => t.remove(), undo ? 8000 : 3000);
  };

  /* ── Select: button + listbox, full keyboard model ──────────────── */
  function initSelect(root) {
    const btn = $('.select__button', root), list = $('.select__list', root), val = $('.select__value', root);
    const opts = () => $$('[role=option]', list);
    list.id ||= id('lb'); btn.setAttribute('aria-controls', list.id);
    opts().forEach(o => o.id ||= id('opt'));
    let active = -1, typed = '', typedT;
    const setActive = i => { const os = opts(); if (!os.length) return; active = (i + os.length) % os.length; os.forEach((o, j) => o.classList.toggle('is-active', j === active)); list.setAttribute('aria-activedescendant', os[active].id); os[active].scrollIntoView({ block: 'nearest' }); };
    const open = () => { list.hidden = false; btn.setAttribute('aria-expanded', 'true'); setActive(Math.max(0, opts().findIndex(o => o.getAttribute('aria-selected') === 'true'))); list.focus(); };
    const close = (focus = true) => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus(); };
    const choose = i => { const o = opts()[i]; if (!o || o.getAttribute('aria-disabled') === 'true') return; opts().forEach(x => x.setAttribute('aria-selected', String(x === o))); val.textContent = o.textContent.trim(); root.dispatchEvent(new CustomEvent('change', { detail: o.dataset.value })); close(); };
    btn.addEventListener('click', () => list.hidden ? open() : close());
    btn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } });
    list.addEventListener('keydown', e => {
      const k = e.key;
      if (k === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (k === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (k === 'Home') { e.preventDefault(); setActive(0); }
      else if (k === 'End') { e.preventDefault(); setActive(opts().length - 1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
      else if (k === 'Escape') { e.preventDefault(); close(); }
      else if (k === 'Tab') close(false);
      else if (k.length === 1) { clearTimeout(typedT); typed += k.toLowerCase(); typedT = setTimeout(() => typed = '', 600); const i = opts().findIndex(o => o.textContent.trim().toLowerCase().startsWith(typed)); if (i >= 0) setActive(i); }
    });
    list.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o) choose(opts().indexOf(o)); });
    document.addEventListener('click', e => { if (!root.contains(e.target) && !list.hidden) close(false); });
  }

  /* ── Menu: overflow actions ──────────────────────────────────────── */
  function initMenu(root) {
    const btn = $('[aria-haspopup=menu]', root), menu = $('[role=menu]', root);
    menu.id ||= id('menu'); btn.setAttribute('aria-controls', menu.id);
    const items = () => $$('[role=menuitem]', menu);
    const open = (first = true) => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); (first ? items()[0] : items().at(-1)).focus(); };
    const close = (focus = true) => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus(); };
    btn.addEventListener('click', () => menu.hidden ? open() : close());
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); open(true); } if (e.key === 'ArrowUp') { e.preventDefault(); open(false); } });
    menu.addEventListener('keydown', e => {
      const is = items(), i = is.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); is[(i + 1) % is.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); is[(i - 1 + is.length) % is.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); is[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); is.at(-1).focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') close(false);
    });
    menu.addEventListener('click', e => { const it = e.target.closest('[role=menuitem]'); if (it) close(); });
    document.addEventListener('click', e => { if (!root.contains(e.target) && !menu.hidden) close(false); });
  }

  /* ── Segmented radiogroup: roving tabindex, arrows follow reading direction ── */
  function initSeg(root) {
    const opts = $$('[role=radio]', root);
    const sel = o => { opts.forEach(x => { const on = x === o; x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; }); o.focus(); root.dispatchEvent(new CustomEvent('change', { detail: o.dataset.value })); };
    opts.forEach(o => { o.tabIndex = o.getAttribute('aria-checked') === 'true' ? 0 : -1; o.addEventListener('click', () => sel(o)); });
    root.addEventListener('keydown', e => {
      const i = opts.indexOf(document.activeElement); if (i < 0) return;
      const fwd = isRTL(root) ? 'ArrowLeft' : 'ArrowRight', back = isRTL(root) ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd || e.key === 'ArrowDown') { e.preventDefault(); sel(opts[(i + 1) % opts.length]); }
      if (e.key === back || e.key === 'ArrowUp') { e.preventDefault(); sel(opts[(i - 1 + opts.length) % opts.length]); }
    });
  }

  /* ── Draft block: "Why this?" disclosure and non-destructive discard ── */
  function initDraft(root) {
    const why = $('[data-why]', root), panel = why && $('#' + why.getAttribute('aria-controls'));
    if (why) why.addEventListener('click', () => { const open = why.getAttribute('aria-expanded') === 'true'; why.setAttribute('aria-expanded', String(!open)); panel.hidden = open; });
    const dis = $('[data-discard]', root);
    if (dis) dis.addEventListener('click', () => {
      const html = root.innerHTML, cls = root.className;
      root.className = 'draft draft--discarded';
      root.innerHTML = `<span class="t-small">${icon('ai')} AI suggestion discarded · kept in history</span><button class="btn" type="button">${icon('undo')} Undo</button>`;
      const u = $('button', root); u.focus();
      u.addEventListener('click', () => { root.className = cls; root.innerHTML = html; initDraft(root); $('[data-discard]', root).focus(); });
    });
  }

  /* ── Hold-to-confirm: 1.5 s press (pointer, Space or Enter); no typing ── */
  function initHold(btn) {
    const fill = $('.holdbtn__fill', btn); let t0 = 0, raf = 0;
    const done = () => { btn.dispatchEvent(new CustomEvent('confirmed', { bubbles: true })); };
    const step = ts => { t0 ||= ts; const p = Math.min(1, (ts - t0) / 1500); fill.style.inlineSize = p * 100 + '%'; btn.classList.toggle('is-half', p > .5); btn.setAttribute('aria-valuenow', Math.round(p * 100)); if (p >= 1) { raf = 0; done(); return; } raf = requestAnimationFrame(step); };
    const start = e => { e.preventDefault(); if (raf) return; t0 = 0; raf = requestAnimationFrame(step); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; fill.style.inlineSize = '0'; btn.classList.remove('is-half'); btn.setAttribute('aria-valuenow', 0); };
    btn.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
    btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });
  }

  /* ── Typed confirmation dialog (supervisors only; workers use hold) ── */
  function initConfirm(trigger) {
    const dlg = $('#' + trigger.dataset.confirm); if (!dlg) return;
    const input = $('input', dlg), ok = $('[data-ok]', dlg), cancel = $('[data-cancel]', dlg), err = $('.field__error', dlg), word = dlg.dataset.word;
    trigger.addEventListener('click', () => { input.value = ''; ok.disabled = true; err.hidden = true; dlg.showModal(); cancel.focus(); });
    input.addEventListener('input', () => { ok.disabled = input.value !== word; const wrong = input.value && !word.startsWith(input.value.toUpperCase()); err.hidden = !wrong; input.setAttribute('aria-invalid', String(wrong)); });
    cancel.addEventListener('click', () => dlg.close());
    ok.addEventListener('click', () => { dlg.close(); toast(dlg.dataset.done || 'Recorded'); });
  }

  /* ── Loading demo: a real aria-busy cycle, success or failure ──────── */
  function initLoad(btn) {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-busy') === 'true') return;
      btn.setAttribute('aria-busy', 'true');
      setTimeout(() => {
        btn.removeAttribute('aria-busy');
        if (btn.dataset.fail) { btn.classList.add('is-error'); const m = document.getElementById(btn.getAttribute('aria-describedby')); if (m) m.hidden = false; toast('Couldn’t reach Heat-Safe in 20 seconds. Your entry is saved on this device.'); }
        else { btn.classList.remove('is-error'); toast(btn.dataset.ok || 'Done'); }
      }, 1400);
    });
  }

  window.initSystem = (scope = document) => {
    $$('.select', scope).forEach(initSelect);
    $$('[data-menu]', scope).forEach(initMenu);
    $$('.seg[role=radiogroup]', scope).forEach(initSeg);
    $$('[role=switch]', scope).forEach(s => s.addEventListener('click', () => { if (s.disabled) return; s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true')); }));
    $$('.draft', scope).forEach(initDraft);
    $$('.holdbtn', scope).forEach(initHold);
    $$('[data-confirm]', scope).forEach(initConfirm);
    $$('[data-load]', scope).forEach(initLoad);
  };
})();
