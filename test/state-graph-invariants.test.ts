import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {INVARIANTS,defineInvariants,evaluateInvariants,ownerCheckCatalog,unregisteredInvariants,type InvariantDeclaration} from '../src/adapters/state-graph/invariants.ts';
import {parseStateGraph,type StateGraph} from '../src/adapters/state-graph/schema.ts';
// Resolved from the test file rather than the cwd, so the committed manifest and
// the cited sources are measured against this repository wherever the suite started.
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const declaration=(over:Partial<InvariantDeclaration>={}):InvariantDeclaration=>({id:'invariant.example.claim',statement:'a claim with a check bound to it',domainId:'domain.example',ownerRef:'owner.project',sources:['src/adapters/example.ts'],checks:['test.example'],...over});
const catalogOf=(...pairs:readonly (readonly [string,string])[])=>new Map<string,string>(pairs);
const source={path:'src/adapters/example.ts',digest:'a'.repeat(64)};
const gnode=(id:string,kind='entity',over:Partial<{ownerRef:string;invariantRefs:readonly string[];checkRefs:readonly string[]}>={})=>({id,kind,domainId:'domain.example',revision:1,sourceRefs:[source],ownerRef:over.ownerRef??'owner.project',contractRefs:[],invariantRefs:over.invariantRefs??[],checkRefs:over.checkRefs??[]});
const graphOf=(nodes:readonly unknown[]):StateGraph=>parseStateGraph(JSON.stringify({version:1,nodes,edges:[]}));
test('an invariant declared without an enforcing check is reported as unenforced, never accepted as coverage',()=>{
 const registry=defineInvariants([declaration({checks:[]})]);
 // Both catalogs matter: a gap must surface whether or not checks are available,
 // because silence that depends on the catalog is exactly the assumption to avoid.
 for(const catalog of [new Map<string,string>(),catalogOf(['test.example','owner.project'])]){
  const report=evaluateInvariants(registry,catalog);
  assert.equal(report.entries.length,1,'the gap is still an entry, not a dropped row');
  assert.equal(report.complete,false,'a registry with an unchecked invariant must not read as complete');
  assert.equal(report.unenforced.length,1);
  const [gap]=report.unenforced;
  assert.equal(gap?.id,'invariant.example.claim');
  assert.equal(gap?.status,'unenforced');
  assert.equal(gap?.checkExists,false);
  assert.equal(gap?.reason,'check-not-declared');
  assert.deepEqual(gap?.unresolved,[],'nothing was declared, so nothing can be unresolved');
  assert.equal(report.entries[0]?.status,'unenforced','the entries view agrees with the gap list');
 }
});
test('a declared check that is unknown or owned by someone else does not enforce anything',()=>{
 const unknown=evaluateInvariants(defineInvariants([declaration()]),new Map());
 assert.equal(unknown.complete,false);
 assert.equal(unknown.unenforced[0]?.reason,'check-unknown');
 assert.equal(unknown.unenforced[0]?.checkExists,false);
 assert.deepEqual(unknown.unenforced[0]?.unresolved,['test.example'],'the report names the check that failed to resolve');
 const foreign=evaluateInvariants(defineInvariants([declaration()]),catalogOf(['test.example','owner.other']));
 assert.equal(foreign.complete,false,'a check that exists but is not the owner check is not enforcement');
 assert.equal(foreign.unenforced[0]?.reason,'check-not-owner');
 assert.deepEqual(foreign.unenforced[0]?.unresolved,['test.example']);
 // One of two checks resolving still leaves the invariant unenforced.
 const partial=evaluateInvariants(defineInvariants([declaration({checks:['test.example','test.other']})]),catalogOf(['test.example','owner.project']));
 assert.equal(partial.complete,false);
 assert.deepEqual(partial.unenforced[0]?.unresolved,['test.other']);
});
test('a declared check that exists and belongs to the owner enforces the invariant',()=>{
 const report=evaluateInvariants(defineInvariants([declaration()]),catalogOf(['test.example','owner.project']));
 assert.equal(report.complete,true);
 assert.equal(report.unenforced.length,0);
 const [entry]=report.entries;
 assert.equal(entry?.status,'enforced');
 assert.equal(entry?.checkExists,true);
 assert.equal(entry?.reason,'check-present');
 assert.deepEqual(entry?.unresolved,[]);
 assert.equal(entry?.statement,'a claim with a check bound to it','the statement survives resolution for the report to show');
});
test('an empty registry is not complete, so vacuous coverage cannot pass as a green one',()=>{
 const report=evaluateInvariants(defineInvariants([]),new Map());
 assert.equal(report.entries.length,0);
 assert.equal(report.unenforced.length,0);
 assert.equal(report.complete,false,'nothing declared means nothing enforced');
});
test('the shipped registry binds to owner checks that the committed manifest really declares',()=>{
 // The manifest artifact is read, never written, and parsed with the strict
 // schema: this asserts the binding against what the repository ships today.
 const graph=parseStateGraph(readFileSync(join(ROOT,'.cuesheet-project','graph.json'),'utf8'));
 const report=evaluateInvariants(INVARIANTS,ownerCheckCatalog(graph));
 assert.equal(report.unenforced.length,0,JSON.stringify(report.unenforced.map(e=>({id:e.id,reason:e.reason,unresolved:e.unresolved}))));
 assert.equal(report.complete,true);
assert.ok(report.entries.length>=16,'the registry lost invariants');
  const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
  assert.ok(graph.nodes.some(node=>node.kind==='invariant'),'the manifest states no invariant at all');
  // Both directions on the shipped data: a manifest invariant with no registry
  // entry is a claim nobody reads, and a registry source that has drifted from
  // the manifest is a claim citing evidence the repository does not declare.
  assert.deepEqual([...unregisteredInvariants(INVARIANTS,graph)],[],'the manifest states an invariant the registry does not carry');
 for(const entry of report.entries){
  const node=nodes.get(entry.id);
  assert.ok(node&&node.kind==='invariant',`${entry.id} is not an invariant node of the manifest`);
  assert.equal(node.domainId,entry.domainId,`${entry.id} belongs to another domain`);
  assert.equal(node.ownerRef,entry.ownerRef,`${entry.id} is owned by someone else in the manifest`);
assert.deepEqual([...node.checkRefs],[...entry.checks],`${entry.id} binds different checks than the manifest`);
   assert.deepEqual([...node.sourceRefs].map(ref=>ref.path),[...entry.sources],`${entry.id} cites sources the manifest does not declare`);
   for(const check of entry.checks){
    const checked=nodes.get(check);
    assert.ok(checked&&(checked.kind==='test'||checked.kind==='ci'),`${check} is not a check node of the manifest`);
    assert.ok(checked.invariantRefs.includes(entry.id),`${check} does not name ${entry.id} back`);
   }
   for(const path of entry.sources)assert.ok(statSync(resolve(ROOT,path)).isFile(),`${entry.id} cites ${path}, which is not a file`);
 }
});
test('declarations without a stable id, a statement, an owner, sources or a clean binding are refused',()=>{
 // Each entry pairs a broken declaration with the refusal it must provoke, so a
 // declaration rejected for an unrelated reason cannot pass as a caught mutation.
 const broken:readonly (readonly [Partial<InvariantDeclaration>,RegExp])[]=[
  [{id:'9nope.id'},/id/],
  [{statement:''},/statement/],[{statement:'   '},/statement/],[{statement:'x'.repeat(1001)},/statement/],
  [{domainId:'domain example'},/domainId/],[{domainId:'domain/example'},/domainId/],
  [{ownerRef:'owner project'},/ownerRef/],[{ownerRef:42 as never},/ownerRef/],
  [{sources:[]},/sources/],[{sources:['/abs/example.ts']},/sources/],[{sources:['../example.ts']},/sources/],
  [{sources:['src/../example.ts']},/sources/],[{sources:['src/ example.ts']},/sources/],
  [{sources:['src/adapters/example.ts','src/adapters/example.ts']},/duplicate sources/],
  [{sources:[...Array(33)].map((_,i)=>`src/adapters/example${i}.ts`)},/sources/],
  [{checks:['bad check']},/checks/],[{checks:['test.example','test.example']},/duplicate checks/],
  [{checks:'test.example' as never},/checks/],[{checks:[...Array(9)].map((_,i)=>`test.example${i}`)},/checks/],
 ];
 for(const [over,expected] of broken)assert.throws(()=>defineInvariants([declaration(over)]),expected,`accepted a declaration it should have refused: ${JSON.stringify(over)}`);
 assert.throws(()=>defineInvariants([declaration(),declaration({statement:'a second claim'})]),/duplicate id/);
 assert.throws(()=>defineInvariants([null as never]),/entry 0/);
 assert.throws(()=>defineInvariants([[] as never]),/entry 0/);
});
test('the registry, its declarations and the report it produces are frozen',()=>{
 const registry=defineInvariants([declaration()]);
 assert.ok(Object.isFrozen(registry));
 assert.ok(Object.isFrozen(registry[0]));
 assert.ok(Object.isFrozen(registry[0]?.sources));
 assert.ok(Object.isFrozen(registry[0]?.checks));
 assert.throws(()=>{(registry as unknown as InvariantDeclaration[]).push(declaration({id:'invariant.example.other'}));});
 const report=evaluateInvariants(registry,new Map());
 assert.ok(Object.isFrozen(report));
 assert.ok(Object.isFrozen(report.entries));
 assert.ok(Object.isFrozen(report.entries[0]));
 assert.ok(Object.isFrozen(report.entries[0]?.unresolved));
});
test('the check catalog carries only test and ci nodes, by id and owner',()=>{
 const graph=graphOf([gnode('domain.example','domain'),gnode('entity.example'),gnode('contract.example','contract'),gnode('invariant.example.claim','invariant'),
  gnode('test.example','test',{ownerRef:'owner.project'}),gnode('ci.example','ci',{ownerRef:'owner.ci'}),gnode('source.example','source')]);
 const catalog=ownerCheckCatalog(graph);
 assert.deepEqual([...catalog.entries()].sort(),[['ci.example','owner.ci'],['test.example','owner.project']]);
 assert.equal(catalog.size,2,'every other kind is excluded from the catalog');
});
test('an invariant the graph states but the registry does not carry is reported, not ignored',()=>{
 const registry=defineInvariants([declaration()]);
 const graph=graphOf([gnode('domain.example','domain'),gnode('invariant.example.claim','invariant'),gnode('invariant.example.other','invariant')]);
 assert.deepEqual(unregisteredInvariants(registry,graph),['invariant.example.other']);
 assert.deepEqual(unregisteredInvariants(defineInvariants([]),graph),['invariant.example.claim','invariant.example.other']);
 assert.deepEqual(unregisteredInvariants(registry,graphOf([gnode('domain.example','domain')])),[]);
});
