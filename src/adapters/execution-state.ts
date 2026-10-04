import type { Event, EventStore } from "../core/store.ts";

export const EXECUTION_SUBJECT="terminal.execution";
export type ExecutionPhase="response-delivered"|"running"|"continuing"|"limit"|"stagnation"|"goal-closed"|"blocked"|"failed"|"cancelled";
export interface ExecutionState {
  id:string;slice:number;phase:ExecutionPhase|"interrupted";recordedPhase:ExecutionPhase;
  steps:number;maxSlices:number;stepsPerSlice:number;cost:null;
  objectiveId:string|null;objectiveRevision:number|null;sourceSeq:number;
}
const phases=new Set(["response-delivered","running","continuing","limit","stagnation","goal-closed","blocked","failed","cancelled"]);
const open=(phase:string)=>phase==="running" || phase==="continuing";
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==="number" && Number.isSafeInteger(value) && value>=min && value<=max;
function invalid(seq:number):never {throw new Error(`Invalid execution record at sequence ${seq}.`);}

/** Replay never changes an objective or executes an effect. Legacy missing links stay unknown. */
export function projectExecutions(events:readonly Event[],options:{replaying?:boolean}={}):ExecutionState[]{
  const executions=new Map<string,ExecutionState>();
  for(const event of events){
    if(event.kind!=="note" || event.subject!==EXECUTION_SUBJECT)continue;
    const d=event.data;
    if(d.version!==1 || typeof d.executionId!=="string" || !/^[A-Za-z0-9_-]{1,200}$/.test(d.executionId) ||
      !phases.has(String(d.state)) || !integer(d.maxSlices,1,16) || !integer(d.stepsPerSlice,1,1000) ||
      !integer(d.slice,1,d.maxSlices) || !integer(d.steps,0,d.slice*d.stepsPerSlice) || d.cost!==null)invalid(event.seq);
    const id=d.executionId,phase=d.state as ExecutionPhase;
    const prior=executions.get(id);
    if(!prior){if(phase!=="running" || d.slice!==1 || d.steps!==0)invalid(event.seq);}
    else {
      if(!open(prior.recordedPhase) || d.maxSlices!==prior.maxSlices || d.stepsPerSlice!==prior.stepsPerSlice || d.steps<prior.steps)invalid(event.seq);
      if(phase==="running"){
        if(prior.recordedPhase!=="continuing" || d.slice!==prior.slice+1 || d.steps!==prior.steps)invalid(event.seq);
      }else if(d.slice!==prior.slice || (prior.recordedPhase==="continuing" && phase!=="cancelled" && phase!=="failed"))invalid(event.seq);
    }
    if(phase==="running" && d.steps!==(d.slice-1)*d.stepsPerSlice)invalid(event.seq);
    if((phase==="continuing" || phase==="limit" || phase==="stagnation") && d.steps!==d.slice*d.stepsPerSlice)invalid(event.seq);
    if(phase==="continuing" && d.slice>=d.maxSlices)invalid(event.seq);
    if(phase==="limit" && d.slice!==d.maxSlices)invalid(event.seq);
    const objectiveId=d.objectiveId ?? null,objectiveRevision=d.objectiveRevision ?? null;
    if((objectiveId===null)!==(objectiveRevision===null) || (objectiveId!==null && (typeof objectiveId!=="string" || !objectiveId || !integer(objectiveRevision,1,event.seq-1))))invalid(event.seq);
    if(prior && objectiveId!==prior.objectiveId)invalid(event.seq);
    if(prior?.objectiveRevision!==null && prior?.objectiveRevision!==undefined && typeof objectiveRevision==="number" && objectiveRevision<prior.objectiveRevision)invalid(event.seq);
    executions.set(id,{id,slice:d.slice,phase:options.replaying && open(phase) ? "interrupted" : phase,recordedPhase:phase,
      steps:d.steps,maxSlices:d.maxSlices,stepsPerSlice:d.stepsPerSlice,cost:null,objectiveId:objectiveId as string|null,objectiveRevision:objectiveRevision as number|null,sourceSeq:event.seq});
  }
  return [...executions.values()];
}
export function appendExecutionNote(store:EventStore,data:Record<string,unknown>):Event {
  const event:Event={kind:"note",subject:EXECUTION_SUBJECT,seq:store.revision<0 ? 1 : store.revision+1,at:0,data};
  projectExecutions([...store.toSession().events,event]);
  return store.append({kind:event.kind,subject:event.subject,data});
}
