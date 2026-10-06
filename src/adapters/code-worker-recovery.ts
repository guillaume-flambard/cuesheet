import {createHash} from 'node:crypto';
import {existsSync,lstatSync,opendirSync,readFileSync,realpathSync} from 'node:fs';
import {opendir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {Event,NewEvent} from '../core/store.ts';
import {SessionStore} from './session-store.ts';
import {projectEffectAttempts} from './tool-receipts.ts';
import {captureGitSnapshot} from './git-snapshot.ts';
import {inspectAgentGit} from './agent-git.ts';
import {TerminalSession} from './terminal-session.ts';

const MAX_JOURNAL_BYTES=2*1024*1024;
const MAX_CONTROLLER_EVENTS=20_000;
const MAX_PRIVATE_DIRECTORY_ENTRIES=256;
const MAX_RECOVERY_OUTPUT_CHARS=16_384;
const MAX_WORKERS=2;
const WORKER_ID=/^w-[a-f0-9-]{36}$/;
const SESSION_ID=/^t-[A-Za-z0-9_-]{1,120}$/;
const EVENT_KINDS=new Set(['goal','capability','directive','observation','action','evidence','model','note','effect_requested','effect_observed','work_produced','work_verified']);

export type CodeWorkerRecoveryPhase='interrupted'|'proposal-recoverable'|'proposal-published'|'integrated'|'effect-uncertain'|'live'|'stale'|'blocked';
export interface CodeWorkerRecoveryWorker {
  id:string;
  role:string;
  task:string;
  phase:CodeWorkerRecoveryPhase;
  reason:string;
  admissionSeq:number|null;
  agentSeq:number|null;
  workerSeq:number|null;
  objectiveId:string;
  objectiveRevision:number;
  source:string;
  sourceDigest:string;
  base:string;
  workspace:string;
  journal:string;
  journalRoot:string;
  effectCount:number;
  uncertainEffects:number;
  proposalSeq:number|null;
  proposalDigest:string|null;
  /** Private, bounded final proposal. Never serialize this as an inspection result. */
  proposalText?:string;
  proposalSteps?:number;
}
export interface CodeWorkerRecoverySnapshot {
  kind:'none'|'inspected'|'blocked';
  batch:string|null;
  objectiveId:string|null;
  objectiveRevision:number|null;
  sourceDigest:string|null;
  workers:CodeWorkerRecoveryWorker[];
  reason:string;
}

const safeText=(value:unknown,max=512):string=>typeof value==='string'?value.slice(0,max):'';
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const eventData=(event:Event|undefined):Record<string,unknown>|undefined=>event&&isObject(event.data)?event.data:undefined;
const lastEvent=(events:readonly Event[],predicate:(event:Event)=>boolean):Event|undefined=>{for(let i=events.length-1;i>=0;i--)if(predicate(events[i]!))return events[i];return undefined;};
function validEventSequence(events:readonly Event[]):boolean{
  return events.every((event,index)=>event&&event.seq===index+1&&Number.isFinite(event.at)&&EVENT_KINDS.has(event.kind)&&typeof event.subject==='string'&&isObject(event.data));
}
function pidState(pid:number):boolean|null{
  try{process.kill(pid,0);return true;}catch(error){const code=(error as NodeJS.ErrnoException).code;if(code==='ESRCH')return false;if(code==='EPERM')return true;return null;}
}
function canonicalDirectory(path:string):string|null{
  try{const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink())return null;const actual=realpathSync(path);return actual===resolve(path)?actual:null;}catch{return null;}
}
function canonicalRegular(path:string,limit:number):boolean{
  try{const stat=lstatSync(path);return stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=limit&&realpathSync(path)===resolve(path);}catch{return false;}
}
async function boundedDirectoryNames(root:string):Promise<string[]|null>{
  let directory;
  try{
    directory=await opendir(root);
    const names:string[]=[];
    for(;;){
      const entry=await directory.read();
      if(!entry)break;
      names.push(entry.name);
      if(names.length>MAX_PRIVATE_DIRECTORY_ENTRIES)return null;
    }
    return names;
  }catch{return null;}
  finally{await directory?.close().catch(()=>{});}
}
function ownedWriterClaim(root:string,id:string):string|null{
  try{
    const names:string[]=[];let directory=opendirSync(root);
    try{for(;;){const entry=directory.readSync();if(!entry)break;names.push(entry.name);if(names.length>MAX_PRIVATE_DIRECTORY_ENTRIES)return null;}}
    finally{directory.closeSync();}
    const prefix=`${id}.writer-`,claims=names.filter(name=>name.startsWith(prefix)&&name.endsWith('.lock'));
    if(claims.length!==1)return null;
    const match=new RegExp(`^${id}\\.writer-(${process.pid})-([a-f0-9-]{36})\\.lock$`).exec(claims[0]!);
    if(!match)return null;
    const path=join(root,claims[0]!);const stat=lstatSync(path);
    return stat.isFile()&&!stat.isSymbolicLink()&&realpathSync(path)===resolve(path)?path:null;
  }catch{return null;}
}
function readMetadata(root:string,id:string):{id:string;cwd:string}|null{
  const path=join(root,`${id}.meta.json`);if(!canonicalRegular(path,16*1024))return null;
  try{const value=JSON.parse(readFileSync(path,'utf8')) as Record<string,unknown>;
    return value.version===1&&value.id===id&&typeof value.cwd==='string'&&value.cwd.startsWith('/')&&Number.isFinite(value.createdAt)?{id,cwd:value.cwd}:null;
  }catch{return null;}
}
async function privateJournal(options:{root:string;id:string;workspace:string;ownedClaimPath?:string}):Promise<{events:Event[];effects:ReturnType<typeof projectEffectAttempts>}|{blocked:string}>{
  const root=canonicalDirectory(options.root);if(!root)return {blocked:'Private journal root is missing, redirected, or not a directory.'};
  const metadata=readMetadata(root,options.id);if(!metadata||metadata.cwd!==options.workspace)return {blocked:'Private journal metadata is missing, malformed, or bound to another workspace.'};
  const sessionFile=join(root,`${options.id}.jsonl`),viewFile=join(root,`${options.id}.view.jsonl`);
  if(!canonicalRegular(sessionFile,MAX_JOURNAL_BYTES)||!canonicalRegular(viewFile,MAX_JOURNAL_BYTES))return {blocked:'Private journal or view journal is missing, oversized, or not a regular owned file.'};
  const names=await boundedDirectoryNames(root);
  if(!names)return {blocked:'Private journal directory exceeds the bounded entry limit or cannot be read.'};
  let sawOwnedClaim=false;
  try{
    for(const name of names){
      const prefix=`${options.id}.writer-`;if(!name.startsWith(prefix))continue;
      if(!name.endsWith('.lock'))return {blocked:'Private writer claim has an unknown name; preserve and inspect it.'};
      const match=new RegExp(`^${options.id}\\.writer-(\\d+)-([a-f0-9-]{36})\\.lock$`).exec(name);
      if(!match)return {blocked:'Private writer claim is malformed; preserve and inspect it.'};
      const path=join(root,name);const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())return {blocked:'Private writer claim is not an owned regular file.'};
      const alive=pidState(Number(match[1]));if(alive===null)return {blocked:'Private writer liveness is unknown; preserve and inspect it.'};
      if(path===options.ownedClaimPath){if(Number(match[1])!==process.pid||!alive)return {blocked:'Exclusive private writer claim could not be attested.'};sawOwnedClaim=true;continue;}
      if(alive)return {blocked:'Private journal is currently claimed by a live writer.'};
    }
  }catch{return {blocked:'Private writer claims could not be attested.'};}
  if(options.ownedClaimPath&&!sawOwnedClaim)return {blocked:'Exclusive private writer claim disappeared during validation.'};
  try{
    // SessionStore.attest is read-only. Check the canonical root and files above
    // before constructing it so inspection does not create a missing journal.
    const store=new SessionStore({root});
    const core=store.attest(options.id),view=store.attest(`${options.id}.view`);
    if(core.damage||view.damage||!validEventSequence(core.events)||!validEventSequence(view.events))return {blocked:'Private journal is truncated, malformed, or out of sequence.'};
    const effects=projectEffectAttempts(core.events);
     return {events:core.events,effects};
  }catch{return {blocked:'Private journal events or effect receipts are invalid.'};}
}
function pendingBatches(events:readonly Event[]):Event[]{
  const latest=new Map<string,Event>();
  for(const event of events)if(event.kind==='note'&&event.subject==='terminal.code-workers'&&typeof event.data.batch==='string')latest.set(event.data.batch,event);
  return [...latest.values()].filter(event=>event.data.phase==='ready'||Array.isArray(event.data.preserved)&&event.data.preserved.length>0||['preparing','prepared'].includes(String(event.data.phase))).sort((a,b)=>a.seq-b.seq);
}
function baseWorker(id:string):CodeWorkerRecoveryWorker{return {id,role:'unknown',task:'',phase:'blocked',reason:'Worker provenance is incomplete.',admissionSeq:null,agentSeq:null,workerSeq:null,objectiveId:'',objectiveRevision:0,source:'',sourceDigest:'',base:'',workspace:'',journal:'',journalRoot:'',effectCount:0,uncertainEffects:0,proposalSeq:null,proposalDigest:null};}

