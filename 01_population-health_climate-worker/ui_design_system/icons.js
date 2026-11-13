/* Heat-Safe icon set. One rule for every glyph: 24×24 grid, 2px stroke,
   square caps, miter joins, no fills. Directional icons carry "dir" and mirror in RTL.
   The AI diamond is the only dashed icon, matching the dashed draft rule. */
const ICONS = {
  back:      { dir: 1, d: '<polyline points="15 5 8 12 15 19"/>' },
  forward:   { dir: 1, d: '<polyline points="9 5 16 12 9 19"/>' },
  close:     { d: '<path d="M6 6l12 12M18 6L6 18"/>' },
  chevron:   { d: '<polyline points="6 9 12 15 18 9"/>' },
  filter:    { d: '<path d="M4 7h16M7 12h10M10 17h4"/>' },
  more:      { d: '<path d="M5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2z"/>' },
  stop:      { d: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>' },
  caution:   { d: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v1"/>' },
  safe:      { d: '<polyline points="4 12 10 18 20 6"/>' },
  emergency: { d: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>' },
  ai:        { d: '<path d="M12 3l9 9-9 9-9-9z" stroke-dasharray="3 2"/>' },
  calc:      { d: '<path d="M4 4h16v16H4z"/><path d="M8 10h8M8 14h8"/>' },
  clock:     { d: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>' },
  person:    { d: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>' },
  sensor:    { d: '<path d="M10 4h4v10.5a4 4 0 1 1-4 0z"/><path d="M12 10v7"/>' },
  shelter:   { d: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>' },
  water:     { d: '<path d="M12 3l6 9a6 6 0 1 1-12 0z"/>' },
  rest:      { d: '<path d="M4 4h16v16H4z"/><path d="M4 12l8-8M4 20L20 4M12 20l8-8"/>' },
  mic:       { d: '<path d="M9 3h6v11H9z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>' },
  globe:     { d: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c4 4.5 4 13.5 0 18M12 3c-4 4.5-4 13.5 0 18"/>' },
  lock:      { d: '<path d="M5 11h14v10H5z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' },
  play:      { d: '<path d="M7 4l12 8-12 8z"/>' },
  phone:     { d: '<path d="M7 2h10v20H7z"/><path d="M11 18h2"/>' },
  tap:       { d: '<path d="M8 8a6 6 0 0 1 0 8M12 5a10 10 0 0 1 0 14M4 11v2"/>' },
  alert:     { d: '<path d="M4 4h16v16H4z"/><path d="M12 8v5M12 16v1"/>' },
  offline:   { d: '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M9 17a4 4 0 0 1 6 0M3 3l18 18"/>' },
  send:      { d: '<path d="M4 12L20 4l-6 16-3-7z"/><path d="M11 13l9-9"/>' },
  camera:    { d: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>' },
  sync:      { d: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><polyline points="18 3 18 7 14 7"/><polyline points="6 21 6 17 10 17"/>' },
  pin:       { d: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><path d="M10 9h4"/>' },
  undo:      { dir: 1, d: '<polyline points="9 5 4 10 9 15"/><path d="M4 10h11a5 5 0 0 1 0 10h-3"/>' },
};

(function buildSprite() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'none';
  svg.innerHTML = Object.entries(ICONS).map(([n, i]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${i.d}</symbol>`).join('');
  document.body.prepend(svg);
})();

/* icon('stop') → decorative SVG; pass a label to make it meaningful to screen readers. */
function icon(name, { cls = '', label } = {}) {
  const i = ICONS[name]; if (!i) return '';
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="icon ${i.dir ? 'icon--dir' : ''} ${cls}" ${a11y}><use href="#i-${name}"/></svg>`;
}
