// The invite-code input's rules are parameters: Hangout is WSP- plus 3 or 4 letters/digits, Travel is TRIP- plus 12 hex characters.
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{exports,RegExp});return exports;}
const lib=load('lib/inviteCodeInput.ts');
const {HANGOUT_CODE:H,TRAVEL_CODE:T,applyInviteInput,buildInviteCode,formatInviteSuffix,isCompleteInviteCode,normalizeInviteCode}=lib;

// Type or paste into the box the way the component does: the box shows `suffix`, and pending prefix letters are remembered.
function box(spec){let code=`${spec.prefix}-`,pending='',complete=false;
  const suffix=()=>code.startsWith(`${spec.prefix}-`)?code.slice(spec.prefix.length+1):'';
  const apply=(raw,pasted)=>{const r=applyInviteInput(spec,{suffix:suffix(),pending},raw,pasted);code=r.code;pending=r.pending;complete=r.complete;};
  return {type(chars){for(const ch of chars)apply(suffix()+ch,false);return this;},   // the box's new value after one keystroke
          typeFirst(chars){for(const ch of chars)apply(ch,false);return this;},        // keystrokes into an empty box
          paste(text){apply(text,true);return this;},
          backspaceAll(){pending='';code=`${spec.prefix}-`;complete=false;return this;},
          get code(){return code;},get complete(){return complete;},get pending(){return pending;}};}

test('Hangout is unchanged: WSP- plus 3 or 4 characters, W-S-P typed on its own is swallowed',()=>{
  assert.equal(box(H).typeFirst('WSP').code,'WSP-');
  assert.equal(box(H).typeFirst('wsp').code,'WSP-');
  const b=box(H).typeFirst('WSP').type('4K2');assert.equal(b.code,'WSP-4K2');assert.equal(b.complete,true);
  assert.equal(box(H).paste('wsp-4k2x').code,'WSP-4K2X');assert.equal(box(H).paste('4k2').code,'WSP-4K2');
  assert.equal(box(H).type('4K').complete,false);assert.equal(box(H).paste('4K2XY').code,'WSP-4K2X');
  assert.equal(buildInviteCode(''),'WSP-');assert.equal(isCompleteInviteCode('WSP-4K2'),true);assert.equal(normalizeInviteCode('wsp4k2'),'WSP-4K2');
});
test('Travel: the prefix is fixed, and the code is complete only at 12 hex characters',()=>{
  assert.equal(buildInviteCode('',T),'TRIP-');
  assert.equal(isCompleteInviteCode('TRIP-1CF10058900E',T),true);
  for(const bad of ['TRIP-','TRIP-1CF10058900','TRIP-1CF10058900EF','TRIP-1CF1005890GE','trip-1cf10058900e','WSP-1CF10058900E','TRIP1CF10058900E'])assert.equal(isCompleteInviteCode(bad,T),false,bad);
});
test('Travel: typing T, R, I, P on its own is swallowed, in any case',()=>{
  const b=box(T).typeFirst('TRIP');assert.equal(b.code,'TRIP-');assert.equal(b.complete,false);assert.equal(b.pending,'');
  assert.equal(box(T).typeFirst('trip').code,'TRIP-');
  assert.equal(box(T).typeFirst('T').code,'TRIP-');assert.equal(box(T).typeFirst('T').pending,'T');
  assert.equal(box(T).typeFirst('TR').pending,'TR');assert.equal(box(T).typeFirst('TRI').pending,'TRI');
  assert.equal(box(T).typeFirst('TRIP').pending,'');
});
test('Travel: after the swallowed prefix, hex characters fill the box one at a time',()=>{
  const b=box(T).typeFirst('TRIP');
  for(const ch of '1CF10058900'){b.type(ch);assert.equal(b.complete,false);}
  assert.equal(b.code,'TRIP-1CF10058900');
  b.type('E');assert.equal(b.code,'TRIP-1CF10058900E');assert.equal(b.complete,true);
  b.type('A');assert.equal(b.code,'TRIP-1CF10058900E','a 13th character is ignored');
});
test('Travel: typing hex straight away works, lower case is upper-cased, non-hex is dropped',()=>{
  assert.equal(box(T).type('1cf10058900e').code,'TRIP-1CF10058900E');
  assert.equal(box(T).type('1G2H3').code,'TRIP-123');
  assert.equal(box(T).type('!!').code,'TRIP-');
});
test('Travel: pasting a full code gives the full code, with or without the prefix, in any case or spacing',()=>{
  for(const pasted of ['TRIP-1CF10058900E','1cf10058900e','trip-1cf10058900e','TRIP1CF10058900E',' trip 1cf1 0058 900e ','1CF1-0058-900E']){
    const b=box(T).paste(pasted);assert.equal(b.code,'TRIP-1CF10058900E',pasted);assert.equal(b.complete,true,pasted);
  }
});
test('Travel: a paste never drops the code into the swallowed-prefix path',()=>{
  const b=box(T).typeFirst('TR').paste('1CF10058900E');assert.equal(b.code,'TRIP-1CF10058900E');assert.equal(b.pending,'');
  assert.equal(box(T).paste('TRIP').code,'TRIP-');
});
test('Travel: a code that is too long or has a non-hex character is not complete, and join normalization refuses it',()=>{
  assert.equal(box(T).paste('TRIP-1CF10058900EAB').complete,true,'a long paste is cut to 12 in the box');
  assert.equal(box(T).paste('TRIP-1CF10058900EAB').code,'TRIP-1CF10058900E');
  assert.equal(box(T).paste('TRIP-1CF1005890ZE').complete,false);
  assert.equal(normalizeInviteCode('1cf10058900e',T),'TRIP-1CF10058900E');assert.equal(normalizeInviteCode('TRIP-1CF10058900EAB',T),null);assert.equal(normalizeInviteCode('TRIP-1CF1005890ZE',T),null);
});
test('Travel: clearing the box resets the swallowed letters',()=>{
  const b=box(T).typeFirst('TR');b.backspaceAll();assert.equal(b.pending,'');assert.equal(b.type('1').code,'TRIP-1');
});
test('the two specs do not leak into each other',()=>{
  assert.equal(formatInviteSuffix('TRIP-1CF10058900E'),'TRIP1CF10058900E'.slice(0,4),'Hangout does not treat TRIP as a prefix');
  assert.equal(formatInviteSuffix('WSP-4K2',T),'42',"Travel keeps only hex characters (W, S, P and K are dropped)");
  assert.equal(isCompleteInviteCode('WSP-4K2',T),false);assert.equal(isCompleteInviteCode('TRIP-1CF10058900E'),false);
});
