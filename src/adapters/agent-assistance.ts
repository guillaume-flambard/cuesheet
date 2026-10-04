import type {Event,NewEvent} from '../core/store.ts';

export const ASSISTANCE_SUBJECT='terminal.assistance';
export type AssistancePhase='requested'|'admitted'|'result'|'failed'|'cancelled'|'stale';
export interface AssistanceRequest {
 version:1; id:string; requesterId:string; helperId:string; question:string;
 execution:string; model:string; routeReason:string;
 objectiveId?:string; objectiveRevision?:number;
}
export interface AssistanceRecord extends AssistanceRequest {
 phase:AssistancePhase|'interrupted'; text:string; epistemic:'INFERRED'|'UNKNOWN';
 sourceSeqs:number[]; seq:number;
}
const bounded=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
function request(value:Record<string,unknown>):value is Record<string,unknown>&AssistanceRequest {
 return value.version===1&&['id','requesterId','helperId','execution'].every(k=>bounded(value[k],256))&&
 bounded(value.question,4000)&&bounded(value.model,512)&&bounded(value.routeReason,512)&&
 (value.objectiveId===undefined&&value.objectiveRevision===undefined||bounded(value.objectiveId,256)&&Number.isSafeInteger(value.objectiveRevision)&&Number(value.objectiveRevision)>=0);
}
function transition(before:AssistancePhase|undefined,after:AssistancePhase):boolean {
 if(!before)return after==='requested';
 if(before==='requested')return ['admitted','failed','cancelled','stale'].includes(after);
 if(before==='admitted')return ['result','failed','cancelled','stale'].includes(after);
 return before==='result'&&(after==='stale'||after==='cancelled');
}
const identity=(r:AssistanceRequest)=>JSON.stringify([r.id,r.requesterId,r.helperId,r.question,r.execution,r.model,r.routeReason,r.objectiveId,r.objectiveRevision]);
/** Additive journal projection: no network, writes, replayed inference or inferred edges. */
export function projectAssistance(events:readonly Event[],live:boolean|string=false):AssistanceRecord[]{
 const records=new Map<string,AssistanceRecord>();
 for(const e of events){const d=e.data;
  if(e.kind!=='note'||e.subject!==ASSISTANCE_SUBJECT||!request(d)||!['requested','admitted','result','failed','cancelled','stale'].includes(String(d.phase))||typeof d.text!=='string'||d.text.length>8000||!Array.isArray(d.sourceSeqs)||d.sourceSeqs.length>32||!d.sourceSeqs.every(s=>Number.isSafeInteger(s)&&s>=0&&s<e.seq))continue;
  const phase=d.phase as AssistancePhase,previous=records.get(d.id);
  if(d.epistemic!==(phase==='result'?'INFERRED':'UNKNOWN')||previous&&identity(previous)!==identity(d)||!transition(previous?.phase as AssistancePhase|undefined,phase))continue;
  records.set(d.id,{version:1,id:d.id,requesterId:d.requesterId,helperId:d.helperId,question:d.question,execution:d.execution,model:d.model,routeReason:d.routeReason,...(d.objectiveId===undefined?{}:{objectiveId:d.objectiveId,objectiveRevision:d.objectiveRevision}),phase,text:d.text,epistemic:phase==='result'?'INFERRED':'UNKNOWN',sourceSeqs:[...d.sourceSeqs],seq:e.seq});
 }
 return [...records.values()].map(r=>(r.phase==='requested'||r.phase==='admitted')&&!(live===true||live===r.execution)?{...r,phase:'interrupted'}:r);
}
/** One controller owns this handle. Durable publication precedes local transition. */
export function recordAssistance(base:AssistanceRequest,append:(event:NewEvent)=>Event){
 if(!request(base as unknown as Record<string,unknown>))throw Error('Invalid assistance request.');
 let phase:AssistancePhase|undefined;
 return (next:AssistancePhase,text='',sourceSeqs:number[]=[])=>{
  if(!transition(phase,next)||text.length>8000||sourceSeqs.length>32||!sourceSeqs.every(s=>Number.isSafeInteger(s)&&s>=0))throw Error('Invalid assistance transition.');
  const event=append({kind:'note',subject:ASSISTANCE_SUBJECT,data:{...base,phase:next,text,sourceSeqs,epistemic:next==='result'?'INFERRED':'UNKNOWN'}});
  phase=next;return event;
 };
}
