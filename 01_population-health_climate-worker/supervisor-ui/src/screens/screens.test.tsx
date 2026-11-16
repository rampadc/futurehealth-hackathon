import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { loadCase, type CaseId } from '../replay';
import { ADMIN, PERSONAS, initialStory, type StoryState } from '../story';
import type { CaseView, Task } from '../live';
import type { CrewRisk } from '../contract';
import { SCREENS } from './registry';
import { outboxScope, readOutbox } from '../offline';
import { renewAccessGeneration } from '../accessGeneration';
import type { CaseSession } from '../session';
import { ActionCardScreen } from './site/crew';

const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let currentCase: CaseView | null;
let person: typeof PERSONAS[number] | null;
let commands: Array<{ action: string; payload: Record<string, unknown> }>;
let commandIds: string[];
let brand: { version: number; published_at: string | null; published_by: string | null; platform: unknown; mobile: unknown };
let brandCalls: Array<Record<string, unknown>>;
const hourOf = (hour: string, twl: number, zone: string) => ({ hour, temperature_c: 34.4, wbgt_c: 32.2, twl_sun_wm2: twl, twl_zone_sun: zone, twl_shade_wm2: twl + 40, twl_zone_shade: 'low', band_sun: zone === 'high' ? 'red' : 'amber', midday_break_minutes: 0, withdrawal_limit: '', data_issue: '' });
let conditions: unknown;
let crewRisk: CrewRisk;
let chatHistory: unknown[];
const riskInputs = { hour: '08:00', site: 'mussafah', weather: 'ok', local_reading: 'used', rules_version: 'rules-test' } as const;
const ownRisk = { inputs: riskInputs, person_id: 'C05', band: 'amber', twl_wm2: 138, zone: 'medium', factors: ['Cloth coveralls over a shirt lower your work limit to 138 W/m² (medium zone; work wear is low)'],
  missing_inputs: [], special_controls: false, may_work_here: true, work_rest: '45 min work / 15 min rest (paced work)', action: 'Paced work: 45 min work / 15 min rest (paced work). Drink 1.0-1.2 light; >1.2 heavy L an hour.' };
let consent: { person_id: string; language: string; scopes: string[]; consented_at: string | null };
let photos: Record<string, string>;
let photoCalls: Array<{ method: string; image?: string }>;
let heatRestOverride: unknown = null;
const checks = (primary: string) => [{ id: 'signal', ok: primary !== '#D32F2F', label: primary === '#D32F2F' ? 'Brand colour reads as the stop signal' : 'Brand colour does not read as a safety signal' }];

async function makeCase(id: CaseId, story: Partial<StoryState>, tasks: Task[]): Promise<CaseView> {
  const capture = await loadCase(id, { delayMs: 0 });
  return { case_id: 'case-1', version: 4, clock: capture.request.decision_at, capture, request: structuredClone(capture.request), story: { ...initialStory(), ...story }, tasks };
}
const task = (action: string, actor_id: string, status: Task['status'], label = action): Task => ({ action, actor_id, label, status });

beforeEach(() => {
  conditions = { status: 'ok', site: 'mussafah', date: '2025-08-04', source: 'cache:era5_summer_2025.csv', kind: 'replay', clock_hour: '08:00', current: hourOf('08:00', 127, 'medium'),
    summary: { max_temperature_c: 45.8, max_wbgt_c: 35.2, min_twl_sun_wm2: 76, worst_band: 'red', hours_high_zone_sun: 5, midday_break: '12:30-15:00', heat_programme_required: true, data_issues: 0 },
    hourly: [hourOf('07:00', 140, 'low'), hourOf('08:00', 127, 'medium'), hourOf('12:00', 90, 'high')], zone_thresholds_wm2: { high_below: 115, low_from: 140 }, citation: [{ cite: 'ADOSH-SF TG', url: null }], rules_version: 'rules-test' };
  crewRisk = { inputs: { ...riskInputs }, crew: { band: 'red', at_or_above_amber: 3, total: 3, counts: { green: 0, amber: 1, red: 2, emergency: 0 } }, workers: [
    { person_id: 'C07', band: 'amber', action: 'Paced work: 45 min work / 15 min rest (paced work)', needs_rest: false, check_in_person: false },
    { person_id: 'C06', band: 'red', action: 'Strict work and rest: 20 min work / 40 min rest', needs_rest: false, check_in_person: false },
    { person_id: 'C08', band: 'red', action: 'Needs rest now: remove from heat and check in within 10 minutes', needs_rest: true, check_in_person: false },
  ] };
  person = null; commands = []; commandIds = []; currentCase = null; brandCalls = []; chatHistory = [];
  brand = { version: 0, published_at: null, published_by: null, platform: null, mobile: null };
  consent = { person_id: 'C05', language: 'en', scopes: [], consented_at: null };
  photos = {}; photoCalls = []; heatRestOverride = null;
  vi.stubGlobal('EventSource', undefined);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === '/api/session') {
      if (method === 'POST') { person = [...PERSONAS, ADMIN].find(p => p.id === body.persona_id)!; return reply({ person }); }
      return reply({ person });
    }
    if (path === '/api/case') return reply(currentCase);
    if (path === '/api/case/heat-rest') return reply(heatRestOverride ?? { policy_id: 'heat-rest-schedule-v1', title: 'Fictional Sandline–Dune Heat Rest Schedule', source: 'demo/cross-scenario/HEAT_REST_SCHEDULE.md', scope: 'C02–C12', case_id: currentCase?.case_id, payroll_verified: false, coverage_review: null, records: { stop: null, headcount: currentCase?.headcount, arrivals: currentCase?.headcount?.arrivals ?? [], observed_time: [] }, review_queue: { status: 'pending', policy_id: 'heat-rest-schedule-v1', expected_count: 11, confirmed_count: currentCase?.headcount?.confirmed_count ?? 0 } });
    if (path === '/api/case/commands') {
      commands.push({ action: body.action, payload: body.payload }); commandIds.push(body.command_id);
      const t = currentCase?.tasks.find(x => x.action === body.action);
      if (t) t.status = 'recorded';
      return reply(currentCase);
    }
    if (path === '/api/chat/history') return reply({ messages: chatHistory });
    if (path === '/api/ready') return reply({ ok: true });
    if (path === '/api/case/conditions') return reply(conditions);
    if (path === '/api/case/crew-risk') return reply(crewRisk);
    if (path === '/api/worker/risk') return reply(ownRisk);
    if (path === '/api/brand') {
      if (method === 'PUT') { brand = { version: brand.version + 1, published_at: '2025-08-04T16:40:00+04:00', published_by: 'P09', platform: body.platform, mobile: body.mobile }; brandCalls.push(body); return reply(brand); }
      return reply(brand);
    }
    if (path === '/api/brand/check') return reply({ platform: checks(body.platform.primary), mobile: checks(body.mobile.primary) });
    if (path === '/api/trust-log') return reply([
      { id: 'agent-1', at: '2025-08-04T08:20:00+04:00', kind: 'agent_run', summary: 'Planning Agent answered Rashid Al Wadi · tools: get_case, what_if_crew_plan', status: 'completed', applied: false },
      { id: 'run-1', at: '2025-08-04T08:02:00+04:00', kind: 'solver_run', summary: 'Solver run for case version 2', status: 'completed', applied: false },
      { id: 'event-1', at: '2025-08-04T08:01:00+04:00', kind: 'command', summary: 'Maya Al Qamar: stop-work', status: 'recorded', applied: true },
    ]);
    if (path === '/api/worker/consent') {
      if (method === 'PUT') consent = { person_id: person!.id, language: body.language, scopes: body.scopes, consented_at: body.scopes.length ? '2025-08-04T07:30:00+04:00' : null };
      if (method === 'DELETE') consent = { ...consent, scopes: [], consented_at: null };
      return reply(consent);
    }
    if (path === '/api/people/photos') return reply({ photos });
    if (path.startsWith('/api/people/') && path.includes('/photo?v=')) return new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'Content-Type': 'image/webp' } });
    if (path === '/api/people/me/photo') {
      photoCalls.push({ method, image: body?.image });
      if (method === 'PUT') { photos = { ...photos, [person!.id]: '2025-08-04T16:45:00.000+00:00' }; return reply({ person_id: person!.id, updated_at: photos[person!.id] }); }
      const { [person!.id]: _gone, ...rest } = photos; photos = rest; return reply({ person_id: person!.id, updated_at: null });
    }
    if (path.startsWith('/api/demo/')) return reply({ detail: 'Presenter access required' }, 403);
    return reply({ detail: `Unexpected ${method} ${path}` }, 404);
  }));
});

