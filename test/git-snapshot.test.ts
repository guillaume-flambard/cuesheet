import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync,symlinkSync,unlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync,spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {captureGitSnapshot,snapshotMatches} from '../src/adapters/git-snapshot.ts';import {allocateWorktree,listManagedWorktrees,managedWorktreeCandidates} from '../src/adapters/managed-worktrees.ts';import {inspectAgentGit,chooseAgentIsolation} from '../src/adapters/agent-git.ts';import {childEnv} from './fixtures/hermetic-env.ts';
async function fixture(run:(repository:string,root:string,git:(...a:string[])=>string)=>Promise<void>){const dir=realpathSync(mkdtempSync(join(tmpdir(),'cs-git-snapshot-'))),repository=join(dir,'source'),root=join(dir,'managed');mkdirSync(repository);const git=(...a:string[])=>execFileSync('git',a,{cwd:repository,env:childEnv({home:dir,sessions:dir}),encoding:'utf8'}).trim();try{git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');writeFileSync(join(repository,'file'),'base');writeFileSync(join(repository,'delete'),'remove');git('add','.');git('commit','-qm','base');await run(repository,root,git);}finally{rmSync(dir,{recursive:true,force:true});}}
const allocation=(base:string)=>({id:'snapshot-task',unit:'build',agent:'worker',objective:'goal',revision:1,base});
test('dirty staged/unstaged/deleted/binary/untracked content transfers without changing source index or files',async()=>fixture(async(repository,root,git)=>{writeFileSync(join(repository,'file'),'human working change');writeFileSync(join(repository,'staged'),'human staged');git('add','staged');unlinkSync(join(repository,'delete'));writeFileSync(join(repository,'binary'),Buffer.from([0,1,2,0,255]));mkdirSync(join(repository,'notes'));writeFileSync(join(repository,'notes','new'),'untracked human note');const status=git('status','--porcelain'),index=git('diff','--cached','--binary'),head=git('rev-parse','HEAD');const snapshot=await captureGitSnapshot(repository);assert.equal(Object.isFrozen(snapshot),true);assert.equal(await snapshotMatches(snapshot,repository),true);const result=await allocateWorktree({repository,root,allocation:allocation(head),snapshot});assert.equal(result.kind,'ready',JSON.stringify(result));if(result.kind!=='ready')return;assert.equal(await snapshotMatches(snapshot,result.path),true);assert.equal(readFileSync(join(result.path,'file'),'utf8'),'human working change');assert.equal(readFileSync(join(result.path,'staged'),'utf8'),'human staged');assert.deepEqual(readFileSync(join(result.path,'binary')),Buffer.from([0,1,2,0,255]));assert.equal(readFileSync(join(result.path,'notes','new'),'utf8'),'untracked human note');assert.equal(git('status','--porcelain'),status);assert.equal(git('diff','--cached','--binary'),index);assert.equal(git('rev-parse','HEAD'),head);assert.equal((await allocateWorktree({repository,root,allocation:allocation(head),snapshot})).kind,'ready');}));
test('stale or fabricated snapshot cannot admit a dirty source allocation',async()=>fixture(async(repository,root,git)=>{writeFileSync(join(repository,'file'),'first');const snapshot=await captureGitSnapshot(repository);const base=git('rev-parse','HEAD');assert.equal((await allocateWorktree({repository,root,allocation:allocation(base),snapshot:{...snapshot}})).kind,'refused');writeFileSync(join(repository,'file'),'new human correction');assert.equal(await snapshotMatches(snapshot,repository),false);assert.equal((await allocateWorktree({repository,root,allocation:allocation(base),snapshot})).kind,'refused');assert.equal(git('worktree','list','--porcelain').split('worktree ').length,2);assert.equal(readFileSync(join(repository,'file'),'utf8'),'new human correction');}));
test('symlink and oversize untracked content refuse capture rather than dropping human changes',async()=>fixture(async(repository,_root,git)=>{symlinkSync('../outside',join(repository,'link'));await assert.rejects(captureGitSnapshot(repository),/regular files/);unlinkSync(join(repository,'link'));writeFileSync(join(repository,'large'),Buffer.alloc(2*1024*1024+1));await assert.rejects(captureGitSnapshot(repository),/2MiB/);assert.match(git('status','--porcelain'),/large/);}));

test('only exact untracked capsule dependency alias is derived; foreign or tracked links are not hidden',async()=>fixture(async(repository,_root,git)=>{writeFileSync(join(repository,'.gitignore'),'node_modules/\n');git('add','.gitignore');git('commit','-qm','ignore dependencies');const before=await captureGitSnapshot(repository);const path=join(repository,'node_modules');symlinkSync('/opt/cuesheet-deps/node_modules',path,'dir');assert.equal((await captureGitSnapshot(repository)).digest,before.digest);unlinkSync(path);symlinkSync('/foreign/dependencies',path,'dir');await assert.rejects(captureGitSnapshot(repository),/regular files/);unlinkSync(path);symlinkSync('/opt/cuesheet-deps/node_modules',path,'dir');git('add','-f','node_modules');const tracked=await captureGitSnapshot(repository);assert.notEqual(tracked.digest,before.digest);assert.match(tracked.patch,/node_modules/);}));

/** A controller process that allocates, then is killed without any cleanup of its own. */
const managedSource=fileURLToPath(new URL('../src/adapters/managed-worktrees.ts',import.meta.url));
type Allocation={id:string;unit:string;agent:string;objective:string;revision:number;base:string;};
function killedController(repository:string,root:string,allocation:Allocation,unmerged:boolean):Promise<{kind:string;path?:string;reason?:string}>{
 const home=realpathSync(repository);
 const left=unmerged?"if(r.kind==='ready')writeFileSync(join(r.path,'pending'),'unmerged work');":'';
 // The child reports its allocation and then waits forever, so the parent decides when the session is interrupted.
 const script=`import {allocateWorktree} from ${JSON.stringify(managedSource)};import {writeFileSync} from 'node:fs';import {join} from 'node:path';const r=await allocateWorktree(${JSON.stringify({repository,root,allocation})});${left}console.log(JSON.stringify(r));if(r.kind==='ready')await new Promise(()=>{});`;
 return new Promise((accept,reject)=>{const p=spawn(process.execPath,['--input-type=module','--eval',script],{env:childEnv({home,sessions:home})});let out='',err='',killed=false,result:any=null;
  const timer=setTimeout(()=>{p.kill('SIGKILL');},20000);
  p.stdout.on('data',b=>{out+=b;if(!killed&&out.includes('\n')){killed=true;try{result=JSON.parse(out.trim());}catch{}p.kill('SIGKILL');}});
  p.stderr.on('data',b=>err+=b);p.on('error',reject);
  p.on('exit',(code,signal)=>{clearTimeout(timer);
   // Only a killed controller proves an interrupted session rather than an orderly exit.
   if(result===null)reject(Error(err||`controller produced no allocation result (code ${code}, signal ${signal})`));
   else if(killed&&signal!=='SIGKILL')reject(Error(`controller was not interrupted (code ${code}, signal ${signal})`));
   else accept(result);});});
}
const attributed=(repository:string,root:string,id:string):Allocation=>({id,unit:'build',agent:'worker-1',objective:'goal',revision:1,base:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,env:childEnv({home:realpathSync(repository),sessions:realpathSync(repository)}),encoding:'utf8'}).trim()});

