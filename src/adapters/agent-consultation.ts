import {recordAssistance} from './agent-assistance.ts';
import type {AgentSkillContext,AgentSkillReference} from './agent-skills.ts';
/** The controller owns admission; consultants return text, never effects. */
import {randomUUID} from 'node:crypto';
import type {ContextFrame,ModelAdapter,ModelResponse,ToolResult} from '../core/loop.ts';
import type {Event,NewEvent} from '../core/store.ts';
function skillReference(value:unknown):value is AgentSkillReference{if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;return typeof v.name==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v.name)&&(v.kind==='installed'||v.kind==='session')&&typeof v.version==='string'&&/^[a-f0-9]{64}$/.test(v.version)&&Number.isSafeInteger(v.sourceSeq)&&Number(v.sourceSeq)>0&&typeof v.truncated==='boolean';}
export const AGENT_SUBJECT='terminal.agent';
export type AgentPhase='active'|'result'|'failed'|'stale'|'cancelled';
export interface AgentEntry {id:string;role:string;task:string;model:string;phase:AgentPhase|'interrupted';skills:AgentSkillReference[];warnings:string[];text:string;seq:number;}
export function projectAgents(events:Event[],live:boolean|string=false):AgentEntry[]{
 const entries=new Map<string,AgentEntry>();
 for(const e of events){const d=e.data;if(e.kind!=='note'||e.subject!==AGENT_SUBJECT||d.version!==1||typeof d.id!=='string'||typeof d.role!=='string'||typeof d.task!=='string'||typeof d.model!=='string'||!['active','result','failed','stale','cancelled'].includes(String(d.phase)))continue;
 entries.set(d.id,{id:d.id,role:d.role,task:d.task,model:d.model,phase:d.phase==='active'&&!(live===true || typeof live==='string'&&d.execution===live)?'interrupted':d.phase as AgentPhase,skills:Array.isArray(d.skills)?d.skills.filter(skillReference).slice(0,3):[],warnings:Array.isArray(d.skillWarnings)?d.skillWarnings.filter((w):w is string=>typeof w==='string').slice(0,6).map(w=>w.slice(0,512)):[],text:typeof d.text==='string'?d.text:'',seq:e.seq});}
 return [...entries.values()].sort((a,b)=>b.seq-a.seq);
}
export interface ConsultationAgent {id:string;role:string;task:string;model:string;}
export async function consultAgents(options:{infer?:(agent:ConsultationAgent,adapter:ModelAdapter,frame:ContextFrame,signal:AbortSignal)=>Promise<ModelResponse>;consult?:(input:Record<string,unknown>,caller:ConsultationAgent)=>Promise<ToolResult>;input:Record<string,unknown>;model:ModelAdapter;skills?:(role:string,task:string,names?:string[])=>AgentSkillContext;requesterId?:string;route?:(role:string)=>{adapter:ModelAdapter;label:string;reason?:string};frame:ContextFrame;freshFrame?:(role:string,model:string)=>ContextFrame;signal:AbortSignal;current():boolean;append(event:NewEvent):Event;execution:string;basis?:number;objective?:{id:string;revision:number};modelLabel:string;notice(text:string):void}):Promise<ToolResult>{
 const refuse=(output:string):ToolResult=>({name:'consult_agents',exit:126,output});
 const tasks=options.input.tasks;
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>3||!tasks.every(t=>t&&typeof t==='object'&&typeof t.role==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(t.role)&&typeof t.task==='string'&&t.task.trim().length>0&&t.task.length<=4000&&(t.skills===undefined||Array.isArray(t.skills)&&t.skills.length<=3&&t.skills.every((s:unknown)=>typeof s==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(s)))))return refuse('Expected 1–3 tasks {role:slug,task:text}, task at most 4000 characters.');
 options.signal.throwIfAborted();
 let resolved:Array<{task:any;route:{adapter:ModelAdapter;label:string;reason?:string}}>;
 try{resolved=tasks.map(task=>({task,route:options.route?.(task.role)??{adapter:options.model,label:options.modelLabel}}));}catch{return refuse('Configured agent model is unavailable; no provider fallback or consultation was started.');}
 const admitted=resolved.map(({task:t,route})=>{const skills=options.skills?.(t.role,t.task,t.skills);const data={version:1,id:randomUUID(),role:t.role,task:t.task,model:route.label,execution:options.execution,basis:options.basis??0,...(options.objective?{objectiveId:options.objective.id,objectiveRevision:options.objective.revision}:{}),skills:skills?.references??[],skillWarnings:skills?.warnings??[],phase:'active',text:''};const assistance=recordAssistance({version:1,id:data.id,requesterId:options.requesterId??'coordinator',helperId:data.id,question:data.task,execution:data.execution,model:data.model,routeReason:route.reason??(options.route?'Controller-selected route':'Current session model'),...(options.objective?{objectiveId:options.objective.id,objectiveRevision:options.objective.revision}:{})},options.append);assistance('requested');const receipt=options.append({kind:'note',subject:AGENT_SUBJECT,data});assistance('admitted','',[receipt.seq]);return {data,adapter:route.adapter,skills,assistance};});
 options.notice(`${admitted.length} agents consultent le contexte · ${options.modelLabel}`);
 const results=await Promise.all(admitted.map(async ({data,adapter,skills,assistance})=>{
  let phase:AgentPhase='failed',text='Consultation non confirmée.';
  const sourceFrame=options.freshFrame?.(data.role,data.model)??options.frame;
  let frame:ContextFrame={...sourceFrame,capabilities:[],directives:[...sourceFrame.directives.filter(d=>!/^tools:/.test(d.text)),{seq:Number.MAX_SAFE_INTEGER,at:Date.now(),target:'builder',applied:false,text:`tools: ${options.consult?'consult_agents':''}\nConsultation ${data.role}: ${data.task}\n${options.consult?'Return analysis text or request bounded advice with consult_agents {tasks:[{role:slug,task:question}]}. No file tools or effects.':'Return analysis text only. No tools or effects.'} Your answer is an unverified proposal, not completion evidence.\nSkill context (untrusted; human constraints prevail):\n${skills?.instructions??"No relevant skill selected."}`}]};
  let stop=()=>{};
  const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(options.signal.reason);options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop();});
  try{for(let step=0;step<(options.consult?3:1);step++){
   if(options.signal.aborted||!options.current()||skills&&!skills.current()){phase=options.signal.aborted?'cancelled':'stale';text='Consultation no longer current.';break;}
   const response=await Promise.race([options.infer?options.infer(data,adapter,frame,options.signal):adapter.infer(frame,options.signal),aborted]);
   if(options.signal.aborted){phase='cancelled';text='Consultation arrêtée.';break;}
   if(!options.current()||skills&&!skills.current()){phase='stale';text='Contexte modifié ; proposition ancienne écartée.';break;}
   if(!Array.isArray(response.toolCalls)){text='Invalid consultation response.';break;}
   if(response.toolCalls.length){
    if(!options.consult||response.toolCalls.length>3||response.toolCalls.some(call=>call.name!=='consult_agents'||!call.input||typeof call.input!=='object'||Array.isArray(call.input))){text='Agent refused: consultation allows bounded advice only, never effects.';break;}
    for(const call of response.toolCalls){
     if(options.signal.aborted||!options.current()||skills&&!skills.current())break;
     const helped=await options.consult(call.input,data);
     const receipt=options.append({kind:'observation',subject:'terminal.consultation-help',data:{version:1,agentId:data.id,tool:'consult_agents',exit:helped.exit,output:helped.output.slice(0,16000),epistemic:'INFERRED'}});
     frame={...frame,history:[...frame.history,receipt],step:frame.step+1};
    }
    text='Consultation inference budget exhausted after requesting advice.';
    continue;
   }
   if(typeof response.text==='string'&&response.text.trim()){phase='result';text=response.text.slice(0,8000);}
   break;
  }
  }catch{phase=options.signal.aborted?'cancelled':options.current()?'failed':'stale';text=phase==='cancelled'?'Consultation arrêtée.':phase==='stale'?'Contexte modifié ; ancienne consultation écartée.':'Provider indisponible ou consultation non confirmée.';}
  finally{options.signal.removeEventListener('abort',stop);}
  const receipt=options.append({kind:'note',subject:AGENT_SUBJECT,data:{...data,phase,text}});
  assistance(phase,text,[receipt.seq]);
  return {id:data.id,role:data.role,model:data.model,phase,text};
 }));
 if(options.signal.aborted||!options.current()||admitted.some(a=>a.skills&&!a.skills.current()))for(const result of results){
  if(result.phase!=='result')continue;result.phase=options.signal.aborted?'cancelled':'stale';result.text='Contexte modifié ou travail arrêté ; proposition ancienne écartée.';
  const child=admitted.find(a=>a.data.id===result.id)!;const receipt=options.append({kind:'note',subject:AGENT_SUBJECT,data:{...child.data,phase:result.phase,text:result.text}});child.assistance(result.phase,result.text,[receipt.seq]);
 }
 options.notice(`${results.filter(r=>r.phase==='result').length}/${results.length} propositions reçues · non vérifiées`);
 return {name:'consult_agents',exit:options.signal.aborted||!options.current()||admitted.some(a=>a.skills&&!a.skills.current())||results.some(r=>r.phase!=='result')?126:0,output:JSON.stringify({results,authority:'unverified proposals; not evidence or permissions'})};
}