const open = async (path: string, personaId: string) => {
  person = [...PERSONAS, ADMIN].find(p => p.id === personaId)!;
  window.history.replaceState(null, '', path);
  return render(<App />);
};

describe('every built screen', () => {
  const built = SCREENS.filter(s => s.component);
  it('covers every wireframe screen', () => {
    expect(SCREENS.filter(s => !s.component).map(s => s.id)).toEqual([]);
  });
  for (const caseId of ['heat_trigger', 'incident_substitute', 'restart_ready'] as const) {
    it(`renders each screen for each of its personas · ${caseId}`, async () => {
      currentCase = await makeCase(caseId, caseId === 'heat_trigger' ? {} : { issued: true, acknowledged: true, stopped: true, checkedIn: true, recovered: true, assigned: true, reported: true, removed: true, firstaid: true },
        [task('issue', 'P03', 'ready'), task('acknowledge', 'C01', 'waiting'), task('report', 'C08', 'waiting'), task('checkin', 'C05', 'waiting'), task('review', 'P02', 'waiting')]);
      for (const s of built) for (const id of s.personas) {
        const view = await open(`/${s.device}/${s.id}`, id);
        expect(await screen.findByRole('heading', { level: 1 }), `${s.id} as ${id}`).toBeTruthy();
        view.unmount();
      }
    }, 60_000);
  }
  it('explains an empty case instead of failing', async () => {
    // Branding and site setup are organisation-wide and the account page is personal: none needs a case.
    for (const s of built.filter(x => x.device !== 'worker' && x.id !== 'settings' && x.id !== 'site-setup' && x.group !== 'account')) {
      const view = await open(`/${s.device}/${s.id}`, s.personas[0]);
      expect(await screen.findByText(/There is no active case/)).toBeTruthy();
      view.unmount();
    }
  });
});

