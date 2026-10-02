/**
 * Versioned contract references and the compatibility rule, a declarative registry
 * resolved against the committed manifest, and a verdict that a mock cannot reach.
 *
 * Two things do not exist in this repository before this module, and both were
 * missing in a way that let a gap read as a pass. The manifest already carries 11
 * nodes of kind `contract` and none of them has a body: no fields, no types, no
 * constraints, no errors, no examples, no version. And nothing anywhere decided
 * which changes between two contract versions are breaking. So "compatible" had
 * no computable meaning, and the only way to produce one was to assert it.
 *
 * The contract body does not live in the manifest. `schema.ts` refuses unknown
 * keys, so putting a body in `graph.json` would mean reopening an already
 * verified slice to add a shape nobody asked for there. It lives in TypeScript,
 * as a declared registry, and is resolved against the committed manifest. That is
 * the architecture `invariants.ts` already delivered and proved: a declared
 * registry, a catalog extracted from the graph, a resolution that returns a
 * status and a reason, and a gap in both directions. The rule this file copies
 * most deliberately is that an empty registry is never complete, because an empty
 * registry with no gap is the shape of a vacuous pass.
 *
 * The normative rule of this file is one sentence:
 *
 * > A mock is never an input to the compatibility decision.
 *
 * A green mock report produces, at best, the proof that a generated mock matches
 * a contract, which is a different sentence. `STATE-GRAPH.md` already says it, a
 * conforming mock does not prove a conforming backend. So the verdict is a pure
 * function of the previous contract, the current contract, and a conformance
 * report of a real implementation. There is no field for a mock anywhere in the
 * input, and a mock report forced into that slot at runtime is refused rather
 * than believed, because the interesting failure here is not a missing input, it
 * is a plausible-looking input that answers a question nobody asked.
 *
 * FAIL is produced by exactly two verdicts, `breaking` and `divergent`. The case
 * AC-SG05 names is the second: a green mock plus a real report that concludes
 * divergent gives `divergent`, never `compatible`, and the report names the
 * divergence. `unknown` is not a soft fail and is never a quiet `compatible`; it
 * is the honest answer when the question cannot be decided, and it is a value of
 * its own that a caller must not fold into either side.
 *
 * Deliberately narrow: nothing here generates a mock or a fixture (SG05.2), runs
 * a check, or reads a result (SG03.2 and SG05.3). A contract declaration is
 * TypeScript, not parsed input, so an unknown key is already a compile error and
 * the runtime checks below guard values only. No file is read and no clock, no
 * locale and no machine identity is consulted, so the same pair of digests gives
 * the same report byte for byte on any machine.
 */
import {createHash} from 'node:crypto';
import type {StateGraph} from './schema.ts';

/** Mirror of the loader's comparator: code-unit order, never locale. */
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** Stable identifier, the same alphabet `schema.ts` admits for a node id. */
const IDENT=/^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/;
/** A field of an operation: shorter than an identifier, and it may not look like one either. */
const NAME=/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/;

/**
 * The closed, named type vocabulary this validator implements.
 *
 * STATE-GRAPH.md requires a bounded and documented schema and requires that an
 * unsupported expression refuses generation, but it never states the enumeration.
 * So the set below is the refusal default made explicit: anything outside it is
 * refused at declaration, named by field, and never approximated into a string,
 * because a type that silently degrades into text is how a contract stops being a
 * contract. The enumeration itself is still the open question, and the entries
 * here are drawn from the vocabulary this repository already uses (`GraphNode`
 * shapes in `schema.ts`, the JSON manifest, the export/import boundary). A future
 * decision that widens or renames the set is a change to this constant and to the
 * rules that read it, and it moves every contract digest that names the type.
 */
export const TYPE_EXPRESSIONS:ReadonlySet<string>=new Set(['string','integer','number','boolean','null','object','array','bytes']);
/**
 * The same vocabulary as a null-prototype lookup table, which is what membership is
 * tested against. `Object.hasOwn` over this table is a real own-property test, so
 * an inherited name cannot resolve; over a normal object literal it could, and that
 * is the defect this table exists to keep out.
 */
const SUPPORTED_TYPES:Readonly<Record<string,true>>=Object.freeze(Object.assign(Object.create(null) as Record<string,true>,Object.fromEntries([...TYPE_EXPRESSIONS].map(type=>[type,true] as const))));
/** The contract body format these rules implement. Distinct from the node `revision` in the manifest. */
export const CONTRACT_FORMAT_VERSION=1;
/** Contract format versions the six breaking rules below know how to compare. */
export const KNOWN_FORMAT_VERSIONS:readonly number[]=Object.freeze([1]);

