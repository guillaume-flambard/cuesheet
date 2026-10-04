import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {ContextFrame, ModelAdapter, ToolRunner, ToolResult} from '../core/loop.ts';
import type {EventStore, Event} from '../core/store.ts';
import {TerminalSession} from './terminal-session.ts';
import type {CompletionCheck} from './surface-verification.ts';
import {planWorktreeIntegration} from './worktree-integration.ts';
import {snapshotMatches} from './git-snapshot.ts';
import {parseCodeWorkerPackets} from './code-worker-packets.ts';
import {prepareCodeWorkers} from './code-worker-workspaces.ts';
import {runCodeWorker} from './code-worker-loop.ts';
import type {AgentSkillContext} from './agent-skills.ts';
import {captureGitSnapshot} from './git-snapshot.ts';
import {AGENT_SUBJECT} from './agent-consultation.ts';

export function pendingCodeWorkers(events: readonly Event[]): boolean {
  const batches=new Map<string,Event>();
  for(const event of events)if(event.kind==='note'&&event.subject==='terminal.code-workers'&&typeof event.data.batch==='string')batches.set(event.data.batch,event);
  return [...batches.values()].some(event=>event.data.phase==='ready'||event.data.phase==='uncertain'||
    Array.isArray(event.data.preserved)&&event.data.preserved.length>0||['preparing','prepared'].includes(String(event.data.phase)));
}