/** Read-only, bounded inspection derived exclusively from a controller journal. */
export async function inspectCodeWorkerRecovery(options:{events:readonly Event[];parentRoot:string;parentId:string;worktreeRoot:string;source:string;objective:{id:string;revision:number};signal?:AbortSignal;ownedClaimPaths?:ReadonlyMap<string,string>}):Promise<CodeWorkerRecoverySnapshot>{
  if(options.events.length>MAX_CONTROLLER_EVENTS)return {kind:'blocked',batch:null,objectiveId:null,objectiveRevision:null,sourceDigest:null,workers:[],reason:'Controller history exceeds the bounded recovery input; preserve it and inspect offline.'};
  const pending=pendingBatches(options.events);
  if(!pending.length)return {kind:'none',batch:null,objectiveId:null,objectiveRevision:null,sourceDigest:null,workers:[],reason:'No pending controller-owned code-worker batch.'};
  if(pending.length!==1)return {kind:'blocked',batch:null,objectiveId:null,objectiveRevision:null,sourceDigest:null,workers:[],reason:'Multiple pending batches exist; preserve them and inspect their controller histories.'};
  const batch=pending[0]!,data=batch.data,batchId=String(data.batch),objectiveId=String(data.objective??''),objectiveRevision=Number(data.revision);
  const preparing=options.events.filter(e=>e.kind==='note'&&e.subject==='terminal.code-workers'&&e.data.batch===batchId&&e.data.phase==='preparing');
  const rawIds:unknown[]=Array.isArray(data.ids)?data.ids:preparing.map(event=>event.data.id);
  const ids=rawIds.filter((id):id is string=>typeof id==='string');
  if(rawIds.length!==ids.length||ids.length<1||ids.length>MAX_WORKERS||new Set(ids).size!==ids.length||ids.some(id=>!WORKER_ID.test(id)))return {kind:'blocked',batch:batchId,objectiveId,objectiveRevision,sourceDigest:null,workers:[],reason:'Pending batch identities are missing, duplicated, non-string, or outside the controller format.'};
  const sourceRoot=canonicalDirectory(options.source),workspaceRoot=canonicalDirectory(options.worktreeRoot);
  let snapshot:Awaited<ReturnType<typeof captureGitSnapshot>>|null=null;
  if(sourceRoot&&workspaceRoot&&!options.signal?.aborted){try{snapshot=await captureGitSnapshot(sourceRoot,options.signal);}catch{}}
  const workers:CodeWorkerRecoveryWorker[]=[];
  for(const id of ids){
    const worker=baseWorker(id);
    const admission=lastEvent(options.events,e=>e.kind==='note'&&e.subject==='terminal.code-workers'&&e.data.batch===batchId&&e.data.id===id&&e.data.phase==='preparing');
    const admissionData=eventData(admission);
    const saved=lastEvent(options.events,e=>e.kind==='note'&&e.subject==='terminal.code-worker'&&e.data.id===id);
    const savedData=eventData(saved);
    const agent=lastEvent(options.events,e=>e.kind==='note'&&e.subject==='terminal.agent'&&e.data.id===id);
    const agentData=eventData(agent);
    if(!admission||!admissionData){worker.reason='No matching controller-owned worker admission exists.';workers.push(worker);continue;}
    worker.admissionSeq=admission.seq;worker.agentSeq=agent?.seq??null;worker.workerSeq=saved?.seq??null;
    worker.role=safeText(admissionData.role,64)||'unknown';worker.task=safeText(admissionData.task,4000);
    worker.objectiveId=safeText(admissionData.objective,256);worker.objectiveRevision=Number(admissionData.revision)||0;
    worker.source=safeText(savedData?.source,4096);worker.sourceDigest=safeText(admissionData.sourceDigest,64);worker.base=safeText(admissionData.base,64);
    worker.workspace=safeText(admissionData.path,4096);worker.journal=safeText(savedData?.journal,160);
    worker.journalRoot=safeText(savedData?.journalRoot,4096);
    const attested=lastEvent(options.events,e=>e.kind==='note'&&e.subject==='terminal.code-worker'&&e.data.id===id&&e.seq>admission.seq&&e.data.execution===data.execution&&e.data.objectiveId===objectiveId&&e.data.objectiveRevision===objectiveRevision&&['admitted','proposal','integrated'].includes(String(e.data.phase)));
    if(!saved||!savedData||!attested){
      worker.reason='Worker was allocated but no attested private-journal admission was published; preserve the workspace and do not replay.';workers.push(worker);continue;
    }
    if(savedData.role!==admissionData.role||savedData.task!==admissionData.task||savedData.execution!==data.execution||savedData.objectiveId!==objectiveId||savedData.objectiveRevision!==objectiveRevision||typeof savedData.source!=='string'||savedData.sourceDigest!==admissionData.sourceDigest||savedData.base!==admissionData.base||savedData.workspace!==admissionData.path){
      worker.reason='Shared worker admission disagrees with the controller batch; preserve and inspect.';workers.push(worker);continue;
    }
    if(worker.objectiveId!==options.objective.id||worker.objectiveRevision!==options.objective.revision||objectiveId!==options.objective.id||objectiveRevision!==options.objective.revision){worker.phase='stale';worker.reason='Objective or revision changed; the contribution is historical and cannot be reconciled.';workers.push(worker);continue;}
    if(!sourceRoot||!workspaceRoot||sourceRoot!==resolve(options.source)||workspaceRoot!==resolve(options.worktreeRoot)||worker.source!==sourceRoot||worker.workspace!==join(workspaceRoot,id)||worker.journal!==String(savedData.journal)||!SESSION_ID.test(worker.journal)||worker.journalRoot!==join(resolve(options.parentRoot),'workers',options.parentId)||!SESSION_ID.test(options.parentId)||!worker.sourceDigest||!worker.base){worker.reason='Controller-owned source, workspace or journal path cannot be attested; preserve all files.';workers.push(worker);continue;}
    if(options.signal?.aborted||!snapshot){worker.reason='Current source snapshot is unavailable; no recovery decision is made.';workers.push(worker);continue;}
    if(snapshot.workspace!==worker.source||snapshot.digest!==worker.sourceDigest||snapshot.base!==worker.base){worker.phase='stale';worker.reason='Current source digest or Git base differs from the worker admission; preserve the contribution.';workers.push(worker);continue;}
    if(!existsSync(worker.workspace)){worker.reason='Admitted workspace is absent; preserve its history and never recreate it implicitly.';workers.push(worker);continue;}
    const physical=await inspectAgentGit(worker.workspace,{signal:options.signal});
    if(physical.kind!=='repository'||physical.workspace!==worker.workspace||physical.repository!==worker.workspace||physical.commonDirectory!==snapshot.commonDirectory||physical.head!==worker.base){worker.reason='Physical worktree ownership/base is not attested; preserve it and inspect.';workers.push(worker);continue;}
    const privateData=await privateJournal({root:worker.journalRoot,id:worker.journal,workspace:worker.workspace,ownedClaimPath:options.ownedClaimPaths?.get(worker.id)});
    if('blocked'in privateData){worker.phase=privateData.blocked.includes('live writer')?'live':'blocked';worker.reason=privateData.blocked;workers.push(worker);continue;}
    const effects=privateData.effects;worker.effectCount=effects.length;worker.uncertainEffects=effects.filter(effect=>effect.phase==='uncertain').length;
    if(worker.uncertainEffects){worker.phase='effect-uncertain';worker.reason=`${worker.uncertainEffects} private effect(s) have no confirmed receipt; retry, reconciliation and integration remain blocked.`;workers.push(worker);continue;}
    if(savedData.phase==='integrated'){worker.phase='integrated';worker.reason='Controller journal already records the contribution integrated; the independent source check remains authoritative.';workers.push(worker);continue;}
    const proposal=lastEvent(privateData.events,e=>e.kind==='note'&&e.subject==='terminal.code-worker-proposal');
    const proposalData=eventData(proposal);
    if(!proposal||!proposalData){worker.phase='interrupted';worker.reason='No durable private proposal receipt exists; preserve observed files and do not replay the worker.';workers.push(worker);continue;}
    const text=proposalData.text;
    const proposalMatches=proposalData.version===1&&proposalData.phase==='proposal'&&proposalData.workerId===id&&proposalData.role===worker.role&&proposalData.task===worker.task&&proposalData.execution===savedData.execution&&proposalData.objectiveId===worker.objectiveId&&proposalData.objectiveRevision===worker.objectiveRevision&&proposalData.source===worker.source&&proposalData.sourceDigest===worker.sourceDigest&&proposalData.base===worker.base&&proposalData.workspace===worker.workspace&&proposalData.journal===worker.journal&&proposalData.journalRoot===worker.journalRoot&&typeof text==='string'&&text.length<=8000&&typeof proposalData.steps==='number'&&Number.isSafeInteger(proposalData.steps)&&proposalData.steps>=1&&proposalData.steps<=8&&typeof proposalData.digest==='string'&&/^[a-f0-9]{64}$/.test(proposalData.digest)&&createHash('sha256').update(text).digest('hex')===proposalData.digest&&(savedData.phase!=='proposal'||savedData.proposalSeq===proposal.seq&&savedData.proposalDigest===proposalData.digest);
    if(!proposalMatches){worker.reason='Private proposal receipt has invalid or mismatched provenance; preserve it and inspect.';workers.push(worker);continue;}
    if(savedData.phase==='proposal'&&agentData?.phase==='result'&&agentData.text===text){worker.phase='proposal-published';worker.reason='Proposal is published and remains unverified until ordinary owner integration/check.';worker.proposalSeq=proposal.seq;worker.proposalDigest=String(proposalData.digest);workers.push(worker);continue;}
    worker.phase='proposal-recoverable';worker.reason=savedData.phase==='proposal'
      ?'Private proposal is durable but its shared worker projection is incomplete; restore it conditionally before ordinary owner integration/check.'
      :'A durable private proposal is current and effect receipts are confirmed; publish it conditionally, then use ordinary owner integration/check.';
    worker.proposalSeq=proposal.seq;worker.proposalDigest=String(proposalData.digest);worker.proposalText=text;worker.proposalSteps=Number(proposalData.steps);workers.push(worker);
    if(agentData&&agentData.phase==='result'&&agentData.text===text){worker.agentSeq=agent!.seq;}
  }
  const recoverable=workers.some(worker=>worker.phase==='proposal-recoverable');
  return {kind:workers.some(worker=>worker.phase==='blocked'||worker.phase==='live'||worker.phase==='effect-uncertain')?'blocked':'inspected',batch:batchId,objectiveId,objectiveRevision,sourceDigest:snapshot?.digest??null,workers,reason:recoverable?'Durable proposals may be conditionally reconciled; no verification or integration is implied.':'Inspection completed without a proposal eligible for reconciliation.'};
}

