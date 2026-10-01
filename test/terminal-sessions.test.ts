import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { TerminalSession, listTerminalSessions } from '../src/adapters/terminal-session.ts';
import { persistentView } from '../apps/terminal/src/producer/session-view.ts';
import { createProducer } from '../apps/terminal/src/producer/index.ts';
import { createCompletionCheck } from '../src/adapters/surface-verification.ts';

const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const fixture=()=>{const root=mkdtempSync(join(tmpdir(),'cuesheet-sessions-'));const cwd=join(root,'work');mkdirSync(cwd);return {root,cwd,storage:join(root,'sessions')};};
async function settled(store:ReturnType<typeof persistentView>) {const end=Date.now()+3000;while(store.get().busy && Date.now()<end)await delay(5);assert.equal(store.get().busy,false);}

it('write-through events, view and directive continuation survive closing and reopening a session', async()=>{
  const {root,cwd,storage}=fixture();let first:TerminalSession|undefined;let restored:TerminalSession|undefined;
  try {
    first=new TerminalSession({root:storage,cwd});const id=first.metadata.id;const store=persistentView(first);
    let release:(value:any)=>void=()=>{};let calls=0;
    const producer=createProducer({store,cwd,projectsRoot:root,identities:[],journal:first,
      model:{name:'first',infer(){if(++calls===1)return new Promise(r=>{release=r;});return Promise.resolve({text:'old result',toolCalls:[]});}},
      tools:{async run(request){return {name:request.name,exit:0,output:''};}}});
    producer.say('repair the fixture');producer.say('preserve this directive');
    release({text:'stale',toolCalls:[]});await settled(store);
    store.send({type:'compose',text:'saved draft'});
    const before=first.core.toSession().events;
    assert.deepEqual(JSON.parse(readFileSync(join(storage,`${id}.jsonl`),'utf8').trim().split('\n').at(-1)!),before.at(-1));
    first.close();restored=new TerminalSession({root:storage,cwd,id});const replay=persistentView(restored);
    assert.equal(replay.get().composer,'saved draft');assert.equal(replay.get().busy,false);
    assert.ok(replay.get().entries.some(e=>e.kind==='you' && e.text==='repair the fixture'));
    assert.deepEqual(restored.core.toSession().events,before);
    const frames:any[]=[];
    const resumed=createProducer({store:replay,cwd,projectsRoot:root,identities:[],journal:restored,model:{name:'second',async infer(frame){frames.push(frame);return {text:'new result',toolCalls:[]};}},tools:{async run(r){return {name:r.name,exit:0,output:''};}}});
    assert.equal(frames.length,0,'loading does not infer');
    resumed.resume!();await settled(replay);
    assert.equal(frames[0].goal,'repair the fixture');assert.ok(frames[0].directives.some((d:any)=>d.text==='preserve this directive'));
    const sharedContext=frames[0].directives.find((d:any)=>d.text.startsWith('Shared work snapshot.'));
    assert.ok(sharedContext,'a replacement provider receives the derived shared state');
    const snapshot=JSON.parse(sharedContext.text.split('\n').slice(1).join('\n'));
    assert.ok(snapshot.constraints.some((c:any)=>c.text==='preserve this directive'));
    assert.equal(snapshot.goal,'repair the fixture');
    assert.deepEqual(restored.core.toSession().events.slice(0,before.length),before);
  }finally{first?.close();restored?.close();rmSync(root,{recursive:true,force:true});}
});

it('missing, damaged and concurrently held sessions refuse without rewriting their files',()=>{
  const {root,cwd,storage}=fixture();let session:TerminalSession|undefined;
  try {
    assert.throws(()=>new TerminalSession({root:storage,cwd,id:'t-missing'}),/absente/);
    session=new TerminalSession({root:storage,cwd});const id=session.metadata.id;
    assert.throws(()=>new TerminalSession({root:storage,cwd,id}),/déjà ouverte/);
    session.core.append({kind:'goal',subject:'builder',data:{text:'goal'}});session.close();
    const path=join(storage,`${id}.jsonl`);const damaged=readFileSync(path,'utf8')+'{"torn":';writeFileSync(path,damaged);
    assert.throws(()=>new TerminalSession({root:storage,cwd,id}),/not a journal/);
    assert.equal(readFileSync(path,'utf8'),damaged);
    assert.equal(listTerminalSessions(storage)[0]!.damaged,true);
    assert.throws(()=>new TerminalSession({root:storage,cwd,id:'../../foreign'}),/invalide/);
  }finally{session?.close();rmSync(root,{recursive:true,force:true});}
});

