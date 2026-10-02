import type {EdgeType,GraphNode,NodeKind,StateGraph} from './schema.ts';

/** Mirror of the loader's comparator: code-unit order, never locale, so two machines hash and order alike. */
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const EMPTY_IDS:readonly string[]=Object.freeze([]);

/**
 * Every relation in schema.ts is stored as the same dependent/dependency pair, so every one of them is
 * a route along which changing the dependency can stale the dependent. `depends_on` is the causal edge
 * REQ-SG02 names; `implements`, `validates`, `contains` and `describes` carry the identical shape, and a
 * narrower default would answer "nothing to do" to a change that plainly invalidated a check, a contract
 * or a document, which is exactly the misleadingly empty impact the requirement forbids. Narrowing is a
 * caller policy (SG02.3 decides what to re-run), so it is a parameter here and never a silent default.
 */
const CAUSAL:readonly EdgeType[]=Object.freeze(['contains','depends_on','describes','implements','validates']);
/**
 * Deliberately the schema ceiling, not an arbitrary round number: parseStateGraph admits at most 10000
 * nodes, so a closure over admitted input can never reach this and the refusal never fires on a graph
 * that passed validation. It fires on input that skipped validation, which is the case a bound exists for.
 */
export const DEFAULT_MAX_IMPACTED=10000;
/**
 * A ceiling on the change set, matched to the node ceiling for the same reason: a diff is untrusted input
 * exactly as a manifest is, and refusing is the only honest answer to a set too large to hold. Never a
 * truncation, because a silently dropped tail is a change that never reached a seed.
 */
export const DEFAULT_MAX_CHANGES=10000;

export interface ImpactOptions{readonly maxImpacted?:number;readonly edgeTypes?:readonly EdgeType[]}
export interface ChangeImpactOptions extends ImpactOptions{readonly maxChanges?:number}
export interface DependentLink{readonly dependent:string;readonly edge:string;readonly edgeType:EdgeType}
export interface ReverseIndex{
 readonly nodeIds:readonly string[];
 /** dependency id -> the dependents it stales when it changes, in the direction impact travels. */
 readonly dependents:Readonly<Record<string,readonly DependentLink[]>>;
 readonly bySourcePath:Readonly<Record<string,readonly string[]>>;
}
export type ImpactReasonKind='seed'|'dependent';
export interface ImpactReason{
 readonly kind:ImpactReasonKind;
 readonly seed:string;
 /** The node the last hop stepped from; the seed itself when kind is 'seed'. */
 readonly via:string;
 readonly edge:string|null;
 readonly edgeType:EdgeType|null;
}
export interface ImpactedNode{
 readonly id:string;
 readonly kind:NodeKind;
 readonly domainId:string;
 /** Ordinal-smallest member of the node's strongly connected component; a single node is its own component. */
 readonly component:string;
 readonly inCycle:boolean;
 readonly hops:number;
 readonly reason:ImpactReason;
}
export interface ImpactPlan{
 readonly seeds:readonly string[];
 /** Requested seeds that no node declares. Non-empty means the plan is not a statement that nothing changed. */
 readonly unresolved:readonly string[];
 readonly complete:boolean;
 readonly impacted:readonly ImpactedNode[];
 /** Impacted components of size > 1, each member-sorted, ordered by smallest member. */
 readonly cycles:readonly (readonly string[])[];
 readonly maxImpacted:number;
}

const EMPTY_LINKS:readonly DependentLink[]=Object.freeze([]);

/**
 * The same path shape `schema.ts` admits for a declared source, so a diff path and a declared source are
 * comparable strings. A change list arrives from outside the trust boundary and is matched against the
 * graph by exact string, which means an unchecked `../` or absolute path is a key that simply never
 * matches: not a breach, but a change that vanishes from the accounting and leaves the plan looking
 * complete. Refusing the whole set is the honest response to a malformed one.
 */
