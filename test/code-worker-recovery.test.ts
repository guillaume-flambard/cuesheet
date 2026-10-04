import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,readdirSync,renameSync,rmSync,symlinkSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {TerminalSession} from '../src/adapters/terminal-session.ts';
import {createCompletionCheck} from '../src/adapters/surface-verification.ts';
import {inspectCodeWorkerRecovery,reconcileCodeWorkerRecovery,codeWorkerRecoverySummary,validCodeWorkerRecoveryInput,boundedCodeWorkerRecoveryOutput} from '../src/adapters/code-worker-recovery.ts';
import {integrateCodeWorkers} from '../src/adapters/code-worker-integration.ts';
import {pendingCodeWorkers} from '../src/adapters/terminal-code-workers.ts';
import {projectAgents} from '../src/adapters/agent-consultation.ts';
import {childEnv} from './fixtures/hermetic-env.ts';
import {createProducer} from '../apps/terminal/src/producer/index.ts';
import {createStore} from '../apps/terminal/src/app/store.ts';
import {projectEffectAttempts} from '../src/adapters/tool-receipts.ts';

const objective={id:'objective-recovery',revision:1};
const packets={tasks:[{role:'builder',task:'Write one scoped contribution',files:['contribution']}]};

test('recovery controller input and output have strict bounded shapes',()=>{
  assert.equal(validCodeWorkerRecoveryInput({}),true);
  for(const invalid of [null,undefined,[],{workerId:'w-1'},{x:1}])assert.equal(validCodeWorkerRecoveryInput(invalid),false);
  assert.equal(boundedCodeWorkerRecoveryOutput({ok:true}),'{"ok":true}');
  assert.equal(boundedCodeWorkerRecoveryOutput('x'.repeat(20_000)),null);
});

async function fixture(run:(source:string,root:string,worktreeRoot:string,git:(...args:string[])=>string)=>Promise<void>){
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'cs-code-worker-recovery-'))),source=join(dir,'source'),root=join(dir,'sessions'),worktreeRoot=join(dir,'worktrees');mkdirSync(source);mkdirSync(root);mkdirSync(worktreeRoot);
  const git=(...args:string[])=>execFileSync('git',args,{cwd:source,env:childEnv({home:dir,sessions:root}),encoding:'utf8'}).trim();
  try{git('init','-q');git('config','user.name','Recovery Fixture');git('config','user.email','recovery@example.invalid');writeFileSync(join(source,'base'),'base');git('add','.');git('commit','-qm','base');await run(source,root,worktreeRoot,git);}finally{rmSync(dir,{recursive:true,force:true});}
}

function childScript(mode:'uncertain'|'proposal',options:{source:string;root:string;worktreeRoot:string;parentId:string;signalFile:string}):string{
  const session=pathToFileURL(join(process.cwd(),'src/adapters/terminal-session.ts')).href;
  const workers=pathToFileURL(join(process.cwd(),'src/adapters/terminal-code-workers.ts')).href;
  return `
    import {writeFileSync} from 'node:fs';
    import {join} from 'node:path';
    import {TerminalSession} from ${JSON.stringify(session)};
    import {runTerminalCodeWorkers} from ${JSON.stringify(workers)};
    const parent=new TerminalSession({root:${JSON.stringify(options.root)},cwd:${JSON.stringify(options.source)},id:${JSON.stringify(options.parentId)}});
    if(${JSON.stringify(mode)}==='proposal'){
      const append=parent.core.append.bind(parent.core);
      parent.core.append=(event)=>{
        if(event.kind==='note'&&event.subject==='terminal.agent'&&event.data.phase==='result'){
          process.stdout.write('RECOVERY_PRIVATE_PROPOSAL_DURABLE\\n');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60_000);
        }
        return append(event);
      };
    }
    let calls=0;
    const route={name:'recovery-fixture',async infer(){calls++;return calls===1
      ?{text:'',toolCalls:[{name:'node',input:{}}]}
      :{text:'durable but unverified proposal',toolCalls:[]};}};
    const run=runTerminalCodeWorkers({input:${JSON.stringify(packets)},source:${JSON.stringify(options.source)},root:${JSON.stringify(options.worktreeRoot)},parent,shared:parent.core,
      execution:'recovery-execution',objective:${JSON.stringify(objective)},signal:new AbortController().signal,current:()=>true,
      route:()=>({adapter:route,label:'recovery-fixture'}),
       tools:scope=>({names:['node'],async run(){writeFileSync(join(scope,'contribution'),${JSON.stringify(mode==='uncertain'?'effect happened once':'proposal effect confirmed')});
         if(${JSON.stringify(mode)}==='uncertain'){setInterval(()=>{},1000);process.stdout.write('RECOVERY_EFFECT_WRITTEN\\n');return new Promise(()=>{});}
        return {name:'node',exit:0,output:'write observed'};}}),
      frame:(role,model)=>({goal:'recovery goal',history:[],directives:[],evidence:[],capabilities:[],model,step:0}),
      skills:()=>({references:[],instructions:'',warnings:[],current:()=>true}),notice:()=>{}});
    await run;
  `;
}

