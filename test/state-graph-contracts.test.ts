import {test} from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {readFileSync,statSync} from 'node:fs';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {BREAKING_RULES,CONTRACTS,CONTRACT_FORMAT_VERSION,FAIL_VERDICTS,KNOWN_FORMAT_VERSIONS,TYPE_EXPRESSIONS,assessMock,compareContractBreaking,contractCanonicalForm,
 contractCanonicalText,contractDigest,decideCompatibility,defineContracts,evaluateContracts,isFailVerdict,ownerContractCatalog,supportedType,unregisteredContracts,
 type BreakingRule,type ContractDeclaration,type ContractOperation,type MockConformanceReport,type RealConformanceReport} from '../src/adapters/state-graph/contracts.ts';
import {stateGraphJson,MANIFEST_PATH} from '../src/adapters/state-graph/manifest.ts';
import {parseStateGraph,type StateGraph} from '../src/adapters/state-graph/schema.ts';
// Resolved from the test file rather than the cwd, so the committed manifest and
// the sources the shipped registry cites are measured against this repository
// wherever the suite started.
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const MODULE=join(ROOT,'src','adapters','state-graph','contracts.ts');
const DIGEST=/^[a-f0-9]{64}$/;
const ordinal=(a:string,b:string)=>a<b?-1:a>b?1:0;
const field=(name:string,type:string,required=true)=>({name,type,required});
const error=(code:string,description='a declared failure')=>({code,description});
const op=(id:string,over:Partial<Omit<ContractOperation,'id'>>={}):ContractOperation=>({id,inputs:[],outputs:[field('ok','boolean')],errors:[],examples:[],...over});
const declaration=(over:Partial<ContractDeclaration>={}):ContractDeclaration=>({id:'contract.example.thing',domainId:'domain.example',ownerRef:'owner.project',
 sources:['src/adapters/example.ts'],formatVersion:CONTRACT_FORMAT_VERSION,version:1,operations:[op('read')],...over});
const registryOf=(...declarations:readonly ContractDeclaration[])=>defineContracts(declarations.length>0?declarations:[declaration()]);
const source={path:'src/adapters/example.ts',digest:'a'.repeat(64)};
const gnode=(id:string,kind='entity',over:Partial<{ownerRef:string;contractRefs:readonly string[]}>={})=>({id,kind,domainId:'domain.example',revision:1,sourceRefs:[source],ownerRef:over.ownerRef??'owner.project',contractRefs:over.contractRefs??[],invariantRefs:[],checkRefs:[]});
const graphOf=(nodes:readonly unknown[]):StateGraph=>parseStateGraph(JSON.stringify({version:1,nodes,edges:[]}));
const catalogFor=(graph:StateGraph)=>ownerContractCatalog(graph);
const declaredIdsOf=(graph:StateGraph)=>new Set(graph.nodes.map(node=>node.id));
const realReport=(contract:ContractDeclaration,verdict:'conforming'|'divergent',observations:readonly string[]=[]):RealConformanceReport=>
 ({subject:'real',contractDigest:contractDigest(contract),verdict,observations:[...observations]});
const mockReport=(contract:ContractDeclaration,verdict:'conforming'|'divergent'='conforming'):MockConformanceReport=>
 ({subject:'mock',contractDigest:contractDigest(contract),verdict,observations:['the generated fixture answered every declared field']});
const rulesOf=(previous:ContractDeclaration,current:ContractDeclaration)=>compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(current).canonical).violations.map(violation=>violation.rule);

