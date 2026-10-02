import {trustedGitSnapshot,snapshotMatches,applyGitSnapshot,type GitContentSnapshot} from './git-snapshot.ts';
/** Controller-owned allocations. No integration, cleanup or worker effects. */
import {execFile} from 'node:child_process';
import {mkdir,realpath,lstat,readFile,open,unlink,readdir} from 'node:fs/promises';
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
  for(const name of bounded){
const id=ledgerId.exec(name)![1]!,ledger=join(dir,name),path=join(dir,id);
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
    }catch{out.push(unattested(id,path,ledger,claim.note||'Ledger cannot be attested; inspect it before any effect.',claim.claim));continue;}
    const state:ManagedWorktreeState={id,path,ledger,phase:ready?'ready':'reserved',finalizeClaim:claim.claim,repository:saved.repository,commonDirectory:saved.commonDirectory,base:saved.base,unit:saved.unit,agent:saved.agent,objective:saved.objective,revision:saved.revision,snapshotDigest:saved.snapshotDigest,ownerAlive:alive(saved.pid),worktree:'unknown',head:null,clean:null,condition:'uncertain',reason:''};
    if(options.signal?.aborted){state.reason='Inspection was cancelled; allocation state is not attested.';out.push(state);continue;}
    if(await absent(path)){state.worktree='absent';state.reason='Managed worktree is absent; its receipt is preserved and it is never recreated implicitly.';out.push(state);continue;}
    state.worktree='present';
    try{
     const actual=await inspectAgentGit(path,{signal:options.signal});
     if(actual.kind==='unavailable'&&actual.reason==='cancelled'){state.reason='Inspection was cancelled; preserve the managed worktree and inspect it.';out.push(state);continue;}
     if(actual.kind!=='repository'){state.reason='Managed worktree is not an attested Git worktree; preserve it and inspect it.';out.push(state);continue;}
     state.head=actual.head;
     if(actual.workspace!==path||actual.repository!==path||actual.commonDirectory!==saved.commonDirectory){state.reason='Managed worktree no longer belongs to its recorded repository; preserve it and inspect it.';out.push(state);continue;}
     if(actual.head!==saved.base){state.reason='Managed worktree HEAD moved from its recorded base; preserve its contribution and inspect it.';out.push(state);continue;}
     state.clean=!actual.dirty;
     if(claim.note){state.reason=claim.note;out.push(state);continue;}
     // An orphaned finalize claim is a crash residue: report it, never reclaim it.
     if(claim.claim&&!state.ownerAlive){state.reason='A crashed controller left its finalize claim without a ready receipt; report it and inspect it. The claim is never reclaimed or deleted here.';out.push(state);continue;}
     if(state.ownerAlive){state.condition='owned';state.reason=state.clean?ready?'Allocation owner is alive and holds a clean ready worktree.':'Allocation owner is alive and creation or receipt is still in flight.':'Allocation owner is alive and its worktree holds unmerged content; it is held for its unit.';}
     else{state.condition='recoverable';state.reason=state.clean?'Owner disappeared with a clean attested worktree; it can be reused.':'Owner disappeared with unmerged content preserved; report it and inspect it before any reuse.';}
    }catch{state.reason='Managed worktree inspection failed; preserve it and inspect it manually.';}
   out.push(state);
  }
  if(overflow)out.push(unattested('overflow','','','Inspection bound reached; further allocations are not attested here.'));
  return out;
 }
 /** Only a recoverable, physically clean, attested worktree is ever offered for reuse. */
 export function managedWorktreeCandidates(states:readonly ManagedWorktreeState[]):ManagedWorkspaceCandidate[]{
  return states.map(s=>({id:s.id,repository:s.repository,base:s.base,unit:s.unit,active:s.condition!=='recoverable',clean:s.clean===true}));
 }
