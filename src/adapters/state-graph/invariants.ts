/**
 * A declarative registry of domain invariants, each bound to the owner check
 * that enforces it.
 *
 * An invariant is a claim this repository makes about itself, and a claim that
 * no check can fail is a wish recorded as a fact. This module keeps the two
 * apart: every entry states the claim, names the check that enforces it, and is
 * then resolved against a catalog of the checks that actually exist. An entry
 * whose check is undeclared, unknown or owned by someone else comes back as
 * `unenforced` with a reason, so a gap in coverage is reported instead of being
 * assumed away by the presence of a statement.
 *
 * Deliberately narrow: nothing here runs a check or reads a result. Verdicts,
 * staleness and the rule that an unknown or out-of-date result is not a success
 * belong to the runner in SG03.2. "Enforced" means one thing in this file: a
 * declared check exists in the catalog and is owned by the same owner as the
 * invariant it is bound to.
 *
 * Declarations are TypeScript, not parsed input, so an unknown key is already a
 * compile error and the runtime checks below guard values only: stable ids,
 * a statement, an owner, at least one source, and a bound check list that is
 * allowed to be empty, because an empty list is the gap this registry exists to
 * surface.
 */
import type {StateGraph} from './schema.ts';

/** One invariant as it is declared: what is claimed, who owns it, what checks it. */
export interface InvariantDeclaration {
 /** Stable identity, shared with the manifest node of kind `invariant`. */
 readonly id: string;
 /** The claim itself, in words a reader can disagree with. */
 readonly statement: string;
 /** Domain node this invariant belongs to. */
 readonly domainId: string;
 /** Who owns the invariant: an identifier, never a capability or a right. */
 readonly ownerRef: string;
 /** Repository-relative files that state or check the claim. */
 readonly sources: readonly string[];
 /** Owner checks declared to enforce the claim; empty means none is declared. */
 readonly checks: readonly string[];
}
export type EnforcementStatus = 'enforced' | 'unenforced';
/** Why an entry is or is not enforced; the first failing check decides. */
export type EnforcementReason = 'check-present' | 'check-not-declared' | 'check-unknown' | 'check-not-owner';
/** A declaration after resolution against a catalog: the binding, and whether it holds. */
export interface EvaluatedInvariant {
 readonly id: string;
 readonly statement: string;
 readonly domainId: string;
 readonly ownerRef: string;
 readonly sources: readonly string[];
 readonly checks: readonly string[];
 /** True only when at least one check is declared and every one of them resolves. */
 readonly checkExists: boolean;
 /** The declared checks that failed to resolve; empty when enforced. */
 readonly unresolved: readonly string[];
 readonly status: EnforcementStatus;
 readonly reason: EnforcementReason;
}
export interface EnforcementReport {
 readonly entries: readonly EvaluatedInvariant[];
 /** Every gap, never sampled and never folded into a count. */
 readonly unenforced: readonly EvaluatedInvariant[];
 /** True only when the registry is non-empty and has no gap. An empty registry is not complete. */
 readonly complete: boolean;
}
export type InvariantRegistry = readonly InvariantDeclaration[];
/** Check id to owner identifier, for the checks a catalog admits. */
export type CheckCatalog = ReadonlyMap<string, string>;