test('a crashed controller leaves a worktree that is found again with visible state and never deleted',async()=>fixture(async(repository,root,git)=>{
 const a=attributed(repository,root,'crash-task');
 const created=await killedController(repository,root,a,true);
 assert.equal(created.kind,'ready');
 const before=git('worktree','list','--porcelain').split('worktree ').length;
 const receipt=readFileSync(join(root,'crash-task.jsonl'),'utf8');
 const states=await listManagedWorktrees(root);
 assert.equal(states.length,1);
 const s=states[0]!;
 assert.equal(s.id,'crash-task');
 assert.equal(s.phase,'ready');
 assert.equal(s.ownerAlive,false);
 assert.equal(s.worktree,'present');
 assert.equal(s.clean,false);
 assert.equal(s.condition,'recoverable');
 assert.match(s.reason,/unmerged content preserved/);
 assert.equal(s.path,created.path);
 assert.equal(readFileSync(join(s.path,'pending'),'utf8'),'unmerged work');
 // Unmerged content is reported, never offered as a reuse candidate.
 const inventory=await inspectAgentGit(repository);
 assert.equal(inventory.kind,'repository');
 if(inventory.kind==='repository'){
  const decision=chooseAgentIsolation({access:'write',unit:'build',inventory,managed:managedWorktreeCandidates(states)});
  assert.equal(decision.kind,'isolated-write');
  assert.equal(decision.kind==='isolated-write'?decision.reuse:null,null);
 }
 const again=await allocateWorktree({repository,root,allocation:a});
 assert.equal(again.kind,'uncertain');
 assert.equal(again.kind==='uncertain'&&/unmerged content/.test(again.reason),true);
 assert.equal(readFileSync(join(s.path,'pending'),'utf8'),'unmerged work');
 assert.equal(readFileSync(join(root,'crash-task.jsonl'),'utf8'),receipt);
 assert.equal(git('worktree','list','--porcelain').split('worktree ').length,before);
 assert.equal((await listManagedWorktrees(root)).length,1);
 assert.equal(git('status','--porcelain'),'');
}));

