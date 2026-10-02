import {test} from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {parseStateGraph} from '../src/adapters/state-graph/schema.ts';import {graphRevision} from '../src/adapters/state-graph/loader.ts';
import {buildReverseIndex,computeImpact,nodesForSourcePath,strongComponents,mapChanges,computeChangeImpact,DEFAULT_MAX_IMPACTED,DEFAULT_MAX_CHANGES,type ImpactPlan,type PathChange} from '../src/adapters/state-graph/impact.ts';
const src=(path:string)=>({path,digest:'a'.repeat(64)});
const node=(id:string,kind='entity',paths?:readonly string[])=>({id,kind,domainId:'domain',revision:1,sourceRefs:(paths??['src/'+id+'.ts']).map(src),ownerRef:'owner.project',contractRefs:[],invariantRefs:[],checkRefs:[]});
const edge=(id:string,dependent:string,dependency:string,type='depends_on')=>({id,type,dependent,dependency,sourceRef:src('src/'+dependency+'.ts')});
const graph=(nodes:readonly any[],edges:readonly any[])=>({version:1,nodes,edges}) as any;
const ids=(plan:ImpactPlan)=>plan.impacted.map(n=>n.id);
const byId=(plan:ImpactPlan,id:string)=>plan.impacted.find(n=>n.id===id)!;

test('reverse index maps every dependency to its sorted dependents and every source path to its declaring nodes',()=>{
 const g=graph([node('domain','domain'),node('base'),node('left'),node('right'),node('top')],
  [edge('e-right-base','right','base'),edge('e-base-left','left','base'),edge('e-top-left','top','left'),edge('e-top-right','top','right')]);
 const index=buildReverseIndex(g);
 assert.deepEqual(index.nodeIds,['base','domain','left','right','top']);
 assert.deepEqual(index.dependents['base']!,[{dependent:'left',edge:'e-base-left',edgeType:'depends_on'},{dependent:'right',edge:'e-right-base',edgeType:'depends_on'}]);
 assert.deepEqual(index.dependents['top']!,[]);
 assert.deepEqual(index.dependents['missing'],undefined);
 assert.deepEqual(nodesForSourcePath(index,'src/base.ts'),['base']);
 assert.deepEqual(nodesForSourcePath(index,'src/absent.ts'),[]);
 assert.deepEqual(strongComponents(index),[['base'],['domain'],['left'],['right'],['top']]);
 assert.ok(Object.isFrozen(index)&&Object.isFrozen(index.nodeIds)&&Object.isFrozen(index.dependents)&&Object.isFrozen(index.dependents['base']!));
 assert.ok(Object.isFrozen(nodesForSourcePath(index,'src/base.ts')));
});

test('diamond dependencies collapse to one canonical witness, not to every path',()=>{
 const g=graph([node('domain','domain'),node('base'),node('left'),node('right'),node('top')],
  [edge('e-base-left','left','base'),edge('e-base-right','right','base'),edge('e-left-top','top','left'),edge('e-right-top','top','right')]);
 const plan=computeImpact(g,['base']);
 assert.deepEqual(ids(plan),['base','left','right','top']);
 assert.deepEqual(byId(plan,'base').reason,{kind:'seed',seed:'base',via:'base',edge:null,edgeType:null});
 // Shortest path is two hops either way, so the smallest edge-id sequence wins: determinism over topology.
 assert.deepEqual(byId(plan,'top').reason,{kind:'dependent',seed:'base',via:'left',edge:'e-left-top',edgeType:'depends_on'});
 assert.equal(byId(plan,'top').hops,2);
 assert.deepEqual(plan.cycles,[]);
 assert.ok(plan.complete);
});