const bad=(where:string):never=>{throw new Error(`Invalid contract registry: ${where}.`);};
const ident=(value:unknown,field:string,where:string):string=>{
 if(typeof value!=='string'||!IDENT.test(value))return bad(`${where}: ${field}`);
 return value;
};
const fieldName=(value:unknown,field:string,where:string):string=>{
 if(typeof value!=='string'||!NAME.test(value))return bad(`${where}: ${field}`);
 return value;
};
const paths=(value:unknown,field:string,where:string):readonly string[]=>{
 if(!Array.isArray(value)||value.length<1||value.length>32)return bad(`${where}: ${field}`);
 const seen=new Set<string>();
 for(const path of value){
  if(typeof path!=='string'||path.length<1||path.length>240||Buffer.from(path,'utf8').toString('utf8')!==path||
   path.startsWith('/')||path.split('/').some(part=>!part||part!==part.trim()||part==='.'||part==='..'))return bad(`${where}: ${field}`);
  if(seen.has(path))return bad(`${where}: duplicate ${field}`);
  seen.add(path);
 }
 return Object.freeze([...value]);
};
/** Own-property membership over a null-prototype table, never a bare lookup. See `typeExpression`. */
export const supportedType=(value:unknown):value is string=>typeof value==='string'&&Object.hasOwn(SUPPORTED_TYPES,value);
/**
 * The type of a field, validated against the closed set above.
 *
 * The second half of the check is the point of the function. A membership test
 * against a bare lookup resolves a name like `constructor` or `toString` to
 * `Object.prototype`, so an out-of-vocabulary type would be admitted as a
 * supported one. That is not theoretical here: `evaluation/state-graph-seed-mapping/evidence.md`
 * documents the same class of defect in this same subsystem, where an index built
 * by `Object.fromEntries` returned `Object` for a file named `constructor` and the
 * impact it fed came out empty and complete. `Object.hasOwn` is the membership
 * test, always, and a declaration carrying `constructor` as a type is refused as a
 * malformed field rather than silently treated as an object.
 */
export const typeExpression=(value:unknown,field:string,where:string):string=>{
 if(typeof value!=='string'||value.length<1||value.length>120||!supportedType(value))return bad(`${where}: ${field}`);
 return value;
};
/** Inputs and outputs differ only in which direction they are read, and both carry their requiredness. */
export interface ContractField{readonly name:string;readonly type:string;readonly required:boolean}
export interface ContractError{readonly code:string;readonly description:string}
export interface ContractOperation{
 readonly id:string;
 readonly inputs:readonly ContractField[];
 readonly outputs:readonly ContractField[];
 readonly errors:readonly ContractError[];
 /** Worked examples, in declaration order. Their order is not read by any rule in this file. */
 readonly examples:readonly string[];
}
/**
 * One contract as it is declared: what the manifest node already carries, plus
 * the body the manifest cannot hold.
 *
 * `version` is the contract's own version, and it is the pair of versions the
 * breaking rules compare. It is not the manifest node `revision`, which is a
 * different field in a different namespace; no source states how the two relate,
 * so nothing here reads `revision` and nothing writes it.
 */
export interface ContractDeclaration{
 /** Stable identity, shared with the manifest node of kind `contract`. */
 readonly id:string;
 readonly domainId:string;
 /** Who owns the contract: an identifier, never a capability or a right. */
 readonly ownerRef:string;
 /** Repository-relative files that state the contract. */
 readonly sources:readonly string[];
 readonly formatVersion:number;
 readonly version:number;
 readonly operations:readonly ContractOperation[];
}
export type ContractRegistry=readonly ContractDeclaration[];

const fieldList=(value:unknown,field:string,where:string):readonly ContractField[]=>{
 if(!Array.isArray(value)||value.length>32)return bad(`${where}: ${field}`);
 const seen=new Set<string>();
 const out=value.map((raw,index):ContractField=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return bad(`${where}: ${field} ${index}`);
  const record=raw as {name?:unknown;type?:unknown;required?:unknown};
  const name=fieldName(record.name,`${field}.name`,where);
  if(seen.has(name))return bad(`${where}: duplicate ${field} ${name}`);
  seen.add(name);
  return Object.freeze({name,type:typeExpression(record.type,`${field}.type`,where),required:record.required===true});
 });
 return Object.freeze(out);
};
const errorList=(value:unknown,where:string):readonly ContractError[]=>{
 if(!Array.isArray(value)||value.length>32)return bad(`${where}: errors`);
 const seen=new Set<string>();
 const out=value.map((raw,index):ContractError=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return bad(`${where}: errors ${index}`);
  const record=raw as {code?:unknown;description?:unknown};
  const code=fieldName(record.code,'errors.code',where);
  if(typeof record.description!=='string'||record.description.trim().length<1||record.description.length>500)return bad(`${where}: errors ${index}: description`);
  if(seen.has(code))return bad(`${where}: duplicate errors ${code}`);
  seen.add(code);
  return Object.freeze({code,description:record.description});
 });
 return Object.freeze(out);
};
const exampleList=(value:unknown,where:string):readonly string[]=>{
 if(!Array.isArray(value)||value.length>16)return bad(`${where}: examples`);
 return Object.freeze(value.map((raw,index)=>{
  if(typeof raw!=='string'||raw.trim().length<1||raw.length>500)return bad(`${where}: examples ${index}`);
  return raw;
 }));
};
/**
 * Validate and freeze declarations.
 *
 * Every rejection names its field, so a declaration refused for an unrelated
 * reason cannot pass later as a caught defect. An operation list that is empty is
 * a legal declaration: it is a contract that states nothing yet, and the point of
 * this registry is to make that visible rather than to forbid it.
 */
