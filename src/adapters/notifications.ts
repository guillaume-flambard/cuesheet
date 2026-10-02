/** Local read model, never a completion oracle or external dispatcher. */
import {createHash} from 'node:crypto';
import type {Event} from '../core/store.ts';
const labels:Record<string,string>={'goal-closed':'Objectif vérifié',blocked:'Travail bloqué',failed:'Exécution échouée',limit:'Budget de travail atteint',stagnation:'Travail sans nouveau progrès'};
export interface WorkNotification {id:string;execution:string;sourceSeq:number;phase:string;title:string;objective:string|null;revision:number|null;unread:boolean;historical:boolean;}
export class NotificationProjection {
 private cursor=0;private lastSeq=0;private readThrough=0;private items=new Map<string,Omit<WorkNotification,'unread'|'historical'>>();scanned=0;
 update(events:readonly Event[],objective?:{id:string;revision:number}|null):{digest:string;unread:number;throughSeq:number;items:WorkNotification[]}{
  if(events.length<this.cursor||this.cursor>0&&events[this.cursor-1]?.seq!==this.lastSeq){this.cursor=0;this.lastSeq=0;this.readThrough=0;this.items.clear();}
  for(let i=this.cursor;i<events.length;i++){const e=events[i]!,d=e.data;this.scanned++;
   if(e.kind==='note'&&e.subject==='terminal.notification_read'&&d.version===1&&d.author==='human'&&Number.isSafeInteger(d.throughSeq)&&Number(d.throughSeq)>0&&Number(d.throughSeq)<e.seq&&[...this.items.values()].some(n=>n.sourceSeq===d.throughSeq))this.readThrough=Math.max(this.readThrough,Number(d.throughSeq));
   if(e.kind!=='note'||e.subject!=='terminal.execution'||d.version!==1||typeof d.executionId!=='string'||!labels[String(d.state)]||!Number.isSafeInteger(d.steps)||Number(d.steps)<0)continue;
   const id=d.executionId;if(this.items.has(id))continue;
   const linked=typeof d.objectiveId==='string'&&d.objectiveId.length>0&&Number.isSafeInteger(d.objectiveRevision)&&Number(d.objectiveRevision)>0;
   this.items.set(id,{id:`${id}:${e.seq}`,execution:id,sourceSeq:e.seq,phase:String(d.state),title:labels[String(d.state)]!,objective:linked?String(d.objectiveId):null,revision:linked?Number(d.objectiveRevision):null});
   if(this.items.size>50)this.items.delete(this.items.keys().next().value!);
  }
  this.cursor=events.length;this.lastSeq=events.at(-1)?.seq??0;
  const items=[...this.items.values()].reverse().map(n=>{const historical=!!objective&&(n.objective!==objective.id||n.revision!==objective.revision);return {...n,historical,unread:!historical&&n.sourceSeq>this.readThrough};});
  const throughSeq=Math.max(0,...items.map(n=>n.sourceSeq));const digest=createHash('sha256').update(JSON.stringify(items)).digest('hex');return {digest,throughSeq,unread:items.filter(n=>n.unread).length,items};
 }
}