test('a cycle yields an explicit component and a non-empty impact instead of an endless or empty expansion',()=>{
 const g=graph([node('domain','domain'),node('a'),node('b'),node('c')],
  [edge('e-b-a','b','a'),edge('e-a-b','a','b'),edge('e-a-c','a','c')]);
 const plan=computeImpact(g,['c']);
 assert.deepEqual(ids(plan),['a','b','c']);
 assert.deepEqual(byId(plan,'a').reason,{kind:'dependent',seed:'c',via:'c',edge:'e-a-c',edgeType:'depends_on'});
 assert.deepEqual(byId(plan,'b').reason,{kind:'dependent',seed:'c',via:'a',edge:'e-b-a',edgeType:'depends_on'});
 assert.deepEqual(plan.cycles,[['a','b']]);
 assert.equal(byId(plan,'a').inCycle,true);assert.equal(byId(plan,'b').inCycle,true);
 assert.equal(byId(plan,'a').component,'a');assert.equal(byId(plan,'b').component,'a');
 assert.equal(byId(plan,'c').inCycle,false);assert.equal(byId(plan,'c').component,'c');
 assert.equal(strongComponents(buildReverseIndex(g))[0]!.length,2);
 assert.equal(JSON.stringify(plan),JSON.stringify(computeImpact(g,['c'])));
});

test('the transitive closure is iterative: a 20000 deep chain resolves without exhausting the stack',()=>{
 const n=20000,nodes=Array.from({length:n},(_,i)=>node('n'+i,i===0?'domain':'entity'));
 const edges=Array.from({length:n-1},(_,i)=>edge('e-'+i,'n'+(i+1),'n'+i));
 const plan=computeImpact(graph(nodes,edges),['n1'],{maxImpacted:n+1});
 // n0 is the domain and nothing depends on it, so the closure is n1..n(n-1): every node but the root.
 assert.equal(plan.impacted.length,n-1);
 assert.deepEqual(plan.seeds,['n1']);assert.ok(!plan.impacted.some(e=>e.id==='n0'));
 assert.equal(byId(plan,'n'+(n-1)).hops,n-2);
 assert.equal(byId(plan,'n'+(n-1)).reason.edge,'e-'+(n-2));
});

test('a removed dependency leaves its former dependents unlinked and its own seed explicitly unresolved',()=>{
 const before=graph([node('domain','domain'),node('a'),node('b'),node('d')],[edge('e-ab','a','b'),edge('e-bd','b','d')]);
 assert.deepEqual(ids(computeImpact(before,['d'])),['a','b','d']);
 const after=graph([node('domain','domain'),node('a'),node('d')],[]);
 const fromA=computeImpact(after,['a']);
 assert.deepEqual(ids(fromA),['a']);assert.equal(fromA.impacted[0]!.reason.kind,'seed');
 const fromB=computeImpact(after,['b']);
 assert.deepEqual(fromB.seeds,[]);assert.deepEqual(fromB.unresolved,['b']);
 assert.equal(fromB.complete,false);assert.deepEqual(ids(fromB),[]);
 assert.deepEqual(after.edges,[]);
});

test('a rename is not a special case: both source paths resolve to one logical node and one plan',()=>{
 const g=graph([node('domain','domain'),node('a',undefined,['src/original.ts','src/renamed.ts']),node('b')],[edge('e-b-a','b','a')]);
 const index=buildReverseIndex(g);
 assert.deepEqual(nodesForSourcePath(index,'src/original.ts'),['a']);
 assert.deepEqual(nodesForSourcePath(index,'src/renamed.ts'),['a']);
 const viaOriginal=computeImpact(g,nodesForSourcePath(index,'src/original.ts')),viaRenamed=computeImpact(g,nodesForSourcePath(index,'src/renamed.ts')),viaId=computeImpact(g,['a']);
 assert.equal(JSON.stringify(viaOriginal),JSON.stringify(viaRenamed));
 assert.equal(JSON.stringify(viaOriginal),JSON.stringify(viaId));
 assert.deepEqual(ids(viaRenamed),['a','b']);
 // A graph that only ever knew the new path reaches exactly the same closure: no stale-name bookkeeping.
 const renamed=graph([node('domain','domain'),node('a',undefined,['src/renamed.ts']),node('b')],[edge('e-b-a','b','a')]);
 assert.equal(JSON.stringify(computeImpact(renamed,['a'])),JSON.stringify(viaId));
});