describe('stop-work', () => {
  it('keeps foreman headcount distinct from later crew locations', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, assigned: true, reported: true, removed: true }, []);
    currentCase.headcount = { expected_count: 11, checked_in_count: 1, confirmed_count: 11, confirmed_at: '2025-08-04T08:04:00+04:00', arrivals: [] };
    await open('/web/monitoring', 'C01');
    expect(await screen.findByText('Huda confirmed at 08:04')).toBeTruthy();
  });

  it('shows Rana only her arrival when she opens Huda’s headcount route', async () => {
    currentCase = await makeCase('heat_trigger', { stopped: true }, []);
    currentCase.headcount = { expected_count: 11, checked_in_count: 1, confirmed_count: 0, confirmed_at: null, arrivals: [{ person_id: 'C05', checked_in_at: currentCase.clock }] };
    await open('/site/headcount', 'C05');
    expect(await screen.findByText(/Your own arrival is recorded/)).toBeTruthy();
    expect(screen.queryByText(/Bilal \(C08\)/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirm 11 workers/ })).toBeNull();
  });

  it('shows Bilal only his own heat and rest coverage feedback', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, reported: true }, []);
    currentCase.headcount = { expected_count: 11, checked_in_count: 1, confirmed_count: 11, confirmed_at: currentCase.clock, arrivals: [] };
    heatRestOverride = { policy_id: 'heat-rest-schedule-v1', title: 'Fictional Sandline–Dune Heat Rest Schedule', source: 'demo/cross-scenario/HEAT_REST_SCHEDULE.md', scope: 'Dune Civil Works C02–C12', case_id: currentCase.case_id, payroll_verified: false,
      coverage_review: { status: 'confirmed', roster_verified: true, reviewed_by: 'P10', reviewed_at: currentCase.clock, note: 'Private employer basis', crew_ids: ['C05'] },
      records: { headcount: { expected_count: 11, checked_in_count: 1, confirmed_count: 11 }, arrivals: [], observed_time: [] } };
    await open('/worker/heat-rest', 'C08');
    expect(await screen.findByRole('heading', { name: 'My heat and rest coverage' })).toBeTruthy();
    expect(screen.getAllByText('Coverage confirmed').length).toBeGreaterThan(0);
    expect(screen.getByText('Not recorded')).toBeTruthy();
    expect(screen.queryByText('Case-linked operations')).toBeNull();
    expect(screen.queryByText(/Foreman headcount:/)).toBeNull();
    expect(screen.queryByText('Private employer basis')).toBeNull();
    expect(screen.queryByText('C05')).toBeNull();
  });

  it('records Mina’s coverage decision against the policy and verified roster', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('coverage_review', 'P10', 'ready')]);
    await open('/web/heat-rest', 'P10');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Heat and rest coverage review' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sandline–Dune Heat Rest Schedule' })).toBeTruthy();
    expect(screen.getByText('Payroll payment has not been verified.')).toBeTruthy();
    expect((await screen.findByText(/demo\/cross-scenario\/HEAT_REST_SCHEDULE\.md/)).closest('details')?.open).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: /I verified the C02–C12 crew roster/ }));
    await user.type(screen.getByRole('textbox', { name: 'Basis or unresolved item' }), 'Checked employer roster');
    await user.click(screen.getByRole('button', { name: 'Record employer coverage review' }));
    await waitFor(() => expect(commands[0]).toMatchObject({ action: 'coverage_review', payload: { policy_id: 'heat-rest-schedule-v1', status: 'confirmed', roster_verified: true, note: 'Checked employer roster' } }));
    expect(commands[0].payload.crew_ids).toEqual(Array.from({ length: 11 }, (_, i) => `C${String(i + 2).padStart(2, '0')}`));
  });

  it('lets Mina flag coverage for verification without falsely attesting the roster', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('coverage_review', 'P10', 'ready')]);
    await open('/web/heat-rest', 'P10');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Heat and rest coverage review' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Coverage status' }), 'needs_verification');
    await user.type(screen.getByRole('textbox', { name: 'Basis or unresolved item' }), 'Roster identity requires checking');
    const button = screen.getByRole('button', { name: 'Record employer coverage review' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await user.click(button);
    await waitFor(() => expect(commands[0]).toMatchObject({ action: 'coverage_review', payload: { status: 'needs_verification', roster_verified: false, note: 'Roster identity requires checking' } }));
  });

  it('keeps Mina’s coverage draft through a same-case poll', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('coverage_review', 'P10', 'ready')]);
    await open('/web/heat-rest', 'P10');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Heat and rest coverage review' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Coverage status' }), 'needs_verification');
    await user.type(screen.getByRole('textbox', { name: 'Basis or unresolved item' }), 'Need roster evidence');
    currentCase.version++;
    currentCase.clock = '2025-08-04T08:05:00+04:00';
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect((screen.getByRole('combobox', { name: 'Coverage status' }) as HTMLSelectElement).value).toBe('needs_verification');
    expect((screen.getByRole('textbox', { name: 'Basis or unresolved item' }) as HTMLTextAreaElement).value).toBe('Need roster evidence');
  });

  it('shows Amal aggregate chronology, confirmed duration, delivery and open commercial questions', async () => {
    currentCase = await makeCase('heat_trigger', { stopped: true, recovered: true }, []);
    heatRestOverride = { policy_id: 'heat-rest-schedule-v1', title: 'Fictional Sandline–Dune Heat Rest Schedule', source: 'demo/cross-scenario/HEAT_REST_SCHEDULE.md', scope: 'Dune Civil Works C02–C12', case_id: currentCase.case_id, payroll_verified: false,
      coverage_review: { status: 'confirmed', roster_verified: true, note: 'Private employer note', reviewed_by: 'P10', reviewed_at: currentCase.clock },
      records: { headcount: { expected_count: 11, checked_in_count: 1, confirmed_count: 11 }, observed_time: [] },
      commercial_summary: { stop_at: currentCase.clock, recovery_confirmed_at: currentCase.clock, confirmed_count: 11, coverage_status: 'confirmed', cost_review_at: null,
        chronology: [{ action: 'stop', title: 'Heavy work stopped', occurred_at: currentCase.clock }, { action: 'checkin', title: 'Rana Al Nadir checked in', occurred_at: currentCase.clock }], confirmed_time: { recovery_worker_minutes: 26, workshop_worker_minutes: 2, latest_observed_at: currentCase.clock },
        employer_review: { status: 'confirmed', roster_verified: true, reviewed_at: currentCase.clock }, delivery: { status: 'accepted', milestones: [{ action: 'acceptDelivery', occurred_at: currentCase.clock }] },
        unresolved_questions: [{ id: 'cost-impact', question: 'Has the cost impact been reviewed?', status: 'open' }] } };
    await open('/web/heat-rest', 'P01');
    expect(await screen.findByRole('heading', { name: 'Project evidence' })).toBeTruthy();
    expect(screen.getByText(/Confirmed recovery: 26 worker-minutes/)).toBeTruthy();
    expect(screen.getByText(/Confirmed workshop work: 2 worker-minutes/)).toBeTruthy();
    expect(screen.getByText('Delivery accepted')).toBeTruthy();
    expect(screen.getByText('Personal shelter arrival recorded')).toBeTruthy();
    expect(screen.getByText('Has the cost impact been reviewed?')).toBeTruthy();
    expect(screen.queryByText('Private employer note')).toBeNull();
    expect(screen.queryByText('Rana Al Nadir checked in')).toBeNull();
  });

  it('keeps Amal monitoring aggregate-only with an absent solver capture', async () => {
    currentCase = await makeCase('heat_trigger', { issued: true, stopped: true, recovered: true }, [task('costReview', 'P01', 'ready')]);
    currentCase.capture = null; currentCase.request = null; currentCase.plan_assessment = null; currentCase.workers = [];
    currentCase.headcount = { expected_count: 11, checked_in_count: 1, confirmed_count: 11, confirmed_at: currentCase.clock, arrivals: [] };
    await open('/web/monitoring', 'P01');
    expect(await screen.findByRole('heading', { name: 'Project monitoring' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open project heat and rest view' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record cost impact review' })).toBeTruthy();
    expect(screen.queryByText('Heat risk by worker')).toBeNull();
    expect(screen.queryByText('0 / 0')).toBeNull();
  });

  it('Huda acknowledges from the site app', async () => {
    currentCase = await makeCase('heat_trigger', { issued: true }, [task('issue', 'P03', 'recorded'), task('acknowledge', 'C01', 'ready')]);
    await open('/site/stop-work', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'acknowledge', payload: {} }]));
  });

  it('only the owner can issue: Huda sees no enabled issue button on heat controls', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('issue', 'P03', 'ready')]);
    await open('/web/heat-controls', 'C01');
    expect(await screen.findByRole('heading', { name: 'This screen belongs to another role' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Issue stop-work instruction' })).toBeNull();
  });

  it('shows replayed site conditions on heat controls without using them for clearance', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('issue', 'P03', 'ready')]);
    await open('/web/heat-controls', 'P03');
    expect(await screen.findByRole('heading', { name: 'Site conditions · Historical ERA5' })).toBeTruthy();
    expect(screen.getByText(/08:00 · TWL 127 W\/m² in sun · 167 in shade/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /^TWL by hour/ })).toBeTruthy();
  });

  it('says conditions are unavailable and to rely on local readings', async () => {
    conditions = { status: 'unavailable', site: 'mussafah', date: '2025-08-04', message: 'no weather data' };
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/monitoring', 'P03');
    expect(await screen.findByText(/Conditions unavailable: no weather data/)).toBeTruthy();
  });

  it('shows each worker’s heat-risk band and action, most at risk first, without reasons', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/monitoring', 'P03');
    const red = await screen.findByRole('table', { name: 'Red band workers' });
    const amber = screen.getByRole('table', { name: 'Amber band workers' });
    expect(red.closest('[data-signal="red"]')).toBeTruthy();
    expect(amber.closest('[data-signal]')).toBeNull();
    expect(red.textContent).toMatch(/C06.*20 min work/);
    expect(amber.textContent).toMatch(/C07/);
    // Red appears before Amber.
    expect(red.compareDocumentPosition(amber) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Crew band Red · 3 of 3 at Amber or above')).toBeTruthy();
    for (const t of [red, amber]) expect(t.textContent).not.toMatch(/unwell|coverall|TWL/i);
  });

  it('sorts a band table by any column and greys out "work as planned"', async () => {
    crewRisk = { ...crewRisk, workers: [...crewRisk.workers, { person_id: 'C05', band: 'green', action: 'Work as planned', needs_rest: false, check_in_person: false }] };
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/monitoring', 'P03');
    const red = await screen.findByRole('table', { name: 'Red band workers' });
    const names = () => [...red.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent);
    const before = names();
    fireEvent.click(within(red).getByRole('button', { name: /Worker/ }));
    expect(names()).toEqual([...before].reverse());
    expect(within(red).getByRole('columnheader', { name: /Worker/ }).getAttribute('aria-sort')).toBe('descending');
    const green = screen.getByRole('table', { name: 'Green band workers' });
    expect(within(green).getByText('Work as planned').className).toContain('hs-no-action');
    expect(within(red).getByText(/Strict work and rest/).closest('td')?.className ?? '').not.toContain('hs-no-action');
  });

  it('never shows a faulty reading as low risk', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    currentCase.request!.snapshot.readings[0] = { ...currentCase.request!.snapshot.readings[0], twl: 145, quality: 'invalid' };
    await open('/web/monitoring', 'P03');
    expect((await screen.findAllByText(/TWL 145 W\/m² · Unknown/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Low environmental risk/)).toBeNull();
  });

  it('warns that every band is raised while the local reading is lost', async () => {
    crewRisk = { ...crewRisk, inputs: { ...crewRisk.inputs, local_reading: 'lost' } };
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/crew', 'C01');
    expect(await screen.findByText(/Local reading faulty or stale: every band is one level higher/)).toBeTruthy();
  });

  it('shows a worker their own band with the reasons only they see', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/worker/now', 'C05');
    expect(await screen.findByRole('heading', { name: 'My heat risk' })).toBeTruthy();
    expect(screen.getByText(/Cloth coveralls over a shirt lower your work limit to 138/)).toBeTruthy();
    expect(screen.getByText(/Your supervisor sees your band and action, never the reasons/)).toBeTruthy();
  });

  it('tells a worker to stop and reach shelter before recovery is confirmed', async () => {
    currentCase = await makeCase('heat_trigger', { issued: true }, []);
    await open('/worker/now', 'C05');
    expect(await screen.findByText('Stop heavy work')).toBeTruthy();
    expect(screen.queryByText('Work as briefed')).toBeNull();
    currentCase = await makeCase('heat_trigger', { issued: true, stopped: true }, []);
    await open('/worker/now', 'C05');
    expect(await screen.findByText('Go to shelter')).toBeTruthy();
    expect(screen.queryByText('Work as briefed')).toBeNull();
  });

  it('recognises a rostered worker before any instruction or plan', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/worker/now', 'C05');
    expect(await screen.findByText(/You are on the Dune civil crew/)).toBeTruthy();
    expect(screen.queryByText(/not on a shift today/)).toBeNull();
  });

  it('keeps only the worker’s approved plan after the latest capture becomes safety-only', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, assigned: true }, []);
    const assessed = structuredClone(currentCase.capture!);
    const ownResponse = structuredClone(assessed.response);
    ownResponse.crew_rest.intervals = ownResponse.crew_rest.intervals.filter(interval => interval.person_id === 'C05');
    expect(ownResponse.crew_rest.intervals.length).toBeGreaterThan(0);
    currentCase.capture!.response.crew_rest.intervals = [];
    currentCase.request!.snapshot.workers = currentCase.request!.snapshot.workers.filter(worker => worker.person_id === 'C05');
    currentCase.plan_assessment = { id: 'own-approved', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'approved', request: { ...assessed.request, snapshot: { ...assessed.request.snapshot, workers: assessed.request.snapshot.workers.filter(worker => worker.person_id === 'C05') } }, response: ownResponse };
    await open('/worker/my-plan', 'C05');
    expect(await screen.findByText('Work in plan')).toBeTruthy();
    expect(screen.queryByText(/C06/)).toBeNull();
  });

  it('withholds an expired worker plan until current observations support a new one', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, assigned: true }, []);
    const assessed = currentCase.capture!;
    currentCase.plan_assessment = { id: 'expired-plan', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'expired', request: assessed.request, response: assessed.response };
    await open('/worker/my-plan', 'C05');
    expect(await screen.findByText(/Current observations are needed for an updated plan/)).toBeTruthy();
    expect(screen.queryByText('Work in plan')).toBeNull();
  });

  it('records the full foreman headcount after one personal arrival', async () => {
    currentCase = await makeCase('heat_trigger', { stopped: true, checkedIn: true }, [task('recover', 'C01', 'ready')]);
    currentCase.headcount = { expected_count: 11, checked_in_count: 1, confirmed_count: 0, confirmed_at: null, arrivals: [{ person_id: 'C05', checked_in_at: currentCase.clock }] };
    await open('/site/headcount', 'C01');
    expect(await screen.findByText('1 / 11')).toBeTruthy();
    const confirm = await screen.findByRole('button', { name: /Confirm 11 workers accounted for/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /personally accounted for all affected workers/ }));
    await userEvent.click(confirm);
    await waitFor(() => expect(commands[0]?.action).toBe('recover'));
    expect(commands[0].payload.zone_id).toBe('shelter_a');
    expect(commands[0].payload.person_ids).toEqual(currentCase!.request!.snapshot.workers.map(w => w.person_id));
  });

  it('distinguishes a Welfare location from cooled recovery in the confirmed headcount', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, reported: true, removed: true }, [task('recover', 'C01', 'recorded')]);
    currentCase.headcount = { expected_count: 11, checked_in_count: 1, confirmed_count: 11, cooled_recovery_count: 10, welfare_count: 1, confirmed_at: currentCase.clock, arrivals: [{ person_id: 'C05', checked_in_at: currentCase.clock }] };
    await open('/site/headcount', 'C01');
    expect(await screen.findByText('10 cooled · 1 Welfare')).toBeTruthy();
    expect(screen.getByText('11 / 11')).toBeTruthy();
  });
});