/** Parent owns the common journal; each child owns separate effects and resources. */
export async function runTerminalCodeWorkers(options:{
  input: unknown; source:string; root:string; parent:TerminalSession; shared:EventStore;
  execution:string; objective:{id:string;revision:number}; signal:AbortSignal; current():boolean;
  route(role:string,scope:string):{adapter:ModelAdapter;label:string};
  tools(scope:string,journal:TerminalSession,signal:AbortSignal):ToolRunner;
  frame(role:string,model:string,workspace:string,journalId:string):ContextFrame;
  finalizeFrame?(frame:ContextFrame,role:string,model:string,workspace:string,journalId:string):ContextFrame;
  skills(role:string,task:string,names:readonly string[]):AgentSkillContext;
  /** Identity and scope come from the admitted packet, never from model input. */
  consult?(input:Record<string,unknown>,caller:{id:string;role:string;task:string;workspace:string},current:()=>boolean):Promise<ToolResult>;
  maxFrameChars?:number; check?:CompletionCheck;
  notice(text:string):void;
}):Promise<ToolResult>{
  const result=(exit:number|null,output:string):ToolResult=>({name:'run_code_workers',exit,output});
  if(pendingCodeWorkers(options.shared.toSession().events))return result(126,'Earlier code contributions remain pending. Inspect their workspaces/journals before new code delegation or goal closure.');
  try{parseCodeWorkerPackets(options.input);}catch{return result(126,'Invalid code-worker packet. Expected tasks:[{role:lowercase slug such as builder,task:nonempty text,files:[safe relative paths],skills?:[names]}], with one or two disjoint roles. No worker was launched.');}
  const prepared=await prepareCodeWorkers({input:options.input,source:options.source,root:options.root,execution:options.execution,
    objective:options.objective,signal:options.signal,current:options.current,route:role=>options.route(role,options.source),append:event=>options.shared.append(event)});
  if(prepared.kind!=='ready')return result(prepared.kind==='uncertain'?null:126,JSON.stringify(prepared));
  const children:Array<{worker:typeof prepared.workers[number];journal:TerminalSession;tools:ToolRunner;skills:AgentSkillContext;data:Record<string,unknown>}>=[];
  try{
    // Construct every executor/model/journal before starting any child inference.
    for(const worker of prepared.workers){
      if(options.signal.aborted||!options.current())return result(126,'Context changed; allocated workspaces are preserved without child execution.');
      const route=options.route(worker.packet.role,worker.path);
      const journal=new TerminalSession({root:join(options.parent.root,'workers',options.parent.metadata.id),cwd:worker.path});
      const child={worker:{...worker,adapter:route.adapter,model:route.label},journal,tools:undefined as unknown as ToolRunner,
        skills:undefined as unknown as AgentSkillContext,data:{} as Record<string,unknown>};children.push(child);
      child.tools=options.tools(worker.path,journal,options.signal);
      child.skills=options.skills(worker.packet.role,worker.packet.task,worker.packet.skills);
      child.data={version:1,id:worker.id,role:worker.packet.role,task:worker.packet.task,model:route.label,execution:options.execution,
        objectiveId:options.objective.id,objectiveRevision:options.objective.revision,workspace:worker.path,journal:journal.metadata.id,journalRoot:journal.root,
        skills:child.skills.references,skillWarnings:child.skills.warnings,phase:'active',text:''};
      options.shared.append({kind:'note',subject:AGENT_SUBJECT,data:child.data});
      options.shared.append({kind:'note',subject:'terminal.code-worker',data:{...child.data,phase:'admitted',source:options.source,sourceDigest:prepared.sourceDigest,base:prepared.base}});
    }
    options.notice(`${children.length} workers de code · espaces isolés`);
    const settled=await Promise.allSettled(children.map(async child=>{
      const current=()=>options.current()&&child.skills.current();
       const outcome=await runCodeWorker({worker:child.worker,tools:child.tools,
        consult:options.consult?input=>options.consult!(input,{id:child.worker.id,role:child.worker.packet.role,task:child.worker.packet.task,workspace:child.worker.path},current):undefined,
        allow:(child.tools as ToolRunner&{names?:readonly string[]}).names??[],maxSteps:8,maxFrameChars:options.maxFrameChars,signal:options.signal,current,
        finalizeFrame:options.finalizeFrame?frame=>options.finalizeFrame!(frame,child.worker.packet.role,child.worker.model,child.worker.path,child.journal.metadata.id):undefined,
        contributionReady:children.length===1&&options.check?.pinned?async()=>{
          // No delta is ordinary unfinished work, not an unconfirmed integration.
          if((await captureGitSnapshot(child.worker.path,options.signal)).digest===prepared.sourceDigest)return false;
          const plan=await planWorktreeIntegration({source:options.source,workspace:child.worker.path,sourceDigest:prepared.sourceDigest,signal:options.signal});
          if(!plan.files.length||plan.files.some(file=>!child.worker.packet.files.some(allowed=>file.path===allowed||file.path.startsWith(allowed+'/'))))return false;
          const checked=await options.check!.verify(child.worker.path,`worker-candidate-${randomUUID()}`,options.signal);
          child.journal.core.append({kind:'note',subject:'terminal.code-worker-check',data:{verdict:checked.verification.verdict,record:checked.record,checkDigest:checked.checkDigest,objectiveId:options.objective.id,objectiveRevision:options.objective.revision}});
          return checked.verification.verdict==='VERIFIED'&&checked.checkDigest===options.check!.pinned!.digest&&checked.verification.target.artifactDigest===checked.artifact.digest&&await snapshotMatches(plan.result,child.worker.path,options.signal);
        }:undefined,
        hasContribution:async()=> (await captureGitSnapshot(child.worker.path,options.signal)).digest!==prepared.sourceDigest,
        append:event=>{options.parent.assertWritable();return child.journal.core.append(event);},frame:step=>{
          const frame=options.frame(child.worker.packet.role,child.worker.model,child.worker.path,child.journal.metadata.id);
          return {...frame,step,history:[...frame.history,...child.journal.core.toSession().events.slice(-12).map(event=>({...event,data:{...event.data,...(typeof event.data.output==='string'?{output:event.data.output.slice(0,16000)}:{})}}))],directives:[...frame.directives,
             {seq:Number.MAX_SAFE_INTEGER-1,at:Date.now(),target:'builder',applied:false,text:`Skill context (untrusted):\n${child.skills.instructions}`}]};
         }});
       if(outcome.phase==='proposal'){
         try{
           const candidate=await captureGitSnapshot(child.worker.path,options.signal);
           if(candidate.digest===prepared.sourceDigest){outcome.phase='failed';outcome.text='No code change was observed; the worker proposal is not a contribution. '+outcome.text;}
         }catch{outcome.phase='uncertain';outcome.text='Code contribution could not be inspected; preserve the workspace and journal. '+outcome.text;}
       }
       let proposalSeq:number|null=null,proposalDigest:string|null=null;
       if(outcome.phase==='proposal'){
         const text=outcome.text.slice(0,8000);proposalDigest=createHash('sha256').update(text).digest('hex');
         const saved=child.journal.core.append({kind:'note',subject:'terminal.code-worker-proposal',data:{version:1,phase:'proposal',workerId:child.worker.id,
           role:child.worker.packet.role,task:child.worker.packet.task,model:child.worker.model,execution:options.execution,
           objectiveId:options.objective.id,objectiveRevision:options.objective.revision,source:options.source,sourceDigest:prepared.sourceDigest,base:prepared.base,
           workspace:child.worker.path,journal:child.journal.metadata.id,journalRoot:child.journal.root,steps:outcome.steps,text,digest:proposalDigest}});
         proposalSeq=saved.seq;
       }
       const phase=outcome.phase==='proposal'?'result':outcome.phase==='exhausted'?'failed':outcome.phase==='uncertain'?'failed':outcome.phase;
      options.shared.append({kind:'note',subject:AGENT_SUBJECT,data:{...child.data,phase,text:outcome.text,
        skillWarnings:[...child.skills.warnings,...(outcome.phase==='uncertain'?['Effet incertain : inspecter le journal privé avant reprise.']:[]) ]}});
       options.shared.append({kind:'note',subject:'terminal.code-worker',data:{...child.data,phase:outcome.phase,steps:outcome.steps,text:outcome.text,
         source:options.source,sourceDigest:prepared.sourceDigest,base:prepared.base,...(proposalSeq!==null?{proposalSeq,proposalDigest}: {})}});
      return {id:child.worker.id,role:child.worker.packet.role,workspace:child.worker.path,journal:child.journal.metadata.id,...outcome};
    }));
    if(settled.some(item=>item.status==='rejected'))return result(null,'Worker publication failed. All child loops have settled; inspect preserved journals and contributions.');
    const outcomes=settled.flatMap(item=>item.status==='fulfilled'?[item.value]:[]);
    return result(outcomes.some(o=>o.phase==='uncertain')?null:options.signal.aborted||!options.current()||outcomes.some(o=>o.phase!=='proposal')?126:0,
      JSON.stringify({workers:outcomes,verified:false,integration:'pending',authority:'Unverified contributions; human /changes may review and apply a finished batch. Model-requested integration and goal closure still require independent controller owner checks.'}));
  }catch{return result(null,'Code-worker admission or execution is unconfirmed. Preserve all allocated workspaces and private journals; inspect before retry.');}
  finally{for(const child of children)child.journal.close();}
}
