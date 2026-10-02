import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {parseStateGraph,type StateGraph} from './schema.ts';
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const hash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
/** Project-defined deterministic encoding; declarations are not execution authority. */
export function graphRevision(graph:StateGraph):string{
 // Revalidate public inputs rather than trusting a TypeScript cast.
 const validated=parseStateGraph(JSON.stringify(graph));
 const nodes=validated.nodes.map(node=>({...node,
  sourceRefs:[...node.sourceRefs].sort((a,b)=>compare(a.path,b.path)),
  contractRefs:[...node.contractRefs].sort(compare),invariantRefs:[...node.invariantRefs].sort(compare),checkRefs:[...node.checkRefs].sort(compare)})).sort((a,b)=>compare(a.id,b.id));
 const edges=[...validated.edges].sort((a,b)=>compare(a.id,b.id));
 return hash(JSON.stringify({version:1,nodes,edges}));
}
export async function loadStateGraph(ownerRoot:string):Promise<{graph:StateGraph;revision:string;manifestDigest:string;path:string;root:string}>{
 const root=await realpath(ownerRoot);let path=root;
 // `.cuesheet` is the container runner's reserved control mount: it bind-mounts an
  // empty directory over it so a model-driven tool cannot read runner control state.
  // Project state cannot live there or every capsule check would see no manifest.
  for(const part of ['.cuesheet-project']){path=join(path,part);const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw Error('State graph manifest parent is redirected.');}
 path=join(path,'graph.json');const stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>2*1024*1024)throw Error('State graph requires a bounded regular owner manifest.');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await handle.stat();if(opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('Manifest changed before read.');
  const bytes=Buffer.alloc(stat.size+1),read=await handle.read(bytes,0,bytes.length,0),after=await handle.stat(),latest=await lstat(path);
  if(read.bytesRead!==stat.size||after.size!==stat.size||after.nlink!==1||latest.nlink!==1||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||latest.ino!==stat.ino||latest.dev!==stat.dev||await realpath(path)!==path)throw Error('Manifest changed during read.');
  const content=bytes.subarray(0,read.bytesRead),text=content.toString('utf8');if(!Buffer.from(text,'utf8').equals(content))throw Error('Manifest is not valid UTF-8.');
  const graph=parseStateGraph(text);return Object.freeze({graph,revision:graphRevision(graph),manifestDigest:hash(content),path,root});
 }finally{await handle.close();}
}