describe('assessed workshop plan', () => {
  it('shows an actionable waiting state for a nullable assessment response', async () => {
    currentCase = await makeCase('heat_trigger', { stopped: true, recovered: true }, [task('activity', 'C01', 'ready')]);
    currentCase.plan_assessment = { id: null, assessed_at: null, observed_through: null, approval_deadline: null, status: 'awaiting_observations', request: null, response: null };
    await open('/site/proposal', 'C01');
    expect(await screen.findByText(/Current observed activity is needed for every active worker/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve assessed proposal' })).toBeNull();
  });

  it('keeps the return-to-recovery action visible if the new assessment is blocked', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, assigned: true }, [task('start_recovery', 'C01', 'ready')]);
    currentCase.request!.snapshot.workers[0].location_id = 'workshop';
    currentCase.plan_assessment = { id: null, assessed_at: null, observed_through: null, approval_deadline: null, status: 'blocked', request: null, response: null };
    await open('/site/proposal', 'C01');
    expect(await screen.findByText(/Current planning is blocked/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm work stopped and return to recovery' })).toBeTruthy();
  });
  it('binds approval to the current assessment and disables expired proposals', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true }, [task('assign', 'C01', 'ready')]);
    const capture = currentCase.capture!;
    currentCase.plan_assessment = { id: 'assessment-1', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'expired', request: capture.request, response: capture.response };
    const view = await open('/site/proposal', 'C01');
    expect((await screen.findByRole('button', { name: 'Approve assessed proposal' }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    currentCase.plan_assessment.status = 'proposed';
    currentCase.story.assigned = true;
    await open('/site/proposal', 'C01');
    await screen.findByRole('heading', { name: 'Proposal review' });
    expect(screen.getAllByText('Proposed').length).toBeGreaterThan(0);
    expect(screen.queryByText('✓ Assigned')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Approve assessed proposal' }));
    await waitFor(() => expect(commands[0]).toMatchObject({ action: 'assign', payload: { assessment_id: 'assessment-1' } }));
  });

  it('labels an expired assigned proposal as a previous snapshot', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, assigned: true }, [task('assign', 'C01', 'recorded')]);
    const capture = currentCase.capture!;
    currentCase.plan_assessment = { id: 'assessment-1', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'expired', request: capture.request, response: capture.response };
    await open('/site/proposal', 'C01');
    expect(await screen.findByText('This previous proposal is no longer current. Record fresh observations and recalculate.')).toBeTruthy();
    expect(screen.queryByText(/workers meet every requirement/)).toBeNull();
    expect(screen.getAllByText('Previous assignment').length).toBeGreaterThan(0);
    expect(screen.queryByText('✓ Assigned')).toBeNull();
  });

  it('keeps a new web proposal unassigned despite an older assignment', async () => {
    currentCase = await makeCase('incident_substitute', { assigned: true }, []);
    const capture = currentCase.capture!;
    currentCase.plan_assessment = { id: 'assessment-new', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'proposed', request: capture.request, response: capture.response };
    await open('/web/crew', 'C01');
    expect((await screen.findAllByText('Proposed')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Assigned')).toBeNull();
  });

  it('keeps the kiosk handoff with the foreman until this worker has an approved plan', async () => {
    currentCase = await makeCase('incident_substitute', { assigned: true }, []);
    const capture = currentCase.capture!;
    currentCase.plan_assessment = { id: 'assessment-new', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'proposed', request: capture.request, response: capture.response };
    await open('/kiosk/check-in', 'C05');
    expect(await screen.findByText('Follow foreman')).toBeTruthy();
    expect(screen.queryByText('Workshop')).toBeNull();
  });

  it('excludes Bilal from the workshop readiness count after his report', async () => {
    currentCase = await makeCase('incident_substitute', { reported: true }, []);
    currentCase.workers = currentCase.request!.snapshot.workers.map(worker => ({ person_id: worker.person_id, last_observed_at: null, readiness: ['C05', 'C06', 'C07', 'C08'].includes(worker.person_id) ? 'ready' : 'unconfirmed' }));
    await open('/site/readiness', 'C01');
    expect((await screen.findByText('Confirmed')).closest('.hs-metric')?.textContent).toContain('3');
    expect(screen.getAllByText('Unconfirmed')[0].closest('.hs-metric')?.textContent).toContain('7');
    expect(screen.getByText('1 excluded from workshop readiness')).toBeTruthy();
  });

  it('keeps Huda’s work-start confirmations through a poll and clears them for a new proposal', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, recovered: true, assigned: true }, [task('start_work', 'C01', 'ready')]);
    const capture = currentCase.capture!;
    currentCase.plan_assessment = { id: 'assessment-1', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'approved', request: capture.request, response: capture.response };
    await open('/site/proposal', 'C01');
    const user = userEvent.setup();
    const recovery = await screen.findByRole('checkbox', { name: 'I observed the required recovery through now.' }) as HTMLInputElement;
    const prerequisites = screen.getByRole('checkbox', { name: 'I confirmed workshop permit, resources, supervision and readiness.' }) as HTMLInputElement;
    await user.click(recovery); await user.click(prerequisites);
    currentCase.version++;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(recovery.checked).toBe(true); expect(prerequisites.checked).toBe(true);
    currentCase.plan_assessment = { ...currentCase.plan_assessment, id: 'assessment-2' };
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(recovery.checked).toBe(false); expect(prerequisites.checked).toBe(false);
  });

  it('requires Huda to choose the working group before recording their return to recovery', async () => {
    currentCase = await makeCase('incident_substitute', { stopped: true, assigned: true }, [task('start_recovery', 'C01', 'ready')]);
    const capture = currentCase.capture!;
    currentCase.request!.snapshot.workers[0].location_id = 'workshop';
    currentCase.request!.snapshot.workers[1].location_id = 'workshop';
    currentCase.plan_assessment = { id: 'assessment-1', assessed_at: currentCase.clock, observed_through: currentCase.clock, approval_deadline: currentCase.clock, status: 'approved', request: capture.request, response: capture.response };
    await open('/site/proposal', 'C01');
    const button = await screen.findByRole('button', { name: 'Confirm work stopped and return to recovery' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /C02/ }));
    await userEvent.click(button);
    await waitFor(() => expect(commands[0]).toMatchObject({ action: 'start_recovery', payload: { person_ids: ['C02'], zone_id: 'shelter_a', observed_work: true } }));
  });
});