test('a crashed controller with a clean worktree is reused rather than recreated or removed',async()=>fixture(async(repository,root,git)=>{
 const a=attributed(repository,root,'clean-task');
 const created=await killedController(repository,root,a,false);
 assert.equal(created.kind,'ready');
 const before=git('worktree','list','--porcelain').split('worktree ').length;
 const receipt=readFileSync(join(root,'clean-task.jsonl'),'utf8');
 const states=await listManagedWorktrees(root);
 const s=states[0]!;
 assert.equal(s.condition,'recoverable');
 assert.equal(s.clean,true);
 assert.match(s.reason,/can be reused/);
 const inventory=await inspectAgentGit(repository);
 assert.equal(inventory.kind,'repository');
 if(inventory.kind==='repository'){
  const decision=chooseAgentIsolation({access:'write',unit:'build',inventory,managed:managedWorktreeCandidates(states)});
  assert.equal(decision.kind==='isolated-write'?decision.reuse:null,'clean-task');
 }
 const again=await allocateWorktree({repository,root,allocation:a});
 assert.equal(again.kind,'ready');
 assert.equal(again.kind==='ready'?again.path:'',created.path);
 assert.equal(readFileSync(join(root,'clean-task.jsonl'),'utf8'),receipt);
 assert.equal(git('worktree','list','--porcelain').split('worktree ').length,before);
 assert.equal(git('status','--porcelain'),'');
}));

