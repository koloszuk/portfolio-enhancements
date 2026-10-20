import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const config=readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source=readFileSync(new URL('../js/decorations/anchored-lines.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','');
const context={}; vm.runInNewContext(config+source+'\nthis.geometry=lineGeometry;this.endpoint=introEndpoint;',context);
const geometry=(...args)=>JSON.parse(JSON.stringify(context.geometry(...args)));
const page={left:20,top:100},content={top:180,height:2000};
const intro={right:300,bottom:400},scribble={width:50,bottom:390},back={left:800,top:2000,height:30};
const target={left:250,right:600,top:1100,height:300};
test('intro ends halfway inside the project while original anchors and second line are unchanged',()=>{
  const a=geometry(page,content,intro,scribble,back,target);
  assert.deepEqual(a,{intro:{x:305,y1:290,y2:1150},back:{x:765,y1:1080,y2:1915}});
  const moved=geometry(page,content,{...intro,right:420},scribble,{...back,left:720},target);
  assert.equal(moved.intro.x-a.intro.x,120);assert.equal(moved.back.x-a.back.x,-80);
  assert.equal(moved.intro.y1,a.intro.y1);assert.equal(moved.intro.y2,a.intro.y2);
});
test('page growth does not set the intro endpoint; moving/resizing the target does',()=>{
  const a=geometry(page,content,intro,scribble,back,target);
  const grow=geometry(page,{...content,height:3000},intro,scribble,back,target);
  assert.equal(grow.intro.y2,a.intro.y2);
  assert.equal(grow.back.y1-a.back.y1,500);
  const moved=geometry(page,content,intro,scribble,back,{...target,top:1700,height:400});
  assert.equal(moved.intro.y2,1800);assert.deepEqual(moved.back,a.back);
});
test('document scroll cancels out while native visual translation changes only the hidden endpoint',()=>{
  const a=geometry(page,content,intro,scribble,back,target);
  const shifted=geometry({...page,top:page.top-600},{...content,top:content.top-600},
    {...intro,bottom:intro.bottom-600},{...scribble,bottom:scribble.bottom-600},
    {...back,top:back.top-600},{...target,top:target.top-600});
  assert.deepEqual(a,shifted);
  for(const shift of [-230,0,230]) {
    const visual={...target,top:target.top+shift};
    const b=geometry(page,content,intro,scribble,back,visual);
    assert.equal(b.intro.y2,a.intro.y2+shift);
    assert.equal(b.intro.x,a.intro.x);assert.equal(b.intro.y1,a.intro.y1);
    assert.deepEqual(b.back,a.back);
    assert.ok(b.intro.y2+page.top>visual.top&&b.intro.y2+page.top<visual.top+visual.height);
  }
});
test('a missing or horizontally nonintersecting target never moves X or affects the second line',()=>{
  const a=geometry(page,content,intro,scribble,back,target);
  for(const visual of [null,{...target,left:500,right:700},{...target,left:0,right:300},
    {...target,left:324.8,right:600}]) {
    const b=geometry(page,content,intro,scribble,back,visual);
    assert.equal(b.intro,null);assert.deepEqual(b.back,a.back);
  }
  assert.equal(geometry(page,content,null,scribble,back,target).intro,null);
  assert.equal(geometry(page,content,intro,scribble,null,target).back,null);
});
test('scroll endpoint conversion is deterministic without accumulating offsets',()=>{
  const cachedPageTop=100,x=325;
  for(const scroll of [0,500,900,500,0]) {
    const viewport={...target,top:target.top-scroll+80};
    assert.equal(context.endpoint(x,cachedPageTop-scroll,viewport),1230);
  }
});
