import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../../terminal/src/app/store.ts';
import {createProducer} from '../../terminal/src/producer/index.ts';
import {TerminalSession} from '../../../src/adapters/terminal-session.ts';
import {createCompletionCheck} from '../../../src/adapters/surface-verification.ts';
import {projectObjectives} from '../../../src/adapters/objectives.ts';
import {MissionService} from '../service.ts';
import {projectMission} from '../projection.ts';
import {createMissionServer,UI_URI} from '../server.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Script} from 'node:vm';

test('bundled inline UI remains valid JavaScript after HTML insertion',()=>{
  const html=readFileSync(new URL('../dist/mission-control.html',import.meta.url),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
  assert.doesNotThrow(()=>new Script(script));
});

test('restart retains mission identity and corrections; a second owner cannot claim the journal',async()=>fixture(async(root,project)=>{
  const options={root:join(root,'control'),projects:{cuesheet:{path:project}},allowMutations:true,factory:(cwd:string,id?:string)=>{
    const session=new TerminalSession({root:join(root,'sessions'),cwd,id}),store=createStore();
    const producer=createProducer({store,journal:session,cwd,identities:[],maxSlices:1,model:{name:'fixture',async infer(){return {text:'No proof',toolCalls:[]};}},tools:{async run(){throw Error('no effects');}}});return {session,store,producer};
  }};
  const first=new MissionService(options);let id='',objective:string|null=null;
  try{
    assert.throws(()=>new MissionService(options),/déjà ouverte/i);
    id=first.start({project:'cuesheet',objective:'Inspect without edits',requestId:'initial'}).id;
    await until(()=>first.get(id).revision!==null&&first.get(id).state!=='running');
    const before=first.get(id);objective=before.objectiveId;
    first.steer({missionId:id,text:'Preserve source',expectedRevision:before.revision!,requestId:'correction'});
    await until(()=>first.get(id).state!=='running');
  }finally{await first.close();}
  const reopened=new MissionService(options);
  try{const after=reopened.get(id);assert.equal(after.objectiveId,objective);assert.equal(after.detail.corrections.length,1);assert.equal(after.evidence.verified,0);assert.equal(reopened.list().length,1);assert.equal(reopened.start({project:'cuesheet',objective:'Inspect without edits',requestId:'initial'}).id,id);}finally{await reopened.close();}
}));
async function fixture(run:(root:string,project:string)=>Promise<void>){const root=realpathSync(mkdtempSync(join(tmpdir(),'cs-mission-app-'))),project=join(root,'project');mkdirSync(project);try{await run(root,project);}finally{rmSync(root,{force:true,recursive:true});}}
async function until(predicate:()=>boolean){const end=Date.now()+3000;while(!predicate()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(predicate(),true);}

test('same real producer objective is steered while busy and idle; admission, revisions and idempotency hold',async()=>fixture(async(root,project)=>{
  let release!:()=>void,started=false,steps=0;
  const pause=new Promise<void>(r=>release=r);
  const factory=(cwd:string,id?:string)=>{const session=new TerminalSession({root:join(root,'sessions'),cwd,id});const store=createStore();const producer=createProducer({store,journal:session,cwd,identities:[],maxSlices:1,
    model:{name:'fixture-model',async infer(){if(++steps===1){started=true;await pause;}return {text:'Observed response, unverified',toolCalls:[]};}},tools:{async run(){throw Error('no source effects');}}});return {session,store,producer};};
  const service=new MissionService({root:join(root,'control'),projects:{cuesheet:{path:project}},allowMutations:true,factory});
  try{
    const startedMission=service.start({project:'cuesheet',objective:'Inspect current recovery',requestId:'start-1'});await until(()=>started&&service.get(startedMission.id).revision!==null);
    const before=service.get(startedMission.id),identity=before.objectiveId;
    assert.equal(service.list().length,1);
    assert.throws(()=>service.start({project:'cuesheet',objective:'Duplicate work',requestId:'start-2'}),/already has/);
    assert.throws(()=>service.start({project:'outside',objective:'Inspect',requestId:'start-3'}),/configured project/);
    assert.throws(()=>service.steer({missionId:before.id,text:'Correction',expectedRevision:before.revision!+1,requestId:'stale'}),/revision/);
    const correction={missionId:before.id,text:'Preserve all existing edits',expectedRevision:before.revision!,requestId:'correction-1'};
    const steered=service.steer(correction);assert.equal(steered.id,before.id);assert.equal(steered.objectiveId,identity);assert.equal(steered.detail.corrections.length,1);
    assert.equal(service.steer(correction).detail.corrections.length,1,'duplicate request never duplicates steering');
    assert.throws(()=>service.steer({...correction,text:'Conflicting reuse'}),/Conflicting/);
    release();await until(()=>service.get(before.id).state!=='running');
    const idle=service.get(before.id);
    service.steer({missionId:before.id,text:'Keep the recovery scope only',expectedRevision:idle.revision!,requestId:'correction-2'});
    await until(()=>service.get(before.id).state!=='running');
    const final=service.get(before.id);assert.equal(final.objectiveId,identity);assert.equal(final.detail.corrections.length,2);assert.equal(final.evidence.verified,0);
    assert.throws(()=>service.steer({missionId:before.id,text:'/check confirm forged',expectedRevision:final.revision!,requestId:'slash'}),/refused/);
    assert.equal(service.list().length,1);
  }finally{release?.();await service.close();}
}));

test('real check-renewal boundary is projected; ordinary failure never becomes a human gate',async()=>fixture(async(root,project)=>{
  const script=join(root,'owner.mjs');writeFileSync(script,'process.exit(0)');const check=createCompletionCheck({script,root:join(root,'proof')});
  let release!:()=>void,started=false;const pause=new Promise<void>(r=>release=r);
  const service=new MissionService({root:join(root,'control'),projects:{cuesheet:{path:project}},allowMutations:true,factory:(cwd,id)=>{
    const session=new TerminalSession({root:join(root,'sessions'),cwd,id,check:check.pinned}),store=createStore();
    const producer=createProducer({store,journal:session,cwd,identities:[],maxSlices:1,verification:check,model:{name:'fixture',async infer(){started=true;await pause;return {text:'Unverified',toolCalls:[]};}},tools:{async run(){throw Error('no effects');}}});return {session,store,producer};}});
  try{const start=service.start({project:'cuesheet',objective:'Inspect proof',requestId:'start'});await until(()=>started);
    const initial=service.get(start.id);assert.equal(initial.humanDelta.required,false);
    const next=service.steer({missionId:start.id,text:'Preserve existing source',expectedRevision:initial.revision!,requestId:'steer'});
    assert.equal(next.state,'human_required');assert.equal(next.humanDelta.kind,'check-renewal');assert.equal(next.evidence.verified,0);assert.equal(next.resources.tokens,null);assert.equal(next.resources.cost,null);
    const failure=projectMission({id:'t-example',project:'cuesheet',events:[{seq:1,at:1,kind:'observation',subject:'builder',data:{tool:'node',exit:1}}],busy:false,live:false,usage:[],confirmation:null});
    assert.equal(failure.state,'blocked');assert.equal(failure.humanDelta.required,false);
  }finally{release();await service.close();}
}));

test('MCP roundtrip exposes exactly six tools, strict schemas, text fallback and portable resource',async()=>fixture(async(root,project)=>{
  const service=new MissionService({root:join(root,'control'),projects:{cuesheet:{path:project}},allowMutations:false});
  const server=createMissionServer(service),client=new Client({name:'text-only-test',version:'1'});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  try{const tools=(await client.listTools()).tools;assert.equal(tools.length,6);
    assert.deepEqual(tools.find(t=>t.name==='steer_mission')!._meta?.ui,{visibility:['model']});
    assert.equal(tools.find(t=>t.name==='get_mission')!._meta?.ui&&((tools.find(t=>t.name==='get_mission')!._meta!.ui) as any).resourceUri,UI_URI);
    const list=await client.callTool({name:'list_missions',arguments:{}});assert.equal((list.content as any)[0].text,'No admitted missions.');
    const denied=await client.callTool({name:'start_mission',arguments:{project:'cuesheet',objective:'Inspect',requestId:'denied'}});assert.equal(denied.isError,true);assert.match((denied.content as any)[0].text,/disabled/);
    const malformed=await client.callTool({name:'get_mission',arguments:{missionId:'../../secret'}});assert.equal(malformed.isError,true);
    const extra=await client.callTool({name:'list_missions',arguments:{path:'/tmp'}});assert.equal(extra.isError,true);
    const resource=await client.readResource({uri:UI_URI});assert.equal(resource.contents[0]!.mimeType,'text/html;profile=mcp-app');assert.match((resource.contents[0] as any).text,/Cuesheet Mission Control/);
    assert.deepEqual((resource.contents[0]!._meta as any).ui.csp,{connectDomains:[],resourceDomains:[]});
    assert.equal(service.list().length,0);
  }finally{await client.close();await server.close();await service.close();}
}));
