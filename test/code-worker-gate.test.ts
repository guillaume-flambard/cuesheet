/**
 * Pending-batch gate: legibility and a bounded model set-aside.
 *
 * GT01: a pending-batch refusal must name the action that actually clears it.
 *       Inspection, reconciliation and reconcile_effect provably cannot, and a
 *       refusal that sends the model to inspect is a loop generator.
 * GT02: the model had no operation that could clear the gate. It is now given one
 *       with deliberately narrow authority, refusing against recoverable work.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {TerminalSession} from '../src/adapters/terminal-session.ts';
import {ShellToolRunner} from '../src/adapters/shell.ts';
import {createProducer} from '../apps/terminal/src/producer/index.ts';
import {createStore} from '../apps/terminal/src/app/store.ts';
import {childEnv} from './fixtures/hermetic-env.ts';
import {pendingCodeWorkers} from '../src/adapters/terminal-code-workers.ts';
import {createCompletionCheck} from '../src/adapters/surface-verification.ts';
import {projectObjectives} from '../src/adapters/objectives.ts';

const tasks={tasks:[{role:'builder',task:'Build useful file',files:['built']}]};
type Call={name:string;input:unknown};

function factory(scope:string,root:string){return Object.assign(new ShellToolRunner({allow:['node','cat','ls'],roots:[scope],defaultCwd:scope,env:childEnv({home:root,sessions:root})}),{names:['node','cat','ls']});}

interface Run{events:readonly any[];producer:any;git:(...a:string[])=>string;source:string;head:string;index:string;close():void;}

/**
 * A real git source, a real TerminalSession and the real producer. The worker model
 * and the controller script are supplied per test; everything else is production code.
 */
async function run(script:Call[],options:{worker:any;nullStatusWorker?:boolean;onWorker?:(path:string,journal:TerminalSession)=>void;correctMidRun?:string;release?:()=>void;gateEntered?:Promise<void>}={}):Promise<Run>{
  // Each step is a real controller turn; `stopAt` bounds how far the script runs.
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'cs-gate-'))),source=join(dir,'source'),root=join(dir,'state');mkdirSync(source);mkdirSync(root);
  const git=(...a:string[])=>execFileSync('git',a,{cwd:source,env:childEnv({home:dir,sessions:root}),encoding:'utf8'}).trim();
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  writeFileSync(join(source,'file'),'base');git('add','.');git('commit','-qm','base');
  const head=git('rev-parse','HEAD'),index=git('diff','--cached');
  // A real pinned check, as the working suites provide. Without it the controller
  // has no frame for the worker route and refuses before any allocation.
  const scriptPath=join(root,'check.mjs');
  writeFileSync(scriptPath,'import assert from "node:assert/strict";\n');
  const verification=createCompletionCheck({script:scriptPath,root:join(root,'proof')});
  const journal=new TerminalSession({root,cwd:source,check:verification.pinned}),view=createStore();
  let step=0,corrected=false,producer:any;
  try{
    producer=createProducer({store:view,journal,cwd:source,identities:[],maxSlices:1,verification,
      worktreeRoot:join(root,'workspaces',journal.metadata.id),tools:factory(source,root),toolsForScope:(p:string)=>factory(p,root),
      toolsForWorker:(path:string,child:TerminalSession,signal:AbortSignal)=>{
        options.onWorker?.(path,child);
        if(options.nullStatusWorker)return {names:['node'],async run(request:any){return {name:request.name,exit:null,output:'admitted but unconfirmed'};}};
        const runner=factory(path,root);return Object.assign({run:(request:any)=>runner.run(request,signal)},{names:runner.names});},
      workerModel:options.worker,
      model:{name:'controller',async infer(){
        // The script is exhausted after its last entry: return no tool call so the
        // controller stops. Repeating the last entry would let later turns act again.
        const call=step<script.length?script[step]:null;step++;
        return {text:'',toolCalls:call===null?[]:[{name:call.name,input:call.input}]};
      }}});
    producer.say('qzgate fixture');
    const until=Date.now()+20000;
    while(view.get().busy&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
    if(options.correctMidRun){
      // Deliver the correction the way the surface does, while the worker is still
      // in flight: a user submission advances the objective revision, which makes
      // the admitted batch superseded. Then release the worker so it ends uncertain.
      if(options.gateEntered){
        // Wait for the worker to be genuinely blocked in flight, not merely admitted,
        // then correct through the same path the surface uses during a live run.
        await Promise.race([options.gateEntered,new Promise((_,reject)=>setTimeout(()=>reject(Error('worker never entered the gate')),10000))]);
        producer.say!(options.correctMidRun);
        options.release!();
      } else {
        // No in-flight worker: steer still corrects the objective and resumes the
        // controller, which is how a durable proposal becomes superseded.
        assert.equal(producer.steer!(options.correctMidRun),true,'the correction must be accepted');
      }
      const after=Date.now()+20000;
      while(view.get().busy&&Date.now()<after)await new Promise(r=>setTimeout(r,10));
    }
    return {events:journal.core.toSession().events,producer,git,source,head,index,close(){journal.close();rmSync(dir,{recursive:true,force:true});}};
  }catch(error){journal.close();rmSync(dir,{recursive:true,force:true});throw error;}
}

