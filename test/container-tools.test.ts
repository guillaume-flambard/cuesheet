import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,linkSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ContainerToolRunner,inspectContainerRoots,containerOutput} from '../src/adapters/container-tools.ts';
import {SessionContainers} from '../src/adapters/container-receipts.ts';
const image='node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
function frame(text:string){const data=Buffer.from(text),header=Buffer.alloc(8);header[0]=1;header.writeUInt32BE(data.length,4);return Buffer.concat([header,data]);}
test('container output validates frames before returning bounded tail',()=>{
 assert.equal(containerOutput(Buffer.concat([frame('hello'),frame(' world')]),5),'world');
 assert.throws(()=>containerOutput(Buffer.from('garbage'),10));assert.throws(()=>containerOutput(frame('hello').subarray(0,10),10));
});
test('writable mounts refuse hardlinks and ignore masked control contents',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-links-'));try{
  const work=join(root,'work');mkdirSync(work);writeFileSync(join(root,'outside'),'before');linkSync(join(root,'outside'),join(work,'alias'));
  assert.throws(()=>inspectContainerRoots([work],[]),/hardlink/);
  assert.doesNotThrow(()=>inspectContainerRoots([work],[join(work,'alias')]));
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('resource journal retains ownership without creating files on read and refuses corruption',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-owner-'));try{
  const journal=new SessionContainers({root,sessionId:'t-fixture'});assert.deepEqual(journal.read(),[]);assert.equal(existsSync(join(root,'t-fixture.containers.jsonl')),false);
  const name='cuesheet-tool-11111111-1111-1111-1111-111111111111';
  journal.record({phase:'admitted',name,image,scope:root,intentSeq:1,inputDigest:'a'.repeat(64)});
  journal.record({phase:'cleanup',name,removed:false});assert.equal(journal.read()[0]!.status,'uncertain');
  journal.record({phase:'cleanup',name,removed:true});assert.equal(journal.read()[0]!.status,'removed');
  assert.throws(()=>journal.record({phase:'cleanup',name,removed:true}));
  const path=join(root,'t-fixture.containers.jsonl');writeFileSync(path,'damaged\n');assert.throws(()=>journal.read());assert.equal(readFileSync(path,'utf8'),'damaged\n');
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('local Engine requests isolate policy and persist ownership before create',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-engine-')),socket=join(root,'s');const calls:string[]=[],receipts:string[]=[];let create:any;
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const path=req.url!;calls.push(req.method+' '+path);
  if(path==='/version'){res.end(JSON.stringify({Os:'linux',ApiVersion:'1.56',MinAPIVersion:'1.40'}));}
  else if(path.includes('/create?')){assert.deepEqual(receipts,['admitted']);create=JSON.parse(Buffer.concat(chunks).toString());res.statusCode=201;res.end(JSON.stringify({Id:'a'.repeat(64)}));}
  else if(path.endsWith('/start')){res.statusCode=204;res.end();}
  else if(path.includes('/wait?'))res.end(JSON.stringify({StatusCode:0}));
  else if(path.includes('/logs?'))res.end(frame('ok'));
  else if(req.method==='DELETE'){res.statusCode=204;res.end();}else{res.statusCode=404;res.end();}
 });
 await new Promise<void>(r=>server.listen(socket,r));
 try{
  const runner=new ContainerToolRunner({allow:['node'],roots:[root],defaultCwd:root,socket,image,onAdmission:()=>receipts.push('admitted'),onCleanup:(_,removed)=>receipts.push(String(removed))});
  // Socket is a host IPC channel: refuse it in workspace, then mask its containing subtree.
  const refused=await runner.run({name:'node',input:{argv:['node','-e','console.log(1)']}});assert.equal(refused.exit,126);assert.match(refused.output,/Workspace inspection: Workspace exposes a special file or hardlink\. No command was executed/);assert.equal(create,undefined);
  const work=join(root,'work');mkdirSync(work);
  const safe=new ContainerToolRunner({allow:['node'],roots:[work],defaultCwd:work,socket,image,onAdmission:()=>receipts.push('admitted'),onCleanup:(_,removed)=>receipts.push(String(removed))});
  const result=await safe.run({name:'node',input:{argv:['node','-e','console.log(1)'],env:{SECRET:'value'},image:'evil'}});
  assert.equal(result.exit,0);assert.equal(result.output,'ok');assert.deepEqual(receipts,['admitted','true']);
  assert.ok(create.Env.includes('NPM_CONFIG_OFFLINE=true'));assert.ok(create.Env.includes('NPM_CONFIG_YES=false'));assert.equal(create.Image,image);assert.equal(create.HostConfig.NetworkMode,'none');assert.equal(create.HostConfig.ReadonlyRootfs,true);assert.deepEqual(create.HostConfig.CapDrop,['ALL']);assert.equal(create.Env.some((v:string)=>v.includes('SECRET')),false);assert.notEqual(create.User,'0:0');
  assert.equal(calls.filter(v=>v.startsWith('DELETE')).length,1);
  const denied=new ContainerToolRunner({allow:['node'],roots:[work],defaultCwd:work,socket,image,onAdmission:()=>{throw new Error('disk full');}});
  const prior=calls.filter(v=>v.includes('/create?')).length;assert.equal((await denied.run({name:'node',input:{argv:['node','-e','0']}})).exit,126);assert.equal(calls.filter(v=>v.includes('/create?')).length,prior);
 }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('real local Docker contains writes, reads and controller paths',{skip:!process.env.CUESHEET_TEST_TOOL_SOCKET||!process.env.CUESHEET_TEST_TOOL_IMAGE},async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-real-')),work=join(root,'work');mkdirSync(work);mkdirSync(join(work,'.cuesheet'));writeFileSync(join(work,'.cuesheet','secret'),'controller');writeFileSync(join(root,'outside'),'neighbor');
 try{
  const runner=new ContainerToolRunner({allow:['node'],roots:[work],defaultCwd:work,socket:process.env.CUESHEET_TEST_TOOL_SOCKET!,image:process.env.CUESHEET_TEST_TOOL_IMAGE!,timeoutMs:10000});
  const script=`const fs=require('fs');fs.writeFileSync('inside','yes');for(const p of ${JSON.stringify([join(root,'outside'),join(work,'.cuesheet','secret')])}){try{fs.writeFileSync(p,'bad');throw Error('escaped')}catch(e){if(e.message==='escaped')throw e;}try{fs.readFileSync(p);throw Error('read escaped')}catch(e){if(e.message==='read escaped')throw e;}}console.log('contained')`;
  const result=await runner.run({name:'node',input:{argv:['node','-e',script]}});assert.equal(result.exit,0,result.output);assert.match(result.output,/contained/);assert.equal(readFileSync(join(work,'inside'),'utf8'),'yes');assert.equal(readFileSync(join(root,'outside'),'utf8'),'neighbor');assert.equal(readFileSync(join(work,'.cuesheet','secret'),'utf8'),'controller');
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('real Docker blocks network and kills descendants on cancellation',{skip:!process.env.CUESHEET_TEST_TOOL_SOCKET||!process.env.CUESHEET_TEST_TOOL_IMAGE},async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-cancel-'));const receipts:{name:string;removed:boolean}[]=[];
 try{
  const runner=new ContainerToolRunner({allow:['node'],roots:[root],defaultCwd:root,socket:process.env.CUESHEET_TEST_TOOL_SOCKET!,image:process.env.CUESHEET_TEST_TOOL_IMAGE!,timeoutMs:5000,onCleanup:(name,removed)=>receipts.push({name,removed})});
  const network=await runner.run({name:'node',input:{argv:['node','-e',`const net=require('net');const s=net.connect(80,'1.1.1.1');s.on('connect',()=>process.exit(9));s.on('error',()=>{console.log('network denied');process.exit(0)});setTimeout(()=>{s.destroy();console.log('network unavailable');process.exit(0)},500);`]}});
  assert.equal(network.exit,0,network.output);assert.match(network.output,/network (denied|unavailable)/);
  const abort=new AbortController();const pending=runner.run({name:'node',input:{argv:['node','-e',`require('child_process').spawn(process.execPath,['-e',"setTimeout(()=>require('fs').writeFileSync('late','bad'),1200)"],{detached:true,stdio:'ignore'}).unref();require('fs').writeFileSync('started','yes');setTimeout(()=>{},10000);`]}},abort.signal);
  const limit=Date.now()+3000;while(!existsSync(join(root,'started'))&&Date.now()<limit)await new Promise(r=>setTimeout(r,20));assert.equal(existsSync(join(root,'started')),true);abort.abort();const stopped=await pending;assert.equal(stopped.exit,null);assert.equal(receipts.at(-1)!.removed,true);
  await new Promise(r=>setTimeout(r,1400));assert.equal(existsSync(join(root,'late')),false);
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('uncertain creation only cleans its owned name and preserves failed cleanup',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-fault-')),work=join(root,'work'),socket=join(root,'s');mkdirSync(work);let owned='';let removed:boolean|undefined;let deletion='';
 const server=createServer((req,res)=>{
  if(req.url==='/version')res.end(JSON.stringify({Os:'linux',ApiVersion:'1.51',MinAPIVersion:'1.40'}));
  else if(req.url!.includes('/create?')){res.statusCode=201;res.end('{"Id":"invalid"}');}
  else if(req.method==='DELETE'){deletion=req.url!;res.statusCode=500;res.end('{}');}else{res.statusCode=500;res.end('{}');}
 });await new Promise<void>(r=>server.listen(socket,r));
 try{
  const runner=new ContainerToolRunner({allow:['node'],roots:[work],defaultCwd:work,socket,image,onAdmission:name=>{owned=name;},onCleanup:(_,value)=>{removed=value;}});
  const result=await runner.run({name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('escaped','bad')"]}});assert.equal(result.exit,null);assert.equal(removed,false);assert.ok(owned);assert.ok(deletion.includes(owned));assert.match(result.output,/Cleanup not confirmed/);assert.equal(existsSync(join(work,'escaped')),false);
 }finally{await new Promise<void>(r=>server.close(()=>r()));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
for(const mode of ['configured','auto'] as const)test(`terminal runtime ${mode} links Docker ownership to a durable admitted intent`,{skip:!process.env.CUESHEET_TEST_TOOL_SOCKET||!process.env.CUESHEET_TEST_TOOL_IMAGE},async()=>{
 const {TerminalSession}=await import('../src/adapters/terminal-session.ts');const {persistentView}=await import('../apps/terminal/src/producer/session-view.ts');const {createLiveProducer}=await import('../apps/terminal/src/producer/runtime.ts');
 const root=mkdtempSync(join(tmpdir(),'cs-runtime-docker-')),work=join(root,'work');mkdirSync(work);const session=new TerminalSession({root:join(root,'sessions'),cwd:work});
 const keys=['CUESHEET_TOOL_IMAGE','CUESHEET_TOOL_SOCKET','CUESHEET_MAX_SLICES','CUESHEET_CONTEXT_ROOTS','CUESHEET_SKILL_ROOTS','CUESHEET_VERIFY_SCRIPT','CUESHEET_TOOL_MODE'];const before=keys.map(key=>process.env[key]);
 try{
  if(mode==='configured'){process.env.CUESHEET_TOOL_IMAGE=process.env.CUESHEET_TEST_TOOL_IMAGE;process.env.CUESHEET_TOOL_SOCKET=process.env.CUESHEET_TEST_TOOL_SOCKET;}else{delete process.env.CUESHEET_TOOL_IMAGE;delete process.env.CUESHEET_TOOL_SOCKET;}delete process.env.CUESHEET_TOOL_MODE;process.env.CUESHEET_MAX_SLICES='1';delete process.env.CUESHEET_CONTEXT_ROOTS;delete process.env.CUESHEET_SKILL_ROOTS;delete process.env.CUESHEET_VERIFY_SCRIPT;
  const {VaultStore}=await import('../src/adapters/vault.ts');const goal='qzfixture'+root.split('/').pop()!.replace(/[^a-zA-Z0-9]/g,'');new VaultStore({root:join(work,'.cuesheet','vault')}).write({id:'runtime',title:goal,text:'Vault runtime source marker',active:true,source:{author:'human',reference:'fixture-owner/1'},expectedDocument:null},-1);
  const view=persistentView(session);let calls=0;const binding={selection:{},missing:null,label:'fixture',select:()=>({ok:true as const}),adapter:{name:'fixture',async infer(frame:any){assert.match(JSON.stringify(frame),/Vault runtime source marker/);assert.equal(session.core.toSession().events.filter(e=>e.subject==='terminal.objective').at(-1)!.data.scope,work,'fixture scope must be admitted before any tool');return {text:'',toolCalls:++calls===1?[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('runtime-result','yes')"]}},{name:'node',input:{argv:['node','-e',"console.log(require('fs').readFileSync('runtime-result','utf8'))"]}}]:[]};}}};
  const live=createLiveProducer(view,work,{journal:session,binding});assert.ok(!('missing' in live));if('missing' in live)throw Error(live.missing);
  live.producer.say(goal);const until=Date.now()+10000;while(view.get().busy&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.equal(view.get().busy,false);assert.equal(existsSync(join(work,'runtime-result')),true,JSON.stringify(session.core.toSession().events));assert.equal(readFileSync(join(work,'runtime-result'),'utf8'),'yes');
  const resources=new SessionContainers({root:session.root,sessionId:session.metadata.id}).read();assert.equal(resources.length,2,JSON.stringify(session.core.toSession().events.filter(e=>e.kind==='action'||e.kind==='observation')));assert.equal(resources.every(resource=>resource.status==='removed'),true);const intent=session.core.toSession().events.find(e=>e.seq===resources[0]!.intentSeq)!;assert.equal(intent.subject,'terminal.intent');assert.equal(intent.data.scopeCwd,work);
 }finally{keys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});session.close();rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('absent cleanup after unconfirmed creation is not proof against a late daemon create',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-late-create-')),work=join(root,'work'),socket=join(root,'s');mkdirSync(work);let removed:boolean|undefined;
 const server=createServer((req,res)=>{if(req.url==='/version')res.end(JSON.stringify({Os:'linux',ApiVersion:'1.51',MinAPIVersion:'1.40'}));else if(req.method==='DELETE'){res.statusCode=404;res.end('{}');}else if(req.url!.includes('/create?')){res.statusCode=201;res.end('{"Id":"unconfirmed"}');}else res.end('{}');});await new Promise<void>(r=>server.listen(socket,r));
 try{const runner=new ContainerToolRunner({allow:['node'],roots:[work],defaultCwd:work,socket,image,onCleanup:(_,value)=>{removed=value;}});const result=await runner.run({name:'node',input:{argv:['node','-e','0']}});assert.equal(result.exit,null);assert.equal(removed,false);assert.match(result.output,/Cleanup not confirmed/);}finally{await new Promise<void>(r=>server.close(()=>r()));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('protected host controls remain masked when their parent root is an alias',{skip:!process.env.CUESHEET_TEST_TOOL_SOCKET||!process.env.CUESHEET_TEST_TOOL_IMAGE},async()=>{
 const {symlinkSync}=await import('node:fs');const root=mkdtempSync(join(tmpdir(),'cs-protected-alias-')),work=join(root,'work'),alias=join(root,'alias');mkdirSync(work);symlinkSync(work,alias,'dir');const protectedFile=join(alias,'owner-check');writeFileSync(protectedFile,'controller-secret-fixture');
 try{
  const runner=new ContainerToolRunner({allow:['node'],roots:[alias],defaultCwd:alias,socket:process.env.CUESHEET_TEST_TOOL_SOCKET!,image:process.env.CUESHEET_TEST_TOOL_IMAGE!,protectedPaths:[protectedFile],timeoutMs:5000});
  const result=await runner.run({name:'node',input:{argv:['node','-e',"const fs=require('fs');console.log(fs.readFileSync('owner-check','utf8'));try{fs.writeFileSync('owner-check','corrupted-fixture');console.log('write succeeded')}catch{console.log('write refused')}" ]}});
  assert.equal(result.exit,0,result.output);assert.doesNotMatch(result.output,/controller-secret-fixture|write succeeded/);assert.match(result.output,/write refused/);assert.equal(readFileSync(protectedFile,'utf8'),'controller-secret-fixture');
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
