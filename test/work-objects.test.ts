import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventStore} from '../src/core/store.ts';
import {createObjective,correctObjective} from '../src/adapters/objectives.ts';
import {projectWorkSurface} from '../apps/terminal/src/producer/work-surface.ts';
import {resolveWorkReference} from '../apps/terminal/src/producer/work-objects.ts';
import {createProducer} from '../apps/terminal/src/producer/index.ts';
import {createStore} from '../apps/terminal/src/app/store.ts';

function fixture(){
 const store=new EventStore('objects',()=>1);store.append({kind:'note',subject:'terminal.user',data:{text:'Make restart reliable'}});
 const o=createObjective(store,'Make restart reliable','',store.revision);
 store.append({kind:'note',subject:'terminal.objective',data:{version:1,operation:'describe',id:o.id,expected:o.revision,text:'Inspect receipts before replay',criteria:['No duplicate writes'],constraints:['Preserve files'],exclusions:['No provider change'],dependencies:[],rationale:'A restart can replay work'}});
 const revision=store.revision,seq=revision+1;
 store.append({kind:'note',subject:'terminal.work',data:{version:1,operation:'plan',id:'plan-1',revision:seq,phase:'build',rationale:'Keep receipts durable',spec:'Receipt before next effect.',tasks:['Inspect replay'],taskRecords:[{id:'task-1',text:'Inspect replay',expected:'No duplicate writes',dependencies:[],revision:seq}],objectiveId:o.id,objectiveRevision:revision,against:revision}});
 return {store,id:o.id,revision};
}
test('semantic objects preserve original intent, attributed spec, expected result and exact references',()=>{
 const {store}=fixture(),before=store.revision,surface=projectWorkSurface(store.toSession().events);
 assert.equal(surface.intent,'Make restart reliable');assert.deepEqual(surface.criteria,['No duplicate writes']);
 assert.match(surface.objects![0]!.detail,/Interpretation · model/);assert.match(surface.objects![0]!.detail,/No provider change/);
 const task=surface.objects!.find(o=>o.kind==='task')!;assert.match(task.detail,/Expected result\nNo duplicate writes/);
 assert.match(surface.objects!.find(o=>o.kind==='plan')!.detail,/Receipt before next effect/);
 assert.match((resolveWorkReference(surface,task.reference!,'Only inspect') as {text:string}).text,/journal #4/);
 assert.equal(store.revision,before,'inspection is passive');
 const c=store.append({kind:'directive',subject:'builder',data:{text:'Do not edit'}});correctObjective(store,'Do not edit',c.seq);
 const current=projectWorkSurface(store.toSession().events);assert.ok('error' in resolveWorkReference(current,task.reference!,'Only inspect'));assert.equal(current.objects!.filter(o=>o.kind==='task').length,0);
});
test('unverified text and stale check receipts cannot create current proof; code proposal stays a contribution',()=>{
 const {store,id,revision}=fixture();store.append({kind:'note',subject:'terminal.agent',data:{version:1,id:'agent',role:'review',task:'Check restart',model:'fixture',phase:'result',text:'VERIFIED',objectiveId:id,objectiveRevision:revision}});
 store.append({kind:'note',subject:'terminal.code-worker',data:{version:1,id:'agent',task:'Check restart',phase:'proposal',workspace:'/fixture/worktree',objectiveId:id,objectiveRevision:revision}});
 store.append({kind:'work_verified',subject:'worker',data:{verdict:'VERIFIED',record:'old',objectiveId:id,objectiveRevision:revision-1,checkDigest:'a'.repeat(64)}});
 const objects=projectWorkSurface(store.toSession().events).objects!;
 assert.equal(objects.some(o=>o.kind==='verification'),false);assert.equal(objects.find(o=>o.kind==='agent')!.status,'proposal · unverified');assert.equal(objects.find(o=>o.kind==='contribution')!.status,'review required');
});
test('real controller records targeted correction while inference waits; duplicate stale reference cannot execute',async()=>{
 const store=createStore();let release!:()=>void,arrive!:()=>void;const pending=new Promise<void>(r=>release=r),started=new Promise<void>(r=>arrive=r);let tools=0,calls=0;
 const producer=createProducer({store,cwd:'/fixture',identities:[],maxSlices:1,model:{name:'fixture',async infer(){calls++;arrive();await pending;return {text:'Stopped',toolCalls:[]}}},tools:{async run(){tools++;throw Error('no effects')}}});
 producer.say('qzfixture');await started;
 const intent=producer.workSurface!().objects!.find(o=>o.kind==='intent')!;
 assert.deepEqual(producer.steerAt!(intent.reference!,'Preserve my files'),{ok:true});
 const current=producer.workSurface!();assert.match(current.corrections.at(-1)!,/Preserve my files/);assert.equal(current.corrections.at(-1),'Preserve my files');
 assert.ok('error' in producer.steerAt!(intent.reference!,'obsolete correction'));assert.equal(current.corrections.length,1);assert.equal(tools,0);assert.equal(calls,1);
 producer.cancel!();release();const end=Date.now()+2500;while(store.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(store.get().busy,false);
});
test('targeted correction survives the real durable journal and passive reopen without repeating effects',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {TerminalSession}=await import('../src/adapters/terminal-session.ts');const {persistentView}=await import('../apps/terminal/src/producer/session-view.ts');
 const root=mkdtempSync(join(tmpdir(),'cs-target-durable-'));let session:InstanceType<typeof TerminalSession>|undefined;let restored:InstanceType<typeof TerminalSession>|undefined;
 try{
  session=new TerminalSession({root:join(root,'sessions'),cwd:root});const view=persistentView(session);let arrive!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>arrive=r),wait=new Promise<void>(r=>release=r);
  const producer=createProducer({store:view,journal:session,cwd:root,identities:[],maxSlices:1,model:{name:'fixture',async infer(){arrive();await wait;return {text:'',toolCalls:[]}}},tools:{async run(){throw Error('no effects')}}});
  producer.say('qzfixture');await ready;const reference=producer.workSurface!().objects![0]!.reference!;
  assert.deepEqual(producer.steerAt!(reference,'Keep the public API'),{ok:true});producer.cancel!();release();for(let i=0;i<100&&view.get().busy;i++)await new Promise(r=>setTimeout(r,5));assert.equal(view.get().busy,false);
  const id=session.metadata.id;session.close();restored=new TerminalSession({root:join(root,'sessions'),cwd:root,id});const before=restored.core.revision;
  const directive=restored.core.toSession().events.find(e=>e.kind==='directive'&&e.data.workReference)!;assert.deepEqual(directive.data.workReference,reference);assert.equal(directive.data.instruction,'Keep the public API');assert.match(String(directive.data.text),/Selected work: intent/);
  let calls=0;const reopened=createProducer({store:persistentView(restored),journal:restored,cwd:root,identities:[],model:{name:'fixture',async infer(){calls++;return {text:'',toolCalls:[]}}},tools:{async run(){throw Error('no effects')}}});
  assert.deepEqual(reopened.workSurface!().corrections,['Keep the public API']);assert.equal(calls,0);assert.equal(restored.core.revision,before);
 }finally{session?.close();restored?.close();rmSync(root,{recursive:true,force:true});}
});
