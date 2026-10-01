/** Bounded continuation of one explicitly started execution, above the core loop. */
import { appendExecutionNote, projectExecutions } from "./execution-state.ts";
import { projectObjectives } from "./objectives.ts";
import { createHash } from "node:crypto";
import { runAgentLoop, type ModelAdapter, type ToolRunner, type LoopOptions, type LoopOutcome } from "../core/loop.ts";
import type { EventStore, Event } from "../core/store.ts";

const bookkeeping=new Set(["organize_work","remember","create_skill","describe_objective","read_history","read_shared_context","list_skills"]);
export async function runExecutionSlices(store:EventStore,model:ModelAdapter,tools:ToolRunner,options:LoopOptions & {
  executionId:string;maxSlices:number;signal:AbortSignal;
}):Promise<LoopOutcome>{
  if(!Number.isSafeInteger(options.maxSlices) || options.maxSlices<1 || options.maxSlices>16)throw new Error("Execution slice budget must be 1-16.");
  const seen=new Set<string>();let steps=0;let completed=0;let activeSlice=0;const claims:string[]=[];
  const note=(slice:number,state:string)=>{
    const projected=projectObjectives(store.toSession().events).current;
    const objective=projected?.id.startsWith("legacy-") ? null : projected;
    const event=appendExecutionNote(store,{version:1,executionId:options.executionId,slice,state,steps,maxSlices:options.maxSlices,stepsPerSlice:options.maxSteps,cost:null,
      objectiveId:objective?.id ?? null,objectiveRevision:objective?.revision ?? null});
    options.onEvent?.(event);
  };
  try {
  for(let slice=1;slice<=options.maxSlices;slice++){
    options.signal.throwIfAborted();activeSlice=slice;note(slice,"running");
    let fresh=false;let action:Event|undefined;
    const outcome=await runAgentLoop(store,{name:model.name,async infer(frame){
      options.signal.throwIfAborted();const response=await model.infer({...frame,step:frame.step+(slice-1)*options.maxSteps});completed++;return response;
    }},tools,{...options,onEvent(event){
      options.onEvent?.(event);
      if(event.kind==="action" && typeof event.data.tool==="string")action=event;
      if(event.kind==="observation" && event.data.exit===0 && typeof event.data.tool==="string" && !bookkeeping.has(event.data.tool)){
        let observed=event.data.output;
        if(event.data.tool==="read_document" || event.data.tool==="read_skill"){
          try {const source=JSON.parse(String(observed));if(typeof source.digest==="string")observed=JSON.stringify([source.path ?? source.url,source.digest]);}catch{}
        }
        const digest=createHash("sha256").update(JSON.stringify([event.data.tool,action?.data.input,observed])).digest("hex");
        if(!seen.has(digest)){seen.add(digest);fresh=true;}
      }
    }});
    claims.push(...outcome.claims);
    if(outcome.stop.reason!=="blocked")steps+=outcome.stop.steps;
    options.signal.throwIfAborted();
    const terminal=outcome.stop.reason!=="budget-exhausted" || slice===options.maxSlices || !fresh;
    note(slice,outcome.stop.reason!=="budget-exhausted" ? outcome.stop.reason : !fresh ? "stagnation" : terminal ? "limit" : "continuing");
    if(terminal)return {...outcome,session:store.toSession(),claims,stop:outcome.stop.reason==="blocked" ? outcome.stop : {...outcome.stop,steps}};
  }
  throw new Error("Unreachable execution budget.");
  } catch(cause) {
    // A failed journal cannot publish a final record. Preserve the original failure.
    try {
      const current=projectExecutions(store.toSession().events).find(run=>run.id===options.executionId);
      if(current && (current.phase==="running" || current.phase==="continuing")){
        steps=completed;note(activeSlice,options.signal.aborted ? "cancelled" : "failed");
      }
    } catch {}
    throw cause;
  }
}