const IDENT=/^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/;
const bad=(where:string):never=>{throw new Error(`Invalid invariant registry: ${where}.`);};
const ident=(value:unknown,field:string,where:string):string=>{
 if(typeof value!=='string'||!IDENT.test(value))return bad(`${where}: ${field}`);
 return value;
};
const paths=(value:unknown,field:string,where:string):readonly string[]=>{
 if(!Array.isArray(value)||value.length<1||value.length>32)return bad(`${where}: ${field}`);
 const seen=new Set<string>();
 for(const path of value){
  if(typeof path!=='string'||path.length<1||path.length>240||Buffer.from(path,'utf8').toString('utf8')!==path||
   path.startsWith('/')||path.split('/').some(part=>!part||part!==part.trim()||part==='.'||part==='..'))return bad(`${where}: ${field}`);
  if(seen.has(path))return bad(`${where}: duplicate ${field}`);
  seen.add(path);
 }
 return Object.freeze([...value]);
};
const ids=(value:unknown,field:string,where:string):readonly string[]=>{
 if(!Array.isArray(value)||value.length>8)return bad(`${where}: ${field}`);
 const seen=new Set<string>();
 for(const check of value){ident(check,field,where);if(seen.has(check))return bad(`${where}: duplicate ${field}`);seen.add(check);}
 return Object.freeze([...value]);
};
/** Validate and freeze declarations. An empty check list is a legal declaration: it is the gap. */
export function defineInvariants(declarations:readonly InvariantDeclaration[]):InvariantRegistry{
 const seen=new Set<string>();
 const entries=declarations.map((entry,index):InvariantDeclaration=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return bad(`entry ${index}`);
  const at=`entry ${index}`;
  const id=ident(entry.id,'id',at);
  if(seen.has(id))return bad(`${at}: duplicate id ${id}`);
  seen.add(id);
  if(typeof entry.statement!=='string'||entry.statement.trim().length<1||entry.statement.length>1000)return bad(`${at}: statement`);
  const domainId=ident(entry.domainId,'domainId',at),ownerRef=ident(entry.ownerRef,'ownerRef',at);
  return Object.freeze({id,statement:entry.statement,domainId,ownerRef,sources:paths(entry.sources,'sources',at),checks:ids(entry.checks,'checks',at)});
 });
 return Object.freeze(entries);
}
/** Every `test` and `ci` node, by id and owner: what a binding is resolved against. */
export function ownerCheckCatalog(graph:StateGraph):CheckCatalog{
 const catalog=new Map<string,string>();
 for(const node of graph.nodes)if(node.kind==='test'||node.kind==='ci')catalog.set(node.id,node.ownerRef);
 return catalog;
}
/** Resolve every declaration against a catalog. No entry is dropped, counted as covered or inferred. */
export function evaluateInvariants(registry:InvariantRegistry,catalog:CheckCatalog):EnforcementReport{
 const entries=registry.map((entry):EvaluatedInvariant=>{
  const unresolved:string[]=[];
  let reason:EnforcementReason='check-present';
  if(entry.checks.length===0)reason='check-not-declared';
  else for(const check of entry.checks){
   const owner=catalog.get(check);
   const failure:EnforcementReason|null=owner===undefined?'check-unknown':owner===entry.ownerRef?null:'check-not-owner';
   if(failure!==null){unresolved.push(check);if(reason==='check-present')reason=failure;}
  }
  const checkExists=unresolved.length===0&&entry.checks.length>0;
  return Object.freeze({id:entry.id,statement:entry.statement,domainId:entry.domainId,ownerRef:entry.ownerRef,sources:entry.sources,checks:entry.checks,checkExists,
   unresolved:Object.freeze(unresolved),status:checkExists?'enforced':'unenforced',reason});
 });
 const unenforced=entries.filter(entry=>entry.status==='unenforced');
 return Object.freeze({entries:Object.freeze(entries),unenforced:Object.freeze(unenforced),complete:entries.length>0&&unenforced.length===0});
}
/** Invariants the graph states but the registry does not carry: the same gap in the other direction. */
export function unregisteredInvariants(registry:InvariantRegistry,graph:StateGraph):readonly string[]{
 const declared=new Set(registry.map(entry=>entry.id));
 return Object.freeze(graph.nodes.filter(node=>node.kind==='invariant'&&!declared.has(node.id)).map(node=>node.id));
}
/** The owner all declarations in this repository name; a label, not a permission. */
const OWNER='owner.cuesheet';
const d=(id:string,domainId:string,statement:string,sources:readonly string[],checks:readonly string[]):InvariantDeclaration=>
 Object.freeze({id,statement,domainId,ownerRef:OWNER,sources:Object.freeze([...sources]),checks:Object.freeze([...checks])});
/**
 * The invariants this repository states, one entry per manifest node of kind
 * `invariant`, with the check list copied from the manifest binding. Statements
 * are written from the sources and tests the entry cites, so a statement that
 * drifts from its evidence is a reviewable edit rather than an invisible one.
 */