export function defineContracts(declarations:readonly ContractDeclaration[]):ContractRegistry{
 if(!Array.isArray(declarations))return bad('entries');
 const seen=new Set<string>();
 const entries=declarations.map((entry,index):ContractDeclaration=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return bad(`entry ${index}`);
  const at=`entry ${index}`;
  const id=ident(entry.id,'id',at);
  if(seen.has(id))return bad(`${at}: duplicate id ${id}`);
  seen.add(id);
  const domainId=ident(entry.domainId,'domainId',at),ownerRef=ident(entry.ownerRef,'ownerRef',at);
  if(!Number.isSafeInteger(entry.formatVersion)||(entry.formatVersion as number)<1)return bad(`${at}: formatVersion`);
  if(!Number.isSafeInteger(entry.version)||(entry.version as number)<1)return bad(`${at}: version`);
  if(!Array.isArray(entry.operations)||entry.operations.length>64)return bad(`${at}: operations`);
  const operationIds=new Set<string>();
  // Copied to an unknown list because `Array.isArray` narrows a typed readonly
  // array to `any[]`, and an `any` here would take the value checks with it.
  const rawOperations:readonly unknown[]=entry.operations;
  const operations=rawOperations.map((raw:unknown,position:number):ContractOperation=>{
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return bad(`${at}: operations ${position}`);
   // The declared shape is TypeScript, so an unknown key is already a compile
   // error; this read is for the values a caller can still get wrong.
   const operation=raw as {id?:unknown;inputs?:unknown;outputs?:unknown;errors?:unknown;examples?:unknown};
   const operationId=ident(operation.id,'operations.id',`${at} operation ${position}`);
   if(operationIds.has(operationId))return bad(`${at}: duplicate operations ${operationId}`);
   operationIds.add(operationId);
   return Object.freeze({id:operationId,inputs:fieldList(operation.inputs,'inputs',`${at} ${operationId}`),
    outputs:fieldList(operation.outputs,'outputs',`${at} ${operationId}`),errors:errorList(operation.errors,`${at} ${operationId}`),examples:exampleList(operation.examples,`${at} ${operationId}`)});
  });
  return Object.freeze({id,domainId,ownerRef,sources:paths(entry.sources,'sources',at),formatVersion:Number(entry.formatVersion),version:Number(entry.version),operations:Object.freeze(operations)});
 });
 return Object.freeze(entries);
}

/** Every `contract` node, by id and owner: what a declaration is resolved against. */
export function ownerContractCatalog(graph:StateGraph):ReadonlyMap<string,string>{
 const catalog=new Map<string,string>();
 for(const node of graph.nodes)if(node.kind==='contract')catalog.set(node.id,node.ownerRef);
 return catalog;
}
export type ContractResolution='contract-present'|'contract-not-declared'|'contract-unknown'|'contract-not-owner';
export interface EvaluatedContract{
 readonly id:string;
 readonly domainId:string;
 readonly ownerRef:string;
 readonly sources:readonly string[];
 readonly formatVersion:number;
 readonly version:number;
 readonly operations:readonly ContractOperation[];
 /** True only when a contract node of that id exists and carries the same owner. */
 readonly nodeExists:boolean;
 readonly status:'declared'|'undeclared';
 readonly reason:ContractResolution;
}
export interface ContractResolutionReport{
 readonly entries:readonly EvaluatedContract[];
 /** Every gap, never sampled and never folded into a count. */
 readonly unresolved:readonly EvaluatedContract[];
 /** True only when the registry is non-empty and has no gap. An empty registry is not complete. */
 readonly complete:boolean;
}
/**
 * Resolve every declaration against the committed manifest.
 *
 * Four patterns, the four `invariants.ts` proved, with the same meaning each: the
 * node exists and the same owner carries it; the registry carries an entry that
 * no node declares at all; the id resolves to a node that is not a contract; and
 * the node exists but belongs to someone else. An entry is never dropped and never
 * counted as resolved because nothing contradicted it.
 *
 * `declaredIds` is the id set of the graph, which the catalog alone cannot carry:
 * a catalog admits only `contract` nodes, so without it an entry naming a node of
 * another kind and an entry naming nothing would be indistinguishable.
 */
export function evaluateContracts(registry:ContractRegistry,catalog:ReadonlyMap<string,string>,declaredIds?:ReadonlySet<string>):ContractResolutionReport{
 const known=declaredIds;
 const entries=registry.map((entry):EvaluatedContract=>{
  const owner=catalog.get(entry.id);
  const nodeExists=known===undefined?owner!==undefined:known.has(entry.id);
  const failure:ContractResolution|null=owner===undefined?(nodeExists?'contract-unknown':'contract-not-declared')
   :owner===entry.ownerRef?null:'contract-not-owner';
  return Object.freeze({id:entry.id,domainId:entry.domainId,ownerRef:entry.ownerRef,sources:entry.sources,formatVersion:entry.formatVersion,
   version:entry.version,operations:entry.operations,nodeExists,status:failure===null?'declared':'undeclared',reason:failure??'contract-present'});
 });
 const unresolved=entries.filter(entry=>entry.status==='undeclared');
 return Object.freeze({entries:Object.freeze(entries),unresolved:Object.freeze(unresolved),complete:entries.length>0&&unresolved.length===0});
}
/** Contracts the graph states but the registry does not carry: the same gap in the other direction. */
export function unregisteredContracts(registry:ContractRegistry,graph:StateGraph):readonly string[]{
 const declared=new Set(registry.map(entry=>entry.id));
 return Object.freeze(graph.nodes.filter(node=>node.kind==='contract'&&!declared.has(node.id)).map(node=>node.id));
}

