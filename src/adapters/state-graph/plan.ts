/**
 * The addressable verification plan: the join from an impacted node id to the files a runner can execute.
 *
 * `computeChangeImpact` stops at node ids, and stopping there is right: an id is a fact about the graph,
 * while a command is an authority that only an owner registry grants. But the plan of record has to be
 * addressable, and an id a runner cannot turn into a command is not an address. This module supplies exactly
 * that join and nothing beyond it. It runs nothing and names no command: it reports the source paths a
 * `test` or `ci` node declares, which is the widest thing a graph can say about a check without pretending
 * to be the owner that executes it.
 *
 * Four groups, and four, because the task names four: `impactedNodes`, `invariants`, `tests`, `jobs`.
 * There is deliberately no fifth. The two flat path lists are projections of `tests` and `jobs`, asserted
 * equal to them by a test, so a runner may consume a file list without redoing the join.
 *
 * Determinism is a property here, not a preference, for the reason `manifest.ts` gives: the digest below
 * addresses a plan, and an address that moved for an unchanged tree would be worse than no address at all.
 * Every list is ordinal-sorted, every key order is fixed by construction order, and no clock, absolute path
 * or machine identity is read. Nothing here touches the filesystem: paths come from declarations, and whether
 * a declared path still exists on disk is the change set's business, not the planner's.
 */
import {createHash} from 'node:crypto';
import {graphRevision} from './loader.ts';
import {
 INVARIANTS,defineInvariants,evaluateInvariants,ownerCheckCatalog,unregisteredInvariants,
 type InvariantDeclaration,type InvariantRegistry,
} from './invariants.ts';
import {CAUSAL,computeChangeImpact,type ChangeImpactOptions,type ChangeImpactPlan,type PathChange} from './impact.ts';
import type {GraphNode,NodeKind,StateGraph} from './schema.ts';

/** Mirror of the impact engine's comparator: code-unit order, never locale, so two machines hash alike. */
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const frozen=(values:readonly string[]):readonly string[]=>Object.freeze([...values].sort(compare));
const EMPTY:readonly string[]=Object.freeze([]);
/** The two kinds `ownerCheckCatalog` already admits as checks, and so the two this planner resolves. */
const CHECK_KINDS:readonly NodeKind[]=Object.freeze(['test','ci']);

/**
 * Which source paths each check declares, indexed by node id and by path.
 *
 * Both directions are `Object.fromEntries`, and both are read through an own-property test below. `schema.ts`
 * admits `constructor`, `toString` and `valueOf` as node ids, and it admits `constructor` as a source path,
 * so a naive index read answers `Object` where the contract promises an array. That is not a crash a caller
 * can see: it is a lookup reporting a declaration nobody made, which is the exact shape of the misleadingly
 * empty impact REQ-SG02 forbids.
 */
export interface CheckIndex{
 /** Check node id to the source paths it declares, ordinal-sorted. */
 readonly byNode:Readonly<Record<string,readonly string[]>>;
 /** Declared source path to the check node ids declaring it, ordinal-sorted. */
 readonly byPath:Readonly<Record<string,readonly string[]>>;
}
export function buildCheckIndex(graph:StateGraph):CheckIndex{
 const paths=new Map<string,string[]>(),byNode=new Map<string,string[]>();
 for(const node of graph.nodes){
  if(!CHECK_KINDS.includes(node.kind))continue;
  const own=byNode.get(node.id);
  if(own)own.push(...node.sourceRefs.map(ref=>ref.path));else byNode.set(node.id,node.sourceRefs.map(ref=>ref.path));
  for(const ref of node.sourceRefs){
   const bucket=paths.get(ref.path);if(bucket)bucket.push(node.id);else paths.set(ref.path,[node.id]);
  }
 }
 const record=(source:Map<string,readonly string[]>):Readonly<Record<string,readonly string[]>>=>Object.freeze(
  Object.fromEntries([...source].sort((a,b)=>compare(a[0],b[0])).map(([key,bucket]):[string,readonly string[]]=>[key,frozen(bucket)])));
 return Object.freeze({byNode:record(byNode),byPath:record(paths)});
}
/**
 * One own-property read, shared by both directions of the join.
 *
 * An inherited property is never a declaration. Reading it is how a file named `constructor` stops looking
 * undeclared, and an undeclared file that reads as declared is the one failure this engine exists to prevent,
 * so the test is this function's point rather than a detail of it.
 */
