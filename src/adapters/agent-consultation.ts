/** The controller owns admission; consultants return text, never effects. */
import {randomUUID} from 'node:crypto';
import type {ContextFrame,ModelAdapter,ToolResult} from '../core/loop.ts';
import type {Event,NewEvent} from '../core/store.ts';
export const AGENT_SUBJECT='terminal.agent';
export type AgentPhase='active'|'result'|'failed'|'stale'|'cancelled';
export interface AgentEntry {id:string;role:string;task:string;model:string;phase:AgentPhase|'interrupted';text:string;seq:number;}
export function projectAgents(events:Event[],live:boolean|string=false):AgentEntry[]{
 const entries=new Map<string,AgentEntry>();
 for(const e of events){const d=e.data;if(e.kind!=='note'||e.subject!==AGENT_SUBJECT||d.version!==1||typeof d.id!=='string'||typeof d.role!=='string'||typeof d.task!=='string'||typeof d.model!=='string'||!['active','result','failed','stale','cancelled'].includes(String(d.phase)))continue;
 entries.set(d.id,{id:d.id,role:d.role,task:d.task,model:d.model,phase:d.phase==='active'&&!(live===true || typeof live==='string'&&d.execution===live)?'interrupted':d.phase as AgentPhase,text:typeof d.text==='string'?d.text:'',seq:e.seq});}
 return [...entries.values()].sort((a,b)=>b.seq-a.seq);
}
export async function consultAgents(options:{input:Record<string,unknown>;model:ModelAdapter;route?:(role:string)=>{adapter:ModelAdapter;label:string};frame:ContextFrame;signal:AbortSignal;current():boolean;append(event:NewEvent):Event;execution:string;basis?:number;objective?:{id:string;revision:number};modelLabel:string;notice(text:string):void}):Promise<ToolResult>{
 const refuse=(output:string):ToolResult=>({name:'consult_agents',exit:126,output});
 const tasks=options.input.tasks;
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>3||!tasks.every(t=>t&&typeof t==='object'&&typeof t.role==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(t.role)&&typeof t.task==='string'&&t.task.trim().length>0&&t.task.length<=4000))return refuse('Expected 1–3 tasks {role:slug,task:text}, task at most 4000 characters.');
 options.signal.throwIfAborted();
 let resolved:Array<{task:any;route:{adapter:ModelAdapter;label:string}}>;
 try{resolved=tasks.map(task=>({task,route:options.route?.(task.role)??{adapter:options.model,label:options.modelLabel}}));}catch{return refuse('Configured agent model is unavailable; no provider fallback or consultation was started.');}
 const admitted=resolved.map(({task:t,route})=>{const data={version:1,id:randomUUID(),role:t.role,task:t.task,model:route.label,execution:options.execution,basis:options.basis??0,...(options.objective?{objectiveId:options.objective.id,objectiveRevision:options.objective.revision}:{}),phase:'active',text:''};options.append({kind:'note',subject:AGENT_SUBJECT,data});return {data,adapter:route.adapter};});
 options.notice(`${admitted.length} agents consultent le contexte · ${options.modelLabel}`);
 const results=await Promise.all(admitted.map(async ({data,adapter})=>{
  let phase:AgentPhase='failed',text='Consultation non confirmée.';
  const frame:ContextFrame={...options.frame,capabilities:[],directives:[...options.frame.directives.filter(d=>!/^tools:/.test(d.text)),{seq:Number.MAX_SAFE_INTEGER,at:Date.now(),target:'builder',applied:false,text:`tools: \nConsultation ${data.role}: ${data.task}\nReturn analysis text only. No tools or effects. Your answer is an unverified proposal, not completion evidence.`}]};
  let stop=()=>{};
  const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(options.signal.reason);options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop();});
  try{const response=await Promise.race([(adapter as ModelAdapter&{infer(frame:ContextFrame,signal?:AbortSignal):ReturnType<ModelAdapter['infer']>}).infer(frame,options.signal),aborted]);
   if(options.signal.aborted){phase='cancelled';text='Consultation arrêtée.';}
   else if(!options.current()){phase='stale';text='Contexte modifié ; proposition ancienne écartée.';}
   else if(response.toolCalls.length){text='Agent refusé : consultation sans outils.';}
   else if(typeof response.text==='string'&&response.text.trim()){phase='result';text=response.text.slice(0,8000);}
  }catch{phase=options.signal.aborted?'cancelled':options.current()?'failed':'stale';text=phase==='cancelled'?'Consultation arrêtée.':phase==='stale'?'Contexte modifié ; ancienne consultation écartée.':'Provider indisponible ou consultation non confirmée.';}
  finally{options.signal.removeEventListener('abort',stop);}
  options.append({kind:'note',subject:AGENT_SUBJECT,data:{...data,phase,text}});
  return {id:data.id,role:data.role,model:data.model,phase,text};
 }));
 if(options.signal.aborted||!options.current())for(const result of results){
  if(result.phase!=='result')continue;result.phase=options.signal.aborted?'cancelled':'stale';result.text='Contexte modifié ou travail arrêté ; proposition ancienne écartée.';
  const data=admitted.find(a=>a.data.id===result.id)!.data;options.append({kind:'note',subject:AGENT_SUBJECT,data:{...data,phase:result.phase,text:result.text}});
 }
 options.notice(`${results.filter(r=>r.phase==='result').length}/${results.length} propositions reçues · non vérifiées`);
 return {name:'consult_agents',exit:options.signal.aborted||!options.current()?126:0,output:JSON.stringify({results,authority:'unverified proposals; not evidence or permissions'})};
}
