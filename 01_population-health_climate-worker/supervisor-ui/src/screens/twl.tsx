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
export const twlBandWord = (v: number) => TONE_WORD[twlTone(v)];

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
  const pct = twl == null ? 0 : x(twl) / W * 100;
  return <span className="hs-gauge" title={name} style={{ inlineSize: width }}>
    {twl != null && <span className="hs-gauge-mark" aria-hidden="true">
      {/* The value stays inside the bar's width; the triangle points at the (clamped) reading. */}
      <span className="hs-gauge-mark-v" style={{ left: `${pct}%`, transform: `translateX(-${pct}%)` }}>{twl}</span>
      <span className="hs-gauge-tri" style={{ left: `${pct}%` }} />
    </span>}
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

export type TwlPoint = { hour: string; twl: number; temperature_c?: number | null; wbgt_c?: number | null; wet_bulb_c?: number | null; relative_humidity_pct?: number | null };
export type TwlReadingPoint = { at: string; twl: number; sensor: string; quality: string };

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** Lines on the right axis: three in °C, humidity in %. The two units are never shown together. */
type RightKey = 'temp' | 'wbgt' | 'wetbulb' | 'humidity';
const RIGHT: Array<{ key: RightKey; field: 'temperature_c' | 'wbgt_c' | 'wet_bulb_c' | 'relative_humidity_pct'; label: string; unit: '°C' | '%' }> = [
  { key: 'temp', field: 'temperature_c', label: 'Air temperature °C', unit: '°C' },
  { key: 'wbgt', field: 'wbgt_c', label: 'WBGT °C', unit: '°C' },
  { key: 'wetbulb', field: 'wet_bulb_c', label: 'Wet bulb °C', unit: '°C' },
  { key: 'humidity', field: 'relative_humidity_pct', label: 'Humidity %', unit: '%' },
];

/** Left-axis ticks every 20 W/m². */
const ticks = (lo: number, hi: number) => { const out: number[] = []; for (let v = lo; v <= hi; v += 20) out.push(v); return out; };

/**
 * TWL through the shift: the hourly site series, local sensor readings as dots, the risk bands behind
 * and the site heavy-work limit as a dotted line. Air temperature, WBGT and wet bulb (°C) or humidity
 * (%) can be drawn against the right axis; choosing humidity clears the °C lines and the other way
 * round, so the right axis has one unit. Every line is solid up to now and dashed after, as predicted.
 * `onTable` adds a link to the table view.
 */