const own=(table:Readonly<Record<string,readonly string[]>>,key:string):readonly string[]=>{
 const bucket=Object.hasOwn(table,key)?table[key]:undefined;
 return Array.isArray(bucket)?bucket:EMPTY;
};
/** The declared paths of one check node, by node id. An undeclared or prototype-named id gives no paths. */
export function pathsForCheck(index:CheckIndex,id:string):readonly string[]{return own(index.byNode,id);}
/** The check nodes declaring one path, by path. An undeclared path names no check, whatever it is named. */
export function checksForPath(index:CheckIndex,path:string):readonly string[]{return own(index.byPath,path);}

/** One impacted node, addressable: its ids plus the files it declares. */
export interface PlannedNode{
 readonly id:string;
 readonly kind:NodeKind;
 readonly domainId:string;
 /** Who declared the node: an identifier, never a capability and never a right to run it. */
 readonly ownerRef:string;
 /** Declared source paths, ordinal-sorted. The addressable form of the node. */
 readonly paths:readonly string[];
}
/** A check the plan requires: a `test` or `ci` node, with the files a runner can execute. */
export interface PlannedCheck extends PlannedNode{
 /** Invariant ids this check declares it validates, ordinal-sorted. */
 readonly validates:readonly string[];
}
/** One invariant the change put in doubt, with the checks that must run for it. */
export interface PlannedInvariant{
 readonly id:string;
 /** The claim, from the SG03.1 registry. Empty when the registry does not carry this invariant. */
 readonly statement:string;
 readonly domainId:string;
 readonly ownerRef:string;
 readonly sources:readonly string[];
 /** Every check this invariant is bound to, whether or not the change impacted it. */
 readonly checks:readonly string[];
 /** The subset of `checks` this plan requires, i.e. the ones the change actually impacted. */
 readonly requiredChecks:readonly string[];
 /** False when the registry carries the claim but no declared check enforces it. */
 readonly enforced:boolean;
 /** Bound checks that resolve to no declared node, ordinal-sorted. Non-empty forbids a complete plan. */
 readonly unresolvedChecks:readonly string[];
}
/**
 * Why a plan is not complete, one entry per cause. Empty iff `complete`.
 *
 * Each reason is a reuse of a mechanism that already exists and already has tests, never a second one that is
 * easier to forget: unmapped paths are SG02.2's narrowing, and the two invariant gaps are SG03.1's own
 * report read back out. A "check has no path" reason was written and then removed: `graphRevision`
 * revalidates the graph before anything is planned, and `schema.ts` admits one to thirty-two source
 * references per node, so a check that resolved to no path cannot be reached. Unreachable reason codes are
 * worse than no reason code, because they read as coverage nobody is checking.
 */
export type IncompleteReason='coverage-unmapped-paths'|'invariant-check-unresolved'|'invariant-unregistered';

/**
 * The plan of record for a change set: immutable, ordinal-sorted throughout, and content-addressed.
 *
 * `complete` is narrowed, never widened, and every narrowing is named in `incompleteReasons`. That is the
 * governing rule of the whole system: an unknown impact widens verification, so a plan that cannot prove it
 * reached everything must say so out loud rather than return a smaller plan that looks finished.
 */