/** A contract reduced to plain data with a fixed key order: the shape a digest is taken over. */
export interface CanonicalContract{
 readonly id:string;
 readonly domainId:string;
 readonly ownerRef:string;
 readonly formatVersion:number;
 readonly version:number;
 readonly sources:readonly string[];
 readonly operations:readonly {readonly id:string;readonly inputs:readonly ContractField[];readonly outputs:readonly ContractField[];readonly errors:readonly ContractError[];readonly examples:readonly string[]}[];
}
export interface CanonicalForm{readonly canonical:CanonicalContract;readonly unsupported:readonly string[]}
const orderFields=(values:readonly ContractField[])=>[...values].sort((a,b)=>compare(a.name,b.name));
const orderErrors=(values:readonly ContractError[])=>[...values].sort((a,b)=>compare(a.code,b.code));
type CanonicalOperations=CanonicalContract['operations'];
const orderOperations=(values:CanonicalOperations)=>[...values].sort((a,b)=>compare(a.id,b.id));
/**
 * The canonical form of a contract, and the type expressions this module cannot
 * reason about.
 *
 * Keys are written in a fixed order by construction, every list is ordinal-sorted,
 * and nothing reads a clock, a locale or a machine name. Two declarations that
 * mean the same thing therefore produce the same bytes whatever order they were
 * written in, which is the same discipline `graphRevision` applies to the
 * manifest. `unsupported` is not decoration: a contract that skipped
 * `defineContracts` can carry a type outside the vocabulary, and the compatibility
 * rules must refuse to decide rather than compare two strings it never parsed.
 */
export function contractCanonicalForm(contract:ContractDeclaration):CanonicalForm{
 const unsupported:string[]=[];
 const check=(type:unknown,where:string):string=>{
  if(typeof type!=='string'||!supportedType(type)){
   unsupported.push(`${where}: ${String(type)}`);
   return '';
  }
  return type;
 };
 const canonical:CanonicalContract=Object.freeze({
  id:contract.id,domainId:contract.domainId,ownerRef:contract.ownerRef,formatVersion:Number(contract.formatVersion),version:Number(contract.version),
  sources:Object.freeze([...contract.sources].sort(compare)),
  operations:Object.freeze(orderOperations(contract.operations.map((operation):CanonicalContract['operations'][number]=>Object.freeze({
   id:operation.id,
   inputs:Object.freeze(orderFields(operation.inputs).map(field=>Object.freeze({name:field.name,type:check(field.type,`${contract.id}.${operation.id}.inputs.${field.name}`),required:field.required===true}))),
   outputs:Object.freeze(orderFields(operation.outputs).map(field=>Object.freeze({name:field.name,type:check(field.type,`${contract.id}.${operation.id}.outputs.${field.name}`),required:field.required===true}))),
   errors:Object.freeze(orderErrors(operation.errors).map(error=>Object.freeze({code:error.code,description:error.description}))),
   examples:Object.freeze([...operation.examples]),
  })))),
 });
 return Object.freeze({canonical,unsupported:Object.freeze([...new Set(unsupported)].sort(compare))});
}
/** The canonical bytes, then the SHA256 of them. Metadata, never evidence and never a permission. */
export function contractCanonicalText(contract:ContractDeclaration):string{
 return JSON.stringify(contractCanonicalForm(contract).canonical);
}
export function contractDigest(contract:ContractDeclaration):string{
 return createHash('sha256').update(contractCanonicalText(contract)).digest('hex');
}

/** A declared change between two contract versions, named so a report can point at it. */
export type BreakingRule='operation-removed'|'operation-added'|'input-now-required'|'required-output-removed'|'type-changed'|'error-removed';
/** The six named rules, in the order the report sorts them. */
export const BREAKING_RULES:readonly BreakingRule[]=Object.freeze(['operation-removed','operation-added','input-now-required','required-output-removed','type-changed','error-removed']);
/**
 * The rules that only report a fact and never break anything.
 *
 * The six named rules include one additive half, and it is named here rather than
 * folded away. An operation or an output that did not exist before is a real
 * change a report should show, and it is not a break: a consumer that never called
 * it cannot be broken by it. So the comparison reports it, and this list is what
 * keeps it from deciding a verdict. Removing a name from here is what would make
 * an addition break, and that is one of the mutations the evidence records.
 */
export const ADDITIVE_RULES:readonly BreakingRule[]=Object.freeze(['operation-added']);
export interface BreakingViolation{readonly rule:BreakingRule;readonly operation:string;readonly field:string|null;readonly detail:string}
/** The violations that actually break: everything reported, minus the additive rules. */
export const breakingViolations=(violations:readonly BreakingViolation[]):readonly BreakingViolation[]=>
 Object.freeze(violations.filter(violation=>!ADDITIVE_RULES.includes(violation.rule)));
type CanonicalOperation=CanonicalContract['operations'][number];
const byId=(operations:readonly CanonicalOperation[]):ReadonlyMap<string,CanonicalOperation>=>new Map(operations.map(operation=>[operation.id,operation]));
const typeChanges=(direction:'inputs'|'outputs',previous:CanonicalOperation,current:CanonicalOperation):BreakingViolation[]=>{
 const before=direction==='inputs'?previous.inputs:previous.outputs;
 const after=new Map((direction==='inputs'?current.inputs:current.outputs).map(field=>[field.name,field]));
 return before.filter(field=>after.has(field.name)).flatMap(field=>{
  const now=after.get(field.name)!;
  return now.type===field.type?[]:[Object.freeze({rule:'type-changed',operation:current.id,field:`${direction}.${field.name}`,detail:`${field.name}: ${field.type} -> ${now.type}`})];
 });
};
/**
 * The six breaking rules, one function each.
 *
 * They compare two canonical forms, so they need no execution, no mock and no
 * fixture. Rules 2 and 4 have one observable half each, and that is a property of
 * the contract body rather than a shortcut here: the body declares operations and
 * no rename marker, so a rename is observable as a removal plus an addition and
 * only the removal half can be told apart. The addition half is therefore a
 * named constraint with its own test, an operation that did not exist before and
 * an output that did not exist before never break anything. Whether an added value
 * in a closed enumeration breaks a producer or a consumer is not decided by any
 * source, so no rule here pretends to answer it.
 */
