/** Owned loopback event transport. The server remains a denied-tools proposer. */
import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';
import type {ModelProgress} from '../core/loop.ts';import type {RawRun} from './binary-model.ts';
import {FailureWithOrigin} from '../effects.ts';
export class ProviderProposalRefused extends FailureWithOrigin {
 constructor(message:string){super('run','provider',message);this.name='ProviderProposalRefused';}
}

/** Provider payloads can include credentials. Return only controlled diagnostics. */
export function providerEventFailure(event:any,sessionID:string):string|null{
 const p=event?.properties;let failure:unknown;
 if(event?.type==='session.status'&&p?.sessionID===sessionID&&p.status?.type==='retry')failure=p.status.message;
 else if(event?.type==='session.error'&&p?.sessionID===sessionID)failure=p.error;
 else if(event?.type==='message.updated'&&p?.info?.sessionID===sessionID&&p.info.role==='assistant'&&p.info.error)failure=p.info.error;
 else return null;
 const text=typeof failure==='string'?failure:JSON.stringify(failure??{});
 const reason=/quota|credit|balance|usage.limit/i.test(text)?'Quota exhausted for the selected provider/model. Choose an available model or wait for the quota reset.':/429|rate.?limit/i.test(text)?'Provider rate limit reached. Retry later or choose an available model.':/401|unauth|authentication/i.test(text)?'Provider authentication refused. Verify authentication for the selected provider.':/403|forbidden/i.test(text)?'Provider access refused for the selected model.': 'Provider request failed. No automatic retry was accepted; retry later or choose an available model.';
 return reason+' No proposal or tool action was accepted.';
}

