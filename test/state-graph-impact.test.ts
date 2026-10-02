import {test} from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {parseStateGraph} from '../src/adapters/state-graph/schema.ts';import {graphRevision} from '../src/adapters/state-graph/loader.ts';
import {buildReverseIndex,computeImpact,nodesForSourcePath,strongComponents,DEFAULT_MAX_IMPACTED,type ImpactPlan} from '../src/adapters/state-graph/impact.ts';
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