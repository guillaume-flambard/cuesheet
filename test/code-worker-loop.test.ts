import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventStore} from '../src/core/store.ts';
import {projectEffectAttempts} from '../src/adapters/tool-receipts.ts';
import {runCodeWorker} from '../src/adapters/code-worker-loop.ts';
import {withSharedContext} from '../src/adapters/shared-context.ts';
import type {ModelAdapter,ContextFrame} from '../src/core/loop.ts';
const frame:ContextFrame={goal:'shared goal',history:[],directives:[],evidence:[],capabilities:[],model:'fixture',step:1};
function fixture(adapter:ModelAdapter){const store=new EventStore('worker',Date.now),abort=new AbortController();return {store,abort,options:{worker:{id:'w-fixture',path:'/isolated',packet:{role:'builder',task:'Build',files:['a'],skills:[]},model:adapter.name,adapter},allow:['node'],maxSteps:2,frame:()=>frame,signal:abort.signal,current:()=>true,append:(e:any)=>store.append(e)}};}
test('worker help is parent-owned and its advice reaches the next inference without effects',async()=>{
 let calls=0,help=0,effects=0;const f=fixture({name:'helped-worker',async infer(current){
  calls++;assert.ok(current.directives.some(d=>d.text.startsWith('tools:')&&d.text.includes('consult_agents')));
  if(calls===1)return {text:'',toolCalls:[{name:'consult_agents',input:{tasks:[{role:'reviewer',task:'Inspect this approach'}]}}]};
  assert.ok(current.history.some(e=>e.kind==='observation'&&String(e.data.output).includes('unverified advice')));
  return {text:'unverified contribution',toolCalls:[]};
 }});
 const result=await runCodeWorker({...f.options,frame:()=>({...frame,history:f.store.toSession().events}),consult:async input=>{help++;assert.equal(input.tasks[0].role,'reviewer');return {name:'consult_agents',exit:0,output:'unverified advice'};},tools:{async run(){effects++;throw Error('Help must not reach file tools');}}});
 assert.equal(result.phase,'proposal');assert.equal(help,1);assert.equal(effects,0);assert.equal(calls,2);
 assert.equal(f.store.toSession().events.some(e=>e.kind==='work_verified'),false);
});
test('help without a parent binding is refused, and correction during help prevents following effects',async()=>{
 let effects=0;const f=fixture({name:'unbound',async infer(){return {text:'',toolCalls:[{name:'consult_agents',input:{}}]};}});
 const tools={async run(){effects++;return {name:'node',exit:0,output:'should not happen'};}};
 assert.equal((await runCodeWorker({...f.options,allow:['consult_agents'],tools})).phase,'failed');
 let current=true;const g=fixture({name:'corrected-help',async infer(){return {text:'',toolCalls:[{name:'consult_agents',input:{}},{name:'node',input:{}}]};}});
 const outcome=await runCodeWorker({...g.options,current:()=>current,consult:async()=>{current=false;return {name:'consult_agents',exit:0,output:'old advice'};},tools});
 assert.equal(outcome.phase,'stale');assert.equal(effects,0);
});
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
  assert.equal((await runCodeWorker({...f.options,allow:['node','finish'],tools:{async run(){effects++;throw Error('not admitted');}}})).phase,'failed');assert.equal(effects,0);assert.equal(f.store.toSession().events.length,2);assert.ok(f.store.toSession().events.every(e=>e.subject==='terminal.code-worker-supervision'));
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

test('whole child context is compacted after packet assembly without dropping human authority',async()=>{
  const parent=new EventStore('parent',()=>1);
  parent.append({kind:'directive',subject:'builder',data:{text:'Preserve every existing human edit.'}});
  const history=parent.append({kind:'observation',subject:'builder',data:{tool:'cat',exit:0,output:'historical output '.repeat(4000)}});
  let calls=0;
  const f=fixture({name:'bounded-child',async infer(current){
    calls++;assert.ok(JSON.stringify(current).length<=8000);
    assert.equal(current.goal,'Build');
    assert.ok(current.directives.some(d=>d.text==='Preserve every existing human edit.'));
    assert.ok(current.directives.some(d=>d.text.includes('Responsibilities: a')));
    assert.ok(current.directives.some(d=>d.text.includes('omittedHistory')));
    return {text:'Unverified contribution',toolCalls:[]};
  }});
  const result=await runCodeWorker({...f.options,maxFrameChars:8000,frame:()=>({...frame,history:[history]}),
    finalizeFrame:complete=>withSharedContext(complete,parent.toSession(),{maxChars:8000}),tools:{async run(){throw Error('no effects');}}});
  assert.equal(calls,1);assert.equal(result.phase,'proposal');assert.equal(parent.toSession().events.length,2);
});

