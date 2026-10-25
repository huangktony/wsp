const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const availability = require('../lib/availability.ts');
const walk = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(walk) : [n,...walk(n.props?.children)];
const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
function fixture(value = []) {
  let cursor = 0; const states = [], changes = [];
  const exports = {};
  const mocks = {
    react: { useRef: () => ({ current:null }), useEffect() {}, useState(initial) { const i=cursor++; if (!(i in states)) states[i]=initial; return [states[i],v => { states[i]=typeof v==='function'?v(states[i]):v; }]; } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/availability': availability,
    './AvailabilityRange': { AvailabilityRange: 'range-slider' },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/AvailabilityPicker.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>mocks[n]});
  const render = () => { cursor=0; return exports.AvailabilityPicker({value,onChange:v=>changes.push(v)}); };
  return { render,changes };
}
test('sheet preselects saved times; Cancel discards edits; Done applies only local form changes', () => {
  const date=availability.addDays(availability.dateKey(),1);
  const saved=[`${date} evening`]; const f=fixture(saved); let tree=f.render();
  const button = label => walk(tree).find(n=>n.type==='button'&&text(n)===label);
  button('Edit availability').props.onClick(); tree=f.render();
  // Move to tomorrow's month when testing on the last day of a month.
  if (!walk(tree).some(n=>n.props?.['data-date']===date)) { walk(tree).find(n=>n.props?.['aria-label']==='Next month').props.onClick(); tree=f.render(); }
  const day=()=>walk(tree).find(n=>n.props?.['data-date']===date);
  assert.equal(day().props['aria-pressed'],true);
  const slider=()=>walk(tree).find(n=>n.type==='range-slider');
  assert.deepEqual(JSON.parse(JSON.stringify(slider().props.value)),{start:1020,end:1260});
  slider().props.onChange({start:1080,end:1290}); tree=f.render();
  button('Cancel').props.onClick(); assert.equal(f.changes.length,0);
  button('Edit availability').props.onClick(); tree=f.render();
  assert.equal(slider().props.value.start,1020);
  button('Morning').props.onClick(); tree=f.render();
  assert.equal(button('Done').props.disabled,false);
  button('Done').props.onClick();
  assert.deepEqual(Array.from(f.changes[0]),[`${date} 540-720`]);
  assert.deepEqual(saved,[`${date} evening`]);
});
test('calendar disables dates outside the window and Escape uses the cancel path', () => {
  const f=fixture(); let tree=f.render();
  walk(tree).find(n=>n.type==='button'&&text(n)==='Add availability').props.onClick(); tree=f.render();
  const cells=walk(tree).filter(n=>n.props?.['data-date']);
  for (const day of cells) assert.equal(day.props.disabled,!availability.selectableDay(day.props['data-date']));
  const disabled=cells.find(n=>n.props.disabled);
  if (disabled) { disabled.props.onClick(); tree=f.render(); assert.equal(walk(tree).find(n=>n.props?.['data-date']===disabled.props['data-date']).props['aria-pressed'],false); }
  const dialog=walk(tree).find(n=>n.type==='dialog');
  assert.equal(dialog.props['aria-modal'],'true'); assert.equal(dialog.props.role,'dialog');
  dialog.props.onCancel({preventDefault(){}}); assert.equal(f.changes.length,0);
});
