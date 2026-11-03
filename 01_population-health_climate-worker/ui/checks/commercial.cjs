const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    const presenter = await context.newPage();
    await presenter.goto('http://127.0.0.1:5173/presenter');
    await presenter.locator('#scenario-select').selectOption('02_heat_alert_response');
    await presenter.locator('.presenter-control .control-actions button').first().click();
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')));
    assert.equal(before.state.task_status.civil_heavy, 'held');
    for (const [role, label] of [['C01', 'Raise cost concern'], ['P02', 'Route concern to Amal'], ['P01', 'Record receipt for review']]) {
      await page.getByLabel('Current view role').selectOption(role);
      await page.getByRole('button', { name: label }).click();
    }
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')));
    assert.equal(after.cursor, before.cursor);
    assert.deepEqual(after.state, before.state);
    assert.deepEqual(after.commercialConcern.entries.map(item => item.actorId), ['C01', 'P02', 'P01']);
    assert.match(await page.locator('.commercial-record').innerText(), /cost allocation not agreed/);
    await page.reload();
    assert.equal(await page.getByLabel('Current view role').inputValue(), 'P01');
    await page.getByRole('button', { name: 'Shift handover' }).click();
    const handover = await page.locator('.handover-commercial').innerText();
    for (const name of ['Huda', 'Rashid', 'Amal']) assert.ok(handover.includes(name));
    assert.match(handover, /No replay event confirms it was communicated or paid/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download handover' }).click()]);
    const summary = fs.readFileSync(await download.path(), 'utf8');
    assert.match(summary, /cost allocation not agreed/);
    assert.match(summary, /not payroll confirmation, compensable delay, or an approved claim/);
    console.log('COMMERCIAL PASS: role order, safety state unchanged, local record, handover and download');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