describe('assistance', () => {
  it('records a fresh reading with the backend stamped time contract', async () => {
    currentCase = await makeCase('restart_ready', { stopped: true, removed: true, firstaid: true }, [task('fresh', 'P03', 'ready')]);
    await open('/site/fresh-reading', 'P03');
    await userEvent.click(await screen.findByRole('button', { name: 'Record fresh local reading' }));
    await waitFor(() => expect(commands[0]).toMatchObject({ action: 'fresh', payload: { measured_now: true, reading: { twl: 175, unit: 'W/m²', quality: 'valid' } } }));
    expect(commands[0].payload.reading).not.toHaveProperty('measured_now');
    expect(commands[0].payload.reading).not.toHaveProperty('measured_at');
    expect(commands[0].payload.reading).not.toHaveProperty('received_at');
  });

  it('keeps Bilal’s report time fixed as the case clock moves', async () => {
    const view = await makeCase('incident_substitute', { reported: true }, []);
    view.story.events = [{ id: 'report', actorId: 'C08', title: 'Bilal requested assistance', occurred_at: '2025-08-04T08:14:00+04:00' }];
    const foreman = PERSONAS.find(p => p.id === 'C01')!;
    const session = { caseView: view, person: foreman, busy: false } as CaseSession;
    const mounted = render(<ActionCardScreen session={session} />);
    expect(screen.getByText('Bilal (C08) · reported 08:14')).toBeTruthy();
    mounted.rerender(<ActionCardScreen session={{ ...session, caseView: { ...view, clock: '2025-08-04T08:15:00+04:00' } }} />);
    expect(screen.getByText('Bilal (C08) · reported 08:14')).toBeTruthy();
  });

  it('needs the typed word REMOVED before recording a removal', async () => {
    currentCase = await makeCase('removal_unconfirmed', { reported: true, assigned: true }, [task('incident_record', 'C01', 'recorded'), task('remove', 'C01', 'ready')]);
    await open('/site/action-card', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm Bilal removed from heat' }));
    const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/to confirm/), 'removed');
    await userEvent.click(confirm);
    await waitFor(() => expect(commands).toEqual([{ action: 'remove', payload: { location_id: 'welfare' } }]));
  });

  it('Bilal reports feeling unwell with press and hold', async () => {
    currentCase = await makeCase('canonical_timed', { assigned: true }, [task('report', 'C08', 'ready')]);
    await open('/worker/check-in', 'C08');
    await userEvent.click(await screen.findByRole('button', { name: 'I feel unwell' }));
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    const send = screen.getByRole('button', { name: /Send to my supervisor/ });
    fireEvent.keyDown(send, { key: ' ' });
    await waitFor(() => expect(commands).toEqual([{ action: 'report', payload: {} }]), { timeout: 2000 });
  });
});