export interface VerificationPlan{
 /** Content address of this plan's exact inputs. Two runs of one input share it; see STATE-GRAPH `get_required_tests`. */
 readonly digest:string;
 /** The revision of the graph this plan was computed against. */
 readonly graphRevision:string;
 readonly complete:boolean;
 /** Every reason `complete` is false. Empty iff complete. A caller that widens verification reads this. */
 readonly incompleteReasons:readonly IncompleteReason[];
 /** Changed paths, including vanished ones, that no node declared. Carried from SG02.2 so the refusal names what it refused on. */
 readonly unmappedPaths:readonly string[];
 /** Paths this change set removed, whether or not the graph still declared them. */
 readonly deletions:readonly string[];
 /** How many changed paths reached a declaration, and how many did not. */
 readonly coverage:Readonly<{declared:number;unmapped:number}>;
 /** Every impacted node, addressable, ordinal-sorted by id. */
 readonly impactedNodes:readonly PlannedNode[];
 /** Invariants the change puts in doubt, directly or through an impacted check, ordinal-sorted by id. */
 readonly invariants:readonly PlannedInvariant[];
 /** Impacted `test` nodes with the paths a runner can execute, ordinal-sorted by id. */
 readonly tests:readonly PlannedCheck[];
 /** Impacted `ci` nodes with the paths a runner can execute, ordinal-sorted by id. */
 readonly jobs:readonly PlannedCheck[];
 /** Flat projection of `tests`, deduplicated and ordinal-sorted: the file list a runner consumes. */
 readonly testPaths:readonly string[];
 /** Flat projection of `jobs`, deduplicated and ordinal-sorted. */
 readonly jobPaths:readonly string[];
 /** Flat projection of every selected invariant's `unresolvedChecks`: the checks that named nobody. */
 readonly unresolvedChecks:readonly string[];
}

export interface PlanOptions extends ChangeImpactOptions{readonly registry?:readonly InvariantDeclaration[]}

const projected=(checks:readonly PlannedCheck[]):readonly string[]=>frozen(checks.flatMap(check=>check.paths));
const addressable=(node:GraphNode,index:CheckIndex):PlannedNode=>Object.freeze({
 id:node.id,kind:node.kind,domainId:node.domainId,ownerRef:node.ownerRef,
 paths:frozen(CHECK_KINDS.includes(node.kind)?pathsForCheck(index,node.id):node.sourceRefs.map(ref=>ref.path))});
const required=(node:GraphNode,index:CheckIndex):PlannedCheck=>Object.freeze({...addressable(node,index),validates:frozen(node.invariantRefs)});

/**
 * Canonical text for the change set: every field `mapChanges` reads, and no field it ignores.
 *
 * A memo is only sound if two inputs it treats differently cannot share a digest, so `from` is kept even on a
 * kind that never looks at it. `{path,kind:'modified'}` and `{path,kind:'modified',from:'x'}` are one thing to
 * a careless canonical form and two different things to `mapChanges`, which refuses the second, so they are
 * serialised apart here. Canonicalising is total and never throws, which is what lets a query be addressed
 * before it is known to be admissible.
 */
const canonicalChanges=(changes:readonly PathChange[]):string=>
 [...changes].map(change=>JSON.stringify([change?.path??null,change?.kind??null,change?.from??null])).sort().join('\n');
/** Canonical text for the registry: sorted by id, every list sorted, so declaration order is not an input. */
const canonicalRegistry=(registry:InvariantRegistry):string=>JSON.stringify(
 [...registry].sort((a,b)=>compare(a.id,b.id)).map(entry=>[entry.id,entry.statement,entry.domainId,entry.ownerRef,frozen(entry.sources),frozen(entry.checks)]));
const digestOf=(text:string):string=>createHash('sha256').update(text).digest('hex');

