/** Shared scopes are append-only sources; no scope grants tool or completion authority, and access rights live in a separate controller grant registry. */
import {existsSync,statSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {SessionStore} from "./session-store.ts";
export interface SharedScope {kind:"project"|"organization";id:string;}
export interface SharedSource {session:string;seq:number;}
export interface SharedCorrection {operation:"edit"|"resolve";text:string;source:SharedSource;revision:number;expectedItem:number;}
export interface SharedMemory {id:string;kind:"decision"|"constraint"|"question";text:string;rationale:string;sources:SharedSource[];author:"model"|"human";revision:number;active:boolean;originalText:string;corrections:SharedCorrection[];}
export interface SharedProfile {scope:SharedScope;revision:number;entries:SharedMemory[];}
export interface SharedSnapshot {digest:string;profiles:SharedProfile[];}
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const text=(v:unknown,max:number):v is string=>typeof v==="string" && !!v.trim() && v.length<=max;
const sourceValid=(s:unknown):s is SharedSource=>!!s && typeof s==='object' && text((s as SharedSource).session,128) && /^[A-Za-z0-9_-]+$/.test((s as SharedSource).session) && Number.isSafeInteger((s as SharedSource).seq) && (s as SharedSource).seq>0;
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
    const entries=new Map<string,SharedMemory>();const humanSources=new Set<string>();
    for(const [index,e] of events.entries()) {
      const d=e.data;const invalid=():never=>{throw new Error(`Invalid shared context record at sequence ${e.seq}.`);};
      if(e.seq!==index+1 || e.kind!=='note' || e.subject!=='shared.memory' || !Number.isFinite(e.at) || !d || d.version!==1 ||
         !d.scope || typeof d.scope!=='object' || (d.scope as SharedScope).kind!==this.scope.kind || (d.scope as SharedScope).id!==this.scope.id)invalid();
      if(d.operation==='create') {
        if(d.author!=='model' || !text(d.text,4000) || !text(d.rationale,4000) || !['decision','constraint','question'].includes(String(d.kind)) ||
          !Array.isArray(d.sources) || !d.sources.length || d.sources.length>20 || !d.sources.every(sourceValid))invalid();
        const sources=d.sources as SharedSource[];
        if(d.id!==identity(this.scope,d.kind,d.text,sources) || entries.has(String(d.id)))invalid();
        entries.set(String(d.id),{id:d.id as string,kind:d.kind as SharedMemory['kind'],text:d.text as string,rationale:d.rationale as string,sources,author:'model',revision:e.seq,active:true,originalText:d.text as string,corrections:[]});
      } else if(d.operation==='edit' || d.operation==='resolve') {
        const prior=entries.get(String(d.id));
        if(!prior || d.author!=='human' || d.expectedItem!==prior.revision || d.expectedScope!==e.seq-1 || !text(d.text,4000) || !sourceValid(d.source))invalid();
        const source=d.source as SharedSource;const key=`${source.session}:${source.seq}`;
        if(humanSources.has(key))invalid();humanSources.add(key);
        entries.set(prior!.id,{...prior!,text:d.text as string,author:'human',active:d.operation==='edit',revision:e.seq,
          corrections:[...prior!.corrections,{operation:d.operation,text:d.text as string,source,revision:e.seq,expectedItem:prior!.revision}]});
      } else invalid();
    }
    return {scope:this.scope,revision:events.at(-1)?.seq ?? -1,entries:[...entries.values()]};
  }
  create(input:{kind:SharedMemory['kind'];text:string;rationale:string;sources:SharedSource[]},expected:number):{conflict:true}|{entry:SharedMemory;reused:boolean} {
    const current=this.read();const id=identity(this.scope,input.kind,input.text,input.sources);
    const prior=current.entries.find(e=>e.id===id);if(prior)return {entry:prior,reused:true};
    if(current.revision!==expected)return {conflict:true};
    if(current.revision>=1000)throw new Error('Shared context event limit exceeded.');
    const data={version:1,operation:'create',id,scope:this.scope,author:'model',kind:input.kind,text:input.text,rationale:input.rationale,sources:normalized(input.sources)};
    // Reject malformed inputs before creating the directory or journal.
    if(!text(input.text,4000)||!text(input.rationale,4000)||!['decision','constraint','question'].includes(input.kind)||!input.sources.length||input.sources.length>20||!input.sources.every(s=>text(s.session,128)&&/^[A-Za-z0-9_-]+$/.test(s.session)&&Number.isSafeInteger(s.seq)&&s.seq>0))throw new Error('Invalid shared memory input.');
    if(Buffer.byteLength(JSON.stringify(data),"utf8")+ (existsSync(join(this.root,'context.jsonl')) ? statSync(join(this.root,'context.jsonl')).size : 0)>1024*1024-1024)throw new Error('Shared context journal limit reached.');
    const store=new SessionStore({root:this.root});
    if(!existsSync(join(this.root,'context.jsonl'))){try{store.create('context',[]);}catch(cause){if(!existsSync(join(this.root,'context.jsonl')))throw cause;}}
    const event=store.appendIfCurrent('context',expected,{kind:'note',subject:'shared.memory',data,seq:expected<0 ? 1 : expected+1,at:Date.now()});
    if(!event)return {conflict:true};
    return {entry:{id,kind:input.kind,text:input.text,rationale:input.rationale,sources:data.sources,author:'model',revision:event.seq,active:true,originalText:input.text,corrections:[]},reused:false};
  }
  /** Trusted human correction; no model tool is wired to this operation. */
  correct(input:{id:string;revision:number;operation:"edit"|"resolve";text:string;source:SharedSource},expected:number):{conflict:true}|{entry:SharedMemory;reused:boolean} {
    if(!text(input.id,128) || !Number.isSafeInteger(input.revision) || !['edit','resolve'].includes(input.operation) || !text(input.text,4000) || !sourceValid(input.source))throw new Error('Invalid shared correction input.');
    const current=this.read();
    const repeated=current.entries.flatMap(entry=>entry.corrections.map(correction=>({entry,correction}))).find(({correction})=>correction.source.session===input.source.session && correction.source.seq===input.source.seq);
    if(repeated){if(repeated.entry.id!==input.id || repeated.correction.operation!==input.operation || repeated.correction.text!==input.text || repeated.correction.expectedItem!==input.revision)throw new Error('Shared correction source already used.');return {entry:repeated.entry,reused:true};}
    const prior=current.entries.find(entry=>entry.id===input.id);
    if(!prior || prior.revision!==input.revision || current.revision!==expected)return {conflict:true};
    if(current.revision>=1000)throw new Error('Shared context event limit exceeded.');
    const data={version:1,operation:input.operation,id:input.id,scope:this.scope,author:'human',expectedItem:input.revision,expectedScope:expected,text:input.text,source:input.source};
    const path=join(this.root,'context.jsonl');
    if(Buffer.byteLength(JSON.stringify(data),'utf8')+statSync(path).size>1024*1024-1024)throw new Error('Shared context journal limit reached.');
    const event=new SessionStore({root:this.root}).appendIfCurrent('context',expected,{kind:'note',subject:'shared.memory',data,seq:expected+1,at:Date.now()});
    if(!event)return {conflict:true};
    return {entry:{...prior,text:input.text,author:'human',active:input.operation==='edit',revision:event.seq,
      corrections:[...prior.corrections,{operation:input.operation,text:input.text,source:input.source,revision:event.seq,expectedItem:input.revision}]},reused:false};
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
  /** Controller projection for inference. It carries no principal identity and grants nothing. */
  read():SharedSnapshot {
    for(const mounted of this.mounted)if(!existsSync(mounted.root) || !existsSync(join(mounted.root,'context.jsonl')))throw new Error('An explicitly mounted organization context is unavailable.');
    const profiles=[this.project.read(),...this.mounted.map(store=>store.read())];return {profiles,digest:hash(profiles)};
  }
  /** The sources a grant registry can govern: project scope first, then the explicit mounts. */
  stores():readonly SharedMemoryStore[] {return [this.project,...this.mounted];}
}