/**
 * A worker that leaves an uncertain private effect and never produces a proposal.
 * Uncertainty is produced the way production produces it: the executor is admitted
 * and then returns a null status, so no receipt is ever written.
 */
function uncertainWorker(gate?:Gate){
  return (path:string)=>({label:'gate-worker',adapter:{name:'gate-worker',async infer(){
    if(gate)await gate.hold();
    return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e','possibly ran']}}]};
  }}});
}

/**
 * A one-shot barrier. `entered` settles once the worker is actually blocked inside
 * it, so the fixture never releases before the worker is really in flight.
 */
interface Gate{hold():Promise<void>;entered:Promise<void>;open():void;}
function makeGate():Gate{
  let open!:()=>void,entered!:()=>void;
  const release=new Promise<void>(r=>open=r),arrived=new Promise<void>(r=>entered=r);
  return {hold:async()=>{entered();await release;},entered:arrived,open};
}

/**
 * A worker that writes a real contribution and then proposes, so a durable
 * proposal is recoverable. The write goes through the real shell executor, so the
 * receipt exists and the proposal is genuine rather than asserted.
 */
function proposalWorker(){
  return ()=>{let step=0;return {label:'proposal-worker',adapter:{name:'proposal-worker',async infer(){
    if(++step===1)return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('built','coded')"]}}]};
    return {text:'a durable unverified proposal',toolCalls:[]};
  }}};};
}
function gatedProposalWorker(gate:Gate){
  return ()=>{let step=0;return {label:'proposal-worker',adapter:{name:'proposal-worker',async infer(){
    if(step++===0){await gate.hold();return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('built','coded')"]}}]};}
    return {text:'a durable unverified proposal',toolCalls:[]};
  }}};};
}

test('GT01: pending-batch refusals name the operation that clears the gate',async()=>{
  // Two distinct gates can refuse here, and both must name the clearing operation.
  // The reconcile_effect gate fires first when the worker intent itself is uncertain.
  const r=await run([{name:'run_code_workers',input:tasks},{name:'run_code_workers',input:tasks},{name:'finish',input:{}}],{worker:uncertainWorker(),nullStatusWorker:true});
  try{
    assert.ok(pendingCodeWorkers(r.events),'the batch is pending');
    const refusals=r.events.filter((e:any)=>e.kind==='observation'&&e.data.exit===126&&/run_code_workers|finish/.test(String(e.data.tool)));
    assert.ok(refusals.length>0,'a pending batch must refuse further delegation and closure');
    for(const refusal of refusals){
      const output=String(refusal.data.output);
      assert.match(output,/set_aside_code_workers/,`refusal must name the clearing operation: ${output}`);
      assert.match(output,/changes/,`refusal must name the human path: ${output}`);
    }
    // Whichever gate fired, the model must be told the two are separate obligations.
    const effectGate=refusals.find((x:any)=>/reconcile_effect/.test(String(x.data.output)));
    if(effectGate)assert.match(String(effectGate.data.output),/cannot clear a pending worker batch/i,
      'the reconcile_effect refusal must say it cannot clear a worker batch');
  }finally{r.close();}
});

test('GT02: model set-aside clears the gate without applying, integrating or verifying anything',async()=>{
  const r=await run([{name:'run_code_workers',input:tasks},{name:'set_aside_code_workers',input:{}},{name:'finish',input:{}}],{worker:uncertainWorker(),nullStatusWorker:true});
  try{
    // The set-aside has already run by the time the harness settles, so assert on
    // the durable record rather than on the live pending flag.
    const batchRejections=r.events.filter((e:any)=>e.kind==='note'&&e.subject==='terminal.code-workers'&&e.data.phase==='rejected');
    assert.equal(batchRejections.length,1,'the batch was set aside exactly once');
    const aside=r.events.filter((e:any)=>e.kind==='observation'&&e.data.tool==='set_aside_code_workers');
    assert.equal(aside.length,1);
    assert.equal(aside[0]!.data.exit,0,`set-aside must succeed: ${String(aside[0]!.data.output)}`);
    const rejections=r.events.filter((e:any)=>e.kind==='note'&&e.subject==='terminal.code-workers'&&e.data.phase==='rejected');
    assert.equal(rejections.length,1);
    assert.equal(rejections[0]!.data.human,false,'model set-aside must not claim human authority');
    assert.match(String(rejections[0]!.data.authority),/model set-aside/);
    assert.equal(r.events.some((e:any)=>e.kind==='work_verified'),false,'set-aside must never verify');
    assert.equal(existsSync(join(r.source,'built')),false,'no file may reach the source');
    assert.equal(r.git('rev-parse','HEAD'),r.head,'HEAD preserved');
    assert.equal(r.git('diff','--cached'),r.index,'index preserved');
  }finally{r.close();}
});

test('GT02: set-aside preserves every workspace, journal and receipt',async()=>{
  const r=await run([{name:'run_code_workers',input:tasks},{name:'set_aside_code_workers',input:{}}],{worker:uncertainWorker(),nullStatusWorker:true});
  try{
    const worker=r.events.filter((e:any)=>e.subject==='terminal.code-worker').at(-1)!;
    assert.equal(worker.data.phase,'rejected');
    assert.match(String(worker.data.authority),/preserved/);
    const workspace=String(worker.data.workspace);
    assert.ok(existsSync(workspace),'the isolated workspace must still exist');
    const child=new TerminalSession({root:String(worker.data.journalRoot),cwd:workspace,id:String(worker.data.journal)});
    try{
      assert.ok(child.core.toSession().events.some((e:any)=>e.kind==='action'&&e.subject==='terminal.intent'),
        'the uncertain intent receipt must survive the set-aside');
    }finally{child.close();}
  }finally{r.close();}
});

test('SA03: set-aside refuses against a recoverable durable proposal and names /changes',async()=>{
  const r=await run([{name:'run_code_workers',input:tasks},{name:'set_aside_code_workers',input:{}},{name:'set_aside_code_workers',input:{}}],{worker:proposalWorker()});
  try{
    const calls=r.events.filter((e:any)=>e.kind==='observation'&&e.data.tool==='set_aside_code_workers');
    assert.ok(calls.length>=1);
    const refused=calls.find((c:any)=>c.data.exit===126);
    assert.ok(refused,'a recoverable proposal must refuse the model set-aside');
    assert.match(String(refused!.data.output),/changes/,'refusal must name the human path');
    assert.match(String(refused!.data.output),/does not discard/i,'refusal must state the model does not discard real work');
    assert.equal(r.events.some((e:any)=>e.subject==='terminal.code-workers'&&e.data.phase==='rejected'),false,
      'no batch may be set aside while a proposal is recoverable');
  }finally{r.close();}
});

test('SA05: a repeated set-aside is a no-op that does not grow the journal',async()=>{
  const r=await run([{name:'run_code_workers',input:tasks},{name:'set_aside_code_workers',input:{}},{name:'set_aside_code_workers',input:{}},{name:'set_aside_code_workers',input:{}}],{worker:uncertainWorker(),nullStatusWorker:true});
  try{
    const batchRejections=r.events.filter((e:any)=>e.kind==='note'&&e.subject==='terminal.code-workers'&&e.data.phase==='rejected');
    assert.equal(batchRejections.length,1,'exactly one set-aside record, however many retries');
    const ids=new Set(r.events.filter((e:any)=>e.subject==='terminal.code-worker'&&typeof e.data.id==='string').map((e:any)=>e.data.id));
    const workerRejections=r.events.filter((e:any)=>e.kind==='note'&&e.subject==='terminal.code-worker'&&e.data.phase==='rejected');
    assert.equal(workerRejections.length,ids.size,'one worker record per admitted worker');
  }finally{r.close();}
});

test('SA04: set-aside accepts only {} and refuses every other input',async()=>{
  // Each bad input is issued as a real controller tool call, so the guard under
  // test is the producer's own input validation.
  const bad=[[],{workerId:'external'},{x:1},'set aside'];
  const script=[{name:'run_code_workers',input:tasks},...bad.map(input=>({name:'set_aside_code_workers',input}))];
  const r=await run(script,{worker:uncertainWorker(),nullStatusWorker:true});
  try{
    assert.ok(pendingCodeWorkers(r.events),'the batch is pending, so a refusal proves the input guard');
    const calls=r.events.filter((e:any)=>e.kind==='observation'&&e.data.tool==='set_aside_code_workers');
    assert.equal(calls.length,bad.length,`every bad input must be observed once: ${JSON.stringify(bad)}`);
    for(const call of calls)assert.equal(call.data.exit,126,`bad input must refuse: ${String(call.data.output)}`);
    assert.ok(pendingCodeWorkers(r.events),'a refused input must not clear the gate');
    assert.equal(r.events.some((e:any)=>e.subject==='terminal.code-workers'&&e.data.phase==='rejected'),false,
      'no batch may be set aside from a refused input');
  }finally{r.close();}
});

test('SA07: a batch superseded by a live correction can be set aside',async()=>{
  // This is the C02 shape. A worker is admitted, then a human correction advances
  // the objective revision, so the batch's own revision is now behind. The batch is
  // historical and cannot integrate, and refusing to set it aside strands the gate.
  const gate=makeGate();
  const r=await run([{name:'run_code_workers',input:tasks},{name:'set_aside_code_workers',input:{}}],
    {worker:uncertainWorker(gate),nullStatusWorker:true,correctMidRun:'Correction: missing catalogue versions must also warn',release:gate.open,gateEntered:gate.entered});
  try{
    const objectives=r.events.filter((e:any)=>e.kind==='note'&&e.subject==='terminal.objective');
    const corrected=objectives.find((e:any)=>e.data.operation==='correct');
    assert.ok(corrected,`the live correction must have advanced the objective: ${JSON.stringify(objectives.map((e:any)=>e.data.operation))}`);
    const admitted=r.events.find((e:any)=>e.subject==='terminal.code-worker'&&e.data.phase==='admitted')!;
    const current=projectObjectives(r.events as any).current;
    assert.ok(current&&current.revision>Number(admitted.data.objectiveRevision),
      `the correction must supersede the batch revision: batch ${admitted.data.objectiveRevision} vs current ${current?.revision}`);
    assert.equal(corrected!.data.expected,Number(admitted.data.objectiveRevision),
      'the correction was recorded against the revision the batch was admitted under');
    const calls=r.events.filter((e:any)=>e.kind==='observation'&&e.data.tool==='set_aside_code_workers');
    assert.equal(calls.length,1);
    assert.equal(calls[0]!.data.exit,0,`a superseded batch must be clearable: ${String(calls[0]!.data.output)}`);
    const rejections=r.events.filter((e:any)=>e.kind==='note'&&e.subject==='terminal.code-workers'&&e.data.phase==='rejected');
    assert.equal(rejections.length,1);
    assert.equal(rejections[0]!.data.human,false,'still a model decision, not a human one');
    assert.equal(r.events.some((e:any)=>e.kind==='work_verified'),false,'a set-aside never verifies');
    assert.equal(existsSync(join(r.source,'built')),false,'no file may reach the source');
    assert.equal(r.git('rev-parse','HEAD'),r.head,'HEAD preserved');
  }finally{r.close();}
});

test('SA08: a superseded batch holding a recoverable proposal still refuses',async()=>{
  // The supersession allowance must not become a way to discard real work. A batch
  // that is both behind the revision and still holding a durable proposal refuses.
  // The proposal is durable first, then the human revises the intention, so the
  // batch is superseded *and* still holds recoverable work. The model must refuse.
  const r=await run([{name:'run_code_workers',input:tasks},{name:'set_aside_code_workers',input:{}}],
    {worker:proposalWorker(),correctMidRun:'Correction: missing catalogue versions must also warn'});
  try{
    const calls=r.events.filter((e:any)=>e.kind==='observation'&&e.data.tool==='set_aside_code_workers');
    assert.ok(calls.length>=1);
    const refused=calls.find((c:any)=>c.data.exit===126);
    assert.ok(refused,'a superseded batch with a recoverable proposal must still refuse');
    assert.match(String(refused!.data.output),/changes/,'refusal must name the human path');
    assert.equal(r.events.some((e:any)=>e.subject==='terminal.code-workers'&&e.data.phase==='rejected'),false,
      'no batch may be set aside while a proposal is recoverable');
  }finally{r.close();}
});

test('SA06: the Agents projection names the operation that clears the gate',async()=>{
  const r=await run([{name:'run_code_workers',input:tasks}],{worker:uncertainWorker(),nullStatusWorker:true});
  try{
    assert.ok(pendingCodeWorkers(r.events));
    assert.ok(r.producer.agentPage!().lines.join('\n').includes('set_aside_code_workers'),
      'the Agents projection must name the clearing operation');
    assert.match(r.producer.agentPage!().lines.join('\n'),/\/changes set aside/,
      'the Agents projection must name the human path');
  }finally{r.close();}
});
