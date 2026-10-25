const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name in mocks) return mocks[name];
    throw Error(`Unmocked import: ${name}`);
  } });
  return exports;
}
const cities = load('lib/usCities.ts');
const { citySuggestions } = load('components/CityCombobox.tsx', {
  react: {}, 'react/jsx-runtime': {}, '@/lib/usCities': cities,
});
test('city suggestions match case-insensitively, prioritize prefixes, and retain substring matches', () => {
  const matches = citySuggestions('  AN  ');
  assert.ok(matches.length > 1);
  assert.ok(matches[0].toLowerCase().startsWith('an'));
  const firstSubstring = matches.findIndex(city => !city.toLowerCase().startsWith('an'));
  assert.ok(firstSubstring > 0);
  assert.ok(matches.slice(firstSubstring).every(city => city.toLowerCase().includes('an') && !city.toLowerCase().startsWith('an')));
  assert.equal(new Set(matches).size, matches.length);
  assert.equal(citySuggestions('hOuStOn')[0], 'Houston, TX');
});
test('empty and unmatched city text have no dropdown suggestions', () => {
  assert.equal(citySuggestions('').length, 0);
  assert.equal(citySuggestions('   ').length, 0);
  assert.equal(citySuggestions('Unlisted Town, TX').length, 0);
});
