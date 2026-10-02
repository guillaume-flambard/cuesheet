/**
 * The first Cuesheet manifest, as a generator rather than a hand-edited file.
 *
 * A file full of digests cannot stay true if a person types into it, so this
 * module declares the subsystems by repository-relative path only and hashes the
 * real bytes on every build. The declaration is bounded on purpose: it names the
 * systems this repository actually has, not every file, because a manifest that
 * is merely exhaustive carries no more meaning than the tree it mirrors.
 *
 * Determinism is a property, not a preference here. `graphRevision` is a content
 * hash of this output, so a timestamp, a locale-dependent sort or an unordered
 * set would move the revision for a tree that did not change. Everything below
 * sorts with an ordinal comparator, keys are fixed by construction order, and no
 * clock, absolute path or machine identity is read.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isAbsolute,relative,resolve} from 'node:path';
import {parseStateGraph,type EdgeType,type GraphEdge,type GraphNode,type NodeKind,type SourceRef,type StateGraph} from './schema.ts';
/** The only path the loader will read, kept beside the declaration that fills it. */
export const MANIFEST_PATH='.cuesheet-project/graph.json';
/** An identifier naming who declared the node, never a capability or a right. */
const OWNER='owner.cuesheet';
interface Declaration{readonly id:string;readonly kind:NodeKind;readonly domainId:string;readonly sources:readonly string[];readonly contractRefs:readonly string[];readonly invariantRefs:readonly string[];readonly checkRefs:readonly string[]}
interface Link{readonly type:EdgeType;readonly dependent:string;readonly dependency:string}
type Refs=Readonly<{contract?:readonly string[];invariant?:readonly string[];check?:readonly string[]}>;
const ordinal=(a:string,b:string)=>a<b?-1:a>b?1:0;
const sorted=(values:readonly string[])=>Object.freeze([...values].sort(ordinal));
const n=(id:string,kind:NodeKind,domainId:string,sources:readonly string[],refs:Refs={}):Declaration=>Object.freeze({id,kind,domainId,sources:Object.freeze([...sources]),contractRefs:sorted(refs.contract??[]),invariantRefs:sorted(refs.invariant??[]),checkRefs:sorted(refs.check??[])});
const e=(type:EdgeType,dependent:string,dependency:string):Link=>Object.freeze({type,dependent,dependency});
/** Every path below is a repository-relative file that exists in this tree. */
const NODES:readonly Declaration[]=Object.freeze([
 // Sessions: the durable journal a session writes through, and the view over it.
 n('domain.sessions','domain','domain.sessions',['src/adapters/session-store.ts','src/adapters/terminal-session.ts']),
 n('entity.sessions.journal','entity','domain.sessions',['src/adapters/session-store.ts'],{contract:['contract.sessions.store']}),
 n('entity.sessions.terminal','entity','domain.sessions',['src/adapters/terminal-session.ts'],{contract:['contract.sessions.terminal']}),
 n('entity.sessions.view','entity','domain.sessions',['apps/terminal/src/producer/session-view.ts']),
 n('contract.sessions.store','contract','domain.sessions',['src/adapters/session-store.ts']),
 n('contract.sessions.terminal','contract','domain.sessions',['src/adapters/terminal-session.ts']),
 n('invariant.sessions.durable','invariant','domain.sessions',['src/adapters/terminal-session.ts','test/terminal-sessions.test.ts'],{check:['test.sessions.durability']}),
 n('invariant.sessions.refusal','invariant','domain.sessions',['src/adapters/session-store.ts','test/terminal-sessions.test.ts'],{check:['test.sessions.durability']}),
 n('test.sessions.durability','test','domain.sessions',['test/terminal-sessions.test.ts'],{invariant:['invariant.sessions.durable','invariant.sessions.refusal']}),
 n('test.sessions.journal','test','domain.sessions',['test/adapters.test.ts']),
 n('source.sessions.continuity','source','domain.sessions',['docs/harness/05-CONTINUITY.md']),
 // Objectives: what the run is for, kept distinct from the event that carries it.
 n('domain.objectives','domain','domain.objectives',['src/adapters/objectives.ts','docs/harness/01-OBJECTIVES.md']),
 n('entity.objectives.objective','entity','domain.objectives',['src/adapters/objectives.ts'],{contract:['contract.objectives.record']}),
 n('entity.objectives.plan','entity','domain.objectives',['src/adapters/work-plans.ts'],{contract:['contract.objectives.plan']}),
 n('entity.objectives.intent','entity','domain.objectives',['src/core/intent.ts'],{contract:['contract.objectives.intent']}),
 n('contract.objectives.record','contract','domain.objectives',['src/adapters/objectives.ts']),
 n('contract.objectives.plan','contract','domain.objectives',['src/adapters/work-plans.ts']),
 n('contract.objectives.intent','contract','domain.objectives',['src/core/intent.ts']),
 n('invariant.objectives.identity','invariant','domain.objectives',['src/adapters/objectives.ts','test/objectives.test.ts'],{check:['test.objectives.objectives']}),
 n('invariant.objectives.hypothesis','invariant','domain.objectives',['src/adapters/objectives.ts','test/objectives.test.ts'],{check:['test.objectives.objectives']}),
 n('invariant.objectives.proof','invariant','domain.objectives',['src/adapters/objectives.ts','test/objectives.test.ts'],{check:['test.objectives.objectives']}),
 n('invariant.objectives.plan_refusal','invariant','domain.objectives',['src/adapters/work-plans.ts','test/work-plans.test.ts'],{check:['test.objectives.plans']}),
 n('invariant.objectives.routing','invariant','domain.objectives',['src/core/intent.ts','test/intent.test.ts'],{check:['test.objectives.intent']}),
 n('test.objectives.objectives','test','domain.objectives',['test/objectives.test.ts'],{invariant:['invariant.objectives.hypothesis','invariant.objectives.identity','invariant.objectives.proof']}),
 n('test.objectives.plans','test','domain.objectives',['test/work-plans.test.ts'],{invariant:['invariant.objectives.plan_refusal']}),
 n('test.objectives.intent','test','domain.objectives',['test/intent.test.ts'],{invariant:['invariant.objectives.routing']}),
 n('source.objectives.spec','source','domain.objectives',['docs/harness/01-OBJECTIVES.md']),
 // Workers: delegation, bounded batches, isolated workspaces and the spawned process.
 n('domain.workers','domain','domain.workers',['src/core/delegation.ts','docs/harness/MULTI-WORKER.md']),
 n('entity.workers.delegation','entity','domain.workers',['src/core/delegation.ts'],{contract:['contract.workers.requirements']}),
 n('entity.workers.packets','entity','domain.workers',['src/adapters/code-worker-packets.ts'],{contract:['contract.workers.packet']}),
 n('entity.workers.loop','entity','domain.workers',['src/adapters/code-worker-loop.ts']),
 n('entity.workers.workspaces','entity','domain.workers',['src/adapters/managed-worktrees.ts','src/adapters/code-worker-workspaces.ts']),
 n('entity.workers.process','entity','domain.workers',['src/worker.ts']),
 n('contract.workers.requirements','contract','domain.workers',['src/core/delegation.ts']),
 n('contract.workers.packet','contract','domain.workers',['src/adapters/code-worker-packets.ts']),
 n('invariant.workers.confinement','invariant','domain.workers',['docs/INVARIANTS.md','src/worker.ts'],{check:['test.workers.runtime']}),
 n('invariant.workers.receipt','invariant','domain.workers',['docs/INVARIANTS.md','src/work.ts'],{check:['test.workers.runtime']}),
 n('invariant.workers.admission','invariant','domain.workers',['src/adapters/code-worker-packets.ts','test/code-worker-packets.test.ts'],{check:['test.workers.packets']}),
 n('invariant.workers.isolation','invariant','domain.workers',['src/adapters/code-worker-workspaces.ts','test/code-worker-workspaces.test.ts'],{check:['test.workers.worktrees','test.workers.workspaces']}),
 n('test.workers.runtime','test','domain.workers',['test/worker-runtime.test.ts'],{invariant:['invariant.workers.confinement','invariant.workers.receipt']}),
 n('test.workers.delegation','test','domain.workers',['test/delegation.test.ts']),
 n('test.workers.packets','test','domain.workers',['test/code-worker-packets.test.ts'],{invariant:['invariant.workers.admission']}),
 n('test.workers.workspaces','test','domain.workers',['test/code-worker-workspaces.test.ts'],{invariant:['invariant.workers.isolation']}),
 n('test.workers.worktrees','test','domain.workers',['test/managed-worktrees.test.ts'],{invariant:['invariant.workers.isolation']}),
 n('source.workers.multi','source','domain.workers',['docs/harness/MULTI-WORKER.md']),
 // Integration: composition, worktree merge, project binding, context and the surface.
 n('domain.integration','domain','domain.integration',['src/index.ts','docs/ARCHITECTURE.md']),
 n('entity.integration.composition','entity','domain.integration',['src/adapters/code-worker-integration.ts']),
 n('entity.integration.worktree_merge','entity','domain.integration',['src/adapters/worktree-integration.ts'],{contract:['contract.integration.plan']}),
 n('entity.integration.project_binding','entity','domain.integration',['src/adapters/project-binding.ts'],{contract:['contract.integration.binding']}),
 n('entity.integration.shared_context','entity','domain.integration',['src/adapters/shared-context.ts'],{contract:['contract.integration.context']}),
 n('entity.integration.surface','entity','domain.integration',['src/index.ts','src/cuesheet.ts'],{contract:['contract.integration.entry']}),
 n('entity.integration.producer','entity','domain.integration',['apps/terminal/src/producer/index.ts']),
 n('contract.integration.plan','contract','domain.integration',['src/adapters/worktree-integration.ts']),
 n('contract.integration.binding','contract','domain.integration',['src/adapters/project-binding.ts']),
 n('contract.integration.context','contract','domain.integration',['src/adapters/shared-context.ts']),
 n('contract.integration.entry','contract','domain.integration',['src/index.ts','src/cuesheet.ts']),
 n('invariant.integration.checkable_path','invariant','domain.integration',['src/adapters/worktree-integration.ts','test/worktree-integration.test.ts'],{check:['test.integration.worktrees']}),
 n('invariant.integration.drift','invariant','domain.integration',['src/adapters/worktree-integration.ts','test/worktree-integration.test.ts'],{check:['test.integration.worktrees']}),
 n('invariant.integration.ambiguity','invariant','domain.integration',['src/adapters/project-binding.ts','test/project-binding.test.ts'],{check:['test.integration.binding']}),
 n('invariant.integration.load','invariant','domain.integration',['docs/INVARIANTS.md','test/loadability.test.ts'],{check:['test.integration.loadability']}),
 n('invariant.integration.portability','invariant','domain.integration',['docs/INVARIANTS.md','test/portability.test.ts'],{check:['test.integration.portability']}),
 n('test.integration.path','test','domain.integration',['test/integration-path.test.ts']),
 n('test.integration.worktrees','test','domain.integration',['test/worktree-integration.test.ts'],{invariant:['invariant.integration.checkable_path','invariant.integration.drift']}),
 n('test.integration.binding','test','domain.integration',['test/project-binding.test.ts'],{invariant:['invariant.integration.ambiguity']}),
 n('test.integration.context','test','domain.integration',['test/shared-context.test.ts']),
 n('test.integration.loadability','test','domain.integration',['test/loadability.test.ts'],{invariant:['invariant.integration.load']}),
 n('test.integration.portability','test','domain.integration',['test/portability.test.ts'],{invariant:['invariant.integration.portability']}),
 n('source.integration.architecture','source','domain.integration',['docs/ARCHITECTURE.md']),
 n('source.integration.invariants','source','domain.integration',['docs/INVARIANTS.md']),
]);
/**
 * Typed links between declared nodes. `depends_on` is asserted only where an
 * import proves it, because an inferred dependency is the kind of claim a graph
 * cannot check and would be trusted anyway.
 */
