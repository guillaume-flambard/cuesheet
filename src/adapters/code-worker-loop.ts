import {randomUUID, createHash} from 'node:crypto';
import type {ContextFrame, ModelAdapter, ToolRunner} from '../core/loop.ts';
import type {Event, NewEvent} from '../core/store.ts';
import type {PreparedCodeWorker} from './code-worker-workspaces.ts';

export type CodeWorkerResult = {phase:'proposal'|'exhausted'|'stale'|'cancelled'|'failed'|'uncertain'; text:string; steps:number};
const forbidden = new Set(['git','finish','prepare_workspace','integrate_workspace','reconcile_effect','consult_agents',
  'organize_work','remember','create_skill','describe_objective']);
/** Owner-supplied append is a private durable journal; tools are already scoped. */
export async function runCodeWorker(options: {
  worker: PreparedCodeWorker; tools: ToolRunner; allow: readonly string[]; maxSteps: number;
  frame(step: number): ContextFrame; signal: AbortSignal; current(): boolean;
  maxFrameChars?: number;
  append(event: NewEvent): Event;
}): Promise<CodeWorkerResult> {
  let steps=0, effectPending=false;
  const allowed=new Set(options.allow.filter(name=>!forbidden.has(name)));
  const current=()=>!options.signal.aborted&&options.current();
  const outcome=(phase:CodeWorkerResult['phase'],text=''):CodeWorkerResult=>({phase,text,steps});
  const stale=()=>outcome(options.signal.aborted?'cancelled':'stale');
  if(!Number.isSafeInteger(options.maxSteps)||options.maxSteps<1||options.maxSteps>8) return outcome('failed');
  const maxFrameChars=options.maxFrameChars??48000;
  if(!Number.isSafeInteger(maxFrameChars)||maxFrameChars<4000)return outcome('failed');
  try {
    while(steps<options.maxSteps){
      if(!current())return stale();
      const source=options.frame(++steps);
      const frame:ContextFrame={...source, capabilities:source.capabilities.filter(capability=>allowed.has(capability.name)),
        directives:[...source.directives.filter(d=>!/^tools:/.test(d.text)),
          {seq:Number.MAX_SAFE_INTEGER,at:Date.now(),target:'builder',applied:false,
            text:`tools: ${[...allowed].join(', ')}\nCode worker ${options.worker.packet.role}: ${options.worker.packet.task}\nResponsibilities: ${options.worker.packet.files.join(', ')}\nController-selected workspace: ${options.worker.path}. Your output is an unverified contribution. No goal closure or integration authority.`}]};
      if(JSON.stringify(frame).length>maxFrameChars)return outcome('failed','Worker context exceeds the owner frame ceiling; no inference was sent and no instruction was silently dropped.');
      let stop=()=>{};
      const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(options.signal.reason);options.signal.addEventListener('abort',stop,{once:true});if(options.signal.aborted)stop();});
      let response;
      try {response=await Promise.race([(options.worker.adapter as ModelAdapter & {infer(frame:ContextFrame,signal?:AbortSignal):ReturnType<ModelAdapter['infer']>}).infer(frame,options.signal),aborted]);}
      finally {options.signal.removeEventListener('abort',stop);}
      if(!current())return stale();
      // Validate the entire response before executing even its first call.
      if(!Array.isArray(response.toolCalls)||response.toolCalls.length>8||response.toolCalls.some(call=>
        !call||!allowed.has(call.name)||!call.input||typeof call.input!=='object'||Array.isArray(call.input)))return outcome('failed');
      if(response.toolCalls.length===0)return outcome('proposal',typeof response.text==='string'?response.text.slice(0,8000):'');
      for(const request of response.toolCalls){
        if(!current())return stale();
        const effectId=`${options.worker.id}:${randomUUID()}`;
        const intent=options.append({kind:'action',subject:'terminal.intent',data:{version:1,phase:'requested',tool:request.name,input:request.input,effectId,scopeCwd:options.worker.path}});
        effectPending=true;
        // Append callbacks may themselves observe a new human revision.
        if(!current())return outcome('uncertain');
        const result=await options.tools.run(request);
        if(result.exit===null||!Number.isInteger(result.exit))return outcome('uncertain');
        options.append({kind:'note',subject:'terminal.receipt',data:{version:1,operation:'completed',intentSeq:intent.seq,tool:request.name,exit:result.exit,digest:createHash('sha256').update(result.output).digest('hex')}});
        effectPending=false;
        options.append({kind:'observation',subject:'builder',data:{tool:request.name,exit:result.exit,output:result.output.slice(0,16000)}});
        if(!current())return stale();
        if(result.exit!==0)return outcome('failed');
      }
    }
    return outcome('exhausted');
  }catch{return effectPending?outcome('uncertain'):!current()?stale():outcome('failed');}
}
