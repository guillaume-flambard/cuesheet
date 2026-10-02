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

export interface ImpactOptions{readonly maxImpacted?:number;readonly edgeTypes?:readonly EdgeType[]}
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

/** The mapping seam SG02.2 will drive from a diff. Unmapped paths resolve to empty here, not to a guess. */
export function nodesForSourcePath(index:ReverseIndex,path:string):readonly string[]{return index.bySourcePath[path]??EMPTY_IDS;}

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