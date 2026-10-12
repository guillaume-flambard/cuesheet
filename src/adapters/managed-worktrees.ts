import {trustedGitSnapshot,snapshotMatches,applyGitSnapshot,type GitContentSnapshot} from './git-snapshot.ts';
/** Controller-owned allocations. No integration or worker effects; the only removal is the explicit owner release at the end of this file, which the controller never calls. */
import {execFile} from 'node:child_process';
import {mkdir,realpath,lstat,readFile,open,unlink,readdir,rename,type FileHandle} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {inspectAgentGit,type ManagedWorkspaceCandidate} from './agent-git.ts';
export interface WorktreeAllocation {id:string;unit:string;agent:string;objective:string;revision:number;base:string;}
interface Reservation extends WorktreeAllocation {version:1;repository:string;commonDirectory:string;path:string;pid:number;snapshotDigest:string|null;}
export type AllocationResult={kind:'ready';path:string;base:string;recovered:boolean}|{kind:'busy'|'uncertain'|'refused';reason:string};
const valid=(a:WorktreeAllocation)=>/^[a-z][a-z0-9-]{0,63}$/.test(a.id)&&[a.unit,a.agent,a.objective].every(s=>typeof s==='string'&&s.length>0&&s.length<=200&&!/[\x00-\x1f\x7f]/.test(s))&&Number.isSafeInteger(a.revision)&&a.revision>0&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(a.base);
const inside=(parent:string,path:string)=>{const r=relative(parent,path);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
const absent=async(path:string)=>{try{await lstat(path);return false;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return true;throw e;}};
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch(e){return (e as NodeJS.ErrnoException).code!=='ESRCH';}};
export async function allocateWorktree(options:{repository:string;root:string;allocation:WorktreeAllocation;snapshot?:GitContentSnapshot;signal?:AbortSignal}):Promise<AllocationResult>{
 const refuse=(reason:string):AllocationResult=>({kind:'refused',reason});const a=options.allocation;
 if(!valid(a))return refuse('Invalid attributed allocation.');
 const inventory=await inspectAgentGit(options.repository,{signal:options.signal});if(inventory.kind!=='repository'||inventory.head!==a.base)return refuse('Repository/base unavailable or changed.');
 const snapshot=options.snapshot;if(snapshot&&!trustedGitSnapshot(snapshot,inventory))return refuse('Snapshot attribution is invalid.');if(inventory.dirty&&!snapshot)return refuse('Preserve and attribute local changes before allocation.');if(snapshot&&!await snapshotMatches(snapshot,inventory.workspace,options.signal))return refuse('Source no longer matches its snapshot.');
 const root=resolve(options.root);if(inside(inventory.repository,root)||inside(inventory.commonDirectory,root))return refuse('Managed root must be outside the source repository.');
 try{await mkdir(root,{recursive:true,mode:0o700});if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)return refuse('Managed root must be canonical, without symlink redirection.');}catch{return refuse('Managed root unavailable.');}
 const path=join(root,a.id),file=join(root,a.id+'.jsonl');const reservation:Reservation={...a,version:1,repository:inventory.repository,commonDirectory:inventory.commonDirectory,path,pid:process.pid,snapshotDigest:snapshot?.digest??null};
 const check=async()=>{const actual=await inspectAgentGit(path,{signal:options.signal});return actual.kind==='repository'&&actual.workspace===path&&actual.repository===path&&actual.commonDirectory===inventory.commonDirectory&&actual.head===a.base&&(snapshot?await snapshotMatches(snapshot,path,options.signal):!actual.dirty);};
 const syncRoot=async()=>{const d=await open(root,'r');try{await d.sync();}finally{await d.close();}};
 const appendReady=async()=>{const lock=file+'.finalize';const claim=await open(lock,'wx',0o600);try{const bytes=await readFile(file,'utf8');const records=bytes.trimEnd().split('\n').map(s=>JSON.parse(s));if(!bytes.endsWith('\n')||records.length<1||records.length>2)throw Error('Invalid ledger during finalization.');if(records.length===2){if(records[1].version!==1||records[1].phase!=='ready'||records[1].base!==a.base)throw Error('Invalid ready receipt.');return;}const h=await open(file,'a');try{await h.write(JSON.stringify({version:1,phase:'ready',base:a.base})+'\n');await h.sync();}finally{await h.close();}}finally{await claim.close();await unlink(lock);await syncRoot();}};
  // Why an existing allocation cannot be attested: clean, dirty, absent and moved are different facts.
  const diagnose=async():Promise<string>=>{try{
   if(await absent(path))return 'Managed worktree is absent; its receipt is preserved and it is never recreated implicitly.';
   const actual=await inspectAgentGit(path,{signal:options.signal});
   if(actual.kind==='unavailable'&&actual.reason==='cancelled')return 'Inspection was cancelled; preserve the managed worktree and inspect it before any effect.';
   if(actual.kind!=='repository')return 'Managed worktree is not an attested Git worktree; preserve it and inspect it.';
   // A linked worktree reports itself as its own top level, so ownership is the common Git directory plus the exact managed path.
   if(actual.workspace!==path||actual.repository!==path||actual.commonDirectory!==inventory.commonDirectory)return 'Managed worktree no longer belongs to its recorded repository; preserve it and inspect it.';
   if(actual.head!==a.base)return 'Managed worktree HEAD moved from its recorded base; preserve its contribution and inspect it.';
   if(snapshot?!(await snapshotMatches(snapshot,path,options.signal)):actual.dirty)return 'Managed worktree holds unmerged content; preserve it and inspect it before any reuse.';
   return 'Managed worktree cannot be attested for this allocation; inspect it before any effect.';
  }catch{return 'Managed worktree inspection was inconclusive; preserve it and inspect it before any effect.';}};
 let newlyReserved=false;
 try{
  const handle=await open(file,'wx',0o600);newlyReserved=true;
  try{await handle.write(JSON.stringify({phase:'reserved',...reservation})+'\n');await handle.sync();}finally{await handle.close();}await syncRoot();
 }catch(e){
  if((e as NodeJS.ErrnoException).code!=='EEXIST')return refuse('Reservation persistence failed; no creation admitted.');
  try{
   const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)return refuse('Reservation is not an owned bounded ledger.');
   const bytes=await readFile(file,'utf8');if(!bytes.endsWith('\n'))return refuse('Reservation ledger is incomplete.');const lines=bytes.trimEnd().split('\n').map(s=>JSON.parse(s));
   const saved=lines[0] as Reservation&{phase:string};
   if(lines.length<1||lines.length>2||saved.phase!=='reserved'||saved.version!==1||!Number.isSafeInteger(saved.pid)||saved.pid<1||!valid(saved)||['id','unit','agent','objective','revision','base','repository','commonDirectory','path','snapshotDigest'].some(k=>(saved as unknown as Record<string,unknown>)[k]!== (reservation as unknown as Record<string,unknown>)[k]))return refuse('Allocation attribution changed or ledger invalid.');
   const ready=lines.length===2;if(ready&&(lines[1].version!==1||lines[1].phase!=='ready'||lines[1].base!==a.base))return refuse('Invalid ready receipt.');
    if(!ready&&alive(saved.pid))return {kind:'busy',reason:'Allocation owner is still alive; no duplicate creation.'};
    if(!await check())return {kind:'uncertain',reason:await diagnose()};
   if(!ready)await appendReady();
   return {kind:'ready',path,base:a.base,recovered:!ready};
  }catch{return refuse('Reservation cannot be attested.');}
 }
 if(!newlyReserved)return refuse('Reservation unavailable.');
 try{
  if(!await absent(path))return {kind:'uncertain',reason:'Destination already exists; preserve it.'};
  // Recheck after durable reservation, before the sole mutation.
  const latest=await inspectAgentGit(options.repository,{signal:options.signal});if(latest.kind!=='repository'||latest.head!==a.base||(snapshot?!await snapshotMatches(snapshot,latest.workspace,options.signal):latest.dirty))return {kind:'uncertain',reason:'Source changed after reservation; no creation.'};
  const env={PATH:process.env.PATH??'/usr/bin:/bin',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'};
  await new Promise<void>((accept,reject)=>execFile('git',['-c','core.fsmonitor=false','-c','submodule.recurse=false','-c','core.hooksPath='+(process.platform==='win32'?'NUL':'/dev/null'),'worktree','add','--detach',path,a.base],{cwd:inventory.repository,env,timeout:30000,maxBuffer:262144,signal:options.signal},error=>error?reject(error):accept()));
  if(snapshot)await applyGitSnapshot(snapshot,path,options.signal);
  if(!await check())return {kind:'uncertain',reason:'Created worktree is not attested at the requested base.'};
   await appendReady();return {kind:'ready',path,base:a.base,recovered:false};
  }catch{return {kind:'uncertain',reason:'Allocation effect or receipt unconfirmed; preserve and inspect before retry.'};}
 }
 /** Read-only recovery view of one managed allocation. Nothing here writes, removes or recreates. */
 export interface ManagedWorktreeState {id:string;path:string;ledger:string;phase:'reserved'|'ready'|'invalid';finalizeClaim:boolean;repository:string;commonDirectory:string;base:string;unit:string;agent:string;objective:string;revision:number;snapshotDigest:string|null;ownerAlive:boolean|null;worktree:'present'|'absent'|'unknown';head:string|null;clean:boolean|null;condition:'owned'|'recoverable'|'uncertain'|'invalid';reason:string;}
 const ledgerId=/^([a-z][a-z0-9-]{0,63})\.jsonl$/;
 const unattested=(id:string,path:string,ledger:string,reason:string,finalizeClaim=false):ManagedWorktreeState=>({id,path,ledger,phase:'invalid',finalizeClaim,repository:'',commonDirectory:'',base:'',unit:'',agent:'',objective:'',revision:0,snapshotDigest:null,ownerAlive:null,worktree:'unknown',head:null,clean:null,condition:'invalid',reason});
 /**
  * A crashed controller can die between its exclusive finalize claim and the
  * ready receipt. The claim is what a later controller sees, so recovery reads
  * it instead of inferring a reason from the ledger phase. It is never reclaimed
  * here: no timer, no size, no age makes an orphaned claim deletable.
  */
 const pendingClaim=async(ledger:string):Promise<{claim:boolean;note:string}>=>{try{const stat=await lstat(ledger+'.finalize');if(stat.isSymbolicLink()||!stat.isFile())return {claim:true,note:'Finalize claim is not an owned regular file; preserve it and inspect it.'};return {claim:true,note:''};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {claim:false,note:''};return {claim:true,note:'Finalize claim state is not attested; inspect it before any effect.'};}};