describe('worker app languages', () => {
  it('mirrors the stop-work alert in Arabic', async () => {
    localStorage.setItem('hs-worker-lang:C05', 'ar');
    currentCase = await makeCase('heat_trigger', { issued: true }, []);
    const { container } = await open('/worker/alert', 'C05');
    await screen.findByRole('heading', { level: 1 });
    const frame = container.querySelector('.hs-worker')!;
    expect(frame.getAttribute('dir')).toBe('rtl');
    expect(frame.getAttribute('lang')).toBe('ar');
    localStorage.removeItem('hs-worker-lang:C05');
  });
});

describe('restart review', () => {
  it('lists all eight checks and keeps heavy work stopped', async () => {
    currentCase = await makeCase('restart_ready', { fresh: true, permit: true, removed: true, firstaid: true }, [task('review', 'P02', 'ready')]);
    await open('/web/restart-review', 'P02');
    expect(await screen.findByText('Crew readiness check')).toBeTruthy();
    expect(screen.getAllByRole('listitem').filter(li => /check|reading|removal|contact/i.test(li.textContent ?? '')).length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText(/stays stopped/)).toBeTruthy();
  });
});

describe('platform screens', () => {
  it('only the admin publishes branding, after typing PUBLISH', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    const view = await open('/web/settings', 'P02');
    expect(await screen.findByText(/No company palette yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /example palette/ })).toBeNull();
    view.unmount();
    await open('/web/branding', 'P09');
    await userEvent.click(await screen.findByRole('button', { name: /example palette/ }));
    const publish = await screen.findByRole('button', { name: 'Publish branding' }) as HTMLButtonElement;
    await waitFor(() => expect(publish.disabled).toBe(false));
    await userEvent.click(publish);
    await userEvent.type(screen.getByLabelText(/to confirm/), 'PUBLISH');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(brandCalls).toHaveLength(1));
    expect(brandCalls[0].confirm).toBe('PUBLISH');
    expect(await screen.findByText('Published version 1')).toBeTruthy();
  });

  it('keeps branding and people under admin settings at the end of the rail', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/settings', 'P09');
    expect(await screen.findByRole('heading', { name: 'Admin settings' })).toBeTruthy();
    expect(screen.getByText('Admin', { selector: '.hs-rail-group' })).toBeTruthy();
    // Branding is no longer its own rail entry; it is a section of admin settings.
    expect(screen.queryByRole('button', { name: 'Organisation branding' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Organisation branding' })).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'People and roles' }));
    expect(await screen.findByText(/Hessa Al Qamar · HSE systems admin/)).toBeTruthy();
    expect(screen.getByText(/not authentication/)).toBeTruthy();
  });

  it('saves worker consent on the server and lets the worker withdraw it', async () => {
    localStorage.setItem('hs-worker-lang:C05', 'en');
    currentCase = await makeCase('heat_trigger', {}, []);
    const view = await open('/worker/welcome', 'C05');
    await userEvent.click(await screen.findByRole('switch', { name: 'Check-ins' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save my choices' }));
    await waitFor(() => expect(consent.scopes).toEqual(['check_in', 'symptom_report']));
    view.unmount();
    await open('/worker/my-data', 'C05');
    const withdraw = await screen.findByRole('button', { name: /Withdraw consent/ });
    await waitFor(() => expect((withdraw as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(withdraw, { key: ' ' });
    await waitFor(() => expect(consent.scopes).toEqual([]), { timeout: 2000 });
    localStorage.removeItem('hs-worker-lang:C05');
  });

  it('shows the trust log to supervisors on system & trust', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/trust', 'P02');
    expect(await screen.findByText('Maya Al Qamar: stop-work')).toBeTruthy();
    // Nothing is applied on site by software: the solver shows as proposals only.
    expect(screen.getByText('Proposals only')).toBeTruthy();
  });

  it('filters the trust log by solver, people and agent', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    await open('/web/trust', 'P02');
    await screen.findByText('Maya Al Qamar: stop-work');
    await userEvent.click(screen.getByRole('button', { name: /^Agent · 1/ }));
    expect(screen.getByText(/what_if_crew_plan/)).toBeTruthy();
    expect(screen.queryByText('Maya Al Qamar: stop-work')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^People · 1/ }));
    expect(screen.getByText('Maya Al Qamar: stop-work')).toBeTruthy();
    expect(screen.queryByText(/what_if_crew_plan/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Solver · 1/ }));
    expect(screen.getByText('Solver run for case version 2')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^All · 3/ }));
    expect(screen.getByText('Maya Al Qamar: stop-work')).toBeTruthy();
  });

  it('shows the tools behind each agent answer and marks what-if results as hypothetical', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    chatHistory = [
      { id: 'q', author: 'user', text: 'What if Rana were unavailable?' },
      { id: 'q-answer', author: 'assistant', text: 'Draft: three workers instead of four.', tools: ['get_case', 'what_if_crew_plan'] },
    ];
    await open('/web/ask', 'P02');
    expect(await screen.findByText('Used: get_case, what_if_crew_plan', { exact: false })).toBeTruthy();
    expect(screen.getByText('Hypothetical · not recorded')).toBeTruthy();
  });
});