async function killAtDurableBoundary(mode:'uncertain'|'proposal',source:string,root:string,worktreeRoot:string,parent:TerminalSession){
  const signalFile=join(root,`boundary-${mode}.txt`);const script=childScript(mode,{source,root,worktreeRoot,parentId:parent.metadata.id,signalFile});
  const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:childEnv({home:root,sessions:root}),stdio:['ignore','pipe','pipe']});
  let exitListenerAttached=false;
  const processExit=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolveExit=>{
    const onExit=(code:number|null,signal:NodeJS.Signals|null)=>resolveExit({code,signal});
    if(child.exitCode!==null||child.signalCode!==null)onExit(child.exitCode,child.signalCode);
    else{child.once('exit',onExit);exitListenerAttached=true;}
  });
  let output='',error='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',text=>{output+=text;});child.stderr.on('data',text=>{error+=text;});
  const expected=mode==='uncertain'?'RECOVERY_EFFECT_WRITTEN':'RECOVERY_PRIVATE_PROPOSAL_DURABLE';
  const until=Date.now()+15000;
  while(!output.includes(expected)&&Date.now()<until&&child.exitCode===null){await new Promise(r=>setTimeout(r,10));}
  if(!output.includes(expected)){child.kill('SIGKILL');throw new Error(`controller never reached the durable boundary (exit=${child.exitCode},signal=${child.signalCode}); stderr=${error.slice(-1000)} stdout=${output.slice(-1000)}`);}
  assert.ok(exitListenerAttached||child.exitCode!==null||child.signalCode!==null,'the process exit listener is installed before issuing SIGKILL');
  assert.equal(child.kill('SIGKILL'),true,'the child remains alive at the durable boundary until the parent kills it');
  const exited=await Promise.race([processExit,new Promise<never>((_resolveExit,reject)=>setTimeout(()=>reject(new Error('killed controller did not exit')),5000))]);
  assert.equal(exited.signal,'SIGKILL',`controller did not die by SIGKILL; code=${exited.code}, stderr=${error.slice(-1000)}`);
  return {output,error};
}

function recoveryArgs(journal:TerminalSession,source:string,worktreeRoot:string,objectiveOverride=objective){
  return {events:journal.core.toSession().events,parentRoot:journal.root,parentId:journal.metadata.id,worktreeRoot,source,objective:objectiveOverride};
}

