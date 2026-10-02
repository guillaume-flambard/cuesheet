import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {EventStore} from '../core/store.ts';
import type {ToolResult} from '../core/loop.ts';
import {TerminalSession} from './terminal-session.ts';
import {projectEffectAttempts} from './tool-receipts.ts';
import {parseCodeWorkerPackets} from './code-worker-packets.ts';
import {captureGitSnapshot,snapshotMatches} from './git-snapshot.ts';
import {allocateWorktree} from './managed-worktrees.ts';
import {planWorktreeIntegration,composeWorktreePlans,applyWorktreeIntegration} from './worktree-integration.ts';
import type {CompletionCheck} from './surface-verification.ts';

export async function integrateCodeWorkers(options:{shared:EventStore;parent:TerminalSession;root:string;source:string;
 objective:{id:string;revision:number};check:CompletionCheck;execution:string;signal:AbortSignal;current():boolean}):Promise<ToolResult>{
 const result=(exit:number|null,output:string):ToolResult=>({name:'integrate_code_workers',exit,output});
 const journals:TerminalSession[]=[];let applying=false;
 try{
  const events=options.shared.toSession().events;
  const batch=events.filter(e=>e.subject==='terminal.code-workers').at(-1);
  if(!batch||batch.data.phase!=='ready'||batch.data.objective!==options.objective.id||batch.data.revision!==options.objective.revision||!Array.isArray(batch.data.ids)||batch.data.ids.length<1||batch.data.ids.length>2)throw Error('No current ready code batch.');
  const snapshot=await captureGitSnapshot(options.source,options.signal);
  if(snapshot.digest!==batch.data.sourceDigest||snapshot.base!==batch.data.base)throw Error('Source drift.');
  const plans=[];
  for(const id of batch.data.ids){
   if(typeof id!=='string'||!/^w-[a-f0-9-]{36}$/.test(id))throw Error('Invalid worker ID.');
   const saved=events.filter(e=>e.subject==='terminal.code-worker'&&e.data.id===id).at(-1);
   const admission=events.filter(e=>e.subject==='terminal.code-workers'&&e.data.id===id&&e.data.phase==='preparing').at(-1);
   const path=join(resolve(options.root),id);
   if(!saved||!admission||saved.data.phase!=='proposal'||saved.data.workspace!==path||saved.data.source!==snapshot.workspace||saved.data.sourceDigest!==snapshot.digest||saved.data.objectiveId!==options.objective.id||saved.data.objectiveRevision!==options.objective.revision||typeof saved.data.journal!=='string')throw Error('Worker provenance/status refused.');
   const packet=parseCodeWorkerPackets({tasks:[{role:admission.data.role,task:admission.data.task,files:admission.data.files}]})[0]!;
   const journal=new TerminalSession({root:join(options.parent.root,'workers',options.parent.metadata.id),cwd:path,id:saved.data.journal});journals.push(journal);
   if(journal.metadata.cwd!==path||projectEffectAttempts(journal.core.toSession().events).some(a=>a.phase==='uncertain'))throw Error('Worker effects unconfirmed.');
   const plan=await planWorktreeIntegration({source:options.source,workspace:path,sourceDigest:snapshot.digest,signal:options.signal});
   if(plan.files.some(file=>!packet.files.some(allowed=>file.path===allowed||file.path.startsWith(allowed+'/'))))throw Error('Actual worker delta exceeds its admitted responsibilities.');
   plans.push(plan);
  }
  if(!options.current())throw Error('Contract changed.');
  const id=`w-${randomUUID()}`,path=join(resolve(options.root),id);
  const record=(phase:string,extra:Record<string,unknown>={})=>options.shared.append({kind:'note',subject:'terminal.code-composition',data:{version:1,id,path,batch:batch.data.batch,objective:options.objective.id,revision:options.objective.revision,phase,...extra}});
  record('preparing');
  const allocated=await allocateWorktree({repository:options.source,root:options.root,allocation:{id,unit:'code-composition',agent:'controller',objective:options.objective.id,revision:options.objective.revision,base:snapshot.base},snapshot,signal:options.signal});
  if(allocated.kind!=='ready')return result(126,'Composition allocation refused or uncertain; preserve its ownership records, source unchanged.');
  const plan=await composeWorktreePlans(plans,allocated.path,options.signal);record('composed',{plan:plan.id,digest:plan.digest,files:plan.files.length});
  if(!options.current())throw Error('Contract changed.');
  const checked=await options.check.verify(allocated.path,options.execution,options.signal);
  record('checked',{verdict:checked.verification.verdict,record:checked.record,artifactDigest:checked.artifact.digest});
  if(checked.verification.verdict!=='VERIFIED'||checked.checkDigest!==options.check.pinned?.digest||checked.artifact.producerEffectId!==options.execution||checked.verification.target.artifactDigest!==checked.artifact.digest||!options.current()||!await snapshotMatches(plan.result,allocated.path,options.signal))return result(1,'Composed contribution rejected or stale; source unchanged and work preserved.');
  applying=true;
  const applied=await applyWorktreeIntegration(plan,{root:join(options.parent.root,'integrations',options.parent.metadata.id),current:options.current,signal:options.signal});record(applied.kind,{record:applied.record,files:applied.files});
  if(applied.kind!=='applied')return result(applied.kind==='uncertain'?null:126,JSON.stringify(applied));
  if(!options.current())return result(null,'Source was applied against a changed contract; inspect preserved plan before further effects.');
  options.shared.append({kind:'note',subject:'terminal.code-workers',data:{...batch.data,phase:'integrated',composition:id,plan:plan.id,record:applied.record}});
  for(const workerId of batch.data.ids){const saved=events.filter(e=>e.subject==='terminal.code-worker'&&e.data.id===workerId).at(-1)!;options.shared.append({kind:'note',subject:'terminal.code-worker',data:{...saved.data,phase:'integrated',composition:id,plan:plan.id,record:applied.record}});}
  return result(0,JSON.stringify({integrated:true,files:applied.files,record:applied.record,verified:false,next:'Finish independently verifies the source.'}));
 }catch{return result(applying?null:126,'Code integration refused or unconfirmed. Inspect source, scopes, private journals, contract and preserved composition; no blind retry.');}
 finally{for(const journal of journals)journal.close();}
}
