import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseToolRoute,DEFAULT_TOOL_IMAGE,DEFAULT_CONTAINER_TOOLS} from '../src/adapters/tool-route.ts';
const base={home:'/fixture/home',enterprise:false,socketAvailable:()=>false};
test('automatic route prefers a local conventional socket without touching a daemon',()=>{
 const inspected:string[]=[];const route=chooseToolRoute({...base,socketAvailable:path=>{inspected.push(path);return path==='/fixture/home/.docker/run/docker.sock';}});
 assert.equal(route.kind,'container');if(route.kind!=='container')throw Error('missing container');assert.equal(route.socket,'/fixture/home/.docker/run/docker.sock');assert.equal(route.image,DEFAULT_TOOL_IMAGE);assert.equal(route.defaultImage,true);assert.equal(inspected.length,1);assert.deepEqual(DEFAULT_CONTAINER_TOOLS,['node','npm','npx','cat','ls']);
});
test('absent isolation never silently enables enterprise host execution',()=>{
 assert.equal(chooseToolRoute(base).kind,'local');assert.equal(chooseToolRoute({...base,enterprise:true}).kind,'unavailable');assert.equal(chooseToolRoute({...base,enterprise:true,mode:'local'}).kind,'unavailable');
 assert.equal(chooseToolRoute({...base,mode:'local',socketAvailable:()=>{throw Error('Local override must not inspect sockets');}}).kind,'local');
});
test('explicit container or image stays on that route when the socket is stale',()=>{
 for(const options of [{mode:'container'},{image:DEFAULT_TOOL_IMAGE},{socket:'/local/socket',socketAvailable:()=>true}])assert.equal(chooseToolRoute({...base,...options}).kind,'container');
 assert.equal(chooseToolRoute({...base,socket:'/local/missing',enterprise:true}).kind,'container');
 assert.throws(()=>chooseToolRoute({...base,socket:'tcp://remote:2375'}));assert.throws(()=>chooseToolRoute({...base,mode:'invented'}));
});
test('enterprise runtime refuses an explicit local override without advertising host commands',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {TerminalSession}=await import('../src/adapters/terminal-session.ts');const {persistentView}=await import('../apps/terminal/src/producer/session-view.ts');const {createLiveProducer}=await import('../apps/terminal/src/producer/runtime.ts');
 const root=mkdtempSync(join(tmpdir(),'cs-enterprise-route-')),work=join(root,'work'),company=join(root,'company');mkdirSync(work);mkdirSync(company);writeFileSync(join(company,'context.jsonl'),'');const session=new TerminalSession({root:join(root,'sessions'),cwd:work});
 const keys=['CUESHEET_TOOL_MODE','CUESHEET_TOOL_IMAGE','CUESHEET_TOOL_SOCKET','CUESHEET_CONTEXT_ROOTS','CUESHEET_MAX_SLICES','CUESHEET_VERIFY_SCRIPT','CUESHEET_SKILL_ROOTS'];const before=keys.map(key=>process.env[key]);
 try{
  process.env.CUESHEET_TOOL_MODE='local';process.env.CUESHEET_CONTEXT_ROOTS=company;process.env.CUESHEET_MAX_SLICES='1';delete process.env.CUESHEET_TOOL_IMAGE;delete process.env.CUESHEET_TOOL_SOCKET;delete process.env.CUESHEET_VERIFY_SCRIPT;delete process.env.CUESHEET_SKILL_ROOTS;
  let calls=0,after='';const view=persistentView(session);const binding={selection:{},missing:null,label:'fixture',select:()=>({ok:true as const}),adapter:{name:'fixture',async infer(frame:any){assert.equal(session.core.toSession().events.filter(e=>e.subject==='terminal.objective').at(-1)!.data.scope,work);if(++calls===1)return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('unsafe','bad')"]}}]};after=JSON.stringify(frame);return {text:'',toolCalls:[]};}}};
  const live=createLiveProducer(view,work,{journal:session,binding});assert.ok(!('missing' in live));if('missing' in live)throw Error(live.missing);live.producer.say('qz'+root.split('/').pop()!.replace(/[^a-zA-Z0-9]/g,''));const end=Date.now()+5000;while(view.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(view.get().busy,false);assert.equal(existsSync(join(work,'unsafe')),false);assert.match(after,/outils externes indisponibles sans isolation/);assert.doesNotMatch(after,/tools: node, git/);
 }finally{keys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});session.close();rmSync(root,{recursive:true,force:true});}
});
test('runtime observes a Docker socket that appears after construction',{skip:!process.env.CUESHEET_TEST_TOOL_SOCKET||!process.env.CUESHEET_TEST_TOOL_IMAGE},async(t)=>{
 const fs=await import('node:fs');const {syncBuiltinESMExports}=await import('node:module');const {tmpdir,homedir}=await import('node:os');const {join}=await import('node:path');const {TerminalSession}=await import('../src/adapters/terminal-session.ts');const {SessionContainers}=await import('../src/adapters/container-receipts.ts');const {persistentView}=await import('../apps/terminal/src/producer/session-view.ts');const {createLiveProducer}=await import('../apps/terminal/src/producer/runtime.ts');
 const root=fs.mkdtempSync(join(tmpdir(),'cs-route-refresh-')),work=join(root,'work');fs.mkdirSync(work);const session=new TerminalSession({root:join(root,'sessions'),cwd:work});
 const keys=['CUESHEET_TOOL_MODE','CUESHEET_TOOL_IMAGE','CUESHEET_TOOL_SOCKET','CUESHEET_CONTEXT_ROOTS','CUESHEET_MAX_SLICES','CUESHEET_VERIFY_SCRIPT','CUESHEET_SKILL_ROOTS'];const before=keys.map(key=>process.env[key]);let available=false;const originalStat=fs.default.statSync;
 const mocked=t.mock.method(fs.default,'statSync',((path:any,...args:any[])=>{if(String(path)===join(homedir(),'.docker','run','docker.sock'))return {isSocket:()=>available};if(String(path)==='/var/run/docker.sock')return {isSocket:()=>false};return (originalStat as any)(path,...args);}) as any);syncBuiltinESMExports();
 try{
  keys.forEach(key=>delete process.env[key]);process.env.CUESHEET_MAX_SLICES='1';const view=persistentView(session);let calls=0;
  const binding={selection:{},missing:null,label:'fixture',select:()=>({ok:true as const}),adapter:{name:'fixture',async infer(frame:any){assert.equal(session.core.toSession().events.filter(e=>e.subject==='terminal.objective').at(-1)!.data.scope,work);assert.match(JSON.stringify(frame),/Conteneur Linux déclaré/,'fresh start must switch the previously local runner');return {text:'',toolCalls:++calls===1?[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('fresh-route','yes')"]}}]:[]};}}};
  const live=createLiveProducer(view,work,{journal:session,binding});assert.ok(!('missing' in live));if('missing' in live)throw Error(live.missing);available=true;
  live.producer.say('qz'+root.split('/').pop()!.replace(/[^a-zA-Z0-9]/g,''));const end=Date.now()+5000;while(view.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(view.get().busy,false);assert.equal(fs.existsSync(join(work,'fresh-route')),true,'fresh execution did not use the available container');assert.equal(new SessionContainers({root:session.root,sessionId:session.metadata.id}).read().length,1);
 }finally{mocked.mock.restore();syncBuiltinESMExports();keys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});session.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('selector reobserves availability while owner choices remain a snapshot',async()=>{
 const {createToolRouteSelector}=await import('../src/adapters/tool-route.ts');let available=false;const options={home:'/fixture/home',enterprise:true,mode:'auto',socketAvailable:()=>available};const select=createToolRouteSelector(options);assert.equal(select().kind,'unavailable');
 options.mode='local';options.enterprise=false;options.home='/changed';available=true;const next=select();assert.equal(next.kind,'container');if(next.kind==='container')assert.equal(next.socket,'/fixture/home/.docker/run/docker.sock');available=false;assert.equal(select().kind,'unavailable');
});
