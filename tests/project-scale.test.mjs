import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source=readFileSync(new URL('../js/interactions/project-scale.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','')+'\nthis.mount=mountProjectScale;this.corner=closestCorner;';
function fixture({editor=false,fine=true,reduced=false}={}) {
  let next=0;const frames=new Map();let mutation;
  const capable=Object.assign(new EventTarget(),{matches:fine});
  const motion=Object.assign(new EventTarget(),{matches:reduced});
  function style(){const values=new Map([['transform','translate(20px,40px)'],['width','300px']]);return{
    values,getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',
    setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k),
  };}
  const hosts=Array.from({length:3},(_,i)=>{
    const rect={left:i*400,top:i*200,width:300,height:150};
    const link=Object.assign(new EventTarget(),{isConnected:true,getBoundingClientRect:()=>({...rect})});
    const media={isConnected:true}; const attrs=new Map([['href',`#p${i}`],['freeform-x',String(i*25)]]);
    return {link,rect,media,attrs,style:style(),isConnected:true,
      shadowRoot:{querySelector:s=>s.startsWith('a[')?link:media},
      querySelector:()=>null,matches:()=>attrs.has('href'),
      setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
    };
  });
  const page={style:style(),contains:h=>hosts.includes(h)&&h.isConnected,querySelectorAll:()=>hosts.filter(h=>h.isConnected)};
  const win=Object.assign(new EventTarget(),{top:{location:{pathname:editor?'/edit/home':'/'}}});
  const doc=Object.assign(new EventTarget(),{documentElement:{},getElementById:()=>page,querySelector:()=>null});
  const ctx={window:win,document:doc,location:{pathname:editor?'/edit/home':'/'},console,
    matchMedia:q=>q.includes('reduced')?motion:capable,
    getComputedStyle:()=>({scale:'none',transition:'opacity 0.2s'}),
    MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){}},
    customElements:{whenDefined:()=>new Promise(()=>{})},
    requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),
  };
  vm.runInNewContext(config+source,ctx);const instance=ctx.mount();
  const flush=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());};flush();
  const pointer=(index,type,pointerType='mouse')=>hosts[index].link.dispatchEvent(Object.assign(new Event(type),{pointerType}));
  return {hosts,page,doc,win,capable,motion,instance,flush,pointer,corner:ctx.corner,mutation:()=>mutation([]),states:()=>hosts.map(h=>h.attrs.get('data-dan-scale-state'))};
}
test('A-to-B hover applies simultaneous active/other states without a normal-state flash',()=>{
  const f=fixture(); assert.deepEqual(f.states(),['normal','normal','normal']);
  f.pointer(0,'pointerenter'); assert.deepEqual(f.states(),['active','other','other']);
  f.pointer(0,'pointerleave'); f.pointer(1,'pointerenter'); f.flush();
  assert.deepEqual(f.states(),['other','active','other']);
  f.pointer(1,'pointerleave');f.flush();assert.deepEqual(f.states(),['normal','normal','normal']);
  assert.equal(f.page.style.getPropertyValue('--dan-scale-hover'),'1.05');
  assert.equal(f.page.style.getPropertyValue('--dan-scale-others'),'0.95');
  assert.equal(f.page.style.getPropertyValue('--dan-scale-duration'),'300ms');
});
test('editor, reduced motion and unavailable hover support never enable scaling',()=>{
  for(const options of [{editor:true},{reduced:true},{fine:false}]){
    const f=fixture(options);assert.equal(f.instance.count,0);f.pointer(0,'pointerenter');
    assert.ok(f.states().every(s=>s===undefined));
  }
});
test('touch, window blur and changing accessibility preferences clear focus state',()=>{
  const f=fixture();f.pointer(0,'pointerenter');
  f.doc.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerType:'touch'}));
  assert.deepEqual(f.states(),['normal','normal','normal']);
  f.pointer(1,'pointerenter');f.win.dispatchEvent(new Event('blur'));
  assert.deepEqual(f.states(),['normal','normal','normal']);
  f.pointer(2,'pointerenter');f.motion.matches=true;f.motion.dispatchEvent(new Event('change'));
  assert.equal(f.instance.count,0);assert.ok(f.states().every(s=>s===undefined));
});
test('removal and teardown preserve native transforms, dimensions, attributes and links',()=>{
  const f=fixture();f.pointer(0,'pointerenter');f.hosts[0].isConnected=false;f.mutation();f.flush();
  assert.equal(f.instance.count,2);assert.equal(f.hosts[1].attrs.get('data-dan-scale-state'),'normal');
  f.instance.destroy();f.pointer(1,'pointerenter');
  for(const [i,h] of f.hosts.entries()){
    assert.equal(h.style.getPropertyValue('transform'),'translate(20px,40px)');
    assert.equal(h.style.getPropertyValue('width'),'300px');
    assert.equal(h.attrs.get('freeform-x'),String(i*25));assert.equal(h.attrs.get('href'),`#p${i}`);
    assert.equal(h.attrs.get('data-dan-scale'),undefined);assert.equal(h.style.getPropertyValue('--dan-scale-media-base'),'');
    assert.equal(h.style.getPropertyValue('--dan-scale-origin'),'');
  }
});
test('closest corner uses actual geometry in all four quadrants, including offscreen boxes',()=>{
  const f=fixture(), rect={left:100,top:100,width:300,height:200};
  for(const [left,top,expected] of [[-500,-900,'0% 0%'],[900,-900,'100% 0%'],[-500,900,'0% 100%'],[900,900,'100% 100%']]){
    assert.equal(f.corner(rect,{left,top,width:100,height:100}),expected);
  }
});
test('origins lock per hover, update on target changes and stay in place during reset',()=>{
  const f=fixture(),origin=i=>f.hosts[i].style.getPropertyValue('--dan-scale-origin');
  f.pointer(0,'pointerenter');
  assert.equal(origin(0),'50% 50%');assert.equal(origin(1),'0% 0%');assert.equal(origin(2),'0% 0%');
  f.hosts[0].rect.left=2000;f.hosts[0].rect.top=2000;f.mutation();f.flush();
  assert.equal(origin(1),'0% 0%'); // native motion/resize does not switch an active corner
  f.pointer(2,'pointerenter');
  assert.equal(origin(0),'0% 0%');assert.equal(origin(1),'100% 100%');assert.equal(origin(2),'50% 50%');
  f.pointer(2,'pointerleave');f.flush();assert.equal(origin(1),'100% 100%');
  assert.deepEqual(f.states(),['normal','normal','normal']);
});
test('image, native decorations and GIF layer interpolate origins alongside scale to prevent handoff jumps',()=>{
  const css=readFileSync(new URL('../css/interactions/project-scale.css',import.meta.url),'utf8');
  const hover=readFileSync(new URL('../css/interactions/project-hover.css',import.meta.url),'utf8');
  assert.equal((css.match(/transform-origin: var\(--dan-scale-origin/g)||[]).length,3);
  assert.equal((css.match(/transform-origin var\(--dan-scale-duration/g)||[]).length,3);
  assert.match(hover,/transform-origin: var\(--dan-scale-origin/);
  assert.match(hover,/transform-origin var\(--dan-scale-duration/);
});
