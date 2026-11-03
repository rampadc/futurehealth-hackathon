import { assessThermalReading, type ThermalReadingValue } from './thermal';
import './ThermalReading.css';

type Props = { reading?: ThermalReadingValue | null; clock: string; sensorStatus: string; compact?: boolean };

function elapsed(ms: number) {
  const seconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  if (!minutes) return `${seconds} sec`;
  return seconds % 60 ? `${minutes} min ${seconds % 60} sec` : `${minutes} min`;
}

export function ThermalReading({ reading, clock, sensorStatus, compact = false }: Props) {
  const status = assessThermalReading(reading, clock, sensorStatus);
  const age = status.ageMs === null ? '' : elapsed(status.ageMs);
  const measured = reading && Number.isFinite(Date.parse(reading.at))
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(reading.at))
    : null;
  const statusLabel = {
    current: status.label,
    missing: 'No reading',
    failed: 'Sensor failed',
    future: 'Future-dated reading',
    stale: 'Stale reading',
    invalid: 'Invalid reading',
  }[status.reason];
  const reason = {
    current: `Current local reading · ${age} old (five-minute limit)`,
    missing: 'No local TWL reading recorded.',
    failed: `Sensor failed. Last reading is historical${age ? ` · ${status.ageMs! < 0 ? `${age} ahead of site clock` : `${age} old`}` : ''}; obtain a fresh reading from a working local sensor.`,
    future: `Reading timestamp is ${age} ahead of the site clock; it cannot be treated as current.`,
    stale: `Reading is ${age} old, exceeding the five-minute limit; obtain a fresh local reading.`,
    invalid: 'Reading, timestamp, site clock, or sensor status is invalid; obtain a verified local reading.',
  }[status.reason];
  const lights = [
    { band: 'red', label: 'High risk' },
    { band: 'amber', label: 'Caution' },
    { band: 'green', label: 'Low environmental risk' },
  ];

  return <div className="thermal-reading">
    <div className="thermal-reading-value">{status.lastValue === null ? 'TWL unavailable' : <><strong>{status.lastValue} W/m²</strong>{status.reason !== 'current' && <span> · {status.reason === 'future' ? 'future dated, unverified' : 'historical'}</span>}</>}</div>
    {measured && <span className="thermal-measured">Measured {measured} GST</span>}
    <div className="thermal-lights" role="group" aria-label="Environmental TWL traffic light">
      {lights.map(light => <span key={light.band} className={`thermal-lamp thermal-lamp-${light.band}${status.band === light.band ? ' active' : ''}`} role="img" aria-label={`${light.band} lamp: ${light.label}, ${status.band === light.band ? 'on' : 'off'}`} />)}
      <span className="thermal-band">{statusLabel}{status.band === 'green' ? ' · environmental band only' : ''}</span>
    </div>
    <p className="thermal-reason">{reason}</p>
    {status.reason === 'current' && status.lastValue !== null && status.lastValue <= 150 && <div className="thermal-site-hold"><strong>Heavy-work threshold reached</strong><p>{status.band === 'green' ? 'Green starts at 140 W/m²; Sandline’s stricter heavy-work rule requires a hold at 150 W/m² or below.' : 'Sandline requires heavy trench work to be held at 150 W/m² or below.'}</p><p>An active hold stays in place until Rashid approves restart.</p></div>}
    {!compact && <p className="thermal-caveat">Environmental band is not a work clearance. Follow active holds and the site review process.</p>}
  </div>;
}