type Rule=(previous:CanonicalOperation|undefined,current:CanonicalOperation|undefined)=>readonly BreakingViolation[];
const removed=(operation:CanonicalOperation):BreakingViolation=>Object.freeze({rule:'operation-removed',operation:operation.id,field:null,detail:`${operation.id} was removed`});
const added=(operation:CanonicalOperation):BreakingViolation=>Object.freeze({rule:'operation-added',operation:operation.id,field:null,detail:`${operation.id} was added`});
const RULES:readonly Rule[]=Object.freeze([
 // 1. An operation that was there and is not there anymore.
 (previous,current)=>previous!==undefined&&current===undefined?[removed(previous)]:[],
 // 2. An operation that did not exist before, and so never breaks a consumer.
 (previous,current)=>previous===undefined&&current!==undefined?[added(current)]:[],
 // 3. An input that was optional and became required.
 (previous,current)=>{
  if(previous===undefined||current===undefined)return [];
  const byName=new Map(current.inputs.map(input=>[input.name,input]));
  return previous.inputs.filter(input=>input.required!==true).filter(input=>byName.get(input.name)?.required===true)
   .map(input=>Object.freeze({rule:'input-now-required' as const,operation:current.id,field:input.name,detail:`${input.name} became required`}));
 },
 // 4. A required output that was removed. An output that was added never breaks.
 (previous,current)=>{
  if(previous===undefined||current===undefined)return [];
  const byName=new Map(current.outputs.map(output=>[output.name,output]));
  return previous.outputs.filter(output=>output.required===true).filter(output=>!byName.has(output.name))
   .map(output=>Object.freeze({rule:'required-output-removed' as const,operation:current.id,field:output.name,detail:`required output ${output.name} was removed`}));
 },
 // 5. A type that changed on a field that exists on both sides. A field that
 // appears or disappears is rule 3, rule 4 or rule 1, not a type change.
 (previous,current)=>previous===undefined||current===undefined?[]:[...typeChanges('inputs',previous,current),...typeChanges('outputs',previous,current)],
 // 6. A declared error code that was withdrawn: a consumer that branches on it
 // has to be told the case is gone.
 (previous,current)=>{
  if(previous===undefined||current===undefined)return [];
  const codes=new Set(current.errors.map(error=>error.code));
  return previous.errors.filter(error=>!codes.has(error.code)).map(error=>Object.freeze({rule:'error-removed' as const,operation:current.id,field:error.code,detail:`error ${error.code} was removed`}));
 },
]);
/** The six rules, addressed by name. There is no rule that is not in `BREAKING_RULES`. */
function ruleOf(rule:BreakingRule):Rule{
 const index=BREAKING_RULES.indexOf(rule);
 if(index<0)throw Error(`Unknown breaking rule: ${String(rule)}.`);
 return RULES[index]!;
}
export interface BreakingComparison{readonly violations:readonly BreakingViolation[];readonly unsupported:readonly string[]}
/**
 * Compare two canonical forms with the six rules and return every violation.
 *
 * Every operation of either side is handed to every rule, and each rule decides
 * for itself which direction it is about, so a removal and an addition are two
 * facts about one id rather than two branches somewhere up here. The result is
 * sorted by rule, then operation, then field, so two evaluations of the same pair
 * give the same array in the same order. It includes the additive rules, because a
 * report should show them; `breakingViolations` is what decides a verdict. A
 * violation list is never truncated: an unreported change is a change that reads
 * as compatible.
 */
export function compareContractBreaking(previous:CanonicalContract,current:CanonicalContract,unsupported:readonly string[]=[]):BreakingComparison{
 const before=byId(previous.operations),after=byId(current.operations);
 const ids=[...new Set([...before.keys(),...after.keys()])].sort(compare),violations:BreakingViolation[]=[];
 for(const rule of BREAKING_RULES){
  const run=ruleOf(rule);
  for(const id of ids)violations.push(...run(before.get(id),after.get(id)));
 }
 violations.sort((a,b)=>compare(a.rule,b.rule)||compare(a.operation,b.operation)||compare(a.field??'',b.field??'')||compare(a.detail,b.detail));
 return Object.freeze({violations:Object.freeze(violations),unsupported:Object.freeze([...unsupported].sort(compare))});
}

/** What a conformance report concluded, whoever produced it. */
export type ConformanceVerdict='conforming'|'divergent';
/**
 * A conformance report, and the distinction the whole file turns on.
 *
 * `subject` says what was observed. A report of a real implementation is the only
 * thing that may inform a compatibility verdict; a report of a mock is evidence
 * about a generated fixture, which is a different claim about a different subject.
 * The two are separate types on purpose, so the mistake cannot be made by passing
 * the wrong object: it can only be made by a cast, and the runtime check below
 * refuses the cast instead of believing it.
 */
export interface ConformanceReport{readonly subject:'real'|'mock';readonly contractDigest:string;readonly verdict:ConformanceVerdict;readonly observations:readonly string[]}
export type RealConformanceReport=ConformanceReport&{readonly subject:'real'};
export type MockConformanceReport=ConformanceReport&{readonly subject:'mock'};

export type CompatibilityVerdict='compatible'|'breaking'|'divergent'|'unknown';
/** FAIL is these two verdicts and nothing else. `unknown` is not one of them. */
export const FAIL_VERDICTS:readonly CompatibilityVerdict[]=Object.freeze(['breaking','divergent']);
export const isFailVerdict=(verdict:CompatibilityVerdict):boolean=>FAIL_VERDICTS.includes(verdict);
/** Why a verdict is what it is. Every one of these is a fact, never a mood. */
export type CompatibilityReason=
 |'no-current-contract'
 |'no-previous-version'
 |'unknown-contract-version'
 |'unsupported-type-expression'
 |'breaking-change'
 |'real-divergent'
 |'no-real-report'
 |'report-digest-mismatch'
 |'real-conforming';
