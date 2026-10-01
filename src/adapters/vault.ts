/** Canonical local documents; retrieval is a disposable projection, never policy. */
import {existsSync,statSync,chmodSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {SessionStore} from './session-store.ts';
import type {Event} from '../core/store.ts';
export interface VaultSource {author:'human'|'model';reference:string}
export interface VaultVersion {id:string;revision:number;title:string;text:string;active:boolean;source:VaultSource;digest:string}
export interface VaultWrite {id:string;title:string;text:string;active:boolean;source:VaultSource;expectedDocument:number|null}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max&&!value.includes('\0');
export function projectVault(events:readonly Event[]):{documents:VaultVersion[];history:VaultVersion[];revision:number}{
 const documents=new Map<string,VaultVersion>();const history:VaultVersion[]=[];
 for(const [index,event] of events.entries()){
  const d=event.data;const source=d.source as Partial<VaultSource>|undefined;const prior=typeof d.id==='string'?documents.get(d.id):undefined;
  if(event.seq!==index+1||event.kind!=='note'||event.subject!=='vault.document'||!Number.isFinite(event.at)||d.version!==1||typeof d.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(d.id)||!text(d.title,512)||!d.title.trim()||!text(d.text,65536)||typeof d.active!=='boolean'||!source||!['human','model'].includes(String(source.author))||!text(source.reference,512)||!source.reference.trim()||d.expectedDocument!==(prior?.revision??null))throw new Error('Invalid Vault journal.');
  const value={id:d.id,revision:event.seq,title:d.title,text:d.text,active:d.active,source:{author:source.author as 'human'|'model',reference:source.reference}};
  const version={...value,digest:digest(value)};documents.set(value.id,version);history.push(version);
 }
 return {documents:[...documents.values()],history,revision:events.at(-1)?.seq??-1};
}
export class VaultConflict extends Error {constructor(){super("Vault scope revision conflict.");this.name="VaultConflict";}}
export class VaultStore {
 private readonly root:string;
 constructor(options:{root:string}){this.root=options.root;}
 private events():Event[]{const path=join(this.root,'documents.jsonl');if(!existsSync(path))return [];if(statSync(path).size>16*1024*1024)throw new Error('Vault journal exceeds its limit.');const events=new SessionStore({root:this.root}).read('documents');if(events.length>10000)throw new Error('Vault journal exceeds its limit.');return events;}
 read(){return projectVault(this.events());}
 write(input:VaultWrite,expectedRevision:number):VaultVersion{
  const events=this.events();if((events.at(-1)?.seq??-1)!==expectedRevision)throw new VaultConflict();
  const data={version:1,...input};const projected=projectVault([...events,{seq:events.length+1,at:Date.now(),kind:'note',subject:'vault.document',data}]);
  const store=new SessionStore({root:this.root});const path=join(this.root,'documents.jsonl');
  if(!existsSync(path)){store.create('documents',[]);chmodSync(path,0o600);}
  if(!store.appendIfCurrent('documents',expectedRevision,{seq:events.length+1,kind:'note',subject:'vault.document',at:Date.now(),data}))throw new VaultConflict();
  return projected.history.at(-1)!;
 }
}
export interface VaultHit {id:string;revision:number;digest:string;title:string;source:VaultSource;score:number;passage:string}
const tokens=(value:string)=>[...new Set(value.toLocaleLowerCase('en').match(/[\p{L}\p{N}_]{2,}/gu)??[])];
/** Rebuild from canonical current versions; no persisted index or embeddings. */
export function searchVault(documents:readonly VaultVersion[],query:string,topK=5):VaultHit[]{
 if(!text(query,2048)||!Number.isSafeInteger(topK)||topK<1||topK>20)throw new Error('Invalid Vault search.');
 const terms=tokens(query);if(!terms.length)return [];
 return documents.filter(d=>d.active).map(d=>{
  const titleTokens=new Set(tokens(d.title)),bodyTokens=new Set(tokens(d.text));const score=terms.reduce((sum,t)=>sum+(titleTokens.has(t)?3:0)+(bodyTokens.has(t)?1:0),0);
  const first=d.text.toLocaleLowerCase('en').indexOf(terms.find(t=>bodyTokens.has(t))??'');const start=Math.max(0,first-120);
  return {id:d.id,revision:d.revision,digest:d.digest,title:d.title,source:{...d.source},score,passage:d.text.slice(start,start+1000)};
 }).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id,'en')).slice(0,topK);
}
export interface VaultScope {kind:'enterprise'|'team'|'project'|'personal';id:string;root:string}
export interface VaultReference {scope:string;id:string;revision:number;digest:string}
export type ScopedVaultHit=VaultHit & {scope:string;kind:VaultScope['kind']};
export interface VaultSnapshot {digest:string;hits:ScopedVaultHit[]}
/** The caller supplies trusted identity and authorization; documents cannot grant access. */
export class VaultRetrieval {
 private readonly principal:string;
 private readonly scopes:readonly VaultScope[];
 private readonly authorize:(principal:string,scope:Readonly<VaultScope>,operation:'search'|'read')=>boolean;
 constructor(options:{principal:string;scopes:readonly VaultScope[];authorize:(principal:string,scope:Readonly<VaultScope>,operation:'search'|'read')=>boolean}){
  if(!text(options.principal,256)||!options.principal||new Set(options.scopes.map(s=>s.id)).size!==options.scopes.length)throw new Error('Invalid Vault access configuration.');
  this.principal=options.principal;this.scopes=options.scopes.map(scope=>Object.freeze({...scope}));this.authorize=options.authorize;
  for(const scope of this.scopes)if(!['enterprise','team','project','personal'].includes(scope.kind)||!text(scope.id,128)||!scope.id||!isAbsolute(scope.root)||scope.root.includes('\0'))throw new Error('Invalid Vault scope.');
 }
 search(query:string,topK=5):ScopedVaultHit[]{return this.snapshot(query,topK).hits;}
 snapshot(query:string,topK=5):VaultSnapshot{
  // Validate even if no scope is admitted.
  searchVault([],query,topK);const hits:ScopedVaultHit[]=[];const bases:{scope:string;revision:number;versions:string[]}[]=[];
  for(const scope of this.scopes){
   if(this.authorize(this.principal,scope,'search')!==true||this.authorize(this.principal,scope,'read')!==true)continue;
   const state=new VaultStore({root:scope.root}).read();const found=searchVault(state.documents,query,topK);bases.push({scope:scope.id,revision:state.revision,versions:state.documents.map(d=>d.digest)});
   if(this.authorize(this.principal,scope,'search')!==true||this.authorize(this.principal,scope,'read')!==true)throw new Error('Vault search authorization changed.');
   hits.push(...found.map(hit=>({...hit,scope:scope.id,kind:scope.kind})));
  }
  // Recheck earlier scopes too: a later read may overlap a revocation.
  for(const scope of this.scopes)if(bases.some(base=>base.scope===scope.id)&&(this.authorize(this.principal,scope,'search')!==true||this.authorize(this.principal,scope,'read')!==true))throw new Error('Vault search authorization changed.');
  return {digest:digest(bases),hits:hits.sort((a,b)=>b.score-a.score||a.scope.localeCompare(b.scope,'en')||a.id.localeCompare(b.id,'en')).slice(0,topK)};
 }
 read(reference:VaultReference):VaultVersion{
  const scope=this.scopes.find(scope=>scope.id===reference.scope);
  if(!scope||this.authorize(this.principal,scope,'read')!==true)throw new Error('Vault read is not authorized.');
  const state=new VaultStore({root:scope.root}).read();
  if(this.authorize(this.principal,scope,'read')!==true)throw new Error('Vault read authorization changed.');
  const found=state.history.find(version=>version.id===reference.id&&version.revision===reference.revision&&version.digest===reference.digest);
  if(!found)throw new Error('Vault reference not found.');return {...found,source:{...found.source}};
 }
}
