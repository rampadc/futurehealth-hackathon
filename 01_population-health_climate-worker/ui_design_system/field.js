/* Heat-Safe field and system behaviour: offline sync queue, agent task state,
   inline suggestions, guardrail records, media capture, zone plan.
   Load after icons.js and system.js. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clock = (() => { let m = 19; return () => `08:${String(m++).padStart(2, '0')}`; })();

  /* ── Sync engine (offline-first) ─────────────────────────────────────
     Records are written to the device first, always. The network only
     changes whether they leave the device. Every title block shows the state. */
  const Sync = {
    online: true,
    items: [
      { id: 1, title: 'Readiness · Leila (C09) · workshop preparation', meta: 'Recorded by Huda 08:18', state: 'sent', failOnce: false },
      { id: 2, title: 'Seen in person · Zaid (C10) · Shelter A', meta: 'Manual entry 08:05 · the kiosk also logged him at 08:06', state: 'conflict' },
    ],
    add(title) { this.items.unshift({ id: Date.now(), title, meta: `Saved on this phone ${clock()}`, state: 'saved', failOnce: /Water/.test(title) }); this.flush(); },
    flush() {
      if (!this.online) return this.render();
      const pending = this.items.filter(i => i.state === 'saved');
      pending.forEach(i => i.state = 'sending');
      this.render();
      pending.forEach((i, n) => setTimeout(() => { if (!this.online) { i.state = 'saved'; return this.render(); } if (i.failOnce) { i.failOnce = false; i.state = 'failed'; i.meta = 'Server rejected: Shelter A water log closed at 08:20'; } else { i.state = 'sent'; i.meta = `Sent ${clock()}`; } this.render(); }, 900 + n * 500));
    },
    summary() {
      const c = s => this.items.filter(i => i.state === s).length;
      if (!this.online) { const n = c('saved') + c('failed'); return ['offline', `No network · ${n} saved on this phone`]; }
      if (c('sending')) return ['sending', `Sending ${c('sending')}…`];
      if (c('failed') || c('conflict')) return ['failed', `${c('failed') + c('conflict')} need${c('failed') + c('conflict') === 1 ? 's' : ''} you`];
      if (c('saved')) return ['pending', `${c('saved')} waiting to send`];
      return ['synced', `Synced 08:19`];
    },
    render() {
      const [state, text] = this.summary();
      const glyph = { synced: '✓', pending: '…', sending: '↻', failed: '!', offline: '⌀' }[state];
      $$('[data-sync]').forEach(el => { el.dataset.state = state; el.innerHTML = `<span aria-hidden="true">${glyph}</span>${text}`; el.setAttribute('aria-label', `Sync status: ${text}`); });
      const q = $('#queue'); if (!q) return;
      const label = { saved: 'Saved on this phone', sending: 'Sending', sent: 'Sent', failed: 'Not sent', conflict: 'Conflict' };
      const mark = { saved: '…', sending: '', sent: '✓', failed: '!', conflict: '≠' };
      q.innerHTML = this.items.map(i => `<li class="queue__item" data-state="${i.state}" data-id="${i.id}">
        <span class="queue__mark" aria-hidden="true">${mark[i.state]}</span>
        <span class="queue__body"><span class="queue__title">${i.title}</span><span class="queue__meta"><b>${label[i.state]}</b> · ${i.meta}</span></span>
        <span class="queue__acts">${i.state === 'failed' ? `<button class="btn" type="button" data-q="retry">Retry</button><button class="btn btn--quiet" type="button" data-q="discard">Discard</button>` : ''}${i.state === 'conflict' ? `<button class="btn" type="button" data-q="keep">Keep both</button><button class="btn" type="button" data-q="kiosk">Use kiosk time</button>` : ''}</span></li>`).join('');
      $('#queueLive').textContent = text;
    },
  };
  window.HeatSync = Sync;

  function initSyncDemo() {
    const net = $('#netSwitch'); if (!net) return;
    net.addEventListener('click', () => { Sync.online = net.getAttribute('aria-checked') === 'true'; Sync.flush(); });
    $('#addRecord').addEventListener('click', () => Sync.add(['Water check · Shelter A · cooler full', 'Seen in person · Samir (C12) · workshop', 'Photo · meter M-17 at the trench'][Sync.items.length % 3]));
    $('#queue').addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      const it = Sync.items.find(i => String(i.id) === b.closest('.queue__item').dataset.id);
      if (b.dataset.q === 'retry') { it.state = 'saved'; it.meta = 'Retrying'; Sync.flush(); }
      if (b.dataset.q === 'discard') { const idx = Sync.items.indexOf(it); Sync.items.splice(idx, 1); Sync.render(); toast('Record discarded · kept in the audit log', () => { Sync.items.splice(idx, 0, it); Sync.render(); }); }
      if (b.dataset.q === 'keep') { it.state = 'sent'; it.meta = 'Both kept: manual 08:05 and kiosk 08:06'; Sync.render(); }
      if (b.dataset.q === 'kiosk') { it.state = 'sent'; it.meta = 'Resolved: kiosk time 08:06 used; manual entry archived'; Sync.render(); }
    });
    $$('[data-sync]').forEach(el => el.addEventListener('click', () => document.getElementById('sync').scrollIntoView({ behavior: 'instant' })));
    Sync.render();
  }

  /* ── Agent task state ────────────────────────────────────────────────
     The agent never acts on the site. Its states are: queued, calling a tool,
     waiting on a dependency (a person or a device), ready for review, failed, cancelled. */
  function initAgent() {
    const root = $('#agentDemo'); if (!root) return;
    const steps = $('#agentSteps'), status = $('#agentStatus'), run = $('#agentRun'), cancel = $('#agentCancel'), out = $('#agentOut');
    const plan = [
      { t: 'Queued · read the question and the current plan', ms: 500 },
      { t: 'Calling <code>compute_heat_stress</code> · midday-break minutes for 15:10', ms: 1100 },
      { t: 'Waiting on a dependency · fresh reading from sensor t1 (latest is 08:00, stale)', wait: true },
      { t: 'Calling <code>search_guidance</code> · restart conditions in the Sandline heat plan', ms: 1000 },
      { t: 'Ready for review', ms: 0 },
    ];
    let i = -1, timer, cancelled = false;
    const draw = (failed) => {
      steps.innerHTML = plan.map((p, j) => `<li class="agent__step" data-state="${j < i ? 'done' : j === i ? (failed ? 'failed' : p.wait ? 'waiting' : j === plan.length - 1 ? 'done' : 'active') : 'todo'}">${p.t}${j === i && p.wait && !failed ? ' <button class="btn" type="button" id="agentDep">Request reading from Maya</button>' : ''}</li>`).join('');
      const dep = $('#agentDep'); if (dep) dep.onclick = () => { dep.disabled = true; dep.setAttribute('aria-busy', 'true'); setTimeout(() => { plan[2].t = 'Dependency met · 175 W/m² from sensor t1 at 15:06 (Maya)'; step(); }, 1200); };
    };
    const say = s => { status.textContent = s; };
    const step = () => {
      if (cancelled) return;
      i++; draw();
      const p = plan[i];
      if (!p) return;
      if (p.wait) { say('Waiting on a dependency: a fresh reading from sensor t1.'); return; }
      if (i === plan.length - 1) {
        say('Ready for review.'); run.disabled = false; cancel.disabled = true;
        out.hidden = false; return;
      }
      say(p.t.replace(/<[^>]+>/g, ''));
      timer = setTimeout(step, p.ms);
    };
    run.addEventListener('click', () => { clearTimeout(timer); cancelled = false; i = -1; plan[2].t = 'Waiting on a dependency · fresh reading from sensor t1 (latest is 08:00, stale)'; out.hidden = true; run.disabled = true; cancel.disabled = false; step(); });
    cancel.addEventListener('click', () => { cancelled = true; clearTimeout(timer); draw(true); say('Cancelled. Nothing was changed; the question is saved.'); run.disabled = false; cancel.disabled = true; });
    draw();
  }

  /* ── Inline suggestions with undo ────────────────────────────────── */
  function initSuggest() {
    $$('.suggest').forEach(s => {
      const original = s.outerHTML;
      s.addEventListener('click', e => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        const target = document.getElementById(s.dataset.for);
        if (b.dataset.s === 'accept') {
          const prev = target.value; target.value = s.dataset.value;
          s.className = 'suggest suggest--accepted';
          s.innerHTML = `<span aria-hidden="true">✓</span><p class="suggest__text">Suggestion used. You can edit the field.</p><div class="suggest__acts"><button class="btn btn--quiet" type="button" data-s="undo">Undo</button></div>`;
          s._prev = prev; target.focus();
        }
        if (b.dataset.s === 'undo') { target.value = s._prev || ''; s.outerHTML = original; initSuggest(); }
        if (b.dataset.s === 'dismiss') { const parent = s.parentNode, next = s.nextSibling; s.remove(); toast('Suggestion dismissed', () => { parent.insertBefore(s, next); }); }
      });
    });
  }

  /* ── Guardrail records: Withdraw, never silent undo ──────────────── */
  function initRecords() {
    $$('.record [data-withdraw]').forEach(b => b.addEventListener('click', () => {
      const rec = b.closest('.record');
      const apply = () => {
        rec.classList.add('record--withdrawn');
        const note = document.createElement('span'); note.className = 'caption'; note.textContent = `Withdrawn ${clock()} by Huda · still in the audit log`;
        b.replaceWith(note);
        toast(rec.dataset.effect || 'Withdrawn');
      };
      if (b.dataset.withdraw === 'hold') {
        const dlg = $('#dlgHold'); dlg.showModal(); $('[data-cancel]', dlg).focus();
        const hb = $('.holdbtn', dlg);
        const h = () => { hb.removeEventListener('confirmed', h); dlg.close(); apply(); };
        hb.addEventListener('confirmed', h);
      } else apply();
    }));
    const dlg = $('#dlgHold'); if (dlg) $('[data-cancel]', dlg).addEventListener('click', () => dlg.close());
  }

  /* ── Media capture ───────────────────────────────────────────────── */
  function initCapture() {
    $$('.capture__tile input[type=file]').forEach(inp => inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const tile = inp.closest('.capture__tile');
      tile.dataset.state = 'captured';
      const url = URL.createObjectURL(f);
      tile.querySelector('.capture__body').innerHTML = `<img class="capture__thumb" src="${url}" alt="Photo of the meter reading, taken ${clock()}"><span>Meter photo</span><span class="capture__meta">Saved on this phone · queued to send</span>`;
      Sync.add('Photo · meter at the trench');
    }));
    $$('[data-voice]').forEach(b => {
      let t0, iv;
      b.addEventListener('click', () => {
        const rec = b.getAttribute('aria-pressed') === 'true';
        if (!rec) {
          b.setAttribute('aria-pressed', 'true'); b.dataset.state = 'recording'; t0 = Date.now();
          const meta = $('.capture__meta', b);
          iv = setInterval(() => { meta.textContent = `Recording 0:${String(Math.floor((Date.now() - t0) / 1000)).padStart(2, '0')} · tap to stop`; }, 250);
        } else {
          clearInterval(iv); b.setAttribute('aria-pressed', 'false'); b.dataset.state = 'captured';
          $('.capture__meta', b).textContent = 'Voice note · audio not kept';
          const tr = document.getElementById(b.dataset.voice); tr.hidden = false; $('input', tr).value = 'Cooler full, about forty litres, ice topped up.'; $('input', tr).focus();
        }
      });
    });
    $$('.yesno').forEach(g => g.addEventListener('click', e => { const o = e.target.closest('.yesno__opt'); if (!o) return; $$('.yesno__opt', g).forEach(x => x.setAttribute('aria-pressed', String(x === o))); }));
  }

  /* ── Zone plan ───────────────────────────────────────────────────── */
  const ZONES = {
    trench: { name: 'Civil trench', band: 'Low band · 145 W/m²', hold: 'Heavy-work hold since 08:01', act: 'Restart decision open · owner Rashid', count: '0 working · crew moved to Shelter A' },
    workshop: { name: 'Workshop (covered)', band: 'Not exposed', hold: 'No hold', act: '1 action: Bilal (C08) needs rest now · due 08:28', count: '4 of 6 places in use' },
    shelter: { name: 'Shelter A (cooled)', band: 'Cooled recovery', hold: 'No hold', act: 'Water check due 09:00', count: '7 in recovery · kiosk live' },
    yard: { name: 'Laydown yard', band: 'Unknown · base station 2 offline since 07:52', hold: 'Band raised one level', act: 'Ask Maya for a reading', count: 'Light task · C13, C14' },
  };
  function initPlan() {
    const map = $('#planMap'); if (!map) return;
    const det = $('#planDetail');
    const show = id => {
      $$('.plan__zone', map).forEach(z => z.setAttribute('aria-pressed', String(z.dataset.zone === id)));
      const z = ZONES[id];
      det.innerHTML = `<span class="t-label">Zone</span><h3 class="t-title" style="margin:0">${z.name}</h3>
        <dl class="kv"><dt>Band</dt><dd>${z.band}</dd><dt>Hold</dt><dd>${z.hold}</dd><dt>Crew</dt><dd>${z.count}</dd><dt>Action</dt><dd>${z.act}</dd></dl>
        <p class="caption" style="margin:0">Counts and actions only. The plan never shows where an individual worker is.</p>`;
    };
    $$('.plan__zone', map).forEach(z => {
      z.addEventListener('click', () => show(z.dataset.zone));
      z.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(z.dataset.zone); } });
    });
    show('trench');
  }

  window.initField = () => { initSyncDemo(); initAgent(); initSuggest(); initRecords(); initCapture(); initPlan(); };
})();