it('a disk refusal does not publish an event and cancels work before the next tool',async()=>{
  const {root,cwd,storage}=fixture();let session:TerminalSession|undefined;
  try {
    session=new TerminalSession({root:storage,cwd});const store=persistentView(session);let ready=()=>{};let release:(v:any)=>void=()=>{};
    const started=new Promise<void>(r=>{ready=r;});let tools=0;
    const producer=createProducer({store,cwd,projectsRoot:root,identities:[],journal:session,model:{name:'pending',infer(){ready();return new Promise(r=>{release=r;});}},tools:{async run(r){tools++;return {name:r.name,exit:0,output:''};}}});
    producer.say('work');await started;const before=session.core.toSession().events;
    const corePath=join(storage,`${session.metadata.id}.jsonl`);rmSync(corePath);mkdirSync(corePath);
    assert.throws(()=>session!.core.append({kind:'directive',subject:'builder',data:{text:'not durable'}}),/Écriture de session refusée/);
    assert.deepEqual(session.core.toSession().events,before);
    release({text:'late',toolCalls:[{name:'node',input:{argv:['node','-e','process.exit(0)']}}]});await delay(30);
    assert.equal(tools,0);assert.equal(store.get().busy,false);
    assert.ok(store.get().entries.some(e=>e.kind==='failure' && e.text.includes('Écriture de session refusée')));
    producer.say('do not run');assert.equal(tools,0);
  }finally{session?.close();rmSync(root,{recursive:true,force:true});}
});

it('a process killed during a real tool restores unknown status and never automatically repeats the effect',async()=>{
  const {root,cwd,storage}=fixture();let reopened:TerminalSession|undefined;let worker:ChildProcess|undefined;
  try {
    const script=join(root,'worker.ts');const started=join(root,'started');
    writeFileSync(script,`import {TerminalSession} from ${JSON.stringify(resolve('src/adapters/terminal-session.ts'))};
import {persistentView} from ${JSON.stringify(resolve('apps/terminal/src/producer/session-view.ts'))};
import {createProducer} from ${JSON.stringify(resolve('apps/terminal/src/producer/index.ts'))};
import {writeFileSync} from 'node:fs';
const session=new TerminalSession({root:${JSON.stringify(storage)},cwd:${JSON.stringify(cwd)}});
const store=persistentView(session);const producer=createProducer({store,cwd:${JSON.stringify(cwd)},projectsRoot:${JSON.stringify(root)},identities:[],journal:session,model:{name:'tool',async infer(){return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e','effect']}}]};}},tools:{async run(){writeFileSync(${JSON.stringify(started)},session.metadata.id);await new Promise(()=>{});return {name:'node',exit:0,output:''};}}});producer.say('one effect');store.send({type:'compose',text:'crash draft'});setInterval(()=>{},1000);`);
    const child=spawn(process.execPath,[script],{stdio:'ignore'});worker=child;const end=Date.now()+5000;
    let id='';
    while(Date.now()<end){
      if(existsSync(started))id=readFileSync(started,'utf8');
      if(/^t-[A-Za-z0-9_-]+$/.test(id))break;
      await delay(10);
    }
    assert.match(id,/^t-[A-Za-z0-9_-]+$/);
    const exit=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exit;
    reopened=new TerminalSession({root:storage,cwd,id});const view=persistentView(reopened);
    assert.equal(view.get().busy,false);assert.equal(view.get().composer,'crash draft');
    assert.ok(view.get().entries.some(e=>e.kind==='status' && e.value.includes('aucune action')));
    assert.ok(reopened.core.toSession().events.some(e=>e.subject==='terminal.intent' && e.data.phase==='requested'));
    assert.equal(reopened.core.toSession().events.some(e=>e.kind==='observation' && e.data.tool==='node'),false);
    assert.equal(readdirSync(storage).filter(file=>file.includes('.writer-')).length,1,'dead writer claim replaced by this live owner');
  }finally{worker?.kill("SIGKILL");reopened?.close();rmSync(root,{recursive:true,force:true});}
});

it('a pinned criterion and a closed goal survive restart; changed check bytes refuse',async()=>{
  const {root,cwd,storage}=fixture();let session:TerminalSession|undefined;let restored:TerminalSession|undefined;
  try {
    const check=join(root,'check.mjs');writeFileSync(check,'process.exit(0)');
    const verification=createCompletionCheck({script:check,root:join(root,'proof')});
    session=new TerminalSession({root:storage,cwd,check:verification.pinned});const id=session.metadata.id;
    const store=persistentView(session);const producer=createProducer({store,cwd,projectsRoot:root,identities:[],journal:session,verification,model:{name:'finish',async infer(){return {text:'',toolCalls:[{name:'finish',input:{}}]};}},tools:{async run(r){return {name:r.name,exit:0,output:''};}}});
    producer.say('verify');await settled(store);assert.equal(session.core.toSession().goal?.open,false);
    const proof=session.core.toSession().evidence[0]!.backing;assert.ok(existsSync(proof));session.close();
    writeFileSync(check,'process.exit(1)');
    restored=new TerminalSession({root:storage,cwd,id});
    assert.equal(readFileSync(restored.metadata.check!.script,'utf8'),'process.exit(0)');
    const replay=persistentView(restored);let calls=0;
    const next=createProducer({store:replay,cwd,projectsRoot:root,identities:[],journal:restored,model:{name:'never',async infer(){calls++;return {text:'',toolCalls:[]};}},tools:{async run(r){return {name:r.name,exit:0,output:''};}}});
    next.resume!();assert.equal(calls,0);assert.ok(replay.get().entries.some(e=>e.kind==='status' && e.value.includes('déjà été vérifié')));
    assert.equal(restored.core.toSession().evidence[0]!.backing,proof);restored.close();
    assert.throws(()=>new TerminalSession({root:storage,cwd,id,check:{script:check,digest:'f'.repeat(64)}}),/critère demandé diffère/);
  }finally{session?.close();restored?.close();rmSync(root,{recursive:true,force:true});}
});

