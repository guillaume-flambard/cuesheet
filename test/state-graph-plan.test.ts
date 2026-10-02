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
 // graph selects nothing to execute. Widening it would mean guessing that a test file belongs to a source
 // file, which is the guessed seed SG02.2 forbids, so the manifest is left alone and pinned here: closing the
 // gap is a deliberate, visible edit for SG01.3 rather than a silent drift.
 assert.deepEqual(silent,['src/adapters/code-worker-integration.ts','src/adapters/code-worker-loop.ts','src/adapters/managed-worktrees.ts']);
 const gap=planVerification(real,[change('src/adapters/managed-worktrees.ts')]);
 assert.deepEqual(gap.tests,[]);assert.deepEqual(gap.testPaths,[]);
 // The repair this branch makes: a declared path with no check behind it is not coverage, so the plan refuses
 // to call itself complete. It said the opposite before, which is the silent hole: reachable nodes, no proof.
 assert.equal(gap.complete,false,'a plan naming no executable proof may never claim completeness');
 assert.deepEqual(gap.incompleteReasons,['coverage-no-executable-proof']);
 assert.deepEqual(gap.coverage,{declared:1,unmapped:0},'the path is declared: this is not the unmapped reason');
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
  ['coverage-no-executable-proof',planVerification(real,[change('src/adapters/managed-worktrees.ts')])],
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

// --- SG02.3 repair: a complete plan must name an executable proof ---

/** The three declared sources the probe named, and the entity each one is declared by. */
const UNWITNESSED=['src/adapters/code-worker-integration.ts','src/adapters/code-worker-loop.ts','src/adapters/managed-worktrees.ts'];

test('a plan that reaches nodes and names no check refuses to call itself complete',()=>{
 for(const path of UNWITNESSED){
  const plan=planVerification(real,[change(path)]);
  // The state that is the whole defect: real impacted nodes behind a declared path, and nothing to run.
  assert.deepEqual(plan.coverage,{declared:1,unmapped:0},`${path} is declared, so this is not the unmapped reason`);
  assert.ok(plan.impactedNodes.length>0,`${path} reaches nodes, so the plan has content to be silent about`);
  assert.deepEqual(plan.tests,[],`${path} selects no test`);
  assert.deepEqual(plan.jobs,[],`${path} selects no job`);
  assert.deepEqual(plan.testPaths,[]);assert.deepEqual(plan.jobPaths,[]);
  // The refusal, named. `complete: true` here is what let a plan claim proof it carried.
  assert.equal(plan.complete,false,`${path} has no executable proof, so it cannot be complete`);
  assert.deepEqual(plan.incompleteReasons,['coverage-no-executable-proof'],`${path} names the missing proof`);
 }
});

test('the no-witness reason is a different repair from the unmapped one, and the two codes say so',()=>{
 const unwitnessed=planVerification(real,[change('src/adapters/managed-worktrees.ts')]);
 const unmapped=planVerification(real,[change('src/adapters/never-declared.ts')]);
 // Same empty `tests`, same empty `testPaths`, two different causes and two different codes. A caller told
 // only the first would go looking for an edge; told only the second, for a declaration. Neither is a guess.
 assert.deepEqual(unwitnessed.tests,[]);assert.deepEqual(unmapped.tests,[]);
 assert.deepEqual(unwitnessed.coverage,{declared:1,unmapped:0});assert.deepEqual(unmapped.coverage,{declared:0,unmapped:1});
 assert.deepEqual(unwitnessed.unmappedPaths,[]);assert.deepEqual(unmapped.unmappedPaths,['src/adapters/never-declared.ts']);
 assert.deepEqual(unwitnessed.incompleteReasons,['coverage-no-executable-proof']);
 assert.deepEqual(unmapped.incompleteReasons,['coverage-unmapped-paths']);
 assert.ok(!unwitnessed.incompleteReasons.some(reason=>reason==='coverage-unmapped-paths'));
 assert.ok(!unmapped.incompleteReasons.some(reason=>reason==='coverage-no-executable-proof'));
 // A change set holding both is both, and says so in one list, so neither cause hides behind the other.
 const both=planVerification(real,[change('src/adapters/managed-worktrees.ts'),change('src/adapters/never-declared.ts')]);
 assert.deepEqual(both.coverage,{declared:1,unmapped:1});
 assert.deepEqual(both.incompleteReasons,['coverage-no-executable-proof','coverage-unmapped-paths']);
 assert.equal(both.complete,false);
 // The gate is the declaration, not the reach. An unmapped path whose string collides with a node id reaches
 // a node with no declared path behind it, and that is the unmapped reason alone: there is no edge to add.
 const collided=planVerification(real,[change('domain.sessions')]);
 assert.ok(collided.impactedNodes.length>0,'the collision reaches a node, so impacted.length cannot be the gate');
 assert.deepEqual(collided.coverage,{declared:0,unmapped:1});
 assert.deepEqual(collided.incompleteReasons,['coverage-unmapped-paths']);
 assert.equal(collided.complete,false);
 // Same entity, two declared files, one edge apart: the gap is in the edges, and the rule reads it as such.
 const covered=planVerification(real,[change('src/adapters/code-worker-workspaces.ts')]);
 assert.ok(covered.impactedNodes.some(entry=>entry.id==='entity.workers.workspaces'),'the very entity that declares the gap');
 assert.deepEqual(covered.testPaths,['test/code-worker-workspaces.test.ts','test/managed-worktrees.test.ts']);
 assert.equal(covered.complete,true);
 assert.deepEqual(covered.incompleteReasons,[]);
});

