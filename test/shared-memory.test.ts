import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,existsSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";
import {SharedContexts,SharedMemoryStore,sharedScope} from "../src/adapters/shared-memory.ts";
import {SessionStore} from "../src/adapters/session-store.ts";
import {TerminalSession} from "../src/adapters/terminal-session.ts";
import {persistentView} from "../apps/terminal/src/producer/session-view.ts";
import {createProducer} from "../apps/terminal/src/producer/index.ts";
import {createCompletionCheck} from "../src/adapters/surface-verification.ts";
import {withSharedContext} from "../src/adapters/shared-context.ts";
const item=(session='worker-a')=>({kind:'constraint' as const,text:'preserve API',rationale:'shared observed requirement',sources:[{session,seq:1}]});

test("empty conditional journal starts at sequence one and remains readable",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-seq-'));
 try {const store=new SessionStore({root});store.create('probe',[]);const e=store.appendIfCurrent('probe',-1,{kind:'note',subject:'probe',data:{},seq:1,at:0});assert.equal(e!.seq,1);assert.equal(store.read('probe')[0]!.seq,1);}finally{rmSync(root,{recursive:true,force:true});}
});

test("shared project memory is exact-source idempotent, isolated and refuses corruption",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-project-'));
 try {
  const a=join(root,'a');const b=join(root,'b');mkdirSync(a);mkdirSync(b);
  const contexts=new SharedContexts({cwd:a});const before=contexts.read();assert.equal(existsSync(join(a,'.cuesheet')),false);
  const first=contexts.project.create(item(),-1);assert.ok(!('conflict' in first));assert.equal(contexts.read().profiles[0]!.revision,1);
  assert.equal(contexts.project.create(item(),-1).reused,true);
  assert.deepEqual(new SharedContexts({cwd:b}).read().profiles[0]!.entries,[]);
  assert.deepEqual(contexts.forProject(b).read().profiles[0]!.entries,[]);
  assert.notEqual(contexts.forProject(b).project.scope.id,contexts.project.scope.id);
  assert.notEqual(before.digest,contexts.read().digest);
  const path=join(a,'.cuesheet/shared/context.jsonl');const data=JSON.parse(readFileSync(path,'utf8'));data.data.version=99;const corrupt=JSON.stringify(data)+'\n';writeFileSync(path,corrupt);
  assert.throws(()=>contexts.read(),/Invalid shared context/);assert.equal(readFileSync(path,'utf8'),corrupt);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test("organization context is mounted explicitly and errors are not empty memory",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-company-'));
 try {
  const company=join(root,'company');mkdirSync(company);const owner=new SharedMemoryStore({root:company,scope:sharedScope('organization',company)});owner.create(item('organization-source'),-1);
  const project=join(root,'project');mkdirSync(project);
  assert.equal(new SharedContexts({cwd:project}).read().profiles.length,1);
  const mounted=new SharedContexts({cwd:project,organizations:[company]});assert.equal(mounted.read().profiles[1]!.entries[0]!.text,'preserve API');
  assert.throws(()=>new SharedContexts({cwd:project,organizations:[join(root,'missing')]}).read(),/unavailable/);
  const empty=join(root,'empty-company');mkdirSync(empty);assert.throws(()=>new SharedContexts({cwd:project,organizations:[empty]}).read(),/unavailable/);assert.equal(existsSync(join(empty,'context.jsonl')),false);
  assert.throws(()=>new SharedContexts({cwd:project,organizations:Array(9).fill(company)}),/eight/);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test("two real processes with the same base never overwrite a shared memory write",async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-workers-'));const module=resolve('src/adapters/shared-memory.ts');
 const children:ReturnType<typeof spawn>[]=[];
 try {
  const scope=sharedScope('project',root);
  const code=`import {SharedMemoryStore} from ${JSON.stringify(module)};
const store=new SharedMemoryStore({root:${JSON.stringify(join(root,'shared'))},scope:${JSON.stringify(scope)}});const base=store.read().revision;console.log('READY');await new Promise(r=>process.stdin.once('data',r));const result=store.create({kind:'decision',text:process.argv[1],rationale:'independent worker',sources:[{session:process.argv[1],seq:1}]},base);console.log(JSON.stringify(result));`;
  const launch=(name:string)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',code,name],{stdio:['pipe','pipe','pipe']});children.push(child);let output='';let errors='';let readyResolve!:()=>void;
    const ready=new Promise<void>(resolve=>readyResolve=resolve);child.stdout!.on('data',chunk=>{output+=String(chunk);if(output.includes('READY'))readyResolve();});child.stderr!.on('data',chunk=>errors+=String(chunk));
    const done=new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('shared worker timeout'));},10000);child.on('exit',status=>{clearTimeout(timer);if(status!==0)reject(new Error(errors));else resolve(JSON.parse(output.trim().split('\n').at(-1)!));});});
    return {child,ready,done};
  };
  const a=launch('worker-a');const b=launch('worker-b');await Promise.all([a.ready,b.ready]);a.child.stdin!.end('go');b.child.stdin!.end('go');
  const results=await Promise.all([a.done,b.done]);assert.equal(results.filter(r=>r.conflict).length,1);assert.equal(results.filter(r=>r.entry).length,1);
  const state=new SharedMemoryStore({root:join(root,'shared'),scope}).read();assert.equal(state.revision,1);assert.equal(state.entries.length,1);assert.ok(['worker-a','worker-b'].includes(state.entries[0]!.text));
 } finally {for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');rmSync(root,{recursive:true,force:true});}
});

