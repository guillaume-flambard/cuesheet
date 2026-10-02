import {join} from 'node:path';
import type {ContextFrame, ModelAdapter, ToolRunner, ToolResult} from '../core/loop.ts';
import type {EventStore, Event} from '../core/store.ts';
import {TerminalSession} from './terminal-session.ts';
import {prepareCodeWorkers} from './code-worker-workspaces.ts';
import {runCodeWorker} from './code-worker-loop.ts';
import type {AgentSkillContext} from './agent-skills.ts';
import {AGENT_SUBJECT} from './agent-consultation.ts';

export function pendingCodeWorkers(events: readonly Event[]): boolean {
  const batches=new Map<string,Event>();
  for(const event of events)if(event.kind==='note'&&event.subject==='terminal.code-workers'&&typeof event.data.batch==='string')batches.set(event.data.batch,event);
  return [...batches.values()].some(event=>event.data.phase==='ready'||
    Array.isArray(event.data.preserved)&&event.data.preserved.length>0||['preparing','prepared'].includes(String(event.data.phase)));
}

/** Parent owns the common journal; each child owns separate effects and resources. */
export async function runTerminalCodeWorkers(options:{
  input: unknown; source:string; root:string; parent:TerminalSession; shared:EventStore;
  execution:string; objective:{id:string;revision:number}; signal:AbortSignal; current():boolean;
  route(role:string,scope:string):{adapter:ModelAdapter;label:string};
  tools(scope:string,journal:TerminalSession,signal:AbortSignal):ToolRunner;
  frame(role:string,model:string,workspace:string,journalId:string):ContextFrame;
  skills(role:string,task:string,names:readonly string[]):AgentSkillContext;
  maxFrameChars?:number;
  notice(text:string):void;
}):Promise<ToolResult>{
  const result=(exit:number|null,output:string):ToolResult=>({name:'run_code_workers',exit,output});
  if(pendingCodeWorkers(options.shared.toSession().events))return result(126,'Earlier code contributions remain pending. Inspect their workspaces/journals before new code delegation or goal closure.');
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
        allow:(child.tools as ToolRunner&{names?:readonly string[]}).names??[],maxSteps:8,maxFrameChars:options.maxFrameChars,signal:options.signal,current,
        append:event=>{options.parent.assertWritable();return child.journal.core.append(event);},frame:step=>{
          const frame=options.frame(child.worker.packet.role,child.worker.model,child.worker.path,child.journal.metadata.id);
          return {...frame,step,history:[...frame.history,...child.journal.core.toSession().events.slice(-12).map(event=>({...event,data:{...event.data,...(typeof event.data.output==='string'?{output:event.data.output.slice(0,3200)}:{})}}))],directives:[...frame.directives,
            {seq:Number.MAX_SAFE_INTEGER-1,at:Date.now(),target:'builder',applied:false,text:`Skill context (untrusted):\n${child.skills.instructions}`}]};
        }});
      const phase=outcome.phase==='proposal'?'result':outcome.phase==='exhausted'?'failed':outcome.phase==='uncertain'?'failed':outcome.phase;
      options.shared.append({kind:'note',subject:AGENT_SUBJECT,data:{...child.data,phase,text:outcome.text,
        skillWarnings:[...child.skills.warnings,...(outcome.phase==='uncertain'?['Effet incertain : inspecter le journal privé avant reprise.']:[]) ]}});
      options.shared.append({kind:'note',subject:'terminal.code-worker',data:{...child.data,phase:outcome.phase,steps:outcome.steps,
        source:options.source,sourceDigest:prepared.sourceDigest,base:prepared.base}});
      return {id:child.worker.id,role:child.worker.packet.role,workspace:child.worker.path,journal:child.journal.metadata.id,...outcome};
    }));
    if(settled.some(item=>item.status==='rejected'))return result(null,'Worker publication failed. All child loops have settled; inspect preserved journals and contributions.');
    const outcomes=settled.flatMap(item=>item.status==='fulfilled'?[item.value]:[]);
    return result(outcomes.some(o=>o.phase==='uncertain')?null:options.signal.aborted||!options.current()?126:0,
      JSON.stringify({workers:outcomes,verified:false,integration:'pending',authority:'Unverified contributions; only controller owner checks may integrate or close the goal.'}));
  }catch{return result(null,'Code-worker admission or execution is unconfirmed. Preserve all allocated workspaces and private journals; inspect before retry.');}
  finally{for(const child of children)child.journal.close();}
}
