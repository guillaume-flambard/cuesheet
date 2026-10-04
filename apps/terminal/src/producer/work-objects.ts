import type {Event} from '../../../../src/core/store.ts';
import type {Objective} from '../../../../src/adapters/objectives.ts';
import type {WorkPlan} from '../../../../src/adapters/work-plans.ts';
import type {WorkSurface,WorkObject,WorkReference} from '../app/state.ts';

const text=(value:unknown)=>typeof value==='string'?value:'';
const list=(title:string,items:readonly string[])=>items.length?`${title}\n${items.map(s=>'  '+s).join('\n')}`:'';
const phases:Record<string,string>={active:'running',result:'proposal · unverified',failed:'failed',stale:'stale',cancelled:'cancelled',interrupted:'interrupted'};

/** One journal projection, no IO and no inferred completion or relationships. */
export function projectWorkObjects(events:readonly Event[],objective:Objective,plan:WorkPlan|undefined,workers:WorkSurface['workers']):WorkObject[]{
 const objects:WorkObject[]=[];
 const add=(kind:WorkObject['kind'],id:string,title:string,status:string,source:number,detail:string,referenceable=true)=>{
  const reference:WorkReference={id,source,objectiveId:objective.id,objectiveRevision:objective.revision};
  objects.push({kind,id,title,status,source,detail:`${detail}\n\nJournal source #${source}\n${kind==='verification'?'Recorded verification has only the scope described above.':'Recorded content is not independent verification.'}`, ...(referenceable?{reference}:{})});
 };
 const intentSource=events.findLast(e=>e.subject==='terminal.objective'&&e.data.id===objective.id)?.seq??objective.revision;
 add('intent',`intent:${objective.id}`,objective.originalText,objective.status==='verified'?'verification recorded':objective.status,intentSource,[
  'Your intention',objective.originalText,
  ...(objective.text!==objective.originalText?['Interpretation · '+objective.descriptionAuthor,objective.text]:[]),
  list('Human corrections',objective.corrections.map(c=>c.text)),list('Success criteria · '+objective.descriptionAuthor,objective.criteria),
  list('Constraints · '+objective.descriptionAuthor,objective.constraints),list('Excluded',objective.exclusions),
  objective.check?.boundRevision===objective.revision?'Independent check bound to this revision.':'No independent check bound to this revision.',
 ].filter(Boolean).join('\n'));
 if(plan){
  const event=events.find(e=>e.seq===plan.revision)!;
  add('plan',`plan:${plan.id}`,'Approach and specification','proposed',plan.revision,[text(event.data.rationale),text(event.data.spec)||'No specification text recorded.',list('Steps',plan.tasks.map(t=>t.text))].join('\n'));
  for(const task of plan.tasks)add('task',`task:${task.id}`,task.text,'planned',task.revision,[task.text,'Expected result',task.expected,list('Depends on',task.dependencies.map(id=>plan.tasks.find(t=>t.id===id)?.text??id))].filter(Boolean).join('\n'));
 }
 for(const w of workers){
  if(!w.source)continue;
  const e=events.find(e=>e.seq===w.source);
  add('agent',`worker:${w.id}`,w.task,phases[w.phase]??'unknown',w.source,[`${w.label} · ${w.role}`,w.task,`State: ${phases[w.phase]??'unknown'}`,`Model: ${w.model??'not recorded'}`,w.helping?`Helping: ${w.helping==='coordinator'?'main task':w.helping}`:'',w.routeReason?`Why this model: ${w.routeReason}`:'',w.result||'No result recorded.'].filter(Boolean).join('\n'),e?.data.objectiveId===objective.id&&e.data.objectiveRevision===objective.revision&&!['stale','cancelled'].includes(w.phase));
 }
 const contributions=new Map<string,Event>();
 for(const e of events)if(e.kind==='note'&&['terminal.workspace','terminal.code-worker'].includes(e.subject??'')&&typeof e.data.id==='string')contributions.set(`${e.subject}:${e.data.id}`,e);
 for(const [id,e] of contributions){
  if((e.data.objectiveId??e.data.objective)!==objective.id||(e.data.objectiveRevision??e.data.revision)!==objective.revision)continue;
  const phase=text(e.data.phase);const statuses:Record<string,string>={proposal:'review required',integrated:'applied · check required',rejected:'set aside',uncertain:'effect uncertain',admitted:'running'};
  add('contribution',`contribution:${id}`,text(e.data.task)||text(e.data.unit)||'Code contribution',statuses[phase]??phase,e.seq,[text(e.data.task)||text(e.data.unit),`State: ${statuses[phase]??phase}`,text(e.data.text),`Workspace: ${text(e.data.workspace)||text(e.data.path)||'not recorded'}`,'D opens Changes for review. Integration does not establish completion.'].filter(Boolean).join('\n'));
 }
 // A tool exit or a model's words can never create this object.
 const verified=events.findLast(e=>e.kind==='work_verified'&&e.data.objectiveId===objective.id&&e.data.objectiveRevision===objective.revision&&e.data.checkDigest===objective.check?.digest&&objective.check?.boundRevision===objective.revision);
 if(verified)add('verification',`verification:${verified.seq}`,'Independent check',text(verified.data.verdict)||'unknown',verified.seq,[`Recorded verdict: ${text(verified.data.verdict)||'unknown'}`,`Record: ${text(verified.data.record)||'not recorded'}`,'Bound to this objective revision. Changed files require a fresh check.'].join('\n'));
 return objects;
}

export function resolveWorkReference(surface:WorkSurface,reference:WorkReference,text:string):{text:string}|{error:string}{
 if(!reference||typeof reference.id!=='string'||!Number.isSafeInteger(reference.source)||!Number.isSafeInteger(reference.objectiveRevision))return {error:'Invalid work reference. Inspect the work again; your draft is preserved.'};
 const object=surface.objects?.find(o=>o.id===reference.id);
 const current=object?.reference;
 if(!current||current.source!==reference.source||current.objectiveId!==reference.objectiveId||current.objectiveRevision!==reference.objectiveRevision)return {error:'This work changed. Inspect it again before sending; your draft is preserved.'};
 const said=text.trim();
 if(!said||said.startsWith('/')||said.length>18000)return {error:'Write an instruction of 1 to 18000 characters for the selected work.'};
 return {text:`${said}\n\nSelected work: ${object!.kind} ${object!.id} (journal #${current.source}, ${current.objectiveId}@${current.objectiveRevision}).\nReference title: ${object!.title.replace(/\s+/g,' ').slice(0,300)}\nThis reference supplies context only. Apply the human instruction to the current objective under existing permissions.`};
}
