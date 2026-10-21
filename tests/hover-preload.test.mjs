import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/interactions/hover-preload.js',import.meta.url),'utf8').replace('export ','');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const calls=[];
  const ctx={queueMicrotask,AbortController,fetch:(url,options)=>new Promise((resolve,reject)=>{
    calls.push({url,options,finish:()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}),fail:()=>reject(new Error('offline'))});
  })};
  vm.runInNewContext(source+'\nthis.create=createHoverPreloader;',ctx);
  return {calls,queue:ctx.create({backgroundLimit:2,totalLimit:3})};
}
test('automatic background order, two slots, and immediate reserved hover slot',async()=>{
  const {calls,queue}=fixture();
  for(const url of ['nothing','second','third','fourth']) queue.request(url);
  queue.setBackgroundEnabled(true); await tick();
  assert.deepEqual(calls.map(c=>c.url),['nothing','second']);
  queue.request('fourth',true); await tick();
  assert.deepEqual(calls.map(c=>c.url),['nothing','second','fourth']);
  queue.request('fifth',true); await tick(); assert.equal(calls.length,3);
  calls[2].finish(); await tick(); assert.equal(calls[3].url,'fifth');
  calls[0].finish(); await tick(); assert.equal(calls[4].url,'third');
  queue.destroy();
});
test('in-flight and completed requests reuse one promise and transfer',async()=>{
  const {calls,queue}=fixture();
  const first=queue.request('nothing'); queue.setBackgroundEnabled(true); await tick();
  assert.equal(queue.request('nothing',true),first); await tick(); assert.equal(calls.length,1);
  calls[0].finish(); assert.equal(await first,true); await tick();
  assert.equal(queue.request('nothing',true),first); await tick(); assert.equal(calls.length,1);
  queue.destroy();
});
test('background preference pauses queued jobs; explicit hover is allowed',async()=>{
  const {calls,queue}=fixture();
  queue.request('background'); await tick(); assert.equal(calls.length,0);
  queue.request('hover',true); await tick(); assert.equal(calls[0].url,'hover');
  queue.setBackgroundEnabled(true); await tick(); assert.equal(calls[1].url,'background');
  queue.request('later'); queue.setBackgroundEnabled(false);
  calls[1].finish(); await tick(); assert.equal(calls.length,2);
  queue.destroy();
});
test('failure settles without blocking queue; teardown settles queued jobs',async()=>{
  const {calls,queue}=fixture();
  const failed=queue.request('bad',true); await tick(); calls[0].fail();
  assert.equal(await failed,false);
  const pending=queue.request('later'); queue.destroy(); assert.equal(await pending,false);
});