test('one executable proof is enough, and the rule does not make every plan incomplete',()=>{
 // A genuinely covered change on the real manifest stays complete, with the files it would run.
 const plan=planVerification(real,[change('src/adapters/session-store.ts')]);
 assert.equal(plan.complete,true);
 assert.deepEqual(plan.incompleteReasons,[]);
 assert.deepEqual(plan.testPaths,['test/adapters.test.ts','test/terminal-sessions.test.ts']);
 assert.deepEqual(plan.tests.map(entry=>entry.id),['test.sessions.durability','test.sessions.journal']);
 assert.deepEqual(plan.coverage,{declared:1,unmapped:0});
 // The witness is `tests` or `jobs` together, so a plan with only a job is not the empty plan this rule
 // refuses. Forgetting `jobs` here would make every job-only plan incomplete, which is the same mistake in
 // the other direction: a plan that names an executable file and calls itself incomplete is also a lie.
 // `test.unit` is present in this graph and is NOT reached by the change, so the job is the only witness.
 const shaped=[
  node('domain.x','domain',['src/a.ts']),
  node('src.a','entity',['src/a.ts']),
  node('ci.build','ci',['ci/build.sh']),
  node('test.unit','test',['test/unit.test.ts']),
  node('invariant.claimed','invariant',['src/a.ts']),
  node('contract.c','contract',['src/a.ts']),
 ];
 const withJob=graph(shaped,[
  edge('e-ci-a','ci.build','src.a'),
  edge('e-inv-a','invariant.claimed','src.a','validates'),
 ]);
 const withoutJob=graph(shaped,[
  edge('e-inv-a','invariant.claimed','src.a','validates'),
 ]);
 // A registry that carries the graph's invariant and binds it to the graph's own check, so neither plan in
 // this pair is refused for a registration or binding gap and the only variable left is the witness.
 const registry:readonly InvariantDeclaration[]=[{id:'invariant.claimed',statement:'The claim under doubt.',
  domainId:'domain.x',ownerRef:'owner.project',sources:['src/a.ts'],checks:['test.unit']}];
 const ciOnly=planVerification(withJob,[change('src/a.ts')],{registry});
 assert.deepEqual(ciOnly.tests,[]);
 assert.deepEqual(ciOnly.jobs.map(entry=>entry.id),['ci.build']);
 assert.deepEqual(ciOnly.jobPaths,['ci/build.sh']);
 assert.deepEqual(ciOnly.testPaths,[]);
 assert.equal(ciOnly.complete,true,'a named job is an executable proof');
 assert.deepEqual(ciOnly.incompleteReasons,[]);
 // And the same graph with the single job edge removed is the silent plan this rule refuses: the path is
 // still declared, the invariant is still selected, and only the executable proof is gone.
 const unwitnessed=planVerification(withoutJob,[change('src/a.ts')],{registry});
 assert.deepEqual(unwitnessed.coverage,{declared:1,unmapped:0});
 assert.deepEqual(unwitnessed.invariants.map(entry=>entry.id),['invariant.claimed']);
 assert.deepEqual(unwitnessed.tests,[]);assert.deepEqual(unwitnessed.jobs,[]);
 assert.equal(unwitnessed.complete,false);
 assert.deepEqual(unwitnessed.incompleteReasons,['coverage-no-executable-proof']);
});