/**
 * The digest a plan is addressed by, over every input that can change the plan.
 *
 * The registry is in here and that is not decoration. `graphRevision` covers the graph, and the graph alone
 * carries neither the invariant statements nor their check bindings: those live in a TypeScript registry, so
 * two runs over one graph with two registries are two different plans that would otherwise share one
 * address. An address that collides is worse than no address, because the caller has no way to notice.
 */
export function planInputDigest(graph:StateGraph,changes:readonly PathChange[],options:PlanOptions={}):string{
 return digestOf(JSON.stringify({
  version:1,graph:graphRevision(graph),
  registry:digestOf(canonicalRegistry(defineInvariants(options.registry??INVARIANTS))),
  edgeTypes:frozen(options.edgeTypes??CAUSAL),maxImpacted:options.maxImpacted??null,
  // Read from the option even though the mapping keeps its own ceiling, because it is a policy the caller
  // set and one address must not cover two policies.
  maxChanges:options.maxChanges??null,changes:canonicalChanges(changes)}));
}

/**
 * Build the addressable plan for a change set. Pure: one graph, registry and change set give one byte string.
 *
 * Selection is generous and never guessed. An invariant is in the plan when the change impacted it
 * directly, or when the change impacted a check that declares it validates: an invalidated check puts its own
 * claims in doubt, and dropping them would narrow verification on exactly the input where narrowing is
 * forbidden. A check is required when it is impacted, by kind, through the join above.
 */
export function planVerification(graph:StateGraph,changes:readonly PathChange[],options:PlanOptions={}):VerificationPlan{
 const registry=defineInvariants(options.registry??INVARIANTS);
 const impact:ChangeImpactPlan=computeChangeImpact(graph,changes,options);
 const index=buildCheckIndex(graph),nodes=new Map(graph.nodes.map(node=>[node.id,node]));
 // Required checks, in id order, so `tests` and `jobs` inherit a stable order from the same array.
 const checks=frozen([...new Set(impact.impacted.filter(node=>node.kind==='test'||node.kind==='ci').map(node=>node.id))])
  .map(id=>required(nodes.get(id)!,index));
 const requiredById=new Map(checks.map(check=>[check.id,check]));
 const report=evaluateInvariants(registry,ownerCheckCatalog(graph));
 const evaluated=new Map(report.entries.map(entry=>[entry.id,entry]));
 // `invariant-unregistered` narrows to what this plan actually selected: a registry gap elsewhere in the
 // graph is SG03.1's report to carry, not a reason to refuse a plan about something else.
 const unregistered=new Set(unregisteredInvariants(registry,graph));
 const selected=new Set(impact.impacted.filter(node=>node.kind==='invariant').map(node=>node.id));
 for(const check of checks)for(const id of check.validates)selected.add(id);
 const invariants=frozen([...selected]).map((id):PlannedInvariant=>{
  const entry=evaluated.get(id),node=nodes.get(id);
  // Registry first, graph second: the registry owns the claim and the binding, the graph owns the identity.
  // An invariant the registry does not carry keeps its id and reports no claim, which is a gap, not a blank.
  const bound=frozen(entry?.checks??node?.checkRefs??EMPTY);
  return Object.freeze({
   id,statement:entry?.statement??'',domainId:entry?.domainId??node?.domainId??'',ownerRef:entry?.ownerRef??node?.ownerRef??'',
   sources:frozen(entry?.sources??EMPTY),checks:bound,requiredChecks:frozen(bound.filter(check=>requiredById.has(check))),
   enforced:entry?.checkExists??false,unresolvedChecks:frozen(entry?.unresolved??[])});
 });
 // Two causes, kept apart so neither reads as the other. An invariant the registry does not carry has no
 // verdict to report, so it is the registration gap and not the binding gap; an invariant it does carry but
 // binds to no declared check is the binding gap. Folding them into one reason would name a cause that a
 // reader cannot act on.
 const unreached=invariants.some(entry=>evaluated.has(entry.id)&&!entry.enforced);
 const orphaned=invariants.some(entry=>unregistered.has(entry.id));
 const incompleteReasons:readonly IncompleteReason[]=Object.freeze([
  ...(impact.unmappedPaths.length>0?['coverage-unmapped-paths' as const]:[]),
  ...(unreached?['invariant-check-unresolved' as const]:[]),
  ...(orphaned?['invariant-unregistered' as const]:[]),
 ].sort(compare));
 const tests=Object.freeze(checks.filter(check=>check.kind==='test')),jobs=Object.freeze(checks.filter(check=>check.kind==='ci'));
 // `graphRevision` is read twice, once inside the digest and once for the field. Duplicating its body to
 // save one rehash would give the plan a second source of truth for its own address, which is the failure
 // this whole module is about, so the cost is paid instead.
 return Object.freeze({
  digest:planInputDigest(graph,changes,options),graphRevision:graphRevision(graph),
  // Narrow, never widen. The impact engine already refuses an unmapped path; a plan can only add reasons.
  complete:impact.complete&&incompleteReasons.length===0,
  incompleteReasons,unmappedPaths:impact.unmappedPaths,deletions:impact.deletions,coverage:impact.coverage,
  // The four addressable groups, in the order the task names them, so the JSON reads as the plan does.
  impactedNodes:Object.freeze(impact.impacted.map(node=>addressable(nodes.get(node.id)!,index))),
  invariants:Object.freeze(invariants),tests,jobs,
  testPaths:projected(tests),jobPaths:projected(jobs),
  unresolvedChecks:frozen(invariants.flatMap(entry=>entry.unresolvedChecks))});
}

