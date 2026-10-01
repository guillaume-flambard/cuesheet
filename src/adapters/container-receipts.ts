/** Resource ownership receipts never change the business journal revision. */
import {existsSync,chmodSync,statSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {SessionStore} from './session-store.ts';
import type {Event} from '../core/store.ts';
export type ContainerReceipt={phase:'admitted';name:string;image:string;scope:string;intentSeq:number;inputDigest:string}|{phase:'cleanup';name:string;removed:boolean};
export interface OwnedContainer {name:string;image:string;scope:string;intentSeq:number;inputDigest:string;status:'uncertain'|'removed'}
export function projectContainers(events:readonly Event[]):OwnedContainer[]{
 const owned=new Map<string,OwnedContainer>();
 for(const [index,event] of events.entries()){
  const d=event.data;const invalid=():never=>{throw new Error('Invalid container resource journal.');};
  if(event.seq!==index+1||event.kind!=='note'||event.subject!=='tool.container'||!Number.isFinite(event.at)||d.version!==1||typeof d.name!=='string'||!/^cuesheet-tool-[a-f0-9-]{36}$/.test(d.name))invalid();
  const name=d.name as string;const prior=owned.get(name);
  if(d.phase==='admitted'){
   if(prior||typeof d.image!=='string'||! /^(?:sha256:|[a-z0-9][a-z0-9./:_-]*@sha256:)[a-f0-9]{64}$/.test(d.image)||typeof d.scope!=='string'||!isAbsolute(d.scope)||!Number.isSafeInteger(d.intentSeq)||Number(d.intentSeq)<1||typeof d.inputDigest!=='string'||! /^[a-f0-9]{64}$/.test(d.inputDigest))invalid();
   owned.set(name,{name,image:d.image as string,scope:d.scope as string,intentSeq:d.intentSeq as number,inputDigest:d.inputDigest as string,status:'uncertain'});
  }else if(d.phase==='cleanup'){
   if(!prior||prior.status==='removed'||typeof d.removed!=='boolean')invalid();
   owned.set(name,{...prior!,status:d.removed?'removed':'uncertain'});
  }else invalid();
 }
 return [...owned.values()];
}
export class SessionContainers {
 private readonly name:string;
 private readonly options:{root:string;sessionId:string;assertWritable?:()=>void};
 constructor(options:{root:string;sessionId:string;assertWritable?:()=>void}){
  this.options=options;
  if(!/^t-[A-Za-z0-9_-]+$/.test(options.sessionId))throw new Error('Invalid container session identity.');this.name=options.sessionId+'.containers';
 }
 private events():Event[]{const path=join(this.options.root,this.name+'.jsonl');if(!existsSync(path))return [];if(statSync(path).size>1024*1024)throw new Error('Container journal exceeds its limit.');const events=new SessionStore({root:this.options.root}).read(this.name);if(events.length>=10000)throw new Error('Container journal exceeds its limit.');return events;}
 read():OwnedContainer[]{return projectContainers(this.events());}
 record(receipt:ContainerReceipt):void{
  this.options.assertWritable?.();const events=this.events();const data={version:1,...receipt};
  projectContainers([...events,{kind:'note',subject:'tool.container',seq:events.length+1,at:Date.now(),data}]);
  const store=new SessionStore({root:this.options.root});const path=join(this.options.root,this.name+'.jsonl');
  if(!existsSync(path)){store.create(this.name,[]);chmodSync(path,0o600);}
  store.append(this.name,{kind:'note',subject:'tool.container',at:Date.now(),data});
 }
}