test('worker vocabulary reaches the real provider prompt without historical or forbidden tools',async()=>{
 const {declaredTools}=await import('../src/adapters/tool-vocabulary.ts');const {renderProposalPrompt}=await import('../src/adapters/binary-model.ts');let calls=0,effects=0;
 const f=fixture({name:'provider-boundary',async infer(current){const names=declaredTools(current);assert.deepEqual(names,['node','cat']);const prompt=renderProposalPrompt(current,names!);assert.match(prompt,/only ones that will ever run, are: "node", "cat"/);assert.match(prompt,/Code worker builder: Build/);assert.match(prompt,/Responsibilities: a/);assert.doesNotMatch(prompt,/only ones that will ever run, are:.*(?:git|finish)/);return ++calls===1?{text:'',toolCalls:[{name:'node',input:{argv:['node','-e','effect']}}]}:{text:'unverified contribution',toolCalls:[]};}});
 const result=await runCodeWorker({...f.options,allow:['node','cat','git','finish'],frame:()=>({...frame,directives:[{seq:99,at:0,target:'builder',applied:false,text:'tools: git, finish'}]}),tools:{async run(request){assert.equal(request.name,'node');effects++;return {name:'node',exit:0,output:'private effect'};}}});assert.equal(result.phase,'proposal');assert.equal(calls,2);assert.equal(effects,1);assert.equal(projectEffectAttempts(f.store.toSession().events)[0]!.phase,'completed');
});

test('controller rejects a prose-only completion and redirects the same bounded worker',async()=>{
 let calls=0,changed=false;const f=fixture({name:'redirected',async infer(current){
  calls++;if(calls===1)return {text:'I would edit the file',toolCalls:[]};
  assert.ok(current.history.some(e=>e.subject==='terminal.code-worker-supervision'));
  return calls===2?{text:'',toolCalls:[{name:'node',input:{}}]}:{text:'unverified change',toolCalls:[]};
 }});
 const result=await runCodeWorker({...f.options,maxSteps:3,hasContribution:async()=>changed,frame:()=>({...frame,history:f.store.toSession().events}),tools:{async run(){changed=true;return {name:'node',exit:0,output:'changed'};}}});
 assert.equal(result.phase,'proposal');assert.equal(calls,3);assert.equal(f.store.toSession().events.filter(e=>e.subject==='terminal.code-worker-supervision').length,1);assert.equal(f.store.toSession().events.some(e=>e.kind==='work_verified'),false);
});

test('worker goal is its packet task while parent orchestration remains reference context',async()=>{
 const f=fixture({name:'role-boundary',async infer(current){assert.equal(current.goal,'Build');assert.ok(current.directives.some(d=>d.text.includes('Parent objective (context only)')));assert.match(current.directives.at(-1).text,/controller owns delegation, supervision, integration/);return {text:'unverified contribution',toolCalls:[]};}});
 assert.equal((await runCodeWorker({...f.options,frame:()=>({...frame,goal:'Delegate a supervised worker then integrate and verify'}),tools:{async run(){throw Error('no tools');}}})).phase,'proposal');
});

test('controller stops a single worker on observed candidate criteria without another model declaration',async()=>{
 let calls=0,checks=0;const f=fixture({name:'candidate-stop',async infer(){calls++;return {text:'',toolCalls:[{name:'node',input:{}}]};}});
 const result=await runCodeWorker({...f.options,contributionReady:async()=>{checks++;return true;},tools:{async run(){return {name:'node',exit:0,output:'confirmed change'};}}});
 assert.equal(result.phase,'proposal');assert.equal(calls,1);assert.equal(checks,1);assert.match(result.text,/integration.*source verification/i);assert.equal(projectEffectAttempts(f.store.toSession().events)[0].phase,'completed');assert.equal(f.store.toSession().events.some(e=>e.kind==='work_verified'),false);
});