test('recovery separates clean from dirty work and never drops unmerged content',async()=>fixture(async(repository,root,git)=>{
 writeFileSync(join(repository,'file'),'human working change');
 const snapshot=await captureGitSnapshot(repository);
 const a=attributed(repository,root,'carry-task');
 assert.equal((await allocateWorktree({repository,root,allocation:a,snapshot})).kind,'ready');
 const path=join(root,a.id);
 assert.equal(readFileSync(join(path,'file'),'utf8'),'human working change');
 const file=join(root,a.id+'.jsonl');
 const saved=JSON.parse(readFileSync(file,'utf8').split('\n')[0]!);
 saved.pid=2147483647;
 writeFileSync(file,JSON.stringify(saved)+'\n');
 const carried=await listManagedWorktrees(root);
 assert.equal(carried[0]!.condition,'recoverable');
 assert.equal(carried[0]!.clean,false);
 // The same attributed snapshot recovers the carried human content and its receipt.
 const recovered=await allocateWorktree({repository,root,allocation:a,snapshot});
 assert.equal(recovered.kind,'ready');
 assert.equal(recovered.kind==='ready'&&recovered.recovered,true);
 assert.equal(readFileSync(join(path,'file'),'utf8'),'human working change');
 // A contribution beyond the snapshot is reported, never silently discarded.
 writeFileSync(join(path,'extra'),'worker contribution');
 const reported=await allocateWorktree({repository,root,allocation:a,snapshot});
 assert.equal(reported.kind,'uncertain');
 assert.equal(reported.kind==='uncertain'&&/unmerged content/.test(reported.reason),true);
 writeFileSync(join(repository,'file'),'base');
 // Dropping the attributed snapshot changes the receipt attribution, so a clean source cannot launder the carried content.
 const reportedClean=await allocateWorktree({repository,root,allocation:a});
 assert.equal(reportedClean.kind,'refused');
 assert.equal(reportedClean.kind==='refused'&&/attribution changed/.test(reportedClean.reason),true);
 assert.equal(readFileSync(join(path,'file'),'utf8'),'human working change');
 assert.equal(readFileSync(join(path,'extra'),'utf8'),'worker contribution');
 const states=await listManagedWorktrees(root);
 assert.equal(states.length,1);
 assert.equal(states[0]!.condition,'recoverable');
 assert.equal(states[0]!.clean,false);
 assert.equal(git('worktree','list','--porcelain').split('worktree ').length,3);
 assert.equal(git('status','--porcelain'),'');
}));

test('a finalize claim orphaned by a crash is reported, blocks reuse and is never reclaimed',async()=>fixture(async(repository,root,git)=>{
 const a=attributed(repository,root,'claim-task');
 assert.equal((await allocateWorktree({repository,root,allocation:a})).kind,'ready');
 const ledger=join(root,a.id+'.jsonl'),claim=ledger+'.finalize';
 // The durable residue a controller leaves when it dies between its exclusive claim and the ready receipt.
 const reserved=readFileSync(ledger,'utf8').split('\n')[0]!;
 const crashed=JSON.parse(reserved);crashed.pid=2147483647;
 writeFileSync(ledger,JSON.stringify(crashed)+'\n');
 writeFileSync(claim,'claimed before the receipt\n');
 const states=await listManagedWorktrees(root);
 assert.equal(states.length,1);
 const s=states[0]!;
 assert.equal(s.phase,'reserved');
 assert.equal(s.finalizeClaim,true);
 assert.equal(s.ownerAlive,false);
 assert.equal(s.clean,true);
 assert.equal(s.condition,'uncertain');
 assert.match(s.reason,/finalize claim without a ready receipt/);
 // A clean attested worktree is still not reusable while the crash residue is unattested.
 const inventory=await inspectAgentGit(repository);
 assert.equal(inventory.kind,'repository');
 if(inventory.kind==='repository'){
  const decision=chooseAgentIsolation({access:'write',unit:'build',inventory,managed:managedWorktreeCandidates(states)});
  assert.equal(decision.kind==='isolated-write'?decision.reuse:null,null);
 }
 const again=await allocateWorktree({repository,root,allocation:a});
 assert.equal(again.kind,'refused');
 assert.equal(readFileSync(claim,'utf8'),'claimed before the receipt\n');
 assert.equal(readFileSync(ledger,'utf8'),JSON.stringify(crashed)+'\n');
 assert.equal(readFileSync(join(root,a.id,'file'),'utf8'),'base');
 assert.equal(git('worktree','list','--porcelain').split('worktree ').length,3);
 assert.equal(git('status','--porcelain'),'');
}));
