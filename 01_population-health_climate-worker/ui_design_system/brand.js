/* ═══════════════════════════════════════════════════════════════════════
   HEAT-SAFE · COMPANY BRANDING
   Turns a company palette into brand tokens for two surfaces:
     platform  the supervisor web app (desktop)
     mobile    the mobile web apps: site app, worker app and shelter kiosk
   and checks it against the Issued Sheet rules. A brand colour only fills
   identity slots (brand bar, logo mark, browser theme colour, optional rail
   tint). It never reaches stamps, bands, statements, buttons, focus or charts.
   Plain script, no build step: exposes window.HSBrand.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  /* ── Colour maths: sRGB, WCAG 2.2 contrast, OKLab / OKLCH ─────────── */
  const clamp01 = x => Math.min(1, Math.max(0, x));
  function parse(hex) {
    const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const toHex = rgb => '#' + rgb.map(c => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const delin = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function luminance(hex) { const [r, g, b] = parse(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

  function toOklab(hex) {
    const [r, g, b] = parse(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromOklab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function oklch(hex) {
    const [L, a, b] = toOklab(hex);
    const h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    return { l: L, c: Math.hypot(a, b), h };
  }
  /* OKLCH to hex, lowering chroma until the colour fits in sRGB. */
  function fromOklch({ l, c, h }) {
    const rad = h * Math.PI / 180;
    const inGamut = rgb => rgb.every(x => x >= -0.0005 && x <= 1.0005);
    let lo = 0, hi = c, rgb = fromOklab([l, c * Math.cos(rad), c * Math.sin(rad)]);
    if (!inGamut(rgb)) {
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const t = fromOklab([l, mid * Math.cos(rad), mid * Math.sin(rad)]);
        if (inGamut(t)) { lo = mid; rgb = t; } else hi = mid;
      }
      rgb = fromOklab([l, lo * Math.cos(rad), lo * Math.sin(rad)]);
    }
    return toHex(rgb.map(x => delin(clamp01(x))));
  }
  const dE = (a, b) => { const p = toOklab(a), q = toOklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  /* ── The Issued Sheet values the brand is checked against ──────────── */
  const THEME = {
    day:   { base: '#FFFFFF', ink: '#14120F', onInk: '#FFFFFF', min: 4.5 },
    glare: { base: '#FFFFFF', ink: '#000000', onInk: '#FFFFFF', min: 7 },
    night: { base: '#12110F', ink: '#F2EEE6', onInk: '#12110F', min: 4.5 },
  };
  const SIGNALS = {
    stop:      { hex: '#A31F24', word: 'Stop (signal red)' },
    caution:   { hex: '#F2A900', word: 'Caution (signal yellow)' },
    safe:      { hex: '#1E6E47', word: 'Safe (signal green)' },
    mandatory: { hex: '#1D4A86', word: 'Mandatory (signal blue)' },
  };
  const TRACING = '#ECEFF3';
  const NEUTRAL_CHROMA = 0.06;   /* below this a colour reads as grey, brown or charcoal */
  const NIGHT_MAX_L = 0.40;      /* a brand bar must not glow on a night-shift screen  */

  /* A colour is restricted when people could read it as a safety signal: it sits in the
     red, orange/yellow or green families (the meanings that cause harm when misread),
     or it is almost the same colour as any signal, blue included. */
  function signalRisk(hex) {
    const { l, c, h } = oklch(hex);
    const near = Object.entries(SIGNALS).map(([k, s]) => ({ k, d: dE(hex, s.hex) })).sort((a, b) => a.d - b.d)[0];
    const close = near.d < (near.k === 'mandatory' ? 0.06 : 0.1);
    let family = null;
    if (c >= NEUTRAL_CHROMA) {
      if (h >= 345 || h < 50) family = 'stop';
      else if (h < 110 && l >= 0.45) family = 'caution';
      else if (h >= 110 && h < 180) family = 'safe';
    }
    const signal = close ? near.k : family;
    if (!signal) return { ok: true, signal: null, reason: 'Clear of the four signal meanings', l, c, h };
    const why = close ? `Almost the same as ${SIGNALS[signal].word}` : `Reads as ${SIGNALS[signal].word}`;
    return { ok: false, signal, reason: why, l, c, h };
  }

  /* Pick ink or white text for a fill, then move the fill's lightness (hue and chroma kept)
     until the pair reaches `min`. Returns the fill actually used. */
  function fitContrast(hex, t, min) {
    const pick = bg => [t.ink, t.onInk]
      .map(fg => ({ fg, r: contrast(fg, bg) })).sort((a, b) => b.r - a.r)[0];
    let bg = hex, best = pick(bg);
    if (best.r >= min) return { bg, fg: best.fg, ratio: best.r, adjusted: false };
    const darkText = luminance(best.fg) < 0.5;
    const o = oklch(hex);
    for (let i = 1; i <= 100; i++) {
      const l = clamp01(o.l + (darkText ? 0.01 : -0.01) * i);
      bg = fromOklch({ l, c: o.c, h: o.h });
      best = { fg: best.fg, r: contrast(best.fg, bg) };
      if (best.r >= min) break;
    }
    return { bg, fg: best.fg, ratio: best.r, adjusted: true };
  }

  function dimForNight(hex) {
    const o = oklch(hex);
    if (o.l <= NIGHT_MAX_L && o.c <= 0.14) return { hex, dimmed: false };
    return { hex: fromOklch({ l: Math.min(o.l, NIGHT_MAX_L), c: Math.min(o.c, 0.14), h: o.h }), dimmed: true };
  }

  /* ── Configuration ─────────────────────────────────────────────────── */
  const DEFAULT = {
    org: '', wordmark: '', logo: '',
    primary: '', secondary: '',
    platform: { bar: 'auto', tint: false },
    mobile: { bar: 'auto', header: 'strip', tint: false, appName: 'Heat-Safe', shortName: 'Heat-Safe' },
  };
  function normalise(cfg) {
    const c = JSON.parse(JSON.stringify(DEFAULT));
    if (!cfg) return c;
    Object.assign(c, { ...cfg, platform: { ...c.platform, ...(cfg.platform || {}) }, mobile: { ...c.mobile, ...(cfg.mobile || {}) } });
    c.primary = parse(c.primary) ? toHex(parse(c.primary)) : '';
    c.secondary = parse(c.secondary) ? toHex(parse(c.secondary)) : '';
    return c;
  }
  function initials(cfg) {
    const src = (cfg.wordmark || cfg.org || 'Heat-Safe').trim();
    const words = src.split(/[\s\-·]+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : src.slice(0, 2)).toUpperCase();
  }

  const SURFACES = {
    platform: { name: 'Platform', long: 'Platform · supervisor web', themes: ['day', 'night', 'glare'] },
    mobile:   { name: 'Mobile web', long: 'Mobile web · site app, worker app, kiosk', themes: ['glare', 'day', 'night'] },
  };
  const SLOT_LABEL = { primary: 'Primary', secondary: 'Secondary' };

  /* Resolve a configuration into per-surface, per-theme tokens plus the checks shown to the admin. */
  function resolve(input) {
    const cfg = normalise(input);
    const risk = {
      primary: cfg.primary ? signalRisk(cfg.primary) : null,
      secondary: cfg.secondary ? signalRisk(cfg.secondary) : null,
    };
    const checks = [];
    const usable = k => cfg[k] && risk[k].ok;
    ['primary', 'secondary'].forEach(k => {
      if (!cfg[k]) return;
      checks.push({ id: k, surface: 'both', label: `${SLOT_LABEL[k]} ${cfg[k]} vs safety signals`,
        status: risk[k].ok ? 'pass' : 'restricted',
        detail: risk[k].ok ? risk[k].reason + '. Can fill the brand bar.' : `${risk[k].reason}. Kept to the logo mark; it never fills a bar.` });
    });

    const surfaces = {};
    Object.keys(SURFACES).forEach(sk => {
      const s = cfg[sk];
      let key = null, why = '';
      if (s.bar === 'none') why = 'Brand bar turned off';
      else if (s.bar === 'auto') {
        key = usable('primary') ? 'primary' : usable('secondary') ? 'secondary' : null;
        why = key === 'secondary' ? 'Primary is restricted, so the secondary fills the bar'
          : key ? '' : (cfg.primary || cfg.secondary) ? 'No palette colour is clear of the signals; the bar stays paper' : 'No palette yet';
      } else if (usable(s.bar)) key = s.bar;
      else why = cfg[s.bar] ? `${SLOT_LABEL[s.bar]} is restricted; the bar stays paper` : `No ${SLOT_LABEL[s.bar].toLowerCase()} colour set`;
      const hidden = sk === 'mobile' && s.header === 'off';
      const barHex = key && !hidden ? cfg[key] : null;

      const out = { source: key, why: hidden ? 'Header style is off' : why, themes: {} };
      Object.entries(THEME).forEach(([tk, t]) => {
        const r = {};
        if (barHex) {
          let start = barHex, dimmed = false;
          if (tk === 'night') ({ hex: start, dimmed } = dimForNight(barHex));
          const f = fitContrast(start, t, t.min);
          Object.assign(r, { bar: f.bg, onBar: f.fg, ratio: f.ratio, adjusted: f.adjusted || dimmed, dimmed, from: barHex });
        } else Object.assign(r, { bar: t.base, onBar: t.ink, ratio: contrast(t.ink, t.base), adjusted: false, paper: true });
        if (cfg.logo) Object.assign(r, { mark: '#FFFFFF', onMark: '#000000' });
        else if (cfg.primary) { const m = fitContrast(tk === 'night' ? dimForNight(cfg.primary).hex : cfg.primary, t, t.min); Object.assign(r, { mark: m.bg, onMark: m.fg }); }
        else Object.assign(r, { mark: t.ink, onMark: t.onInk });
        r.theme = barHex ? r.bar : t.base;
        r.onTheme = barHex ? r.onBar : t.ink;
        out.themes[tk] = r;
      });

      if (s.tint) {
        const hueFrom = cfg.primary || cfg.secondary;
        if (!hueFrom) checks.push({ id: sk + '-tint', surface: sk, label: 'Chrome tint', status: 'off', detail: 'Needs a palette colour.' });
        else {
          const h = oklch(hueFrom).h, th = oklch(TRACING).h;
          if (hueGap(h, th) < 40) {
            checks.push({ id: sk + '-tint', surface: sk, label: 'Chrome tint vs tracing paper', status: 'off', detail: 'A tint this close to the cool tracing paper would make the rail look like an AI draft. Tint not applied.' });
          } else {
            const day = fromOklch({ l: 0.955, c: 0.014, h }), night = fromOklch({ l: 0.215, c: 0.012, h });
            out.themes.day.sheet = day; out.themes.night.sheet = night; out.themes.glare.sheet = 'var(--color-base)';
            const r = Math.min(contrast(THEME.day.ink, day), contrast(THEME.night.ink, night));
            checks.push({ id: sk + '-tint', surface: sk, label: 'Chrome tint · ink on tinted sheet', status: r >= 15 ? 'pass' : 'off', detail: `${day} day, ${night} night · ink ${r.toFixed(1)}:1 or better. Glare stays white.` });
          }
        }
      }

      if (barHex) {
        ['day', 'glare', 'night'].forEach(tk => {
          const r = out.themes[tk];
          const need = THEME[tk].min;
          checks.push({ id: `${sk}-${tk}`, surface: sk, label: `${SURFACES[sk].name} bar text · ${tk === 'night' ? 'night shift' : tk} ≥ ${need}:1`,
            status: r.adjusted ? 'adjusted' : 'pass',
            detail: r.adjusted ? `${r.from} → ${r.bar}${r.dimmed ? ' (dimmed for night)' : ''} · ${r.ratio.toFixed(1)}:1` : `${r.bar} · ${r.ratio.toFixed(1)}:1` });
        });
      } else checks.push({ id: sk + '-bar', surface: sk, label: `${SURFACES[sk].name} brand bar`, status: 'off', detail: out.why || 'Paper bar with logo mark' });
      surfaces[sk] = out;
    });

    checks.push({ id: 'safety', surface: 'mobile', label: 'Stop-work and emergency screens drop the brand', status: 'enforced', detail: 'No brand strip; browser colour turns ink. Not configurable.' });
    checks.push({ id: 'signals', surface: 'both', label: 'Stamps, bands, buttons, focus and charts stay unbranded', status: 'enforced', detail: 'Brand tokens exist only for identity slots. Not configurable.' });
    return { cfg, risk, surfaces, checks, initials: initials(cfg) };
  }

  /* ── Output: CSS custom properties per surface and theme ─────────── */
  function block(t) {
    return `--brand-bar:${t.bar};--brand-on-bar:${t.onBar};--brand-mark:${t.mark};--brand-on-mark:${t.onMark};--brand-theme:${t.theme};--brand-on-theme:${t.onTheme};${t.sheet ? `--color-sheet:${t.sheet};` : ''}`;
  }
  /* The surface element normally carries its own data-theme; the repeated attribute lifts
     that rule above the ancestor fallback so the nearest theme always wins. */
  /* `suffix` scopes a second palette (for example an unpublished draft) to
     data-brand-surface="platform-draft" without touching the live one. */
  function css(res, suffix = '') {
    const out = [`/* Heat-Safe brand tokens · ${res.cfg.org || 'default'} · generated by brand.js */`];
    Object.entries(res.surfaces).forEach(([sk, s]) => {
      const sel = `[data-brand-surface="${sk}${suffix}"]`;
      out.push(`${sel}{${block(s.themes.day)}}`);
      ['day', 'glare', 'night'].forEach(tk => {
        out.push(`[data-theme="${tk}"] ${sel}:not([data-theme]),${sel}[data-theme="${tk}"][data-theme]{${block(s.themes[tk])}}`);
      });
    });
    return out.join('\n');
  }
  function apply(res, id = 'hs-brand', suffix = '') {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = css(res, suffix);
  }
  /* Web app manifest for the mobile web apps (install name, browser colour, splash). */
  function manifest(res) {
    const m = res.surfaces.mobile.themes;
    return {
      name: res.cfg.mobile.appName || 'Heat-Safe', short_name: res.cfg.mobile.shortName || 'Heat-Safe',
      theme_color: m.day.theme, background_color: '#FFFFFF', display: 'standalone',
      icons: res.cfg.logo ? [{ src: '(uploaded logo)', sizes: '512x512', purpose: 'any maskable' }] : [{ src: '(generated mark ' + res.initials + ')', sizes: '512x512', purpose: 'any maskable' }],
      theme_color_by_scheme: { glare: m.glare.theme, dark: m.night.theme },
    };
  }
  const isBranded = res => !!(res.cfg.org || res.cfg.primary || res.cfg.logo);
  function markHtml(res, cls = '') {
    const inner = res.cfg.logo ? `<img src="${res.cfg.logo}" alt="">` : res.initials;
    return `<span class="brandmark ${cls}" aria-hidden="true">${inner}</span>`;
  }

  /* Fictional example palettes, each showing a different outcome of the checks. */
  const PRESETS = {
    default:  { label: 'Heat-Safe (no brand)', cfg: {} },
    sandline: { label: 'Sandline Contracting', note: 'Orange primary reads as Stop, so the charcoal secondary fills the bar.',
      cfg: { org: 'Sandline Contracting', wordmark: 'Sandline', primary: '#C2541B', secondary: '#2B2D42', platform: { bar: 'auto', tint: true }, mobile: { bar: 'auto', header: 'strip', appName: 'Sandline Heat-Safe', shortName: 'Sandline' } } },
    dune:     { label: 'Dune Civil Works', note: 'Petrol primary passes; the sand secondary reads as Caution and is never used.',
      cfg: { org: 'Dune Civil Works', wordmark: 'Dune', primary: '#0E4C5A', secondary: '#D9B45A', platform: { bar: 'auto', tint: true }, mobile: { bar: 'auto', header: 'strip', appName: 'Dune Heat-Safe', shortName: 'Dune' } } },
    alnoor:   { label: 'Al Noor Facilities', note: 'A light lilac bar takes ink text by day and is dimmed for night shift.',
      cfg: { org: 'Al Noor Facilities', wordmark: 'Al Noor', primary: '#B9A7E0', secondary: '#5B2A86', platform: { bar: 'auto', tint: true }, mobile: { bar: 'auto', header: 'browser', appName: 'Al Noor Heat-Safe', shortName: 'Al Noor' } } },
    corniche: { label: 'Corniche Logistics', note: 'Blue almost identical to signal blue: logo mark only, paper bar.',
      cfg: { org: 'Corniche Logistics', wordmark: 'Corniche', primary: '#1D4B8F', platform: { bar: 'auto', tint: false }, mobile: { bar: 'auto', header: 'strip', appName: 'Corniche Heat-Safe', shortName: 'Corniche' } } },
  };

  window.HSBrand = { parse, toHex, contrast, oklch, fromOklch, signalRisk, fitContrast, resolve, css, apply, manifest, markHtml, isBranded, normalise, initials, SIGNALS, SURFACES, THEME, DEFAULT, PRESETS };
})();