// Grants are a separate controller authority. The journal and every record are
// sources: they never carry a right, and nothing in this module derives one
// from content. Search and read are the only doors a principal has, and each
// asks the registry before opening a journal and again after projection, so a
// revocation lands on the very next call instead of surviving in a cached or
// in-flight path.
export type SharedOperation="search"|"read";
export type SharedRealm="enterprise"|"team"|"project"|"personal";
export interface SharedGrant {principal:string;realm:SharedRealm;scope:SharedScope;operations:SharedOperation[];}
export interface SharedReference {scope:SharedScope;id:string;revision:number;}
export interface SharedScopeStore {readonly scope:SharedScope;read():SharedProfile;}
export interface SharedSearchHit {scope:SharedScope;entry:SharedMemory;score:number;passage:string;}
export interface SharedSearchResult {digest:string;hits:SharedSearchHit[];}
const REALMS:readonly SharedRealm[]=["enterprise","team","project","personal"];
const OPERATIONS:readonly SharedOperation[]=["search","read"];
const scopeKey=(scope:SharedScope)=>`${scope.kind}:${scope.id}`;
const sameScope=(a:SharedScope,b:SharedScope)=>a.kind===b.kind&&a.id===b.id;
const validScope=(scope:unknown):scope is SharedScope=>!!scope && typeof scope==='object' && ["project","organization"].includes((scope as SharedScope).kind) && text((scope as SharedScope).id,128) && /^[A-Za-z0-9_-]+$/.test((scope as SharedScope).id);
const grantKey=(principal:string,realm:SharedRealm,scope:SharedScope)=>`${principal}\u0000${realm}\u0000${scopeKey(scope)}`;
const queryTerms=(query:string)=>[...new Set(query.toLocaleLowerCase('en').match(/[\p{L}\p{N}_]{2,}/gu)??[])];