/** One allocation re-inspected: ledger, claim, physical worktree. Read-only, like the listing it serves. */
async function inspectAllocation(dir:string,id:string,signal?:AbortSignal):Promise<ManagedWorktreeState>{
    const ledger=join(dir,id+'.jsonl'),path=join(dir,id);
    const claim=await pendingClaim(ledger);
    let saved:Reservation&{phase:string};let ready=false;
    try{
     const stat=await lstat(ledger);
     if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('Ledger is not an owned bounded file.');
     const bytes=await readFile(ledger,'utf8');if(!bytes.endsWith('\n'))throw Error('Ledger is incomplete.');
     const lines=bytes.trimEnd().split('\n').map(s=>JSON.parse(s));const first=lines[0] as Reservation&{phase:string};
     if(lines.length<1||lines.length>2||first.phase!=='reserved'||first.version!==1||first.id!==id||!valid(first))throw Error('Ledger attribution is invalid.');
     if(lines.length===2){const receipt=lines[1] as {version?:unknown;phase?:unknown;base?:unknown};if(receipt.version!==1||receipt.phase!=='ready'||receipt.base!==first.base)throw Error('Ready receipt is invalid.');ready=true;}
     saved=first;
    }catch{return unattested(id,path,ledger,claim.note||'Ledger cannot be attested; inspect it before any effect.',claim.claim);}
    const state:ManagedWorktreeState={id,path,ledger,phase:ready?'ready':'reserved',finalizeClaim:claim.claim,repository:saved.repository,commonDirectory:saved.commonDirectory,base:saved.base,unit:saved.unit,agent:saved.agent,objective:saved.objective,revision:saved.revision,snapshotDigest:saved.snapshotDigest,ownerAlive:alive(saved.pid),worktree:'unknown',head:null,clean:null,condition:'uncertain',reason:''};
    if(signal?.aborted){state.reason='Inspection was cancelled; allocation state is not attested.';return state;}
    if(await absent(path)){state.worktree='absent';state.reason='Managed worktree is absent; its receipt is preserved and it is never recreated implicitly.';return state;}
    state.worktree='present';
    try{
     const actual=await inspectAgentGit(path,{signal});
     if(actual.kind==='unavailable'&&actual.reason==='cancelled'){state.reason='Inspection was cancelled; preserve the managed worktree and inspect it.';return state;}
     if(actual.kind!=='repository'){state.reason='Managed worktree is not an attested Git worktree; preserve it and inspect it.';return state;}
     state.head=actual.head;
     if(actual.workspace!==path||actual.repository!==path||actual.commonDirectory!==saved.commonDirectory){state.reason='Managed worktree no longer belongs to its recorded repository; preserve it and inspect it.';return state;}
     if(actual.head!==saved.base){state.reason='Managed worktree HEAD moved from its recorded base; preserve its contribution and inspect it.';return state;}
     state.clean=!actual.dirty;
     if(claim.note){state.reason=claim.note;return state;}
     // An orphaned finalize claim is a crash residue: report it, never reclaim it.
     if(claim.claim&&!state.ownerAlive){state.reason='A crashed controller left its finalize claim without a ready receipt; report it and inspect it. The claim is never reclaimed or deleted here.';return state;}
     if(state.ownerAlive){state.condition='owned';state.reason=state.clean?ready?'Allocation owner is alive and holds a clean ready worktree.':'Allocation owner is alive and creation or receipt is still in flight.':'Allocation owner is alive and its worktree holds unmerged content; it is held for its unit.';}
     else{state.condition='recoverable';state.reason=state.clean?'Owner disappeared with a clean attested worktree; it can be reused.':'Owner disappeared with unmerged content preserved; report it and inspect it before any reuse.';}
    }catch{state.reason='Managed worktree inspection failed; preserve it and inspect it manually.';}
   return state;
}
 /**
  * Every ledger under a managed root, with the physical worktree re-inspected.
  *
  * This is the visible half of recovery: after a crash the controller can see
  * which allocations are owned, which are recoverable, and which hold unmerged
  * content, instead of inferring it from an absent directory. An allocation
  * whose receipt cannot be attested is reported as invalid rather than skipped,
  * and an unattested record is never offered for reuse.
  */
 export async function listManagedWorktrees(root:string,options:{signal?:AbortSignal;limit?:number}={}):Promise<ManagedWorktreeState[]>{
  const dir=resolve(root);let names:string[];
  try{names=(await readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&!e.isSymbolicLink()&&ledgerId.test(e.name)).map(e=>e.name).sort();}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
  const limit=Math.max(1,options.limit??64),bounded=names.slice(0,limit),overflow=names.length>bounded.length;
  const out:ManagedWorktreeState[]=[];
  for(const name of bounded)out.push(await inspectAllocation(dir,ledgerId.exec(name)![1]!,options.signal));
  if(overflow)out.push(unattested('overflow','','','Inspection bound reached; further allocations are not attested here.'));
  return out;
 }
 /** Only a recoverable, physically clean, attested worktree is ever offered for reuse. */
 export function managedWorktreeCandidates(states:readonly ManagedWorktreeState[]):ManagedWorkspaceCandidate[]{
  return states.map(s=>({id:s.id,repository:s.repository,base:s.base,unit:s.unit,active:s.condition!=='recoverable',clean:s.clean===true}));
 }

 /**
  * Explicit owner release: the only removal Cuesheet performs, and nothing in
  * the controller, producer or terminal calls it.
  *
  * A managed worktree stays registered in its source repository until it is
  * removed through Git. Deleting the managed root cannot unregister it, because
  * the ledger that explains it goes with the directory. This frees what the
  * listing already classifies as safe and nothing else: a recoverable,
  * Git-clean worktree is removed; an attested allocation whose directory is
  * already gone is unregistered; everything else is held with its reason.
  *
  * Git runs without --force, so a modified, untracked or locked tree is refused
  * by Git itself even if it changed after the recheck. The ledger is archived as
  * `<id>.released.jsonl`, never deleted: listing and allocation only read
  * `<id>.jsonl`, so the archive leaves both and the evidence stays.
  */
 export type ReleaseOutcome={id:string;path:string;kind:'released'|'unregistered'|'already-released'|'held';reason:string;dryRun:boolean};
 const devNull=process.platform==='win32'?'NUL':'/dev/null';
 const gitCommon=(common:string,args:string[],signal?:AbortSignal)=>new Promise<string>((accept,reject)=>{
  const env={PATH:process.env.PATH??'/usr/bin:/bin',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:devNull};
  execFile('git',['--git-dir='+common,'-c','core.fsmonitor=false','-c','submodule.recurse=false','-c','core.hooksPath='+devNull,...args],{env,timeout:30000,maxBuffer:1048576,signal},(error,stdout,stderr)=>error?reject(Error(String(stderr||error.message).trim().split('\n')[0])):accept(stdout));
 });
 const syncDirectory=async(dir:string)=>{const d=await open(dir,'r');try{await d.sync();}finally{await d.close();}};
 /** Every allocation id with a live ledger under a managed root, sorted. Archived ledgers are not allocations any more. */
 export async function managedAllocationIds(root:string):Promise<string[]>{
  try{return (await readdir(resolve(root),{withFileTypes:true})).filter(e=>e.isFile()&&!e.isSymbolicLink()&&ledgerId.test(e.name)).map(e=>ledgerId.exec(e.name)![1]!).sort();}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 }
 export async function releaseManagedWorktree(root:string,id:string,options:{dryRun?:boolean;signal?:AbortSignal}={}):Promise<ReleaseOutcome>{
  const dir=resolve(root),path=join(dir,id),dryRun=options.dryRun===true;
  const held=(reason:string):ReleaseOutcome=>({id,path,kind:'held',reason,dryRun});
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(id))return held('Invalid allocation id.');
  try{if((await lstat(dir)).isSymbolicLink()||await realpath(dir)!==dir)return held('Managed root must be canonical, without symlink redirection.');}catch{return held('Managed root unavailable.');}
  const ledger=join(dir,id+'.jsonl'),archive=join(dir,id+'.released.jsonl');
  // Releasing twice is a no-op: the archive is the proof of the first release.
  if(await absent(ledger)&&!await absent(archive))return {id,path,kind:'already-released',reason:'Released earlier; its archived ledger is preserved.',dryRun};
  const claimFile=ledger+'.release';let claim:FileHandle|undefined;
  if(!dryRun){
   try{claim=await open(claimFile,'wx',0o600);}
   catch(e){return held((e as NodeJS.ErrnoException).code==='EEXIST'?'A release claim exists, in progress or left by a crash; inspect it. It is never reclaimed here.':'Release claim unavailable; nothing was released.');}
  }
  try{
   type Decision={kind:'remove'|'unregister';state:ManagedWorktreeState}|{kind:'held';reason:string};
   const decide=async():Promise<Decision>=>{
    if(!await absent(archive))return {kind:'held',reason:'An archived ledger already exists beside a live one; inspect both.'};
    const state=await inspectAllocation(dir,id,options.signal);
    if(state.phase==='invalid')return {kind:'held',reason:state.reason};
    if(state.finalizeClaim)return {kind:'held',reason:state.reason||'A finalize claim is pending; inspect it before any release.'};
    if(state.worktree==='present'&&state.condition==='recoverable'&&state.clean===true)return {kind:'remove',state};
    if(state.worktree==='absent'&&state.ownerAlive===false)return {kind:'unregister',state};
    return {kind:'held',reason:state.reason||'Allocation cannot be attested as releasable.'};
   };
   const first=await decide();if(first.kind==='held')return held(first.reason);
   const kind=first.kind==='remove'?'released':'unregistered';
   const done=first.kind==='remove'?'Owner is dead and the tree is clean: worktree removed, ledger archived.':'Directory was already gone: registration dropped, ledger archived.';
   if(dryRun)return {id,path,kind,reason:'Would be '+kind+'. '+done,dryRun};
   // Recheck immediately before the sole effect; Git's refusal of an unclean tree closes the remaining window.
   const latest=await decide();if(latest.kind!==first.kind)return held(latest.kind==='held'?latest.reason:'Allocation changed during release; inspect it.');
   const common=latest.state.commonDirectory;
   try{
    const listed=(await gitCommon(common,['worktree','list','--porcelain'],options.signal)).split('\n').includes('worktree '+path);
    if(latest.kind==='remove'&&!listed)return held('Git does not list this worktree for its recorded repository; inspect it.');
    if(listed)await gitCommon(common,['worktree','remove',path],options.signal);
   }catch(e){return held('Git refused the release: '+(e as Error).message);}
   // Remove first, archive second: a crash between them leaves a ready ledger over an absent worktree, which the next release resolves as unregistered.
   await rename(ledger,archive);
   const h=await open(archive,'a');try{await h.write(JSON.stringify({version:1,phase:'released',mode:latest.kind==='remove'?'removed':'unregistered',path,at:new Date().toISOString()})+'\n');await h.sync();}finally{await h.close();}
   await syncDirectory(dir);
   return {id,path,kind,reason:done,dryRun:false};
  }finally{if(claim){await claim.close();await unlink(claimFile).catch(()=>{});await syncDirectory(dir).catch(()=>{});}}
 }
