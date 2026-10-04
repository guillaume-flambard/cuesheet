import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TerminalSession} from '../src/adapters/terminal-session.ts';
import {organizeWork} from '../src/adapters/work-organizer.ts';
import {VaultStore} from '../src/adapters/vault.ts';
import {ProjectVaultPublisher} from '../src/adapters/vault-publisher.ts';
import {createProducer} from '../apps/terminal/src/producer/index.ts';
import {persistentView} from '../apps/terminal/src/producer/session-view.ts';
import {VaultRetrieval} from '../src/adapters/vault.ts';
const goal='Harness sharing';
function objective(session:TerminalSession,scope:string,author:'human'|'unknown'='human'){
 const source=session.core.append({kind:'note',subject:'terminal.user',data:{text:goal}});
 return session.core.append({kind:'note',subject:'terminal.objective',data:{version:1,operation:'create',id:'objective-fixture',text:goal,scope,source:source.seq,author}});
}
function plan(session:TerminalSession,spec?:string,phase='spec'){
 const result=organizeWork(session.core,{name:'organize_work',input:{phase,rationale:'Useful shared project specification',...(spec?{spec}:{}),tasks:['Implement spec']}});assert.equal(result?.exit,0,result?.output);
}
test('automatic draft publication survives reopen, deduplicates phase changes and protects human corrections',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-publisher-')),work=join(root,'work'),vaultRoot=join(work,'.cuesheet','vault');mkdirSync(work);let session=new TerminalSession({root:join(root,'sessions'),cwd:work});
 try{
  const publisher=()=>new ProjectVaultPublisher({root:vaultRoot,scope:work,sessionId:session.metadata.id,assertWritable:()=>session.assertWritable()});
  assert.equal(publisher().sync(session.core.toSession().events).status,'absent');assert.equal(existsSync(vaultRoot),false);
  objective(session,work);plan(session,'Shared harness spec OLD');const published=publisher().sync(session.core.toSession().events);assert.equal(published.status,'published');assert.ok('document' in published);if(!('document' in published))throw Error('missing document');
  const first=published.document;assert.equal(first.source.author,'model');assert.match(first.source.reference,/session=t-.*;plan=\d+;objective=objective-fixture@2/);
  const id=session.metadata.id;session.close();session=new TerminalSession({root:join(root,'sessions'),cwd:work,id});assert.equal(publisher().sync(session.core.toSession().events).status,'unchanged');
  plan(session,undefined,'build');assert.equal(publisher().sync(session.core.toSession().events).status,'unchanged');assert.equal(new VaultStore({root:vaultRoot}).read().history.length,1);
  plan(session,'Shared harness spec NEW');assert.equal(publisher().sync(session.core.toSession().events).status,'published');const vault=new VaultStore({root:vaultRoot});let state=vault.read();assert.equal(state.history.length,2);assert.equal(state.history[0]!.text,'Shared harness spec OLD');
  const latest=state.documents[0]!;vault.write({id:latest.id,title:latest.title,text:'Human correction',active:true,source:{author:'human',reference:'owner/1'},expectedDocument:latest.revision},state.revision);
  plan(session,'Model must not replace human');assert.equal(publisher().sync(session.core.toSession().events).status,'protected');state=vault.read();assert.equal(state.documents[0]!.text,'Human correction');assert.equal(state.history.length,3);
  const human=state.documents[0]!;vault.write({id:human.id,title:human.title,text:human.text,active:false,source:{author:'human',reference:'owner/2'},expectedDocument:human.revision},state.revision);assert.equal(publisher().sync(session.core.toSession().events).status,'protected');assert.equal(vault.read().documents[0]!.active,false);
 }finally{session.close();rmSync(root,{recursive:true,force:true});}
});
test('publisher refuses another scope or unknown authorship without creating a Vault',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-publisher-scope-'));try{
  for(const author of ['human','unknown'] as const){const session=new TerminalSession({root:join(root,author),cwd:root});try{objective(session,root,author);plan(session,'Spec');const publisher=new ProjectVaultPublisher({root:join(root,'vault-'+author),scope:author==='human'?join(root,'other'):root,sessionId:session.metadata.id,assertWritable:()=>session.assertWritable()});assert.equal(publisher.sync(session.core.toSession().events).status,'refused');assert.equal(existsSync(join(root,'vault-'+author)),false);}finally{session.close();}}
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('producer publishes a useful specification automatically before the next inference',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-publisher-loop-')),work=join(root,'work');mkdirSync(work);const session=new TerminalSession({root:join(root,'sessions'),cwd:work});try{
  const view=persistentView(session),vaultRoot=join(work,'.cuesheet','vault');let calls=0;let after='';
  const producer=createProducer({store:view,journal:session,cwd:work,identities:[],projectsRoot:root,maxSlices:1,tools:{async run(){throw Error('No external effects');}},vaultForScope:()=>new VaultRetrieval({principal:'owner',scopes:[{kind:'project',id:'project',root:vaultRoot}],authorize:()=>true}),vaultPublisherForScope:()=>new ProjectVaultPublisher({root:vaultRoot,scope:work,sessionId:session.metadata.id,assertWritable:()=>session.assertWritable()}),
   model:{name:'fixture',async infer(frame){if(++calls===1)return {text:'',toolCalls:[{name:'organize_work',input:{phase:'spec',rationale:'Shared project needs a durable spec',spec:'Harness sharing durable specification',tasks:['Build harness']}}]};after=JSON.stringify(frame);return {text:'',toolCalls:[]};}}});
  producer.say(goal);const end=Date.now()+5000;while(view.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(view.get().busy,false);const state=new VaultStore({root:vaultRoot}).read();assert.equal(state.documents.length,1);assert.equal(state.documents[0]!.source.author,'model');assert.match(after,/Harness sharing durable specification/);assert.match(after,/draft-/);assert.equal(state.history.length,1);assert.equal(session.core.toSession().goal?.open,true);
 }finally{session.close();rmSync(root,{recursive:true,force:true});}
});
test('actual process death after the plan is recovered before draft publication',async()=>{
 const {spawn}=await import('node:child_process');const root=mkdtempSync(join(tmpdir(),'cs-publisher-crash-')),work=join(root,'work');mkdirSync(work);let session:TerminalSession|undefined;
 try{
  const terminalModule=new URL('../src/adapters/terminal-session.ts',import.meta.url).href,organizerModule=new URL('../src/adapters/work-organizer.ts',import.meta.url).href;
  const script=`import {TerminalSession} from ${JSON.stringify(terminalModule)};import {organizeWork} from ${JSON.stringify(organizerModule)};const s=new TerminalSession({root:${JSON.stringify(join(root,'sessions'))},cwd:${JSON.stringify(work)}});const source=s.core.append({kind:'note',subject:'terminal.user',data:{text:${JSON.stringify(goal)}}});s.core.append({kind:'note',subject:'terminal.objective',data:{version:1,operation:'create',id:'objective-fixture',text:${JSON.stringify(goal)},scope:${JSON.stringify(work)},source:source.seq,author:'human'}});const result=organizeWork(s.core,{name:'organize_work',input:{phase:'spec',rationale:'Useful durable spec',spec:'Crash-safe harness sharing spec',tasks:['Build']}});if(result.exit!==0)throw Error(result.output);process.stdout.write(s.metadata.id,()=>process.kill(process.pid,'SIGKILL'));`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});let id='',err='';child.stdout.on('data',chunk=>id+=chunk.toString());child.stderr.on('data',chunk=>err+=chunk.toString());const signal=await new Promise<string|null>((resolve,reject)=>{child.on('error',reject);child.on('exit',(_,signal)=>resolve(signal));});assert.equal(signal,'SIGKILL',err);assert.match(id,/^t-/);
  const vaultRoot=join(work,'.cuesheet','vault');assert.equal(existsSync(vaultRoot),false);session=new TerminalSession({root:join(root,'sessions'),cwd:work,id});const publisher=new ProjectVaultPublisher({root:vaultRoot,scope:work,sessionId:id,assertWritable:()=>session!.assertWritable()});const revision=session.core.revision;
  assert.equal(publisher.sync(session.core.toSession().events).status,'published');assert.equal(publisher.sync(session.core.toSession().events).status,'unchanged');assert.equal(session.core.revision,revision);assert.equal(new VaultStore({root:vaultRoot}).read().history.length,1);assert.equal(session.core.toSession().events.filter(e=>e.subject==='terminal.objective').length,1);
 }finally{session?.close();rmSync(root,{recursive:true,force:true});}
});

