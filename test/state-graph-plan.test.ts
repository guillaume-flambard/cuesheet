import {test} from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync,statSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {buildStateGraph} from '../src/adapters/state-graph/manifest.ts';
import type {GraphNode,StateGraph} from '../src/adapters/state-graph/schema.ts';
import {CAUSAL,type PathChange} from '../src/adapters/state-graph/impact.ts';
import {INVARIANTS,type InvariantDeclaration} from '../src/adapters/state-graph/invariants.ts';
import {buildCheckIndex,checksForPath,pathsForCheck,createPlanCache,planInputDigest,planVerification,type CheckIndex,type VerificationPlan} from '../src/adapters/state-graph/plan.ts';
const ROOT=join(import.meta.dirname,'..');
const src=(path:string)=>({path,digest:'a'.repeat(64)});
/** `invariantRefs` is a node's own declaration of what it validates; `checkRefs` of what enforces it. */
const node=(id:string,kind='entity',paths?:readonly string[],invariantRefs:readonly string[]=[],checkRefs:readonly string[]=[]):GraphNode=>({id,kind,domainId:'domain.x',revision:1,sourceRefs:(paths??['src/'+id+'.ts']).map(src),ownerRef:'owner.project',contractRefs:[],invariantRefs:[...invariantRefs],checkRefs:[...checkRefs]}) as unknown as GraphNode;
const edge=(id:string,dependent:string,dependency:string,type='depends_on')=>({id,type,dependent,dependency,sourceRef:src('src/'+dependency+'.ts')});
const graph=(nodes:readonly GraphNode[],edges:readonly any[])=>({version:1,nodes,edges}) as unknown as StateGraph;
const change=(path:string):PathChange=>({path,kind:'modified'});
const real=buildStateGraph(ROOT);
/** One entry copied from the repository registry, so a test varies the registry rather than inventing a second one. */
const withCheck=(id:string,checks:readonly string[]):readonly InvariantDeclaration[]=>INVARIANTS.map(entry=>entry.id===id?{...entry,checks:[...checks]}:entry);

// --- SG02.3 gap 2: the join from an impacted test node to an executable file ---

test('an impacted test node resolves to the files a runner can execute, not only to its id',()=>{
 const plan=planVerification(real,[change('src/adapters/session-store.ts')]);
 // The graph knew these checks by id only. The join is what turns an id into a path a runner can open.
 assert.deepEqual(plan.tests.map(test_=>test_.id),['test.sessions.durability','test.sessions.journal']);
 assert.deepEqual(plan.tests.map(test_=>test_.paths),[['test/terminal-sessions.test.ts'],['test/adapters.test.ts']]);
 assert.deepEqual(plan.testPaths,['test/adapters.test.ts','test/terminal-sessions.test.ts']);
 // Paths, not identifiers: an id names a node, and no id here is anything a process could execute.
 for(const entry of plan.tests)for(const path of entry.paths){
  assert.notEqual(path,entry.id);
  assert.ok(existsSync(join(ROOT,path)),`${path} must be a real file a runner can execute`);
  assert.ok(statSync(join(ROOT,path)).isFile());
 }
 assert.deepEqual(plan.tests[0]!.validates,['invariant.sessions.durable','invariant.sessions.refusal']);
 // The CAUSAL closure over the declarations, asserted as a whole rather than spot-checked: `invariant.sessions.durable`
 // is absent because it declares `terminal-session.ts` and not `session-store.ts`, and `contract.sessions.store`
 // is present because `test.sessions.journal` validates it.
 assert.deepEqual(plan.impactedNodes.map(node_=>node_.id),['contract.sessions.store','domain.sessions',
  'entity.sessions.journal','entity.sessions.terminal','entity.sessions.view','invariant.sessions.refusal',
  'source.sessions.continuity','test.sessions.durability','test.sessions.journal']);
 // Every impacted node is addressable by its declared files, checks and non-checks alike.
 assert.deepEqual(plan.impactedNodes.find(node_=>node_.id==='entity.sessions.journal')!.paths,['src/adapters/session-store.ts']);
 assert.deepEqual(plan.impactedNodes.find(node_=>node_.id==='test.sessions.durability')!.paths,['test/terminal-sessions.test.ts']);
 // And the coverage accounting `complete` is derived from is carried, so a reader can check the derivation.
 assert.deepEqual(plan.coverage,{declared:1,unmapped:0});
 assert.deepEqual(plan.unmappedPaths,[]);assert.deepEqual(plan.deletions,[]);
});

