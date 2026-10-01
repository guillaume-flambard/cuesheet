import type { EventStore } from "../core/store.ts";
import type { ToolRequest, ToolResult } from "../core/loop.ts";

/** Read-only, paginated retrieval of durable sources omitted from a model frame. */
export function readHistory(store: EventStore, request: ToolRequest): ToolResult | null {
  if(request.name!=="read_history")return null;
  const {from,to}=request.input;
  const offset=request.input.offset ?? 0;
  if(typeof from!=="number" || typeof to!=="number" || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from<1 || to<from || to-from>=100 || to>store.revision)
    return {name:request.name,exit:2,output:"Use existing sequence numbers {from,to}, inclusive; maximum 100 events per page."};
  if(typeof offset!=="number" || !Number.isSafeInteger(offset) || offset<0 || (offset>0 && from!==to))
    return {name:request.name,exit:2,output:"Use a non-negative character offset only with a single event {from:seq,to:seq,offset}."};
  const events=store.toSession().events.filter(event=>event.seq>=from && event.seq<=to);
  const output:{events:unknown[];from:number;to:number;complete:boolean;next:number|null}={events:[],from,to,complete:true,next:null};
  for(const event of events){
    const encoded=JSON.stringify(event.data);
    if(offset>encoded.length)return {name:request.name,exit:2,output:"Offset is outside this event's encoded data."};
    const end=Math.min(encoded.length,offset+4000);
    const row=encoded.length>4000 || offset>0 ? {seq:event.seq,at:event.at,kind:event.kind,subject:event.subject,
      dataExcerpt:encoded.slice(offset,end),offset,totalChars:encoded.length,nextOffset:end<encoded.length ? end : null,truncated:end<encoded.length || offset>0} : event;
    const candidate={...output,events:[...output.events,row]};
    if(JSON.stringify(candidate).length>12000){output.complete=false;output.next=event.seq;break;}
    output.events.push(row);
  }
  return {name:request.name,exit:0,output:JSON.stringify(output)};
}
