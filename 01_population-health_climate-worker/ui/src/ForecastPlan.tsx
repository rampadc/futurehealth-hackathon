import { ArrowRight, CloudSun, HardHat, PackageCheck, ShieldAlert } from 'lucide-react';
import { deliveries, fixtures, policies } from './fixtures';
import './ForecastPlan.css';

const scenario = fixtures['01_pre_shift_planning'];
const forecast = scenario.events.find(event => event.type === 'forecast')!;
const recommendation = scenario.events.find(event => event.type === 'recommendation')!;
const aggregate = deliveries.find(delivery => delivery.id === recommendation.payload.delivery_id)!;
const middayRule = policies.find(policy => policy.id === 'p_midday');
const clock = (value: string) => new Date(value).toLocaleTimeString('en-AU', {
  timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false,
});
const [forecastStart, forecastEnd] = (forecast.payload.forecast_window as string).split('/');
const [workStart, workEnd] = (recommendation.payload.proposed_task_window as string).split('/');
const day = new Date(workStart).toLocaleDateString('en-AU', {
  timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
});

/** A planning view for fixture 01; all times are Gulf Standard Time. */
export default function ForecastPlan() {
  return (
    <section className="forecast-plan" aria-labelledby="forecast-plan-title">
      <header className="forecast-plan__head">
        <div>
          <span className="forecast-plan__eyebrow">Pre-shift outlook · {day} · GST</span>
          <h2 id="forecast-plan-title">Plan the morning work</h2>
          <p>Review the trench window and aggregate delivery.</p>
        </div>
        <div className="forecast-plan__temperature" aria-label={`Forecast maximum ${forecast.payload.max_air_c} degrees Celsius between ${clock(forecastStart)} and ${clock(forecastEnd)}`}>
          <CloudSun size={28} strokeWidth={1.7} aria-hidden="true" />
          <div><strong>{forecast.payload.max_air_c}°</strong><span>forecast maximum<br />{clock(forecastStart)}–{clock(forecastEnd)}</span></div>
        </div>
      </header>

      <div className="forecast-plan__body">
        <div className="forecast-plan__axis" aria-hidden="true">
          <span>08:00</span><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span>
        </div>
        <div className="forecast-plan__lanes" role="img" aria-label={`Timeline, Gulf Standard Time. Proposed heavy trench work ${clock(workStart)} to ${clock(workEnd)}. Forecast maximum ${forecast.payload.max_air_c} degrees Celsius during ${clock(forecastStart)} to ${clock(forecastEnd)}; no hourly temperatures are available. Confirmed aggregate delivery ${clock(aggregate.site_slot)}. ${middayRule ? 'Outdoor work restriction 12:30 to 15:00.' : ''}`}>
          <div className="forecast-plan__lane forecast-plan__lane--work">
            <span className="forecast-plan__lane-label"><HardHat size={16} aria-hidden="true" /> Trench work</span>
            <span className="forecast-plan__bar forecast-plan__bar--work">Proposed · {clock(workStart)}–{clock(workEnd)}</span>
          </div>
          <div className="forecast-plan__lane forecast-plan__lane--forecast">
            <span className="forecast-plan__lane-label"><CloudSun size={16} aria-hidden="true" /> Heat outlook</span>
            <span className="forecast-plan__bar forecast-plan__bar--forecast">{forecast.payload.max_air_c}°C max in this interval</span>
          </div>
          <div className="forecast-plan__lane forecast-plan__lane--delivery">
            <span className="forecast-plan__lane-label"><PackageCheck size={16} aria-hidden="true" /> Aggregate</span>
            <span className="forecast-plan__delivery-marker" aria-hidden="true" />
            <span className="forecast-plan__delivery-label">{clock(aggregate.site_slot)} confirmed</span>
          </div>
          {middayRule && <div className="forecast-plan__lane forecast-plan__lane--restriction">
            <span className="forecast-plan__lane-label"><ShieldAlert size={16} aria-hidden="true" /> Outdoor work</span>
            <span className="forecast-plan__bar forecast-plan__bar--restriction">Restriction · 12:30–15:00</span>
          </div>}
        </div>
        <p className="forecast-plan__chart-note">{forecast.payload.max_air_c}°C is the forecast maximum for {clock(forecastStart)}–{clock(forecastEnd)}, not an hourly reading. Check the trench reading below.</p>
      </div>

      <footer className="forecast-plan__footer">
        <div className="forecast-plan__next">
          <span className="forecast-plan__eyebrow">Next coordination step</span>
          <p><strong>Rashid</strong> reviews the plan with <strong>Huda</strong>. <strong>Noura</strong> checks the {clock(aggregate.site_slot)} delivery; that booking still stands.</p>
        </div>
        <div className="forecast-plan__clearance"><ArrowRight size={16} aria-hidden="true" /><span>Before work starts, check current trench conditions. The forecast does not clear work.</span></div>
      </footer>
    </section>
  );
}