describe('offline worker actions', () => {
  it('discards a saved check-in when the presenter has reset to another case', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true, acknowledged: true, stopped: true }, [task('checkin', 'C05', 'ready')]);
    await open('/worker/shelter', 'C05');
    fireEvent.keyDown(await screen.findByRole('button', { name: /Check in at Shelter A/ }), { key: ' ' });
    await screen.findByText(/1 saved action waiting to send/);
    expect(readOutbox(outboxScope('C05'))[0].case_id).toBe('case-1');
    currentCase = { ...currentCase, case_id: 'case-2' };
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(readOutbox(outboxScope('C05'))).toHaveLength(0));
    expect(commands).toEqual([]);
    expect(await screen.findByText(/saved action from an earlier case discarded/)).toBeTruthy();
    online.mockRestore();
  });

  it('does not replay a saved action after a new access login', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true, acknowledged: true, stopped: true }, [task('checkin', 'C05', 'ready')]);
    await open('/worker/shelter', 'C05');
    fireEvent.keyDown(await screen.findByRole('button', { name: /Check in at Shelter A/ }), { key: ' ' });
    await screen.findByText(/1 saved action waiting to send/);
    const oldScope = outboxScope('C05');
    renewAccessGeneration();
    expect(outboxScope('C05')).not.toBe(oldScope);
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(readOutbox(outboxScope('C05'))).toHaveLength(0));
    expect(commands).toEqual([]);
    online.mockRestore();
  });

  it('retains the same-case queued action across a tab reload', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true, acknowledged: true, stopped: true }, [task('checkin', 'C05', 'ready')]);
    const view = await open('/worker/shelter', 'C05');
    fireEvent.keyDown(await screen.findByRole('button', { name: /Check in at Shelter A/ }), { key: ' ' });
    await screen.findByText(/1 saved action waiting to send/);
    const scope = outboxScope('C05');
    view.unmount();
    await open('/worker/shelter', 'C05');
    expect(await screen.findByText(/1 saved action waiting to send/)).toBeTruthy();
    expect(outboxScope('C05')).toBe(scope);
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(commands).toEqual([{ action: 'checkin', payload: {} }]));
    online.mockRestore();
  });

  it('queues a check-in without a network and sends it once when the network returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true, acknowledged: true, stopped: true }, [task('checkin', 'C05', 'ready')]);
    await open('/worker/shelter', 'C05');
    const hold = await screen.findByRole('button', { name: /Check in at Shelter A/ });
    fireEvent.keyDown(hold, { key: ' ' });
    expect(await screen.findByText(/1 saved action waiting to send/, {}, { timeout: 2000 })).toBeTruthy();
    expect(commands).toEqual([]);
    expect(readOutbox(outboxScope('C05'))).toHaveLength(1);
    const queuedId = readOutbox(outboxScope('C05'))[0].command_id;
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(commands).toEqual([{ action: 'checkin', payload: {} }]));
    expect(commandIds).toEqual([queuedId]);
    await waitFor(() => expect(readOutbox(outboxScope('C05'))).toHaveLength(0));
    online.mockRestore();
  });

  it('never queues supervisor decisions', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true }, [task('acknowledge', 'C01', 'ready')]);
    await open('/site/stop-work', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'acknowledge', payload: {} }]));
    expect(readOutbox(outboxScope('C01'))).toHaveLength(0);
    online.mockRestore();
  });
});