for(const mode of ['rejected','uncertain','cancelled'])test(`candidate ${mode} cannot certify or continue stale work`,async()=>{
 let calls=0,effects=0,checks=0;const abort=new AbortController();const f=fixture({name:'candidate-boundary',async infer(){calls++;return {text:'',toolCalls:[{name:'node',input:{}}]};}});
 const result=await runCodeWorker({...f.options,maxSteps:2,signal:abort.signal,contributionReady:async()=>{checks++;if(mode==='uncertain')throw Error('unconfirmed inspection');if(mode==='cancelled')abort.abort();return false;},tools:{async run(){effects++;return {name:'node',exit:0,output:'observed'};}}});
 assert.equal(result.phase,mode==='rejected'?'exhausted':mode==='uncertain'?'uncertain':'cancelled');assert.equal(calls,mode==='rejected'?2:1);assert.equal(effects,calls);assert.equal(checks,calls);assert.equal(f.store.toSession().events.some(e=>e.kind==='work_verified'),false);
});


test('slow worker inference is cancelled, late tool calls never execute and completed receipts survive',async()=>{
 let calls=0,effects=0,late,signal;const f=fixture({name:'slow-provider',async infer(_frame,currentSignal){calls++;if(calls===1)return {text:'',toolCalls:[{name:'node',input:{}}]};signal=currentSignal;return new Promise(resolve=>late=resolve);}});
 const result=await runCodeWorker({...f.options,maxSteps:3,inferenceTimeoutMs:15,tools:{async run(){effects++;return {name:'node',exit:0,output:'saved effect'};}}});
 assert.equal(result.phase,'failed');assert.match(result.text,/provider did not answer/);assert.equal(signal.aborted,true);late({text:'late',toolCalls:[{name:'node',input:{}}]});await new Promise(resolve=>setTimeout(resolve,5));assert.equal(effects,1);assert.equal(projectEffectAttempts(f.store.toSession().events)[0].phase,'completed');
});

test('code worker uses observable provider transport and retains the controlled quota refusal without effects',async()=>{
 const {ProviderProposalRefused,providerEventFailure}=await import('../src/adapters/opencode-stream.ts');let effects=0;
 const f=fixture({name:'quota-provider',async infer(_frame,_signal,onProgress){assert.equal(typeof onProgress,'function');throw new ProviderProposalRefused(providerEventFailure({type:'session.status',properties:{sessionID:'owned',status:{type:'retry',message:'quota exhausted PRIVATE-CREDENTIAL'}}},'owned'));}});
 const result=await runCodeWorker({...f.options,tools:{async run(){effects++;throw Error('not admitted');}}});assert.equal(result.phase,'failed');assert.match(result.text,/Quota exhausted/);assert.doesNotMatch(result.text,/PRIVATE-CREDENTIAL/);assert.equal(effects,0);assert.equal(f.store.revision,-1);
});


test('worker corrects a rejected whole batch within its original inference budget',async()=>{
 let calls=0,effects=0;const f=fixture({name:'correcting',async infer(current){
  calls++;if(calls===1)return {text:'',toolCalls:[{name:'node',input:{}},{name:'finish',input:{}}]};
  assert.ok(current.history.some(e=>e.subject==='terminal.code-worker-supervision'&&String(e.data.output).includes('Allowed tools: node')));
  return calls===2?{text:'',toolCalls:[{name:'node',input:{argv:['node','-e','effect']}}]}:{text:'unverified contribution',toolCalls:[]};
 }});
 const result=await runCodeWorker({...f.options,maxSteps:3,frame:()=>({...frame,history:f.store.toSession().events}),tools:{async run(){effects++;return {name:'node',exit:0,output:'saved'};}}});
 assert.equal(result.phase,'proposal');assert.equal(calls,3);assert.equal(effects,1);assert.equal(projectEffectAttempts(f.store.toSession().events).length,1);
});
