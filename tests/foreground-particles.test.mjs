import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source=readFileSync(new URL('../js/foreground/particles.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','');
function fixture({editor=false,reduced=false,saveData=false,mobile=false,mobileEnabled=true}={}) {
  const frames=new Map();let next=0,reads=0;
  const motion=Object.assign(new EventTarget(),{matches:reduced});
  const data=Object.assign(new EventTarget(),{matches:false});
  const narrow=Object.assign(new EventTarget(),{matches:mobile});
  const connection=Object.assign(new EventTarget(),{saveData});
  const body={children:[],append(node){node.parent=this;this.children.push(node);}};
  const window=Object.assign(new EventTarget(),{scrollY:0,innerWidth:1200,innerHeight:800,top:{location:{pathname:editor?'/edit/page':'/'}}});
  const document={body,querySelector:()=>null,createElement:()=>({children:[],style:{setProperty(k,v){this[k]=v;}},setAttribute(){},
    append(...nodes){this.children.push(...nodes);},remove(){this.parent.children=this.parent.children.filter(n=>n!==this);},
    getBoundingClientRect(){reads++;throw Error('unexpected geometry read');},
  })};
  const context={window,document,navigator:{connection},location:{pathname:editor?'/edit/page':'/'},
    matchMedia:q=>q.includes('motion')?motion:q.includes('data')?data:narrow,
    requestAnimationFrame:cb=>{frames.set(++next,cb);return next;},cancelAnimationFrame:id=>frames.delete(id),
  };
  vm.runInNewContext(config.replace('ENABLE_PARTICLES_ON_MOBILE = true',`ENABLE_PARTICLES_ON_MOBILE = ${mobileEnabled}`)+source+
    '\nthis.mount=mountForegroundParticles;this.definitions=createParticleDefinitions;this.position=particlePosition;',context);
  const instance=context.mount();
  function flush(){const batch=[...frames.values()];frames.clear();for(const cb of batch)cb();}
  return {window,body,motion,data,connection,frames,context,instance,flush,get reads(){return reads;}};
}
test('seeded definitions are stable, distributed, and larger dots move faster',()=>{
  const f=fixture();const a=f.context.definitions(),b=f.context.definitions();
  assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(a.length,6);
  assert.equal(new Set(a.map(p=>Math.floor(p.x*6))).size,6);
  for(const p of a){assert.ok(p.size>=4&&p.size<=8);assert.ok(p.speed>=2&&p.speed<=3);}
  const sorted=[...a].sort((x,y)=>x.size-y.size);
  for(let i=1;i<sorted.length;i++)assert.ok(sorted[i].speed>=sorted[i-1].speed);
});
test('absolute scroll is reversible, with exact speed and offscreen wrapping in both directions',()=>{
  const f=fixture();const p={x:.4,phase:.5,size:6,speed:2.5};
  const at=s=>f.context.position(p,s,1200,800);
  assert.ok(Math.abs((at(101).y-at(100).y)+2.5)<1e-9);
  const original=at(500);at(10000);assert.equal(JSON.stringify(at(500)),JSON.stringify(original));
  assert.equal(JSON.stringify(at(-10)),JSON.stringify(at(0)));
  let wraps=0;
  for(let s=0;s<2000;s++){
    const prev=at(s).y, next=at(s+1).y;
    if(next>prev){wraps++;assert.ok(prev+6<0);assert.ok(next>800);}
    assert.ok(next>=-14&&next<808);
  }
  assert.ok(wraps>0);
  for(const s of [1e7,1e9])assert.ok(Number.isFinite(at(s).y));
});
test('one overlay, six nodes, coalesced scroll frames, no idle loop or scroll geometry reads',()=>{
  const f=fixture();assert.equal(f.context.mount(),f.instance);f.flush();
  const overlay=f.body.children[0];assert.equal(overlay.children.length,6);
  assert.equal(overlay.style.mixBlendMode,'difference');assert.equal(f.frames.size,0);
  const initial=overlay.children.map(n=>n.style.transform);
  f.window.scrollY=900;for(let i=0;i<10;i++)f.window.dispatchEvent(new Event('scroll'));
  assert.equal(f.frames.size,1);f.flush();assert.equal(f.frames.size,0);
  assert.notDeepEqual(overlay.children.map(n=>n.style.transform),initial);
  f.window.scrollY=0;f.window.dispatchEvent(new Event('scroll'));f.flush();
  assert.deepEqual(overlay.children.map(n=>n.style.transform),initial);
  f.window.innerWidth=390;f.window.innerHeight=740;f.window.dispatchEvent(new Event('resize'));f.flush();
  assert.equal(f.body.children.length,1);assert.equal(overlay.children.length,6);assert.equal(f.reads,0);
  f.instance.destroy();assert.equal(f.body.children.length,0);
  f.window.dispatchEvent(new Event('scroll'));assert.equal(f.frames.size,0);
});
test('editor/accessibility/data restrictions suppress particles and preference changes cleanly restore them',()=>{
  for(const options of [{editor:true},{reduced:true},{saveData:true},{mobile:true,mobileEnabled:false}]){
    const f=fixture(options);f.flush();assert.equal(f.body.children.length,0);
  }
  const f=fixture({mobile:true});f.flush();assert.equal(f.body.children[0].children.length,6);
  f.motion.matches=true;f.motion.dispatchEvent(new Event('change'));assert.equal(f.body.children.length,0);
  f.motion.matches=false;f.motion.dispatchEvent(new Event('change'));f.flush();assert.equal(f.body.children.length,1);
  f.data.matches=true;f.data.dispatchEvent(new Event('change'));assert.equal(f.body.children.length,0);
});
