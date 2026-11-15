// Regenerates src/i18n/strings.json from ../ui_wireframes/i18n.js, the wireframe prototype's
// worker-facing strings. Run after the wireframe translations change:
//   node scripts/sync-wireframe-strings.mjs
//
// The wireframe file is a browser script. It is never executed: it is parsed with acorn and only
// literal data is read (the LANGS array, the PREF_LANG and STR objects, and
// `Object.assign(STR.<lang>, {...})` additions). Anything that is not a plain literal (a call,
// a variable, a template with expressions) stops the script with an error instead of running.
// Translations are drafts that need native-speaker review.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'acorn';

const source = readFileSync(new URL('../../ui_wireframes/i18n.js', import.meta.url), 'utf8');
const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });

/** Converts an AST node to a value, accepting only literals, arrays and plain objects. */
function literal(node, where) {
  switch (node.type) {
    case 'Literal':
      if (node.regex) break;
      return node.value;
    case 'TemplateLiteral':
      if (node.expressions.length) break;
      return node.quasis.map(q => q.value.cooked).join('');
    case 'ArrayExpression':
      return node.elements.map((element, i) => literal(element, `${where}[${i}]`));
    case 'ObjectExpression': {
      const out = {};
      for (const property of node.properties) {
        if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method) {
          throw new Error(`${where}: only plain object properties are allowed`);
        }
        const key = property.key.type === 'Identifier' ? property.key.name : literal(property.key, where);
        if (key === '__proto__') throw new Error(`${where}: __proto__ is not allowed`);
        out[key] = literal(property.value, `${where}.${key}`);
      }
      return out;
    }
  }
  throw new Error(`${where}: expected a literal value, found ${node.type}`);
}

const wanted = { LANGS: null, PREF_LANG: null, STR: null };
for (const statement of program.body) {
  if (statement.type === 'VariableDeclaration') {
    for (const declaration of statement.declarations) {
      if (declaration.id.type === 'Identifier' && declaration.id.name in wanted) {
        wanted[declaration.id.name] = literal(declaration.init, declaration.id.name);
      }
    }
  }
  // Object.assign(STR.<lang>, { ... }) adds keys to one language.
  const call = statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression' ? statement.expression : null;
  const isAssign = call?.callee.type === 'MemberExpression' && call.callee.object.name === 'Object' && call.callee.property.name === 'assign';
  const target = isAssign ? call.arguments[0] : null;
  if (target?.type === 'MemberExpression' && target.object.name === 'STR' && !target.computed && call.arguments.length === 2) {
    const lang = target.property.name;
    if (!wanted.STR?.[lang]) throw new Error(`Object.assign targets unknown language STR.${lang}`);
    Object.assign(wanted.STR[lang], literal(call.arguments[1], `STR.${lang}`));
  }
}
for (const [name, value] of Object.entries(wanted)) if (value === null) throw new Error(`${name} not found in ui_wireframes/i18n.js`);

const langs = wanted.LANGS.map(([code, endonym, english, dir, status]) => ({ code, endonym, english, dir, status }));
const out = { source: 'ui_wireframes/i18n.js', langs, preferred: wanted.PREF_LANG, strings: wanted.STR };
writeFileSync(new URL('../src/i18n/strings.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote ${langs.length} languages, ${Object.keys(wanted.STR.en).length} English keys.`);
