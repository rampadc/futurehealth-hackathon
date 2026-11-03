import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThermalReading } from './ThermalReading';

test('stale numeric reading stays visible as historical with unknown lamps', () => {
 const html = renderToStaticMarkup(<ThermalReading reading={{ twl: 145, at: '2025-08-04T07:59:59+04:00' }} clock="2025-08-04T08:05:00+04:00" sensorStatus="serviceable" />);
 expect(html).toContain('145 W/m²');
 expect(html).toContain('historical');
 expect(html).toContain('5 min 1 sec old');
 expect(html).toContain('Measured 07:59 GST');
 expect(html).toContain('Stale reading');
 expect(html).toContain('green lamp: Low environmental risk, off');
 expect(html).toContain('Environmental band is not a work clearance');
});

test('current green band still shows separate Sandline heavy-work hold', () => {
 const html = renderToStaticMarkup(<ThermalReading reading={{ twl: 145, at: '2025-08-04T08:00:00+04:00' }} clock="2025-08-04T08:05:00+04:00" sensorStatus="serviceable" />);
 expect(html).toContain('green lamp: Low environmental risk, on');
 expect(html).toContain('5 min old');
 expect(html).toContain('Sandline site rule: heavy work remains on hold');
});

test('failed, missing, and future readings explain why no lamp is live', () => {
 const failed = renderToStaticMarkup(<ThermalReading reading={{ twl: 190, at: '2025-08-04T08:04:00+04:00' }} clock="2025-08-04T08:05:00+04:00" sensorStatus="failed" />);
 expect(failed).toContain('190 W/m²');
 expect(failed).toContain('Sensor failed. Last reading is historical');
 expect(failed).toContain('1 min old');
 expect(failed).toContain('green lamp: Low environmental risk, off');
 const missing = renderToStaticMarkup(<ThermalReading clock="2025-08-04T08:05:00+04:00" sensorStatus="serviceable" />);
 expect(missing).toContain('No local TWL reading recorded');
 const future = renderToStaticMarkup(<ThermalReading reading={{ twl: 145, at: '2025-08-04T08:05:01+04:00' }} clock="2025-08-04T08:05:00+04:00" sensorStatus="serviceable" />);
 expect(future).toContain('1 sec ahead');
 expect(future).not.toContain('Sandline site rule: heavy work remains on hold');
});

test('compact mode leaves the common clearance caveat to its enclosing table', () => {
 const html = renderToStaticMarkup(<ThermalReading reading={{ twl: 145, at: '2025-08-04T08:04:00+04:00' }} clock="2025-08-04T08:05:00+04:00" sensorStatus="serviceable" compact />);
 expect(html).not.toContain('Environmental band is not a work clearance');
 expect(html).toContain('Measured 08:04 GST');
});
