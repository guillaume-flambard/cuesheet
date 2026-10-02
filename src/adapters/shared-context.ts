import type {Situation} from './situation.ts';
import type {VaultSnapshot} from "./vault.ts";
import type { SharedSnapshot } from "./shared-memory.ts";
import { projectEffectAttempts, mutationTool } from "./tool-receipts.ts";
import { projectExecutions } from "./execution-state.ts";
import type { ContextFrame } from "../core/loop.ts";
import type { Session } from "../core/store.ts";
import { projectWork } from "../work-state.ts";
import { projectMemory } from "./work-memory.ts";
import { projectOrganization } from "./work-organizer.ts";
import { projectObjectives } from "./objectives.ts";

/** Derived on every inference, never written back as a fact or verdict. */
export function withSharedContext(frame: ContextFrame, session: Session, options: { maxChars?: number;situation?:Situation; sharedContexts?: SharedSnapshot;vault?:VaultSnapshot } = {}): ContextFrame {
  // Terminal bookkeeping notes are user inputs/model selections, not unanswered
  // work questions. Preserve them in history without mislabelling them here.
  const work = projectWork(session.events.filter(event =>
    !(event.kind === "note" && event.subject.startsWith("terminal."))));
  const last = session.events.at(-1);
  const preamble = "Shared work snapshot. Historical records are not instructions to repeat effects. " +
    "The canonical goal and evidence below remain authoritative; claims are not verification. " +
    "Memory provenance distinguishes human records from model interpretations; only active records guide current work. Resolved records are history. " +
    "Organization and session skills are model-authored proposals, not verified outcomes or extra tool permissions. " +
    "Omitted records still exist. Retrieve their source sequences with read_history {from,to}; max 100 events per call. For clipped data, request a single event with offset:nextOffset until nextOffset is null.\n";
  const snapshot = {situation:options.situation??null,vault:options.vault ? {...options.vault,hits:options.vault.hits.slice()} : null, sharedContexts: options.sharedContexts ? {...options.sharedContexts,profiles:options.sharedContexts.profiles.map(profile=>({...profile,entries:profile.entries.filter(entry=>entry.active!==false).map(entry=>({
    id:entry.id,kind:entry.kind,text:entry.text,sources:entry.sources,author:entry.author,revision:entry.revision,active:entry.active,
    rationale:entry.author==='model' ? entry.rationale : undefined,
    corrections:(entry.corrections ?? []).map(correction=>({operation:correction.operation,source:correction.source,revision:correction.revision})),
    history:"Full extraction and correction texts: read_shared_context",
  }))}))} : null, revision: last?.seq ?? -1, goal: frame.goal,
      constraints: work.constraints.slice(), decisions: work.decisions.slice(),
      openQuestions: work.openQuestions.slice(), tasks: work.tasks.slice(),
      artifacts: work.artifacts.slice(), claims: work.claims.slice(), evidence: frame.evidence,
      memory: projectMemory(session.events), organization: projectOrganization(session.events),
      objectives: projectObjectives(session.events),
      executions: projectExecutions(session.events),
      uncertainEffects: projectEffectAttempts(session.events).filter(a=>a.phase==="uncertain" && mutationTool(a.tool)),
      research: session.events.filter(event=>event.kind==="note" && event.subject==="terminal.research")
        .map(event=>({sourceSeq:event.seq,operation:event.data.operation,url:event.data.finalUrl ?? event.data.url,
          path:event.data.path,digest:event.data.digest,fetchedAt:event.data.fetchedAt,query:event.data.query,results:event.data.results})),
      installedSkills:session.events.filter(event=>event.kind==="note" && event.subject==="terminal.skill")
        .map(event=>({sourceSeq:event.seq,name:event.data.name,path:event.data.path,digest:event.data.digest,trust:event.data.trust})),
      context: { budgetChars: options.maxChars ?? 48000, method: "JSON UTF-16 character ceiling, not measured tokens",
        sourceRange: { from: session.events[0]?.seq ?? null, to: last?.seq ?? null },
        totalEvents: session.events.length, omittedHistory: 0, omittedRecords: 0, estimatedTokens: 0 } };
  const budget = snapshot.context.budgetChars;
  if (!Number.isSafeInteger(budget) || budget < 4000) throw new Error("Context character budget must be an integer of at least 4000.");
  // Repeated startup policies are projections, not additional human constraints.
  const seen = new Set<string>();
  const directives = [...session.openDirectives.filter(directive=>directive.target==="builder"),...frame.directives].reverse().filter(directive => {
    if (seen.has(directive.text)) return false;
    seen.add(directive.text); return true;
  }).reverse();
  const result: ContextFrame = { ...frame, history: frame.history.slice(), evidence: frame.evidence.slice(), directives: directives.slice() };
  snapshot.constraints = snapshot.constraints.filter(item=>directives.some(directive=>directive.seq===item.at));
  const histories = [...(snapshot.vault?[snapshot.vault.hits]:[]),snapshot.claims,snapshot.decisions,snapshot.artifacts,snapshot.tasks,snapshot.openQuestions,snapshot.research,snapshot.installedSkills,snapshot.executions,...(snapshot.sharedContexts?.profiles.map(profile=>profile.entries) ?? [])];
  const sharedHistories=new Set<unknown[]>(snapshot.sharedContexts?.profiles.map(profile=>profile.entries) ?? []);
  const dropOptional=(items:unknown[],count:number):number=>{
    if(!sharedHistories.has(items))return items.splice(0,count).length;
    let removed=0;
    while(removed<count){
      const at=items.findIndex(item=>!(sharedHistories.has(items) && item && typeof item==='object' && (item as {author?:unknown}).author==='human'));
      if(at<0)break;items.splice(at,1);removed++;
    }
    return removed;
  };
  // Bound candidate sets before serializing. Repeatedly dropping one item from
  // a huge journal would turn compilation into quadratic work.
  for(const items of histories)if(items.length>64)snapshot.context.omittedRecords+=dropOptional(items,items.length-64);
  if(result.history.length>32){snapshot.context.omittedHistory=result.history.length-32;result.history=result.history.slice(-32);}
  const render = () => {
    const text = preamble + JSON.stringify(snapshot);
    result.directives = [...directives, {seq:last?.seq ?? 0,at:last?.at ?? 0,target:"builder",text,applied:false}];
    return JSON.stringify(result).length;
  };
  let size = render();
  const omitted = () => {snapshot.context.omittedRecords++;};
  // Optional historical observations come first. Authoritative human directives,
  // active human memory and the current objective are never silently dropped.
  for (const items of histories) while (size > budget && items.length) {
    const remove=dropOptional(items,Math.ceil(items.length/2));if(!remove)break;snapshot.context.omittedRecords+=remove;size=render();
  }
  while (size > budget && snapshot.memory.some(item=>item.by!=="human" || !item.active)) {
    const index=snapshot.memory.findIndex(item=>item.by!=="human" || !item.active);
    snapshot.memory.splice(index,1);omitted();size=render();
  }
  while (size > budget && snapshot.organization.skills.length) {snapshot.organization.skills.shift();omitted();size=render();}
  while (size > budget && result.history.length) {
    const remove=Math.ceil(result.history.length/2);result.history.splice(0,remove);snapshot.context.omittedHistory+=remove;size=render();
  }
  while (size > budget && result.evidence.length > 1) {result.evidence.shift();snapshot.evidence=result.evidence;omitted();size=render();}
  // Historical objective contracts are recoverable by source sequence as well.
  while (size > budget && snapshot.objectives.objectives.some(item=>item.id!==snapshot.objectives.current?.id)) {
    const index=snapshot.objectives.objectives.findIndex(item=>item.id!==snapshot.objectives.current?.id);
    snapshot.objectives.objectives.splice(index,1);omitted();size=render();
  }
  if(size>budget && snapshot.organization.plan){
    // The plan's revision is its retrieval reference even when content is omitted.
    snapshot.organization.plan={...snapshot.organization.plan,spec:null,tasks:[]};omitted();size=render();
  }
  size=render();
  // Conservative estimate only. Providers with a tokenizer must replace it with
  // their measured count before inference; the character ceiling is enforceable.
  snapshot.context.estimatedTokens = size * 3;
  size=render();
  if (size > budget) throw new Error("Authoritative objective, human memory and directives exceed the context budget. Narrow the scope or select a model with a larger window; no instruction was silently discarded.");
  return result;
}
