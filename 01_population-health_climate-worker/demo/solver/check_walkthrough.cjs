const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
    const errors = [], remote = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith('http://127.0.0.1:8765/') && !request.url().startsWith('data:')) remote.push(request.url());
    });
    await page.goto('http://127.0.0.1:8765/walkthrough');
    assert.equal(await page.locator('h1').innerText(), 'Crew allocation and recovery after a heat hold');
    assert.deepEqual(await page.locator('#guide-article h2').allTextContents(), [
      'The four decisions the software supports',
      'Site responsibilities and the affected crew',
      'Heat alert, work stoppage and personnel accounting',
      'Workshop space and worker readiness',
      'Rules for choosing workers and planning their breaks',
      'Work and recovery during the next hour',
      "Bilal's symptom report and the revised crew plan",
      'Checks before a human restart decision',
    ]);
    assert.match(await page.locator('#solver-use').innerText(), /does not monitor the site by itself/);
    assert.match(await page.locator('#solver-use').innerText(), /Who|caller sends a new snapshot/i);
    const capture = await page.locator('#operational-data').evaluate(element => JSON.parse(element.textContent));
    const covered = new Set();
    for (const stage of ['hold','eligibility','schedule','incident','restart']) {
      const picker=page.locator(`#inline-${stage}-case`);
      for (const id of await picker.locator('option').evaluateAll(options => options.map(option => option.value))) {
        covered.add(id);
        await picker.selectOption(id);
        const shown=page.locator(`#inline-${stage}-result`);
        assert.match(await shown.innerText(), /Input facts/);
        assert.match(await shown.innerText(), /Decision and reason/);
        assert.match(await shown.innerText(), /Returned output/);
        assert.doesNotMatch(await shown.innerText(), /undefined|NaN/);
        const original=capture.cases.find(record => record.case_id===id).response;
        const excerpt=JSON.parse(await shown.locator('.inline-json pre').nth(1).textContent());
        if (excerpt.crew_rest) assert.deepEqual(excerpt.crew_rest.intervals,original.crew_rest.intervals);
        if (excerpt.restart) assert.equal(excerpt.restart.status,original.restart.status);
        if (excerpt.heat?.held_task_ids) assert.deepEqual(excerpt.heat.held_task_ids,original.heat.held_task_ids);
      }
    }
    assert.equal(covered.size,capture.cases.length);
    await page.locator('#inline-schedule-case').selectOption('alternate_timing_policy');
    assert.match(await page.locator('#inline-schedule-result').innerText(), /10 initial cooled minutes, at most 20 continuous work minutes/);
    assert.match(await page.locator('#inline-schedule-result table').innerText(), /08:14–08:34/);
    await page.locator('#inline-schedule button').click();
    await page.waitForFunction(() => document.querySelector('#inline-schedule [role="status"]').textContent.includes('HTTP 200'));
    const customPolicyResponse=JSON.parse(await page.locator('#inline-schedule-result .inline-json pre').nth(1).textContent());
    assert.equal(customPolicyResponse.crew_rest.policy_source,'supplied');
    assert.equal(customPolicyResponse.crew_rest.timing_policy.max_work_minutes,20);
    assert.ok(customPolicyResponse.crew_rest.intervals.some(row => row.person_id==='C05' && row.kind==='work' && row.starts_at.includes('08:14:00')));
    await page.locator('#inline-eligibility-case').selectOption('two_ready');
    assert.match(await page.locator('#inline-eligibility-result').innerText(), /confirmed not ready: 2/);
    await page.locator('#inline-eligibility button').click();
    await page.waitForFunction(() => document.querySelector('#inline-eligibility [role="status"]').textContent.includes('HTTP 200'));
    assert.match(await page.locator('#inline-eligibility-result').innerText(), /Current local API response/);
    await page.locator('#inline-incident-case').selectOption('incident_substitute');
    assert.match(await page.locator('#inline-incident-result').innerText(), /Leila \(C09\) 08:18–08:33/);
    await page.locator('#inline-incident-person').selectOption('C09');
    assert.match(await page.locator('#inline-incident-result table').innerText(), /08:18–08:33/);
    let releaseInline;
    const heldInline=new Promise(resolve => { releaseInline=resolve; });
    await page.route('**/v2/response-plans/solve',async route => { await heldInline; await route.continue().catch(() => {}); });
    await page.locator('#inline-eligibility button').click();
    await page.locator('#inline-eligibility-case').selectOption('no_supervision');
    releaseInline();
    await page.waitForFunction(() => !document.querySelector('#inline-eligibility button').disabled);
    assert.match(await page.locator('#inline-eligibility-result').innerText(), /Captured HTTP calculation/);
    assert.match(await page.locator('#inline-eligibility-result').innerText(), /0 useful worker-minutes/);
    await page.unroute('**/v2/response-plans/solve');
    assert.match(await page.locator('#schedule').innerText(), /one elapsed hour, not two/);
    assert.match(await page.locator('#incident').innerText(), /seven work minutes, leaving eight minutes/);
    assert.equal(await page.locator('#operational-evidence').evaluate(element => element.open), false);
    await page.locator('#story-result[data-assigned="4"]').waitFor();
    assert.equal(await page.locator('#story-result').getAttribute('data-recovery'), '7');
    assert.equal(await page.locator('#technical-appendix').evaluate(element => element.open), false);
    assert.match(await page.locator('#story-result').innerText(), /Rana/);
    await page.locator('#story-case').selectOption('two_ready');
    assert.equal(await page.locator('#story-result').getAttribute('data-assigned'), '2');
    await page.locator('#story-result .solver-trace > summary').click();
    assert.match(await page.locator('#story-result .solver-trace').innerText(), /2 also have confirmed readiness and availability/);
    assert.match(await page.locator('#story-result .solver-trace').innerText(), /Room limit: 4 free places/);
    await page.locator('#story-run').click();
    await page.waitForFunction(() => document.querySelector('#story-status').dataset.source === 'live');
    assert.equal(await page.locator('#story-result').getAttribute('data-assigned'), '2');
    await page.locator('#story-case').selectOption('permit_unavailable');
    await page.locator('#story-run').click();
    await page.waitForFunction(() => document.querySelector('#story-status').dataset.source === 'live');
    assert.equal(await page.locator('#story-result').getAttribute('data-assigned'), '0');
    await page.locator('#story-check').click();
    await page.waitForFunction(() => document.querySelector('#story-check-result').dataset.accepted === 'false');
    assert.equal(await page.locator('#technical-appendix').evaluate(element => element.open), false);
    await page.locator('#story-case').selectOption('symptom_substitute');
    await page.locator('#story-run').click();
    await page.waitForFunction(() => document.querySelector('#story-status').dataset.source === 'live');
    assert.equal(await page.locator('#story-result').getAttribute('data-assigned'), '4');
    assert.equal(await page.locator('#story-result').getAttribute('data-recovery'), '6');
    assert.equal(await page.locator('#story-result').getAttribute('data-unavailable'), '1');
    await page.locator('#story-case').selectOption('canonical');
    await page.locator('#technical-appendix > summary').click();
    await page.locator('#case-select option').nth(11).waitFor({ state: 'attached' });
    assert.equal(await page.locator('#case-rows tr').count(), 12);
    assert.equal(await page.locator('#case-select').inputValue(), 'canonical');
    const response = async () => JSON.parse(await page.locator('#response-json').innerText());
    assert.deepEqual((await response()).allocation.worker_ids, ['C05', 'C06', 'C07', 'C08']);

    const payload = JSON.parse(await page.locator('#request-json').inputValue());
    payload.workshop.staffing_demand.maximum = 2;
    await page.locator('#request-json').fill(JSON.stringify(payload));
    assert.equal(await page.locator('#response-json').innerText(), '');
    await page.locator('#run-input').click();
    await page.waitForFunction(() => document.querySelector('#response-status').textContent.includes('Live HTTP 200'));
    assert.deepEqual((await response()).allocation.worker_ids, ['C05', 'C06']);

    await page.locator('#case-select').selectOption('permit_unavailable');
    await page.locator('#run-input').click();
    await page.waitForFunction(() => document.querySelector('#response-status').textContent.includes('Live HTTP 200'));
    assert.deepEqual((await response()).allocation.worker_ids, []);

    await page.locator('#case-select').selectOption('whole_crew');
    await page.locator('#operation-select').selectOption('check');
    await page.locator('#run-input').click();
    await page.waitForFunction(() => document.querySelector('#response-status').textContent.includes('Live HTTP 200'));
    assert.equal((await response()).accepted, false);
    await page.locator('#operation-select').selectOption('solve');
    await page.locator('#run-input').click();
    await page.waitForFunction(() => document.querySelector('#response-status').textContent.includes('Live HTTP 200'));
    assert.deepEqual((await response()).allocation.worker_ids, ['C05', 'C06', 'C07', 'C08']);

    const invalid = JSON.parse(await page.locator('#request-json').inputValue());
    invalid.unrecognised_field = true;
    await page.locator('#request-json').fill(JSON.stringify(invalid));
    await page.locator('#run-input').click();
    await page.waitForFunction(() => document.querySelector('#response-status').textContent.includes('Live HTTP 422'));
    assert.equal((await response()).error.code, 'INVALID_REQUEST');

    await page.locator('#case-select').selectOption('canonical');
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/v1/allocations/solve', async route => { await held; await route.continue(); });
    await page.locator('#run-input').click();
    await page.waitForFunction(() => document.querySelector('#response-status').textContent.includes('pending'));
    await page.locator('#case-select').selectOption('permit_unavailable');
    release();
    await page.waitForFunction(() => !document.querySelector('#run-input').disabled);
    assert.deepEqual((await response()).allocation.worker_ids, []);
    assert.equal(await page.locator('#response-status').innerText(), 'Captured verified response');
    await page.unroute('**/v1/allocations/solve');

    await page.route('**/v1/allocations/solve', route => route.abort());
    await page.locator('#run-input').click();
    await page.waitForFunction(() => document.querySelector('#outcome-summary').textContent.includes('Live request failed'));
    assert.equal(await page.locator('#response-json').innerText(), '');
    await page.unroute('**/v1/allocations/solve');

    const operationalResponse = async () => JSON.parse(await page.locator('#operational-response').textContent());
    assert.ok(await page.locator('#operational-case option').count() > 0);
    assert.equal(await page.locator('#operational-case').inputValue(), 'canonical_timed');
    assert.equal((await operationalResponse()).crew_rest.useful_worker_minutes, 120);
    assert.match(await page.locator('#operational-result').innerText(), /08:11–08:26/);
    const canonicalOperational = await operationalResponse();
    const canonicalRequest = JSON.parse(await page.locator('#operational-request').textContent());
    await page.locator('#operational-evidence > summary').click();
    const walkthrough = await page.locator('#operational-walkthrough').innerText();
    assert.match(walkthrough, /08:00.*Heat-control evaluation/s);
    assert.match(walkthrough, /08:11.*Workshop allocation and timed planning/s);
    assert.match(walkthrough, /08:18.*Protective actions pending confirmation/s);
    assert.equal(canonicalOperational.crew_rest.intervals.filter(row => row.person_id === 'C05' && row.kind === 'work').length, 2);
    assert.equal(await page.locator('#operational-result .interval-table').count(), 3);
    assert.equal(await page.locator('#operational-person').inputValue(), 'C05');
    assert.equal(await page.locator('#operational-person option').count(), 11);
    assert.deepEqual(JSON.parse(await page.locator('.person-timeline pre').textContent()), canonicalOperational.crew_rest.intervals.filter(interval => interval.person_id === 'C05'));
    assert.match(await page.locator('.person-timeline').innerText(), /08:11–08:26/);
    await page.locator('#operational-person').selectOption('C08');
    assert.match(await page.locator('.person-timeline').innerText(), /Bilal|08:11–08:26/);
    const workMinutes = canonicalOperational.crew_rest.intervals.filter(row => row.kind === 'work').reduce((sum, row) => sum + (Date.parse(row.ends_at) - Date.parse(row.starts_at))/60000, 0);
    assert.equal(workMinutes, canonicalOperational.crew_rest.useful_worker_minutes);
    assert.equal(canonicalRequest.planning.horizon_minutes, 60);
    assert.equal(canonicalRequest.schema_version, '2.1');
    assert.equal(canonicalRequest.locations.find(location => location.id === canonicalRequest.task_locations.workshop_prep).capacity, 6);
    assert.deepEqual(canonicalRequest.locations.find(location => location.id === 'workshop').capabilities, ['light_work']);
    assert.equal(canonicalRequest.snapshot.zone_windows.find(window => window.zone_id === 'workshop').fixed_occupant_ids.length, 2);
    assert.match(await page.locator('#operational-result').innerText(), /Cooled preparation workshop.*6/s);
    const rana = canonicalRequest.snapshot.workers.find(worker => worker.person_id === 'C05');
    assert.equal(rana.readiness.status, 'ready');
    assert.equal(rana.readiness.task_id, 'workshop_prep');
    assert.equal(rana.readiness.confirmed_by, 'C01');
    assert.equal(rana.readiness.source, 'synthetic_fixture');
    assert.ok(rana.readiness.basis && rana.readiness.evidence_id && rana.readiness.valid_until);
    assert.equal(canonicalRequest.snapshot.workers.find(worker => worker.person_id === 'C09').readiness, null);
    const canonicalExcerpt = JSON.parse(await page.locator('#operational-walkthrough .operational-excerpt').nth(1).locator('pre').nth(1).textContent());
    assert.deepEqual(canonicalExcerpt.crew_rest.intervals, canonicalOperational.crew_rest.intervals.filter(interval => ['C05','C06','C07','C08'].includes(interval.person_id)));
    assert.match(walkthrough, /response\.crew_rest\.intervals/);
    assert.match(walkthrough, /removal.*unconfirmed/s);
    assert.match(walkthrough, /Replanning without a replacement/);
    assert.match(walkthrough, /Replanning with a confirmed replacement/);
    assert.match(await page.locator('#operational-result .metric-detail').innerText(), /120 useful worker-minutes/);
    assert.match(await page.locator('#operational-result .metric-detail').innerText(), /120 unmet/);
    await page.locator('#operational-case').selectOption('expired_readiness');
    assert.equal((await operationalResponse()).crew_rest.planning_status, 'recovery_only');
    assert.equal((await operationalResponse()).crew_rest.useful_worker_minutes, 0);
    assert.match(await page.locator('#operational-result').innerText(), /Expired \(recorded ready\)/);
    await page.locator('#operational-case').selectOption('incident_no_substitute');
    assert.equal((await operationalResponse()).crew_rest.useful_worker_minutes, 90);
    assert.equal(JSON.parse(await page.locator('#operational-request').textContent()).snapshot.workers.find(worker => worker.person_id === 'C09').readiness, null);
    assert.match(await page.locator('#operational-result .metric-detail').innerText(), /90 useful worker-minutes/);
    await page.locator('#operational-case').selectOption('incident_substitute');
    const incident = await operationalResponse();
    const incidentRequest = JSON.parse(await page.locator('#operational-request').textContent());
    assert.equal(incidentRequest.snapshot.incidents[0].person_id, 'C08');
    assert.deepEqual(incident.protective_response.excluded_worker_ids, ['C08']);
    assert.match(await page.locator('#operational-walkthrough').innerText(), /08:18–09:18/);
    assert.equal(incidentRequest.snapshot.workers.find(worker => worker.person_id === 'C09').readiness.confirmed_by, 'C01');
    assert.equal(incident.crew_rest.intervals.find(interval => interval.person_id === 'C05' && interval.kind === 'work').ends_at.slice(11,16), '08:26');
    await page.locator('#operational-person').selectOption('C09');
    assert.match(await page.locator('.person-timeline').innerText(), /Light work/);
    assert.deepEqual(JSON.parse(await page.locator('.person-timeline pre').textContent()), incident.crew_rest.intervals.filter(interval => interval.person_id === 'C09'));
    await page.locator('#operational-case').selectOption('removal_unconfirmed');
    assert.equal((await operationalResponse()).crew_rest.planning_status, 'blocked');
    assert.match(await page.locator('#operational-result').innerText(), /removal|first.aid/i);
    await page.locator('#operational-case').selectOption('canonical_timed');
    await page.locator('#operational-case').selectOption('eight_ready');
    const eight = await operationalResponse();
    assert.equal(eight.crew_rest.useful_worker_minutes, 240);
    assert.equal(JSON.parse(await page.locator('#operational-request').textContent()).snapshot.workers.filter(worker => worker.readiness?.status === 'ready').length, 8);
    assert.ok(eight.crew_rest.carry_forward_rest.some(rest => rest.earliest_rest_complete_at.includes('09:26:00')));
    await page.locator('#operational-case').selectOption('stop_unconfirmed');
    assert.notEqual((await operationalResponse()).crew_rest.planning_status, 'planned');
    assert.match(await page.locator('#operational-result').innerText(), /stop|cessation|confirm/i);
    await page.locator('#operational-case').selectOption('restart_ready');
    const restart = await operationalResponse();
    assert.equal(restart.restart.status, 'ready_for_human_review');
    assert.equal(restart.applied, false);
    assert.ok(restart.restart.held_task_ids.includes('civil_heavy'));
    await page.locator('#operational-case').selectOption('canonical_timed');
    await page.locator('#operational-run').click();
    await page.waitForFunction(() => document.querySelector('#operational-status').dataset.source === 'live');
    assert.equal((await operationalResponse()).crew_rest.useful_worker_minutes, 120);

    let releaseOperational;
    const heldOperational = new Promise(resolve => { releaseOperational = resolve; });
    await page.route('**/v2/response-plans/solve', async route => { await heldOperational; await route.continue(); });
    await page.locator('#operational-run').click();
    await page.waitForFunction(() => document.querySelector('#operational-status').dataset.source === 'pending');
    await page.locator('#operational-case').selectOption('eight_ready');
    releaseOperational();
    await page.waitForFunction(() => !document.querySelector('#operational-run').disabled);
    assert.equal(await page.locator('#operational-status').getAttribute('data-source'), 'captured');
    assert.equal((await operationalResponse()).crew_rest.useful_worker_minutes, 240);
    await page.unroute('**/v2/response-plans/solve');

    await page.locator('#case-select').selectOption('canonical');
    await page.locator('#technical-appendix > summary').click();
    await page.locator('#operational-evidence > summary').click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/heat-safe-walkthrough.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);

    const offline = await browser.newPage();
    await offline.goto(pathToFileURL(path.join(__dirname, 'walkthrough.html')).href);
    assert.equal(await offline.locator('#story-result').getAttribute('data-assigned'), '4');
    assert.equal(await offline.locator('#story-run').isDisabled(), true);
    await offline.locator('#technical-appendix > summary').click();
    assert.equal(await offline.locator('#case-rows tr').count(), 12);
    assert.equal(await offline.locator('#run-input').isDisabled(), true);
    assert.equal(await offline.locator('#operational-run').isDisabled(), true);
    for (const stage of ['hold','eligibility','schedule','incident','restart']) {
      assert.equal(await offline.locator(`#inline-${stage} button`).isDisabled(),true);
    }
    assert.equal(await offline.locator('#operational-case').inputValue(), 'canonical_timed');
    assert.equal(JSON.parse(await offline.locator('#operational-response').textContent()).crew_rest.useful_worker_minutes, 120);
    assert.deepEqual(JSON.parse(await offline.locator('#response-json').innerText()).allocation.worker_ids,
                     ['C05', 'C06', 'C07', 'C08']);
    console.log('PASS: v1 story and v2 operational captures, live calls, stale responses, mobile layout and offline reading');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
