/** Consumption is an independent authority: it never admits a model proposal. */
import {existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {SessionStore} from './session-store.ts';
export interface UsageReceipt {phase:'started'|'observed';requestId:string;provider:string;model:string|null;inputTokens?:number|null;outputTokens?:number|null;cacheCreationInputTokens?:number|null;cacheReadInputTokens?:number|null;}
export type UsageSink=(receipt:UsageReceipt)=>void;
const fields=['inputTokens','outputTokens','cacheCreationInputTokens','cacheReadInputTokens'] as const;
const count=(v:unknown)=>v===null || Number.isSafeInteger(v)&&Number(v)>=0;
const validText=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
export interface UsageRequest {requestId:string;provider:string;model:string|null;status:'pending'|'observed';inputTokens:number|null;outputTokens:number|null;cacheCreationInputTokens:number|null;cacheReadInputTokens:number|null;}
export function projectUsage(events:readonly import('../core/store.ts').Event[]):UsageRequest[] {
 const requests=new Map<string,UsageRequest>();
 for(const [index,event] of events.entries()){
  const d=event.data;const invalid=():never=>{throw new Error('Invalid model usage journal.');};
  if(event.seq!==index+1 || event.kind!=='note' || event.subject!=='model.usage' || !Number.isFinite(event.at) || d.version!==1 ||
    !validText(d.requestId,128)||!/^[A-Za-z0-9_-]+$/.test(d.requestId)||!validText(d.provider,64)||(d.model!==null&&!validText(d.model,256)))invalid();
  const id=d.requestId as string;const prior=requests.get(id);
  if(d.phase==='started'){
   if(prior)invalid();requests.set(id,{requestId:id,provider:d.provider as string,model:d.model as string|null,status:'pending',inputTokens:null,outputTokens:null,cacheCreationInputTokens:null,cacheReadInputTokens:null});
  }else if(d.phase==='observed'){
   if(!prior || prior.status!=='pending' || prior.provider!==d.provider || prior.model!==d.model || !fields.every(f=>count(d[f])))invalid();
   requests.set(id,{...prior!,status:'observed',...Object.fromEntries(fields.map(f=>[f,d[f]]))} as UsageRequest);
  }else invalid();
 }
 return [...requests.values()];
}
export function summarizeUsage(requests:readonly UsageRequest[]) {
 const counters=Object.fromEntries(fields.map(field=>[field,{known:requests.reduce((sum,r)=>sum+BigInt(r[field]??0),0n).toString(),unknownRequests:requests.filter(r=>r[field]===null).length}]));
 return {requests:requests.length,pending:requests.filter(r=>r.status==='pending').length,counters,cost:null};
}
export class SessionUsage {
 private readonly name:string;
 private readonly options:{root:string;sessionId:string;assertWritable?:()=>void};
 constructor(options:{root:string;sessionId:string;assertWritable?:()=>void}){this.options=options;if(!/^t-[A-Za-z0-9_-]+$/.test(options.sessionId))throw new Error('Invalid usage session identity.');this.name=`${options.sessionId}.usage`;}
 read():UsageRequest[]{if(!existsSync(join(this.options.root,`${this.name}.jsonl`)))return [];return projectUsage(new SessionStore({root:this.options.root}).read(this.name));}
 readonly record:UsageSink=(receipt)=>{
  this.options.assertWritable?.();
  const events=existsSync(join(this.options.root,`${this.name}.jsonl`))?new SessionStore({root:this.options.root}).read(this.name):[];
  const data={version:1,phase:receipt.phase,requestId:receipt.requestId,provider:receipt.provider,model:receipt.model,
   ...(receipt.phase==='observed'?Object.fromEntries(fields.map(f=>[f,receipt[f]??null])):{})};
  projectUsage([...events,{kind:'note',subject:'model.usage',seq:events.length+1,at:Date.now(),data}]);
  const store=new SessionStore({root:this.options.root});
  if(!events.length&&!existsSync(join(this.options.root,`${this.name}.jsonl`))){store.create(this.name,[]);chmodSync(join(this.options.root,`${this.name}.jsonl`),0o600);}
  store.append(this.name,{kind:'note',subject:'model.usage',at:Date.now(),data});
 };
}
