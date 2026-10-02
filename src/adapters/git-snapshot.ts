/** Bounded owner-local content transfer. Model payloads cannot manufacture an attestation. */
import {execFile} from 'node:child_process';
import {constants} from 'node:fs';
import {lstat,realpath,mkdir,open,readlink} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {derivedCapsuleAlias} from './node-capsule.ts';
import {inspectAgentGit} from './agent-git.ts';
interface SnapshotFile {readonly path:string;readonly bytes:string;readonly mode:number;}
export interface GitContentSnapshot {readonly workspace:string;readonly commonDirectory:string;readonly base:string;readonly patch:string;readonly files:readonly SnapshotFile[];readonly digest:string;}
const trusted=new WeakSet<object>();const LIMIT=2*1024*1024;
const within=(root:string,path:string)=>{const r=relative(root,path);return r!==''&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
async function git(cwd:string,args:string[],signal?:AbortSignal,input?:string):Promise<string>{
 const env={PATH:process.env.PATH??'/usr/bin:/bin',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'};
 return new Promise((accept,reject)=>{const child=execFile('git',['--no-pager','-c','core.fsmonitor=false',...args],{cwd,env,encoding:'utf8',maxBuffer:LIMIT,timeout:10000,signal},(error,out)=>error?reject(Error('Git snapshot operation refused.')):accept(out));child.stdin?.end(input);});
}
export async function captureGitSnapshot(workspace:string,signal?:AbortSignal):Promise<GitContentSnapshot>{
 const i=await inspectAgentGit(workspace,{signal});if(i.kind!=='repository'||!i.head)throw Error('Git snapshot requires attested HEAD and safe checkout configuration.');
 const patch=await git(i.workspace,['diff','--binary','--no-ext-diff','--no-textconv','HEAD','--'],signal);
 const names=(await git(i.workspace,['ls-files','--others','--exclude-standard','-z'],signal)).split('\0').filter(Boolean);if(names.length>100)throw Error('Snapshot exceeds 100 untracked files.');
 let size=Buffer.byteLength(patch);const files:SnapshotFile[]=[];
 for(const path of names){signal?.throwIfAborted();const target=resolve(i.workspace,path);if(!within(i.workspace,target)||path.split(/[\\/]/).includes('.git'))throw Error('Snapshot path refused.');
  const stat=await lstat(target);if(stat.isSymbolicLink()&&derivedCapsuleAlias(path,await readlink(target)))continue;if(!stat.isFile()||stat.isSymbolicLink()||!within(i.workspace,await realpath(target)))throw Error('Snapshot requires regular files inside its source.');size+=stat.size;if(size>LIMIT)throw Error('Snapshot content exceeds 2MiB.');
  const handle=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes:Buffer;try{const buffer=Buffer.alloc(stat.size+1);const read=await handle.read(buffer,0,buffer.length,0);if(read.bytesRead!==stat.size)throw Error('Snapshot file changed during capture.');bytes=buffer.subarray(0,read.bytesRead);}finally{await handle.close();}files.push(Object.freeze({path,bytes:bytes.toString('base64'),mode:stat.mode&0o777}));
 }
 if(size>LIMIT)throw Error('Snapshot content exceeds 2MiB.');
 const head=await git(i.workspace,['rev-parse','--verify','HEAD'],signal);if(head.trim()!==i.head)throw Error('Snapshot HEAD changed.');
 const digest=createHash('sha256').update(JSON.stringify([i.head,patch,files])).digest('hex');const snapshot=Object.freeze({workspace:i.workspace,commonDirectory:i.commonDirectory,base:i.head,patch,files:Object.freeze(files),digest});trusted.add(snapshot);return snapshot;
}
export function trustedGitSnapshot(snapshot:GitContentSnapshot|undefined,source:{workspace:string;commonDirectory:string;head:string|null}):snapshot is GitContentSnapshot{return !!snapshot&&trusted.has(snapshot)&&snapshot.workspace===source.workspace&&snapshot.commonDirectory===source.commonDirectory&&snapshot.base===source.head;}
export async function snapshotMatches(snapshot:GitContentSnapshot,workspace:string,signal?:AbortSignal):Promise<boolean>{if(!trusted.has(snapshot))return false;try{const actual=await captureGitSnapshot(workspace,signal);return actual.digest===snapshot.digest&&actual.commonDirectory===snapshot.commonDirectory;}catch{return false;}}
async function prepareParent(root:string,target:string):Promise<void>{let at=root;const path=relative(root,dirname(target));for(const part of path?path.split(sep):[]){at=resolve(at,part);try{const stat=await lstat(at);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Snapshot parent is not an owned directory.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await mkdir(at,{mode:0o700});}if(!within(root,await realpath(at)))throw Error('Snapshot parent escaped.');}}
export async function applyGitSnapshot(snapshot:GitContentSnapshot,workspace:string,signal?:AbortSignal):Promise<void>{
 if(!trusted.has(snapshot))throw Error('Snapshot was not captured by the controller.');const i=await inspectAgentGit(workspace,{signal});if(i.kind!=='repository'||i.head!==snapshot.base||i.commonDirectory!==snapshot.commonDirectory||i.dirty)throw Error('Snapshot destination must be clean at its exact base.');
 if(snapshot.patch)await git(i.workspace,['apply','--index','--binary','--whitespace=nowarn','-'],signal,snapshot.patch);
 for(const file of snapshot.files){signal?.throwIfAborted();const target=resolve(i.workspace,file.path);if(!within(i.workspace,target))throw Error('Snapshot target escaped.');await prepareParent(i.workspace,target);const h=await open(target,'wx',file.mode);try{await h.writeFile(Buffer.from(file.bytes,'base64'));await h.chmod(file.mode);await h.sync();}finally{await h.close();}}
 if(!await snapshotMatches(snapshot,i.workspace,signal))throw Error('Transferred snapshot does not match its source.');
}

export async function snapshotChangedPaths(snapshot:GitContentSnapshot,signal?:AbortSignal):Promise<string[]>{if(!trusted.has(snapshot))throw Error('Unattested snapshot.');const tracked=(await git(snapshot.workspace,['diff','--name-only','--no-ext-diff','--no-textconv','HEAD','-z','--'],signal)).split('\0').filter(Boolean);return [...new Set([...tracked,...snapshot.files.map(f=>f.path)])].sort();}