it('the production runtime resumes in another process with the original pinned oracle despite changing the source file',()=>{
  const {root,cwd,storage}=fixture();
  try {
    const script=join(root,'runtime.ts');const check=join(root,'check.mjs');writeFileSync(check,'process.exit(0)');
    writeFileSync(script,`import {createTerminalRuntime} from ${JSON.stringify(resolve('apps/terminal/src/producer/runtime.ts'))};
let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:process.argv[2]==='resume'?{tool_calls:[{function:{name:'tool_call',arguments:JSON.stringify({tool:'finish',input:{}})}}]}:{content:'unfinished'}}]});};
const runtime=createTerminalRuntime(${JSON.stringify(cwd)},process.argv[3]);
if('missing' in runtime){console.log(JSON.stringify({missing:runtime.missing,calls}));}else{
if(process.argv[2]==='init')runtime.producer.say('persist this goal');else runtime.producer.resume();
const until=Date.now()+5000;while(runtime.store.get().busy && Date.now()<until)await new Promise(r=>setTimeout(r,10));
console.log(JSON.stringify({id:runtime.session.metadata.id,metadata:runtime.session.metadata,closed:runtime.session.core.toSession().goal?.open===false,evidence:runtime.session.core.toSession().evidence,calls}));runtime.session.close();}`);
    const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:root,CUESHEET_SESSIONS:storage,CUESHEET_PROVIDER:'compatible',CUESHEET_MODEL:'fixture',CUESHEET_BASE_URL:'http://localhost:9000/v1',CUESHEET_VERIFY_SCRIPT:check};
    const first=spawnSync(process.execPath,[script,'init'],{env,encoding:'utf8',timeout:10000});assert.equal(first.status,0,first.stderr);const initial=JSON.parse(first.stdout.trim());assert.equal(initial.calls,8);assert.equal(initial.closed,false);
    writeFileSync(check,'process.exit(1)');delete env.CUESHEET_VERIFY_SCRIPT;
    const second=spawnSync(process.execPath,[script,'resume',initial.id],{env,encoding:'utf8',timeout:10000});assert.equal(second.status,0,second.stderr);const resumed=JSON.parse(second.stdout.trim());
    assert.equal(resumed.closed,true);assert.equal(resumed.calls,1);assert.equal(resumed.metadata.check.digest,initial.metadata.check.digest);assert.ok(existsSync(resumed.evidence[0].backing));
    env.CUESHEET_VERIFY_SCRIPT=check;
    const conflict=spawnSync(process.execPath,[script,'resume',initial.id],{env,encoding:'utf8',timeout:10000});assert.equal(conflict.status,0,conflict.stderr);const refused=JSON.parse(conflict.stdout.trim());assert.match(refused.missing,/critère demandé diffère/);assert.equal(refused.calls,0);
    delete env.CUESHEET_VERIFY_SCRIPT;chmodSync(initial.metadata.check.script,0o600);writeFileSync(initial.metadata.check.script,'process.exit(0); // tampered');
    const tampered=spawnSync(process.execPath,[script,'resume',initial.id],{env,encoding:'utf8',timeout:10000});assert.equal(tampered.status,0,tampered.stderr);assert.match(JSON.parse(tampered.stdout.trim()).missing,/empreinte/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

it('a view write failure never displays the refused message and still permits inspecting or leaving the session',()=>{
  const {root,cwd,storage}=fixture();let session:TerminalSession|undefined;
  try {
    session=new TerminalSession({root:storage,cwd});const store=persistentView(session);
    store.send({type:'compose',text:'last saved draft'});
    const viewPath=join(storage,`${session.metadata.id}.view.jsonl`);rmSync(viewPath);mkdirSync(viewPath);
    store.send({type:'submit',text:'NOT_DURABLE'});
    assert.equal(store.get().entries.some(e=>e.kind==='you' && e.text==='NOT_DURABLE'),false);
    assert.equal(store.get().composer,'last saved draft');assert.ok(session.failure);
    assert.ok(store.get().entries.some(e=>e.kind==='failure' && e.text.includes('conversation refusée')));
    let calls=0;const producer=createProducer({store,cwd,projectsRoot:root,identities:[],journal:session,model:{name:'never',async infer(){calls++;return {text:'',toolCalls:[]};}},tools:{async run(r){return {name:r.name,exit:0,output:''};}}});
    producer.say('do not infer');assert.equal(calls,0);
    store.send({type:'open',overlay:'inspect'});assert.equal(store.get().overlay,'inspect');
  }finally{session?.close();rmSync(root,{recursive:true,force:true});}
});