export interface ChangeSet{readonly violations:readonly BreakingViolation[];readonly rules:readonly BreakingRule[]}
export interface CompatibilityReport{
 readonly contractId:string;
 readonly currentVersion:number|null;
 readonly previousVersion:number|null;
 readonly previousDigest:string|null;
 readonly currentDigest:string|null;
 readonly verdict:CompatibilityVerdict;
 /** The violations that decided `breaking`. Null when none did. */
 readonly breaking:ChangeSet|null;
 /**
  * Changes that were reported but decided nothing, so nothing the comparison saw
  * is dropped from the report. An addition belongs here, and its presence is not
  * a pass and not a fail.
  */
 readonly additive:ChangeSet|null;
 /** Sorted, deduplicated, and the only place a verdict is explained. */
 readonly reasons:readonly CompatibilityReason[];
 /** The report that was read, as declared. A mock report can never appear here. */
 readonly realReport:RealConformanceReport|null;
}
const freezeViolations=(violations:readonly BreakingViolation[])=>Object.freeze([...violations].map(violation=>Object.freeze(violation)));
const freezeReasons=(reasons:readonly CompatibilityReason[])=>Object.freeze([...new Set(reasons)].sort(compare));
const changeSet=(violations:readonly BreakingViolation[]):ChangeSet|null=>violations.length===0?null:Object.freeze({
 violations:freezeViolations(violations),
 rules:Object.freeze([...new Set(violations.map(violation=>violation.rule))].sort(compare))});
/** One place builds the report, so the frozen shape is the same whatever path reached it. */
const assemble=(fields:{readonly contractId:string;readonly currentVersion:number|null;readonly previousVersion:number|null;
 readonly previousDigest:string|null;readonly currentDigest:string|null;readonly verdict:CompatibilityVerdict;
 readonly breaking:readonly BreakingViolation[];readonly additive:readonly BreakingViolation[];
 readonly reasons:readonly CompatibilityReason[];readonly realReport:RealConformanceReport|null}):CompatibilityReport=>
 Object.freeze({contractId:fields.contractId,currentVersion:fields.currentVersion,previousVersion:fields.previousVersion,
  previousDigest:fields.previousDigest,currentDigest:fields.currentDigest,verdict:fields.verdict,
  breaking:changeSet(fields.breaking),additive:changeSet(fields.additive),reasons:freezeReasons(fields.reasons),realReport:fields.realReport});
export interface CompatibilityInput{
 readonly previous:ContractDeclaration|null;
 readonly current:ContractDeclaration|null;
 readonly real:RealConformanceReport|null;
}
/**
 * Decide compatibility from three inputs, and from nothing else.
 *
 * There is no mock parameter and no place to put one. That is the rule, and it is
 * enforced three times over: by the input type, by the runtime subject check, and
 * by the fact that no path to `compatible` is reachable without a real report
 * whose digest matches the current contract.
 *
 * The order is fixed, so a verdict cannot depend on which check happened to run
 * first. Honesty first: no previous version, a format version the rules do not
 * know, or a type expression outside the vocabulary are all `unknown`, because
 * none of them can be decided. Then the structural rules, so a break is reported
 * even when a real report happens to agree. Then the report itself, bound to the
 * contract it was produced against, so a report about a different contract cannot
 * be read as agreement. `compatible` is reachable only at the end of that chain,
 * with nothing outstanding.
 *
 * A green mock, a passing check and an unchanged digest are not among the inputs,
 * and none of the three produces `compatible`.
 */
export function decideCompatibility(input:CompatibilityInput):CompatibilityReport{
 if(!input||typeof input!=='object')bad('input');
 const report=input.real;
 // A mock forced into the real slot answers a question nobody asked, and refusing
 // it is the whole point: the failure being designed against is not a missing
 // report, it is a plausible one that was never about the real implementation.
 if(report!==null&&(typeof report!=='object'||(report as {subject?:unknown}).subject!=='real'))
  throw Error('Invalid compatibility input: a mock conformance report is never an input to a compatibility verdict.');
 if(report!==null&&(typeof report.contractDigest!=='string'||!/^[a-f0-9]{64}$/.test(report.contractDigest)||(report.verdict!=='conforming'&&report.verdict!=='divergent')||!Array.isArray(report.observations)))
  bad('real: conformance report');
 const current=input.current,previous=input.previous;
 if(current===null)return assemble({contractId:'',currentVersion:null,previousVersion:null,previousDigest:null,currentDigest:null,
  verdict:'unknown',breaking:[],additive:[],reasons:['no-current-contract'],realReport:report??null});
 const currentForm=contractCanonicalForm(current);
 const previousForm=previous===null?null:contractCanonicalForm(previous);
 const previousDigest=previous===null?null:contractDigest(previous);
 const currentDigest=contractDigest(current);
 const reasons:CompatibilityReason[]=[];
 if(previous===null||previousForm===null||previousDigest===null)reasons.push('no-previous-version');
 if(!KNOWN_FORMAT_VERSIONS.includes(current.formatVersion)||(previous!==null&&!KNOWN_FORMAT_VERSIONS.includes(previous.formatVersion)))reasons.push('unknown-contract-version');
 if(currentForm.unsupported.length>0||(previousForm?.unsupported.length??0)>0)reasons.push('unsupported-type-expression');
 const comparison=previousForm===null?null:compareContractBreaking(previousForm.canonical,currentForm.canonical);
 const reported=comparison?.violations??[],violations=breakingViolations(reported);
 if(violations.length>0)reasons.push('breaking-change');
 // The report is bound to the contract it was produced against. A report about a
 // different contract says nothing about this one, and reading it as agreement
 // would be the same forgery as reading a mock as a real implementation.
 const bound=report!==null&&report.contractDigest===currentDigest;
 if(report!==null&&!bound)reasons.push('report-digest-mismatch');
 // Only when nothing else is outstanding does the report decide anything, so
 // `compatible` can never be the reason a hole went unreported.
 if(reasons.length===0)reasons.push(report===null?'no-real-report':report.verdict==='divergent'?'real-divergent':'real-conforming');
 const verdict:CompatibilityVerdict=reasons.includes('breaking-change')?'breaking'
  :reasons.includes('real-divergent')?'divergent'
  :reasons.includes('real-conforming')?'compatible'
  :'unknown';
 return assemble({contractId:current.id,currentVersion:current.version,previousVersion:previous?.version??null,previousDigest,currentDigest,verdict,breaking:violations,additive:reported.filter(violation=>ADDITIVE_RULES.includes(violation.rule)),reasons,realReport:report??null});
}

