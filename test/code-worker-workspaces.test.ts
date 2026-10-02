import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, realpathSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile, execFileSync} from 'node:child_process';
import {EventStore} from '../src/core/store.ts';
import {runCodeWorker} from '../src/adapters/code-worker-loop.ts';
import {projectEffectAttempts} from '../src/adapters/tool-receipts.ts';
import {prepareCodeWorkers} from '../src/adapters/code-worker-workspaces.ts';
import {captureGitSnapshot, snapshotMatches} from '../src/adapters/git-snapshot.ts';
import {childEnv} from './fixtures/hermetic-env.ts';
async function fixture(run: (source: string, root: string, git: (...args: string[]) => string) => Promise<void>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(),'cs-code-batch-'))), source = join(root,'source');
  mkdirSync(source);
  const git = (...args: string[]) => execFileSync('git',args,{cwd:source,env:childEnv({home:root,sessions:root}),encoding:'utf8'}).trim();
  try {
    git('init','-q'); git('config','user.name','Fixture'); git('config','user.email','fixture@example.invalid');
    writeFileSync(join(source,'file'),'base'); git('add','.'); git('commit','-qm','base');
    writeFileSync(join(source,'file'),'human dirty'); writeFileSync(join(source,'staged'),'human staged'); git('add','staged');
    await run(source,root,git);
  } finally {rmSync(root,{recursive:true,force:true});}
}
const input = {tasks: [{role:'builder',task:'Build\nPreserve API',files:['src/a.ts']},
  {role:'tester',task:'Test behavior',files:['test/a.ts']}]};
test('two attributed worktrees share dirty base without touching source/index or invoking models',async()=>fixture(async(source,root,git)=>{
  const before = await captureGitSnapshot(source), index = git('diff','--cached'), records: any[] = [];
  let inferred=0, routed=0;
  const result = await prepareCodeWorkers({input,source,root:join(root,'workers'),execution:'E1',objective:{id:'goal',revision:1},
    signal:new AbortController().signal,current:()=>true,route:role=>{routed++;return {label:role,adapter:{name:role,async infer(){inferred++;throw Error('not admitted');}}};},append:event=>records.push(event)});
  assert.equal(result.kind,'ready',JSON.stringify(result)); assert.equal(routed,2); assert.equal(inferred,0);
  if(result.kind!=='ready')return;
  assert.notEqual(result.workers[0]!.path,result.workers[1]!.path);
  for(const worker of result.workers){assert.equal(readFileSync(join(worker.path,'file'),'utf8'),'human dirty');assert.equal(readFileSync(join(worker.path,'staged'),'utf8'),'human staged');}
  assert.ok(await snapshotMatches(before,source)); assert.equal(git('diff','--cached'),index);
  assert.equal(records.filter(e=>e.data.phase==='ready').length,1);
  assert.ok(Object.isFrozen(result.workers));
}));
test('configured route failure refuses the whole batch before allocation',async()=>fixture(async(source,root)=>{
  const target=join(root,'workers');const records:any[]=[];
  const result=await prepareCodeWorkers({input,source,root:target,execution:'E1',objective:{id:'goal',revision:1},signal:new AbortController().signal,
    current:()=>true,route:role=>{if(role==='tester')throw Error('missing');return {label:role,adapter:{name:role,async infer(){throw Error('no fallback');}}};},append:e=>records.push(e)});
  assert.equal(result.kind,'refused');assert.equal(existsSync(target),false);assert.equal(records.length,1);
}));
test('correction or source drift preserves partial allocations but never publishes ready',async()=>{
  for(const drift of [false,true])await fixture(async(source,root)=>{
    let current=true; const records:any[]=[];
    const result=await prepareCodeWorkers({input,source,root:join(root,'workers'),execution:'E1',objective:{id:'goal',revision:1},signal:new AbortController().signal,
      current:()=>current,route:role=>({label:role,adapter:{name:role,async infer(){throw Error('not admitted');}}}),append:e=>{
        records.push(e);if(e.data.phase==='prepared'&&records.filter(r=>r.data.phase==='prepared').length===1){if(drift)writeFileSync(join(source,'file'),'new human edit');else current=false;}
      }});
    assert.ok(result.kind==='stale'||result.kind==='refused',JSON.stringify(result));
    assert.equal(records.some(e=>e.data.phase==='ready'),false);
    if(result.kind==='ready')return;
    assert.ok(result.preserved.length>=1);assert.ok(existsSync(result.preserved[0]!));
    assert.equal(readFileSync(join(source,'file'),'utf8'),drift?'new human edit':'human dirty');
  });
});
test('two real Node effect processes write only their isolated contributions with separate receipts',async()=>fixture(async(source,root)=>{
  const before=await captureGitSnapshot(source), controller=new AbortController(), calls=new Map<string,number>();
  const prepared=await prepareCodeWorkers({input,source,root:join(root,'workers'),execution:'E1',objective:{id:'goal',revision:1},signal:controller.signal,
    current:()=>true,append:()=>{},route:role=>({label:role,adapter:{name:role,async infer(){
      const n=(calls.get(role)??0)+1;calls.set(role,n);
      return n===1?{text:'',toolCalls:[{name:'node',input:{argv:['-e',`const fs=require('fs');const start=Date.now();fs.writeFileSync(${JSON.stringify(role)},'contribution');setTimeout(()=>console.log(JSON.stringify({pid:process.pid,start,end:Date.now()})),250);`]}}]}:{text:'unverified contribution',toolCalls:[]};
    }}})});
  assert.equal(prepared.kind,'ready');if(prepared.kind!=='ready')return;
  const journals=prepared.workers.map(w=>new EventStore(w.id,Date.now)), timings:any[]=[];
  const results=await Promise.all(prepared.workers.map((worker,i)=>runCodeWorker({worker,allow:['node'],maxSteps:2,signal:controller.signal,current:()=>true,
    frame:()=>({goal:'shared goal',history:[],directives:[],evidence:[],capabilities:[],model:worker.model,step:1}),append:e=>journals[i]!.append(e),
    tools:{run:request=>new Promise((accept,reject)=>execFile(process.execPath,request.input.argv as string[],{cwd:worker.path,signal:controller.signal,env:childEnv({home:root,sessions:root})},(error,stdout)=>{if(error)return reject(error);timings.push(JSON.parse(stdout));accept({name:'node',exit:0,output:stdout});}))}})));
  assert.ok(results.every(r=>r.phase==='proposal'));assert.equal(timings.length,2);assert.notEqual(timings[0].pid,timings[1].pid);
  assert.ok(Math.max(...timings.map(t=>t.start))<Math.min(...timings.map(t=>t.end)),'actual child lifetimes overlap');
  for(let i=0;i<prepared.workers.length;i++){const w=prepared.workers[i]!;assert.equal(readFileSync(join(w.path,w.packet.role),'utf8'),'contribution');assert.equal(projectEffectAttempts(journals[i]!.toSession().events)[0]!.scopeCwd,w.path);}
  assert.equal(existsSync(join(source,'builder')),false);assert.equal(existsSync(join(source,'tester')),false);assert.ok(await snapshotMatches(before,source));
}));
