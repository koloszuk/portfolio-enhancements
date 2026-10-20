import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const config = readFileSync(new URL('../js/config.js',import.meta.url),'utf8').replaceAll('export ','');
const source = readFileSync(new URL('../js/decorations/anchored-lines.js',import.meta.url),'utf8')
  .replace(/import \{[\s\S]*?\} from '..\/config.js';/,'').replaceAll('export ','');
const context={}; vm.runInNewContext(config+source+'\nthis.geometry=lineGeometry;',context);
const geometry=(...args)=>JSON.parse(JSON.stringify(context.geometry(...args)));
const page={left:20,top:100}, content={top:180,height:2000};
const intro={right:300,bottom:400}, scribble={width:50,bottom:390}, back={left:800,top:2000,height:30};
test('anchors determine independent horizontal alignment; percentages use content height',()=>{
  const a=geometry(page,content,intro,scribble,back);
  assert.deepEqual(a,{intro:{x:305,y1:290,y2:1480},back:{x:765,y1:1080,y2:1915}});
  const moved=geometry(page,content,{...intro,right:420},scribble,{...back,left:720});
  assert.equal(moved.intro.x-a.intro.x,120); assert.equal(moved.back.x-a.back.x,-80);
  assert.equal(moved.intro.y1,a.intro.y1); assert.equal(moved.back.y2,a.back.y2);
});
test('content growth changes percentage endpoints without altering text anchors',()=>{
  const before=geometry(page,content,intro,scribble,back);
  const after=geometry(page,{...content,height:3000},intro,scribble,{...back,top:3000});
  assert.equal(after.intro.y2-before.intro.y2,700);
  assert.equal(after.back.y1-before.back.y1,500);
  assert.equal(after.back.y2-before.back.y2,1000);
});
test('document scroll cancels out; geometry is relative to the page',()=>{
  const a=geometry(page,content,intro,scribble,back);
  const b=geometry({...page,top:page.top-600},{...content,top:content.top-600},
    {...intro,bottom:intro.bottom-600},{...scribble,bottom:scribble.bottom-600},{...back,top:back.top-600});
  assert.deepEqual(a,b);
});
test('missing/short-page anchors fail visibly safe instead of drawing misplaced lines',()=>{
  assert.equal(geometry(page,content,null,scribble,back).intro,null);
  assert.equal(geometry(page,content,intro,scribble,null).back,null);
  assert.equal(geometry(page,{top:180,height:100},intro,scribble,back).intro,null);
  assert.equal(geometry(page,content,intro,null,back).intro.x,280);
});
