const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(process.env.SITE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Site & shift' }).click();

    const map = page.getByRole('group', { name: 'Select a site zone' });
    const timeline = page.getByLabel('Contractor work timeline');
    await map.locator('.so-zone').filter({ hasText: 'Electrical laydown' }).click();
    assert.equal(await map.locator('.so-zone').filter({ hasText: 'Electrical laydown' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await timeline.locator('[data-schedule-id="electrical_prep"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.getByLabel('Selected task').innerText(), /Cable tray prep[\s\S]*Copper Palm[\s\S]*People/);

    await timeline.locator('[data-schedule-id="civil_light"]').click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await map.locator('.so-zone').filter({ hasText: 'Civil trench' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await timeline.locator('[data-schedule-id="civil_light"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.getByLabel('Selected task').innerText(), /Supervised light work/);

    await map.locator('.so-zone').filter({ hasText: 'Recovery shelter A' }).click();
    assert.equal(await page.getByLabel('Selected task').count(), 0);
    assert.equal(await timeline.locator('[aria-pressed="true"]').count(), 0);

    await page.getByRole('group', { name: 'Filter schedule by contractor' }).getByRole('button', { name: 'Copper Palm' }).click();
    assert.equal(await map.locator('.so-zone').filter({ hasText: 'Electrical laydown' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await timeline.locator('[data-schedule-id="electrical_prep"]').getAttribute('aria-pressed'), 'true');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
