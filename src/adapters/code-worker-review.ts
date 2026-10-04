/** Review authority belongs to a human decision over controller-composed deltas. */
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {EventStore} from '../core/store.ts';
import {TerminalSession} from './terminal-session.ts';
import {projectEffectAttempts} from './tool-receipts.ts';
import {parseCodeWorkerPackets} from './code-worker-packets.ts';
import {captureGitSnapshot} from './git-snapshot.ts';
import {allocateWorktree} from './managed-worktrees.ts';
import {planWorktreeIntegration,composeWorktreePlans} from './worktree-integration.ts';
import {WorktreeReview,type ReviewBasis} from './worktree-review.ts';

export class CodeWorkerReview {
 private selected:{basis:ReviewBasis;batch:string;ids:string[];stamp:string;blocked?:string}|undefined;
 private opening=false;
 private review:WorktreeReview;
 private options:{shared:EventStore;parent:TerminalSession;root:string;source():string;objective():{id:string;revision:number}|undefined;busy():boolean};
 constructor(options:{shared:EventStore;parent:TerminalSession;root:string;source():string;objective():{id:string;revision:number}|undefined;busy():boolean}){
  this.options=options;
  this.review=new WorktreeReview({root:join(options.parent.root,'integrations',options.parent.metadata.id),busy:options.busy,
   basis:()=>this.current()?this.selected!.basis:null,
   blocked:()=>this.selected?.blocked,
   record:data=>{options.parent.assertWritable();options.shared.append({kind:'note',subject:'terminal.code-review',data});}});
 }
 private stamp():string{return JSON.stringify(this.options.shared.toSession().events.filter(e=>e.subject==='terminal.code-workers'||e.subject==='terminal.code-worker').map(e=>e.seq));}
 private current():boolean{const s=this.selected,o=this.options.objective();return !!s&&s.stamp===this.stamp()&&o?.id===s.basis.objective&&o.revision===s.basis.revision&&this.options.source()===s.basis.source;}
 async open(){
  if(this.opening||this.options.busy())throw Error('Stop active work before composing agent changes.');
  this.opening=true;this.selected=undefined;
  const journals:TerminalSession[]=[];
  try{
   const {shared,parent,root}=this.options,events=shared.toSession().events,objective=this.options.objective(),stamp=this.stamp();
   const batch=events.filter(e=>e.subject==='terminal.code-workers').at(-1);
   if(!objective||!batch||batch.data.phase!=='ready'||typeof batch.data.batch!=='string'||!Array.isArray(batch.data.ids)||batch.data.ids.length<1||batch.data.ids.length>2)throw Error('No finished agent batch for this intention. Inspect Agents; files remain preserved.');
   if(batch.data.ids.some(id=>typeof id!=='string'||!/^w-[a-f0-9-]{36}$/.test(id))||new Set(batch.data.ids).size!==batch.data.ids.length||typeof batch.data.sourceDigest!=='string')throw Error('Invalid agent ownership.');
   this.selected={basis:{source:this.options.source(),workspace:join(resolve(root),batch.data.ids[0]),sourceDigest:batch.data.sourceDigest,objective:objective.id,revision:objective.revision,workspaceId:batch.data.ids[0]},batch:batch.data.batch,ids:[...batch.data.ids],stamp};
   if(batch.data.objective!==objective.id||batch.data.revision!==objective.revision)throw Error('The intention changed after delegation. Set aside the old batch to preserve its copies.');
   const snapshot=await captureGitSnapshot(this.options.source());
   if(snapshot.digest!==batch.data.sourceDigest||snapshot.base!==batch.data.base)throw Error('The source changed since delegation. Agent files remain preserved.');
   const plans=[];const ids:string[]=[];
   for(const id of batch.data.ids){
    if(typeof id!=='string'||!/^w-[a-f0-9-]{36}$/.test(id))throw Error('Invalid agent ownership.');
    const saved=events.filter(e=>e.subject==='terminal.code-worker'&&e.data.id===id).at(-1);
    const admission=events.filter(e=>e.subject==='terminal.code-workers'&&e.data.id===id&&e.data.phase==='preparing'&&e.data.batch===batch.data.batch).at(-1);
    const path=join(resolve(root),id);
    if(!saved||!admission||saved.data.phase!=='proposal'||saved.data.workspace!==path||saved.data.source!==snapshot.workspace||saved.data.sourceDigest!==snapshot.digest||saved.data.objectiveId!==objective.id||saved.data.objectiveRevision!==objective.revision||typeof saved.data.journal!=='string')throw Error('The agent batch is incomplete or its provenance changed. Inspect Agents; no partial application.');
    const packet=parseCodeWorkerPackets({tasks:[{role:admission.data.role,task:admission.data.task,files:admission.data.files}]})[0]!;
    const journal=new TerminalSession({root:join(parent.root,'workers',parent.metadata.id),cwd:path,id:saved.data.journal});journals.push(journal);
    if(journal.metadata.cwd!==path||projectEffectAttempts(journal.core.toSession().events).some(a=>a.phase==='uncertain')||!journal.core.toSession().events.some(e=>e.subject==='terminal.code-worker-proposal'&&e.seq===saved.data.proposalSeq&&e.data.workerId===id&&e.data.digest===saved.data.proposalDigest))throw Error('Private proposal or effect receipts cannot be attested.');
    const plan=await planWorktreeIntegration({source:snapshot.workspace,workspace:path,sourceDigest:snapshot.digest});
    if(!plan.files.length||plan.files.some(file=>!packet.files.some(allowed=>file.path===allowed||file.path.startsWith(allowed+'/'))))throw Error('Agent changes exceed their admitted files or contain no contribution.');
    plans.push(plan);ids.push(id);
   }
   const current=()=>!this.options.busy()&&stamp===this.stamp()&&this.options.objective()?.id===objective.id&&this.options.objective()?.revision===objective.revision&&this.options.source()===snapshot.workspace;
   if(!current())throw Error('Work changed during composition. Refresh changes.');
   const id=`w-${randomUUID()}`;
   shared.append({kind:'note',subject:'terminal.code-composition',data:{version:1,id,batch:batch.data.batch,phase:'review-preparing',objective:objective.id,revision:objective.revision}});
   const allocation=await allocateWorktree({repository:snapshot.workspace,root,allocation:{id,unit:'human-code-review',agent:'controller',objective:objective.id,revision:objective.revision,base:snapshot.base},snapshot});
   if(allocation.kind!=='ready')throw Error('Review composition allocation refused. All copies are preserved.');
   const plan=await composeWorktreePlans(plans,allocation.path);
   if(!current())throw Error('Work changed during composition. Copies are preserved.');
   shared.append({kind:'note',subject:'terminal.code-composition',data:{version:1,id,path:allocation.path,batch:batch.data.batch,phase:'review-composed',objective:objective.id,revision:objective.revision,digest:plan.digest,files:plan.files.length}});
   this.selected={basis:{source:snapshot.workspace,workspace:allocation.path,sourceDigest:snapshot.digest,objective:objective.id,revision:objective.revision,workspaceId:id},batch:batch.data.batch,ids,stamp};
   return await this.review.open();
  }catch(error){
   if(!this.selected||!this.current())throw error;
   this.selected.blocked=error instanceof Error?error.message:'Agent composition refused.';
   return await this.review.open();
  }finally{for(const journal of journals)journal.close();this.opening=false;}
 }
 async decide(token:string,digest:string,decision:'apply'|'reject'){
  const selected=this.selected;if(!selected)throw Error('Agent review expired. Refresh changes.');
  const result=await this.review.decide(token,digest,decision);
  if(['applied','rejected','uncertain'].includes(result.kind)){
   const events=this.options.shared.toSession().events,batch=events.filter(e=>e.subject==='terminal.code-workers'&&e.data.batch===selected.batch).at(-1)!;
   this.options.shared.append({kind:'note',subject:'terminal.code-workers',data:{...batch.data,phase:result.kind==='applied'?'integrated':result.kind,human:true,reviewDigest:digest,composition:selected.basis.workspaceId}});
   for(const id of selected.ids){const saved=events.filter(e=>e.subject==='terminal.code-worker'&&e.data.id===id).at(-1);if(!saved)continue;this.options.shared.append({kind:'note',subject:'terminal.code-worker',data:{...saved.data,phase:result.kind==='applied'?'integrated':result.kind,human:true,reviewDigest:digest}});}
   this.selected=undefined;
  }
  return result;
 }
}