/** The controller's access registry: grants are issued and revoked here, never inherited and never cached. */
export class SharedGrants {
  private readonly live=new Map<string,SharedGrant>();
  /** Adds operations to the grant of one principal, in one realm, for one scope. */
  grant(input:{principal:string;realm:SharedRealm;scope:SharedScope;operations:readonly SharedOperation[]}):void {
    if(!text(input.principal,256))throw new Error('Invalid shared grant principal.');
    if(!REALMS.includes(input.realm))throw new Error('Invalid shared grant realm.');
    if(!validScope(input.scope))throw new Error('Invalid shared grant scope.');
    if(!input.operations.length || !input.operations.every(operation=>OPERATIONS.includes(operation)) || new Set(input.operations).size!==input.operations.length)throw new Error('Invalid shared grant operations.');
    const key=grantKey(input.principal,input.realm,input.scope);
    const prior=this.live.get(key);
    this.live.set(key,{principal:input.principal,realm:input.realm,scope:{...input.scope},operations:[...new Set([...(prior?.operations??[]),...input.operations])]});
  }
  /** The explicit revocation path: drop every operation, only the named ones, one scope, or the whole principal. */
  revoke(input:{principal:string;scope?:SharedScope;operations?:readonly SharedOperation[]}):void {
    if(!text(input.principal,256))throw new Error('Invalid shared grant principal.');
    if(input.scope!==undefined && !validScope(input.scope))throw new Error('Invalid shared grant scope.');
    if(input.operations!==undefined && (!input.operations.length || !input.operations.every(operation=>OPERATIONS.includes(operation))))throw new Error('Invalid shared grant operations.');
    for(const [key,grant] of [...this.live]) {
      if(grant.principal!==input.principal || (input.scope!==undefined && !sameScope(grant.scope,input.scope)))continue;
      if(input.operations===undefined){this.live.delete(key);continue;}
      const kept=grant.operations.filter(operation=>!input.operations!.includes(operation));
      if(kept.length)this.live.set(key,{...grant,operations:kept});else this.live.delete(key);
    }
  }
  /** A live lookup on every call. No snapshot, no memo, so a revoked grant answers false immediately. */
  allows(principal:string,realm:SharedRealm,scope:SharedScope,operation:SharedOperation):boolean {
    const grant=this.live.get(grantKey(principal,realm,scope));
    return !!grant && grant.operations.includes(operation);
  }
}

