import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source=readFileSync(new URL('../js/interactions/overscroll-blend.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','');
function fixture({editor=false,enabled=true,previousColor=null}={}){
  const classes=new Set(),values=new Map(),timers=new Map(),listeners=[];let next=0,now=0;
  const root={nodeType:1,scrollHeight:3000,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
    style:{getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
  function target(){const node=new EventTarget(),original=node.addEventListener.bind(node);node.addEventListener=(name,fn,options)=>{listeners.push({name,options});original(name,fn,options);};return node;}
  const window=Object.assign(target(),{scrollY:0,innerHeight:800,top:{location:{pathname:editor?'/edit/page':'/'}}});
  const body={nodeType:1};const document=Object.assign(target(),{documentElement:root,body,scrollingElement:root,hidden:false,querySelector:()=>null});
  const context={window,document,location:{pathname:editor?'/edit/page':'/'},AbortController,
    getComputedStyle:n=>({overflowY:n.overflowY||'visible',overscrollBehaviorY:n.overscrollBehaviorY||'auto'}),
    setTimeout:(cb,ms)=>{timers.set(++next,{cb,due:now+ms});return next;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(config.replace('ENABLE_OVERSCROLL_BLEND_WORKAROUND = true',`ENABLE_OVERSCROLL_BLEND_WORKAROUND = ${enabled}`)+source+
    '\nthis.mount=mountOverscrollBlendWorkaround;this.edge=overscrollEdge;',context);
  if(previousColor)values.set('--dan-overscroll-fallback-color',previousColor);
  const controller=context.mount();
  function emit(name,props={},on=window){const event=Object.assign(new Event(name),{composedPath:()=>[body,root],...props});on.dispatchEvent(event);return event;}
  function advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.due<=now){timers.delete(id);t.cb();}}
  return{root,body,window,document,controller,context,classes,values,timers,listeners,emit,advance,
    wheel:(deltaY,props={})=>emit('wheel',{deltaY,deltaX:0,ctrlKey:false,...props})};
}
test('resting at either edge and ordinary scrolling never override blending',()=>{
  const f=fixture();f.emit('scroll');assert.equal(f.controller.active,false);
  f.window.scrollY=2200;f.emit('scroll');assert.equal(f.controller.active,false);
  f.window.scrollY=1000;f.wheel(-50);f.wheel(50);assert.equal(f.controller.active,false);
  f.window.scrollY=0;f.wheel(30);assert.equal(f.controller.active,false);
});
test('outward intent at both boundaries activates, including elastic coordinates and tolerance',()=>{
  for(const [y,delta] of [[0,-1],[1.5,-20],[-12,-10],[2200,10],[2199,20],[2230,15]]){
    const f=fixture();f.window.scrollY=y;const event=f.wheel(delta);
    assert.equal(f.controller.active,true);assert.ok(f.classes.has('dan-overscroll-blend'));
    assert.equal(f.values.get('--dan-overscroll-fallback-color'),'#111111');
    assert.equal(event.defaultPrevented,false);assert.equal(f.timers.size,1);
  }
});
test('inward intent and interior motion restore immediately; settle extends on boundary activity',()=>{
  const f=fixture();f.wheel(-20);f.advance(150);f.wheel(-3);f.advance(150);
  assert.equal(f.controller.active,true);f.advance(50);assert.equal(f.controller.active,false);
  assert.equal(f.values.has('--dan-overscroll-fallback-color'),false);
  f.wheel(-10);f.wheel(1);assert.equal(f.controller.active,false);
  f.window.scrollY=2200;f.wheel(10);f.wheel(-1);assert.equal(f.controller.active,false);
  f.window.scrollY=0;f.wheel(-10);f.window.scrollY=10;f.emit('scroll');assert.equal(f.controller.active,false);
  f.window.scrollY=-10;f.wheel(-1);f.advance(190);f.emit('scroll');f.advance(190);
  assert.equal(f.controller.active,true);f.advance(10);assert.equal(f.controller.active,false);
});
test('touch supports outward/inward intent without cancellation; pinch and horizontal wheel are ignored',()=>{
  const f=fixture();f.emit('touchstart',{touches:[{clientY:100}]});
  f.emit('touchmove',{touches:[{clientY:120}]});assert.equal(f.controller.active,true);
  f.emit('touchmove',{touches:[{clientY:110}]});assert.equal(f.controller.active,false);
  f.wheel(-10,{ctrlKey:true});f.wheel(-2,{deltaX:20});assert.equal(f.controller.active,false);
  f.emit('touchmove',{touches:[{},{}]});assert.equal(f.controller.active,false);
});
test('nested scroll panels consume their own intent without affecting root navigation',()=>{
  const f=fixture();const panel={nodeType:1,scrollHeight:500,clientHeight:200,scrollTop:50,overflowY:'auto'};
  f.wheel(-20,{composedPath:()=>[panel,f.body,f.root]});assert.equal(f.controller.active,false);
  panel.scrollTop=0;panel.overscrollBehaviorY='contain';
  f.wheel(-20,{composedPath:()=>[panel,f.body,f.root]});assert.equal(f.controller.active,false);
  panel.overscrollBehaviorY='auto';f.wheel(-20,{composedPath:()=>[panel,f.body,f.root]});assert.equal(f.controller.active,true);
});
test('navigation, focus, visibility, disable and teardown clear owned state and timers',()=>{
  const f=fixture();
  for(const name of ['hashchange','popstate','pagehide','pageshow','blur','resize']){
    f.wheel(-10);f.emit(name);assert.equal(f.controller.active,false);
  }
  f.wheel(-10);f.emit('click',{composedPath:()=>[{tagName:'A',hasAttribute:()=>true}]},f.document);
  assert.equal(f.controller.active,false);
  f.wheel(-10);f.document.hidden=true;f.emit('visibilitychange',{},f.document);assert.equal(f.controller.active,false);
  f.controller.setEnabled(false);f.wheel(-10);assert.equal(f.controller.active,false);
  f.controller.setEnabled(true);f.wheel(-10);assert.equal(f.controller.active,true);
  assert.ok(f.listeners.every(l=>l.options.passive===true));
  f.controller.destroy();f.wheel(-10);assert.equal(f.classes.size,0);assert.equal(f.timers.size,0);
});
test('editor and configuration-disabled mode attach no workaround',()=>{
  for(const options of [{editor:true},{enabled:false}]){
    const f=fixture(options);f.wheel(-10);assert.equal(f.classes.size,0);assert.equal(f.listeners.length,0);
  }
});
test('CSS changes only known navigation blending/colors and preserves unpainted SVG shapes',()=>{
  const css=readFileSync(new URL('../css/interactions/overscroll-blend.css',import.meta.url),'utf8');
  const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').filter(r=>r.trim());
  for(const rule of rules){const selectors=rule.split('{')[0];
    assert.match(selectors,/html\.dan-overscroll-blend/);assert.match(selectors,/#I0367072328/);assert.match(selectors,/#S2531296503/);
  }
  assert.match(css,/mix-blend-mode: normal !important/);
  assert.match(css,/fill: currentColor/);assert.match(css,/stroke: currentColor/);assert.match(css,/:not\(\[fill="none"\]\)/);
  assert.doesNotMatch(css,/(?:opacity|position|width|height|overflow|overscroll-behavior)\s*:/);
  assert.doesNotMatch(source,/preventDefault|stopPropagation|requestAnimationFrame|setInterval/);
});

test('temporary color token restores its previous value without touching Cargo inline styles',()=>{
  const f=fixture({previousColor:'rgb(10, 20, 30)'});f.wheel(-10);
  assert.equal(f.values.get('--dan-overscroll-fallback-color'),'#111111');
  f.advance(200);assert.equal(f.values.get('--dan-overscroll-fallback-color'),'rgb(10, 20, 30)');
  assert.equal(f.root.classList.contains('dan-overscroll-blend'),false);
});
