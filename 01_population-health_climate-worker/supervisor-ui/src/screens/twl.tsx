import { useId, useState, type PointerEvent } from 'react';

/**
 * Thermal Work Limit graphics for the supervisor screens. A lower TWL is more heat stress:
 * below 115 W/m² is the high-risk band, 115–140 caution, 140 and above low risk (thermal.ts).
 * The policy level is where caution controls start; it is drawn as a black line.
 */
export const TWL_HIGH_BELOW = 115;
export const TWL_POLICY = 140;
/* Gauge scale: tight round the band edges so small changes move the needle visibly. Readings outside are pinned to the ends. */
const MIN = 90;
const MAX = 170;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
const SIGNAL = { red: 'var(--color-signal-red)', amber: 'var(--color-signal-yellow)', green: 'var(--color-signal-green)' };
export const twlTone = (v: number) => v < TWL_HIGH_BELOW ? 'red' : v < TWL_POLICY ? 'amber' : 'green';
const TONE_WORD = { red: 'High risk', amber: 'Caution', green: 'Low risk' } as const;

/** Small semicircle speedometer: coloured bands, a black policy line and a needle at the reading. */
export function TwlGauge({ twl, size = 64, label, valid = true }: { twl: number | null; size?: number; label?: string; valid?: boolean }) {
  const w = 100, h = 60, cx = 50, cy = 54, r = 38;
  const at = (v: number, rad = r) => {
    const a = Math.PI * (1 - (clamp(v) - MIN) / (MAX - MIN));
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = at(from); const [x2, y2] = at(to);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const [p1x, p1y] = at(TWL_POLICY, r - 14); const [p2x, p2y] = at(TWL_POLICY, r + 12);
  const needle = twl == null ? null : at(twl, r - 12);
  const name = twl == null ? 'No TWL reading' : `TWL ${twl} W/m², ${valid ? TONE_WORD[twlTone(twl)] : 'Unknown (faulty reading)'}; policy level ${TWL_POLICY} W/m²`;
  return <span className="hs-gauge" title={name}>
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={size * h / w} role="img" aria-label={label ?? name}>
      <path d={arc(MIN, MAX)} fill="none" stroke="var(--color-section-frame, #ccc)" strokeWidth="20" />
      {twl != null && valid && <>
        <path d={arc(MIN, TWL_HIGH_BELOW)} fill="none" stroke={SIGNAL.red} strokeWidth="20" />
        <path d={arc(TWL_HIGH_BELOW, TWL_POLICY)} fill="none" stroke={SIGNAL.amber} strokeWidth="20" />
        <path d={arc(TWL_POLICY, MAX)} fill="none" stroke={SIGNAL.green} strokeWidth="20" />
      </>}
      <line x1={p1x} y1={p1y} x2={p2x} y2={p2y} stroke="#000" strokeWidth="4" />
      {needle && <><line x1={cx} y1={cy} x2={needle[0]} y2={needle[1]} stroke={valid ? "var(--color-ink)" : "var(--color-pencil)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={valid ? undefined : "4 3"} /><circle cx={cx} cy={cy} r="4" fill={valid ? "var(--color-ink)" : "var(--color-pencil)"} /></>}
    </svg>
  </span>;
}

/**
 * Gauge plus the reading in words, for squad cards and status lines. `band` (green, amber, red,
 * unknown) comes from the reading's own assessment when there is one, so a faulty reading never
 * shows as low risk.
 */
export function TwlReadout({ twl, estimated, size, band }: { twl: number | null; estimated?: boolean; size?: number; band?: string }) {
  const valid = band !== 'unknown';
  const word = twl == null ? '' : !valid ? 'Unknown' : TONE_WORD[(band as keyof typeof TONE_WORD) in TONE_WORD ? band as keyof typeof TONE_WORD : twlTone(twl)];
  return <span className="hs-twl">
    <TwlGauge twl={twl} size={size} valid={valid} />
    <span className="hs-twl-text" data-tone={twl == null ? undefined : valid ? (band && band in TONE_WORD ? band : twlTone(twl)) : 'unknown'}>{twl == null ? 'No reading' : `TWL ${twl} W/m² · ${word}${estimated ? ' · est.' : ''}`}</span>
  </span>;
}

export type TwlPoint = { hour: string; twl: number };
export type TwlReadingPoint = { at: string; twl: number; sensor: string };

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
  const red = band(lo, TWL_HIGH_BELOW), amber = band(TWL_HIGH_BELOW, TWL_POLICY);
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
      <span><i className="hs-key-policy" />Policy level {TWL_POLICY} W/m²</span>
    </div>
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
        {readings.map(r => { const m = minutes(r.at); return m >= t0 && m <= t1 ? <circle key={`${r.sensor}${r.at}`} cx={x(m)} cy={y(r.twl)} r="5" fill="var(--color-sheet)" stroke="var(--color-ink)" strokeWidth="2"><title>{`${r.at} · ${r.sensor} · TWL ${r.twl} W/m²`}</title></circle> : null; })}
        {hp && <g pointerEvents="none"><line x1={x(minutes(hp.hour))} x2={x(minutes(hp.hour))} y1={T} y2={H - B} stroke="var(--color-ink)" strokeWidth="1" /><circle cx={x(minutes(hp.hour))} cy={y(hp.twl)} r="5" fill="var(--color-ink)" stroke="var(--color-sheet)" strokeWidth="2" /></g>}
      </svg>
      {hp && <div className="hs-chart-tip" style={{ insetInlineStart: `${(x(minutes(hp.hour)) / W) * 100}%` }} role="status">
        <b>{hp.hour}</b> · TWL {hp.twl} W/m² · {TONE_WORD[twlTone(hp.twl)]}<br /><small>{minutes(hp.hour) > nowM ? 'Predicted' : kindLabel}</small>
      </div>}
    </div>
    <figcaption id={`${id}-cap`} className="hs-visually-hidden">TWL in sun by hour against the policy level of {TWL_POLICY} W/m².</figcaption>
    <details className="hs-chart-table"><summary>Show as table</summary>
      <table className="hs-table hs-table-sm"><thead><tr><th>Hour</th><th>TWL W/m²</th><th>Band</th><th>Source</th></tr></thead>
        <tbody>{hourly.map(p => <tr key={p.hour}><td>{p.hour}</td><td>{p.twl}</td><td>{TONE_WORD[twlTone(p.twl)]}</td><td>{minutes(p.hour) > nowM ? 'Predicted' : kindLabel}</td></tr>)}
          {readings.map(r => <tr key={`r${r.sensor}${r.at}`}><td>{r.at}</td><td>{r.twl}</td><td>{TONE_WORD[twlTone(r.twl)]}</td><td>Sensor {r.sensor}</td></tr>)}</tbody></table>
    </details>
  </figure>;
}
