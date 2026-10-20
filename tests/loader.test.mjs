import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/loader.js',import.meta.url),'utf8');
async function load({path='/',top='/',frame=null,editable=false,crossOrigin=false}={}) {
  const appended=[]; let fetches=0;
  const window={frameElement:frame?{id:frame}:null};
  Object.defineProperty(window,'top',{get(){if(crossOrigin)throw Error('cross origin');return {location:{pathname:top}};}});
  const document={currentScript:{src:'https://example.org/loader.js'},querySelector:()=>editable?{}:null,
    createElement:()=>({remove(){this.removed=true;}}),head:{append(node){appended.push(node);if(node.rel==='stylesheet')queueMicrotask(()=>node.onload());}}};
  const context={window,document,URL,Date,console,location:{pathname:path},fetch:async()=>{fetches++;return{ok:true,json:async()=>({release:'abcdef123456'})};}};
  vm.runInNewContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {appended,fetches};
}
test('published site loads normal CSS and main entry',async()=>{
  const r=await load(); assert.equal(r.fetches,1);
  assert.ok(r.appended[0].href.endsWith('/css/main.css'));
  assert.ok(r.appended[1].src.endsWith('/js/main.js'));
});
test('Cargo preview loads only passive lines, excluding hover/reveals/background entry',async()=>{
  const r=await load({top:'/edit/L3482832595',frame:'client-frame',editable:true});
  assert.equal(r.fetches,1);
  assert.ok(r.appended[0].href.endsWith('/css/decorations/anchored-lines.css'));
  assert.ok(r.appended[1].src.endsWith('/js/editor-decorations.js'));
  const editor=readFileSync(new URL('../js/editor-decorations.js',import.meta.url),'utf8');
  assert.ok(!/from ['"].*(?:main|hover|scroll-reveal|dot-grid)/.test(editor));
});
test('editor UI, unknown frames, unrelated editable pages and inaccessible embedding stay inert',async()=>{
  for(const options of [{path:'/edit/L3482832595',top:'/edit/L3482832595'},
    {top:'/edit/L3482832595',frame:'other'},{editable:true},{crossOrigin:true}]) {
    const r=await load(options); assert.equal(r.fetches,0); assert.equal(r.appended.length,0);
  }
});
