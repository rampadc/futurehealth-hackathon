// Regenerates src/i18n/strings.json from ../ui_wireframes/i18n.js, the wireframe prototype's
// worker-facing strings. Run after the wireframe translations change:
//   node scripts/sync-wireframe-strings.mjs
// The wireframe file is a plain browser script; it is evaluated with a stub `App` and only
// its data (LANGS, PREF_LANG, STR) is kept. Translations are drafts that need native review.
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../../ui_wireframes/i18n.js', import.meta.url), 'utf8');
const data = new Function('App', `${source}\nreturn { LANGS, PREF_LANG, STR };`)({ f: {} });
const langs = data.LANGS.map(([code, endonym, english, dir, status]) => ({ code, endonym, english, dir, status }));
const out = { source: 'ui_wireframes/i18n.js', langs, preferred: data.PREF_LANG, strings: data.STR };
writeFileSync(new URL('../src/i18n/strings.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${langs.length} languages, ${Object.keys(data.STR.en).length} English keys.`);
