import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {isAbsolute,join,relative,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {MANIFEST_PATH,buildStateGraph,stateGraphJson} from '../src/adapters/state-graph/manifest.ts';
import {graphRevision,loadStateGraph} from '../src/adapters/state-graph/loader.ts';
import {parseStateGraph} from '../src/adapters/state-graph/schema.ts';
// Resolved from the test file rather than from the cwd, so the manifest is
// measured against this repository whatever directory the suite was started in.
const ROOT=fileURLToPath(new URL('..',import.meta.url)),DIGEST=/^[a-f0-9]{64}$/;
const artifact=()=>readFileSync(join(ROOT,MANIFEST_PATH),'utf8');
const sha256=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const contained=(root:string,path:string)=>{const inside=relative(root,resolve(root,path));return !isAbsolute(path)&&inside.length>0&&!inside.startsWith('..')&&!isAbsolute(inside);};
test('the committed manifest is what the generator produces, and the real loader admits it',async()=>{
 const committed=artifact(),graph=buildStateGraph(ROOT);
 // Byte equality is the determinism property that counts: these bytes were written
 // by an earlier process, so a build that reproduced them reproduced them from the
 // tree alone. Asking the generator twice inside one process would prove nothing,
 // because both answers would share the same module state.
 assert.equal(committed,stateGraphJson(ROOT),'the committed artifact drifted from the generator; regenerate it');
 const parsed=parseStateGraph(committed),ordinal=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const ids=[...parsed.nodes].map(n=>n.id),edgeIds=[...parsed.edges].map(e=>e.id);
 assert.deepEqual(ids,[...ids].sort(ordinal));assert.deepEqual(edgeIds,[...edgeIds].sort(ordinal));
 for(const node of parsed.nodes)for(const list of [node.sourceRefs.map(s=>s.path),[...node.contractRefs],node.invariantRefs,node.checkRefs])assert.deepEqual(list,[...list].sort(ordinal),`${node.id} lists an unsorted reference set`);
 const loaded=await loadStateGraph(ROOT);
 assert.equal(loaded.path,join(realpathSync(ROOT),'.cuesheet-project','graph.json'));
 assert.match(loaded.revision,DIGEST);
 assert.equal(loaded.revision,graphRevision(graph));
 assert.deepEqual(loaded.graph,graph);
});
test('every declared source is a real file under the owner root, and every digest is its real SHA256',()=>{
 const graph=buildStateGraph(ROOT),digests=new Map<string,string>();
 for(const node of graph.nodes)for(const source of node.sourceRefs){
  assert.ok(contained(ROOT,source.path),`${source.path} leaves the owner root`);
  assert.ok(statSync(resolve(ROOT,source.path)).isFile(),`${source.path} is not a file`);
  assert.match(source.digest,DIGEST);
  if(!digests.has(source.path))digests.set(source.path,sha256(resolve(ROOT,source.path)));
  assert.equal(source.digest,digests.get(source.path),`${source.path} does not hash to its declared digest`);
 }
 for(const edge of graph.edges){
  const endpoints=[...graph.nodes.find(n=>n.id===edge.dependent)!.sourceRefs,...graph.nodes.find(n=>n.id===edge.dependency)!.sourceRefs].map(s=>s.path);
  assert.ok(endpoints.includes(edge.sourceRef.path),`edge ${edge.id} cites a file neither endpoint declares`);
 }
 assert.ok(!artifact().includes(ROOT),'the manifest carries an absolute path from the machine that wrote it');
});
test('the four named areas are present, populated and bounded',()=>{
 const graph=buildStateGraph(ROOT),domains=graph.nodes.filter(n=>n.kind==='domain').map(n=>n.id).sort();
 assert.deepEqual(domains,['domain.integration','domain.objectives','domain.sessions','domain.workers']);
 for(const domain of domains){
  const owned=graph.nodes.filter(n=>n.domainId===domain&&n.id!==domain);
  assert.ok(owned.length>=4,`${domain} owns almost nothing`);
  assert.ok(owned.some(n=>n.kind==='entity'),`${domain} declares no entity`);
  assert.ok(owned.some(n=>n.kind==='source'),`${domain} cites no documenting source`);
  assert.ok(graph.edges.some(e=>e.type==='contains'&&e.dependent===domain),`${domain} is never contained from`);
 }
 for(const node of graph.nodes)assert.equal(node.revision,1);
 assert.ok(graph.nodes.length<=10000&&graph.edges.length<=50000);
 assert.ok(Buffer.byteLength(artifact(),'utf8')<=2*1024*1024);
 assert.ok(graph.nodes.some(n=>n.kind==='test'),'no check is declared anywhere');
 assert.equal(graph.nodes.filter(n=>n.kind==='ci').length,0,'this repository declares no CI job, so no ci node may be invented');
});
test('an absent reference, a duplicate id, an unknown version or an outside path are refused before admission',async()=>{
 // Each entry pairs the mutation with the refusal it must provoke, so a manifest
// rejected for some unrelated reason cannot pass as a caught mutation.
 const mutations:readonly (readonly [(graph:any)=>void,RegExp])[]=[
  [graph=>{graph.version=2;},/version or bounds/],
  [graph=>{graph.nodes.push({...graph.nodes[1]});},/duplicate node ID/],
  [graph=>{graph.nodes[1].checkRefs=['node.that.does.not.exist'];},/missing or mistyped reference/],
  [graph=>{graph.nodes[1].sourceRefs[0].path='../outside-root.ts';},/source path or digest/],
 ];
 const root=mkdtempSync(join(tmpdir(),'cs-manifest-')),dir=join(root,'.cuesheet-project'),path=join(dir,'graph.json');
 mkdirSync(dir,{recursive:true});
 try{
  // The unmodified copy must load first, otherwise every rejection below could be
  // the fixture refusing rather than the mutation being caught.
  writeFileSync(path,artifact());
  const admitted=await loadStateGraph(root);
  assert.equal(admitted.graph.nodes.length,buildStateGraph(ROOT).nodes.length);
  for(const [mutate,expected] of mutations){
   const broken=JSON.parse(artifact());mutate(broken);writeFileSync(path,JSON.stringify(broken));
   await assert.rejects(loadStateGraph(root),expected,`admitted a manifest this test meant to break: ${mutate.toString()}`);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});