/**
 * What a green mock proves, stated as its own type so it cannot be read as a
 * verdict.
 *
 * There is no `verdict` field here on purpose, and no compatibility field either.
 * The question this answers is "does the generated fixture match the contract",
 * and the answer to REQ-SG05 is "that does not tell you whether the real
 * implementation matches". Returning anything a caller could compare with
 * `compatible` would recreate the confusion this module exists to remove.
 */
export interface MockAssessment{readonly subject:'mock';readonly contractDigest:string;readonly conformsToContract:boolean;readonly observations:readonly string[]}
/** Compare a generated mock with the contract it was generated from. Never a compatibility verdict. */
export function assessMock(mock:MockConformanceReport,contract:ContractDeclaration):MockAssessment{
 if(!mock||typeof mock!=='object'||mock.subject!=='mock'||(mock.verdict!=='conforming'&&mock.verdict!=='divergent'))bad('mock conformance report');
 const digest=contractDigest(contract);
 return Object.freeze({subject:'mock',contractDigest:digest,conformsToContract:mock.contractDigest===digest,observations:Object.freeze([...mock.observations])});
}

/** The owner all declarations in this repository name; a label, not a permission. */
const OWNER='owner.cuesheet';
const c=(id:string,domainId:string,sources:readonly string[],operations:readonly ContractOperation[]):ContractDeclaration=>
 Object.freeze({id,domainId,ownerRef:OWNER,sources:Object.freeze([...sources]),formatVersion:CONTRACT_FORMAT_VERSION,version:1,operations:Object.freeze(operations)});
const f=(name:string,type:string,required=true):ContractField=>Object.freeze({name,type,required});
const o=(id:string,inputs:readonly ContractField[],outputs:readonly ContractField[],errors:readonly ContractError[]=[],examples:readonly string[]=[]):ContractOperation=>
 Object.freeze({id,inputs:Object.freeze([...inputs]),outputs:Object.freeze([...outputs]),errors:Object.freeze([...errors]),examples:Object.freeze([...examples])});
/**
 * The contracts this repository declares, one entry per manifest node of kind
 * `contract`, with the same ids, domains, owner and sources the committed graph
 * carries.
 *
 * The operations below are the surface each cited module already exposes, not a
 * wish. Where a module exports something this list does not name, the list is
 * behind the module and that gap is visible in review. A contract body that
 * claimed more than its sources would be a claim nothing could fail, which is the
 * failure this registry exists to prevent, so nothing is declared that no cited
 * file supports.
 */