/** Scenario 1: the shipped registry answers the committed manifest on real data. */
test('the shipped contract registry matches the committed manifest on real data, and the reverse gap is empty there',()=>{
 const committed=readFileSync(join(ROOT,MANIFEST_PATH),'utf8'),graph=parseStateGraph(committed);
 const report=evaluateContracts(CONTRACTS,catalogFor(graph),declaredIdsOf(graph));
 assert.deepEqual([...report.unresolved].map(entry=>({id:entry.id,reason:entry.reason})),[],'a shipped declaration did not resolve against the manifest it ships with');
 assert.equal(report.complete,true);
 assert.equal(report.entries.length,11,'the registry lost contracts the manifest states');
 assert.ok(graph.nodes.filter(node=>node.kind==='contract').length>=11,'the manifest states fewer contracts than the registry carries, so the comparison would be one-sided');
 assert.deepEqual([...unregisteredContracts(CONTRACTS,graph)],[],'the manifest states a contract the registry does not carry');
 const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
 for(const entry of report.entries){
  const node=nodes.get(entry.id);
  assert.ok(node&&node.kind==='contract',`${entry.id} is not a contract node of the manifest`);
  assert.equal(node.domainId,entry.domainId,`${entry.id} belongs to another domain in the manifest`);
  assert.equal(node.ownerRef,entry.ownerRef,`${entry.id} is owned by someone else in the manifest`);
  assert.deepEqual([...node.sourceRefs].map(ref=>ref.path),[...entry.sources],`${entry.id} cites sources the manifest does not declare`);
  // A contract body is a claim nothing else can fail, so every operation id has to
  // be a name one of its cited sources really carries. A contract node may cite
  // several files, and the body draws on the union of them, so at least one has to
  // name it. Without this the registry would pass as coverage of a surface nobody
  // declared.
  for(const operation of entry.operations){
   const witnesses=entry.sources.filter(path=>new RegExp(`\\b${operation.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(readFileSync(resolve(ROOT,path),'utf8')));
   assert.ok(witnesses.length>0,`${entry.id} declares operation ${operation.id}, which none of ${entry.sources.join(', ')} names`);
  }
  for(const path of entry.sources)assert.ok(statSync(resolve(ROOT,path)).isFile(),`${entry.id} cites ${path}, which is not a file`);
 }
});

/** Scenario 2: the gap is reported in both directions, and never folded into a count. */
test('a gap is named in both directions, and an empty registry is never complete',()=>{
 const graph=parseStateGraph(readFileSync(join(ROOT,MANIFEST_PATH),'utf8'));
 // Direction one: the graph states contracts the registry does not carry.
 const reverse=unregisteredContracts(defineContracts([]),graph);
 assert.deepEqual(reverse,[...graph.nodes.filter(node=>node.kind==='contract').map(node=>node.id)].sort(ordinal),'the graph contracts must appear as the reverse gap of an empty registry');
 assert.equal(reverse.length,11);
 assert.deepEqual([...unregisteredContracts(defineContracts([]),graphOf([gnode('domain.example','domain'),gnode('contract.example.thing','contract')]))],['contract.example.thing']);
 // Direction two: the registry declares something no node declares, and it is named.
 const orphan=evaluateContracts(registryOf(declaration()),new Map(),new Set());
 assert.equal(orphan.entries.length,1,'the gap is still an entry, not a dropped row');
 assert.equal(orphan.complete,false);
 assert.equal(orphan.entries[0]?.reason,'contract-not-declared');
 assert.equal(orphan.entries[0]?.nodeExists,false);
 assert.equal(orphan.entries[0]?.status,'undeclared');
 assert.deepEqual([...orphan.unresolved].map(entry=>entry.id),['contract.example.thing']);
 // An empty registry has no gap and is still not complete, so nothing declared
 // cannot read as everything declared.
 const empty=evaluateContracts(defineContracts([]),catalogFor(graph),declaredIdsOf(graph));
 assert.deepEqual([...empty.unresolved],[]);
 assert.equal(empty.complete,false,'nothing declared means nothing resolved against the manifest');
});

/** Scenario 3: a contract node owned by someone else resolves to `contract-not-owner`. */
test('a contract node owned by someone else does not resolve, and an id that is not a contract does not either',()=>{
 const registry=registryOf(declaration({ownerRef:'owner.project'}));
 const foreign=graphOf([gnode('domain.example','domain'),gnode('contract.example.thing','contract',{ownerRef:'owner.other'})]);
 const owned=evaluateContracts(registry,catalogFor(foreign),declaredIdsOf(foreign));
 assert.equal(owned.complete,false);
 assert.equal(owned.entries[0]?.reason,'contract-not-owner','a contract owned by someone else is not a declaration this owner can rely on');
 assert.equal(owned.entries[0]?.nodeExists,true,'the node is there; it is simply not the owner check');
 assert.deepEqual([...owned.unresolved].map(entry=>entry.id),['contract.example.thing']);
 // Same id, same owner, but the node is not a contract: present, and still unknown.
 const mistyped=graphOf([gnode('domain.example','domain'),gnode('contract.example.thing')]);
 const unknown=evaluateContracts(registry,catalogFor(mistyped),declaredIdsOf(mistyped));
 assert.equal(unknown.entries[0]?.reason,'contract-unknown','an id that resolves to no contract node cannot be a contract reference');
 assert.equal(unknown.complete,false);
 // And the honest case: present, same owner, contract kind.
 const admitted=graphOf([gnode('domain.example','domain'),gnode('contract.example.thing','contract')]);
 const ok=evaluateContracts(registry,catalogFor(admitted),declaredIdsOf(admitted));
 assert.equal(ok.entries[0]?.reason,'contract-present');
 assert.equal(ok.entries[0]?.status,'declared');
 assert.equal(ok.complete,true);
 assert.ok(Object.isFrozen(ok)&&Object.isFrozen(ok.entries)&&Object.isFrozen(ok.entries[0]));
});

/** Scenario 4: version rules, at the declaration and at the decision. */
test('a version that is not a positive safe integer is refused, and a version the rules do not know never renders compatible',()=>{
 for(const [over,expected] of [[{version:0},/version/],[{version:1.5},/version/],[{version:'1'},/version/],[{version:Number.NaN},/version/],
  [{formatVersion:0},/formatVersion/],[{formatVersion:'1'},/formatVersion/],[{formatVersion:Number.MAX_SAFE_INTEGER+2},/formatVersion/]] as const)
  assert.throws(()=>defineContracts([declaration(over)]),expected,`accepted a version it should have refused: ${JSON.stringify(over)}`);
 const known=defineContracts([declaration({formatVersion:KNOWN_FORMAT_VERSIONS[0]!})]);
 assert.equal(known[0]?.formatVersion,CONTRACT_FORMAT_VERSION);
 assert.doesNotThrow(()=>defineContracts([declaration({formatVersion:KNOWN_FORMAT_VERSIONS[0]!})]));
 // A declared version the rule set does not know is not a soft pass. It cannot even
 // be declared, and a declaration that skipped the check does not decide.
 const previous=declaration({version:1}),future={...declaration({version:2}),formatVersion:99};
 const verdict=decideCompatibility({previous,current:future,real:realReport(future,'conforming')});
 assert.equal(verdict.verdict,'unknown','an unknown contract format version must never degrade into compatible');
 assert.deepEqual([...verdict.reasons],['unknown-contract-version']);
 assert.equal(isFailVerdict(verdict.verdict),false,'unknown is undecided, not a fail and not a pass');
});

/** Scenario 5: a type expression outside the closed vocabulary, and the inherited-property trap. */
test('a type expression outside the closed vocabulary is refused by field name, and an Object.prototype member is refused rather than inherited',()=>{
 assert.ok(TYPE_EXPRESSIONS.size>=1);
 const vocabulary=[...TYPE_EXPRESSIONS].sort(ordinal);
 // Every member of the vocabulary is admitted, so the refusals below are refusals of
 // the vocabulary itself and not of an accidental gap in it.
 for(const type of vocabulary)assert.equal(defineContracts([declaration({operations:[op('read',{inputs:[field('a',type)]})]})])[0]?.operations[0]?.inputs[0]?.type,type);
 const broken:readonly (readonly [string,RegExp])[]=[
  ['List<string>',/inputs\.type/],['Map<string,number>',/inputs\.type/],['string|null',/inputs\.type/],
  ['constructor',/inputs\.type/],['toString',/inputs\.type/],['valueOf',/inputs\.type/],['hasOwnProperty',/inputs\.type/],
  ['__proto__',/inputs\.type/],['STRING',/inputs\.type/],[42,/inputs\.type/],['',/inputs\.type/],['x'.repeat(121),/inputs\.type/],
 ];
 for(const [type,expected] of broken)
  assert.throws(()=>defineContracts([declaration({operations:[op('read',{inputs:[field('a',type as string)]})]})]),expected,`admitted the out-of-vocabulary type ${String(type)}`);
 // The trap itself, measured: a bare lookup would resolve these to functions on
 // Object.prototype, so an inherited name must not read as a supported type.
 for(const name of ['constructor','toString','valueOf','hasOwnProperty','__defineGetter__'])assert.equal(supportedType(name),false,`${name} read as a supported type through an inherited property`);
 assert.notEqual(({} as Record<string,unknown>)['constructor' as never],undefined,'the fixture is only a trap if the bare lookup really would resolve');
 for(const type of vocabulary)assert.equal(supportedType(type),true);
 // Membership is only trap-free while the table it is tested against has no
 // prototype to inherit from. On an ordinary object literal the bare lookup above
 // resolves, which is the exact defect `evaluation/state-graph-seed-mapping/evidence.md`
 // records, so the property is pinned here rather than left to the implementation.
 assert.match(readFileSync(MODULE,'utf8'),/Object\.create\(null\)/,'the membership table must have a null prototype, or an inherited name can resolve again');
 for(const name of ['constructor','toString','valueOf','__proto__'])assert.equal(supportedType(name as never),false);
 // An operation that skipped the declaration still refuses to be decided on.
 const smuggled={...declaration({version:2}),operations:[op('read',{inputs:[field('a','List<string>')]})]};
 const refused=decideCompatibility({previous:declaration({version:1}),current:smuggled,real:{subject:'real',contractDigest:contractDigest(smuggled),verdict:'conforming',observations:[]}});
 assert.equal(refused.verdict,'unknown');
 assert.deepEqual([...refused.reasons],['unsupported-type-expression']);
 assert.equal(contractCanonicalForm(smuggled).unsupported.length,1,'the unsupported expression is reported, not approximated');
 assert.ok(!contractCanonicalText(smuggled).includes('List<string>'),'an unread type must not survive into the canonical form as text');
});

/** Scenario 6: the contract digest is canonical, and carries no clock, path or machine. */
test('the same contract reordered gives the same digest, a changed value gives a different one, and the form carries no machine',()=>{
 const straight=declaration({sources:['src/adapters/a.ts','src/adapters/b.ts'],operations:[op('read',{inputs:[field('a','string'),field('b','integer',false)],errors:[error('boom','first'),error('alarm','second')],examples:['one','two']}),op('write')]});
 const shuffled=declaration({sources:['src/adapters/b.ts','src/adapters/a.ts'],operations:[op('write'),op('read',{examples:['one','two'],errors:[error('alarm','second'),error('boom','first')],inputs:[field('b','integer',false),field('a','string')]})]});
 assert.equal(contractDigest(straight),contractDigest(shuffled),'key order and list order must not move the digest');
 assert.equal(contractCanonicalText(straight),contractCanonicalText(shuffled));
 // Each sorted list is exercised on its own, so dropping any one sort is caught
 // rather than hidden by another list happening to move too.
 const canonicalTextOf=(sources:readonly string[])=>contractCanonicalText(declaration({sources,operations:[op('read')]}));
 assert.equal(canonicalTextOf(['src/adapters/a.ts','src/adapters/b.ts']),canonicalTextOf(['src/adapters/b.ts','src/adapters/a.ts']),'source order moved the canonical form');
 const canonicalTextOfErrors=(codes:readonly string[])=>contractCanonicalText(declaration({operations:[op('read',{errors:codes.map(code=>error(code))})]}));
 assert.equal(canonicalTextOfErrors(['boom','alarm']),canonicalTextOfErrors(['alarm','boom']),'error order moved the canonical form');
 const canonicalTextOfInputs=(names:readonly string[])=>contractCanonicalText(declaration({operations:[op('read',{inputs:names.map(name=>field(name,'string'))})]}));
 assert.equal(canonicalTextOfInputs(['a','b']),canonicalTextOfInputs(['b','a']),'input order moved the canonical form');
 const canonicalTextOfOperations=(ids:readonly string[])=>contractCanonicalText(declaration({operations:ids.map(id=>op(id))}));
 assert.equal(canonicalTextOfOperations(['read','write']),canonicalTextOfOperations(['write','read']),'operation order moved the canonical form');
 // Examples are the one list whose order is kept, because no rule reads it and no
 // source says whether it is semantic. Reordering it moves the digest, which is
 // what makes that choice reviewable instead of accidental.
 const withExamples=(values:readonly string[])=>contractCanonicalText(declaration({operations:[op('read',{examples:values})]}));
 assert.notEqual(withExamples(['one','two']),withExamples(['two','one']),'example order is kept by design, so this pair must differ');
 const text=contractCanonicalText(straight);
 assert.match(contractDigest(straight),DIGEST);
 // One changed value moves it, and the change is named rather than approximated.
 const changed:readonly (readonly [string,ContractDeclaration])[]=[
  ['version',declaration({version:2})],
  ['owner',declaration({ownerRef:'owner.other'})],
  ['sources',declaration({sources:['src/adapters/other.ts']})],
  ['input type',declaration({operations:[op('read',{inputs:[field('a','integer')]})]})],
  ['error description',declaration({operations:[op('read',{inputs:[field('a','string'),field('b','integer',false)],errors:[error('boom','a different description')],examples:['one','two']})]})],
  ['operation id',declaration({operations:[op('replaced')]})],
  ['example text',declaration({operations:[op('read',{inputs:[field('a','string'),field('b','integer',false)],errors:[error('boom')],examples:['one','two','three']})]})],
  ['format version',{...declaration(),formatVersion:2}],
 ];
 for(const [label,other] of changed)assert.notEqual(contractDigest(straight),contractDigest(other),`changing the ${label} did not move the digest`);
 // No clock, no absolute path, no machine name in the bytes or the digest path.
 assert.ok(!text.includes(ROOT)&&!text.includes('/Users/'),'the canonical form carries an absolute path from this machine');
 assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text),'the canonical form carries a timestamp');
 const digestPath=readFileSync(MODULE,'utf8').split('export const CONTRACTS')[0]??'';
 assert.ok(!/new Date|Date\.now|process\.(env|hostname|platform)/.test(digestPath),'the digest path must not read a clock, an environment or a machine name');
 assert.equal(contractDigest(straight),contractDigest(structuredClone(straight)),'the digest is a function of the declaration alone');
});

/** Scenario 7: one test per breaking rule, plus the enumeration that expects none. */
test('rule 1: an operation present at the previous version and absent at the current one breaks',()=>{
 const previous=declaration({operations:[op('read'),op('write')]});
 const current=declaration({version:2,operations:[op('read')]});
 const violations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(current).canonical).violations;
 assert.deepEqual(violations.map(v=>v.rule),['operation-removed']);
 assert.equal(violations[0]?.operation,'write');
 assert.equal(violations[0]?.field,null,'the violation names the operation, which is what disappeared');
 assert.equal(decideCompatibility({previous,current,real:realReport(current,'conforming')}).verdict,'breaking');
 // The real report agreeing changes nothing: a break is decided structurally.
 assert.deepEqual([...decideCompatibility({previous,current,real:realReport(current,'conforming')}).reasons],['breaking-change']);
});

test('rule 2: an operation renamed breaks, and an operation added does not',()=>{
 const previous=declaration({operations:[op('read')]});
 // The contract body carries no rename marker, so a rename is observable as the
 // removal of the old name and the addition of the new one. The verdict is
 // breaking, and the report says which facts it is made of rather than guessing
 // that one name became the other.
 const renamed=declaration({version:2,operations:[op('fetch')]});
 const renamedViolations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(renamed).canonical).violations;
 assert.deepEqual(renamedViolations.map(v=>v.rule),['operation-added','operation-removed']);
 assert.equal(decideCompatibility({previous,current:renamed,real:realReport(renamed,'conforming')}).verdict,'breaking');
 // The addition half, on its own: an operation nobody called before cannot break a
 // consumer that never called it, and a rule that made it break would be wrong.
 const added=declaration({version:2,operations:[op('read'),op('list')]});
 const violations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(added).canonical).violations;
 assert.deepEqual(violations.map(v=>v.rule),['operation-added'],'the addition is reported as a fact about the new name');
 assert.equal(decideCompatibility({previous,current:added,real:realReport(added,'conforming')}).verdict,'compatible','adding an operation is not a break');
 assert.deepEqual([...decideCompatibility({previous,current:added,real:realReport(added,'conforming')}).reasons],['real-conforming']);
});

test('rule 3: an input that becomes required breaks',()=>{
 const previous=declaration({operations:[op('read',{inputs:[field('a','string',false)]})]});
 const current=declaration({version:2,operations:[op('read',{inputs:[field('a','string')]})]});
 const violations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(current).canonical).violations;
 assert.deepEqual(violations.map(v=>v.rule),['input-now-required']);
 assert.equal(violations[0]?.field,'a');
 assert.equal(decideCompatibility({previous,current,real:realReport(current,'conforming')}).verdict,'breaking');
 // The other direction is not a break: a required input becoming optional is a
 // relaxation a consumer already tolerates.
 const relaxed=declaration({version:2,operations:[op('read',{inputs:[field('a','string',false)]})]});
 assert.deepEqual(rulesOf(previous,relaxed),[]);
 // And an input that did not exist before is not a field that became required.
 const appeared=declaration({version:2,operations:[op('read',{inputs:[field('a','string',false),field('b','string')]})]});
 assert.deepEqual(rulesOf(previous,appeared),[]);
});

test('rule 4: a required output removed breaks, and an output added does not',()=>{
 const previous=declaration({operations:[op('read',{outputs:[field('body','string'),field('cursor','string')]})]});
 const current=declaration({version:2,operations:[op('read',{outputs:[field('body','string')]})]});
 const violations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(current).canonical).violations;
 assert.deepEqual(violations.map(v=>v.rule),['required-output-removed']);
 assert.equal(violations[0]?.field,'cursor');
 assert.equal(decideCompatibility({previous,current,real:realReport(current,'conforming')}).verdict,'breaking');
 const added=declaration({version:2,operations:[op('read',{outputs:[field('body','string'),field('cursor','string'),field('etag','string')]})]});
 assert.deepEqual(rulesOf(previous,added),[],'an output that did not exist before breaks nobody');
 assert.equal(decideCompatibility({previous,current:added,real:realReport(added,'conforming')}).verdict,'compatible');
 // An optional output removed is not a required output removed.
 const optional=declaration({operations:[op('read',{outputs:[field('body','string'),field('cursor','string',false)]})]});
 const dropped=declaration({version:2,operations:[op('read',{outputs:[field('body','string')]})]});
 assert.deepEqual(rulesOf(optional,dropped),[]);
});

test('rule 5: a type changed on an existing input or output breaks',()=>{
 const previous=declaration({operations:[op('read',{inputs:[field('a','string')],outputs:[field('body','string')]})]});
 for(const [current,fieldName] of [
  [declaration({version:2,operations:[op('read',{inputs:[field('a','integer')],outputs:[field('body','string')]})]}),'inputs.a'],
  [declaration({version:2,operations:[op('read',{inputs:[field('a','string')],outputs:[field('body','object')]})]}),'outputs.body'],
 ] as const){
  const violations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(current).canonical).violations;
  assert.deepEqual(violations.map(v=>v.rule),['type-changed'],`${fieldName} did not raise a type change`);
  assert.equal(violations[0]?.field,fieldName,'the violation names the field and the direction it is read in');
  assert.match(violations[0]?.detail??'',/->/, 'the change is stated, not just flagged');
  assert.equal(decideCompatibility({previous,current,real:realReport(current,'conforming')}).verdict,'breaking');
 }
 // A field that appears is not a type change, it is a field nobody had required.
 const appeared=declaration({version:2,operations:[op('read',{inputs:[field('a','string'),field('b','string')],outputs:[field('body','string')]})]});
 assert.deepEqual(rulesOf(previous,appeared),[]);
});

test('rule 6: a declared error code removed breaks',()=>{
 const previous=declaration({operations:[op('read',{errors:[error('unbound-project'),error('ambiguous-project')]})]});
 const current=declaration({version:2,operations:[op('read',{errors:[error('unbound-project','a different description')]})]});
 const violations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(current).canonical).violations;
 assert.deepEqual(violations.map(v=>v.rule),['error-removed'],'only the withdrawn code is a removal; a reworded one is not');
 assert.equal(violations[0]?.field,'ambiguous-project');
 assert.equal(decideCompatibility({previous,current,real:realReport(current,'conforming')}).verdict,'breaking');
 const kept=declaration({version:2,operations:[op('read',{errors:[error('unbound-project','a different description'),error('ambiguous-project')]})]});
 assert.deepEqual(rulesOf(previous,kept),[],'a reworded description is not a removed code');
 const added=declaration({version:2,operations:[op('read',{errors:[error('unbound-project'),error('ambiguous-project'),error('stale-context')]})]});
 assert.deepEqual(rulesOf(previous,added),[]);
});

test('all six patterns together break, and none of them firing is compatible',()=>{
 assert.deepEqual([...BREAKING_RULES].sort(ordinal),['error-removed','input-now-required','operation-added','operation-removed','required-output-removed','type-changed']);
 // One change per rule on a single operation, plus one operation added and one
 // removed. A type change needs a field that exists on both sides, so it has to
 // live on the operation that keeps its name.
 const previous=declaration({operations:[op('read',{inputs:[field('a','string',false),field('note','string')],outputs:[field('body','string'),field('cursor','string')],errors:[error('boom')]}),
  op('write',{inputs:[field('id','string')],outputs:[field('written','boolean')]})]});
 const current=declaration({version:2,operations:[op('read',{inputs:[field('a','string'),field('note','integer'),field('cursor','string',false)],outputs:[field('body','string')],errors:[]}),
  op('fetch',{inputs:[],outputs:[]})]});
 const violations=compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(current).canonical).violations;
 const fired=[...new Set(violations.filter(v=>v.rule!=='operation-added').map(v=>v.rule))].sort(ordinal);
 assert.deepEqual(fired,['error-removed','input-now-required','operation-removed','required-output-removed','type-changed'],'one of the five breaking rules did not fire on its own pattern');
 assert.ok(violations.some(v=>v.rule==='operation-added'),'the added operation is reported as a fact even though it does not break');
 // Every violation is sorted and named, so the report reads in the same order twice.
 assert.deepEqual([...violations].sort((a,b)=>ordinal(a.rule,b.rule)||ordinal(a.operation,b.operation)||ordinal(a.field??'',b.field??'')||ordinal(a.detail,b.detail)).map(v=>v.rule),violations.map(v=>v.rule),'the violation list is not in its declared order');
 const report=decideCompatibility({previous,current,real:realReport(current,'conforming')});
 assert.equal(report.verdict,'breaking');
 assert.deepEqual([...report.breaking!.rules],fired,'the report names the rules that fired');
 // The same six rules, none of them firing.
 const unchanged=declaration({version:2,operations:[...previous.operations].reverse()});
 assert.deepEqual(compareContractBreaking(contractCanonicalForm(previous).canonical,contractCanonicalForm(unchanged).canonical).violations,[],'a declaration that only changed its order fired a rule');
 assert.equal(decideCompatibility({previous,current:unchanged,real:realReport(unchanged,'conforming')}).verdict,'compatible');
 // Every rule is addressable by name, so a rule that is not in the enumeration
 // cannot hide in the implementation.
 assert.equal(BREAKING_RULES.length,6,'the rule set must stay exactly the six named rules');
 for(const rule of BREAKING_RULES)assert.ok(rule.length>0);
 assert.equal(new Set(BREAKING_RULES).size,6,'the enumeration must not repeat a rule under two names');
});

/** Scenario 8: the mock never enters the decision, and FAIL is not UNKNOWN. */
test('a green mock with no real report is unknown, and a green mock with a divergent real report is divergent, never compatible',()=>{
 const previous=declaration({operations:[op('read')]}),current=declaration({version:2,operations:[op('read')]});
 const green=mockReport(current,'conforming');
 assert.equal(green.verdict,'conforming','the fixture is green on purpose; the mock says the generated data matched');
 // A green mock plus no real report: undecided, and specifically not compatible.
 const withoutReal=decideCompatibility({previous,current,real:null});
 assert.equal(withoutReal.verdict,'unknown','a green mock is not an input, so it cannot produce a verdict');
 assert.deepEqual([...withoutReal.reasons],['no-real-report']);
 assert.equal(isFailVerdict(withoutReal.verdict),false,'unknown is not a soft fail and is not a pass');
 assert.equal(withoutReal.realReport,null,'no mock report was read into the report');
 // A green mock plus a real report that concludes divergent: FAIL, by `divergent`.
 const withReal=decideCompatibility({previous,current,real:realReport(current,'divergent',['the real implementation omits body'])});
 assert.equal(withReal.verdict,'divergent','the case AC-SG05 names is the real report, not the mock');
 assert.equal(isFailVerdict(withReal.verdict),true,'divergent is FAIL');
 assert.deepEqual([...FAIL_VERDICTS].sort(ordinal),['breaking','divergent'],'FAIL is these two verdicts and nothing else');
 assert.deepEqual([...withReal.reasons],['real-divergent']);
 assert.deepEqual([...withReal.realReport!.observations],['the real implementation omits body'],'the report names the divergence');
 assert.notEqual(withReal.verdict,withoutReal.verdict,'the difference between these two verdicts is the criterion');
 // The mock cannot be forced into the real slot, even by a cast.
 assert.throws(()=>decideCompatibility({previous,current,real:green as unknown as RealConformanceReport}),
  /mock conformance report is never an input/,'a mock report was believed as a real one');
 assert.throws(()=>decideCompatibility({previous,current,real:mockReport(current,'divergent') as unknown as RealConformanceReport}),
  /mock conformance report is never an input/,'a mock report that concluded divergent was believed as a real one');
 assert.throws(()=>decideCompatibility({previous,current,real:{subject:'mock',contractDigest:contractDigest(current),verdict:'conforming',observations:[]}} as unknown as RealConformanceReport),
  /never an input/);
 assert.throws(()=>decideCompatibility({previous,current,real:{subject:'real',contractDigest:'nope',verdict:'conforming',observations:[]} as RealConformanceReport}),/conformance report/,
  'a real report must name the contract it was produced against');
 // What the mock does prove, stated as its own thing with no verdict field in it.
 const assessment=assessMock(green,current);
 assert.equal(assessment.conformsToContract,true);
 assert.equal(assessment.subject,'mock');
 assert.ok(!('verdict' in assessment),'a mock assessment must not carry anything a caller could read as a compatibility verdict');
 assert.ok(!('compatible' in assessment)&&!('fail' in assessment));
 assert.equal(assessMock(mockReport(current,'divergent'),current).conformsToContract,true,'conformsToContract is about the mock against the contract, not about the backend');
 assert.throws(()=>assessMock(realReport(current,'conforming') as unknown as MockConformanceReport),/mock conformance report/,'a real report is not a mock assessment');
 // A report bound to another contract concludes nothing about this one.
 const other=declaration({id:'contract.example.other',operations:[op('other')]});
 const mismatched=decideCompatibility({previous,current,real:realReport(other,'conforming')});
 assert.equal(mismatched.verdict,'unknown','a report about a different contract is not agreement about this one');
 assert.deepEqual([...mismatched.reasons],['report-digest-mismatch']);
 assert.equal(isFailVerdict(mismatched.verdict),false);
// The limit, measured rather than asserted away: this layer can refuse a report
// that declares itself a mock, and it cannot tell a report that lies about its own
// subject. Nothing here observes the implementation, so proving that a report came
// from the real one is SG05.3's question. A report that relabels itself and names
// the right digest is therefore indistinguishable here, and that is what the
// assertion says: the rule that is missing is provenance, and it is named rather
// than papered over.
 const relabelled=decideCompatibility({previous,current,real:{...green,subject:'real' as const}});
 assert.equal(relabelled.verdict,'compatible','nothing below this layer can tell a relabelled mock from a real report; only provenance could, and it is SG05.3');
 assert.equal(relabelled.realReport?.subject,'real');
 assert.deepEqual([...relabelled.reasons],['real-conforming']);
});

/** Scenario 10: a first declared version has nothing to be compatible with. */
test('a contract at its first declared version is unknown, neither breaking nor compatible',()=>{
 const first=declaration({operations:[op('read')]});
 const report=decideCompatibility({previous:null,current:first,real:realReport(first,'conforming')});
 assert.equal(report.verdict,'unknown','a first version is not breaking by default and not compatible with anything');
 assert.deepEqual([...report.reasons],['no-previous-version']);
 assert.equal(report.previousDigest,null);
 assert.equal(report.previousVersion,null);
 assert.equal(report.breaking,null,'no comparison ran, so there is no breaking change to report');
 assert.equal(isFailVerdict(report.verdict),false);
 assert.notEqual(report.verdict,'compatible');
 // Same with a real report that disagrees: still unknown, because there is no
 // previous version to have diverged from.
 const divergent=decideCompatibility({previous:null,current:first,real:realReport(first,'divergent')});
 assert.equal(divergent.verdict,'unknown');
 assert.deepEqual([...divergent.reasons],['no-previous-version'],'a first version cannot diverge from anything, so a divergent report changes nothing');
 // And no current contract at all.
 const none=decideCompatibility({previous:null,current:null,real:null});
 assert.equal(none.verdict,'unknown');
 assert.deepEqual([...none.reasons],['no-current-contract']);
 assert.equal(none.contractId,'');
 assert.throws(()=>decideCompatibility(null as never),/input/);
 assert.throws(()=>decideCompatibility({previous:null,current:null,real:{subject:'real',contractDigest:'not-a-digest',verdict:'conforming',observations:[]} as RealConformanceReport}),/conformance report/);
});

/** Scenario 11: the objectives keep their own namespace. */
test('nothing in this batch brings a contract revision and an objective check digest together',()=>{
 const module=readFileSync(MODULE,'utf8'),test=readFileSync(fileURLToPath(import.meta.url),'utf8');
 // Built at runtime so this file does not contain the literal it refuses to contain.
 const objectiveDigest=['check','Digest'].join(''),objectiveAdapter=['objectives','.ts'].join('');
 // The two revisions live in separate namespaces: a contract version is compared by
 // these rules, an objective revision belongs to the objectives adapter. Nothing here
 // reads, writes or mentions the other.
 assert.ok(!module.includes(objectiveDigest),'the contract module must not mention an objective check digest');
 assert.ok(!/import[^;]*objectives\.ts/.test(module),'the contract module must not import the objectives adapter');
 // Naming the objectives source as a declared source is required, not forbidden: it
 // is what the committed manifest already states for contract.objectives.record.
 assert.ok(module.includes(objectiveAdapter),'the objectives contract must still cite the file the manifest points it at');
 assert.ok(!test.includes(objectiveDigest),'no test of this batch reads an objective check digest');
 assert.ok(!test.includes(objectiveAdapter),'no test of this batch reads the objectives adapter');
 // And the shipped registry carries no objective vocabulary, so a contract digest
 // cannot be mistaken for an objective revision by reading it.
 for(const entry of CONTRACTS){
  assert.equal(entry.version,1,'a declared contract version is the contract version, not an objective revision');
  assert.ok(!JSON.stringify(entry).includes(objectiveDigest));
 }
 // An objective revision could be any integer without moving a contract digest.
 const base=declaration(),moved={...structuredClone(base),version:base.version+41};
 assert.notEqual(contractDigest(base),contractDigest(moved),'the contract digest ignores nothing it declares, and declares no objective revision');
});

/** Scenario 12: the committed manifest is byte-identical and untouched. */
test('the committed manifest is what the generator produces, and this batch added no node and no edge',()=>{
 const committed=readFileSync(join(ROOT,MANIFEST_PATH),'utf8');
 assert.equal(committed,stateGraphJson(ROOT),'the committed artifact drifted from the generator; this batch must not have regenerated it');
 const graph=parseStateGraph(committed);
 assert.equal(graph.nodes.length,69,'a node count other than the committed one means this batch touched the manifest');
 assert.equal(graph.edges.length,76,'an edge count other than the committed one means this batch touched the manifest');
 assert.equal(graph.nodes.filter(node=>node.kind==='contract').length,11);
 assert.equal(CONTRACTS.length,11,'the registry must carry exactly the contract nodes the manifest states');
 // No declaration invented a reference the manifest does not state.
 const ids=new Set(graph.nodes.map(node=>node.id));
 for(const entry of CONTRACTS){
  assert.ok(ids.has(entry.id),`${entry.id} is not a node of the committed manifest`);
  assert.ok(entry.sources.length>0,`${entry.id} cites no source, so its body is a claim nothing can check`);
 }
});

/** Scenario 9: the same pair of digests gives the same report, across processes. */
test('the same pair of digests gives the same report byte for byte, including the order of the reasons',()=>{
 const previous=declaration({operations:[op('read',{inputs:[field('a','string',false)],errors:[error('boom')]}),op('write')]});
 const current=declaration({version:2,operations:[op('read',{inputs:[field('a','string')],outputs:[field('ok','boolean')]}),op('list')]});
 const real=realReport(current,'divergent',['the real implementation answers nothing for a'] as const);
 const first=decideCompatibility({previous,current,real});
 const second=decideCompatibility({previous:structuredClone(previous),current:structuredClone(current),real:{...real}});
 assert.equal(JSON.stringify(first),JSON.stringify(second),'two evaluations of one pair of digests differ byte for byte');
 assert.equal(first.verdict,'breaking');
 assert.deepEqual([...first.reasons],['breaking-change'],'the reasons are sorted, so their order carries no meaning');
 assert.ok(Object.isFrozen(first)&&Object.isFrozen(first.reasons)&&Object.isFrozen(first.breaking)&&Object.isFrozen(first.breaking!.violations));
 assert.ok(Object.isFrozen(first.breaking!.violations[0]));
 // Across processes, so no clock, locale, path or module state can be involved.
 const probe=`const m=await import(${JSON.stringify(MODULE)});const d=m.defineContracts;
  const prev=d([{id:'contract.probe',domainId:'domain.probe',ownerRef:'owner.probe',sources:['src/adapters/probe.ts'],formatVersion:1,version:1,
   operations:[{id:'read',inputs:[{name:'a',type:'string',required:false}],outputs:[{name:'ok',type:'boolean',required:true}],errors:[{code:'boom',description:'x'}],examples:[]}]}])[0];
  const cur={...structuredClone(prev),version:2,operations:[{id:'read',inputs:[{name:'a',type:'string',required:true}],outputs:[{name:'ok',type:'boolean',required:true}],errors:[],examples:[]},{id:'list',inputs:[],outputs:[],errors:[],examples:[]}]};
  const real={subject:'real',contractDigest:m.contractDigest(cur),verdict:'divergent',observations:['probe']};
  process.stdout.write(JSON.stringify(m.decideCompatibility({previous:prev,current:cur,real})));`;
 const runs=[0,1,2].map(()=>{
  const out=spawnSync(process.execPath,['--input-type=module','-e',probe],{encoding:'utf8',cwd:ROOT});
  assert.equal(out.status,0,`a probe run failed:\\n${out.stderr.split('\n').slice(0,4).join('\\n')}`);
  return out.stdout;
 });
 assert.equal(new Set(runs).size,1,'three processes produced three different reports for the same pair of digests');
 const parsed=JSON.parse(runs[0]!) as {verdict:string;reasons:string[];breaking:{violations:{rule:string}[]};additive:{violations:{rule:string}[]}|null};
 assert.equal(parsed.verdict,'breaking');
 assert.deepEqual(parsed.reasons,['breaking-change']);
 assert.deepEqual([...new Set(parsed.breaking.violations.map(v=>v.rule))].sort(ordinal),['error-removed','input-now-required']);
 // The added operation is reported, and it is in the additive field precisely
 // because it decided nothing.
 assert.deepEqual([...new Set(parsed.additive!.violations.map(v=>v.rule))].sort(ordinal),['operation-added']);
 assert.ok(!runs[0]!.includes(ROOT),'the report carries an absolute path from this machine');
});