test('every path the real manifest yields is a file this repository has, and the coverage gap stays visible',()=>{
 const checked=new Set<string>(),reached=new Set<string>(),silent:string[]=[];
 for(const declared of new Set(real.nodes.flatMap(node=>node.sourceRefs.map(ref=>ref.path)))){
  const plan=planVerification(real,[change(declared)]);
  for(const path of plan.testPaths){
   assert.ok(existsSync(join(ROOT,path)),`${path} was selected by ${declared} but does not exist`);
   assert.ok(statSync(join(ROOT,path)).isFile());
   assert.ok(path.startsWith('test/')&&path.endsWith('.test.ts'),`${path} is not a runnable test file`);
   checked.add(path);
  }
  for(const entry of plan.tests)reached.add(entry.id);
  // `loadability` and `portability` are whole-tree checks reached through `docs/INVARIANTS.md` rather than
  // through a source file, so a src-only sweep would understate the join. Sweep everything instead.
  if(plan.testPaths.length===0&&declared.startsWith('src/'))silent.push(declared);
 }
 // All 16 declared test nodes and their 16 files are reachable through some declared source, so the join is
 // total over the manifest: no declared check is unreachable, and no declared check names a file twice.
 assert.equal(reached.size,16);assert.equal(checked.size,16);
 // The declared sources that reach no test at all, and why that is a manifest gap rather than a planner one.
 // `src/adapters/managed-worktrees.ts` is the case the verification-selection probe named: only
 // `entity.workers.workspaces` declares it, no edge joins that entity to `test.workers.worktrees`, so the
 // graph selects nothing and honestly says it selected nothing. Widening it would mean guessing that a test
 // file belongs to a source file, which is the guessed seed SG02.2 forbids. Left for SG01.3 and pinned here
 // so closing it is a deliberate, visible edit rather than a silent drift.
 assert.deepEqual(silent,['src/adapters/code-worker-integration.ts','src/adapters/code-worker-loop.ts','src/adapters/managed-worktrees.ts']);
 const gap=planVerification(real,[change('src/adapters/managed-worktrees.ts')]);
 assert.deepEqual(gap.tests,[]);assert.deepEqual(gap.testPaths,[]);
 assert.equal(gap.complete,true,'the path is declared, so coverage is complete: the gap is in the edges, not the paths');
 assert.deepEqual(gap.incompleteReasons,[]);
 assert.deepEqual(gap.impactedNodes.map(node_=>node_.id),['domain.integration','domain.workers',
  'entity.integration.composition','entity.integration.producer','entity.workers.loop','entity.workers.workspaces','source.workers.multi']);
 assert.ok(gap.impactedNodes.some(node_=>node_.id==='entity.workers.workspaces'),'the entity that declares the file is named');
});