/** Publish only already-durable proposals, after re-reading current physical state. */
export async function reconcileCodeWorkerRecovery(options:{events():readonly Event[];parentRoot:string;parentId:string;worktreeRoot:string;source:string;objective:{id:string;revision:number};current():boolean;append(event:NewEvent):Event;signal?:AbortSignal}):Promise<{kind:'reconciled'|'unchanged'|'refused'|'stale';workers:string[];reason:string}>{
  const before=options.events();const snapshot=await inspectCodeWorkerRecovery({events:before,parentRoot:options.parentRoot,parentId:options.parentId,worktreeRoot:options.worktreeRoot,source:options.source,objective:options.objective,signal:options.signal});
  if(!options.current())return {kind:'stale',workers:[],reason:'Objective, revision or controller instructions changed before reconciliation.'};
  if(snapshot.kind==='none')return {kind:'unchanged',workers:[],reason:snapshot.reason};
  if(snapshot.kind==='blocked'||snapshot.workers.some(w=>w.phase==='stale'||w.phase==='blocked'||w.phase==='live'||w.phase==='effect-uncertain'))return {kind:'refused',workers:[],reason:'At least one admitted worker is not safely reconcilable; preserve the entire batch and inspect its report.'};
  const eligible=snapshot.workers.filter(w=>w.phase==='proposal-recoverable');
  const already=snapshot.workers.filter(w=>w.phase==='proposal-published'||w.phase==='integrated');
  if(!eligible.length)return {kind:'unchanged',workers:already.map(w=>w.id),reason:'No unpublished durable proposal needs reconciliation.'};
  // Re-read all controller and filesystem evidence immediately before the first
  // append. This is not an atomic filesystem CAS; the existing owner integration
  // check remains the final authority over the composed source.
  const claims:TerminalSession[]=[],published:string[]=[];
  try{
    const claimPaths=new Map<string,string>();
    for(const worker of eligible){
      if(!options.current()||options.signal?.aborted)return {kind:'stale',workers:[],reason:'Objective or instructions changed before private journal ownership was acquired.'};
      const journal=new TerminalSession({root:worker.journalRoot,cwd:worker.workspace,id:worker.journal});claims.push(journal);
      const claim=ownedWriterClaim(worker.journalRoot,worker.journal);if(!claim)return {kind:'refused',workers:[],reason:'Exclusive private writer claim could not be attested; preserve the proposal and inspect.'};
      claimPaths.set(worker.id,claim);
    }
   const latest=await inspectCodeWorkerRecovery({events:options.events(),parentRoot:options.parentRoot,parentId:options.parentId,worktreeRoot:options.worktreeRoot,source:options.source,objective:options.objective,signal:options.signal,ownedClaimPaths:claimPaths});
   if(!options.current()||latest.batch!==snapshot.batch||latest.kind==='blocked'||latest.workers.some(w=>w.phase==='stale'||w.phase==='blocked'||w.phase==='live'||w.phase==='effect-uncertain'))return {kind:'stale',workers:[],reason:'Recovery evidence changed before publication; no proposal was reconciled.'};
   const currentById=new Map(latest.workers.map(worker=>[worker.id,worker]));
     for(const original of eligible){
      if(!options.current())return {kind:'stale',workers:published,reason:'Objective or instructions changed during publication; inspect the durable partial projection.'};
      const worker=currentById.get(original.id);
      if(!worker||worker.proposalDigest!==original.proposalDigest||worker.proposalSeq!==original.proposalSeq)return {kind:'stale',workers:published,reason:'Private proposal provenance changed before publication.'};
      const now=options.events();
      const currentWorker=lastEvent(now,e=>e.kind==='note'&&e.subject==='terminal.code-worker'&&e.data.id===worker.id);
      const currentData=eventData(currentWorker);
      if(currentData?.phase==='integrated')continue;
      if(currentData?.phase!=='admitted'&&currentData?.phase!=='proposal')return {kind:'refused',workers:published,reason:'Shared worker phase is no longer an admitted or partially published state; preserve and inspect.'};
      if(currentData.phase==='proposal'&&(currentData.proposalSeq!==worker.proposalSeq||currentData.proposalDigest!==worker.proposalDigest))return {kind:'refused',workers:published,reason:'Partially published worker proposal does not match its private receipt; preserve and inspect.'};
      const currentAgent=lastEvent(now,e=>e.kind==='note'&&e.subject==='terminal.agent'&&e.data.id===worker.id);
      const currentAgentData=eventData(currentAgent);
      if(!currentAgentData||currentAgentData.role!==worker.role||currentAgentData.task!==worker.task||currentAgentData.execution!==currentData.execution)return {kind:'refused',workers:published,reason:'Shared agent projection no longer matches controller admission.'};
      const assertPublicationCurrent=()=>{
        if(!options.current()||options.signal?.aborted)throw new Error('Recovery publication became stale.');
        const claim=claims.find(value=>value.metadata.id===worker.journal);
        if(!claim)throw new Error('Private journal ownership is missing.');
        claim.assertWritable();
        if(ownedWriterClaim(worker.journalRoot,worker.journal)!==claimPaths.get(worker.id))throw new Error('Private journal ownership changed.');
      };
      assertPublicationCurrent();
      if(currentAgentData.phase!=='result'||currentAgentData.text!==worker.proposalText){
        options.append({kind:'note',subject:'terminal.agent',data:{...currentAgentData,phase:'result',text:worker.proposalText,skillWarnings:[...(Array.isArray(currentAgentData.skillWarnings)?currentAgentData.skillWarnings.filter((v):v is string=>typeof v==='string').slice(0,5):[]),'Proposal restored from its private durable receipt; unverified.'],recovery:{proposalSeq:worker.proposalSeq,proposalDigest:worker.proposalDigest,admissionSeq:worker.admissionSeq}}});
      }
      assertPublicationCurrent();
      if(currentData.phase==='admitted')options.append({kind:'note',subject:'terminal.code-worker',data:{...currentData,phase:'proposal',steps:worker.proposalSteps,source:worker.source,sourceDigest:worker.sourceDigest,base:worker.base,proposalSeq:worker.proposalSeq,proposalDigest:worker.proposalDigest,reconciled:true}});
      published.push(worker.id);
    }
    return {kind:published.length?'reconciled':'unchanged',workers:published,reason:published.length?'Durable proposals were published once; ordinary owner integration and verification are still required.':'Every durable proposal was already published.'};
  }catch{return {kind:'refused',workers:published,reason:'Private claim acquisition or shared publication was interrupted or refused; preserve the private proposal and inspect before repeating.'};}
  finally{for(const claim of claims)claim.close();}
}

