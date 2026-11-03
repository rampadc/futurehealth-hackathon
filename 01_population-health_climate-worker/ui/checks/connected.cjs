const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const context = await browser.newContext();
  const workspace = await context.newPage();
  await workspace.goto('http://127.0.0.1:5173');
  const presenter = await context.newPage();
  await presenter.goto('http://127.0.0.1:5173/presenter');
  await presenter.locator('#scenario-select').selectOption('02_heat_alert_response');
  await presenter.locator('.control-actions button').first().click(); // Local reading: automatic rule holds the task.
  await presenter.locator('.control-actions button').first().click(); // Stage Maya's action.
  await presenter.getByLabel('Acting as').selectOption('C13');
  assert.equal(await presenter.locator('.control-actions button').first().isDisabled(), true);
  assert.equal(await presenter.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')).cursor), 1);

  for (let chapter = 0; chapter < 4; chapter++) {
    for (let attempt = 0; attempt < 18; attempt++) {
      if ((await presenter.locator('.current-event .eyebrow').innerText()).includes('CASE COMPLETE')) break;
      const pending = await presenter.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')).pendingEvent);
      if (pending) await presenter.getByLabel('Acting as').selectOption(pending.actor_id);
      await presenter.locator('.control-actions button').first().click();
      if (attempt === 17) throw Error(`Connected chapter ${chapter} did not complete`);
    }
    if (chapter < 3) await presenter.getByRole('button', {name: 'Load next connected case'}).click();
  }
  const session = await presenter.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')));
  assert.equal(session.state.occupancy.workshop.length, 6);
  assert.equal(session.state.occupancy.shelter_a.length, 7);
  assert.equal(session.state.delivery.status, 'confirmed');
  assert.equal(session.state.delivery.slot, '2025-08-04T15:30:00+04:00');
  assert.ok(session.state.open_items.length > 0);
  assert.ok(session.activityLog.length > 4);
  assert.ok(session.activityLog.some(item => item.kind === 'transition'));
  await workspace.waitForTimeout(200);
  assert.ok((await workspace.locator('body').innerText()).includes('Response desk'));
  console.log('CONNECTED PASS', session.state.delivery.status, session.state.open_items);
  await browser.close();
})();