const pathShape=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=240&&
 Buffer.from(value,'utf8').toString('utf8')===value&&!/[\\:*?\x00-\x1f\x7f]/.test(value)&&
 !value.split('/').some(part=>!part||part==='.'||part==='..'||part!==part.trim()||part.endsWith('.'));
const changeShape=(value:unknown):value is PathChange=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const c=value as {path?:unknown;kind?:unknown;from?:unknown};
 if(!pathShape(c.path))return false;
 if(c.kind!=='added'&&c.kind!=='modified'&&c.kind!=='deleted'&&c.kind!=='renamed')return false;
 // `from` is the vanished side of a rename. Accepting it on any other kind would let a caller smuggle a
 // second, unchecked path past the validation above under a kind that never looks at it.
 if(c.kind==='renamed')return pathShape(c.from);
 return c.from===undefined;
};

/** The index stays closed over declared nodes, so a hand-built graph object cannot inject ids it never names. Not schema validation: no shape is re-checked. */
export function buildReverseIndex(graph:StateGraph,options:ImpactOptions={}):ReverseIndex{
 const types=new Set<EdgeType>(options.edgeTypes??CAUSAL);
 const dependents=new Map<string,DependentLink[]>(),paths=new Map<string,string[]>(),nodeIds:string[]=[];
 for(const node of graph.nodes){
  nodeIds.push(node.id);dependents.set(node.id,[]);
  for(const ref of node.sourceRefs){const bucket=paths.get(ref.path);if(bucket)bucket.push(node.id);else paths.set(ref.path,[node.id]);}
 }
 for(const edge of graph.edges){
  if(!types.has(edge.type))continue;
  const bucket=dependents.get(edge.dependency);
  if(!bucket||!dependents.has(edge.dependent))continue;
  bucket.push(Object.freeze({dependent:edge.dependent,edge:edge.id,edgeType:edge.type}));
 }
 const order=[...nodeIds].sort(compare);
 return Object.freeze({
  nodeIds:Object.freeze(order),
  dependents:Object.freeze(Object.fromEntries([...dependents].sort((a,b)=>compare(a[0],b[0])).map(([id,bucket]):[string,readonly DependentLink[]]=>[id,Object.freeze([...bucket].sort((a,b)=>compare(a.dependent,b.dependent)||compare(a.edge,b.edge)))]))),
  bySourcePath:Object.freeze(Object.fromEntries([...paths].sort((a,b)=>compare(a[0],b[0])).map(([path,bucket]):[string,readonly string[]]=>[path,Object.freeze([...bucket].sort(compare))]))),
 });
}

/**
 * The mapping seam a diff is read through. Unmapped paths resolve to empty here, not to a guess.
 *
 * The own-property test is the point of this function, not a detail. `bySourcePath` is a plain object
 * (built by `Object.fromEntries`), so a naive `index.bySourcePath[path] ?? EMPTY_IDS` answers
 * `Object`, `toString` or `valueOf` for a file named `constructor`, and a real diff is free to contain
 * such a path. Returning a function where the contract promises an array of node ids is not a crash the
 * caller can see: it is an unmapped path that stops looking unmapped, which is the exact failure this
 * whole task exists to remove. An inherited property is never a declaration, so it is never a seed.
 */
export function nodesForSourcePath(index:ReverseIndex,path:string):readonly string[]{
 const bucket=Object.hasOwn(index.bySourcePath,path)?index.bySourcePath[path]:undefined;
 return Array.isArray(bucket)?bucket:EMPTY_IDS;
}

/**
 * What a change set says about one path, in the vocabulary of the diff and not of the graph.
 *
 * `deleted` and `renamed.from` are the whole reason this type exists. A deletion leaves no file to read,
 * so any mapping that resolves paths by looking at what is still there drops exactly the change that
 * removed a contract or a test. The path is the evidence, and it is the whole of the evidence.
 */
