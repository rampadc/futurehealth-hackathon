import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { loadCase, type CaseId } from '../replay';
import { ADMIN, PERSONAS, initialStory, type StoryState } from '../story';
import type { CaseView, Task } from '../live';
import type { CrewRisk } from '../contract';
import { SCREENS } from './registry';

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
    // Branding is organisation-wide and does not need a case.
    for (const s of built.filter(x => x.device !== 'worker' && x.id !== 'settings')) {
      const view = await open(`/${s.device}/${s.id}`, s.personas[0]);
      expect(await screen.findByText(/There is no active case/)).toBeTruthy();
      view.unmount();
    }
  });
});

describe('stop-work', () => {
  it('Huda acknowledges from the site app', async () => {
    currentCase = await makeCase('heat_trigger', { issued: true }, [task('issue', 'P03', 'recorded'), task('acknowledge', 'C01', 'ready')]);
    await open('/site/stop-work', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'acknowledge', payload: {} }]));
  });

  it('only the owner can issue: Huda sees no enabled issue button on heat controls', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('issue', 'P03', 'ready')]);
    await open('/web/heat-controls', 'C01');
    const button = await screen.findByRole('button', { name: 'Issue stop-work instruction' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Maya Al Qamar records this \(P03\)/)).toBeTruthy();
  });

  it('shows replayed site conditions on heat controls without using them for clearance', async () => {
    currentCase = await makeCase('heat_trigger', {}, [task('issue', 'P03', 'ready')]);
    await open('/web/heat-controls', 'P03');
    expect(await screen.findByRole('heading', { name: 'Site conditions · ERA5 replay' })).toBeTruthy();
    expect(screen.getByText(/08:00 · TWL 127 W\/m² in sun · 167 in shade/)).toBeTruthy();
    expect(screen.getAllByText(/never clears a hold/).length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'TWL in sun by hour' }).querySelector('[aria-current="time"]')?.textContent).toContain('08:00');
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
    const table = await screen.findByRole('table', { name: 'Heat risk by worker' });
    const rows = [...table.querySelectorAll('tbody tr')].map(r => r.textContent ?? '');
    expect(rows[0]).toMatch(/C06.*Red.*20 min work/);
    expect(rows[2]).toMatch(/C07.*Amber/);
    expect(screen.getByText('Crew band Red · 3 of 3 at Amber or above')).toBeTruthy();
    expect(table.textContent).not.toMatch(/unwell|coverall|TWL/i);
  });

  it('never shows a faulty reading as low risk', async () => {
    currentCase = await makeCase('heat_trigger', {}, []);
    currentCase.request!.snapshot.readings[0] = { ...currentCase.request!.snapshot.readings[0], twl: 145, quality: 'invalid' };
    await open('/web/monitoring', 'P03');
    expect(await screen.findByText(/TWL 145 W\/m² · Unknown/)).toBeTruthy();
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

  it('records the headcount for every affected worker at Shelter A', async () => {
    currentCase = await makeCase('heat_trigger', { stopped: true, checkedIn: true }, [task('recover', 'C01', 'ready')]);
    await open('/site/headcount', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: /accounted for/ }));
    await waitFor(() => expect(commands[0]?.action).toBe('recover'));
    expect(commands[0].payload.zone_id).toBe('shelter_a');
    expect((commands[0].payload.person_ids as string[]).length).toBe(currentCase!.request!.snapshot.workers.length);
  });
});

describe('assistance', () => {
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
    expect(screen.getByText('None')).toBeTruthy();
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
  it('queues a check-in without a network and sends it once when the network returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true, acknowledged: true, stopped: true }, [task('checkin', 'C05', 'ready')]);
    await open('/worker/shelter', 'C05');
    const hold = await screen.findByRole('button', { name: /Check in at Shelter A/ });
    fireEvent.keyDown(hold, { key: ' ' });
    expect(await screen.findByText(/1 saved action waiting to send/, {}, { timeout: 2000 })).toBeTruthy();
    expect(commands).toEqual([]);
    expect(JSON.parse(localStorage.getItem('hs-outbox:C05')!)).toHaveLength(1);
    const queuedId = JSON.parse(localStorage.getItem('hs-outbox:C05')!)[0].command_id;
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(commands).toEqual([{ action: 'checkin', payload: {} }]));
    expect(commandIds).toEqual([queuedId]);
    await waitFor(() => expect(localStorage.getItem('hs-outbox:C05')).toBeNull());
    online.mockRestore();
  });

  it('never queues supervisor decisions', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    currentCase = await makeCase('heat_trigger', { issued: true }, [task('acknowledge', 'C01', 'ready')]);
    await open('/site/stop-work', 'C01');
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'acknowledge', payload: {} }]));
    expect(localStorage.getItem('hs-outbox:C01')).toBeNull();
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

describe('actions without a wireframe screen', () => {
  it('Noura records the delivery draft from monitoring at /', async () => {
    currentCase = await makeCase('canonical_timed', { assigned: true }, [task('draftDelivery', 'P05', 'ready', 'Draft later delivery request')]);
    await open('/', 'P05');
    expect(await screen.findByRole('heading', { name: 'Squad Monitoring' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Draft later delivery request' }));
    await waitFor(() => expect(commands).toEqual([{ action: 'draftDelivery', payload: {} }]));
  });
});