const LINKS:readonly Link[]=Object.freeze([
 e('contains','domain.sessions','entity.sessions.journal'),e('contains','domain.sessions','entity.sessions.terminal'),e('contains','domain.sessions','entity.sessions.view'),e('contains','domain.sessions','source.sessions.continuity'),
 e('implements','entity.sessions.journal','contract.sessions.store'),e('implements','entity.sessions.terminal','contract.sessions.terminal'),
 e('depends_on','entity.sessions.terminal','entity.sessions.journal'),e('depends_on','entity.sessions.view','entity.sessions.terminal'),
 e('validates','test.sessions.durability','invariant.sessions.durable'),e('validates','test.sessions.durability','invariant.sessions.refusal'),e('validates','test.sessions.journal','contract.sessions.store'),
 e('describes','source.sessions.continuity','entity.sessions.journal'),e('describes','source.sessions.continuity','entity.sessions.terminal'),
 e('contains','domain.objectives','entity.objectives.objective'),e('contains','domain.objectives','entity.objectives.plan'),e('contains','domain.objectives','entity.objectives.intent'),e('contains','domain.objectives','source.objectives.spec'),
 e('implements','entity.objectives.objective','contract.objectives.record'),e('implements','entity.objectives.plan','contract.objectives.plan'),e('implements','entity.objectives.intent','contract.objectives.intent'),
 e('validates','test.objectives.objectives','invariant.objectives.hypothesis'),e('validates','test.objectives.objectives','invariant.objectives.identity'),e('validates','test.objectives.objectives','invariant.objectives.proof'),e('validates','test.objectives.plans','invariant.objectives.plan_refusal'),e('validates','test.objectives.intent','invariant.objectives.routing'),
 e('describes','source.objectives.spec','entity.objectives.intent'),e('describes','source.objectives.spec','entity.objectives.objective'),
 e('contains','domain.workers','entity.workers.delegation'),e('contains','domain.workers','entity.workers.packets'),e('contains','domain.workers','entity.workers.loop'),e('contains','domain.workers','entity.workers.workspaces'),e('contains','domain.workers','entity.workers.process'),e('contains','domain.workers','source.workers.multi'),
 e('implements','entity.workers.delegation','contract.workers.requirements'),e('implements','entity.workers.packets','contract.workers.packet'),
 e('depends_on','entity.workers.loop','entity.workers.workspaces'),e('depends_on','entity.workers.workspaces','entity.workers.packets'),
 e('validates','test.workers.runtime','entity.workers.process'),e('validates','test.workers.runtime','invariant.workers.confinement'),e('validates','test.workers.runtime','invariant.workers.receipt'),e('validates','test.workers.delegation','contract.workers.requirements'),e('validates','test.workers.packets','invariant.workers.admission'),e('validates','test.workers.workspaces','invariant.workers.isolation'),e('validates','test.workers.worktrees','invariant.workers.isolation'),
 e('describes','source.workers.multi','entity.workers.process'),e('describes','source.workers.multi','entity.workers.workspaces'),
 e('contains','domain.integration','entity.integration.composition'),e('contains','domain.integration','entity.integration.worktree_merge'),e('contains','domain.integration','entity.integration.project_binding'),e('contains','domain.integration','entity.integration.shared_context'),e('contains','domain.integration','entity.integration.surface'),e('contains','domain.integration','entity.integration.producer'),e('contains','domain.integration','source.integration.architecture'),e('contains','domain.integration','source.integration.invariants'),
 e('implements','entity.integration.project_binding','contract.integration.binding'),e('implements','entity.integration.worktree_merge','contract.integration.plan'),e('implements','entity.integration.surface','contract.integration.entry'),
 e('depends_on','entity.integration.composition','entity.integration.worktree_merge'),e('depends_on','entity.integration.composition','entity.workers.workspaces'),e('depends_on','entity.integration.surface','entity.integration.project_binding'),
 e('depends_on','entity.integration.producer','entity.integration.composition'),e('depends_on','entity.integration.producer','entity.integration.shared_context'),
 e('depends_on','entity.sessions.terminal','entity.objectives.objective'),e('depends_on','entity.sessions.terminal','entity.objectives.plan'),
 e('validates','test.integration.path','entity.integration.surface'),e('validates','test.integration.worktrees','invariant.integration.checkable_path'),e('validates','test.integration.worktrees','invariant.integration.drift'),e('validates','test.integration.binding','invariant.integration.ambiguity'),e('validates','test.integration.context','contract.integration.context'),e('validates','test.integration.loadability','invariant.integration.load'),e('validates','test.integration.portability','invariant.integration.portability'),
 e('describes','source.integration.architecture','entity.integration.surface'),e('describes','source.integration.invariants','invariant.workers.confinement'),e('describes','source.integration.invariants','invariant.workers.receipt'),e('describes','source.integration.invariants','invariant.integration.load'),e('describes','source.integration.invariants','invariant.integration.portability'),
]);
/** The generator reads bytes, so a declared path must not be able to leave the owner tree. */
const ownerFile=(root:string,path:string)=>{
 const absolute=resolve(root,path),inside=relative(root,absolute);
 if(!path||isAbsolute(path)||!inside||inside.startsWith('..')||isAbsolute(inside))throw new Error(`Manifest declaration escapes the owner root: ${path}`);
 return absolute;
};
const digestOf=(root:string,path:string)=>createHash('sha256').update(readFileSync(ownerFile(root,path))).digest('hex');
/** One digest per declared path, hashed in declaration order so a missing file fails the build. */
function digests(root:string):Map<string,SourceRef>{
 const found=new Map<string,SourceRef>();
 for(const declared of NODES)for(const path of declared.sources)if(!found.has(path))found.set(path,Object.freeze({path,digest:digestOf(root,path)}));
 return found;
}
function manifest(root:string):{version:1;nodes:readonly GraphNode[];edges:readonly GraphEdge[]}{
 const refs=digests(root),declared=new Map(NODES.map(d=>[d.id,d]));
 const ref=(path:string|undefined):SourceRef=>{const found=path===undefined?undefined:refs.get(path);if(!found)throw new Error(`Manifest source was never digested: ${path}`);return found;};
 const nodes=NODES.map(d=>Object.freeze({id:d.id,kind:d.kind,domainId:d.domainId,revision:1,sourceRefs:Object.freeze(d.sources.map(ref).sort((a,b)=>ordinal(a.path,b.path))),ownerRef:OWNER,contractRefs:d.contractRefs,invariantRefs:d.invariantRefs,checkRefs:d.checkRefs})).sort((a,b)=>ordinal(a.id,b.id));
 const edges=LINKS.map(l=>{
  const dependent=declared.get(l.dependent),dependency=declared.get(l.dependency);
  if(!dependent||!dependency)throw new Error(`Manifest edge endpoint is undeclared: ${l.dependent} -> ${l.dependency}`);
  // The side of the link that carries the evidence: what an edge asserts about
  // its dependency lives in the dependency, and a source describes what it names.
  const anchor=(l.type==='describes'?dependent:dependency).sources[0];
  return Object.freeze({id:`edge:${l.type}:${l.dependent}--${l.dependency}`,type:l.type,dependent:l.dependent,dependency:l.dependency,sourceRef:ref(anchor)});
 }).sort((a,b)=>ordinal(a.id,b.id));
 return Object.freeze({version:1,nodes:Object.freeze(nodes),edges:Object.freeze(edges)});
}
/** Canonical text: ordinal node and edge order, fixed key order, no clock, no absolute path. */
export function stateGraphJson(root:string):string{return `${JSON.stringify(manifest(root),null,2)}\n`;}
/** The built graph, parsed back so a manifest this module emits is valid by construction. */
export function buildStateGraph(root:string):StateGraph{return parseStateGraph(stateGraphJson(root));}