test('an invariant is not an executable proof, so a plan of invariants alone is incomplete',()=>{
 // The decision, made once and pinned here: an invariants-only plan is NOT acceptable. An invariant is a
 // claim, and this plan names that the claim is in doubt while naming nothing that could doubt it. Counting
 // it as a witness would be the same silent hole wearing a different hat, and the caller has no way to tell
 // which hat a plan is wearing: `invariants` non-empty reads like coverage to anyone who skims the field list.
 // The registry below carries the claim and its binding, so `coverage-no-executable-proof` is the ONLY reason:
 // the invariant is registered and enforced, and no check was impacted all the same.
 const registry:readonly InvariantDeclaration[]=[{id:'invariant.claimed',statement:'The claim under doubt.',
  domainId:'domain.x',ownerRef:'owner.project',sources:['src/a.ts'],checks:['test.unit']}];
 const selected=planVerification(graph([
  node('domain.x','domain',['src/a.ts']),
  node('entity.impl','entity',['src/a.ts']),
  node('invariant.claimed','invariant',['src/a.ts'],[],['test.unit']),
  node('test.unit','test',['test/unit.test.ts'],['invariant.claimed']),
 ],[
  edge('e-impl-inv','invariant.claimed','entity.impl','validates'),
 ]),[change('src/a.ts')],{registry});
 // The plan is not empty and not unregistered: it carries the claim, the binding, and the file to check.
 assert.deepEqual(selected.invariants.map(entry=>entry.id),['invariant.claimed']);
 assert.equal(selected.invariants[0]!.statement,'The claim under doubt.');
 assert.deepEqual(selected.invariants[0]!.checks,['test.unit']);
 assert.equal(selected.invariants[0]!.enforced,true,'the registry and the graph agree on the binding');
 assert.deepEqual(selected.invariants[0]!.requiredChecks,[],'and no check was impacted to carry it');
 assert.ok(selected.impactedNodes.length>0);
 assert.deepEqual(selected.tests,[]);assert.deepEqual(selected.jobs,[]);
 assert.equal(selected.complete,false,'an invariant is a claim, not a command');
 assert.deepEqual(selected.incompleteReasons,['coverage-no-executable-proof']);
 // The edge that turns the claim into a command, and the plan that becomes complete with it.
 const routed=planVerification(graph([
  node('domain.x','domain',['src/a.ts']),
  node('entity.impl','entity',['src/a.ts']),
  node('invariant.claimed','invariant',['src/a.ts'],[],['test.unit']),
  node('test.unit','test',['test/unit.test.ts'],['invariant.claimed']),
 ],[
  edge('e-impl-inv','invariant.claimed','entity.impl','validates'),
  edge('e-unit-inv','test.unit','invariant.claimed','validates'),
 ]),[change('src/a.ts')],{registry});
 assert.deepEqual(routed.invariants.map(entry=>entry.id),['invariant.claimed']);
 assert.deepEqual(routed.invariants[0]!.requiredChecks,['test.unit']);
 assert.deepEqual(routed.testPaths,['test/unit.test.ts']);
 assert.equal(routed.complete,true,'the same claim with an edge to a check is complete');
 assert.deepEqual(routed.incompleteReasons,[]);
});

test('the no-witness reason is judged per plan, and that granularity is a known limit',()=>{
 // Pinned on purpose. Completeness is a property of the plan, so a change set that holds both an unwitnessed
 // declared file and a covered one names a witness and stays complete: the covered file supplies the proof.
 // The alternative, per path, is a new field on the plan and a per path closure the current shape does not
 // carry; the limit is recorded here and in the evidence rather than left to be discovered as a surprise.
 const mixed=planVerification(real,[change('src/adapters/managed-worktrees.ts'),change('src/adapters/session-store.ts')]);
 assert.deepEqual(mixed.coverage,{declared:2,unmapped:0});
 assert.deepEqual(mixed.testPaths,['test/adapters.test.ts','test/terminal-sessions.test.ts']);
 assert.equal(mixed.complete,true);
 assert.deepEqual(mixed.incompleteReasons,[]);
 // Read the truth underneath, which the plan does not claim: the covered half came from the covered path.
 assert.deepEqual(planVerification(real,[change('src/adapters/managed-worktrees.ts')]).tests,[]);
});