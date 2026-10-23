import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source=readFileSync(new URL('../js/interactions/overscroll-blend.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','');
function fixture({editor=false,enabled=true,previousColor=null}={}){
  const classes=new Set(),values=new Map(),timers=new Map(),frames=new Map(),listeners=[],changes=[];let next=0,now=0;
  const root={nodeType:1,scrollHeight:3000,classList:{add:v=>{if(!classes.has(v))changes.push('+'+v);classes.add(v);},remove:v=>{if(classes.has(v))changes.push('-'+v);classes.delete(v);},contains:v=>classes.has(v)},
    style:{getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
  function target(){const node=new EventTarget(),original=node.addEventListener.bind(node);node.addEventListener=(name,fn,options)=>{listeners.push({name,options});original(name,fn,options);};return node;}
  const window=Object.assign(target(),{scrollY:0,innerHeight:800,top:{location:{pathname:editor?'/edit/page':'/'}}});
  const navValues=new Map();const nav={style:{getPropertyValue:k=>navValues.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>navValues.set(k,v),removeProperty:k=>navValues.delete(k)}};
  const body={nodeType:1};const document=Object.assign(target(),{documentElement:root,body,scrollingElement:root,hidden:false,querySelector:()=>null,querySelectorAll:()=>[nav]});
  const context={window,document,performance:{now:()=>now},location:{pathname:editor?'/edit/page':'/'},AbortController,
    getComputedStyle:n=>({overflowY:n.overflowY||'visible',overscrollBehaviorY:n.overscrollBehaviorY||'auto',transitionProperty:'all',transitionDuration:'120ms',transitionTimingFunction:'ease-out',transitionDelay:'0s'}),
    requestAnimationFrame:cb=>{frames.set(++next,cb);return next;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:(cb,ms)=>{timers.set(++next,{cb,due:now+ms});return next;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(config.replace('ENABLE_OVERSCROLL_BLEND_WORKAROUND = true',`ENABLE_OVERSCROLL_BLEND_WORKAROUND = ${enabled}`)+source+
    '\nthis.mount=mountOverscrollBlendWorkaround;this.edge=overscrollEdge;this.motion=motionTransitions;',context);
  if(previousColor)values.set('--dan-overscroll-fallback-color',previousColor);
  const controller=context.mount();
  function emit(name,props={},on=window){const event=Object.assign(new Event(name),{composedPath:()=>[body,root],...props});on.dispatchEvent(event);return event;}
  function advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.due<=now){timers.delete(id);t.cb();}}
  function flush(){const batch=[...frames.values()];frames.clear();for(const cb of batch)cb();}
  return{changes,navValues,frames,flush,root,body,window,document,controller,context,classes,values,timers,listeners,emit,advance,
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
test('hysteresis retains inward recoil at both edges, exiting at 40px after the minimum or 650ms quiet',()=>{
  for(const [edgeY,outward,near,away] of [[0,-1,39,40],[2200,1,2161,2160]]){
    const f=fixture();f.window.scrollY=edgeY;f.wheel(outward*10);
    for(let i=0;i<30;i++){
      f.advance(30);f.wheel(i%2?outward:-outward);
      assert.equal(f.controller.active,true);
    }
    f.window.scrollY=near;f.emit('scroll');assert.equal(f.controller.active,true);
    f.window.scrollY=away;f.emit('scroll');assert.equal(f.controller.active,false);
    f.window.scrollY=edgeY;f.wheel(outward);f.advance(649);assert.equal(f.controller.active,true);
    f.advance(1);assert.equal(f.controller.active,false);
    f.emit('scroll');assert.equal(f.controller.active,false);
  }
});
test('touch supports outward/inward intent without cancellation; pinch and horizontal wheel are ignored',()=>{
  const f=fixture();f.emit('touchstart',{touches:[{clientY:100}]});
  f.emit('touchmove',{touches:[{clientY:120}]});assert.equal(f.controller.active,true);
  f.emit('touchmove',{touches:[{clientY:110}]});assert.equal(f.controller.active,true);
  f.window.scrollY=40;f.emit('scroll');f.advance(400);assert.equal(f.controller.active,false);
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
    assert.match(selectors,/html\.dan-overscroll-(?:blend|transition-guard)/);assert.match(selectors,/#I0367072328/);assert.match(selectors,/#S2531296503/);
  }
  assert.match(css,/mix-blend-mode: normal !important/);
  assert.match(css,/fill: currentColor/);assert.match(css,/stroke: currentColor/);assert.match(css,/:not\(\[fill="none"\]\)/);
  assert.doesNotMatch(css,/(?:opacity|position|width|height|overflow|overscroll-behavior)\s*:/);
  assert.doesNotMatch(source,/preventDefault|stopPropagation|setInterval/);
});

test('temporary color token restores its previous value without touching Cargo inline styles',()=>{
  const f=fixture({previousColor:'rgb(10, 20, 30)'});f.wheel(-10);
  assert.equal(f.values.get('--dan-overscroll-fallback-color'),'#111111');
  f.advance(650);assert.equal(f.values.get('--dan-overscroll-fallback-color'),'rgb(10, 20, 30)');
  assert.equal(f.root.classList.contains('dan-overscroll-blend'),false);
});

test('paint transition guard covers entry and exit, preserves motion timing, and releases after two frames',()=>{
  const f=fixture();f.wheel(-10);
  assert.ok(f.classes.has('dan-overscroll-blend'));assert.ok(f.classes.has('dan-overscroll-transition-guard'));
  const token=f.navValues.get('--dan-overscroll-motion-transition');
  assert.match(token,/transform 120ms ease-out 0s/);assert.match(token,/font-size 120ms ease-out 0s/);
  assert.doesNotMatch(token,/color|opacity|filter|mix-blend-mode/);
  f.window.scrollY=40;f.emit('scroll');f.advance(400);
  assert.equal(f.controller.active,false);assert.ok(f.classes.has('dan-overscroll-transition-guard'));
  f.flush();assert.ok(f.classes.has('dan-overscroll-transition-guard'));
  f.flush();assert.equal(f.classes.has('dan-overscroll-transition-guard'),false);
  assert.equal(f.navValues.size,0);assert.equal(f.frames.size,0);
});
test('reactivation cancels pending guard release; cleanup synchronously removes it',()=>{
  const f=fixture();f.wheel(-10);f.advance(650);f.flush();
  f.wheel(-10);f.flush();assert.ok(f.classes.has('dan-overscroll-transition-guard'));
  assert.equal(f.frames.size,0);assert.equal(f.controller.active,true);
  f.emit('blur');assert.equal(f.classes.size,0);assert.equal(f.navValues.size,0);assert.equal(f.frames.size,0);
});
test('explicit native transition lists retain their original duration/easing indices',()=>{
  const f=fixture();const result=f.context.motion({transitionProperty:'color, transform, opacity, width, filter',
    transitionDuration:'80ms, 300ms',transitionTimingFunction:'linear, cubic-bezier(0.22, 1, 0.36, 1)',transitionDelay:'0s, 10ms'});
  assert.equal(result,'transform 300ms cubic-bezier(0.22, 1, 0.36, 1) 10ms, width 300ms cubic-bezier(0.22, 1, 0.36, 1) 10ms');
});

test('fast retreat respects 400ms minimum, then restores without waiting 650ms',()=>{
  for(const [start,outward,retreat] of [[0,-1,100],[2200,1,2100]]){
    const f=fixture();f.window.scrollY=start;f.wheel(outward*500);
    f.advance(30);f.window.scrollY=retreat;f.emit('scroll');
    assert.equal(f.controller.active,true);assert.equal(f.timers.size,1);
    f.advance(369);assert.equal(f.controller.active,true);
    f.advance(1);assert.equal(f.controller.active,false);
  }
  const f=fixture();f.wheel(-500);f.advance(450);
  f.window.scrollY=100;f.emit('scroll');assert.equal(f.controller.active,false);
});
test('new boundary activity supersedes pending timer, including already queued stale callbacks',()=>{
  const f=fixture();f.wheel(-1000);
  const stale=[...f.timers.values()][0].cb;
  f.advance(600);f.wheel(-3000);assert.equal(f.timers.size,1);
  f.advance(50);stale();assert.equal(f.controller.active,true);
  f.advance(599);assert.equal(f.controller.active,true);
  f.advance(1);assert.equal(f.controller.active,false);
  assert.deepEqual(f.changes.filter(v=>v.endsWith('dan-overscroll-blend')),
    ['+dan-overscroll-blend','-dan-overscroll-blend']);
});
test('fast continuous alternating trackpad events keep one active state and one timer',()=>{
  for(const start of [0,2200]){
    const f=fixture();f.window.scrollY=start;f.wheel(start===0?-2000:2000);
    for(let i=0;i<120;i++){
      f.advance(8);f.wheel(i%2?5000:-5000);
      assert.equal(f.controller.active,true);assert.equal(f.timers.size,1);
    }
    assert.deepEqual(f.changes.filter(v=>v.endsWith('dan-overscroll-blend')),['+dan-overscroll-blend']);
    f.advance(649);assert.equal(f.controller.active,true);
    f.advance(1);assert.equal(f.controller.active,false);
  }
});
test('return to boundary cancels early-retreat restoration; navigation bypasses minimum and invalidates timers',()=>{
  const f=fixture();f.wheel(-2000);f.advance(50);
  f.window.scrollY=100;f.emit('scroll');const stale=[...f.timers.values()][0].cb;
  f.advance(300);f.window.scrollY=0;f.wheel(-1000);
  f.advance(50);stale();assert.equal(f.controller.active,true);
  f.emit('hashchange');assert.equal(f.controller.active,false);assert.equal(f.timers.size,0);
  stale();assert.equal(f.classes.size,0);
});