test('an unmapped file is reported as unresolved, never as a clean empty impact',()=>{
 const g=graph([node('domain','domain'),node('a'),node('b')],[edge('e-b-a','b','a')]);
 const index=buildReverseIndex(g);
 assert.deepEqual(nodesForSourcePath(index,'src/deleted.ts'),[]);
 const plan=computeImpact(g,['src/deleted.ts']);
 assert.deepEqual(plan.seeds,[]);assert.deepEqual(plan.unresolved,['src/deleted.ts']);
 assert.equal(plan.complete,false);assert.deepEqual(ids(plan),[]);assert.deepEqual(plan.cycles,[]);
 // The same shape as a genuine no-op seed, except complete stays false, so a caller cannot read it as coverage.
 const noop=computeImpact(g,[]);
 assert.deepEqual(ids(noop),[]);assert.equal(noop.complete,true);
 assert.notEqual(plan.complete,noop.complete);
});

test('participating edge types are an explicit policy and each reason names the one it travelled',()=>{
 const g=graph([node('domain','domain'),node('contract','contract'),node('impl'),node('check','test')],
  [edge('e-impl-contract','impl','contract','implements'),edge('e-check-contract','check','contract','validates')]);
 const all=computeImpact(g,['contract']);
 assert.deepEqual(ids(all),['check','contract','impl']);
 assert.deepEqual(byId(all,'impl').reason,{kind:'dependent',seed:'contract',via:'contract',edge:'e-impl-contract',edgeType:'implements'});
 assert.deepEqual(byId(all,'check').reason,{kind:'dependent',seed:'contract',via:'contract',edge:'e-check-contract',edgeType:'validates'});
 const causal=computeImpact(g,['contract'],{edgeTypes:['depends_on']});
 assert.deepEqual(ids(causal),['contract']);
 assert.deepEqual(ids(computeImpact(g,['contract'],{edgeTypes:['depends_on','validates']})),['check','contract']);
});

test('exceeding the expansion bound refuses with no partial plan instead of truncating silently',()=>{
 const nodes=[node('domain','domain'),node('n1'),node('n2'),node('n3'),node('n4')];
 const edges=[edge('e-1','n1','domain'),edge('e-2','n2','n1'),edge('e-3','n3','n2'),edge('e-4','n4','n3')];
 const g=graph(nodes,edges);
 assert.equal(computeImpact(g,['domain'],{maxImpacted:5}).impacted.length,5);
 assert.throws(()=>computeImpact(g,['domain'],{maxImpacted:4}),/exceeded maxImpacted=4.*refusing to truncate at 5/s);
 assert.throws(()=>computeImpact(g,['n1','n2','n3','n4'],{maxImpacted:2}),/seeds exceed maxImpacted=2/);
 assert.throws(()=>computeImpact(g,['domain'],{maxImpacted:0}),/positive safe integer/);
 assert.throws(()=>computeImpact(g,['domain'],{maxImpacted:1.5}),/positive safe integer/);
 assert.equal(computeImpact(g,['domain']).maxImpacted,DEFAULT_MAX_IMPACTED);
 assert.equal(computeImpact(g,['domain']).impacted.length,5);
 // The default is the schema ceiling, so a validated graph can never be refused and never be truncated.
 assert.equal(DEFAULT_MAX_IMPACTED,10000);
});