export const CONTRACTS:ContractRegistry=defineContracts([ c('contract.integration.binding','domain.integration',['src/adapters/project-binding.ts'],[
  o('projectIdentities',[f('options','object',false)],[f('identities','array')],[],['the portfolio is read from the registry alone, with no subprocess']),
  o('tokensOf',[f('text','string')],[f('tokens','array')]),
  o('bindProject',[f('text','string'),f('identities','array',false)],[f('kind','string'),f('candidate','object',false)],
   [],['an ambiguous intention stays unbound rather than bound to the wrong repository']),
  o('mayApprove',[f('binding','object')],[f('approvable','boolean')]),
  o('describeBinding',[f('binding','object')],[f('text','string')]),
 ]),
 c('contract.integration.context','domain.integration',['src/adapters/shared-context.ts'],[
  o('withSharedContext',[f('run','string')],[f('result','string')]),
 ]),
 c('contract.integration.entry','domain.integration',['src/cuesheet.ts','src/index.ts'],[
  o('deriveState',[f('events','array')],[f('state','object')]),
  o('stateReport',[f('state','object')],[f('report','object')]),
  o('affordancesOf',[f('state','object')],[f('affordances','array')]),
  o('capture',[f('path','string')],[f('artifact','object')],[{code:'coverage-limits',description:'COVERAGE_LIMITS bounds what a capture may claim to cover.'}]),
  o('verifyCapture',[f('artifact','object')],[f('verified','boolean')]),
  o('readCapture',[f('path','string')],[f('artifact','object')]),
  o('runAgainstArtifact',[f('artifact','object')],[f('result','object')]),
 ]),
 c('contract.integration.plan','domain.integration',['src/adapters/worktree-integration.ts'],[
  o('checkableIntegrationPath',[f('path','string')],[f('checkable','boolean')],[{code:'uncovered-integration-path',description:'A path the plan has not checked against the source tree is refused rather than integrated.'}]),
  o('planWorktreeIntegration',[f('source','object'),f('workspace','string')],[f('plan','object')],
   [{code:'source-worktree-base-mismatch',description:'Source and worktree no longer match their admitted base, so planning refuses.'},{code:'files-changed-during-planning',description:'Files changed while the plan was being built, so planning refuses.'}]),
  o('composeWorktreePlans',[f('plans','array')],[f('composition','object')],
   [{code:'unattested-composition',description:'A composition of plans that are not attested, or that exceeds two, is refused.'},{code:'conflicting-contributions',description:'Two plans contribute the same file or one contains the other, so the composition is refused.'}]),
  o('applyWorktreeIntegration',[f('plan','object')],[f('applied','object')]),
 ]),
 c('contract.objectives.intent','domain.objectives',['src/core/intent.ts'],[
  o('routeIntention',[f('raw','string')],[f('kind','string'),f('text','string'),f('forced','boolean')],
   [],['approval is decided before the greeting check, so a forced line still routes']),
 ]),
 c('contract.objectives.plan','domain.objectives',['src/adapters/work-plans.ts'],[
  o('projectWorkPlans',[f('events','array')],[f('plans','array')],[{code:'invalid-work-plan',description:'A work plan record that cannot be read refuses at its sequence rather than projecting a partial plan.'}]),
  o('prepareWorkTasks',[f('events','array')],[f('tasks','array')],
   [{code:'invalid-work-task',description:'A task without text, expected result or dependencies refuses admission.'},{code:'unknown-explicit-task-id',description:'An explicit task id that refers to no existing task is refused.'}]),
 ]),
 c('contract.objectives.record','domain.objectives',['src/adapters/objectives.ts'],[
  o('projectObjectives',[f('events','array')],[f('objectives','array')],[{code:'invalid-objective-record',description:'An objective record that cannot be read, including a cyclic dependency, refuses at its sequence.'}]),
  o('changeObjectiveStatus',[f('events','array'),f('event','object')],[f('event','object')]),
  o('createObjective',[f('events','array'),f('event','object')],[f('event','object')]),
  o('verifyObjective',[f('events','array')],[f('verdict','string')],[],['proof is bound to the authoritative contract revision']),
  o('correctObjective',[f('events','array'),f('event','object')],[f('event','object')]),
  o('bindObjectiveCheck',[f('events','array'),f('binding','object')],[f('event','object')]),
 ]),
 c('contract.sessions.store','domain.sessions',['src/adapters/session-store.ts'],[
  o('attest',[f('sessionId','string')],[f('attested','object')],[{code:'journal_damaged',description:'The session file stopped being a log, so nothing about it is attested.'},{code:'write_refused',description:'The write was refused, so nothing is appended.'},{code:'lock_unreleased',description:'The session lock was not released, so the session refuses.'}]),
  o('append',[f('sessionId','string'),f('event','object')],[f('event','object')],[{code:'journal_damaged',description:'Appending to a damaged journal refuses rather than appending after the defect.'}]),
  o('nextSeq',[f('sessionId','string')],[f('seq','integer')]),
  o('replayAll',[f('sessionId','string'),f('events','array')],[f('replayed','boolean')],[{code:'journal_damaged',description:'Replay refuses at the first sequence gap and applies no later record.'}]),
  o('revision',[f('sessionId','string')],[f('revision','integer')]),
  o('appendIfCurrent',[f('sessionId','string'),f('expectedRevision','integer'),f('event','object')],[f('event','object',false)],[],['a stale base refuses instead of rebasing silently']),
  o('lockState',[f('sessionId','string'),f('atRevision','integer')],[f('lock','object',false)]),
  o('appendFact',[f('sessionId','string'),f('event','object')],[f('event','object')]),
  o('read',[f('sessionId','string')],[f('events','array')]),
  o('list',[],[f('sessions','array')]),
  o('restore',[f('sessionId','string'),f('now','string')],[f('events','array')]),
  o('create',[f('sessionId','string'),f('seed','array')],[f('created','boolean')]),
 ]),
 c('contract.sessions.terminal','domain.sessions',['src/adapters/terminal-session.ts'],[
  o('terminalSessionRoot',[],[f('root','string')]),
  o('appendCore',[f('expected','integer'),f('event','object')],[f('event','object')]),
  o('appendView',[f('control','object')],[f('appended','boolean')]),
  o('recordModel',[f('selection','object')],[f('recorded','boolean')]),
  o('assertWritable',[],[f('writable','boolean')]),
  o('onFailure',[f('listener','string')],[f('unsubscribe','string')]),
  o('close',[],[f('closed','boolean')]),
  o('listTerminalSessions',[f('root','string')],[f('sessions','array')]),
 ]),
 c('contract.workers.packet','domain.workers',['src/adapters/code-worker-packets.ts'],[
  o('parseCodeWorkerPackets',[f('value','object')],[f('packets','array')]),
 ]),
 c('contract.workers.requirements','domain.workers',['src/core/delegation.ts'],[
  o('parseRequirements',[f('value','string')],[f('requirements','array')],[{code:'requirements-format',description:'RequirementsFormatError: the declared requirements are not the bounded shape this module admits.'}]),
  o('preflightDelegation',[f('requirements','array'),f('target','object')],[f('preflight','object')]),
 ]),
]);
