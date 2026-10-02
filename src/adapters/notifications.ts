/** Local read model, never a completion oracle or external dispatcher. */
import {createHash} from 'node:crypto';
import type {Event} from '../core/store.ts';
const labels:Record<string,string>={'goal-closed':'Objectif vérifié',blocked:'Travail bloqué',failed:'Exécution échouée',limit:'Budget de travail atteint',stagnation:'Travail sans nouveau progrès'};
/** Where a notification's fact was recorded: the journal event that proves it. */
export interface NotificationSource {/** Sequence of the originating event, stable forever. */seq:number;/** Subject of the originating event. */subject:string;/** Execution the fact names, verbatim. */execution:string;}
export interface WorkNotification {id:string;execution:string;source:NotificationSource;sourceSeq:number;phase:string;title:string;objective:string|null;revision:number|null;unread:boolean;historical:boolean;}
/**
 * Projection of sourced controller events into sober notifications.
 *
 * Deduplication rule: the execution is the fact key. One final execution is
 * one fact, so a repeated recording of the same outcome collapses into the
 * notification it already produced and does not re-surface it, a changed
 * outcome for the same execution updates that single notification in place
 * instead of adding a second, and a new execution is a new cause with its own
 * notification. A correction also takes the newest slot, so it is the last one
 * the 50 bound discards rather than the first.
 *
 * Refusal rule: an event the journal cannot anchor (no positive integer
 * sequence) or that names no execution carries no source, so it notifies
 * nothing. Only final outcomes listed in `labels` speak: running, continuing
 * and cancelled states, tool success, observations and model prose are low
 * signal and produce nothing. No I/O, no model call, no external dispatch.
 */
export class NotificationProjection {
 private cursor=0;private lastSeq=0;private readThrough=0;private items=new Map<string,Omit<WorkNotification,'unread'|'historical'>>();scanned=0;
 update(events:readonly Event[],objective?:{id:string;revision:number}|null):{digest:string;unread:number;throughSeq:number;items:WorkNotification[]}{
  if(events.length<this.cursor||this.cursor>0&&events[this.cursor-1]?.seq!==this.lastSeq){this.cursor=0;this.lastSeq=0;this.readThrough=0;this.items.clear();}
  for(let i=this.cursor;i<events.length;i++){const e=events[i]!,d=e.data;this.scanned++;
   if(!Number.isSafeInteger(e.seq)||e.seq<1)continue;
   if(e.kind==='note'&&e.subject==='terminal.notification_read'&&d.version===1&&d.author==='human'&&Number.isSafeInteger(d.throughSeq)&&Number(d.throughSeq)>0&&Number(d.throughSeq)<e.seq&&[...this.items.values()].some(n=>n.sourceSeq===d.throughSeq))this.readThrough=Math.max(this.readThrough,Number(d.throughSeq));
   if(e.kind!=='note'||e.subject!=='terminal.execution'||d.version!==1||typeof d.executionId!=='string'||!d.executionId.trim()||!labels[String(d.state)]||!Number.isSafeInteger(d.steps)||Number(d.steps)<0)continue;
   const id=d.executionId,phase=String(d.state),source:NotificationSource={seq:e.seq,subject:e.subject,execution:id},prior=this.items.get(id);
   if(prior){if(prior.phase!==phase){this.items.delete(id);this.items.set(id,{...prior,id:`${id}:${e.seq}`,source,sourceSeq:e.seq,phase,title:labels[phase]!});}continue;}
   const linked=typeof d.objectiveId==='string'&&d.objectiveId.length>0&&Number.isSafeInteger(d.objectiveRevision)&&Number(d.objectiveRevision)>0;
   this.items.set(id,{id:`${id}:${e.seq}`,execution:id,source,sourceSeq:e.seq,phase,title:labels[phase]!,objective:linked?String(d.objectiveId):null,revision:linked?Number(d.objectiveRevision):null});
   if(this.items.size>50)this.items.delete(this.items.keys().next().value!);
  }
  this.cursor=events.length;this.lastSeq=events.at(-1)?.seq??0;
  const items=[...this.items.values()].reverse().map(n=>{const historical=!!objective&&(n.objective!==objective.id||n.revision!==objective.revision);return {...n,historical,unread:!historical&&n.sourceSeq>this.readThrough};});
  const throughSeq=Math.max(0,...items.map(n=>n.sourceSeq));const digest=createHash('sha256').update(JSON.stringify(items)).digest('hex');return {digest,throughSeq,unread:items.filter(n=>n.unread).length,items};
 }
}