test('the join is not fooled by a path or a node id named after an Object.prototype member',()=>{
 const names=['constructor','toString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toLocaleString','__proto__'];
 // A test node declaring a file whose name is a prototype member, and a normal one beside it.
 const g=graph([node('domain.x','domain'),node('test.prototype','test',['constructor']),node('test.normal','test',['test/normal.test.ts'])],[]);
 const index=buildCheckIndex(g);
 // The trap is real and is shown, not asserted away: the index is a plain object, so a naive read returns a
 // function where the contract promises an array.
 for(const name of names)if(name!=='constructor'){
  assert.ok(index.byPath[name],`${name} must be an inherited property, or this test proves nothing`);
  assert.equal(Object.hasOwn(index.byPath,name),false);
  assert.deepEqual(checksForPath(index,name),[],`${name} is a name nobody declared`);
  assert.deepEqual(pathsForCheck(index,name),[],`${name} is a node id nobody declared`);
 }
 // And the fixture that is genuinely declared under a prototype name still resolves, so the own-property test
 // is what admits it and not a blanket rejection of prototype keys.
 assert.equal(Object.hasOwn(index.byPath,'constructor'),true);
 assert.deepEqual(checksForPath(index,'constructor'),['test.prototype']);
 assert.deepEqual(pathsForCheck(index,'test.prototype'),['constructor']);
 assert.deepEqual(checksForPath(index,'test/normal.test.ts'),['test.normal']);
 assert.deepEqual(pathsForCheck(index,'test.prototype'),['constructor']);
 // Both directions survive the round trip on the real manifest, and every member is absent there too.
 const realIndex=buildCheckIndex(real);
 for(const name of names){
  assert.equal(Object.hasOwn(realIndex.byNode,name),false);
  assert.deepEqual(pathsForCheck(realIndex,name),[]);
  assert.deepEqual(checksForPath(realIndex,name),[]);
 }
 assert.equal(Object.keys(realIndex.byNode).length,16);
 assert.equal(Object.keys(realIndex.byPath).length,16);
 // The two guards are not redundant and neither is a decoration: `Object.hasOwn` is what refuses an inherited
 // bucket, and `Array.isArray` is what refuses a function where an array was promised. Every prototype member
 // is a function, so `buildCheckIndex` alone can only exercise the second. An inherited bucket that is an
 // array is the case the first guard exists for, and the trap is shown before the refusal is asserted.
 const inherited=Object.create({constructor:Object.freeze(['test/inherited.test.ts'])}) as Record<string,readonly string[]>;
 inherited['test/normal.test.ts']=Object.freeze(['test.normal']);
 const spoofed:CheckIndex={byNode:inherited,byPath:inherited};
 assert.deepEqual(inherited['constructor'],['test/inherited.test.ts'],'the trap: a naive read returns it');
 assert.equal(Object.hasOwn(inherited,'constructor'),false);
 assert.deepEqual(pathsForCheck(spoofed,'constructor'),[],'an inherited bucket is never a declaration');
 assert.deepEqual(checksForPath(spoofed,'constructor'),[]);
 // And the same key, genuinely declared as an own property, still resolves: the guard admits declarations.
 inherited['constructor']=Object.freeze(['test.prototype']);
 assert.deepEqual(pathsForCheck(spoofed,'constructor'),['test.prototype']);
 assert.deepEqual(checksForPath(spoofed,'constructor'),['test.prototype']);
});

test('a path that looks like a node id stays in the path namespace and never selects a check',()=>{
 // `schema.ts` admits `notes.md` as a node id and `constructor` as a source path, so the two namespaces
 // overlap in practice. First half: a path declared by a node that is not a check names no check.
 const declared=graph([
  node('domain.x','domain',['src/a.ts']),
  node('entity.reader','entity',['notes.md','src/reader.ts']),
  node('test.notes','test',['test/notes.md']),
  node('invariant.claimed','invariant',['src/reader.ts']),
  node('contract.c','contract',['src/reader.ts']),
  node('entity.impl','entity',['src/impl.ts']),
 ],[
  edge('e-impl-inv','invariant.claimed','entity.impl','validates'),
  edge('e-notes-inv','test.notes','invariant.claimed','validates'),
 ]);
 const index=buildCheckIndex(declared);
 assert.deepEqual(pathsForCheck(index,'test.notes'),['test/notes.md'],'by node id');
 assert.deepEqual(checksForPath(index,'test/notes.md'),['test.notes'],'by path');
 // `notes.md` is a declared source path of an entity. No check declares it, so the path lookup must not fall
 // through to the node-id index, where the string `notes.md` names nothing either but a reader cannot tell.
 assert.deepEqual(checksForPath(index,'notes.md'),[],'a path is never read out of the node-id index');
 assert.deepEqual(pathsForCheck(index,'notes.md'),[],'and a path is never read as a node id');
 const plan=planVerification(declared,[change('notes.md')]);
 assert.deepEqual(plan.tests,[]);assert.deepEqual(plan.testPaths,[]);
 assert.deepEqual(plan.coverage,{declared:1,unmapped:0},'the entity declares that path, so the change is covered');
 assert.ok(plan.impactedNodes.some(entry=>entry.id==='entity.reader'));
 // The declared path of the check still selects it, which is the half that must keep working.
 const viaCheck=planVerification(declared,[change('test/notes.md')]);
 assert.deepEqual(viaCheck.tests.map(entry=>entry.id),['test.notes']);
 assert.deepEqual(viaCheck.testPaths,['test/notes.md']);

 // Second half: an undeclared path whose string is a declared check id. SG02.2 already measured that the
 // closure alone finds such a node and clears its own unresolved, so the honest assertion is the narrowing:
 // the plan names what the collision reached and refuses to call it coverage.
 const colliding=graph([
  node('domain.x','domain',['src/a.ts']),
  node('notes.md','test',['test/notes.md']),
  node('entity.impl','entity',['src/impl.ts']),
  node('test.runner','test',['test/runner.test.ts']),
  node('invariant.claimed','invariant',['src/impl.ts']),
  node('contract.c','contract',['src/impl.ts']),
 ],[
  edge('e-impl-inv','invariant.claimed','entity.impl','validates'),
  edge('e-runner-inv','test.runner','invariant.claimed','validates'),
 ]);
 assert.deepEqual(checksForPath(buildCheckIndex(colliding),'notes.md'),[],'no check declares that path');
 const collided=planVerification(colliding,[change('notes.md')]);
 assert.equal(collided.complete,false,'a colliding id must not read as covered coverage');
 assert.deepEqual(collided.incompleteReasons,['coverage-unmapped-paths']);
 assert.deepEqual(collided.unmappedPaths,['notes.md']);
 assert.deepEqual(collided.coverage,{declared:0,unmapped:1});
 assert.deepEqual(collided.tests.map(entry=>entry.id),['notes.md'],'the id collision still reaches the check it names');
 assert.deepEqual(collided.testPaths,['test/notes.md']);
 assert.ok(!collided.tests.some(entry=>entry.id==='test.runner'),'and reaches nothing else');
 assert.equal(collided.impactedNodes.length,1);
});