for(const mode of ['confirmed','late-confirmed','unconfirmed','throws'] as const)test(`producer cancellation preserves ${mode} tool evidence without replay or goal closure`,async()=>fixture(async(source,root)=>{
  const journal=new TerminalSession({root,cwd:source}),view=createStore();let effects=0;
  const producer=createProducer({store:view,journal,cwd:source,identities:[],maxSlices:1,toolNames:['node'],
    model:{name:'cancel-boundary',async infer(){return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e','effect']}}]};}},
    tools:{async run(){effects++;producer.cancel();if(mode==='throws')throw Error('execution unconfirmed');if(mode==='late-confirmed')await new Promise(resolve=>setTimeout(resolve,30));return {name:'node',exit:mode==='confirmed'||mode==='late-confirmed'?0:null,output:'effect boundary'};}}});
  try{
    producer.say('Perform the scoped change');const until=Date.now()+5000;
    while(view.get().busy&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(view.get().busy,false);assert.equal(effects,1);
    if(mode==='late-confirmed'){
      assert.equal(projectEffectAttempts(journal.core.toSession().events)[0]!.phase,'uncertain','cancellation returns while executor completion remains unknown');
      const receiptDeadline=Date.now()+1000;
      while(projectEffectAttempts(journal.core.toSession().events)[0]!.phase==='uncertain'&&Date.now()<receiptDeadline)await new Promise(resolve=>setTimeout(resolve,5));
    }
    const events=journal.core.toSession().events,attempts=projectEffectAttempts(events);
    assert.equal(attempts.length,1);
    assert.equal(attempts[0]!.phase,mode==='confirmed'||mode==='late-confirmed'?'completed':'uncertain');
    assert.equal(events.filter(event=>event.subject==='terminal.receipt').length,mode==='confirmed'||mode==='late-confirmed'?1:0);
    assert.equal(events.some(event=>event.kind==='work_verified'),false);
    assert.notEqual(journal.core.toSession().goal?.open,false);
  }finally{producer.cancel();journal.close();}
}));

test('killed controller reopens as interrupted; an effect written before receipt stays uncertain and cannot replay',async()=>fixture(async(source,root,worktreeRoot)=>{
  const parent=new TerminalSession({root,cwd:source});const id=parent.metadata.id;
  parent.close();
  await killAtDurableBoundary('uncertain',source,root,worktreeRoot,parent);
  const reopened=new TerminalSession({root,cwd:source,id});
  try{
    const events=reopened.core.toSession().events;
    assert.ok(pendingCodeWorkers(events));
    assert.equal(projectAgents(events).find(agent=>agent.role==='builder')!.phase,'interrupted');
    const before=reopened.core.revision;
    const first=await inspectCodeWorkerRecovery(recoveryArgs(reopened,source,worktreeRoot));
    const second=await inspectCodeWorkerRecovery(recoveryArgs(reopened,source,worktreeRoot));
    assert.deepEqual(codeWorkerRecoverySummary(first),codeWorkerRecoverySummary(second),'unchanged physical observations produce a deterministic report');
    assert.equal(first.workers[0]!.phase,'effect-uncertain');
    assert.equal(first.workers[0]!.uncertainEffects,1);
    const admitted=events.find(event=>event.subject==='terminal.code-worker'&&event.data.phase==='admitted')!;
    reopened.core.append({kind:'note',subject:'terminal.code-worker',data:{...admitted.data,phase:'uncertain'}});
    const interrupted=await inspectCodeWorkerRecovery(recoveryArgs(reopened,source,worktreeRoot));
    assert.equal(interrupted.workers[0]!.phase,'effect-uncertain','later uncertainty preserves admission and inspects private receipts');
    assert.equal(interrupted.workers[0]!.uncertainEffects,1);
    const superseded=await inspectCodeWorkerRecovery(recoveryArgs(reopened,source,worktreeRoot,{...objective,revision:2}));
    assert.equal(superseded.workers[0]!.phase,'stale','obsolete admission never authorizes the revised task');
    const tampered=reopened.core.toSession().events.map(event=>event.subject==='terminal.code-worker'&&event.data.phase==='uncertain'?{...event,data:{...event.data,workspace:'/tmp/untrusted-worker'}}:event);
    const rejected=await inspectCodeWorkerRecovery({...recoveryArgs(reopened,source,worktreeRoot),events:tampered});
    assert.equal(rejected.workers[0]!.phase,'blocked');
    assert.match(rejected.workers[0]!.reason,/disagrees/);
    const workspace=first.workers[0]!.workspace;
    assert.equal(readFileSync(join(workspace,'contribution'),'utf8'),'effect happened once');
    assert.equal(existsSync(join(workspace,'contribution')),true);
    assert.equal(reopened.core.revision,before+1,'only the explicit uncertain state was appended; inspection appends no completion');
    let replayEffects=0;
    const retried=await (await import('../src/adapters/terminal-code-workers.ts')).runTerminalCodeWorkers({input:packets,source,root:worktreeRoot,parent:reopened,shared:reopened.core,
      execution:'recovery-execution-2',objective,signal:new AbortController().signal,current:()=>true,route:()=>({adapter:{name:'unused',async infer(){throw Error('pending work must block replay');}},label:'unused'}),
      tools:()=>({names:['node'],async run(){replayEffects++;return {name:'node',exit:0,output:''};}}),
      frame:()=>({goal:'unused',history:[],directives:[],evidence:[],capabilities:[],model:'unused',step:0}),skills:()=>({references:[],instructions:'',warnings:[],current:()=>true}),notice:()=>{}});
    assert.equal(retried.exit,126);assert.equal(replayEffects,0,'a second effect was never invoked');
    const checkFile=join(root,'uncertain-owner.mjs');writeFileSync(checkFile,'process.exit(0)');
    const check=createCompletionCheck({script:checkFile,root:join(root,'uncertain-proofs')});
    const refused=await integrateCodeWorkers({shared:reopened.core,parent:reopened,root:worktreeRoot,source,objective,check,execution:'recovery-execution',signal:new AbortController().signal,current:()=>true});
    assert.equal(refused.exit,126);assert.equal(existsSync(join(source,'contribution')),false);
    const view=createStore();let controllerStep=0;
    const producer=createProducer({store:view,journal:reopened,cwd:source,identities:[],maxSlices:1,verification:check,worktreeRoot,
      tools:{async run(){throw Error('uncertain recovery never runs another effect');}},toolsForScope:()=>({async run(){throw Error('no source effects');}}),toolsForWorker:()=>{throw Error('no worker replay');},workerModel:()=>{throw Error('no worker inference');},
      model:{name:'controller',async infer(){return {text:'',toolCalls:++controllerStep===1?[{name:'finish',input:{}}]:[]};}}});
    producer.say('Inspect interrupted work');const until=Date.now()+10000;while(view.get().busy&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(view.get().busy,false);
    assert.ok(reopened.core.toSession().events.some(event=>event.kind==='observation'&&event.data.tool==='finish'&&event.data.exit===126&&String(event.data.output).includes('pending')),'actual interrupted contribution blocks public finish');

    assert.equal(readFileSync(join(workspace,'contribution'),'utf8'),'effect happened once');
  }finally{reopened.close();}
}));

test('private proposal survives publication crash, rejects stale/live/corrupt evidence, then uses ordinary owner integration',async()=>fixture(async(source,root,worktreeRoot)=>{
  const checkFile=join(root,'owner-check.mjs');writeFileSync(checkFile,"import {readFileSync} from 'node:fs';if(readFileSync('contribution','utf8')!=='proposal effect confirmed')process.exit(1);\n");
  const verification=createCompletionCheck({script:checkFile,root:join(root,'proofs')});
  const parent=new TerminalSession({root,cwd:source,check:verification.pinned});const id=parent.metadata.id;
  parent.close();await killAtDurableBoundary('proposal',source,root,worktreeRoot,parent);
  const reopened=new TerminalSession({root,cwd:source,id,check:verification.pinned});
  try{
    const args=recoveryArgs(reopened,source,worktreeRoot);const initial=await inspectCodeWorkerRecovery(args);const candidate=initial.workers[0]!;
    assert.equal(candidate.phase,'proposal-recoverable',JSON.stringify({candidate,workerEvents:reopened.core.toSession().events.filter(event=>event.data.id===candidate.id&&['terminal.code-worker','terminal.agent'].includes(event.subject)).map(event=>({subject:event.subject,phase:event.data.phase,seq:event.seq}))}));assert.equal(candidate.proposalText,'durable but unverified proposal');
    assert.equal(candidate.uncertainEffects,0);assert.equal(readFileSync(join(candidate.workspace,'contribution'),'utf8'),'proposal effect confirmed');
    const validEvents=reopened.core.toSession().events;
    for(const ids of [[candidate.id,candidate.id],[candidate.id,17]]){
      const tampered=validEvents.map(event=>event.subject==='terminal.code-workers'&&event.data.phase==='ready'?{...event,data:{...event.data,ids}}:event);
      const rejected=await inspectCodeWorkerRecovery({...args,events:tampered});assert.equal(rejected.kind,'blocked');assert.equal(rejected.workers.length,0);
    }
    const oversized=await inspectCodeWorkerRecovery({...args,events:Array.from({length:20_001},(_,index)=>({...validEvents[0]!,seq:index+1}))});
    assert.equal(oversized.kind,'blocked');assert.match(oversized.reason,/bounded recovery input/);
    const staleRevision=await inspectCodeWorkerRecovery({...args,objective:{id:objective.id,revision:objective.revision+1}});
    assert.equal(staleRevision.workers[0]!.phase,'stale');
    writeFileSync(join(source,'base'),'changed source');
    const staleSource=await inspectCodeWorkerRecovery(args);assert.equal(staleSource.workers[0]!.phase,'stale');
    writeFileSync(join(source,'base'),'base');

    const admittedEvent=reopened.core.toSession().events.find(e=>e.subject==='terminal.code-workers'&&e.data.id===candidate.id&&e.data.phase==='preparing')!;
    const untrustedEvents=reopened.core.toSession().events.map(event=>event===admittedEvent?{...event,data:{...event.data,path:'/tmp/untrusted-worker'}}:event);
    const untrusted=await inspectCodeWorkerRecovery({...args,events:untrustedEvents});assert.equal(untrusted.workers[0]!.phase,'blocked');

    const privateRoot=join(reopened.root,'workers',reopened.metadata.id);
    const privateJournal=new TerminalSession({root:privateRoot,cwd:candidate.workspace,id:candidate.journal});
    try{const live=await inspectCodeWorkerRecovery(args);assert.equal(live.workers[0]!.phase,'live');}finally{privateJournal.close();}
    const journalFile=join(privateRoot,`${candidate.journal}.jsonl`),savedBytes=readFileSync(journalFile);
    writeFileSync(journalFile,'{"seq":broken\n');
    try{const corrupt=await inspectCodeWorkerRecovery(args);assert.equal(corrupt.workers[0]!.phase,'blocked');}finally{writeFileSync(journalFile,savedBytes);}

    for(const badBytes of [Buffer.alloc(2*1024*1024+1,32),Buffer.from(savedBytes.toString().replace(candidate.proposalDigest!, '0'.repeat(64)))]){
      writeFileSync(journalFile,badBytes);
      try{const tampered=await inspectCodeWorkerRecovery(args);assert.equal(tampered.workers[0]!.phase,'blocked');}finally{writeFileSync(journalFile,savedBytes);}
    }
    const directory=candidate.workspace,held=directory+'.held-for-missing-workspace-proof';renameSync(directory,held);
    try{const missing=await inspectCodeWorkerRecovery(args);assert.equal(missing.workers[0]!.phase,'blocked');}finally{renameSync(held,directory);}

    renameSync(directory,held);symlinkSync(held,directory,'dir');
    try{const redirected=await inspectCodeWorkerRecovery(args);assert.equal(redirected.workers[0]!.phase,'blocked');}finally{unlinkSync(directory);renameSync(held,directory);}

    const startRevision=reopened.core.revision;let publicationCurrent=true;
    const partial=await reconcileCodeWorkerRecovery({events:()=>reopened.core.toSession().events,parentRoot:reopened.root,parentId:reopened.metadata.id,
      worktreeRoot,source,objective,current:()=>publicationCurrent,append:event=>{const stored=reopened.core.append(event);if(event.subject==='terminal.agent')publicationCurrent=false;return stored;}});
    assert.equal(partial.kind,'refused');assert.equal(reopened.core.revision,startRevision+1,'the first shared projection remains durable after partial publication');
    assert.equal(reopened.core.toSession().events.filter(event=>event.subject==='terminal.code-worker'&&event.data.id===candidate.id&&event.data.phase==='proposal').length,0);
    const originalAgent=validEvents.find(event=>event.subject==='terminal.agent'&&event.data.id===candidate.id)!;
    reopened.core.append({kind:'note',subject:'terminal.agent',data:originalAgent.data});
    const lostClaim=await reconcileCodeWorkerRecovery({events:()=>reopened.core.toSession().events,parentRoot:reopened.root,parentId:reopened.metadata.id,
      worktreeRoot,source,objective,current:()=>true,append:event=>{const stored=reopened.core.append(event);if(event.subject==='terminal.agent'){
        const claim=readdirSync(privateRoot).find(name=>name.startsWith(`${candidate.journal}.writer-${process.pid}-`));assert.ok(claim);unlinkSync(join(privateRoot,claim));
      }return stored;}});
    assert.equal(lostClaim.kind,'refused','lost private ownership blocks the second shared append');
    assert.equal(reopened.core.toSession().events.filter(event=>event.subject==='terminal.code-worker'&&event.data.id===candidate.id&&event.data.phase==='proposal').length,0);
    const result=await reconcileCodeWorkerRecovery({events:()=>reopened.core.toSession().events,parentRoot:reopened.root,parentId:reopened.metadata.id,
      worktreeRoot,source,objective,current:()=>true,append:event=>{
        const moduleUrl=pathToFileURL(join(process.cwd(),'src/adapters/terminal-session.ts')).href;
        const contender=`import {TerminalSession} from ${JSON.stringify(moduleUrl)};try{new TerminalSession({root:${JSON.stringify(privateRoot)},cwd:${JSON.stringify(candidate.workspace)},id:${JSON.stringify(candidate.journal)}});process.stdout.write('COMPETITOR_ACQUIRED');process.exitCode=1;}catch{process.stdout.write('COMPETITOR_REFUSED');}`;
        const outcome=execFileSync(process.execPath,['--input-type=module','-e',contender],{cwd:process.cwd(),env:childEnv({home:root,sessions:root}),encoding:'utf8'});
        assert.equal(outcome,'COMPETITOR_REFUSED','a second process cannot acquire the private journal during publication');
        return reopened.core.append(event);
      }});
    assert.equal(result.kind,'reconciled');assert.deepEqual(result.workers,[candidate.id]);assert.ok(reopened.core.revision>startRevision+1);
    const proposalEvents=reopened.core.toSession().events.filter(e=>e.subject==='terminal.code-worker'&&e.data.id===candidate.id&&e.data.phase==='proposal');
    assert.equal(proposalEvents.length,1);assert.equal(proposalEvents[0]!.data.reconciled,true);
    const afterFirst=reopened.core.revision;
    const again=await reconcileCodeWorkerRecovery({events:()=>reopened.core.toSession().events,parentRoot:reopened.root,parentId:reopened.metadata.id,
      worktreeRoot,source,objective,current:()=>true,append:event=>reopened.core.append(event)});
    assert.equal(again.kind,'unchanged');assert.equal(reopened.core.revision,afterFirst,'duplicate reconciliation is idempotent');
    assert.ok(pendingCodeWorkers(reopened.core.toSession().events),'recovered proposal is still pending owner integration');

    writeFileSync(join(candidate.workspace,'contribution'),'owner must reject');
    const rejected=await integrateCodeWorkers({shared:reopened.core,parent:reopened,root:worktreeRoot,source,objective,check:verification,execution:'recovery-execution',signal:new AbortController().signal,current:()=>true});
    assert.equal(rejected.exit,1,rejected.output);assert.equal(existsSync(join(source,'contribution')),false,'failed owner check leaves source untouched');
    assert.equal(readFileSync(join(candidate.workspace,'contribution'),'utf8'),'owner must reject','failed contribution is preserved');
    writeFileSync(join(candidate.workspace,'contribution'),'proposal effect confirmed');
    const integrated=await integrateCodeWorkers({shared:reopened.core,parent:reopened,root:worktreeRoot,source,objective,check:verification,execution:'recovery-execution',signal:new AbortController().signal,current:()=>true});
    assert.equal(integrated.exit,0,integrated.output);assert.equal(readFileSync(join(source,'contribution'),'utf8'),'proposal effect confirmed');
    assert.equal(pendingCodeWorkers(reopened.core.toSession().events),false);
    assert.ok(reopened.core.toSession().events.some(event=>event.kind==='note'&&event.subject==='terminal.code-composition'&&event.data.phase==='checked'&&event.data.verdict==='VERIFIED'),'ordinary pinned owner check, not reconciliation, verifies the composition');
  }finally{reopened.close();}
}));