export type ChangeKind='added'|'modified'|'deleted'|'renamed';
export interface PathChange{readonly path:string;readonly kind:ChangeKind;readonly from?:string}

/**
 * The seed mapping of a change set, and the coverage it failed to reach.
 *
 * `unresolved` and `deletions` are the two halves of the same refusal. An unmapped path is a file this
 * graph says nothing about, and a deletion is a path that no longer exists for the graph to say anything
 * about. Neither may be summarised away: both travel in the plan, and a non-empty `unresolved` is what
 * keeps `complete` false.
 */
export interface ChangeMapping{
  /** Declared nodes seeded by the change set, deduplicated and ordinal-sorted. */
  readonly seeds:readonly string[];
  /** Changed paths no node declares, plus the vanished side of a rename. Empty means full coverage. */
  readonly unresolved:readonly string[];
  /** Paths this change set removed, whether or not the graph still declared them. Never silently dropped. */
  readonly deletions:readonly string[];
  /** How many changed paths reached a declaration, and how many did not. */
  readonly coverage:Readonly<{declared:number;unmapped:number}>;
}

/**
 * Map a change set onto graph seeds. Pure: it reads the index and the change list and nothing else, so
 * the same change set over the same revision gives the same mapping on any machine.
 *
 * A path is covered when a node declares it. A rename is covered when either of its two names is, because
 * a renamed file is one logical file and the graph is free to know it under either name. Everything else
 * is unresolved, and an unresolved path is never turned into a seed by guessing which node it might have
 * belonged to: a wrong seed is an impact claim about a file nobody declared.
 */
export function mapChanges(index:ReverseIndex,changes:readonly PathChange[]):ChangeMapping{
 const maxChanges=DEFAULT_MAX_CHANGES;
 if(changes.length>maxChanges)throw Error(`Change set exceeds maxChanges=${maxChanges}: ${changes.length} changes.`);
 for(const change of changes)if(!changeShape(change))throw Error('Change set holds a malformed entry.');
 const seeds=new Set<string>(),unresolved=new Set<string>(),deletions=new Set<string>();
 let declared=0,unmapped=0;
 for(const change of changes){
  const paths=change.kind==='renamed'&&change.from!==undefined?[change.from,change.path]:[change.path];
  if(change.kind==='deleted')deletions.add(change.path);
  if(change.kind==='renamed'&&change.from!==undefined)deletions.add(change.from);
  // A rename is one file under two names, so either name covering it is enough. Every other change is
  // one path, and one unmapped path is one hole in the coverage.
  const covered=change.kind==='renamed'?paths.some(path=>nodesForSourcePath(index,path).length>0):nodesForSourcePath(index,change.path).length>0;
  if(!covered){unmapped++;for(const path of paths)unresolved.add(path);continue;}
  declared++;
  for(const path of paths)for(const id of nodesForSourcePath(index,path))seeds.add(id);
 }
 return Object.freeze({
  seeds:Object.freeze([...seeds].sort(compare)),
  unresolved:Object.freeze([...unresolved].sort(compare)),
  deletions:Object.freeze([...deletions].sort(compare)),
  coverage:Object.freeze({declared,unmapped}),
 });
}

/**
 * An impact plan plus the change coverage that produced it.
 *
 * `complete` is inherited from the closure and then narrowed by coverage, never widened: a plan may be
 * incomplete for exactly one reason here, an unmapped path. This is the composition that used to lie.
 * `nodesForSourcePath` returned `[]` for an unknown file, `computeImpact` read `[]` as "nothing is
 * affected" and reported `complete: true`, and the caller had no way to tell an untouched system from a
 * graph that had never heard of the file that changed. Here the same change set yields `complete: false`
 * and names the path, and `deletions` proves a removal was represented rather than dropped.
 */
export interface ChangeImpactPlan extends ImpactPlan{
  readonly deletions:readonly string[];
  /** Changed paths, including vanished ones, that no node declared. Mirrors `unresolved` for readers that key on paths. */
  readonly unmappedPaths:readonly string[];
  readonly coverage:Readonly<{declared:number;unmapped:number}>;
}