test('a ci node resolves as a job and a test node never becomes one',()=>{
 const g=graph([
  node('domain.x','domain'),node('src.a','entity',['src/a.ts']),
  node('test.unit','test',['test/unit.test.ts']),
  node('ci.build','ci',['ci/build.sh','ci/notes.sh']),
  node('invariant.claimed','invariant',['src/a.ts']),
  node('contract.c','contract',['src/a.ts']),
  node('entity.impl','entity',['src/impl.ts']),
 ],[
  edge('e-unit-a','test.unit','src.a'),edge('e-ci-a','ci.build','src.a'),
  edge('e-inv-a','invariant.claimed','src.a','validates'),
  edge('e-unit-inv','test.unit','invariant.claimed','validates'),
  edge('e-impl-a','entity.impl','src.a'),
 ]);
 const plan=planVerification(g,[change('src/a.ts')]);
 assert.deepEqual(plan.tests.map(entry=>entry.id),['test.unit']);
 assert.deepEqual(plan.jobs.map(entry=>entry.id),['ci.build']);
 assert.deepEqual(plan.testPaths,['test/unit.test.ts']);
 assert.deepEqual(plan.jobs[0]!.paths,['ci/build.sh','ci/notes.sh'],'both declared job paths, ordinal-sorted');
 assert.deepEqual(plan.jobPaths,['ci/build.sh','ci/notes.sh']);
 // `test.runner` above and `ci.build` here: the two kinds never cross, and `jobs` is empty for the real
 // manifest because the manifest declares no `ci` node. Reported, not fixed: a node here changes its digests.
 assert.deepEqual(real.nodes.filter(node=>node.kind==='ci'),[]);
 assert.deepEqual(planVerification(real,[change('src/adapters/objectives.ts')]).jobs,[]);
});

// --- the four addressable groups, and nothing else ---

