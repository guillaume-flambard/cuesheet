import { createHash } from "node:crypto";
import type { Event,EventStore } from "../core/store.ts";
import type { ToolRequest,ToolResult } from "../core/loop.ts";
export const RECEIPT_SUBJECT="terminal.receipt";
const internal=new Set(["consult_agents","read_history","read_shared_context","search_vault","read_vault_reference","read_document","search_web","list_skills","read_skill","organize_work","remember","create_skill","describe_objective","reconcile_effect"]);
export function inspectionTool(name:string):boolean{return name==="cat" || name==="ls";}
export function mutationTool(name:string):boolean{return !internal.has(name) && !inspectionTool(name);}
export interface EffectAttempt {intentSeq:number;tool:string;input:Record<string,unknown>;phase:"uncertain"|"completed"|"performed"|"not-performed";executionId:string|null;sourceSeq:number|null;scopeCwd:string|null;}
export function invocationKey(tool:string,input:Record<string,unknown>):string {
  const canonical=(value:unknown):unknown=>Array.isArray(value) ? value.map(canonical) : value && typeof value==="object" ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value;
  return createHash("sha256").update(JSON.stringify([tool,canonical(input)])).digest("hex");
}
export function projectEffectAttempts(events:readonly Event[]):EffectAttempt[]{
  const attempts=new Map<number,EffectAttempt>();
  let legacyPending:number|null=null;
  const completed=new Set<number>();
  const sources=new Map(events.map(event=>[event.seq,event]));
  for(let index=0;index<events.length;index++){
    const event=events[index]!;
    if(event.kind==="action" && event.subject==="terminal.intent"){
      if((event.data.scopeCwd!==undefined && (typeof event.data.scopeCwd!=="string" || !event.data.scopeCwd.trim() || event.data.scopeCwd.length>4096)) || (event.data.version!==undefined && event.data.version!==1) || event.data.phase!=="requested" || typeof event.data.tool!=="string" || !event.data.tool || event.data.tool.length>200 || !event.data.input || typeof event.data.input!=="object" || Array.isArray(event.data.input) || (event.data.version===1 && (typeof event.data.effectId!=="string" || !event.data.effectId)))throw new Error(`Invalid tool intent at sequence ${event.seq}.`);
      // Old calls had no linked receipt. Accept only the serial core result
      // before another invocation/execution boundary; never consume a future run.
      attempts.set(event.seq,{intentSeq:event.seq,tool:event.data.tool,input:event.data.input as Record<string,unknown>,phase:"uncertain",executionId:typeof event.data.effectId==="string" ? event.data.effectId : null,sourceSeq:null,scopeCwd:typeof event.data.scopeCwd==="string" ? event.data.scopeCwd : null});
      legacyPending=event.data.version===undefined ? event.seq : null;
    }
    if(event.kind==="effect_requested" || event.kind==="effect_observed")legacyPending=null;
    if(legacyPending!==null && event.kind==="observation" && event.subject==="builder"){
      const pending=attempts.get(legacyPending)!;
      if(event.data.tool===pending.tool && Number.isInteger(event.data.exit)){
        if(pending.phase==="uncertain"){pending.phase="completed";pending.sourceSeq=event.seq;}
        legacyPending=null;
      }
    }
    if(event.kind!=="note" || event.subject!==RECEIPT_SUBJECT)continue;
    const d=event.data;const prior=attempts.get(d.intentSeq as number);
    const invalid=()=>{throw new Error(`Invalid effect receipt at sequence ${event.seq}.`);};
    if(d.version!==1 || !prior || prior.intentSeq>=event.seq || d.tool!==prior.tool)invalid();
    if(d.operation==="completed"){
      if(prior!.phase!=="uncertain" || completed.has(prior!.intentSeq) || !Number.isInteger(d.exit) || typeof d.digest!=="string" || !/^[a-f0-9]{64}$/.test(d.digest))invalid();
      completed.add(prior!.intentSeq);prior!.phase="completed";prior!.sourceSeq=event.seq;
    }else if(d.operation==="reconcile"){
      if(prior!.phase!=="uncertain" || !["performed","not-performed","inconclusive"].includes(String(d.conclusion)) || typeof d.rationale!=="string" || !d.rationale.trim() || d.rationale.length>4000 || typeof d.executionId!=="string" || !d.executionId)invalid();
      const observed=sources.get(d.observationSeq as number);
      if(!observed || observed.seq<=prior!.intentSeq || observed.seq>=event.seq || observed.kind!=="observation" || observed.subject!=="builder" || !inspectionTool(String(observed.data.tool)) || observed.data.exit!==0)invalid();
      prior!.phase=d.conclusion==="inconclusive" ? "uncertain" : d.conclusion as "performed"|"not-performed";
      prior!.executionId=d.executionId as string;prior!.sourceSeq=event.seq;
    }else invalid();
  }
  return [...attempts.values()];
}
export function appendReceipt(store:EventStore,data:Record<string,unknown>):Event {
  const event:Event={seq:store.revision<0 ? 1 : store.revision+1,at:0,kind:"note",subject:RECEIPT_SUBJECT,data};
  projectEffectAttempts([...store.toSession().events,event]);return store.append({kind:event.kind,subject:event.subject,data});
}
export function completeAttempt(store:EventStore,intent:Event,result:ToolResult):void {
  appendReceipt(store,{version:1,operation:"completed",intentSeq:intent.seq,tool:intent.data.tool,exit:result.exit,digest:createHash("sha256").update(result.output).digest("hex")});
}
export function reconcileEffect(store:EventStore,request:ToolRequest,executionId:string):ToolResult {
  try{
    const {intentSeq,observationSeq,conclusion,rationale}=request.input;
    const attempt=projectEffectAttempts(store.toSession().events).find(a=>a.intentSeq===intentSeq);
    if(!attempt)return {name:request.name,exit:2,output:"Unknown intent sequence. Read the uncertainEffects snapshot."};
    const event=appendReceipt(store,{version:1,operation:"reconcile",intentSeq,tool:attempt.tool,observationSeq,conclusion,rationale,executionId});
    return {name:request.name,exit:0,output:JSON.stringify({sourceSeq:event.seq,intentSeq,conclusion,authority:"model interpretation of observed workspace; not acceptance evidence"})};
  }catch{return {name:request.name,exit:2,output:"Reconciliation requires an uncertain intent, a later successful cat/ls observation sequence, conclusion performed/not-performed/inconclusive, and rationale."};}
}