test('the same revision gives the same plan and the same reasons byte for byte, in process and across processes',()=>{
 const nodes=[node('domain','domain'),node('base'),node('left'),node('right'),node('top')];
 const edges=[edge('e-base-left','left','base'),edge('e-base-right','right','base'),edge('e-left-top','top','left'),edge('e-right-top','top','right')];
 const ordered=graph(nodes,edges),shuffled=graph([...nodes].reverse().map(n=>({...n,sourceRefs:[...n.sourceRefs].reverse()})),
  [...edges].reverse().map(e=>({...e})));
 assert.notDeepEqual(ordered.nodes,shuffled.nodes);
 assert.equal(graphRevision(parseStateGraph(JSON.stringify(ordered))),graphRevision(parseStateGraph(JSON.stringify(shuffled))));
 const seeds=['base'];
 const plan=computeImpact(ordered,seeds),same=computeImpact(ordered,seeds),other=computeImpact(shuffled,seeds);
 assert.equal(JSON.stringify(same),JSON.stringify(plan));
 assert.equal(JSON.stringify(other),JSON.stringify(plan));
 assert.equal(JSON.stringify(computeImpact(ordered,['base','left'])),JSON.stringify(computeImpact(ordered,['left','base','base'])));
 const root=join(import.meta.dirname,'..'),module=pathToFileURL(join(root,'src','adapters','state-graph','impact.ts')).href;
 const tmp=mkdtempSync(join(tmpdir(),'cs-impact-')),fixture=join(tmp,'graph.json');
 try{
  writeFileSync(fixture,JSON.stringify(ordered));
  const source='const{computeImpact}=await import(process.env.I);const{readFileSync}=await import("node:fs");process.stdout.write(JSON.stringify(computeImpact(JSON.parse(readFileSync(process.env.G,"utf8")),JSON.parse(process.env.S))));';
  // Hermetic by naming, the shape test/hermeticity.test.ts requires: an env built
   // from spread hands the child every developer variable, and deleting only the
   // keys we thought of is how a provider key once reached the network from a test.
   const childEnv={I:module,G:fixture,S:JSON.stringify(seeds)};
   const run=()=>execFileSync(process.execPath,['--input-type=module','-e',source],{env:childEnv,encoding:'utf8'});
  const first=run(),second=run();
  assert.equal(first,JSON.stringify(plan));assert.equal(second,first);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('every returned structure is frozen, so a caller cannot edit a plan it was handed',()=>{
 const g=graph([node('domain','domain'),node('a'),node('b'),node('c')],[edge('e-b-a','b','a'),edge('e-a-b','a','b'),edge('e-a-c','a','c')]);
 const plan=computeImpact(g,['c']);
 for(const value of [plan,plan.seeds,plan.unresolved,plan.impacted,plan.impacted[0],plan.impacted[0]!.reason,plan.cycles,plan.cycles[0]])
  assert.ok(Object.isFrozen(value),'plan surface must be frozen');
 assert.throws(()=>{(plan.impacted as any).push({});},TypeError);
 assert.throws(()=>{(plan.impacted[0] as any).id='x';},TypeError);
 assert.throws(()=>{(plan.impacted[0]!.reason as any).seed='x';},TypeError);
 assert.throws(()=>{(plan.cycles[0] as any).push('x');},TypeError);
 assert.throws(()=>{(plan.seeds as any).push('x');},TypeError);
 assert.deepEqual(ids(plan),['a','b','c']);
});

// --- SG02.2: mapping a diff onto seeds, so an unmapped path cannot read as a clean empty impact ---

test('a diff touching a path the graph never declared yields complete:false and names that path',()=>{
 // The composition the adversarial review found: nodesForSourcePath returns [], computeImpact reads []
 // as "nothing is affected", and the caller is handed a complete plan over a file it knows nothing about.
 const g=graph([node('domain','domain'),node('a'),node('b')],[edge('e-b-a','b','a')]);
 const index=buildReverseIndex(g);
 const changed=['src/undeclared.ts'];
 const naive=computeImpact(g,changed.flatMap(path=>nodesForSourcePath(index,path)));
 assert.equal(naive.complete,true,'the old composition is the defect being removed');
 assert.deepEqual(ids(naive),[],'and it is silently empty');

 const changes:PathChange[]=[{path:'src/undeclared.ts',kind:'modified'}];
 const mapping=mapChanges(index,changes);
 assert.deepEqual(mapping.seeds,[]);
 assert.deepEqual(mapping.unresolved,['src/undeclared.ts']);
 assert.deepEqual(mapping.deletions,[]);
 assert.deepEqual(mapping.coverage,{declared:0,unmapped:1});

 const plan=computeChangeImpact(g,changes);
 assert.equal(plan.complete,false);
 assert.deepEqual(plan.unresolved,['src/undeclared.ts']);
 assert.deepEqual(plan.unmappedPaths,['src/undeclared.ts']);
 assert.deepEqual(plan.deletions,[]);
 assert.deepEqual(plan.coverage,{declared:0,unmapped:1});
 // Same shape as a genuine no-op change set, except complete stays false, so absence is never coverage.
 const noop=computeChangeImpact(g,[]);
 assert.deepEqual(ids(noop),[]);assert.equal(noop.complete,true);
 assert.notEqual(plan.complete,noop.complete);
 // Coverage is per path, not per plan: one declared change beside one unknown path is still incomplete.
 const mixed=computeChangeImpact(g,[{path:'src/a.ts',kind:'modified'},{path:'src/undeclared.ts',kind:'modified'}]);
 assert.deepEqual(ids(mixed),['a','b'],'the declared path still drives the closure');
 assert.equal(mixed.complete,false);
 assert.deepEqual(mixed.unmappedPaths,['src/undeclared.ts']);
 assert.deepEqual(mixed.coverage,{declared:1,unmapped:1});
});

test('an unmapped path that collides with a node id is not absorbed as a covered seed',()=>{
 // `schema.ts` admits `notes.md` as a node id, and a real repository can hold a file of that name, so the
 // two namespaces overlap in practice. Handing an unmapped path to the closure as if it were a seed lets
 // the closure find that node id, clear its own `unresolved`, and report complete coverage of a file the
 // mapping never reached. The mapping is the only place that knows the path was unmapped, so the refusal
 // cannot be delegated to the closure alone.
 const g=graph([node('domain','domain'),node('a'),node('notes.md','source',['src/notes.md'])],[]);
 const index=buildReverseIndex(g);
 assert.deepEqual(nodesForSourcePath(index,'notes.md'),[],'the path is not declared by any node');
 const raw=computeImpact(g,['notes.md']);
 assert.deepEqual(raw.unresolved,[],'the closure alone is fooled, which is why it is not the only guard');
 assert.equal(raw.complete,true);
 const mapping=mapChanges(index,[{path:'notes.md',kind:'modified'}]);
 assert.deepEqual(mapping.unresolved,['notes.md']);
 assert.deepEqual(mapping.seeds,[],'a colliding node id is never guessed as the owner of an unmapped path');
 const plan=computeChangeImpact(g,[{path:'notes.md',kind:'modified'}]);
 assert.equal(plan.complete,false,'the mapping refuses coverage the closure would have granted');
 assert.deepEqual(plan.unmappedPaths,['notes.md']);
 assert.deepEqual(mapping.coverage,{declared:0,unmapped:1});
});

test('a deletion is represented as a change, not ignored because its file is gone',()=>{
 const g=graph([node('domain','domain'),node('a'),node('b')],[edge('e-b-a','b','a')]);
 const index=buildReverseIndex(g);
 const changes:PathChange[]=[{path:'src/a.ts',kind:'deleted'}];
 const mapping=mapChanges(index,changes);
 // The deleted path was declared, so it is a real seed and its dependents are still impacted: a removal
 // is a change to the same node, and dropping it would understate the blast radius.
 assert.deepEqual(mapping.seeds,['a']);
 assert.deepEqual(mapping.deletions,['src/a.ts']);
 assert.deepEqual(mapping.unresolved,[]);
 assert.deepEqual(mapping.coverage,{declared:1,unmapped:0});
 const plan=computeChangeImpact(g,changes);
 assert.deepEqual(ids(plan),['a','b'],'deleting a.ts must still impact b');
 assert.equal(plan.complete,true);
 assert.deepEqual(plan.deletions,['src/a.ts']);
 // A file the graph never declared and that no longer exists is the honest worst case: no seed, and named.
 const undeclared=computeChangeImpact(g,[{path:'src/vanished.ts',kind:'deleted'}]);
 assert.deepEqual(ids(undeclared),[]);
 assert.deepEqual(undeclared.deletions,['src/vanished.ts']);
 assert.deepEqual(undeclared.unresolved,['src/vanished.ts']);
 assert.equal(undeclared.complete,false);
 assert.ok(Object.isFrozen(undeclared.deletions)&&Object.isFrozen(undeclared.unmappedPaths));
 assert.throws(()=>{(undeclared.deletions as any).push('x');},TypeError);
});

test('a path outside declared sources cannot produce an empty complete plan by any composition',()=>{
 const g=graph([node('domain','domain'),node('a'),node('b')],[edge('e-b-a','b','a')]);
 const index=buildReverseIndex(g);
 // Every path a real diff can carry and this graph never declared, including the prototype-named ones.
 // `bySourcePath` is a plain object, so `index.bySourcePath['constructor']` is Object and not a bucket.
 // A lookup that trusted that would return a function, treat the path as mapped, and complete the plan.
 for(const path of ['src/absent.ts','constructor','toString','valueOf','hasOwnProperty','__proto__','node_modules/x/index.js']){
  assert.deepEqual(nodesForSourcePath(index,path),[],`${path} must resolve to no declaration`);
  const plan=computeChangeImpact(g,[{path,kind:'modified'}]);
  assert.equal(plan.complete,false,`${path} must not read as covered`);
  assert.deepEqual(plan.unresolved,[path]);
  assert.deepEqual(ids(plan),[]);
 }
 // A traversing or malformed path is refused outright rather than mapped as an ordinary undeclared one.
 // Both outcomes are non-silent, and refusing is the stronger: it never reaches a plan at all.
 for(const bad of [{path:'',kind:'modified'},{path:'../escape.ts',kind:'modified'},{path:'/abs.ts',kind:'modified'},{path:'src/../../escape.ts',kind:'modified'},{path:'src/a.ts',kind:'teleported'},{path:'src/a.ts',kind:'renamed'},{path:'src/a.ts',kind:'modified',from:'../smuggled.ts'}] as PathChange[])
  assert.throws(()=>mapChanges(index,[bad]),/malformed entry/);
 // An oversized change set is refused, never truncated: a dropped tail is a change that reached no seed.
 const many=Array.from({length:DEFAULT_MAX_CHANGES+1},(_,i)=>({path:'src/f'+i+'.ts',kind:'modified'}) as PathChange);
 assert.throws(()=>mapChanges(index,many),/exceeds maxChanges=10000/);
 assert.equal(DEFAULT_MAX_CHANGES,10000);
});

test('a rename seeds through either name and is incomplete only when neither is declared',()=>{
 const both=graph([node('domain','domain'),node('a',undefined,['src/old.ts','src/new.ts']),node('b')],[edge('e-b-a','b','a')]);
 const viaRename=computeChangeImpact(both,[{path:'src/new.ts',kind:'renamed',from:'src/old.ts'}]);
 assert.deepEqual(ids(viaRename),['a','b']);
 assert.equal(viaRename.complete,true);
 // The old name is a deletion and is represented as one, even though the plan is otherwise covered.
 assert.deepEqual(viaRename.deletions,['src/old.ts']);
 assert.deepEqual(viaRename.unmappedPaths,[]);
 // A graph that only ever knew the new name still reaches the same closure: no stale-name bookkeeping.
 const onlyNew=graph([node('domain','domain'),node('a',undefined,['src/new.ts']),node('b')],[edge('e-b-a','b','a')]);
 const partial=computeChangeImpact(onlyNew,[{path:'src/new.ts',kind:'renamed',from:'src/old.ts'}]);
 assert.deepEqual(ids(partial),['a','b']);
 assert.equal(partial.complete,true,'the new name is declared, which is what the graph must be read through');
 // Neither name declared is a file this graph has never heard of, whichever way it is named.
 const neither=computeChangeImpact(both,[{path:'src/other.ts',kind:'renamed',from:'src/gone.ts'}]);
 assert.equal(neither.complete,false);
 assert.deepEqual(neither.unmappedPaths,['src/gone.ts','src/other.ts']);
 assert.deepEqual(neither.deletions,['src/gone.ts']);
});

test('the change mapping is a pure function of the index and the change set',()=>{
 const g=graph([node('domain','domain'),node('a'),node('b')],[edge('e-b-a','b','a')]);
 const index=buildReverseIndex(g);
 const changes:PathChange[]=[{path:'src/b.ts',kind:'modified'},{path:'src/undeclared.ts',kind:'modified'}];
 const forward=computeChangeImpact(g,changes),reversed=computeChangeImpact(g,[...changes].reverse());
 assert.equal(JSON.stringify(reversed),JSON.stringify(forward),'change order is not an input');
 assert.deepEqual(mapChanges(index,changes),mapChanges(buildReverseIndex(g),changes));
 assert.equal(JSON.stringify(computeChangeImpact(g,changes)),JSON.stringify(computeChangeImpact(g,changes)));
 assert.ok(Object.isFrozen(forward)&&Object.isFrozen(forward.coverage)&&Object.isFrozen(forward.unmappedPaths));
 // Narrowed, never widened: an unmapped path is a hole whatever the closure concluded about the seeds.
 assert.equal(computeChangeImpact(g,[{path:'src/a.ts',kind:'modified'}]).complete,true);
 assert.equal(forward.complete,false);
});