test('the plan carries the four addressable groups and the flat lists are projections of them',()=>{
 assert.deepEqual(Object.keys(planVerification(real,[change('src/adapters/objectives.ts')])),[
  'digest','graphRevision','complete','incompleteReasons','unmappedPaths','deletions','coverage',
  'impactedNodes','invariants','tests','jobs','testPaths','jobPaths','unresolvedChecks']);
 const plan=planVerification(real,[change('src/core/intent.ts')]);
 const project=(checks:readonly {paths:readonly string[]}[])=>[...new Set(checks.flatMap(check=>check.paths))].sort();
 assert.deepEqual([...plan.testPaths],project(plan.tests),'testPaths is a projection, not a fifth group');
 assert.deepEqual([...plan.jobPaths],project(plan.jobs));
 assert.deepEqual([...plan.unresolvedChecks],[...new Set(plan.invariants.flatMap(entry=>entry.unresolvedChecks))].sort());
 // Ordinal order everywhere, so a reader may diff two plans without sorting them first.
 const sorted=(values:readonly string[])=>[...values].sort();
 assert.deepEqual([...plan.tests.map(entry=>entry.id)],sorted(plan.tests.map(entry=>entry.id)));
 assert.deepEqual([...plan.invariants.map(entry=>entry.id)],sorted(plan.invariants.map(entry=>entry.id)));
 assert.deepEqual([...plan.impactedNodes.map(entry=>entry.id)],sorted(plan.impactedNodes.map(entry=>entry.id)));
 assert.deepEqual([...plan.incompleteReasons],sorted(plan.incompleteReasons));
 // The selected invariants are exactly the impacted ones plus the ones an impacted check validates.
 assert.deepEqual(plan.invariants.map(entry=>entry.id),['invariant.objectives.routing']);
 assert.deepEqual(plan.invariants[0]!.requiredChecks,['test.objectives.intent']);
 assert.equal(plan.invariants[0]!.enforced,true);
 assert.ok(plan.invariants[0]!.statement.length>0,'the claim comes from the SG03.1 registry');
 // A change to a test file selects the invariants that test declares, and in this manifest it also seeds them
 // directly, because every invariant node declares its own test file as a source. The route that only the
 // check provides is therefore shown on a graph where the invariant declares a source and nothing else.
 const wide=planVerification(real,[change('test/objectives.test.ts')]);
 assert.deepEqual(wide.tests.map(entry=>entry.id),['test.objectives.objectives']);
 assert.deepEqual(wide.invariants.map(entry=>entry.id),
  ['invariant.objectives.hypothesis','invariant.objectives.identity','invariant.objectives.proof']);
 for(const entry of wide.invariants)assert.deepEqual(entry.requiredChecks,['test.objectives.objectives']);
 const direct=planVerification(real,[change('src/adapters/objectives.ts')]);
 assert.deepEqual(direct.invariants.map(entry=>entry.id),wide.invariants.map(entry=>entry.id));
 assert.deepEqual(direct.impactedNodes.filter(entry=>entry.kind==='invariant').map(entry=>entry.id),wide.invariants.map(entry=>entry.id));
 const routed=graph([
  node('domain.x','domain',['src/a.ts']),node('entity.impl','entity',['src/a.ts']),node('contract.c','contract',['src/a.ts']),
  node('invariant.claimed','invariant',['src/a.ts'],[],['test.unit']),node('test.unit','test',['test/unit.test.ts'],['invariant.claimed']),
 ],[edge('e-impl-inv','invariant.claimed','entity.impl','validates'),edge('e-unit-inv','test.unit','invariant.claimed','validates')]);
 const throughCheck=planVerification(routed,[change('test/unit.test.ts')]);
 assert.deepEqual(throughCheck.impactedNodes.filter(entry=>entry.kind==='invariant').map(entry=>entry.id),[]);
 assert.deepEqual(throughCheck.invariants.map(entry=>entry.id),['invariant.claimed'],'the check widened it in');
 assert.deepEqual(throughCheck.tests.map(entry=>entry.id),['test.unit']);
 assert.deepEqual(throughCheck.invariants[0]!.requiredChecks,['test.unit']);
 // An impacted check with no invariantRefs contributes none, so the group never pads itself.
 const bare=planVerification(real,[change('test/adapters.test.ts')]);
 assert.deepEqual(bare.tests.map(entry=>entry.id),['test.sessions.journal']);
 assert.deepEqual(bare.invariants,[]);
 assert.equal(bare.complete,true);
});

