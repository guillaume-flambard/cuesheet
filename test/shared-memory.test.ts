import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,existsSync,readFileSync,writeFileSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {spawn} from "node:child_process";
import {SharedContexts,SharedMemoryStore,sharedScope,SharedGrants,SharedRetrieval} from "../src/adapters/shared-memory.ts";
import type {SharedRealm,SharedOperation,SharedScopeStore} from "../src/adapters/shared-memory.ts";
import {SessionStore} from "../src/adapters/session-store.ts";
import {TerminalSession} from "../src/adapters/terminal-session.ts";
import {persistentView} from "../apps/terminal/src/producer/session-view.ts";
import {createProducer} from "../apps/terminal/src/producer/index.ts";
import {projectObjectives} from "../src/adapters/objectives.ts";
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


test("human check renewal during verification cannot certify the new revision with the old result",async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-check-renew-'));const cwd=join(root,'work');mkdirSync(cwd);
 const oracle=join(cwd,'accept.mjs');writeFileSync(oracle,'await new Promise(r=>setTimeout(r,200));');const verification=createCompletionCheck({script:oracle,root:join(root,'proof')});
 const session=new TerminalSession({root:join(root,'sessions'),cwd});
 try{
  const store=persistentView(session);let calls=0;let finishNext=false;const producer=createProducer({store,cwd,journal:session,identities:[],projectsRoot:root,maxSlices:1,verification,
   tools:{async run(){throw new Error('internal check');}},model:{name:'renew-fixture',async infer(){calls++;return {text:'',toolCalls:(calls===1||finishNext)?[{name:'finish',input:{}}]:[]};}}});
  let off=()=>{};const checking=new Promise<void>(r=>{off=store.subscribe(()=>{if(store.get().entries.some(e=>e.kind==='status'&&e.label==='check'&&e.certainty==='active'))r();});});
  producer.say('original requirement');await checking;off();producer.say('preserve the new requirement');const corrected=projectObjectives(session.core.toSession().events).current!;
  const before=session.core.revision;producer.say(`/check confirm ${corrected.id} ${corrected.revision} ${'0'.repeat(64)}`);assert.equal(session.core.revision,before);
  producer.say(`/check confirm ${corrected.id} ${corrected.revision} ${verification.pinned!.digest}`);const renewed=projectObjectives(session.core.toSession().events).current!;assert.equal(renewed.check!.boundRevision,renewed.revision);
  const end=Date.now()+5000;while(store.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);assert.equal(session.core.toSession().evidence.length,0);
  assert.equal(projectObjectives(session.core.toSession().events).current!.status,'active');
  finishNext=true;producer.resume!();const resumeEnd=Date.now()+5000;while(store.get().busy&&Date.now()<resumeEnd)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);assert.equal(projectObjectives(session.core.toSession().events).current!.status,'verified');assert.equal(session.core.toSession().evidence.length,1);
  const id=session.metadata.id;session.close();const reloaded=new TerminalSession({root:join(root,'sessions'),cwd,id});try{assert.equal(projectObjectives(reloaded.core.toSession().events).current!.check!.boundRevision,renewed.revision);}finally{reloaded.close();}
 }finally{session.close();rmSync(root,{recursive:true,force:true});}
});