export function TwlChart({ hourly, now, readings = [], kindLabel, onTable }: { hourly: TwlPoint[]; now: string; readings?: TwlReadingPoint[]; kindLabel: string; onTable?: () => void }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [shown, setShown] = useState<Record<'twl' | RightKey, boolean>>({ twl: true, temp: false, wbgt: false, wetbulb: false, humidity: false });
  if (!hourly.length) return <p className="hs-muted">No hourly TWL for this day.</p>;
  const available = RIGHT.filter(r => hourly.some(p => p[r.field] != null));
  const visible = available.filter(r => shown[r.key]);
  const unit = visible[0]?.unit ?? null;
  const W = 720, H = 240, L = 44, R = available.length ? 40 : 12, T = 12, B = 28;
  const t0 = minutes(hourly[0].hour), t1 = minutes(hourly[hourly.length - 1].hour);
  const values = [...hourly.map(p => p.twl), ...readings.map(r => r.twl), TWL_POLICY];
  const lo = Math.max(0, Math.floor((Math.min(...values) - 20) / 20) * 20);
  const hi = Math.ceil((Math.max(...values) + 20) / 20) * 20;
  const x = (m: number) => L + (W - L - R) * (m - t0) / Math.max(1, t1 - t0);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const nowM = Math.min(t1, Math.max(t0, minutes(now)));
  // Right axis for the lines on show: % runs 0–100; °C in 5-degree steps round the values drawn.
  const rightValues = visible.flatMap(r => hourly.map(p => p[r.field])).filter((v): v is number => v != null);
  const [rLo, rHi, rStep] = unit === '%' ? [0, 100, 20]
    : rightValues.length ? [Math.floor((Math.min(...rightValues) - 2) / 5) * 5, Math.ceil((Math.max(...rightValues) + 2) / 5) * 5, 5] : [0, 1, 1];
  const yr = (v: number) => T + (H - T - B) * (1 - (v - rLo) / Math.max(1, rHi - rLo));
  const rTicks: number[] = [];
  if (unit) for (let v = rLo; v <= rHi; v += rStep) rTicks.push(v);
  /** A series as two paths joined at now: up to now (solid) and after now (dashed, predicted). */
  const split = (value: (p: TwlPoint) => number | null | undefined, yf: (v: number) => number) => {
    const pts: Array<[number, number]> = [];
    for (const p of hourly) { const v = value(p); if (v != null) pts.push([minutes(p.hour), v]); }
    const past = pts.filter(([m]) => m <= nowM), future = pts.filter(([m]) => m >= nowM);
    const a = past[past.length - 1], b = future[0];
    const joint: [number, number] | null = a && b ? [nowM, a[0] === b[0] ? a[1] : a[1] + (b[1] - a[1]) * (nowM - a[0]) / (b[0] - a[0])] : null;
    const path = (list: Array<[number, number]>) => list.map(([m, v], i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)} ${yf(v).toFixed(1)}`).join('');
    return { past: path(joint ? [...past, joint] : past), future: path(joint ? [joint, ...future] : future) };
  };
  const line = (key: string, color: string, value: (p: TwlPoint) => number | null | undefined, yf: (v: number) => number) => {
    const { past, future } = split(value, yf);
    return <g key={key} data-series={key}>
      {past && <path d={past} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-part="actual" />}
      {future && <path d={future} fill="none" stroke={color} strokeWidth="3" strokeDasharray="8 6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-part="predicted" />}
    </g>;
  };
  // Humidity and the °C lines share the right axis, so choosing one unit clears the other.
  const toggle = (key: 'twl' | RightKey) => setShown(v => {
    const next = { ...v, [key]: !v[key] };
    if (key !== 'twl' && next[key]) {
      const u = RIGHT.find(r => r.key === key)!.unit;
      for (const r of RIGHT) if (r.unit !== u) next[r.key] = false;
    }
    return next;
  });
  const band = (from: number, to: number) => { const a = Math.max(lo, from), b = Math.min(hi, to); return b > a ? { y: y(b), h: y(a) - y(b) } : null; };
  const red = band(lo, TWL_HIGH_BELOW), amber = band(TWL_HIGH_BELOW, TWL_LOW_FROM), green = band(TWL_LOW_FROM, hi);
  const hp = hover == null ? null : hourly[hover];
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const m = t0 + ((e.clientX - box.left) * W / box.width - L) / (W - L - R) * (t1 - t0);
    let best = 0; hourly.forEach((p, i) => { if (Math.abs(minutes(p.hour) - m) < Math.abs(minutes(hourly[best].hour) - m)) best = i; });
    setHover(best);
  };
  const axisWord = unit === '%' ? 'humidity %' : '°C';
  return <figure className="hs-chart" aria-labelledby={`${id}-cap`}>
    <div className="hs-chart-legend">
      <label><input type="checkbox" checked={shown.twl} onChange={() => toggle('twl')} /><i className="hs-key-line" data-tone="twl" aria-hidden="true" />TWL W/m² · {kindLabel}</label>
      {available.map(r => <label key={r.key}><input type="checkbox" checked={shown[r.key]} onChange={() => toggle(r.key)} /><i className="hs-key-line" data-tone={r.key} aria-hidden="true" />{r.label}</label>)}
      <span aria-hidden="true"><i className="hs-key-line" data-dashed />After now: predicted</span>
      {readings.length > 0 && <span><i className="hs-key-dot" />Local sensor</span>}
      <span><i className="hs-key-policy" />Site {SITE_RULE}</span>
    </div>
    <p className="hs-muted">Environmental band does not clear site holds.{available.some(r => r.unit === '%') ? ' The right axis shows °C or humidity %, not both.' : ''}</p>
    <div className="hs-chart-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`TWL by hour, ${hourly[0].hour} to ${hourly[hourly.length - 1].hour}. Lowest ${Math.min(...hourly.map(p => p.twl))} W/m².${unit ? ` Right axis: ${axisWord}.` : ''}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {red && <rect x={L} width={W - L - R} y={red.y} height={red.h} fill="var(--color-signal-red)" opacity=".12" />}
        {amber && <rect x={L} width={W - L - R} y={amber.y} height={amber.h} fill="var(--color-signal-yellow)" opacity=".16" />}
        {green && <rect x={L} width={W - L - R} y={green.y} height={green.h} fill="var(--color-signal-green)" opacity=".1" />}
        {ticks(lo, hi).map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-section-frame, #ddd)" strokeWidth="1" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="hs-chart-tick">{v}</text></g>)}
        {rTicks.map(v => <text key={`r${v}`} x={W - R + 6} y={yr(v) + 4} className="hs-chart-tick" data-axis="right">{v}{unit === '%' ? '%' : '°'}</text>)}
        {hourly.filter((_, i) => i % 2 === 0).map(p => <text key={p.hour} x={x(minutes(p.hour))} y={H - 8} textAnchor="middle" className="hs-chart-tick">{p.hour}</text>)}
        <line x1={L} x2={W - R} y1={y(TWL_POLICY)} y2={y(TWL_POLICY)} stroke="var(--color-graphite)" strokeWidth="3" strokeDasharray="0 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-series="policy" />
        <line x1={x(nowM)} x2={x(nowM)} y1={T} y2={H - B} stroke="var(--color-graphite)" strokeWidth="1" strokeDasharray="2 3" />
        <text x={x(nowM) + 4} y={T + 10} className="hs-chart-tick">now {now}</text>
        {visible.map(r => line(r.key, `var(--chart-${r.key})`, p => p[r.field], yr))}
        {shown.twl && line('twl', 'var(--chart-twl)', p => p.twl, y)}
        {readings.map(r => { const m = minutes(r.at); return m >= t0 && m <= t1 ? <circle key={`${r.sensor}${r.at}`} cx={x(m)} cy={y(r.twl)} r="5" fill="var(--color-sheet)" stroke="var(--color-ink)" strokeWidth="2" strokeDasharray={r.quality === 'valid' ? undefined : '3 2'}><title>{`${r.at} · ${r.sensor} · TWL ${r.twl} W/m² · ${r.quality === 'valid' ? TONE_WORD[twlTone(r.twl)] : 'Unknown'} · quality: ${r.quality}`}</title></circle> : null; })}
        {hp && <g pointerEvents="none"><line x1={x(minutes(hp.hour))} x2={x(minutes(hp.hour))} y1={T} y2={H - B} stroke="var(--color-ink)" strokeWidth="1" /><circle cx={x(minutes(hp.hour))} cy={y(hp.twl)} r="5" fill="var(--chart-twl)" stroke="var(--color-sheet)" strokeWidth="2" /></g>}
      </svg>
      {hp && <div className="hs-chart-tip" style={{ insetInlineStart: `${(x(minutes(hp.hour)) / W) * 100}%` }} role="status">
        <b>{hp.hour}</b> · TWL {hp.twl} W/m² · {TONE_WORD[twlTone(hp.twl)]} · check site holds{hp.temperature_c != null && <> · {hp.temperature_c} °C</>}{hp.wbgt_c != null && <> · WBGT {hp.wbgt_c} °C</>}{hp.wet_bulb_c != null && <> · wet bulb {hp.wet_bulb_c} °C</>}{hp.relative_humidity_pct != null && <> · {hp.relative_humidity_pct}% humidity</>}<br /><small>{minutes(hp.hour) > nowM ? 'Predicted' : kindLabel}</small>
      </div>}
    </div>
    <figcaption id={`${id}-cap`} className="hs-visually-hidden">TWL in sun by hour, solid up to now and dashed after as predicted{available.length ? ', with optional lines for air temperature, WBGT and wet bulb in °C or humidity in % on the right axis' : ''}. Environmental band does not clear site holds. Site {SITE_RULE}.</figcaption>
    {onTable ? <p><button type="button" className="hs-link" onClick={onTable}>Open the hourly table</button></p> :
    <details className="hs-chart-table"><summary>Show as table</summary>
      <table className="hs-table hs-table-sm"><thead><tr><th>Hour</th><th>TWL W/m²</th><th>Environmental band</th><th>Site heavy work</th><th>Source</th><th>Quality</th></tr></thead>
        <tbody>{hourly.map(p => <tr key={p.hour}><td>{p.hour}</td><td>{p.twl}</td><td>{TONE_WORD[twlTone(p.twl)]}</td><td>{SITE_RULE}</td><td>{minutes(p.hour) > nowM ? 'Predicted' : kindLabel}</td><td>—</td></tr>)}
          {readings.map(r => <tr key={`r${r.sensor}${r.at}`}><td>{r.at}</td><td>{r.twl}</td><td>{r.quality === 'valid' ? TONE_WORD[twlTone(r.twl)] : 'Unknown'}</td><td>{SITE_RULE}</td><td>Sensor {r.sensor} · quality {r.quality}</td><td>{r.quality}</td></tr>)}</tbody></table>
    </details>}
  </figure>;
}
