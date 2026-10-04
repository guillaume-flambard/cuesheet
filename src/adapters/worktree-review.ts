/** Human review projects an attested delta; it never grants the model integration authority. */
import {randomUUID,createHash} from 'node:crypto';
import type {IntegrationPlan,IntegrationResult} from './worktree-integration.ts';
import {planWorktreeIntegration,applyWorktreeIntegration} from './worktree-integration.ts';
export interface ChangeFile {path:string;kind:'added'|'deleted'|'modified';lines:string[];binary:boolean;beforeBytes:number;afterBytes:number;}
export interface ChangeReview {token:string;digest:string;objective:string;revision:number;workspace:string;files:ChangeFile[];verification:'not established';blocked?:string;}
export interface ReviewBasis {source:string;workspace:string;sourceDigest:string;objective:string;revision:number;workspaceId:string;}
const label=(s:string)=>s.replace(/[\x00-\x1f\x7f-\x9f]/g,'?');
const clean=(s:string)=>s.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
function preview(plan:IntegrationPlan):ChangeFile[]{return plan.files.map(file=>{
 const before=file.before?Buffer.from(file.before.bytes,'base64'):Buffer.alloc(0),after=file.after?Buffer.from(file.after.bytes,'base64'):Buffer.alloc(0);
 const text=(b:Buffer)=>b.toString('utf8'),binary=before.includes(0)||after.includes(0)||Buffer.from(text(before)).compare(before)!==0||Buffer.from(text(after)).compare(after)!==0;
 const kind=!file.before?'added':!file.after?'deleted':'modified';const lines:string[]=[];
 if(file.before?.mode!==file.after?.mode)lines.push(`Mode ${file.before?file.before.mode.toString(8):'absent'} → ${file.after?file.after.mode.toString(8):'absent'}`);
 if(binary)lines.push(`Binary file · ${before.length} → ${after.length} bytes`);
 else{
  const a=before.length?text(before).split('\n'):[],b=after.length?text(after).split('\n'):[];let start=0,end=0;
  while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  const from=Math.max(0,start-3),aTo=Math.min(a.length,a.length-end+3),bTo=Math.min(b.length,b.length-end+3);
  lines.push(`--- ${file.before?'a/'+label(file.path):'/dev/null'}`,`+++ ${file.after?'b/'+label(file.path):'/dev/null'}`,`@@ -${from+1},${aTo-from} +${from+1},${bTo-from} @@`);
  for(let i=from;i<start;i++)lines.push(' '+clean(a[i]!));
  for(let i=start;i<a.length-end;i++)lines.push('-'+clean(a[i]!));
  for(let i=start;i<b.length-end;i++)lines.push('+'+clean(b[i]!));
  for(let i=0;i<Math.min(3,end);i++)lines.push(' '+clean(a[a.length-end+i]!));
  if(lines.length>8000)lines.splice(8000,lines.length-8000,'[Preview truncated: inspect the file in the preserved workspace.]');
 }
 for(let i=0;i<lines.length;i++)if(lines[i]!.length>4096)lines[i]=lines[i]!.slice(0,4096)+' [line clipped; inspect preserved file]';
 return {path:label(file.path),kind,lines,binary,beforeBytes:before.length,afterBytes:after.length};
});}
export class WorktreeReview {
 private applying=false;
 private pending=new Map<string,{basis:ReviewBasis;plan?:IntegrationPlan;digest:string}>();
 private options:{root:string;basis():ReviewBasis|null;busy():boolean;record(data:Record<string,unknown>):void;blocked?():string|undefined};
 constructor(options:{root:string;basis():ReviewBasis|null;busy():boolean;record(data:Record<string,unknown>):void;blocked?():string|undefined}){this.options=options;}
 async open():Promise<ChangeReview|null>{
  if(this.applying)throw Error('Application in progress. Wait before refreshing changes.');
  const current=this.options.basis();if(!current)return null;const basis=Object.freeze({...current});
  let plan:IntegrationPlan|undefined,blocked:string|undefined;
  try{const reason=this.options.blocked?.();if(reason)throw Error(reason);plan=await planWorktreeIntegration({...basis});}catch(error){blocked=error instanceof Error?error.message:'Review cannot be attested.';}

  if(JSON.stringify(this.options.basis())!==JSON.stringify(basis))throw Error('The work changed during review. Refresh changes.');
  const token='review-'+randomUUID();this.pending.clear();const digest=plan?.digest??createHash('sha256').update(JSON.stringify(basis)).digest('hex');this.pending.set(token,{basis,plan,digest});
  return {token,digest,objective:basis.objective,revision:basis.revision,workspace:basis.workspace,files:plan?preview(plan):[],...(blocked?{blocked}:{}),verification:'not established'};
 }
 async decide(token:string,digest:string,decision:'apply'|'reject'):Promise<IntegrationResult|{kind:'rejected';files:number}>{
  if(decision!=='apply'&&decision!=='reject')throw Error('Unknown review decision.');
  if(this.applying)throw Error('Application in progress.');
  const saved=this.pending.get(token);if(!saved||saved.digest!==digest)throw Error('Review expired or unknown. Refresh changes.');
  if(this.options.busy())throw Error('Stop active work before deciding on changes.');
  const current=()=>!this.options.busy()&&JSON.stringify(this.options.basis())===JSON.stringify(saved.basis);
  if(!current())throw Error('The intention or workspace changed. Refresh changes.');
  if(decision==='apply'&&!saved.plan)throw Error('This contribution cannot be applied safely. You may set it aside and preserve its files.');
  this.pending.delete(token);
  this.options.record({version:1,operation:'human-decision',decision,token,digest,objective:saved.basis.objective,revision:saved.basis.revision,workspaceId:saved.basis.workspaceId});
  if(decision==='reject'){this.options.record({version:1,operation:'result',decision,kind:'rejected',workspaceId:saved.basis.workspaceId,objective:saved.basis.objective,revision:saved.basis.revision});return {kind:'rejected',files:saved.plan?.files.length??0};}
  this.applying=true;
  let result:IntegrationResult;
  try{result=await applyWorktreeIntegration(saved.plan!,{root:this.options.root,current});}finally{this.applying=false;}
  this.options.record({version:1,operation:'result',decision,...result,workspaceId:saved.basis.workspaceId,objective:saved.basis.objective,revision:saved.basis.revision});
  return result;
 }
}