test("external shared update discards old inference; next model sees the common revision",async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-infer-'));const cwd=join(root,'work');mkdirSync(cwd);const contexts=new SharedContexts({cwd});const session=new TerminalSession({root:join(root,'sessions'),cwd});
 try {
  const store=persistentView(session);let calledResolve!:()=>void;const called=new Promise<void>(r=>calledResolve=r);let release!:()=>void;const gate=new Promise<void>(r=>release=r);let calls=0;let actions=0;let latest='';
  const producer=createProducer({store,cwd,journal:session,sharedContexts:contexts,identities:[],projectsRoot:root,maxSlices:1,tools:{async run(request){actions++;return {name:request.name,exit:0,output:'observed'};}},model:{name:'shared-fixture',async infer(frame){calls++;if(calls===1){calledResolve();await gate;return {text:'stale',toolCalls:[{name:'node',input:{argv:['node','obsolete']}}]};}latest=JSON.stringify(frame);return {text:'',toolCalls:[]};}}});
  producer.say('implement the parser');await called;contexts.project.create(item('external-owner'),-1);release();
  const end=Date.now()+5000;while(store.get().busy && Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);assert.equal(actions,0);assert.ok(calls>1);assert.match(latest,/preserve API/);assert.match(latest,/external-owner/);
 } finally {session.close();rmSync(root,{recursive:true,force:true});}
});

test("context compaction keeps profile revision and retrieval digest without mutating the source",()=>{
 const snapshot={digest:'known-digest',profiles:[{scope:{kind:'organization' as const,id:'company'},revision:100,entries:Array.from({length:100},(_,i)=>({id:'m-'+i,kind:'decision' as const,text:'x'.repeat(1000),rationale:'context',sources:[{session:'owner',seq:i+1}],author:'model' as const,revision:i+1}))}]};
 const source=JSON.stringify(snapshot);const frame={goal:'feature',history:[],directives:[],evidence:[],capabilities:[],model:'unset',step:1};const session={id:'test',events:[],openDirectives:[],evidence:[],capabilities:new Map(),models:new Map(),goal:null} as any;
 const result=withSharedContext(frame,session,{maxChars:8000,sharedContexts:snapshot});assert.ok(JSON.stringify(result).length<=8000);assert.match(JSON.stringify(result),/known-digest/);assert.match(JSON.stringify(result),/company/);assert.equal(JSON.stringify(snapshot),source);
});