/** Display only the proposal's leading public text field, never its JSON/tools. */
export function partialProposalText(raw:string):string {
 const prefix=raw.match(/^\s*(?:```(?:json)?\s*)?\{\s*"text"\s*:\s*"/);if(!prefix)return '';
 const source=raw.slice(prefix[0].length);let end=0,escaped=false;
 for(;end<source.length;end++){const c=source[end];if(!escaped&&c==='"')break;if(c==='\\'&&!escaped)escaped=true;else escaped=false;}
 let value=source.slice(0,end);
 for(let n=0;n<7;n++){try{return JSON.parse('"'+value+'"');}catch{value=value.slice(0,-1);}}
 return '';
}
export async function streamProposal(options:{binary:string;dir:string;config:Record<string,unknown>;agent:string;model?:string;prompt:string;timeoutMs:number;signal?:AbortSignal;progress:(p:ModelProgress)=>void}):Promise<RawRun> {
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[])]),password=randomBytes(24).toString('hex');
 const server=spawn(options.binary,['serve','--hostname','127.0.0.1','--port','0','--pure'],{cwd:options.dir,stdio:['ignore','pipe','pipe'],signal,killSignal:'SIGKILL',env:{...process.env,OPENCODE_CONFIG_CONTENT:JSON.stringify(options.config),OPENCODE_SERVER_USERNAME:'cuesheet',OPENCODE_SERVER_PASSWORD:password}});
 const timeout=setTimeout(()=>controller.abort(new Error('OpenCode inference timed out.')),options.timeoutMs);let eventsTask:Promise<void>|undefined,eventsController:AbortController|undefined;
 try{
  const base=await new Promise<string>((resolve,reject)=>{let startup='';const timer=setTimeout(()=>reject(new Error('OpenCode server startup timed out.')),15000);const done=(error?:Error,url?:string)=>{clearTimeout(timer);server.stdout.off('data',data);signal.removeEventListener('abort',abort);error?reject(error):resolve(url!);};const data=(chunk:Buffer)=>{startup=(startup+chunk.toString()).slice(-4096);const match=startup.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)done(undefined,match[0]);};const abort=()=>done(new Error('OpenCode startup cancelled.'));server.stdout.on('data',data);server.once('error',e=>done(e));server.once('exit',()=>done(new Error('OpenCode server exited.')));signal.addEventListener('abort',abort,{once:true});});
  const headers={'content-type':'application/json','authorization':'Basic '+Buffer.from('cuesheet:'+password).toString('base64')};
  const url=(route:string)=>base+route+(route.includes('?')?'&':'?')+'directory='+encodeURIComponent(options.dir);
  const request=async(route:string,body?:unknown)=>{const r=await fetch(url(route),{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal});if(!r.ok)throw new Error('OpenCode HTTP '+r.status);return r;};
  const session=await(await request('/session',{})).json() as {id:string};if(typeof session.id!=='string')throw new Error('OpenCode session unavailable.');
  eventsController=new AbortController();const eventSignal=AbortSignal.any([signal,eventsController.signal]);
  const response=await fetch(url('/event'),{headers,signal:eventSignal});if(!response.ok||!response.body)throw new Error('OpenCode event stream unavailable.');
  const userMessages=new Set<string>();const parts=new Map<string,{type:string;text:string}>();let last='';
  const publish=()=>{if(signal.aborted)return;const reasoning=[...parts.values()].filter(p=>p.type==='reasoning').map(p=>p.text).join('\n\n');const content=[...parts.values()].filter(p=>p.type==='text').map(p=>p.text).join('');const text=partialProposalText(content);const progress:ModelProgress={kind:text?'text':'reasoning',text:(text||reasoning).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,'').slice(-16000)};const key=progress.kind+progress.text;if(progress.text&&key!==last){last=key;options.progress(progress);}};
  eventsTask=(async()=>{const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='';try{while(!eventSignal.aborted){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=packet.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)continue;let event:any;try{event=JSON.parse(data)}catch{continue}const failure=providerEventFailure(event,session.id);if(failure){controller.abort(new ProviderProposalRefused(failure));return;}const p=event.properties;if(event.type==='message.updated'&&p?.info?.sessionID===session.id&&p.info.role==='user')userMessages.add(p.info.id);if(event.type==='message.part.updated'&&p?.part?.sessionID===session.id){const part=p.part;if(userMessages.has(part.messageID)||part.text===options.prompt)continue;if(['reasoning','text'].includes(part.type)&&typeof part.id==='string'){if(parts.size>=100&&!parts.has(part.id))continue;parts.set(part.id,{type:part.type,text:typeof part.text==='string'?part.text.slice(-100000):''});publish();}}if(event.type==='message.part.delta'&&p?.sessionID===session.id&&p.field==='text'&&typeof p.delta==='string'){const part=parts.get(p.partID);if(part){part.text=(part.text+p.delta).slice(-100000);publish();}}}if(buffer.length>1024*1024)throw new Error('OpenCode event exceeds limit.');}}finally{await reader.cancel().catch(()=>{});}})();
  // Observe errors without creating an unhandled rejection while HTTP is pending.
  eventsTask.catch(()=>{if(!eventSignal.aborted)controller.abort(new Error("OpenCode event stream failed."));});
  const selected=options.model?{providerID:options.model.split('/')[0],modelID:options.model.split('/').slice(1).join('/')}:undefined;
  const result=await(await request('/session/'+encodeURIComponent(session.id)+'/message',{agent:options.agent,...(selected?{model:selected}:{}),tools:{'*':false},parts:[{type:'text',text:options.prompt}]})).json() as {info?:any;parts?:any[]};
  if(result.info?.error)throw new ProviderProposalRefused(providerEventFailure({type:'session.error',properties:{sessionID:session.id,error:result.info.error}},session.id)!);if(!Array.isArray(result.parts))throw new Error('OpenCode response missing parts.');
  if(result.parts.some(p=>p.type==='tool'))throw new Error('OpenCode proposer attempted a forbidden tool.');
  const lines=result.parts.filter(p=>p.type==='text').map(p=>JSON.stringify({type:'text',part:p}));
  lines.push(JSON.stringify({type:'step_finish',part:{type:'step-finish',cost:result.info?.cost,tokens:result.info?.tokens}}));
  return {stdout:lines.join('\n')+'\n',stderr:'',exit:0,signal:null};
 }finally{clearTimeout(timeout);eventsController?.abort();controller.abort();server.kill('SIGKILL');await eventsTask?.catch(()=>{});}
}
