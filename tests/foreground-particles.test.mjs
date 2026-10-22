import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source=readFileSync(new URL('../js/foreground/particles.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','');
function fixture({editor=false,reduced=false,saveData=false,mobile=false,mobileEnabled=true}={}) {
  const frames=new Map(),timers=new Map();let next=0,reads=0,now=0;
  const motion=Object.assign(new EventTarget(),{matches:reduced});
  const data=Object.assign(new EventTarget(),{matches:false});
  const narrow=Object.assign(new EventTarget(),{matches:mobile});
  const connection=Object.assign(new EventTarget(),{saveData});
  const body={children:[],append(node){node.parent=this;this.children.push(node);}};
  const window=Object.assign(new EventTarget(),{scrollY:0,innerWidth:1200,innerHeight:800,top:{location:{pathname:editor?'/edit/page':'/'}}});
  const document={body,querySelector:()=>null,createElement:()=>({children:[],style:{setProperty(k,v){this[k]=v;}},setAttribute(){},
    animate(keyframes,options){
      const animation={keyframes,options,cancelled:false,cancel(){this.cancelled=true;}};
      (this.animations??=[]).push(animation);return animation;
    },
    append(...nodes){this.children.push(...nodes);},remove(){this.parent.children=this.parent.children.filter(n=>n!==this);},
    getBoundingClientRect(){reads++;throw Error('unexpected geometry read');},
  })};
  const context={window,document,navigator:{connection},location:{pathname:editor?'/edit/page':'/'},
    matchMedia:q=>q.includes('motion')?motion:q.includes('data')?data:narrow,
    setTimeout:(cb,delay)=>{timers.set(++next,{cb,due:now+delay});return next;},clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:cb=>{frames.set(++next,cb);return next;},cancelAnimationFrame:id=>frames.delete(id),
  };
  vm.runInNewContext(config.replace('ENABLE_PARTICLES_ON_MOBILE = true',`ENABLE_PARTICLES_ON_MOBILE = ${mobileEnabled}`)+source+
    '\nthis.mount=mountForegroundParticles;this.definitions=createParticleDefinitions;this.position=particlePosition;this.lifetime=particleLifetime;',context);
  const instance=context.mount();
  function flush(){const batch=[...frames.values()];frames.clear();for(const cb of batch)cb();}
  function advance(ms){
    now+=ms;
    for(const [id,timer] of [...timers])if(timer.due<=now){timers.delete(id);timer.cb();}
  }
  return {window,body,motion,data,connection,frames,timers,context,instance,flush,advance,get reads(){return reads;}};
}
test('seeded definitions are stable, distributed, and larger dots move faster',()=>{
  const f=fixture();const a=f.context.definitions(),b=f.context.definitions();
  assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(a.length,3);
  assert.equal(new Set(a.map(p=>Math.floor(p.x*3))).size,3);
  for(const p of a){assert.ok(p.size>=4&&p.size<=8);assert.ok(p.speed>=1.5&&p.speed<=5);}
  assert.deepEqual(Array.from(a,p=>p.speed).sort((x,y)=>x-y),[1.5,3,5]);
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
test('one overlay, three instances, coalesced scroll frames, no idle loop or scroll geometry reads',()=>{
  const f=fixture();assert.equal(f.context.mount(),f.instance);f.flush();
  const overlay=f.body.children[0];assert.equal(overlay.children.length,3);
  assert.equal(overlay.style.mixBlendMode,'difference');assert.equal(f.frames.size,0);
  const initial=overlay.children.map(n=>n.style.transform);
  f.window.scrollY=900;for(let i=0;i<10;i++)f.window.dispatchEvent(new Event('scroll'));
  assert.equal(f.frames.size,1);f.flush();assert.equal(f.frames.size,0);
  assert.notDeepEqual(overlay.children.map(n=>n.style.transform),initial);
  f.window.scrollY=0;f.window.dispatchEvent(new Event('scroll'));f.flush();
  assert.deepEqual(overlay.children.map(n=>n.style.transform),initial);
  f.window.innerWidth=390;f.window.innerHeight=740;f.window.dispatchEvent(new Event('resize'));f.flush();
  assert.equal(f.body.children.length,1);assert.equal(overlay.children.length,3);assert.equal(f.reads,0);
  f.instance.destroy();assert.equal(f.body.children.length,0);
  f.window.dispatchEvent(new Event('scroll'));assert.equal(f.frames.size,0);
});
test('editor/accessibility/data restrictions suppress particles and preference changes cleanly restore them',()=>{
  for(const options of [{editor:true},{reduced:true},{saveData:true},{mobile:true,mobileEnabled:false}]){
    const f=fixture(options);f.flush();assert.equal(f.body.children.length,0);
  }
  const f=fixture({mobile:true});f.flush();assert.equal(f.body.children[0].children.length,3);
  f.motion.matches=true;f.motion.dispatchEvent(new Event('change'));assert.equal(f.body.children.length,0);
  f.motion.matches=false;f.motion.dispatchEvent(new Event('change'));f.flush();assert.equal(f.body.children.length,1);
  f.data.matches=true;f.data.dispatchEvent(new Event('change'));assert.equal(f.body.children.length,0);
});
test('cycle lifetimes are deterministic, varied, and between 2 and 5 seconds',()=>{
  const f=fixture();const values=[];
  for(let i=0;i<3;i++)for(let cycle=-8;cycle<=8;cycle++){
    const value=f.context.lifetime(i,cycle);
    assert.ok(value>=2000&&value<=5000);
    assert.equal(value,f.context.lifetime(i,cycle));values.push(value);
  }
  assert.equal(new Set(values).size,values.length);
});
test('lifetimes expire without scrolling and animate scale independently from translation',()=>{
  const f=fixture();f.flush();const nodes=f.body.children[0].children;
  const transforms=nodes.map(n=>n.style.transform);
  const deadlines=[...f.timers.values()].map(t=>t.due);
  assert.equal(f.timers.size,3);
  for(let i=0;i<10;i++){f.window.dispatchEvent(new Event('scroll'));f.flush();}
  assert.deepEqual([...f.timers.values()].map(t=>t.due),deadlines);
  f.advance(5000);
  for(const node of nodes){
    assert.equal(node.style.scale,'0');
    const animation=node.animations[0];
    assert.equal(JSON.stringify(animation.keyframes),'[{"scale":1},{"scale":0}]');
    assert.equal(animation.options.duration,400);
    assert.equal(animation.options.easing,'cubic-bezier(0.22, 1, 0.36, 1)');
    assert.equal(animation.options.fill,'forwards');
  }
  assert.deepEqual(nodes.map(n=>n.style.transform),transforms);
  assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
  f.window.scrollY=1;f.window.dispatchEvent(new Event('scroll'));f.flush();
  assert.equal(nodes[0].style.scale,'0');assert.notEqual(nodes[0].style.transform,transforms[0]);
  f.window.innerHeight=760;f.window.dispatchEvent(new Event('resize'));f.flush();
  assert.equal(nodes[0].style.scale,'0');assert.equal(f.timers.size,0);
});
test('hidden particles reset only on a wrap in either direction and reuse all nodes',()=>{
  const f=fixture();f.flush();f.advance(5000);
  const nodes=f.body.children[0].children,particle=f.context.definitions()[0];
  const pos=s=>f.context.position(particle,s,1200,800);
  const move=s=>{f.window.scrollY=s;f.window.dispatchEvent(new Event('scroll'));f.flush();};
  const cycle=pos(0).cycle;
  const find=predicate=>{for(let s=0;s<10000;s++)if(predicate(pos(s)))return s;throw Error('position not found');};
  const exit=find(p=>p.cycle===cycle&&p.y+particle.size<0);
  move(exit);assert.equal(nodes[0].style.scale,'0');
  move(0);assert.equal(nodes[0].style.scale,'0'); // No wrap, no resurrection.
  const wrap=find(p=>p.cycle!==cycle&&p.y>800);
  move(wrap);assert.equal(nodes[0].style.scale,'1');
  assert.equal(nodes[0].animations[0].cancelled,true);
  const entry=find(p=>p.cycle===pos(wrap).cycle&&p.y<800);
  move(entry);f.advance(5000);assert.equal(nodes[0].style.scale,'0');
  move(wrap);assert.equal(nodes[0].style.scale,'0');
  move(exit);assert.equal(nodes[0].style.scale,'1'); // Reverse wrap, above screen.
  move(0);assert.equal(nodes[0].style.scale,'1');
  for(const s of [wrap,0,entry,0,wrap])move(s);
  assert.equal(f.body.children[0].children.length,3);
  assert.equal(f.body.children[0].children[0],nodes[0]);assert.ok(f.timers.size<=3);
  f.instance.destroy();assert.equal(f.timers.size,0);
});