test('isolated planning preserves the source snapshot and resumes with its durable specification',async()=>{
 const {execFileSync}=await import('node:child_process');const {realpathSync,writeFileSync}=await import('node:fs');const {ShellToolRunner}=await import('../src/adapters/shell.ts');const {captureGitSnapshot}=await import('../src/adapters/git-snapshot.ts');const {childEnv}=await import('./fixtures/hermetic-env.ts');
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'cs-publisher-isolation-'))),work=join(dir,'source'),root=join(dir,'sessions');mkdirSync(work);const git=(...args:string[])=>execFileSync('git',args,{cwd:work,env:childEnv({home:dir,sessions:root}),encoding:'utf8'});git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');writeFileSync(join(work,'file'),'base');git('add','.');git('commit','-qm','base');
 let session=new TerminalSession({root,cwd:work});const id=session.metadata.id;const vaultRoot=join(work,'.cuesheet','vault');const before=await captureGitSnapshot(work);
 const factory=(scope:string)=>Object.assign(new ShellToolRunner({allow:['cat'],roots:[scope],defaultCwd:scope,env:childEnv({home:dir,sessions:root})}),{names:['cat']});
 const setup=(model:any)=>{const view=persistentView(session);return {view,producer:createProducer({store:view,journal:session,cwd:work,identities:[],maxSlices:1,worktreeRoot:join(root,'workspaces',id),tools:factory(work),toolsForScope:factory,vaultPublisherForScope:()=>new ProjectVaultPublisher({root:vaultRoot,scope:work,sessionId:id,assertWritable:()=>session.assertWritable()}),model})};};
 const wait=async(view:ReturnType<typeof persistentView>)=>{const end=Date.now()+8000;while(view.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(view.get().busy,false);};
 try{let calls=0;const first=setup({name:'fixture',async infer(){return {text:'',toolCalls:++calls===1?[{name:'prepare_workspace',input:{unit:'isolated plan'}}]:calls===2?[{name:'organize_work',input:{phase:'spec',rationale:'Preserve the source during isolated work',spec:'Isolated durable specification',tasks:['Implement scoped component']}}]:[]};}});first.producer.say('qzisolated publisher');await wait(first.view);assert.ok(calls>=3);assert.equal(existsSync(vaultRoot),false);assert.equal((await captureGitSnapshot(work)).digest,before.digest);const selected=session.core.toSession().events.find(e=>e.subject==='terminal.workspace'&&e.data.phase==='selected')!;assert.ok(selected);session.close();session=new TerminalSession({root,cwd:work,id});let resumed=0;const second=setup({name:'fixture',async infer(frame:any){resumed++;assert.match(JSON.stringify(frame),/Isolated durable specification/);assert.ok(JSON.stringify(frame).includes(String(selected.data.path)));return {text:'',toolCalls:[]};}});second.producer.resume!();await wait(second.view);assert.ok(resumed>0);assert.equal(existsSync(vaultRoot),false);assert.equal((await captureGitSnapshot(work)).digest,before.digest);
 }finally{session.close();rmSync(dir,{recursive:true,force:true});}
});