export interface PlanResult{
 /** The plan's content address. */
 readonly digest:string;
 readonly plan:VerificationPlan;
 /** True when the plan came from the cache, so a caller can tell a memoised answer from a computed one. */
 readonly cached:boolean;
}
export interface PlanCache{
 /** How many queries were answered from the cache. */
 readonly hits:number;
 /** How many queries were computed. */
 readonly misses:number;
 /** How many plans are held. */
 readonly size:number;
 /** The plan for this query, memoised under the digest of its inputs. */
 plan(graph:StateGraph,changes:readonly PathChange[],options?:PlanOptions):PlanResult;
 /** The plan an address was handed out for, or undefined when this cache never computed it. */
 resolve(digest:string):VerificationPlan|undefined;
 clear():void;
}
/**
 * A bounded memo over `planVerification`.
 *
 * The cache may forget; a plan may never. Eviction here drops an answer that can be recomputed from inputs
 * still in hand, which is not the same as dropping a change that reached no seed. So the bound evicts the
 * oldest insertion instead of refusing the query, and a hit returns the very object the miss returned, so the
 * two are indistinguishable in content and only `cached` differs.
 */
export function createPlanCache(limit=256):PlanCache{
 if(!Number.isSafeInteger(limit)||limit<1)throw Error(`Plan cache limit must be a positive safe integer, got ${String(limit)}.`);
 const held=new Map<string,VerificationPlan>();let hits=0,misses=0;
 return Object.freeze({
  get hits(){return hits;},get misses(){return misses;},get size(){return held.size;},
  plan(graph:StateGraph,changes:readonly PathChange[],options:PlanOptions={}):PlanResult{
   const digest=planInputDigest(graph,changes,options),memo=held.get(digest);
   if(memo!==undefined){hits++;return Object.freeze({digest,plan:memo,cached:true});}
   misses++;
   // Computed before it is stored, so an input this refuses never becomes an address.
   const plan=planVerification(graph,changes,options);
   held.delete(digest);held.set(digest,plan);
   if(held.size>limit){const oldest=held.keys().next();if(!oldest.done)held.delete(oldest.value);}
   return Object.freeze({digest,plan,cached:false});
  },
  resolve(digest:string):VerificationPlan|undefined{return held.get(digest);},
  clear():void{held.clear();hits=0;misses=0;},
 });}