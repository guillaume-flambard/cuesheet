export type NodeKind='domain'|'entity'|'contract'|'source'|'invariant'|'test'|'ci';
export type EdgeType='depends_on'|'implements'|'validates'|'contains'|'describes';
export interface SourceRef {readonly path:string;readonly digest:string}
export interface GraphNode {readonly id:string;readonly kind:NodeKind;readonly domainId:string;readonly revision:number;readonly sourceRefs:readonly SourceRef[];readonly ownerRef:string;readonly contractRefs:readonly string[];readonly invariantRefs:readonly string[];readonly checkRefs:readonly string[]}
export interface GraphEdge {readonly id:string;readonly type:EdgeType;readonly dependent:string;readonly dependency:string;readonly sourceRef:SourceRef}
export interface StateGraph {readonly version:1;readonly nodes:readonly GraphNode[];readonly edges:readonly GraphEdge[]}
const kinds=new Set(['domain','entity','contract','source','invariant','test','ci']);
const types=new Set(['depends_on','implements','validates','contains','describes']);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/.test(v);
const bad=(where:string):never=>{throw new Error(`Invalid state graph: ${where}.`);};
function object(v:unknown,keys:readonly string[],where:string):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))return bad(where);
 return v as Record<string,unknown>;
}
function source(value:unknown):SourceRef{
 const v=object(value,['path','digest'],'source reference');
 if(typeof v.path!=='string'||v.path.length<1||v.path.length>240||Buffer.from(v.path,'utf8').toString('utf8')!==v.path||/[\\:*?\x00-\x1f\x7f]/.test(v.path)||
  v.path.split('/').some(p=>!p||p!==p.trim()||p==='.'||p==='..'||p.endsWith('.')||/^(?:\.git|\.env(?:\..*)?|\.npmrc|\.pypirc|con(?:\..*)?|nul(?:\..*)?|prn(?:\..*)?|aux(?:\..*)?|(?:com|lpt)[1-9](?:\..*)?)$/i.test(p))||
  typeof v.digest!=='string'||!/^[a-f0-9]{64}$/.test(v.digest))return bad('source path or digest');
 return Object.freeze({path:v.path,digest:v.digest});
}
function refs(v:unknown):readonly string[]{
 if(!Array.isArray(v)||v.length>256||!v.every(id)||new Set(v).size!==v.length)return bad('references');
 return Object.freeze([...v]);
}
/** Pure bounded parser. Declared hashes/owners are metadata, never evidence or permissions. */
export function parseStateGraph(json:string):StateGraph{
 if(typeof json!=='string'||Buffer.byteLength(json,'utf8')>2*1024*1024)return bad('manifest size');
 let parsed:unknown;try{parsed=JSON.parse(json);}catch{return bad('JSON');}
 const graph=object(parsed,['version','nodes','edges'],'manifest fields');
 if(graph.version!==1||!Array.isArray(graph.nodes)||graph.nodes.length<1||graph.nodes.length>10000||!Array.isArray(graph.edges)||graph.edges.length>50000)return bad('version or bounds');
 const nodes:GraphNode[]=graph.nodes.map(raw=>{
  const n=object(raw,['id','kind','domainId','revision','sourceRefs','ownerRef','contractRefs','invariantRefs','checkRefs'],'node fields');
  if(!id(n.id)||!id(n.domainId)||!id(n.ownerRef)||typeof n.kind!=='string'||!kinds.has(n.kind)||!Number.isSafeInteger(n.revision)||Number(n.revision)<1||!Array.isArray(n.sourceRefs)||n.sourceRefs.length<1||n.sourceRefs.length>32)return bad('node values');
  const sources=n.sourceRefs.map(source);if(new Set(sources.map(s=>s.path)).size!==sources.length)return bad('duplicate source');
  return Object.freeze({id:n.id,kind:n.kind as NodeKind,domainId:n.domainId,revision:Number(n.revision),sourceRefs:Object.freeze(sources),ownerRef:n.ownerRef,contractRefs:refs(n.contractRefs),invariantRefs:refs(n.invariantRefs),checkRefs:refs(n.checkRefs)});
 });
 const byId=new Map(nodes.map(n=>[n.id,n]));if(byId.size!==nodes.length)return bad('duplicate node ID');
 for(const n of nodes){
  if(byId.get(n.domainId)?.kind!=='domain'||n.kind==='domain'&&n.domainId!==n.id)return bad('domain reference');
  for(const [list,allowed] of [[n.contractRefs,['contract']],[n.invariantRefs,['invariant']],[n.checkRefs,['test','ci']]] as const)
   for(const reference of list)if(!allowed.some(kind=>kind===byId.get(reference)?.kind))return bad('missing or mistyped reference');
 }
 const ids=new Set<string>(),links=new Set<string>();
 const edges:GraphEdge[]=graph.edges.map(raw=>{
  const e=object(raw,['id','type','dependent','dependency','sourceRef'],'edge fields');
  if(!id(e.id)||ids.has(e.id)||byId.has(e.id)||typeof e.type!=='string'||!types.has(e.type)||!id(e.dependent)||!id(e.dependency)||!byId.has(e.dependent)||!byId.has(e.dependency)||e.dependent===e.dependency)return bad('edge references');
  const key=JSON.stringify([e.type,e.dependent,e.dependency]);if(links.has(key))return bad('duplicate edge');ids.add(e.id);links.add(key);
  return Object.freeze({id:e.id,type:e.type as EdgeType,dependent:e.dependent,dependency:e.dependency,sourceRef:source(e.sourceRef)});
 });
 return Object.freeze({version:1,nodes:Object.freeze(nodes),edges:Object.freeze(edges)});
}
