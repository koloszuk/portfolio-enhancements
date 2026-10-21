import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source=readFileSync(new URL('../js/interactions/project-scale.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','')+'\nthis.mount=mountProjectScale;';
function fixture({editor=false,fine=true,reduced=false}={}) {
  let next=0;const frames=new Map();let mutation;
  const capable=Object.assign(new EventTarget(),{matches:fine});
  const motion=Object.assign(new EventTarget(),{matches:reduced});
  function style(){const values=new Map([['transform','translate(20px,40px)'],['width','300px']]);return{
    values,getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',
    setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k),
  };}
  const hosts=Array.from({length:3},(_,i)=>{
    const link=Object.assign(new EventTarget(),{isConnected:true});
    const media={isConnected:true}; const attrs=new Map([['href',`#p${i}`],['freeform-x',String(i*25)]]);
    return {link,media,attrs,style:style(),isConnected:true,
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
  return {hosts,page,doc,win,capable,motion,instance,flush,pointer,mutation:()=>mutation([]),states:()=>hosts.map(h=>h.attrs.get('data-dan-scale-state'))};
}
test('A-to-B hover applies simultaneous active/other states without a normal-state flash',()=>{
  const f=fixture(); assert.deepEqual(f.states(),['normal','normal','normal']);
  f.pointer(0,'pointerenter'); assert.deepEqual(f.states(),['active','other','other']);
  f.pointer(0,'pointerleave'); f.pointer(1,'pointerenter'); f.flush();
  assert.deepEqual(f.states(),['other','active','other']);
  f.pointer(1,'pointerleave');f.flush();assert.deepEqual(f.states(),['normal','normal','normal']);
  assert.equal(f.page.style.getPropertyValue('--dan-scale-hover'),'1.01');
  assert.equal(f.page.style.getPropertyValue('--dan-scale-others'),'0.99');
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
