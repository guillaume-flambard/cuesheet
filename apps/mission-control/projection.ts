import type {Event} from '../../src/core/store.ts';
import {projectObjectives} from '../../src/adapters/objectives.ts';
import {projectExecutions} from '../../src/adapters/execution-state.ts';
import {projectAgents} from '../../src/adapters/agent-consultation.ts';
import {projectOrganization} from '../../src/adapters/work-organizer.ts';
import type {UsageRequest} from '../../src/adapters/model-usage.ts';
import type {CheckConfirmation} from '../terminal/src/producer/index.ts';

export function projectMission(input:{id:string;project:string;events:Event[];busy:boolean;live:boolean;usage:UsageRequest[];confirmation:CheckConfirmation|null;now?:number}){
  const {events}=input,objective=projectObjectives(events).current;
  const relevant=events.filter(e=>e.data.objectiveId===objective?.id);
  const current=relevant.filter(e=>e.data.objectiveRevision===objective?.revision);
  const executions=projectExecutions(events,{replaying:!input.live}).filter(e=>e.objectiveId===objective?.id);
  const execution=executions.at(-1);
  const workers=projectAgents(relevant,input.live&&input.busy);
  const evidence=current.filter(e=>e.kind==='work_verified').map(e=>({source:e.seq,state:e.data.verdict==='VERIFIED'&&objective?.status==='verified'?'VERIFIED':e.data.verdict==='REJECTED'?'FAILED':'UNKNOWN',record:typeof e.data.record==='string'?e.data.record:null}));
  const observed=events.filter(e=>e.kind==='observation'&&e.seq>=(objective?.created??Infinity));
  const failures=observed.filter(e=>typeof e.data.exit==='number'&&e.data.exit!==0).slice(-5).map(e=>({source:e.seq,tool:String(e.data.tool??'tool'),state:'FAILED' as const}));
  const pending=observed.filter(e=>e.data.exit===null).slice(-5).map(e=>({source:e.seq,tool:String(e.data.tool??'tool'),state:'UNKNOWN' as const}));
  const humanDelta=input.confirmation?{required:true,kind:'check-renewal',reason:'Your correction changed the objective. Only an explicit human confirmation can renew the pinned acceptance check.',actions:[{label:'Review and confirm the current acceptance check',instruction:'Use the Cuesheet check-confirmation flow for this objective revision.'}],contract:input.confirmation}: {required:false,kind:null,reason:null,actions:[],contract:null};
  const state=objective?.status==='verified'?'verified':humanDelta.required?'human_required':input.busy&&input.live?'running':execution?.phase==='failed'?'failed':'blocked';
  const organization=projectOrganization(events);
  const graph=organization.plan?.current?organization.plan.taskRecords?.map(t=>({id:t.id,text:t.text,dependencies:t.dependencies,state:'UNKNOWN'}))??[]:[];
  const tokens=input.usage.length&&input.usage.every(r=>r.status==='observed'&&r.inputTokens!==null&&r.outputTokens!==null)?input.usage.reduce((sum,r)=>sum+BigInt(r.inputTokens!)+BigInt(r.outputTokens!),0n).toString():null;
  const began=events.find(e=>e.kind==='effect_requested'&&e.seq>(objective?.created??Infinity));
  const last=events.at(-1);const end=input.busy?(input.now??Date.now()):last?.at;
  const elapsed=began&&end!==undefined&&end>=began.at?Math.round((end-began.at)/1000):null;
  return {id:input.id,project:input.project,objective:objective?.text??'No objective admitted',objectiveId:objective?.id??null,revision:objective?.revision??null,state,
    currentPhase:execution?.phase??'unknown',progress:{completed:null,active:null,pending:null},
    workers:{active:workers.filter(w=>w.phase==='active').length,total:workers.length},resources:{elapsed,tokens,cost:null},
    evidence:{verified:evidence.filter(e=>e.state==='VERIFIED').length,failed:evidence.filter(e=>e.state==='FAILED').length,unknown:evidence.filter(e=>e.state==='UNKNOWN').length},
    humanDelta,updatedAt:last?.at??null,detail:{graph,workers:workers.map(w=>({role:w.role,task:w.task,model:w.model,state:w.phase==='result'?'OBSERVED':w.phase==='active'?'RUNNING':w.phase==='failed'?'FAILED':w.phase==='interrupted'?'UNKNOWN':'BLOCKED',source:w.seq})),evidence,failures,pending,
      corrections:objective?.corrections.map(c=>({text:c.text,source:c.source}))??[],decisions:[],recovery:state==='blocked'?'Inspect preserved evidence before resuming. No automatic replay or source integration is authorized.':null}};
}
export type Mission=ReturnType<typeof projectMission>;
export function missionSummary(m:Mission){const {detail,humanDelta,...summary}=m;return {...summary,humanDelta:{required:humanDelta.required,reason:humanDelta.reason,actions:humanDelta.actions}};}
export function missionText(m:Mission){return [m.project+' / '+m.state.toUpperCase(),m.objective,'Verified checks: '+m.evidence.verified,'Active workers: '+m.workers.active,
  m.humanDelta.required?'Human action required: '+m.humanDelta.reason:'No human decision recorded.',m.state==='blocked'?m.detail.recovery:'',m.resources.tokens===null?'Tokens and cost: unknown':'Observed tokens: '+m.resources.tokens+'; cost: unknown'].filter(Boolean).join('\n');}
