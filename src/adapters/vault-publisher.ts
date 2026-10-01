/** Share a sourced draft without promoting it to goal, permission or evidence. */
import {createHash} from 'node:crypto';
import type {Event} from '../core/store.ts';
import {projectObjectives} from './objectives.ts';
import {projectOrganization} from './work-organizer.ts';
import {VaultStore,VaultConflict,type VaultVersion} from './vault.ts';
export type VaultPublication={status:'absent'|'refused'|'conflict'}|{status:'published'|'unchanged'|'protected';document:VaultVersion};
export class ProjectVaultPublisher {
 private readonly options:{root:string;scope:string;sessionId:string;assertWritable:()=>void};
 constructor(options:{root:string;scope:string;sessionId:string;assertWritable:()=>void}){
  if(!/^t-[A-Za-z0-9_-]+$/.test(options.sessionId))throw new Error('Invalid Vault publisher session.');this.options={...options};
 }
 sync(events:readonly Event[]):VaultPublication{
  const objective=projectObjectives(events).current;const plan=projectOrganization(events).plan;
  if(!objective||!plan||!plan.current||typeof plan.spec!=='string'||!plan.spec.trim())return {status:'absent'};
  const source=events.find(event=>event.seq===objective.sources[0]);
  if(objective.id.startsWith('legacy-')||objective.scope!==this.options.scope||objective.author!=='human'||!source||source.kind!=='note'||source.subject!=='terminal.user'||source.data.operation!==undefined||source.data.text!==objective.originalText)return {status:'refused'};
  this.options.assertWritable();
  const vault=new VaultStore({root:this.options.root});const state=vault.read();
  const id='draft-'+createHash('sha256').update(JSON.stringify([this.options.sessionId,objective.id])).digest('hex').slice(0,32);
  const current=state.documents.find(document=>document.id===id);
  const prefix=`session=${this.options.sessionId};plan=`;const suffix=`;objective=${objective.id}@${objective.revision}`;
  const reference=prefix+plan.revision+suffix;if(reference.length>512)return {status:'refused'};
  if(current && (current.source.author!=='model'||!current.active||!current.source.reference.startsWith(prefix)))return {status:'protected',document:current};
  const title=objective.text.slice(0,512);
  if(current?.title===title&&current.text===plan.spec&&current.source.reference.endsWith(suffix))return {status:'unchanged',document:current};
  try{
   const document=vault.write({id,title,text:plan.spec,active:true,source:{author:'model',reference},expectedDocument:current?.revision??null},state.revision);
   return {status:'published',document};
  }catch(error){if(error instanceof VaultConflict)return {status:'conflict'};throw error;}
 }
}
