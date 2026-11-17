import { useId, useState, type PointerEvent } from 'react';

/**
 * Thermal Work Limit graphics for the supervisor screens. A lower TWL is more heat stress:
 * below 115 W/m² is the high-risk band, 115–140 caution, 140 and above low risk (thermal.ts).
 * Environmental colours are separate from the site heavy-work hold, drawn as a black line.
 */
export const TWL_HIGH_BELOW = 115;
export const TWL_LOW_FROM = 140;
export const TWL_POLICY = 150;
/* Bar scale: tight round the band edges so small changes move the fill visibly. Readings outside are pinned to the ends. */
const MIN = 90;
const MAX = 170;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
const SIGNAL = { red: 'var(--color-signal-red)', amber: 'var(--color-signal-yellow)', green: 'var(--color-signal-green)' };
export const twlTone = (v: number) => v < TWL_HIGH_BELOW ? 'red' : v < TWL_LOW_FROM ? 'amber' : 'green';
const TONE_WORD = { red: 'High risk', amber: 'Caution', green: 'Low environmental risk' } as const;
const SITE_RULE = 'Heavy-work limit: TWL ≤150 W/m²';

/**
 * Horizontal TWL bar: filled from the scale minimum up to the reading, in the reading's band colour,
 * with the site heavy-work hold as a black line and the scale ends written underneath.
 * `size` is the old gauge width; the bar is twice that long.
 */
