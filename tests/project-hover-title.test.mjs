import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/interactions/project-hover.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('export function readCargoProjectTitle'),source.indexOf('\nfunction isEditor'));
const context={};
vm.runInNewContext(helper.replace('export ','')+'\nthis.read=readCargoProjectTitle;',context);
test('native Cargo caption provides exact text, including punctuation and spacing',()=>{
  const caption={textContent:'Nothing — Playgrounds'};
  const host={querySelector:selector=>{assert.equal(selector,'.caption .page-title');return caption;}};
  assert.equal(context.read(host),'Nothing — Playgrounds');
  caption.textContent='  GitHub  Universe — 24\u00a0';
  assert.equal(context.read(host),caption.textContent);
});
test('late creation, renaming and removal never use obsolete configured titles',()=>{
  let caption=null;
  const host={querySelector:()=>caption,title:'Project 01 - Nothing'};
  assert.equal(context.read(host),'');
  caption={textContent:'Nothing — Playgrounds'};
  assert.equal(context.read(host),caption.textContent);
  caption.textContent='New Cargo Name';assert.equal(context.read(host),'New Cargo Name');
  caption=null;assert.equal(context.read(host),'');
  assert.doesNotMatch(source,/project\.title/);
  assert.match(source,/titleObserver\.observe\(host, \{ childList: true, subtree: true, characterData: true \}\)/);
  assert.match(source,/titleObserver\.disconnect\(\)/);
});