/**
 * Set a pending batch aside, on the model's own authority, so the gate stops blocking.
 *
 * This clears the gate and nothing else. It applies no file, integrates nothing,
 * closes no goal, claims no verification, deletes no workspace, journal or receipt,
 * and never re-attempts an effect. Every byte of the batch is preserved exactly as
 * the human reject path preserves it.
 *
 * A batch that still holds a durable proposal eligible for reconciliation refuses:
 * discarding real work is a human decision, so the model is sent to /changes.
 *
 * A batch superseded by a human correction is the one case that is allowed through
 * on a revision mismatch. Its contribution cannot integrate anyway, so nothing
 * usable is discarded, and blocking it would strand the session on exactly the live
 * correction this exists to survive.
 */
export async function setAsideCodeWorkerBatch(options:{events():readonly Event[];parentRoot:string;parentId:string;worktreeRoot:string;source:string;objective:{id:string;revision:number};current():boolean;append(event:NewEvent):Event;signal?:AbortSignal}):Promise<{kind:'set-aside'|'unchanged'|'refused'|'stale';workers:string[];reason:string}>{
  const before=options.events();
  const snapshot=await inspectCodeWorkerRecovery({events:before,parentRoot:options.parentRoot,parentId:options.parentId,worktreeRoot:options.worktreeRoot,source:options.source,objective:options.objective,signal:options.signal});
  if(snapshot.kind==='none')return {kind:'unchanged',workers:[],reason:snapshot.reason};
  if(snapshot.workers.some(worker=>worker.phase==='proposal-recoverable'||worker.phase==='proposal-published'))return {kind:'refused',workers:[],reason:'A durable proposal is still recoverable from this batch. Use /changes to review and apply or set it aside; the model does not discard real work.'};
  if(snapshot.workers.some(worker=>worker.phase==='live'))return {kind:'refused',workers:[],reason:'A private journal is claimed by a live writer. Stop active work, then inspect again; a live writer is never set aside.'};
  if(snapshot.batch===null)return {kind:'refused',workers:[],reason:snapshot.reason};
  // Objective/revision and source digest/base are re-read immediately before the
  // append, matching the reconciliation guard. A changed intention is not this
  // model's to discard.
  if(!options.current())return {kind:'stale',workers:[],reason:'Objective, revision or controller instructions changed before the set-aside decision.'};
  const now=options.events();
  const latestBatch=now.filter(event=>event.kind==='note'&&event.subject==='terminal.code-workers'&&event.data.batch===snapshot.batch).at(-1);
  if(!latestBatch||latestBatch.data.phase!=='ready')return {kind:'unchanged',workers:[],reason:'This batch is no longer pending, or its phase changed before the decision.'};
  const batchObjective=String(latestBatch.data.objective??''),batchRevision=Number(latestBatch.data.revision);
  // A batch admitted under an older revision was superseded by a human correction.
  // Its contribution is historical by construction: reconciliation and integration
  // both refuse it, so no work is being discarded that could have been used. It is
  // also the live-correction case, where leaving the gate blocked strands the
  // session. Re-inspect under the batch's own revision so the recoverable-proposal
  // guarantee below still holds, then allow it and record the supersession.
  const superseded=batchObjective===options.objective.id&&Number.isSafeInteger(batchRevision)&&batchRevision<options.objective.revision;
  if(batchObjective!==options.objective.id)return {kind:'stale',workers:[],reason:'This batch belongs to another intention. Preserve it and inspect offline; the model does not discard it.'};
  if(!superseded&&batchRevision!==options.objective.revision)return {kind:'stale',workers:[],reason:'This batch records a later revision than the current intention. Preserve it and inspect offline; the model does not discard it.'};
  if(superseded){
    const own=await inspectCodeWorkerRecovery({events:before,parentRoot:options.parentRoot,parentId:options.parentId,worktreeRoot:options.worktreeRoot,source:options.source,objective:{id:batchObjective,revision:batchRevision},signal:options.signal});
    if(own.kind!=='none'&&own.workers.some(worker=>worker.phase==='proposal-recoverable'||worker.phase==='proposal-published'))return {kind:'refused',workers:[],reason:'A durable proposal is still recoverable from this superseded batch. Use /changes to review and apply or set it aside; the model does not discard real work.'};
    if(own.kind!=='none'&&own.workers.some(worker=>worker.phase==='live'))return {kind:'refused',workers:[],reason:'A private journal is claimed by a live writer. Stop active work, then inspect again; a live writer is never set aside.'};
  }
  // The source must not have moved under the batch. A moved source means the delta
  // is no longer the delta this batch produced, so preserve and let a human decide.
  const digest=snapshot.sourceDigest;
  if(digest===null)return {kind:'stale',workers:[],reason:'The current source snapshot is unavailable; nothing is discarded.'};
  if(!superseded&&latestBatch.data.sourceDigest!==digest)return {kind:'stale',workers:[],reason:'The source digest changed since delegation. Set aside the old batch with /changes as the human decision.'};
  const ids=snapshot.workers.map(worker=>worker.id);
  if(!ids.length)return {kind:'refused',workers:[],reason:'No admitted worker could be attributed to this batch; preserve it and inspect offline.'};
  if(!options.current())return {kind:'stale',workers:[],reason:'Objective or instructions changed before the set-aside append.'};
  options.append({kind:'note',subject:'terminal.code-workers',data:{...latestBatch.data,phase:'rejected',human:false,authority:'model set-aside: the gate was cleared without applying, integrating or verifying anything'}});
  for(const id of ids){
    const saved=lastEvent(options.events(),event=>event.kind==='note'&&event.subject==='terminal.code-worker'&&event.data.id===id);
    const savedData=eventData(saved);
    if(!savedData)continue;
    options.append({kind:'note',subject:'terminal.code-worker',data:{...savedData,phase:'rejected',human:false,authority:'model set-aside: workspace and private journal preserved; nothing applied, integrated or verified'}});
  }
  if(!options.current())return {kind:'stale',workers:ids,reason:'Objective or instructions changed during the set-aside append; the durable partial projection is preserved for inspection.'};
  return {kind:'set-aside',workers:ids,reason:'Batch set aside on model authority. Every workspace, private journal and receipt is preserved; nothing was applied, integrated or verified. Delegation and goal closure may resume, and the objective still requires independent verification.'};
}

/** Safe bounded projection for the model/tool response; excludes private proposal text. */
export function codeWorkerRecoverySummary(snapshot:CodeWorkerRecoverySnapshot):Record<string,unknown>{
  return {kind:snapshot.kind,batch:snapshot.batch,objectiveId:snapshot.objectiveId,objectiveRevision:snapshot.objectiveRevision,sourceDigest:snapshot.sourceDigest,reason:snapshot.reason.slice(0,512),workers:snapshot.workers.slice(0,MAX_WORKERS).map(({proposalText,...worker})=>({...worker,reason:worker.reason.slice(0,512)}))};
}

export function validCodeWorkerRecoveryInput(input:unknown):boolean{
  try{return !!input&&typeof input==='object'&&!Array.isArray(input)&&Reflect.ownKeys(input).length===0;}catch{return false;}
}

export function boundedCodeWorkerRecoveryOutput(value:unknown):string|null{
  try{const output=JSON.stringify(value);return typeof output==='string'&&output.length<=MAX_RECOVERY_OUTPUT_CHARS?output:null;}catch{return null;}
}