/**
 * The diff-to-seed mapping, composed with the closure it feeds, refusing the empty complete plan.
 *
 * Unmapped paths are handed to `computeImpact` as requested seeds precisely so the existing unresolved
 * mechanism does the refusing: one well-tested path to incompleteness beats a second, easier-to-forget one.
 * They are also reported separately by path, because a path and a node id are different namespaces and a
 * caller comparing them must not have to know that an unmapped path was laundered through the seed list.
 */
export function computeChangeImpact(graph:StateGraph,changes:readonly PathChange[],options:ChangeImpactOptions={}):ChangeImpactPlan{
 const index=buildReverseIndex(graph,options);
 const mapping=mapChanges(index,changes);
 const plan=computeImpact(graph,[...mapping.seeds,...mapping.unresolved],options);
 return Object.freeze({...plan,
  // Narrow, never widen. An unmapped path is a hole whatever the closure concluded about the seeds.
  complete:plan.complete&&mapping.unresolved.length===0,
  deletions:mapping.deletions,unmappedPaths:mapping.unresolved,coverage:mapping.coverage});
}

/**
 * Iterative Tarjan over the impact direction. Tarjan is stack-hungry on exactly the deep hostile graph
 * this engine must survive, so the call frames live in `work` instead. The partition is the same as in
 * the dependency direction (SCCs ignore arrow direction), which is why reversing the adjacency here is
 * free and keeps the traversal the same walk the closure performs.
 */
export function strongComponents(index:ReverseIndex):readonly (readonly string[])[]{
 const indices=new Map<string,number>(),low=new Map<string,number>(),onStack=new Set<string>(),stack:string[]=[];
 const out:(readonly string[])[]=[];let counter=0;
 for(const root of index.nodeIds){
  if(indices.has(root))continue;
  indices.set(root,counter);low.set(root,counter);counter++;onStack.add(root);stack.push(root);
  const work=[{id:root,cursor:0}];
  while(work.length>0){
   const frame=work[work.length-1]!;
   const links=index.dependents[frame.id]??EMPTY_LINKS;
   if(frame.cursor<links.length){
    const next=links[frame.cursor++]!.dependent,seen=indices.get(next);
    if(seen===undefined){indices.set(next,counter);low.set(next,counter);counter++;onStack.add(next);stack.push(next);work.push({id:next,cursor:0});}
    else if(onStack.has(next))low.set(frame.id,Math.min(low.get(frame.id)!,seen));
   }else{
    // A finished frame closes its own component when it is a root, then hands its lowlink to its parent.
    work.pop();
    if(low.get(frame.id)===indices.get(frame.id)){
     const component:string[]=[];let member:string;
     do{member=stack.pop()!;onStack.delete(member);component.push(member);}while(member!==frame.id);
     out.push(Object.freeze(component.sort(compare)));
    }
    const parent=work[work.length-1];
    if(parent)low.set(parent.id,Math.min(low.get(parent.id)!,low.get(frame.id)!));
   }
  }
 }
 return Object.freeze([...out].sort((a,b)=>compare(a[0]!,b[0]!)));
}

interface Witness{id:string;hops:number;seed:string;via:string;edge:string|null;edgeType:EdgeType|null}
/**
 * Candidates for one node inside one breadth-first round always share a hop count, so
 * there is no hop term to compare here. The tie-break is the last hop's edge id, then the
 * seed id, and it is total because edge ids are unique and each edge has one dependent.
 * Returns a sign, not a boolean: a truthy test would accept a worse witness.
 */
const less=(a:Witness,b:Witness)=>compare(a.edge??'',b.edge??'')||compare(a.seed,b.seed);