export function TwlGauge({ twl, size = 64, label, valid = true, band }: { twl: number | null; size?: number; label?: string; valid?: boolean; band?: string }) {
  const W = 200, H = 24, barY = 6, barH = 12;
  const x = (v: number) => W * (clamp(v) - MIN) / (MAX - MIN);
  const tone = twl == null ? null : band && band in SIGNAL ? band as keyof typeof SIGNAL : twlTone(twl);
  const policyX = x(TWL_POLICY);
  const name = twl == null ? 'No TWL reading' : `TWL ${twl} W/m², ${valid ? TONE_WORD[tone!] : 'Unknown (faulty reading)'}; ${SITE_RULE}; environmental band does not clear site holds`;
  const width = size * 2;
  return <span className="hs-gauge" title={name} style={{ inlineSize: width }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={width * H / W} role="img" aria-label={label ?? name}>
      <rect x="0" y={barY} width={W} height={barH} fill="var(--color-section-frame, #ccc)" />
      {twl != null && (valid
        ? <rect x="0" y={barY} width={x(twl)} height={barH} fill={SIGNAL[tone!]} />
        : <rect x="1" y={barY + 1} width={Math.max(0, x(twl) - 2)} height={barH - 2} fill="none" stroke="var(--color-pencil)" strokeWidth="2" strokeDasharray="5 4" />)}
      <line x1={policyX} x2={policyX} y1="0" y2={H} stroke="var(--color-ink)" strokeWidth="3" />
    </svg>
    <span className="hs-gauge-scale" aria-hidden="true"><span>{MIN}</span><span>{MAX}</span></span>
  </span>;
}

/**
 * Gauge plus the reading in words, for squad cards and status lines. `band` (green, amber, red,
 * unknown) comes from the reading's own assessment when there is one, so a faulty reading never
 * shows as low risk.
 */
export function TwlReadout({ twl, estimated, size, band, large }: { twl: number | null; estimated?: boolean; size?: number; band?: string; large?: boolean }) {
  const valid = band !== 'unknown';
  const word = twl == null ? '' : !valid ? 'Unknown' : TONE_WORD[(band as keyof typeof TONE_WORD) in TONE_WORD ? band as keyof typeof TONE_WORD : twlTone(twl)];
  return <span className="hs-twl" data-large={large || undefined}>
    <TwlGauge twl={twl} size={size} valid={valid} band={band} />
    <span className="hs-twl-text" data-tone={twl == null ? undefined : valid ? (band && band in TONE_WORD ? band : twlTone(twl)) : 'unknown'}>{twl == null ? 'No reading' : large
      ? <><span>TWL <b className="hs-twl-num">{twl}</b> W/m²</span><small>{word}{estimated ? ' · est.' : ''}</small></>
      : `TWL ${twl} W/m² · ${word}${estimated ? ' · est.' : ''}`}</span>
  </span>;
}

export type TwlPoint = { hour: string; twl: number };
export type TwlReadingPoint = { at: string; twl: number; sensor: string; quality: string };

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/**
 * TWL through the shift: the hourly site series (solid up to now, dashed after as predicted),
 * local sensor readings as dots, the risk bands behind and the policy level as a black line.
 */
export function TwlChart({ hourly, now, readings = [], kindLabel }: { hourly: TwlPoint[]; now: string; readings?: TwlReadingPoint[]; kindLabel: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (!hourly.length) return <p className="hs-muted">No hourly TWL for this day.</p>;
  const W = 720, H = 240, L = 44, R = 12, T = 12, B = 28;
  const t0 = minutes(hourly[0].hour), t1 = minutes(hourly[hourly.length - 1].hour);
  const values = [...hourly.map(p => p.twl), ...readings.map(r => r.twl), TWL_POLICY];
  const lo = Math.max(0, Math.floor((Math.min(...values) - 20) / 20) * 20);
  const hi = Math.ceil((Math.max(...values) + 20) / 20) * 20;
  const x = (m: number) => L + (W - L - R) * (m - t0) / Math.max(1, t1 - t0);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const nowM = Math.min(t1, Math.max(t0, minutes(now)));
  const past = hourly.filter(p => minutes(p.hour) <= nowM);
  const future = hourly.filter(p => minutes(p.hour) >= nowM);
  // Join the two halves at "now" so the line has no gap.
  const interp = (() => {
    const a = [...past].pop(), b = future[0];
    if (!a || !b || a === b) return (a ?? b)!.twl;
    const f = (nowM - minutes(a.hour)) / (minutes(b.hour) - minutes(a.hour));
    return a.twl + (b.twl - a.twl) * f;
  })();
  const path = (pts: Array<[number, number]>) => pts.map(([m, v], i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const pastPath = path([...past.map(p => [minutes(p.hour), p.twl] as [number, number]), [nowM, interp]]);
  const futurePath = path([[nowM, interp], ...future.map(p => [minutes(p.hour), p.twl] as [number, number])]);
  const ticks: number[] = []; for (let v = lo; v <= hi; v += 20) ticks.push(v);
  const band = (from: number, to: number) => { const a = Math.max(lo, from), b = Math.min(hi, to); return b > a ? { y: y(b), h: y(a) - y(b) } : null; };
  const red = band(lo, TWL_HIGH_BELOW), amber = band(TWL_HIGH_BELOW, TWL_LOW_FROM);
  const hp = hover == null ? null : hourly[hover];
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const m = t0 + ((e.clientX - box.left) * W / box.width - L) / (W - L - R) * (t1 - t0);
    let best = 0; hourly.forEach((p, i) => { if (Math.abs(minutes(p.hour) - m) < Math.abs(minutes(hourly[best].hour) - m)) best = i; });
    setHover(best);
  };
  return <figure className="hs-chart" aria-labelledby={`${id}-cap`}>
    <div className="hs-chart-legend" aria-hidden="true">
      <span><i className="hs-key-line" />{kindLabel} · up to now</span>
      <span><i className="hs-key-line" data-dashed />Predicted</span>
      {readings.length > 0 && <span><i className="hs-key-dot" />Local sensor</span>}
      <span><i className="hs-key-policy" />Site {SITE_RULE}</span>
    </div>
    <p className="hs-muted">Environmental band does not clear site holds.</p>
    <div className="hs-chart-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`TWL by hour, ${hourly[0].hour} to ${hourly[hourly.length - 1].hour}. Lowest ${Math.min(...hourly.map(p => p.twl))} W/m².`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {red && <rect x={L} width={W - L - R} y={red.y} height={red.h} fill="var(--color-signal-red)" opacity=".12" />}
        {amber && <rect x={L} width={W - L - R} y={amber.y} height={amber.h} fill="var(--color-signal-yellow)" opacity=".16" />}
        {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-section-frame, #ddd)" strokeWidth="1" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="hs-chart-tick">{v}</text></g>)}
        {hourly.filter((_, i) => i % 2 === 0).map(p => <text key={p.hour} x={x(minutes(p.hour))} y={H - 8} textAnchor="middle" className="hs-chart-tick">{p.hour}</text>)}
        <line x1={L} x2={W - R} y1={y(TWL_POLICY)} y2={y(TWL_POLICY)} stroke="#000" strokeWidth="2" />
        <line x1={x(nowM)} x2={x(nowM)} y1={T} y2={H - B} stroke="var(--color-graphite)" strokeWidth="1" strokeDasharray="2 3" />
        <text x={x(nowM) + 4} y={T + 10} className="hs-chart-tick">now {now}</text>
        <path d={pastPath} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
        <path d={futurePath} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeDasharray="6 5" strokeLinejoin="round" />
        {readings.map(r => { const m = minutes(r.at); return m >= t0 && m <= t1 ? <circle key={`${r.sensor}${r.at}`} cx={x(m)} cy={y(r.twl)} r="5" fill="var(--color-sheet)" stroke="var(--color-ink)" strokeWidth="2" strokeDasharray={r.quality === 'valid' ? undefined : '3 2'}><title>{`${r.at} · ${r.sensor} · TWL ${r.twl} W/m² · ${r.quality === 'valid' ? TONE_WORD[twlTone(r.twl)] : 'Unknown'} · quality: ${r.quality}`}</title></circle> : null; })}
        {hp && <g pointerEvents="none"><line x1={x(minutes(hp.hour))} x2={x(minutes(hp.hour))} y1={T} y2={H - B} stroke="var(--color-ink)" strokeWidth="1" /><circle cx={x(minutes(hp.hour))} cy={y(hp.twl)} r="5" fill="var(--color-ink)" stroke="var(--color-sheet)" strokeWidth="2" /></g>}
      </svg>
      {hp && <div className="hs-chart-tip" style={{ insetInlineStart: `${(x(minutes(hp.hour)) / W) * 100}%` }} role="status">
        <b>{hp.hour}</b> · TWL {hp.twl} W/m² · {TONE_WORD[twlTone(hp.twl)]} · check site holds<br /><small>{minutes(hp.hour) > nowM ? 'Predicted' : kindLabel}</small>
      </div>}
    </div>
    <figcaption id={`${id}-cap`} className="hs-visually-hidden">TWL in sun by hour. Environmental band does not clear site holds. Site {SITE_RULE}.</figcaption>
    <details className="hs-chart-table"><summary>Show as table</summary>
      <table className="hs-table hs-table-sm"><thead><tr><th>Hour</th><th>TWL W/m²</th><th>Environmental band</th><th>Site heavy work</th><th>Source</th><th>Quality</th></tr></thead>
        <tbody>{hourly.map(p => <tr key={p.hour}><td>{p.hour}</td><td>{p.twl}</td><td>{TONE_WORD[twlTone(p.twl)]}</td><td>{SITE_RULE}</td><td>{minutes(p.hour) > nowM ? 'Predicted' : kindLabel}</td><td>—</td></tr>)}
          {readings.map(r => <tr key={`r${r.sensor}${r.at}`}><td>{r.at}</td><td>{r.twl}</td><td>{r.quality === 'valid' ? TONE_WORD[twlTone(r.twl)] : 'Unknown'}</td><td>{SITE_RULE}</td><td>Sensor {r.sensor} · quality {r.quality}</td><td>{r.quality}</td></tr>)}</tbody></table>
    </details>
  </figure>;
}
