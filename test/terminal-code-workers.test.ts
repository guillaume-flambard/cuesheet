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
import {projectEffectAttempts} from '../src/adapters/tool-receipts.ts';
import {pendingCodeWorkers} from '../src/adapters/terminal-code-workers.ts';
import {projectAgents} from '../src/adapters/agent-consultation.ts';
import {createCompletionCheck} from '../src/adapters/surface-verification.ts';
async function fixture(run:(source:string,root:string,git:(...args:string[])=>string)=>Promise<void>){
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'cs-terminal-workers-'))),source=join(dir,'source'),root=join(dir,'state');mkdirSync(source);
  const git=(...args:string[])=>execFileSync('git',args,{cwd:source,env:childEnv({home:dir,sessions:root}),encoding:'utf8'}).trim();
  try{git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');writeFileSync(join(source,'file'),'base');git('add','.');git('commit','-qm','base');await run(source,root,git);}finally{rmSync(dir,{recursive:true,force:true});}
}
async function wait(view:ReturnType<typeof createStore>){const until=Date.now()+15000;while(view.get().busy&&Date.now()<until)await new Promise(r=>setTimeout(r,10));assert.equal(view.get().busy,false);}
const tasks={tasks:[{role:'builder',task:'Build useful file',files:['built']},{role:'tester',task:'Test independently',files:['tested']}]};
function factory(scope:string,root:string){return Object.assign(new ShellToolRunner({allow:['node','cat','ls'],roots:[scope],defaultCwd:scope,env:childEnv({home:root,sessions:root})}),{names:['node','cat','ls']});}
test('producer runs isolated workers, feeds private observations, persists receipts and refuses premature finish',async()=>fixture(async(source,root,git)=>{
  writeFileSync(join(source,'file'),'human dirty');git('add','file');const before=git('status','--porcelain'),index=git('diff','--cached');
  const journal=new TerminalSession({root,cwd:source}),view=createStore();let step=0,children=0;const sessions:TerminalSession[]=[];
  try{
    const producer=createProducer({store:view,journal,cwd:source,identities:[],maxSlices:1,worktreeRoot:join(root,'workspaces',journal.metadata.id),tools:factory(source,root),toolsForScope:p=>factory(p,root),
      toolsForWorker:(path,privateJournal,signal)=>{sessions.push(privateJournal);const runner=factory(path,root);return Object.assign({run:(request:any)=>runner.run(request,signal)},{names:runner.names});},
      workerModel:path=>{let calls=0;return {label:'fixture-worker',adapter:{name:'fixture-worker',async infer(frame:any){
        assert.match(JSON.stringify(frame),new RegExp(path));assert.match(JSON.stringify(frame),/fixture-worker/);
        children++;if(++calls===1)return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('contribution','coded');console.log('private observed result')"]}}]};
        assert.ok(frame.history.some((e:any)=>String(e.data.output).includes('private observed result')));return {text:'unverified result',toolCalls:[]};
      }}};},model:{name:'controller',async infer(){return {text:'',toolCalls:++step===1?[{name:'run_code_workers',input:tasks}]:step===2?[{name:'finish',input:{}}]:[]};}}});
    producer.say('qzcodeworkers fixture');await wait(view);assert.equal(children,4);assert.equal(sessions.length,2);
    assert.equal(git('status','--porcelain'),before);assert.equal(git('diff','--cached'),index);assert.equal(existsSync(join(source,'contribution')),false);
    const events=journal.core.toSession().events;assert.ok(events.some(e=>e.kind==='observation'&&e.data.tool==='finish'&&e.data.exit===126));assert.ok(pendingCodeWorkers(events));assert.equal(journal.core.toSession().goal!.open,true);
    assert.match(producer.agentPage!().lines.join('\n'),/Contribution : proposal · intégration requise/);
    for(const child of sessions){assert.equal(readFileSync(join(child.metadata.cwd,'contribution'),'utf8'),'coded');const reopened=new TerminalSession({root:child.root,cwd:child.metadata.cwd,id:child.metadata.id});try{assert.equal(projectEffectAttempts(reopened.core.toSession().events)[0]!.phase,'completed');}finally{reopened.close();}}
  }finally{journal.close();}
}));
for(const selectionChange of [false,true])test(`${selectionChange?"model change":"correction"} reaches both in-flight workers directly and reload preserves interrupted responsibilities`,async()=>fixture(async(source,root)=>{
  const journal=new TerminalSession({root,cwd:source}),view=createStore();let step=0,started=0,ready!:()=>void;const barrier=new Promise<void>(r=>ready=r);let release!:()=>void;const late=new Promise<void>(r=>release=r);let effects=0;
  try{
    const producer=createProducer({store:view,journal,cwd:source,identities:[],maxSlices:1,worktreeRoot:join(root,'workspaces',journal.metadata.id),tools:factory(source,root),toolsForScope:p=>factory(p,root),
      toolsForWorker:()=>({names:['node'],async run(){effects++;throw Error('stale effect forbidden');}} as any),
      workerModel:()=>({label:'late-model',adapter:{name:'late-model',async infer(){if(++started===2)ready();await late;return {text:'obsolete',toolCalls:[{name:'node',input:{}}]};}}}),
      model:{name:'controller',async infer(){return {text:'',toolCalls:++step===1?[{name:'run_code_workers',input:tasks}]:[]};}}});
    producer.say('qzcodeworkers correction');await barrier;if(selectionChange)producer.modelSelected!({provider:"opencode",model:"fixture-next"});else producer.say('Correction: preserve the public API');await wait(view);release();assert.equal(effects,0);
    if(selectionChange)assert.ok(journal.core.toSession().events.some(e=>e.subject==="terminal.model"));else assert.ok(journal.core.toSession().events.some(e=>e.kind==='directive'&&String(e.data.text).includes('Correction:')));
    assert.equal(journal.core.toSession().events.filter(e=>e.kind==='effect_requested'&&e.data.effect==='RunAgent').length,1);
    assert.ok(projectAgents(journal.core.toSession().events).every(a=>a.phase==='cancelled'||a.phase==='stale'));
    assert.doesNotMatch(producer.agentPage!().lines.join('\n'),/obsolete/);
    // A persisted active record does not establish that its process survived reload.
    journal.core.append({kind:'note',subject:'terminal.agent',data:{version:1,id:'interrupted-fixture',role:'review',task:'Inspect',model:'fixture',phase:'active',execution:'old'}});
    const id=journal.metadata.id;journal.close();const reopened=new TerminalSession({root,cwd:source,id});try{assert.equal(projectAgents(reopened.core.toSession().events).find(a=>a.id==='interrupted-fixture')!.phase,'interrupted');assert.ok(pendingCodeWorkers(reopened.core.toSession().events));}finally{reopened.close();}
  }finally{release?.();journal.close();}
}));
for(const mode of ['accepted','check-reject','outside-scope','source-drift','uncertain-journal'])test(`composed code workers ${mode}: source integration requires scoped current confirmed contributions`,async()=>fixture(async(source,root,git)=>{
  mkdirSync(root,{recursive:true});
  writeFileSync(join(source,'file'),'human dirty');git('add','file');const index=git('diff','--cached');
  const script=join(root,'check.mjs');writeFileSync(script,`import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';assert.equal(readFileSync('built','utf8'),'coded');assert.equal(readFileSync('tested','utf8'),${JSON.stringify(mode==='check-reject'?'different':'coded')});`);
  const verification=createCompletionCheck({script,root:join(root,'proof')});const journal=new TerminalSession({root,cwd:source,check:verification.pinned}),view=createStore();const privateJournals=new Map<string,TerminalSession>();let step=0;
  try{
    const producer=createProducer({store:view,journal,cwd:source,identities:[],maxSlices:1,verification,worktreeRoot:join(root,'workspaces',journal.metadata.id),tools:factory(source,root),toolsForScope:p=>factory(p,root),
      toolsForWorker:(path,child,signal)=>{privateJournals.set(path,child);const runner=factory(path,root);return Object.assign({run:(r:any)=>runner.run(r,signal)},{names:runner.names});},
      workerModel:path=>{let calls=0;return {label:'fixture-code',adapter:{name:'fixture-code',async infer(frame:any){
        const role=/Code worker (\w+):/.exec(frame.directives.at(-1).text)![1];const file=mode==='outside-scope'&&role==='builder'?'outside':role==='builder'?'built':'tested';
        if(++calls===1)return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e',`require('fs').writeFileSync(${JSON.stringify(file)},'coded')`]}}]};
        if(mode==='uncertain-journal'&&role==='builder')privateJournals.get(path)!.core.append({kind:'action',subject:'terminal.intent',data:{version:1,phase:'requested',tool:'node',input:{argv:['node','-e','possibly ran']},effectId:'uncertain-fixture',scopeCwd:path}});
        return {text:'unverified contribution',toolCalls:[]};
      }}};},model:{name:'controller',async infer(){step++;if(step===2&&mode==='source-drift')writeFileSync(join(source,'file'),'new human edit');return {text:'',toolCalls:step===1?[{name:'run_code_workers',input:tasks}]:step===2?[{name:'integrate_code_workers',input:{}}]:step===3?[{name:'finish',input:{}}]:[]};}}});
    producer.say('qzcompose fixture');await wait(view);const events=journal.core.toSession().events;
    assert.equal(git('diff','--cached'),index);assert.equal(readFileSync(join(source,'file'),'utf8'),mode==='source-drift'?'new human edit':'human dirty');
    if(mode==='accepted'){
      assert.equal(readFileSync(join(source,'built'),'utf8'),'coded');assert.equal(readFileSync(join(source,'tested'),'utf8'),'coded');assert.equal(journal.core.toSession().goal!.open,false);assert.equal(pendingCodeWorkers(events),false);
      assert.ok(events.some(e=>e.subject==='terminal.code-composition'&&e.data.phase==='applied'));assert.equal(events.filter(e=>e.kind==='work_verified').length,1);
    }else{assert.equal(existsSync(join(source,'built')),false);assert.equal(existsSync(join(source,'tested')),false);assert.equal(journal.core.toSession().goal!.open,true);assert.ok(pendingCodeWorkers(events));}
  }finally{journal.close();}
}));