/**
 * Transitive closure of the dependents of each seed, one explicit witness per impacted node: the
 * shortest path from any seed, ties broken by the last hop's edge id and then by the smallest seed
 * id. All witnesses are therefore a function of the graph alone. Enumerating every path is not an
 * option here, it is exponential in a diamond and there is no bounded way to store it.
 *
 * Each node is expanded exactly once, at the layer that first reaches it, so cycles terminate without
 * the SCC pass and without an empty impact: a cyclic node gets a real witness like any other. Iterative
 * throughout; the only recursion-free requirement that matters here is that no hostile graph can reach
 * the JS stack limit.
 */
export function computeImpact(graph:StateGraph,seeds:readonly string[],options:ImpactOptions={}):ImpactPlan{
 const max=options.maxImpacted??DEFAULT_MAX_IMPACTED;
 if(!Number.isSafeInteger(max)||max<1)throw Error(`Impact maxImpacted must be a positive safe integer, got ${String(max)}.`);
 const index=buildReverseIndex(graph,options);
 const declared=new Set(index.nodeIds),nodes=new Map<string,GraphNode>();
 for(const node of graph.nodes)nodes.set(node.id,node);
 const resolved:string[]=[],unresolved:string[]=[];
 for(const seed of seeds)(declared.has(seed)?resolved:unresolved).push(seed);
 // The Set below only deduplicates; every array that reaches the caller is re-sorted by `compare`.
 const requested=Object.freeze([...new Set(resolved)].sort(compare)),absent=Object.freeze([...new Set(unresolved)].sort(compare));
 if(requested.length>max)throw Error(`Impact seeds exceed maxImpacted=${max}: ${requested.length} requested.`);
 const best=new Map<string,Witness>(),reached=new Set<string>();let frontier:Witness[]=[];
 for(const seed of requested){const witness:Witness={id:seed,hops:0,seed,via:seed,edge:null,edgeType:null};best.set(seed,witness);reached.add(seed);frontier.push(witness);}
 while(frontier.length>0){
  const candidates=new Map<string,Witness>();
  for(const frame of frontier){
   for(const link of index.dependents[frame.id]??EMPTY_LINKS){
    // A node already reached sits at a strictly shorter hop count, so a later witness cannot win.
    if(reached.has(link.dependent))continue;
    const existing=candidates.get(link.dependent),candidate:Witness={id:link.dependent,hops:frame.hops+1,seed:frame.seed,via:frame.id,edge:link.edge,edgeType:link.edgeType};
    if(!existing||less(candidate,existing)<0)candidates.set(link.dependent,candidate);
   }
  }
  const winners=[...candidates.values()].sort(less);
  for(const witness of winners){best.set(witness.id,witness);reached.add(witness.id);}
  // Refuse rather than truncate: a truncated closure reports coverage it does not have.
  if(reached.size>max)throw Error(`Impact closure exceeded maxImpacted=${max}: refusing to truncate at ${reached.size} impacted nodes.`);
  frontier=winners;
 }
 const components=strongComponents(index),head=new Map<string,string>(),width=new Map<string,number>();
 for(const component of components)for(const id of component){head.set(id,component[0]!);width.set(id,component.length);}
 const impacted=Object.freeze([...best.values()].map(witness=>{
  const node=nodes.get(witness.id)!;
  return Object.freeze({id:witness.id,kind:node.kind,domainId:node.domainId,component:head.get(witness.id)!,inCycle:width.get(witness.id)!>1,hops:witness.hops,
   reason:Object.freeze({kind:witness.hops===0?'seed' as const:'dependent' as const,seed:witness.seed,via:witness.via,edge:witness.edge,edgeType:witness.edgeType})});
 }).sort((a,b)=>compare(a.id,b.id)));
 const hit=new Set(impacted.map(node=>node.id));
 return Object.freeze({seeds:requested,unresolved:absent,complete:absent.length===0,impacted,maxImpacted:max,
  cycles:Object.freeze(components.filter(component=>component.length>1&&component.some(id=>hit.has(id))))});
}