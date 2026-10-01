/** Shared scopes are append-only sources; no scope grants tool or completion authority. */
import {existsSync,statSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {SessionStore} from "./session-store.ts";
export interface SharedScope {kind:"project"|"organization";id:string;}
export interface SharedSource {session:string;seq:number;}
export interface SharedMemory {id:string;kind:"decision"|"constraint"|"question";text:string;rationale:string;sources:SharedSource[];author:"model";revision:number;}
export interface SharedProfile {scope:SharedScope;revision:number;entries:SharedMemory[];}
export interface SharedSnapshot {digest:string;profiles:SharedProfile[];}
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const text=(v:unknown,max:number):v is string=>typeof v==="string" && !!v.trim() && v.length<=max;
export function sharedScope(kind:SharedScope['kind'],path:string):SharedScope {return {kind,id:`scope-${hash(resolve(path))}`};}
const normalized=(sources:SharedSource[])=>[...new Map(sources.map(s=>[`${s.session}:${s.seq}`,s])).values()].sort((a,b)=>a.session.localeCompare(b.session)||a.seq-b.seq);
const identity=(scope:SharedScope,kind:unknown,text:unknown,sources:SharedSource[])=>`sm-${hash([scope.kind,scope.id,kind,text,normalized(sources)])}`;

export class SharedMemoryStore {
  readonly root:string;readonly scope:SharedScope;
  constructor(options:{root:string;scope:SharedScope}) {this.root=resolve(options.root);this.scope=options.scope;}
  read():SharedProfile {
    const path=join(this.root,'context.jsonl');
    if(!existsSync(this.root))return {scope:this.scope,revision:-1,entries:[]};
    if(!statSync(this.root).isDirectory())throw new Error('Shared scope is not a directory.');
    if(existsSync(path) && (!statSync(path).isFile() || statSync(path).size>1024*1024))throw new Error('Shared context journal exceeds its limit or is not a file.');
    const events=new SessionStore({root:this.root}).read('context');
    if(events.length>1000)throw new Error('Shared context event limit exceeded.');
    const entries:SharedMemory[]=[];const ids=new Set<string>();
    for(const [index,e] of events.entries()) {
      const d=e.data;const invalid=():never=>{throw new Error(`Invalid shared context record at sequence ${e.seq}.`);};
      if(e.seq!==index+1 || e.kind!=='note' || e.subject!=='shared.memory' || !Number.isFinite(e.at) || !d || d.version!==1 || d.operation!=='create' || d.author!=='model' ||
         !text(d.text,4000) || !text(d.rationale,4000) || !['decision','constraint','question'].includes(String(d.kind)) ||
         (!d.scope || typeof d.scope!=='object' || (d.scope as SharedScope).kind!==this.scope.kind || (d.scope as SharedScope).id!==this.scope.id) || !Array.isArray(d.sources) || !d.sources.length || d.sources.length>20 ||
         !d.sources.every(s=>s && typeof s==='object' && text(s.session,128) && /^[A-Za-z0-9_-]+$/.test(s.session) && Number.isSafeInteger(s.seq) && s.seq>0))invalid();
      const sources=d.sources as SharedSource[];
      if(d.id!==identity(this.scope,d.kind,d.text,sources) || ids.has(String(d.id)))invalid();
      ids.add(String(d.id));entries.push({id:d.id as string,kind:d.kind as SharedMemory['kind'],text:d.text as string,rationale:d.rationale as string,sources,author:'model',revision:e.seq});
    }
    return {scope:this.scope,revision:events.at(-1)?.seq ?? -1,entries};
  }
  create(input:{kind:SharedMemory['kind'];text:string;rationale:string;sources:SharedSource[]},expected:number):{conflict:true}|{entry:SharedMemory;reused:boolean} {
    const current=this.read();const id=identity(this.scope,input.kind,input.text,input.sources);
    const prior=current.entries.find(e=>e.id===id);if(prior)return {entry:prior,reused:true};
    if(current.revision!==expected)return {conflict:true};
    if(current.entries.length>=1000)throw new Error('Shared context event limit exceeded.');
    const data={version:1,operation:'create',id,scope:this.scope,author:'model',kind:input.kind,text:input.text,rationale:input.rationale,sources:normalized(input.sources)};
    // Reject malformed inputs before creating the directory or journal.
    if(!text(input.text,4000)||!text(input.rationale,4000)||!['decision','constraint','question'].includes(input.kind)||!input.sources.length||input.sources.length>20||!input.sources.every(s=>text(s.session,128)&&/^[A-Za-z0-9_-]+$/.test(s.session)&&Number.isSafeInteger(s.seq)&&s.seq>0))throw new Error('Invalid shared memory input.');
    if(Buffer.byteLength(JSON.stringify(data),"utf8")+ (existsSync(join(this.root,'context.jsonl')) ? statSync(join(this.root,'context.jsonl')).size : 0)>1024*1024-1024)throw new Error('Shared context journal limit reached.');
    const store=new SessionStore({root:this.root});
    if(!existsSync(join(this.root,'context.jsonl'))){try{store.create('context',[]);}catch(cause){if(!existsSync(join(this.root,'context.jsonl')))throw cause;}}
    const event=store.appendIfCurrent('context',expected,{kind:'note',subject:'shared.memory',data,seq:expected<0 ? 1 : expected+1,at:Date.now()});
    if(!event)return {conflict:true};
    return {entry:{id,kind:input.kind,text:input.text,rationale:input.rationale,sources:data.sources,author:'model',revision:event.seq},reused:false};
  }
}

export class SharedContexts {
  readonly project:SharedMemoryStore;private readonly mounted:SharedMemoryStore[];
  constructor(options:{cwd:string;organizations?:string[]}) {
    if((options.organizations?.length ?? 0)>8)throw new Error('At most eight organization contexts can be mounted.');
    this.project=new SharedMemoryStore({root:join(options.cwd,'.cuesheet','shared'),scope:sharedScope('project',options.cwd)});
    this.mounted=[...new Set((options.organizations??[]).map(path=>resolve(path)))].map(root=>new SharedMemoryStore({root,scope:sharedScope('organization',root)}));
  }
  forProject(cwd:string):SharedContexts {return new SharedContexts({cwd,organizations:this.mounted.map(store=>store.root)});}
  read():SharedSnapshot {
    for(const mounted of this.mounted)if(!existsSync(mounted.root) || !existsSync(join(mounted.root,'context.jsonl')))throw new Error('An explicitly mounted organization context is unavailable.');
    const profiles=[this.project.read(),...this.mounted.map(store=>store.read())];return {profiles,digest:hash(profiles)};
  }
}
