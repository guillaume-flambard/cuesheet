import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventStore} from '../src/core/store.ts';
import {recordAssistance,projectAssistance,ASSISTANCE_SUBJECT} from '../src/adapters/agent-assistance.ts';
import {consultAgents} from '../src/adapters/agent-consultation.ts';
import {projectWorkSurface} from '../apps/terminal/src/producer/work-surface.ts';
import type {ContextFrame} from '../src/core/loop.ts';
const base={version:1 as const,id:'help1',requesterId:'worker-A',helperId:'worker-B',question:'Check restart invariants',execution:'run1',model:'fixture',routeReason:'Inherited session model'};
const frame:ContextFrame={goal:'restart',history:[],directives:[],evidence:[],capabilities:[],model:'fixture',step:1};
test('assistance replay preserves causality and cannot resurrect invalidated results',()=>{
 const store=new EventStore('assist',()=>1),record=recordAssistance(base,e=>store.append(e));
 record('requested');record('admitted');assert.equal(projectAssistance(store.toSession().events)[0]!.phase,'interrupted');assert.equal(projectAssistance(store.toSession().events,'run1')[0]!.phase,'admitted');
 record('result','Candidate invariant',[1]);const saved=store.toSession().events;assert.equal(projectAssistance(saved)[0]!.epistemic,'INFERRED');record('stale','Human direction changed');assert.throws(()=>record('result','late result'));
 const revision=store.revision;
 const late={...saved.at(-1)!,seq:revision+1};const forged={...late,data:{...late.data,requesterId:'other'}};
 for(const e of [late,forged])assert.equal(projectAssistance([...store.toSession().events,e])[0]!.phase,'stale');
 assert.equal(store.revision,revision);assert.equal(projectAssistance([{...saved[0]!,data:{...saved[0]!.data,phase:'result'}}]).length,0);
});
test('controller consultation publishes actual help link, route reason and source receipts',async()=>{
 const store=new EventStore('consult',()=>1);let calls=0;
 const response=await consultAgents({input:{tasks:[{role:'review',task:'Check receipt'}]},requesterId:'worker-A',frame,model:{name:'fixture',async infer(){calls++;return {text:'INFERENCE_ONLY',toolCalls:[]}}},signal:new AbortController().signal,current:()=>true,append:e=>store.append(e),execution:'run1',modelLabel:'fixture',notice(){}});
 assert.equal(response.exit,0);assert.equal(calls,1);const events=store.toSession().events;const help=projectAssistance(events)[0]!;assert.equal(help.requesterId,'worker-A');assert.equal(help.phase,'result');assert.equal(help.epistemic,'INFERRED');assert.equal(help.routeReason,'Current session model');assert.equal(events.find(e=>e.seq===help.sourceSeqs[0])!.subject,'terminal.agent');
 const worker=projectWorkSurface(events).workers[0]!;assert.equal(worker.helping,'worker-A');assert.equal(worker.routeReason,help.routeReason);assert.equal(worker.result,'INFERENCE_ONLY');
 assert.equal(projectWorkSurface(events.filter(e=>e.subject!==ASSISTANCE_SUBJECT)).workers[0]!.helping,undefined,'legacy data does not invent an edge');
});
test('late correction invalidates an already returned consultation in the same batch',async()=>{
 const store=new EventStore('late',()=>1);let current=true;
 const response=await consultAgents({input:{tasks:[{role:'review',task:'Check receipt'}]},frame,model:{name:'fixture',async infer(){return {text:'OLD_RESULT',toolCalls:[]}}},signal:new AbortController().signal,current:()=>current,append:e=>{const event=store.append(e);if(e.subject===ASSISTANCE_SUBJECT&&e.data.phase==='result')current=false;return event;},execution:'run1',modelLabel:'fixture',notice(){}});
 assert.equal(response.exit,126);assert.equal(projectAssistance(store.toSession().events)[0]!.phase,'stale');assert.doesNotMatch(projectAssistance(store.toSession().events)[0]!.text,/OLD_RESULT/);
});
test('journal failure during admission prevents all provider calls',async()=>{
 let calls=0;const store=new EventStore('fail',()=>1);
 await assert.rejects(consultAgents({input:{tasks:[{role:'review',task:'Check receipt'}]},frame,model:{name:'fixture',async infer(){calls++;return {text:'x',toolCalls:[]}}},signal:new AbortController().signal,current:()=>true,append:e=>{if(e.subject===ASSISTANCE_SUBJECT&&e.data.phase==='admitted')throw Error('disk full');return store.append(e);},execution:'run1',modelLabel:'fixture',notice(){}}),/disk full/);
 assert.equal(calls,0);assert.equal(projectAssistance(store.toSession().events)[0]!.phase,'interrupted');
});
