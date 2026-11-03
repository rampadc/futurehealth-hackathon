const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  const errors = [], remote = [];
  context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  context.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5173') && !request.url().startsWith('data:')) remote.push(request.url()); });
  await page.goto('http://127.0.0.1:5173');
  assert.equal(await page.getByRole('button', {name: 'Scenario library'}).count(), 0);
  assert.equal(await page.getByText('All cases', {exact: true}).count(), 0);
  await page.getByRole('button', {name: 'Open active case'}).click();
  await page.getByRole('heading', {name: 'Response desk'}).waitFor();
  await page.getByRole('button', {name: 'Policies & sources', exact: true}).click();
  await page.locator('.policy-card').first().click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', {name: 'Workflow detail', exact: true}).click();
  assert.equal(await page.getByLabel('Select workflow').count(), 0);
  await page.getByText('Current incident ·').waitFor();
  await page.locator('.react-flow__node').first().click();
  assert.ok(await page.locator('.react-flow__node').count() > 0);

  const presenter = await context.newPage();
  await presenter.goto('http://127.0.0.1:5173/presenter');
  await presenter.getByRole('button', {name: 'Scenario library'}).click();
  await presenter.getByRole('heading', {name: 'Scenario library'}).waitFor();
  assert.equal(await presenter.locator('.case-item').count(), 10);
  await presenter.getByRole('button', {name: 'Presenter console'}).click();
  const ids = await presenter.locator('#scenario-select option').evaluateAll(options => options.map(option => option.value));
  for (const id of ids) {
    await presenter.locator('#scenario-select').selectOption(id);
    for (let attempt = 0; attempt < 18; attempt++) {
      if ((await presenter.locator('.current-event .eyebrow').innerText()).includes('CASE COMPLETE')) break;
      const pending = await presenter.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')).pendingEvent);
      if (pending) await presenter.getByLabel('Acting as').selectOption(pending.actor_id);
      await presenter.locator('.presenter-control .control-actions button').first().click();
      if (attempt === 17) throw Error(`Scenario did not complete: ${id}`);
    }
    assert.ok((await presenter.locator('.current-event .eyebrow').innerText()).includes('CASE COMPLETE'));
    console.log('REPLAY', id);
  }
  await page.getByRole('button', {name: 'Response desk', exact: true}).click();
  await page.waitForTimeout(100);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')));
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sandline-heat-safe-v1')).cursor), state.cursor);
  await page.setViewportSize({width: 900, height: 1100});
  await page.screenshot({path: '/tmp/heat-tablet.png', fullPage: true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  console.log(JSON.stringify({errors, remote, refresh: true, scenarios: ids.length}));
  await browser.close();
})();