test("a grant is required before search and before read, per principal and per realm",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-grants-'));
 try {
  const contexts=new SharedContexts({cwd:root});
  const made=contexts.project.create(item('alice'),-1);assert.ok(!('conflict' in made));
  const empty=new SharedContexts({cwd:join(root,'elsewhere')});
  const grants=new SharedGrants();const scope=contexts.project.scope;
  const access=(principal:string,realm:SharedRealm='project',stores=contexts.stores())=>new SharedRetrieval({principal,realm,grants,stores});
  assert.throws(()=>grants.grant({principal:'',realm:'project',scope,operations:['read']}),/principal/);
  assert.throws(()=>grants.grant({principal:'alice',realm:'local' as never,scope,operations:['read']}),/realm/);
  assert.throws(()=>grants.grant({principal:'alice',realm:'project',scope:{kind:'project',id:'bad id'},operations:['read']}),/scope/);
  assert.throws(()=>grants.grant({principal:'alice',realm:'project',scope,operations:['write' as never]}),/operations/);
  assert.throws(()=>grants.grant({principal:'alice',realm:'project',scope,operations:[]}),/operations/);
  assert.throws(()=>new SharedRetrieval({principal:'alice',realm:'project',grants,stores:[contexts.project,contexts.project]}),/Duplicate/);
  assert.throws(()=>new SharedRetrieval({principal:'',realm:'project',grants,stores:contexts.stores()}),/principal/);
  const alice=access('alice');const nowhere=access('alice','project',empty.stores());
  // No grant: no hit, no read, and no way to tell a populated scope from an empty one.
  assert.deepEqual(alice.search('preserve'),nowhere.search('preserve'));
  assert.equal(alice.search('preserve').hits.length,0);
  assert.throws(()=>alice.read(scope),/not authorized/);
  assert.throws(()=>alice.readReference({scope,id:made.entry.id,revision:made.entry.revision}),/not authorized/);
  // Search and read are separate rights: the search grant never opens the read door.
  grants.grant({principal:'alice',realm:'project',scope,operations:['search']});
  const found=alice.search('preserve');
  assert.equal(found.hits.length,1);
  assert.equal(found.hits[0]!.entry.id,made.entry.id);
  assert.ok(found.hits[0]!.passage.includes('preserve API'));
  assert.throws(()=>alice.read(scope),/not authorized/);
  assert.throws(()=>alice.readReference({scope,id:made.entry.id,revision:made.entry.revision}),/not authorized/);
  grants.grant({principal:'alice',realm:'project',scope,operations:['read']});
  assert.equal(alice.read(scope).entries.length,1);
  assert.equal(alice.readReference({scope,id:made.entry.id,revision:made.entry.revision}).text,'preserve API');
  // A second identity holds nothing: no data and no sign that any exists.
  const bob=access('bob');
  assert.deepEqual(bob.search('preserve'),nowhere.search('preserve'));
  assert.throws(()=>bob.read(scope),/not authorized/);
  assert.throws(()=>bob.readReference({scope,id:made.entry.id,revision:made.entry.revision}),/not authorized/);
  // Realms are explicit: a grant issued in one realm is never inherited by another.
  const team=access('alice','team');
  assert.equal(team.search('preserve').hits.length,0);
  assert.throws(()=>team.read(scope),/not authorized/);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test("revocation is observed by the very next search and read with no stale window",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-revoke-'));
 try {
  const contexts=new SharedContexts({cwd:root});
  const made=contexts.project.create(item('owner'),-1);assert.ok(!('conflict' in made));
  const empty=new SharedContexts({cwd:join(root,'elsewhere')});
  const grants=new SharedGrants();const scope=contexts.project.scope;
  const build=(principal:string)=>new SharedRetrieval({principal,realm:'project',grants,stores:contexts.stores()});
  grants.grant({principal:'alice',realm:'project',scope,operations:['search','read']});
  grants.grant({principal:'bob',realm:'project',scope,operations:['search','read']});
  const access=build('alice');const reference={scope,id:made.entry.id,revision:made.entry.revision};
  assert.equal(access.search('preserve').hits.length,1);
  assert.equal(access.read(scope).entries.length,1);
  assert.equal(access.readReference(reference).text,'preserve API');
  grants.revoke({principal:'alice',scope});
  const nowhere=new SharedRetrieval({principal:'alice',realm:'project',grants,stores:empty.stores()});
  // The very next call, on the accessor that already returned data and on a fresh one.
  assert.deepEqual(access.search('preserve'),nowhere.search('preserve'));
  assert.deepEqual(build('alice').search('preserve'),nowhere.search('preserve'));
  assert.equal(build('alice').search('preserve').hits.length,0);
  assert.throws(()=>access.read(scope),/not authorized/);
  assert.throws(()=>build('alice').read(scope),/not authorized/);
  assert.throws(()=>build('alice').readReference(reference),/not authorized/);
  assert.throws(()=>build('alice').readReference({scope,id:made.entry.id,revision:99}),/not authorized/);
  // Revocation names a principal: the other identity on the same scope is untouched.
  assert.equal(build('bob').search('preserve').hits.length,1);
  assert.equal(build('bob').read(scope).entries.length,1);
  // Partial revocation drops only the named operation and leaves the other door as it was.
  grants.grant({principal:'carol',realm:'team',scope,operations:['search','read']});
  const carol=new SharedRetrieval({principal:'carol',realm:'team',grants,stores:contexts.stores()});
  assert.equal(carol.search('preserve').hits.length,1);
  assert.equal(carol.read(scope).entries.length,1);
  grants.revoke({principal:'carol',operations:['read'] as SharedOperation[]});
  assert.equal(carol.search('preserve').hits.length,1,'revoking read alone never closes search');
  assert.throws(()=>carol.read(scope),/not authorized/);
  grants.revoke({principal:'carol',operations:['search'] as SharedOperation[]});
  assert.equal(carol.search('preserve').hits.length,0);
  assert.throws(()=>grants.revoke({principal:'carol',operations:[]}),/operations/);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test("a revocation arriving during the read is observed before any data is returned",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-inflight-'));
 try {
  const company=join(root,'company');mkdirSync(company);
  const project=join(root,'project');mkdirSync(project);
  const orgStore=new SharedMemoryStore({root:company,scope:sharedScope('organization',company)});
  const contexts=new SharedContexts({cwd:project,organizations:[company]});
  assert.ok(!('conflict' in contexts.project.create(item('project-owner'),-1)));
  assert.ok(!('conflict' in orgStore.create(item('org-owner'),-1)));
  const grants=new SharedGrants();const projectScope=contexts.project.scope;const orgScope=orgStore.scope;
  const grantBoth=()=>{grants.grant({principal:'alice',realm:'enterprise',scope:projectScope,operations:['search','read']});grants.grant({principal:'alice',realm:'enterprise',scope:orgScope,operations:['search','read']});};
  const refusal=(run:()=>unknown):string=>{let message='';try{run();assert.fail('a refusal was expected');}catch(error){message=String(error);}return message;};
  // The mount's journal read carries a revocation of the scope read just before it, in the same search.
  grantBoth();
  const during=new SharedRetrieval({principal:'alice',realm:'enterprise',grants,stores:[contexts.project,{scope:orgScope,read(){const profile=orgStore.read();grants.revoke({principal:'alice',scope:projectScope});return profile;}}]});
  const duringMessage=refusal(()=>during.search('preserve'));
  assert.match(duringMessage,/changed/);
  assert.doesNotMatch(duringMessage,/preserve API/);
  // The same for a read: the grant is asked again after the projection, before anything is handed back.
  grantBoth();
  const racing=new SharedRetrieval({principal:'alice',realm:'enterprise',grants,stores:[{scope:projectScope,read(){const profile=contexts.project.read();grants.revoke({principal:'alice',scope:projectScope});return profile;}}]});
  const readMessage=refusal(()=>racing.read(projectScope));
  assert.match(readMessage,/changed/);
  assert.doesNotMatch(readMessage,/preserve API/);
  const referenceMessage=refusal(()=>racing.readReference({scope:projectScope,id:'anything',revision:1}));
  assert.match(referenceMessage,/not authorized/);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test("a scope without a grant is never opened and revocation only touches the grant it names",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-denied-'));
 try {
  const company=join(root,'company');mkdirSync(company);
  const broken=join(root,'broken');mkdirSync(broken);writeFileSync(join(broken,'context.jsonl'),'not a journal\n');
  const project=join(root,'project');mkdirSync(project);
  const orgStore=new SharedMemoryStore({root:company,scope:sharedScope('organization',company)});
  const brokenStore=new SharedMemoryStore({root:broken,scope:sharedScope('organization',broken)});
  const contexts=new SharedContexts({cwd:project,organizations:[company]});
  assert.ok(!('conflict' in contexts.project.create(item('project-owner'),-1)));
  assert.ok(!('conflict' in orgStore.create(item('org-owner'),-1)));
  const grants=new SharedGrants();const projectScope=contexts.project.scope;const orgScope=orgStore.scope;
  grants.grant({principal:'alice',realm:'enterprise',scope:projectScope,operations:['search','read']});
  grants.grant({principal:'alice',realm:'enterprise',scope:orgScope,operations:['search','read']});
  const stores=[contexts.project,orgStore,brokenStore] as const;
  const access=new SharedRetrieval({principal:'alice',realm:'enterprise',grants,stores});
  assert.equal(access.search('preserve').hits.length,2);
  assert.throws(()=>access.read(brokenStore.scope),/not authorized/,'a denied journal is never parsed, so its damage is never revealed');
  grants.revoke({principal:'alice',scope:projectScope});
  assert.equal(access.search('preserve').hits.length,1);
  assert.equal(access.search('preserve').hits[0]!.scope.id,orgScope.id);
  assert.throws(()=>access.read(projectScope),/not authorized/);
  assert.equal(access.read(orgScope).entries.length,1);
  grants.revoke({principal:'alice'});
  const stranger=new SharedRetrieval({principal:'mallory',realm:'enterprise',grants,stores});
  assert.deepEqual(access.search('preserve'),stranger.search('preserve'));
  assert.equal(access.search('preserve').hits.length,0);
  assert.throws(()=>access.read(orgScope),/not authorized/);
  assert.throws(()=>access.read(projectScope),/not authorized/);
assert.throws(()=>access.readReference({scope:orgScope,id:'anything',revision:1}),/not authorized/);
  } finally {rmSync(root,{recursive:true,force:true});}
});


// The message every unadmitted reference gets. Comparing against it is what
// proves a refusal leaks nothing: a forged root, an invented scope and a denied
// scope have to be indistinguishable from outside.
const refusalOf=(run:()=>unknown):string=>{let message='';try{run();assert.fail('a refusal was expected');}catch(error){message=String(error);}return message;};
const UNADMITTED=/Shared memory read is not authorized\./;


test("a reference root forged onto another scope cannot redirect a granted read",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-forge-root-'));
 try {
  const company=join(root,'company');mkdirSync(company);
  const project=join(root,'project');mkdirSync(project);
  const orgStore=new SharedMemoryStore({root:company,scope:sharedScope('organization',company)});
  const contexts=new SharedContexts({cwd:project});
  const made=contexts.project.create(item('project-owner'),-1);assert.ok(!('conflict' in made));
  const secret=orgStore.create({kind:'decision',text:'organization only acquisition target',rationale:'confidential to the organization',sources:[{session:'org-owner',seq:1}]},-1);assert.ok(!('conflict' in secret));
  let opened=0;
  const watched:SharedScopeStore={scope:orgStore.scope,root:orgStore.root,read(){opened++;return orgStore.read();}};
  const grants=new SharedGrants();const scope=contexts.project.scope;
  // Alice holds both scopes legitimately, so a refusal below can only come from the forged root, not from a missing grant.
  grants.grant({principal:'alice',realm:'enterprise',scope,operations:['search','read']});
  grants.grant({principal:'alice',realm:'enterprise',scope:orgStore.scope,operations:['search','read']});
  const stores=[contexts.project,watched] as const;
  const access=new SharedRetrieval({principal:'alice',realm:'enterprise',grants,stores});
  // The faithful spelling of the granted root is admitted, so the guard below is a comparison, not a blanket refusal.
  assert.equal(access.readReference({scope,id:made.entry.id,revision:made.entry.revision,root:contexts.project.root}).text,'preserve API');
  const denied=refusalOf(()=>access.readReference({scope:{kind:'project',id:'scope-forged'},id:made.entry.id,revision:made.entry.revision}));
  assert.match(denied,UNADMITTED);
  // Scope A, entry id of scope B, root of scope B: the root is the only thing naming B, and it may not.
  for(const forgedRoot of [orgStore.root,`${orgStore.root}/`,join(orgStore.root,'nowhere','..')]) {
   const message=refusalOf(()=>access.readReference({scope,id:secret.entry.id,revision:secret.entry.revision,root:forgedRoot}));
   assert.equal(message,denied,'a foreign root is refused exactly like a denied scope, so it cannot be probed');
   assert.doesNotMatch(message,/acquisition target/,'the refusal never carries the foreign text');
  }
  // Scope B named honestly, root A grafted on it: the mirror image of the forgery above, same refusal.
  assert.equal(refusalOf(()=>access.readReference({scope:orgStore.scope,id:secret.entry.id,revision:secret.entry.revision,root:contexts.project.root})),denied);
  assert.equal(opened,0,'no forged root ever opened another scope journal');
  // Scope B still answers when the reference is honest, so nothing above was a blanket refusal.
  assert.equal(access.readReference({scope:orgStore.scope,id:secret.entry.id,revision:secret.entry.revision,root:orgStore.root}).text,'organization only acquisition target');
  assert.equal(opened,1);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test("an invented scope id is refused even when its root is a real granted directory",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-forge-scope-'));
 try {
  const project=join(root,'project');mkdirSync(project);
  const contexts=new SharedContexts({cwd:project});
  const made=contexts.project.create(item('owner'),-1);assert.ok(!('conflict' in made));
  const grants=new SharedGrants();const scope=contexts.project.scope;
  grants.grant({principal:'alice',realm:'project',scope,operations:['search','read']});
  const access=new SharedRetrieval({principal:'alice',realm:'project',grants,stores:contexts.stores()});
  const reference={id:made.entry.id,revision:made.entry.revision};
  assert.equal(access.readReference({...reference,scope,root:contexts.project.root}).id,made.entry.id);
  const denied=refusalOf(()=>access.readReference({...reference,scope:{kind:'project',id:'scope-forged'}}));
  assert.match(denied,UNADMITTED);
  // A real directory as the root does not launder an id the registry never issued.
  for(const forgedScope of [{kind:'project',id:'scope-forged'},{kind:'project',id:`${scope.id}0`},{kind:'organization',id:scope.id},{kind:'project',id:'scope forged'},{kind:'elsewhere',id:scope.id} as never])
   for(const forgedRoot of [contexts.project.root,undefined])
    assert.equal(refusalOf(()=>access.readReference({...reference,scope:forgedScope,root:forgedRoot})),denied,'an invented scope refuses with or without a plausible root');
  // Dropping the root does not open it either, and the honest spelling still answers.
  assert.equal(refusalOf(()=>access.readReference({...reference,scope:{kind:'project',id:'scope-forged'}})),denied);
  assert.equal(access.readReference({...reference,scope}).id,made.entry.id);
  // The door is total: a reference that is not a reference refuses like the rest.
  assert.equal(refusalOf(()=>access.readReference(null as never)),denied);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test("a reference already returned is refused on replay after revocation or retargeted to another scope",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-replay-'));
 try {
  const company=join(root,'company');mkdirSync(company);
  const project=join(root,'project');mkdirSync(project);
  const orgStore=new SharedMemoryStore({root:company,scope:sharedScope('organization',company)});
  const contexts=new SharedContexts({cwd:project,organizations:[company]});
  const made=contexts.project.create(item('project-owner'),-1);assert.ok(!('conflict' in made));
  const orgMade=orgStore.create(item('org-owner'),-1);assert.ok(!('conflict' in orgMade));
  const grants=new SharedGrants();const scope=contexts.project.scope;const orgScope=orgStore.scope;
  grants.grant({principal:'alice',realm:'enterprise',scope,operations:['search','read']});
  grants.grant({principal:'alice',realm:'enterprise',scope:orgScope,operations:['search','read']});
  const access=new SharedRetrieval({principal:'alice',realm:'enterprise',grants,stores:contexts.stores()});
  const reference={scope,id:made.entry.id,revision:made.entry.revision,root:contexts.project.root};
  const entry=access.readReference(reference);assert.equal(entry.text,'preserve API');
  const denied=refusalOf(()=>access.readReference({...reference,scope:{kind:'project',id:'scope-forged'}}));
  // A reference carried to another scope may only keep pointing at that scope. Root A on a B reference is incoherent and refuses like a denial.
  for(const forged of [{...reference,scope:orgScope,root:contexts.project.root},{...reference,scope:orgScope,root:join(root,'unrelated')}])
   assert.equal(refusalOf(()=>access.readReference(forged)),denied,'a replayed reference cannot be retargeted with another scope root');
  // Root B (or none at all) is a coherent reference to a granted scope, so it is admitted and then misses: never A's entry, never a leak of it.
  for(const replayed of [{...reference,scope:orgScope,root:orgStore.root},{scope:orgScope,id:reference.id,revision:reference.revision}])
   assert.equal(refusalOf(()=>access.readReference(replayed)),'Error: Shared memory reference not found.','a coherent retarget misses instead of answering with the other scope entry');
  assert.equal(access.readReference({scope:orgScope,id:orgMade.entry.id,revision:orgMade.entry.revision,root:orgStore.root}).text,'preserve API','the honest organization reference still answers, so the misses above were misses and not a blanket refusal');
  // The re-check after the projection is not dead code: a grant that is live when the door opens and spent by the read itself still refuses.
  grants.grant({principal:'dave',realm:'enterprise',scope,operations:['read']});
  const racing=new SharedRetrieval({principal:'dave',realm:'enterprise',grants,stores:[{scope,root:contexts.project.root,read(){const profile=contexts.project.read();grants.revoke({principal:'dave',scope});return profile;}}]});
  const inFlight=refusalOf(()=>racing.readReference(reference));
  assert.match(inFlight,/authorization changed/);
  assert.doesNotMatch(inFlight,/preserve API/,'the entry the racing read produced never reaches the principal');
  // Revoke and replay the untouched object on the accessor that already served it: no cache, no stale window.
  grants.revoke({principal:'alice',scope});
  assert.equal(refusalOf(()=>access.readReference(reference)),denied);
  assert.throws(()=>access.read(reference.scope),/not authorized/);
  // The revocation named the project scope, so the organization door stays open but still cannot answer with the project entry.
  assert.equal(refusalOf(()=>access.readReference({...reference,scope:orgScope,root:orgStore.root})),'Error: Shared memory reference not found.');
  // The scope is still granted to nobody under that principal, whoever asks.
  grants.revoke({principal:'alice'});
  assert.equal(refusalOf(()=>access.readReference(reference)),denied);
  assert.equal(refusalOf(()=>new SharedRetrieval({principal:'alice',realm:'enterprise',grants,stores:contexts.stores()}).readReference(reference)),denied);
  // A principal that still holds the organization grant is untouched by the revocation that named project scope.
  grants.grant({principal:'alice',realm:'enterprise',scope:orgScope,operations:['read']});
  const fresh=new SharedRetrieval({principal:'alice',realm:'enterprise',grants,stores:contexts.stores()});
  assert.equal(fresh.readReference({scope:orgScope,id:orgMade.entry.id,revision:orgMade.entry.revision,root:orgStore.root}).text,'preserve API');
  assert.equal(refusalOf(()=>fresh.readReference(reference)),denied);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test("a root outside every declared scope, a traversal spelling and a symlink are refused unopened",()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-shared-outside-'));
 try {
  const project=join(root,'project');mkdirSync(project);
  const outside=join(root,'outside');mkdirSync(outside);
  // Both bad roots sit on a real directory with its own damage: opening one would either answer with its text or raise its own error.
  const outsider=new SharedMemoryStore({root:outside,scope:sharedScope('organization',outside)});
  assert.ok(!('conflict' in outsider.create(item('outsider'),-1)));
  const damaged=join(root,'damaged');mkdirSync(damaged);writeFileSync(join(damaged,'context.jsonl'),'not a journal\n');
  const link=join(root,'link-to-project');symlinkSync(project,link);
  const contexts=new SharedContexts({cwd:project});
  const made=contexts.project.create(item('owner'),-1);assert.ok(!('conflict' in made));
  const grants=new SharedGrants();const scope=contexts.project.scope;
  grants.grant({principal:'alice',realm:'project',scope,operations:['search','read']});
  const access=new SharedRetrieval({principal:'alice',realm:'project',grants,stores:contexts.stores()});
  const reference={scope,id:made.entry.id,revision:made.entry.revision};
  const denied=refusalOf(()=>access.readReference({...reference,scope:{kind:'project',id:'scope-forged'}}));
  assert.match(denied,UNADMITTED);
  for(const foreignRoot of [outside,join(contexts.project.root,'..','outside'),damaged,join(contexts.project.root,'..','damaged'),link,join(contexts.project.root,'..','link-to-project'),'/etc',`${outside}${sep}`]) {
   const message=refusalOf(()=>access.readReference({...reference,root:foreignRoot}));
   assert.equal(message,denied,`a root outside every declared scope is refused like a denied scope: ${foreignRoot}`);
   assert.doesNotMatch(message,/not a journal|is not a directory|preserve API/,`nothing about ${foreignRoot} may surface`);
  }
  // `..` is normalization, not an escape: the spellings that land back on the granted root are admitted, and open nothing else.
  assert.equal(access.readReference({...reference,root:join(contexts.project.root,'..','shared')}).text,'preserve API');
  assert.equal(access.readReference({...reference,root:join(contexts.project.root,'nowhere','..')}).text,'preserve API');
  assert.equal(access.readReference({...reference,root:`${contexts.project.root}/`}).text,'preserve API');
  // The granted scope itself still answers, so the refusals above are not the root being banned wholesale.
  assert.equal(access.readReference(reference).text,'preserve API');
 } finally {rmSync(root,{recursive:true,force:true});}
});
