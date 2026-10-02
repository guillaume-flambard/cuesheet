/** Read-only Git inventory and controller-owned isolation decisions. No worktree mutation. */
import {execFile} from 'node:child_process';
import {realpath} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
export type GitInventory={kind:'repository';workspace:string;repository:string;commonDirectory:string;head:string|null;branch:string|null;dirty:boolean;observedAt:number;durationMs:number;commands:number}|{kind:'unavailable';reason:'not-repository'|'git-unavailable'|'inspection-failed'|'cancelled'|'changed-during-inspection'|'configured-checkout-effects';commands:number};
export async function inspectAgentGit(workspace:string,options:{signal?:AbortSignal;git?:string;env?:NodeJS.ProcessEnv;now?:()=>number}={}):Promise<GitInventory>{
 const source=options.env??process.env,now=options.now??Date.now,start=now();let commands=0;
 // No ambient GIT_DIR/WORK_TREE/config injection or native provider credentials.
 const env={PATH:source.PATH??'/usr/bin:/bin',...(source.SystemRoot?{SystemRoot:source.SystemRoot}:{}),LC_ALL:'C',GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'};
 let cwd:string;try{cwd=await realpath(workspace);}catch{return {kind:'unavailable',reason:'inspection-failed',commands};}
 const git=(args:string[])=>new Promise<{code:number|string;out:string;error:string}>(resolve=>{commands++;execFile(options.git??'git',['-c','core.fsmonitor=false',...args],{cwd,env,encoding:'utf8',timeout:5000,maxBuffer:262144,signal:options.signal},(error,out,stderr)=>resolve({code:error?(error as NodeJS.ErrnoException).code??1:0,out,error:stderr}));});
 const unavailable=(reason:Extract<GitInventory,{kind:'unavailable'}>['reason']):GitInventory=>({kind:'unavailable',reason:options.signal?.aborted?'cancelled':reason,commands});
 if(options.signal?.aborted)return unavailable('cancelled');
 const roots=await git(['rev-parse','--path-format=absolute','--show-toplevel','--git-common-dir']);
 if(roots.code!==0)return unavailable(roots.code==='ENOENT'?'git-unavailable':roots.error.includes('not a git repository')?'not-repository':'inspection-failed');
 const paths=roots.out.trimEnd().split('\n');if(paths.length!==2||!paths.every(isAbsolute))return unavailable('inspection-failed');
 let repository:string,commonDirectory:string;try{[repository,commonDirectory]=await Promise.all([realpath(paths[0]!),realpath(paths[1]!)]);}catch{return unavailable('inspection-failed');}
 const filters=await git(['config','--name-only','--get-regexp','^filter\\..*\\.(clean|smudge|process)$']);if(filters.code===0&&filters.out.trim())return unavailable('configured-checkout-effects');if(filters.code!==0&&filters.code!==1)return unavailable('inspection-failed');
 const first=await git(['rev-parse','--verify','HEAD']);const head=first.code===0?first.out.trim():null;
 if(head!==null&&!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head))return unavailable('inspection-failed');
 const branchResult=await git(['symbolic-ref','--quiet','--short','HEAD']);if(branchResult.code!==0&&branchResult.code!==1)return unavailable('inspection-failed');
 const branch=branchResult.code===0?branchResult.out.trim():null;if(branch!==null&&(!branch||/[\x00-\x1f\x7f]/.test(branch)))return unavailable('inspection-failed');
 if(head===null&&(first.code!==128||branch===null))return unavailable('inspection-failed');
 const status=await git(['status','--porcelain=v1','-z','--untracked-files=normal']);if(status.code!==0)return unavailable('inspection-failed');
 const last=await git(['rev-parse','--verify','HEAD']);if((last.code===0?last.out.trim():null)!==head||last.code!==first.code)return unavailable('changed-during-inspection');
 return {kind:'repository',workspace:cwd,repository,commonDirectory,head,branch,dirty:status.out.length>0,observedAt:now(),durationMs:Math.max(0,now()-start),commands};
}
export interface ManagedWorkspaceCandidate {id:string;repository:string;base:string;unit:string;active:boolean;clean:boolean;}
export type AgentIsolationDecision={kind:'shared-read';create:false}|{kind:'unavailable';create:false;reason:string}|{kind:'requires-snapshot';create:false;reason:string}|{kind:'isolated-write';create:boolean;reuse:string|null;base:string;reason:string};
export function chooseAgentIsolation(input:{access:'read'|'write';unit:string;inventory:GitInventory;managed?:ManagedWorkspaceCandidate[]}):AgentIsolationDecision{
 if(input.access==='read')return {kind:'shared-read',create:false};
 const i=input.inventory;if(i.kind!=='repository')return {kind:'unavailable',create:false,reason:i.reason};
 if(!i.head)return {kind:'unavailable',create:false,reason:'Initial commit required before Git worktree isolation.'};
 if(!input.unit.trim())return {kind:'unavailable',create:false,reason:'Attributed work unit required.'};
 if(i.dirty)return {kind:'requires-snapshot',create:false,reason:'Local changes must be preserved and attributed before isolation.'};
 const matching=(input.managed??[]).filter(w=>w.id&&w.repository===i.repository&&w.base===i.head&&w.unit===input.unit&&!w.active&&w.clean);
 // Ambiguous ownership cannot silently select a workspace.
 const reuse=matching.length===1?matching[0]!.id:null;
 return {kind:'isolated-write',create:reuse===null,reuse,base:i.head,reason:reuse?'Reuse inactive clean workspace for this unit and base.':'Isolate writes from human workspace and other agents.'};
}
