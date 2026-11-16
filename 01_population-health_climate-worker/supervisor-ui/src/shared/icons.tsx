/* Line icons for the device shells. The paths mirror ../../../ui_design_system/icons.js
   (24×24 grid, 2px stroke, square caps, miter joins, no fill); keep the two in step. */

const PATHS = {
  alert: '<path d="M4 4h16v16H4z"/><path d="M12 8v5M12 16v1"/>',
  ai: '<path d="M12 3l9 9-9 9-9-9z" stroke-dasharray="3 2"/>',
  calc: '<path d="M4 4h16v16H4z"/><path d="M8 10h8M8 14h8"/>',
  calendar: '<path d="M3 5h18v16H3z"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  emergency: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c4 4.5 4 13.5 0 18M12 3c-4 4.5-4 13.5 0 18"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5h3v3H4zM4 11h3v3H4zM4 17h3v3H4z"/>',
  lock: '<path d="M5 11h14v10H5z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  message: '<path d="M3 4h18v13H10l-5 4v-4H3z"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/><path d="M15 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 4 5v1"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  phone: '<path d="M7 2h10v20H7z"/><path d="M11 18h2"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><path d="M10 9h4"/>',
  play: '<path d="M7 4l12 8-12 8z"/>',
  send: '<path d="M4 12L20 4l-6 16-3-7z"/><path d="M11 13l9-9"/>',
  sensor: '<path d="M10 4h4v10.5a4 4 0 1 1-4 0z"/><path d="M12 10v7"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><path d="M15 4v4M9 10v4M17 16v4"/>',
  stop: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><polyline points="18 3 18 7 14 7"/><polyline points="6 21 6 17 10 17"/>',
  water: '<path d="M12 3l6 9a6 6 0 1 1-12 0z"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative line icon; the heading or label beside it carries the meaning. */
export function Icon({ name }: { name: IconName }) {
  return <svg className="hs-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />;
}

/** Status icon: green tick (good), yellow triangle with "!" (warning), red circle with white X (error). Always beside a word. */
export function StatusIcon({ status }: { status: 'ok' | 'warn' | 'error' }) {
  return <span className="si" data-status={status} aria-hidden="true" />;
}

/* A section heading picks its icon from what it is about. First match wins, so the
   more specific topics come first. */
const TOPICS: [RegExp, IconName][] = [
  [/proposal|solver|\bai\b|agent|draft|suggest/i, 'ai'],
  [/photo/i, 'camera'],
  [/brand|preview|logo|palette|colour|surface/i, 'globe'],
  [/\bstop\b/i, 'stop'],
  [/\bstart\b|restart/i, 'play'],
  [/telemetry|forecast|band|heat|reading|sensor|condition|risk|weather|twl/i, 'sensor'],
  [/schedule|plan\b|interval|shift|handover|timeline|chronolog|hour|today|later/i, 'calendar'],
  [/evidence|record|observ|log|event|source|review|run\b|runs|cost|commercial|history|trust|saw/i, 'calc'],
  [/need|action|task|alert/i, 'alert'],
  [/privacy|consent|your data|access|audit/i, 'lock'],
  [/deliver|receive|channel|send|recipient/i, 'send'],
  [/location|shelter|where|zone|seat|workshop|headcount/i, 'pin'],
  [/crew|worker|people|affected|who\b|persona|employer|roster|team/i, 'people'],
  [/conversation|message|question|ask|chat/i, 'message'],
  [/wearable|device|phone/i, 'phone'],
  [/water|drink/i, 'water'],
  [/step|check|requirement|eligib|confirm|guardrail|assumption|policy|rule|operation/i, 'list'],
  [/system|setting|admin|setup|map/i, 'settings'],
  [/language/i, 'globe'],
  [/account|\bme\b|profile|your/i, 'person'],
];

export function iconFor(title: unknown): IconName | undefined {
  if (typeof title !== 'string') return undefined;
  return TOPICS.find(([re]) => re.test(title))?.[1];
}