export const INVARIANTS:InvariantRegistry=defineInvariants([
 d('invariant.sessions.durable','domain.sessions','events written through a session survive closing and reopening it, and a session that cannot be written refuses instead of publishing an event it did not store.',['src/adapters/terminal-session.ts','test/terminal-sessions.test.ts'],['test.sessions.durability']),
 d('invariant.sessions.refusal','domain.sessions','a missing, damaged or concurrently held session refuses without rewriting its file, and a refusal leaves the journal byte-identical.',['src/adapters/session-store.ts','test/terminal-sessions.test.ts'],['test.sessions.durability']),
 d('invariant.objectives.identity','domain.objectives','identical requests have distinct stable ids, and a human correction preserves identity instead of minting a new objective.',['src/adapters/objectives.ts','test/objectives.test.ts'],['test.objectives.objectives']),
 d('invariant.objectives.hypothesis','domain.objectives','a model description is a hypothesis: cycles and malformed records are refused and write nothing.',['src/adapters/objectives.ts','test/objectives.test.ts'],['test.objectives.objectives']),
 d('invariant.objectives.proof','domain.objectives','proof is bound to the authoritative contract revision, never to model prose or a stale check.',['src/adapters/objectives.ts','test/objectives.test.ts'],['test.objectives.objectives']),
 d('invariant.objectives.plan_refusal','domain.objectives','invalid, cyclic or missing task dependencies refuse admission without changing the journal.',['src/adapters/work-plans.ts','test/work-plans.test.ts'],['test.objectives.plans']),
 d('invariant.objectives.routing','domain.objectives','routing is deterministic: the same line yields the same intent, approval and refusal are decided before greeting or work, and everything unrecognized routes to a goal.',['src/core/intent.ts','test/intent.test.ts'],['test.objectives.intent']),
 d('invariant.workers.confinement','domain.workers','the shipped worker imports nothing that could write to a session and is handed a directory and an identity, so it has no code path to the session store and cannot declare a goal met.',['docs/INVARIANTS.md','src/worker.ts'],['test.workers.runtime']),
 d('invariant.workers.receipt','domain.workers','every outcome is settled by a durable receipt: a launch that produced nothing still confirms, a damaged or foreign receipt settles nothing, and re-reading a result gives the same outcome every time.',['docs/INVARIANTS.md','src/work.ts'],['test.workers.runtime']),
 d('invariant.workers.admission','domain.workers','packets are copied and made immutable before asynchronous admission, and an untrusted proposal can neither add authority nor enlarge a bounded batch.',['src/adapters/code-worker-packets.ts','test/code-worker-packets.test.ts'],['test.workers.packets']),
 d('invariant.workers.isolation','domain.workers','two attributed worktrees share a dirty base without touching the source index or HEAD, and each process writes only its isolated contribution with its own receipt.',['src/adapters/code-worker-workspaces.ts','test/code-worker-workspaces.test.ts'],['test.workers.workspaces','test.workers.worktrees']),
 d('invariant.integration.checkable_path','domain.integration','an integration plan touches only paths it has checked against the source tree: a foreign repository claim or an uncovered credential file refuses instead of bypassing the check.',['src/adapters/worktree-integration.ts','test/worktree-integration.test.ts'],['test.integration.worktrees']),
 d('invariant.integration.drift','domain.integration','source or result drift between plan and apply refuses before any change, and a correction that arrives mid-apply records an uncertain effect instead of overwriting what it has not read.',['src/adapters/worktree-integration.ts','test/worktree-integration.test.ts'],['test.integration.worktrees']),
 d('invariant.integration.ambiguity','domain.integration','a stated intention binds only when exactly one project defends itself; absence and ambiguity never invent a match, and approval stays withheld until the project is resolved.',['src/adapters/project-binding.ts','test/project-binding.test.ts'],['test.integration.binding']),
 d('invariant.integration.load','domain.integration','everything that ships loads: every module under src parses and imports, and the entry point named in the README loads.',['docs/INVARIANTS.md','test/loadability.test.ts'],['test.integration.loadability']),
 d('invariant.integration.portability','domain.integration','core names no machine: no user, path, home or runtime identity appears in src/core, and adapters take their roots from the caller.',['docs/INVARIANTS.md','test/portability.test.ts'],['test.integration.portability']),
]);
