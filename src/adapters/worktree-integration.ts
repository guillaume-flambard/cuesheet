/** Recoverable file delta under a repository claim. Not an atomic filesystem transaction. */
import {constants} from 'node:fs';import {lstat,realpath,open,mkdir,rename,unlink,link} from 'node:fs/promises';import {join,resolve,relative,dirname,sep,isAbsolute} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {captureGitSnapshot,snapshotMatches,snapshotChangedPaths,type GitContentSnapshot} from './git-snapshot.ts';
interface FileState {readonly bytes:string;readonly mode:number;}
interface Delta {readonly path:string;readonly before:FileState|null;readonly after:FileState|null;}
export interface IntegrationPlan {readonly id:string;readonly source:GitContentSnapshot;readonly result:GitContentSnapshot;readonly files:readonly Delta[];readonly digest:string;}
const admitted=new WeakSet<object>();const MAX=4*1024*1024;
const inside=(root:string,path:string)=>{const p=relative(root,path);return p!==''&&p!=='..'&&!p.startsWith('..'+sep)&&!isAbsolute(p);};
export function checkableIntegrationPath(path:string):boolean{return !path.split(/[\\/]/).some(p=>['.git','node_modules','.npm','.DS_Store','.npmrc','.pypirc'].includes(p)||p==='.env'||p.startsWith('.env.'));}
async function state(root:string,path:string):Promise<FileState|null>{const target=resolve(root,path);if(!inside(root,target)||!checkableIntegrationPath(path))throw Error('Uncovered integration path.');let stat;try{stat=await lstat(target);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}if(!stat.isFile()||stat.isSymbolicLink()||!inside(root,await realpath(target))||stat.size>MAX)throw Error('Integration requires bounded regular files.');const h=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);try{const bytes=Buffer.alloc(stat.size+1),r=await h.read(bytes,0,bytes.length,0);if(r.bytesRead!==stat.size)throw Error('File changed while read.');return Object.freeze({bytes:bytes.subarray(0,r.bytesRead).toString('base64'),mode:stat.mode&0o777});}finally{await h.close();}}
const equal=(a:FileState|null,b:FileState|null)=>JSON.stringify(a)===JSON.stringify(b);
export async function planWorktreeIntegration(options:{source:string;workspace:string;sourceDigest:string;signal?:AbortSignal}):Promise<IntegrationPlan>{
 const source=await captureGitSnapshot(options.source,options.signal),result=await captureGitSnapshot(options.workspace,options.signal);if(source.digest!==options.sourceDigest||source.commonDirectory!==result.commonDirectory||source.base!==result.base)throw Error('Source/worktree no longer match their admitted base.');
 const paths=[...new Set([...await snapshotChangedPaths(source,options.signal),...await snapshotChangedPaths(result,options.signal)])].sort();if(paths.length>100)throw Error('Integration exceeds100 paths.');let bytes=0;const files:Delta[]=[];
 for(const path of paths){options.signal?.throwIfAborted();const before=await state(source.workspace,path),after=await state(result.workspace,path);bytes+=(before?Buffer.from(before.bytes,'base64').length:0)+(after?Buffer.from(after.bytes,'base64').length:0);if(bytes>MAX)throw Error('Integration exceeds4MiB.');if(!equal(before,after))files.push(Object.freeze({path,before,after}));}
 if(!await snapshotMatches(source,source.workspace,options.signal)||!await snapshotMatches(result,result.workspace,options.signal))throw Error('Files changed during integration planning.');
 const digest=createHash('sha256').update(JSON.stringify([source.digest,result.digest,files])).digest('hex');const plan=Object.freeze({id:`i-${randomUUID()}`,source,result,files:Object.freeze(files),digest});admitted.add(plan);return plan;
}
/** Compose only attested disjoint deltas in a newly allocated workspace. Source is never written. */
export async function composeWorktreePlans(plans:readonly IntegrationPlan[],workspace:string,signal?:AbortSignal):Promise<IntegrationPlan>{
 if(plans.length<1||plans.length>2||plans.some(plan=>!admitted.has(plan)))throw Error('Unattested composition.');
 const first=plans[0]!;const files=plans.flatMap(plan=>[...plan.files]);
 if(files.length>100||plans.some(plan=>plan.source.digest!==first.source.digest||plan.source.workspace!==first.source.workspace))throw Error('Composition attribution/bounds mismatch.');
 const portable=(path:string)=>path.normalize('NFC').toLowerCase();
 for(let i=0;i<files.length;i++)for(let j=0;j<i;j++){const a=portable(files[i]!.path),b=portable(files[j]!.path);if(a===b||a.startsWith(b+'/')||b.startsWith(a+'/'))throw Error('Conflicting contributions.');}
 if(files.reduce((n,file)=>n+(file.after?Buffer.from(file.after.bytes,'base64').length:0)+(file.before?Buffer.from(file.before.bytes,'base64').length:0),0)>MAX)throw Error('Composition exceeds4MiB.');
 const initial=await captureGitSnapshot(workspace,signal);
 if(initial.digest!==first.source.digest||initial.commonDirectory!==first.source.commonDirectory||workspace===first.source.workspace||plans.some(plan=>workspace===plan.result.workspace))throw Error('Composition workspace not isolated at admitted base.');
 for(const plan of plans)if(!await snapshotMatches(plan.source,plan.source.workspace,signal)||!await snapshotMatches(plan.result,plan.result.workspace,signal))throw Error('Contribution changed before composition.');
 for(const file of files){signal?.throwIfAborted();if(!equal(await state(workspace,file.path),file.before))throw Error('Composition changed before copy.');const target=resolve(workspace,file.path);await parents(workspace,target);
  if(file.after){const temporary=join(dirname(target),'.cuesheet-'+randomUUID()+'.tmp');let own=false;try{const h=await open(temporary,'wx',0o600);own=true;try{await h.writeFile(Buffer.from(file.after.bytes,'base64'));await h.chmod(file.after.mode);await h.sync();}finally{await h.close();}if(!equal(await state(workspace,file.path),file.before))throw Error('Composition changed before replacement.');if(file.before)await rename(temporary,target);else await link(temporary,target);}finally{if(own)await unlink(temporary);}}
  else await unlink(target);
 }
 for(const plan of plans)if(!await snapshotMatches(plan.source,plan.source.workspace,signal)||!await snapshotMatches(plan.result,plan.result.workspace,signal))throw Error('Contribution changed during composition.');
 const composed=await planWorktreeIntegration({source:first.source.workspace,workspace,sourceDigest:first.source.digest,signal});
 const expected=[...files].sort((a,b)=>a.path.localeCompare(b.path)),actual=[...composed.files].sort((a,b)=>a.path.localeCompare(b.path));
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Composition differs from admitted union.');return composed;
}
async function parents(root:string,path:string):Promise<void>{let at=root;const parent=relative(root,dirname(path));for(const part of parent?parent.split(sep):[]){at=join(at,part);try{const s=await lstat(at);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Integration parent refused.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await mkdir(at,{mode:0o700});}if(!inside(root,await realpath(at)))throw Error('Integration parent escaped.');}}
export type IntegrationResult={kind:'applied';record:string;files:number}|{kind:'refused'|'uncertain';reason:string;record:string|null;files:number};
export async function applyWorktreeIntegration(plan:IntegrationPlan,options:{root:string;current():boolean;signal?:AbortSignal}):Promise<IntegrationResult>{
 let written=0,record:string|null=null,claim:Awaited<ReturnType<typeof open>>|undefined;let ledger:Awaited<ReturnType<typeof open>>|undefined;
 if(!admitted.has(plan))return {kind:'refused',reason:'Unattested integration plan.',record,files:0};
 const lock=join(plan.source.commonDirectory,'cuesheet-integration.lock');
 try{
  const root=resolve(options.root);if(root===plan.source.workspace||inside(plan.source.workspace,root)||root===plan.result.workspace||inside(plan.result.workspace,root))throw Error('Integration receipt storage must be outside workspaces.');await mkdir(root,{recursive:true,mode:0o700});if(await realpath(root)!==root)throw Error('Receipt root redirected.');
  claim=await open(lock,'wx',0o600);await claim.writeFile(JSON.stringify({pid:process.pid,plan:plan.id})+'\n');await claim.sync();
  if(!options.current()||options.signal?.aborted||!await snapshotMatches(plan.source,plan.source.workspace,options.signal)||!await snapshotMatches(plan.result,plan.result.workspace,options.signal))throw Error('Source/result/contract changed before integration.');
  record=join(root,plan.id+'.jsonl');ledger=await open(record,'wx',0o600);await ledger.writeFile(JSON.stringify({version:1,phase:'planned',plan})+'\n');await ledger.sync();const directory=await open(root,'r');try{await directory.sync();}finally{await directory.close();}
  for(const file of plan.files){if(!options.current()||options.signal?.aborted||!equal(await state(plan.source.workspace,file.path),file.before))throw Error('Source/contract changed during integration.');const target=resolve(plan.source.workspace,file.path);await parents(plan.source.workspace,target);
   if(file.after){const temporary=join(dirname(target),'.cuesheet-'+randomUUID()+'.tmp');let own=false;try{const h=await open(temporary,'wx',0o600);own=true;try{await h.writeFile(Buffer.from(file.after.bytes,'base64'));await h.chmod(file.after.mode);await h.sync();}finally{await h.close();}if(!options.current()||options.signal?.aborted||!equal(await state(plan.source.workspace,file.path),file.before))throw Error('Source/contract changed before replacement.');if(file.before)await rename(temporary,target);else await link(temporary,target);written++;}finally{if(own)try{await unlink(temporary);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}}
   else{if(!options.current()||options.signal?.aborted||!equal(await state(plan.source.workspace,file.path),file.before))throw Error('Source/contract changed before deletion.');await unlink(target);written++;}
   const dir=await open(dirname(target),'r');try{await dir.sync();}finally{await dir.close();}await ledger.write(JSON.stringify({version:1,phase:'file-applied',path:file.path})+'\n');await ledger.sync();
  }
  for(const file of plan.files)if(!equal(await state(plan.source.workspace,file.path),file.after))throw Error('Integrated file changed after replacement.');if(!options.current()||options.signal?.aborted)throw Error('Contract changed after integration.');await ledger.write(JSON.stringify({version:1,phase:'applied',digest:plan.digest,files:written})+'\n');await ledger.sync();return {kind:'applied',record,files:written};
 }catch{return {kind:written>0?'uncertain':'refused',reason:written>0?'Partial integration; preserve plan and inspect before retry.':'Integration claim/source/result/contract unavailable; no file admitted.',record,files:written};}
 finally{await ledger?.close();if(claim){await claim.close();await unlink(lock);}}
}