describe('voice and badges', () => {
  it('turns a spoken check-in into the fixed red-flag question; the words are not sent', async () => {
    class FakeRecognition {
      lang = ''; interimResults = false; continuous = false;
      onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
      onerror = null; onend: (() => void) | null = null;
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: 'I feel dizzy' }]] }); this.onend?.(); }, 0); }
      stop() {} abort() {}
    }
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    currentCase = await makeCase('canonical_timed', { assigned: true }, [task('report', 'C08', 'ready')]);
    await open('/worker/check-in', 'C08');
    fireEvent.keyDown(await screen.findByRole('button', { name: /Hold and speak/ }), { key: ' ' });
    expect(await screen.findByText('“I feel dizzy”')).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: 'I feel unwell' }).at(-1)!);
    expect(await screen.findByText(/Are you confused/)).toBeTruthy();
    expect(commands).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('checks a worker in from an NFC badge', async () => {
    let reader: { onreading: ((e: unknown) => void) | null } | undefined;
    class FakeReader { onreading: ((e: unknown) => void) | null = null; onreadingerror = null; constructor() { reader = this; } async scan() {} }
    vi.stubGlobal('NDEFReader', FakeReader);
    currentCase = await makeCase('heat_trigger', { stopped: true }, [task('checkin', 'C05', 'ready')]);
    await open('/kiosk/check-in', 'C05');
    await userEvent.click(await screen.findByRole('button', { name: 'Start NFC badge reader' }));
    await waitFor(() => expect(reader).toBeTruthy());
    reader!.onreading!({ message: { records: [{ recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode('c05').buffer) }] } });
    await waitFor(() => expect(commands).toEqual([{ action: 'checkin', payload: {} }]));
    vi.unstubAllGlobals();
  });
});

describe('crew photos and the account page', () => {
  it('shows each person’s photo beside their name and opens My account from the title bar', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('issue', 'P03', 'ready')]);
    const { container } = await open('/web/monitoring', 'P03');
    expect(await screen.findByRole('heading', { name: 'Squad Monitoring' })).toBeTruthy();
    // Issued photos are bundled; the photo is decorative because the name is written beside it.
    const maya = container.querySelector('.hs-bar [data-person="P03"]')!;
    expect(maya.getAttribute('aria-hidden')).toBe('true');
    expect(maya.querySelector('img')!.getAttribute('src')).toMatch(/P03.*\.webp/);
    await userEvent.click(screen.getByRole('button', { name: 'My account: Maya Al Qamar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Maya Al Qamar' })).toBeTruthy();
    expect(screen.getByText('Replace my photo')).toBeTruthy();
  });

  it('draws initials when someone has no photo yet', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    const { container } = await open('/web/account', 'P04');
    await screen.findByRole('heading', { level: 1, name: 'Tariq Al Safa' });
    // P04 has an issued photo; Lina (P07) does not, so a crew row would show "LQ".
    expect(container.querySelector('[data-person="P04"] img')).toBeTruthy();
    const { initialsOf, photoUrl } = await import('../people');
    expect(photoUrl('P07')).toBeNull();
    expect(initialsOf('P07')).toBe('LQ');
  });

  it('rejects a file that is not a photo and sends nothing', async () => {
    currentCase = null;
    await open('/worker/account', 'C05');
    await screen.findByRole('heading', { level: 1, name: 'Rana Al Nadir' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/JPEG, PNG or WebP/);
    expect(photoCalls).toEqual([]);
  });

  it('uploads, then removes, only the signed-in person’s own photo', async () => {
    const people = await import('../people');
    currentCase = null;
    await open('/site/account', 'C01');
    await screen.findByRole('heading', { level: 1, name: 'Huda Al Nadir' });
    await people.uploadOwnPhoto('C01', 'data:image/webp;base64,UklGRg==');
    expect(photoCalls).toEqual([{ method: 'PUT', image: 'data:image/webp;base64,UklGRg==' }]);
    await waitFor(() => expect(document.querySelector('[data-person="C01"] img')!.getAttribute('src')).toBe('data:image/webp;base64,UklGRg=='));
    await userEvent.click(await screen.findByRole('button', { name: 'Use issued photo' }));
    await waitFor(() => expect(photoCalls.at(-1)).toEqual({ method: 'DELETE', image: undefined }));
    expect(await screen.findByText('Back to the photo issued with your account.')).toBeTruthy();
  });

  it('loads uploaded photos with the tab header before using them as image data', async () => {
    photos = { C01: 'v1' };
    currentCase = null;
    await open('/site/account', 'C01');
    await waitFor(() => expect(document.querySelector('[data-person="C01"] img')?.getAttribute('src')).toBe('data:image/webp;base64,UklGRg=='));
    const calls = vi.mocked(fetch).mock.calls;
    const photo = calls.find(([path]) => String(path).startsWith('/api/people/C01/photo?v='));
    expect(photo?.[1]?.headers).toMatchObject({ 'X-Heat-Tab-ID': expect.any(String) });
  });
});

describe('actions without a wireframe screen', () => {
  it('Noura records the delivery draft from monitoring at /', async () => {
    currentCase = await makeCase('canonical_timed', { assigned: true }, [task('draftDelivery', 'P05', 'ready', 'Draft later delivery request')]);
    await open('/', 'P05');
    expect(await screen.findByRole('heading', { name: 'Squad Monitoring' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Draft later delivery request' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'draftDelivery', payload: {} }]));
  });
});