test('every group of the plan is frozen, so a caller cannot edit a plan it was handed',()=>{
 const plan:VerificationPlan=planVerification(real,[change('src/adapters/objectives.ts')]);
 for(const value of [plan,plan.impactedNodes,plan.invariants,plan.tests,plan.jobs,plan.testPaths,plan.incompleteReasons,
  plan.impactedNodes[0],plan.invariants[0],plan.tests[0],plan.tests[0]!.validates,plan.tests[0]!.paths])
  assert.ok(Object.isFrozen(value),'plan surface must be frozen');
 assert.throws(()=>{(plan.tests as any).push({});},TypeError);
 assert.throws(()=>{(plan.tests[0] as any).id='x';},TypeError);
 assert.throws(()=>{(plan.tests[0]!.paths as any).push('x');},TypeError);
 assert.throws(()=>{(plan.impactedNodes[0] as any).paths=['x'];},TypeError);
 assert.throws(()=>{(plan.invariants[0] as any).requiredChecks=['x'];},TypeError);
 assert.throws(()=>{(plan.invariants[0] as any).statement='x';},TypeError);
});

// --- determinism, and a cache that keys on every input that can change the answer ---

test('one input gives one byte string across runs, orderings and processes',()=>{
 const changes=[change('src/adapters/objectives.ts'),{path:'src/adapters/session-store.ts',kind:'deleted'} as PathChange];
 const first=planVerification(real,changes);
 // Three runs in one process.
 for(let run=0;run<3;run++)assert.equal(JSON.stringify(planVerification(real,changes)),JSON.stringify(first));
 // Declaration order is not an input: reversed nodes, reversed sourceRefs, reversed edges, reversed changes.
 const shuffled=buildStateGraph(ROOT);
 assert.notDeepEqual(shuffled.nodes.map(node=>node.id),[...shuffled.nodes.map(node=>node.id)].reverse());
 const rotated={version:1 as const,
  nodes:[...real.nodes].reverse().map(node=>({...node,sourceRefs:[...node.sourceRefs].reverse(),invariantRefs:[...node.invariantRefs].reverse(),checkRefs:[...node.checkRefs].reverse()})),
  edges:[...real.edges].reverse().map(edge=>({...edge}))};
 const byRotation=planVerification(rotated as unknown as StateGraph,[...changes].reverse());
 assert.equal(byRotation.digest,first.digest,'the plan address is a function of content, not of ordering');
 assert.equal(JSON.stringify(byRotation),JSON.stringify(first));
 // Across processes, with an environment assembled by naming: a leak-proof child is the only one that proves
 // a byte string is stable rather than accidentally stable in this process.
 const tmp=mkdtempSync(join(tmpdir(),'cs-plan-')),fixture=join(tmp,'graph.json');
 try{
  writeFileSync(fixture,JSON.stringify(real));
  const module=pathToFileURL(join(ROOT,'src','adapters','state-graph','plan.ts')).href;
  const source='const{planVerification}=await import(process.env.I);const{readFileSync}=await import("node:fs");const graph=JSON.parse(readFileSync(process.env.G,"utf8"));process.stdout.write(JSON.stringify(planVerification(graph,JSON.parse(process.env.S))));';
  const childEnv={I:module,G:fixture,S:JSON.stringify(changes)};
  const run=()=>execFileSync(process.execPath,['--input-type=module','-e',source],{env:childEnv,encoding:'utf8'});
  const outputs=[run(),run(),run()];
  assert.equal(outputs[0],JSON.stringify(first));
  assert.equal(outputs[1],outputs[0]);assert.equal(outputs[2],outputs[0]);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});

test('the cache answers a repeated query with the plan a fresh computation gives, and keys on every input',()=>{
 const cache=createPlanCache(),changes=[change('src/adapters/objectives.ts')];
 const miss=cache.plan(real,changes);
 assert.equal(miss.cached,false);assert.equal(cache.misses,1);assert.equal(cache.hits,0);assert.equal(cache.size,1);
 // Byte-identical to a computation that never touched the cache.
 assert.equal(JSON.stringify(miss.plan),JSON.stringify(planVerification(real,changes)));
 const hit=cache.plan(real,changes);
 assert.equal(hit.cached,true);assert.equal(cache.hits,1);assert.equal(cache.misses,1,'a hit must not recompute');
 assert.equal(hit.digest,miss.digest);
 assert.equal(hit.plan,miss.plan,'a hit returns the very object the miss returned');
 assert.equal(JSON.stringify(hit.plan),JSON.stringify(planVerification(real,changes)));
 // The address resolves back to the plan, which is what `get_required_tests` is handed an address for.
 assert.equal(cache.resolve(miss.digest),miss.plan);
 assert.equal(cache.resolve('0'.repeat(64)),undefined);
 // Same change set, different order: a hit, because order is not an input.
 assert.equal(cache.plan(real,[...changes].reverse()).cached,true);
 // Every input that can change the answer is in the key, or two different plans share one address.
 const digest=(changes_:readonly PathChange[],options_={})=>planInputDigest(real,changes_,options_);
 assert.notEqual(digest(changes,{registry:withCheck('invariant.objectives.routing',['check.absent'])}),digest(changes),
  'a different registry is a different plan');
 assert.notEqual(digest(changes,{edgeTypes:['depends_on']}),digest(changes),'a different edge policy is a different plan');
 assert.notEqual(digest(changes,{maxImpacted:7}),digest(changes),'a different bound is a different plan');
 assert.notEqual(digest(changes,{maxChanges:9}),digest(changes));
 assert.notEqual(digest([...changes,change('src/core/intent.ts')]),digest(changes));
 // `from` is kept even on a kind that never looks at it, so a refused input cannot share an address with an
 // accepted one. `mapChanges` refuses the second and accepts the first.
 assert.notEqual(digest([{path:'src/adapters/objectives.ts',kind:'modified',from:'x'} as PathChange]),digest(changes));
 assert.throws(()=>cache.plan(real,[{path:'src/adapters/objectives.ts',kind:'modified',from:'x'} as PathChange]),/malformed entry/);
 // A refusal never leaves an address behind.
 assert.equal(cache.misses,2,'only the two computed plans were stored');
 assert.equal(cache.resolve(planInputDigest(real,[{path:'src/adapters/objectives.ts',kind:'modified',from:'x'} as PathChange])),undefined);
 // The bound evicts rather than refusing: a memo may forget, a plan may never.
 const bounded=createPlanCache(1);
 for(const path of ['src/adapters/objectives.ts','src/adapters/session-store.ts','src/core/intent.ts'])
  bounded.plan(real,[change(path)]);
 assert.equal(bounded.size,1);assert.equal(bounded.misses,3);
 assert.equal(JSON.stringify(bounded.plan(real,[change('src/core/intent.ts')]).plan),JSON.stringify(planVerification(real,[change('src/core/intent.ts')])));
 bounded.clear();
 assert.equal(bounded.size,0);assert.equal(bounded.hits,0);assert.equal(bounded.misses,0);
 assert.throws(()=>createPlanCache(0),/positive safe integer/);
 assert.equal(cache.plan(real,changes).cached,true,'clearing one cache does not disturb another');
 assert.ok(CAUSAL.includes('validates'),'the causal set the digest reads is the one the closure uses');
});

// --- unknown impact widens, never narrows ---

test('an unknown path widens the plan, is named, and never removes what was already found',()=>{
 const declared=[change('src/adapters/session-store.ts')];
 const known=planVerification(real,declared);
 assert.equal(known.complete,true);assert.deepEqual(known.incompleteReasons,[]);
 const widened=planVerification(real,[...declared,change('src/adapters/shared-memory.ts')]);
 // Narrowed only. The work already in hand is still there, and the reason is named rather than implied.
 assert.equal(widened.complete,false);
 assert.deepEqual(widened.incompleteReasons,['coverage-unmapped-paths']);
 assert.deepEqual(widened.unmappedPaths,['src/adapters/shared-memory.ts']);
 assert.ok(widened.incompleteReasons.length>known.incompleteReasons.length);
 assert.deepEqual(widened.tests.map(entry=>entry.id),known.tests.map(entry=>entry.id),'widening never removes a test');
 assert.deepEqual(widened.testPaths,known.testPaths);
 assert.deepEqual(widened.invariants.map(entry=>entry.id),known.invariants.map(entry=>entry.id));
 assert.ok(widened.impactedNodes.length>=known.impactedNodes.length);
 // Every reason is a real state, reachable on its own, and each one alone forbids a complete plan.
 const cases:[string,VerificationPlan][]=[
  ['coverage-unmapped-paths',widened],
  ['invariant-check-unresolved',planVerification(real,declared,{registry:withCheck('invariant.sessions.durable',['check.absent'])})],
  ['invariant-unregistered',planVerification(registryGap(),[change('test/unit.test.ts')])],
 ];
 for(const [reason,plan] of cases){
  assert.equal(plan.complete,false,`${reason} must forbid a complete plan`);
  assert.deepEqual(plan.incompleteReasons,[reason]);
 }
 // The two invariant reasons come from SG03.1's own report, read back, not from a second opinion invented here.
 const unresolved=planVerification(real,declared,{registry:withCheck('invariant.sessions.durable',['check.absent'])});
 const entry=unresolved.invariants.find(entry=>entry.id==='invariant.sessions.durable')!;
 assert.deepEqual(entry.checks,['check.absent']);
 assert.deepEqual(entry.unresolvedChecks,['check.absent']);
 assert.equal(entry.enforced,false);
 assert.deepEqual(entry.requiredChecks,[],'a check that names nothing is required by nothing');
 assert.deepEqual(unresolved.unresolvedChecks,['check.absent']);
 // A check nobody registered keeps its id, reports no claim, and still forbids a complete plan.
 const gapped=registryGap(),gappedPlan=planVerification(gapped,[change('test/unit.test.ts')]);
 assert.deepEqual(gappedPlan.tests.map(entry=>entry.id),['test.unit']);
 assert.deepEqual(gappedPlan.invariants.map(entry=>entry.id),['invariant.unregistered.one']);
 assert.equal(gappedPlan.invariants[0]!.statement,'');
 assert.deepEqual(gappedPlan.invariants[0]!.requiredChecks,['test.unit'],'the graph still says what the check validates');
 assert.deepEqual(gappedPlan.incompleteReasons,['invariant-unregistered']);
 assert.equal(gappedPlan.complete,false);
 // A registry gap in a part of the graph this change did not touch is not this plan's reason to widen. The
 // reason narrows to what the plan selected, so dropping an unselected invariant from the registry is silent
 // here and named as soon as a change does select it.
 const dropped=INVARIANTS.filter(entry=>entry.id!=='invariant.integration.load');
 const quiet=planVerification(real,[change('src/core/intent.ts')],{registry:dropped});
 assert.deepEqual(quiet.invariants.map(entry=>entry.id),['invariant.objectives.routing']);
 assert.deepEqual(quiet.incompleteReasons,[],'an unselected registration gap is not this plan\u2019s refusal');
 assert.equal(quiet.complete,true);
 const loud=planVerification(real,[change('test/loadability.test.ts')],{registry:dropped});
 assert.deepEqual(loud.invariants.map(entry=>entry.id),['invariant.integration.load']);
 assert.deepEqual(loud.incompleteReasons,['invariant-unregistered']);
 assert.equal(loud.complete,false);
 // A refusal is not a narrowed plan: an unmapped path yields a named reason, never an absent test list.
 const vanished=planVerification(real,[{path:'src/adapters/never-existed.ts',kind:'deleted'}]);
 assert.deepEqual(vanished.tests,[]);assert.deepEqual(vanished.testPaths,[]);
 assert.equal(vanished.complete,false);assert.deepEqual(vanished.incompleteReasons,['coverage-unmapped-paths']);
 assert.deepEqual(vanished.deletions,['src/adapters/never-existed.ts']);
});

/** A valid graph whose declared invariant node the registry does not carry. */
function registryGap():StateGraph{
 return graph([
  node('domain.x','domain',['src/a.ts']),
  node('entity.impl','entity',['src/a.ts']),
  node('contract.c','contract',['src/a.ts']),
  node('test.unit','test',['test/unit.test.ts'],['invariant.unregistered.one']),
  node('invariant.unregistered.one','invariant',['src/a.ts'],[],['test.unit']),
 ],[
  edge('e-impl-unit','test.unit','entity.impl'),
  edge('e-impl-inv','invariant.unregistered.one','entity.impl','validates'),
  edge('e-unit-inv','test.unit','invariant.unregistered.one','validates'),
 ]) as unknown as StateGraph;
}