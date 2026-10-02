import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventStore} from '../src/core/store.ts';
import {projectEffectAttempts} from '../src/adapters/tool-receipts.ts';
import {runCodeWorker} from '../src/adapters/code-worker-loop.ts';
import type {ModelAdapter,ContextFrame} from '../src/core/loop.ts';
const frame:ContextFrame={goal:'shared goal',history:[],directives:[],evidence:[],capabilities:[],model:'fixture',step:1};
function fixture(adapter:ModelAdapter){const store=new EventStore('worker',Date.now),abort=new AbortController();return {store,abort,options:{worker:{id:'w-fixture',path:'/isolated',packet:{role:'builder',task:'Build',files:['a'],skills:[]},model:adapter.name,adapter},allow:['node'],maxSteps:2,frame:()=>frame,signal:abort.signal,current:()=>true,append:(e:any)=>store.append(e)}};}
test('simultaneous effects stay in separate worker journals and cannot certify completion',async()=>{
  let arrived=0, release!:()=>void;const barrier=new Promise<void>(r=>release=r);
  const workers=[0,1].map(i=>{let calls=0;return fixture({name:`model-${i}`,async infer(){return ++calls===1?{text:'',toolCalls:[{name:'node',input:{argv:['node','-e','effect']}}]}:{text:'unverified patch',toolCalls:[]};}});});
  const results=await Promise.all(workers.map((f,i)=>runCodeWorker({...f.options,worker:{...f.options.worker,id:`w-${i}`,path:`/isolated-${i}`},tools:{async run(){if(++arrived===2)release();await barrier;return {name:'node',exit:0,output:`worker-${i}`};}}})));
  assert.equal(arrived,2);assert.ok(results.every(r=>r.phase==='proposal'));
  for(let i=0;i<2;i++){const events=workers[i]!.store.toSession().events;const attempts=projectEffectAttempts(events);assert.equal(attempts.length,1);assert.equal(attempts[0]!.scopeCwd,`/isolated-${i}`);assert.equal(attempts[0]!.phase,'completed');assert.equal(workers[i]!.store.toSession().goal,null);}
});
test('unconfirmed effect has no completion receipt and is not repeated',async()=>{
  let calls=0;const f=fixture({name:'fixture',async infer(){return {text:'',toolCalls:[{name:'node',input:{}}]};}});
  const result=await runCodeWorker({...f.options,tools:{async run(){calls++;return {name:'node',exit:null,output:'possibly wrote'};}}});
  assert.equal(result.phase,'uncertain');assert.equal(calls,1);assert.equal(projectEffectAttempts(f.store.toSession().events)[0]!.phase,'uncertain');
});
test('forbidden call rejects whole inference batch before any effect',async()=>{
  let effects=0;const f=fixture({name:'fixture',async infer(){return {text:'',toolCalls:[{name:'node',input:{}},{name:'finish',input:{}}]};}});
  assert.equal((await runCodeWorker({...f.options,allow:['node','finish'],tools:{async run(){effects++;throw Error('not admitted');}}})).phase,'failed');assert.equal(effects,0);assert.equal(f.store.revision,-1);
});
test('direct correction discards late inference and prevents next old tool',async()=>{
  let release!:()=>void,ready!:()=>void;const pending=new Promise<void>(r=>release=r),started=new Promise<void>(r=>ready=r);let current=true,effects=0;
  const f=fixture({name:'late',async infer(){ready();await pending;return {text:'old',toolCalls:[{name:'node',input:{}}]};}});
  const work=runCodeWorker({...f.options,current:()=>current,tools:{async run(){effects++;throw Error('stale');}}});await started;current=false;f.abort.abort();const result=await work;release();assert.equal(result.phase,'cancelled');assert.equal(effects,0);
  current=true;const g=fixture({name:'fixture',async infer(){return {text:'',toolCalls:[{name:'node',input:{}},{name:'node',input:{}}]};}});
  const next=await runCodeWorker({...g.options,current:()=>current,tools:{async run(){effects++;current=false;return {name:'node',exit:0,output:'confirmed first effect'};}}});assert.equal(next.phase,'stale');assert.equal(effects,1);assert.equal(projectEffectAttempts(g.store.toSession().events)[0]!.phase,'completed');
});
test('persistence failure before intent prevents effects; bounded work never loops forever',async()=>{
  let effects=0;const f=fixture({name:'fixture',async infer(){return {text:'',toolCalls:[{name:'node',input:{}}]};}});
  const tools={async run(){effects++;return {name:'node',exit:0,output:'done'};}};
  assert.equal((await runCodeWorker({...f.options,append:()=>{throw Error('disk failed');},tools})).phase,'failed');assert.equal(effects,0);
  assert.equal((await runCodeWorker({...f.options,maxSteps:1,tools})).phase,'exhausted');assert.equal(effects,1);
});
test('final worker frame ceiling includes its task and private observations before inference',async()=>{
  let calls=0;const f=fixture({name:'fixture',async infer(){calls++;return {text:'',toolCalls:[]};}});
  const result=await runCodeWorker({...f.options,maxFrameChars:4000,frame:()=>({...frame,goal:'x'.repeat(4000)}),tools:{async run(){throw Error('no effect');}}});
  assert.equal(result.phase,'failed');assert.equal(calls,0);assert.match(result.text,/ceiling/);
});