test("producer publishes sourced project memory and discards remaining stale tool batch",async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-publish-'));const cwd=join(root,'work');mkdirSync(cwd);const contexts=new SharedContexts({cwd});let session:TerminalSession|undefined;
 try {
  session=new TerminalSession({root:join(root,'sessions'),cwd});const id=session.metadata.id;const store=persistentView(session);let calls=0;let effects=0;let captured='';
  const producer=createProducer({store,cwd,journal:session,sharedContexts:contexts,identities:[],projectsRoot:root,maxSlices:1,tools:{async run(r){effects++;return {name:r.name,exit:0,output:'effect'};}},model:{name:'publisher-fixture',async infer(frame){calls++;if(calls===1)return {text:'',toolCalls:[{name:'remember',input:{scope:'project',operation:'create',kind:'constraint',text:'team uses portable APIs',rationale:'persistent project requirement',sources:[frame.history.find(e=>e.subject==='terminal.user')!.seq]}},{name:'node',input:{argv:['node','stale-write']}}]};captured=JSON.stringify(frame);if(calls===2)return {text:'',toolCalls:[{name:'read_shared_context',input:{offset:0}}]};return {text:'',toolCalls:[]};}}});
  producer.say('maintain the project API');const end=Date.now()+5000;while(store.get().busy && Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);
  assert.equal(effects,0);assert.match(captured,/team uses portable APIs/);const entries=contexts.read().profiles[0]!.entries;assert.equal(entries.length,1);assert.equal(entries[0]!.sources[0]!.session,id);
  assert.equal(session.core.toSession().evidence.length,0);
  assert.ok(session.core.toSession().events.some(e=>e.kind==='observation' && e.data.tool==='read_shared_context' && e.data.exit===0));
  session.close();session=new TerminalSession({root:join(root,'sessions'),cwd,id});assert.equal(new SharedContexts({cwd}).read().profiles[0]!.entries[0]!.id,entries[0]!.id);
 }finally{session?.close();rmSync(root,{recursive:true,force:true});}
});


test("shared correction during a real acceptance check keeps the goal open",async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-check-'));const cwd=join(root,'work');mkdirSync(cwd);
 const oracle=join(cwd,'accept.mjs');writeFileSync(oracle,'await new Promise(r=>setTimeout(r,200));');
 const contexts=new SharedContexts({cwd});const session=new TerminalSession({root:join(root,'sessions'),cwd});
 try {
  const store=persistentView(session);let calls=0;
  const producer=createProducer({store,cwd,journal:session,sharedContexts:contexts,identities:[],projectsRoot:root,maxSlices:1,
   verification:createCompletionCheck({script:oracle,root:join(root,'proof')}),
   tools:{async run(){throw new Error('internal finish cannot escape');}},
   model:{name:'shared-check-fixture',async infer(){calls++;return {text:'',toolCalls:calls===1?[{name:'finish',input:{}}]:[]};}}});
  let unsubscribe=()=>{};const checking=new Promise<void>(resolve=>{unsubscribe=store.subscribe(()=>{if(store.get().entries.some(e=>e.kind==='status'&&e.label==='check'&&e.certainty==='active'))resolve();});});
  producer.say('deliver the current common requirement');await checking;unsubscribe();contexts.project.create(item('team-correction'),-1);
  const end=Date.now()+5000;while(store.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);
  assert.ok(session.core.toSession().events.some(e=>e.kind==='work_verified'&&e.data.verdict==='VERIFIED'));
  assert.equal(session.core.toSession().evidence.length,0,'old shared basis cannot certify the common goal');
 }finally{session.close();rmSync(root,{recursive:true,force:true});}
});


test("a bound project reads its own common memory instead of the launch directory",async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-bind-'));const launch=join(root,'launch');const target=join(root,'target');mkdirSync(launch);mkdirSync(target);
 const initial=new SharedContexts({cwd:launch});initial.project.create({...item(),text:'launch-only-memory'},-1);
 new SharedContexts({cwd:target}).project.create({...item(),text:'target-only-memory'},-1);
 const session=new TerminalSession({root:join(root,'sessions'),cwd:launch});
 try{
  const store=persistentView(session);let frameText='';
  const producer=createProducer({store,cwd:launch,journal:session,sharedContexts:initial,projectsRoot:root,maxSlices:1,
   identities:[{name:'target',path:'target',kind:'repo',status:'active',nature:'test project',stack:'typescript',exists:true}],
   tools:{async run(r){return {name:r.name,exit:0,output:''};}},model:{name:'binding-fixture',async infer(frame){frameText=JSON.stringify(frame);return {text:'',toolCalls:[]};}}});
  producer.say('work on target');const end=Date.now()+5000;while(store.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));
  assert.equal(store.get().busy,false);assert.match(frameText,/target-only-memory/);assert.doesNotMatch(frameText,/launch-only-memory/);
 }finally{session.close();rmSync(root,{recursive:true,force:true});}
});
