import {trustedGitSnapshot,snapshotMatches,applyGitSnapshot,type GitContentSnapshot} from './git-snapshot.ts';
/** Controller-owned allocations. No integration, cleanup or worker effects. */
import {execFile} from 'node:child_process';
import {mkdir,realpath,lstat,readFile,open,unlink} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {inspectAgentGit} from './agent-git.ts';
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
   if(!await check())return {kind:'uncertain',reason:'Existing allocation is absent, changed or incomplete; inspect without recreating.'};
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
