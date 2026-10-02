import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,unlinkSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {parseStateGraph} from '../src/adapters/state-graph/schema.ts';import {graphRevision,loadStateGraph} from '../src/adapters/state-graph/loader.ts';
const ref={path:'domain.ts',digest:'a'.repeat(64)};
const node=(id:string,kind='entity')=>({id,kind,domainId:'domain',revision:1,sourceRefs:[ref],ownerRef:'owner',contractRefs:[],invariantRefs:[],checkRefs:[]});
const graph=()=>({version:1,nodes:[node('domain','domain'),node('a'),node('b')],edges:[{id:'ab',type:'depends_on',dependent:'a',dependency:'b',sourceRef:ref}]});
test('graph revision is independent of JSON formatting and set order, sensitive to content',()=>{
 const a=graph(),b=graph();b.nodes.reverse();const before=graphRevision(parseStateGraph(JSON.stringify(a)));assert.equal(before,graphRevision(parseStateGraph(JSON.stringify(b,null,2))));
 b.nodes[0]!.revision=2;assert.notEqual(before,graphRevision(parseStateGraph(JSON.stringify(b))));
 b.nodes[0]!.revision=1;b.edges[0]!.type='describes';assert.notEqual(before,graphRevision(parseStateGraph(JSON.stringify(b))));
});
test('owner manifest reads with provenance, rejects symlink/hardlink/corruption and absent definitions',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-state-graph-')),dir=join(root,'.cuesheet','project'),path=join(dir,'graph.json');mkdirSync(dir,{recursive:true});
 try{
  await assert.rejects(loadStateGraph(root));writeFileSync(path,JSON.stringify(graph()));const loaded=await loadStateGraph(root);assert.match(loaded.revision,/^[a-f0-9]{64}$/);assert.equal(loaded.graph.nodes.length,3);
  const other=join(root,'other');writeFileSync(other,JSON.stringify(graph()));unlinkSync(path);symlinkSync(other,path);await assert.rejects(loadStateGraph(root));
  unlinkSync(path);linkSync(other,path);await assert.rejects(loadStateGraph(root));unlinkSync(path);writeFileSync(path,'{');await assert.rejects(loadStateGraph(root));
  writeFileSync(path,Buffer.from([0xff]));await assert.rejects(loadStateGraph(root),/UTF-8/);
  rmSync(dir,{recursive:true});const redirected=join(root,'redirected');mkdirSync(redirected);writeFileSync(join(redirected,'graph.json'),JSON.stringify(graph()));symlinkSync(redirected,dir,'dir');await assert.rejects(loadStateGraph(root),/redirected/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