/** The only principal-facing door: every search and read asks the registry before IO and again before returning. */
export class SharedRetrieval {
  private readonly principal:string;private readonly realm:SharedRealm;private readonly grants:SharedGrants;private readonly stores:readonly SharedScopeStore[];
  constructor(options:{principal:string;realm:SharedRealm;grants:SharedGrants;stores:readonly SharedScopeStore[]}) {
    if(!text(options.principal,256))throw new Error('Invalid shared access principal.');
    if(!REALMS.includes(options.realm))throw new Error('Invalid shared access realm.');
    if(!options.grants)throw new Error('Shared access requires a grant authority.');
    const seen=new Set<string>();
    for(const store of options.stores) {
      if(!store || !validScope(store.scope) || typeof store.read!=='function')throw new Error('Invalid shared access scope.');
      if(seen.has(scopeKey(store.scope)))throw new Error('Duplicate shared access scope.');
      seen.add(scopeKey(store.scope));
    }
    this.principal=options.principal;this.realm=options.realm;this.grants=options.grants;this.stores=[...options.stores];
  }
  /** A denied scope contributes nothing at all: no hit, no count, and no digest, so its data leaves no trace. */
  search(query:string,topK=5):SharedSearchResult {
    if(!text(query,2048) || !Number.isSafeInteger(topK) || topK<1 || topK>20)throw new Error('Invalid shared memory search.');
    const wanted=queryTerms(query);const hits:SharedSearchHit[]=[];const bases:{scope:string;revision:number;entries:string[]}[]=[];
    for(const store of this.stores) {
      if(!this.grants.allows(this.principal,this.realm,store.scope,'search'))continue;
      const profile=store.read();
      if(!this.grants.allows(this.principal,this.realm,store.scope,'search'))throw new Error('Shared memory search authorization changed.');
      bases.push({scope:scopeKey(store.scope),revision:profile.revision,entries:profile.entries.map(entry=>`${entry.id}@${entry.revision}`)});
      for(const entry of profile.entries) {
        const body=entry.text.toLocaleLowerCase('en');const rationale=entry.rationale.toLocaleLowerCase('en');
        const matched=wanted.filter(term=>body.includes(term) || rationale.includes(term));
        if(!matched.length)continue;
        const at=Math.max(0,body.indexOf(matched[0]??'')-120);
        hits.push({scope:store.scope,entry,score:matched.length,passage:entry.text.slice(at,at+240)});
      }
    }
    // A later journal read may carry a revocation for a scope read earlier in this same call.
    for(const store of this.stores)if(bases.some(base=>base.scope===scopeKey(store.scope)) && !this.grants.allows(this.principal,this.realm,store.scope,'search'))throw new Error('Shared memory search authorization changed.');
    hits.sort((a,b)=>b.score-a.score || b.entry.revision-a.entry.revision);
    return {digest:hash(bases),hits:hits.slice(0,topK)};
  }
  read(scope:SharedScope):SharedProfile {
    const store=this.declared(scope);
    if(!store || !this.grants.allows(this.principal,this.realm,store.scope,'read'))throw new Error('Shared memory read is not authorized.');
    const profile=store.read();
    if(!this.grants.allows(this.principal,this.realm,store.scope,'read'))throw new Error('Shared memory read authorization changed.');
    return profile;
  }
  /** An old reference is only a lookup key: revocation refuses it like any other read. */
  readReference(reference:SharedReference):SharedMemory {
    const store=this.declared(reference.scope);
    if(!store || !this.grants.allows(this.principal,this.realm,store.scope,'read'))throw new Error('Shared memory read is not authorized.');
    const profile=store.read();
    if(!this.grants.allows(this.principal,this.realm,store.scope,'read'))throw new Error('Shared memory read authorization changed.');
    const found=profile.entries.find(entry=>entry.id===reference.id && entry.revision===reference.revision);
    if(!found)throw new Error('Shared memory reference not found.');
    return found;
  }
  /** An undeclared scope is refused with the same message as a denied one, so a scope cannot be probed. */
  private declared(scope:SharedScope):SharedScopeStore|undefined {
    if(!validScope(scope))return undefined;
    return this.stores.find(store=>sameScope(store.scope,scope));
  }
}
