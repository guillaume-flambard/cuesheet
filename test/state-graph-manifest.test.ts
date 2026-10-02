import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {basename,dirname,isAbsolute,join,relative,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {MANIFEST_PATH,buildStateGraph,ownerFile,stateGraphJson} from '../src/adapters/state-graph/manifest.ts';
import {graphRevision,loadStateGraph} from '../src/adapters/state-graph/loader.ts';
import {parseStateGraph} from '../src/adapters/state-graph/schema.ts';
// Resolved from the test file rather than from the cwd, so the manifest is
// measured against this repository whatever directory the suite was started in.
const ROOT=fileURLToPath(new URL('..',import.meta.url)),DIGEST=/^[a-f0-9]{64}$/;
const artifact=()=>readFileSync(join(ROOT,MANIFEST_PATH),'utf8');
const sha256=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
// Containment is a property of the resolved path, not of the declared string: a
// symlink under the root can read as inside while its bytes live outside it.
const contained=(root:string,path:string)=>{const real=realpathSync(resolve(root,path)),inside=relative(realpathSync(root),real);return !isAbsolute(path)&&inside.length>0&&!inside.startsWith('..')&&!isAbsolute(inside);};
test('the committed manifest is what the generator produces, and the real loader admits it',async()=>{
 const committed=artifact(),graph=buildStateGraph(ROOT);
 // Byte equality is the determinism property that counts: these bytes were written
 // by an earlier process, so a build that reproduced them reproduced them from the
 // tree alone. Asking the generator twice inside one process would prove nothing,
 // because both answers would share the same module state.
 assert.equal(committed,stateGraphJson(ROOT),'the committed artifact drifted from the generator; run `npm run graph:regen`');
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
test('every depends_on edge is proven by a real import in a file the dependent declares',()=>{
 const graph=buildStateGraph(ROOT),sources=new Map(graph.nodes.map(n=>[n.id,n.sourceRefs.map(s=>s.path)]));
 const proved=graph.edges.filter(e=>e.type==='depends_on');
 assert.ok(proved.length>0,'no depends_on edge to check; the policy would be vacuous');
 for(const edge of proved){
  const dependent=sources.get(edge.dependent)!,dependency=sources.get(edge.dependency)!;
  // The import can only appear in the dependent's own sources, so that is the only
  // place worth looking. An edge asserted without one is a claim nothing can check.
  // Sources import each other with relative specifiers, so the match is on the
  // module basename rather than on the repository-relative path.
  const witnesses=dependent.filter(file=>{
   const text=readFileSync(resolve(ROOT,file),'utf8');
   return dependency.some(target=>text.includes(basename(target)));
  });
  assert.ok(witnesses.length>0,`depends_on ${edge.dependent} -> ${edge.dependency} has no import in any of ${dependent.join(', ')}`);
 }
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
test('a declared source that resolves out of the owner root is refused before any read, and a relative link that stays inside is admitted',()=>{
 const base=mkdtempSync(join(tmpdir(),'cs-contain-')),root=join(base,'owner'),outside=join(base,'outside');
 mkdirSync(join(root,'nested'),{recursive:true});mkdirSync(outside,{recursive:true});
 const secret=join(outside,'secret.txt');writeFileSync(secret,'bytes no manifest may hash');
 const target=join(root,'nested','real.ts');writeFileSync(target,'legit bytes');
 const escape=join(root,'escape.ts'),alias=join(root,'alias.ts');
 try{
  // The lexical refusals share the message of the resolved one, so a caller learns
  // that the declaration was refused without learning which check fired.
  for(const bad of ['../outside/secret.txt',secret])assert.throws(()=>ownerFile(root,bad),/escapes the owner root/);
  // The declared string reads as inside the root; only the resolved path betrays it.
  symlinkSync(relative(dirname(escape),secret),escape);
  assert.throws(()=>ownerFile(root,'escape.ts'),/escapes the owner root/,'a link out of the owner root was admitted');
  // Reading this one first would report EISDIR. Only a check that runs before the
  // read can produce the containment refusal for it.
  const outsideDir=join(root,'outside-dir.ts');symlinkSync(relative(dirname(outsideDir),outside),outsideDir);
  assert.throws(()=>ownerFile(root,'outside-dir.ts'),/escapes the owner root/);
  symlinkSync(relative(dirname(alias),target),alias);
  const admitted=ownerFile(root,'alias.ts');
  assert.equal(admitted,realpathSync(target),'the admitted path must be the resolved one the read follows');
  assert.ok(!relative(realpathSync(root),admitted).startsWith('..'),'the admitted path leaves the owner root');
  assert.equal(readFileSync(admitted,'utf8'),'legit bytes');
 }finally{rmSync(base,{recursive:true,force:true});}
});
test('the generator refuses a declared source that links out of the owner root and digests one that links inside',()=>{
 const declared=[...new Set(buildStateGraph(ROOT).nodes.flatMap(n=>n.sourceRefs.map(s=>s.path)))],chosen='src/adapters/session-store.ts';
 assert.ok(declared.includes(chosen),'the fixture needs a path the manifest really declares');
 const base=mkdtempSync(join(tmpdir(),'cs-contain-build-')),root=join(base,'owner'),outside=join(base,'outside');
 mkdirSync(join(root,dirname(chosen)),{recursive:true});mkdirSync(outside,{recursive:true});
 const secret=join(outside,'secret.txt'),link=join(root,chosen);
 try{
  for(const path of declared)if(path!==chosen){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,`fixture ${path}`);}
  // Every other declared file exists, so the only thing that can fail below is the
  // containment refusal. Without it the build succeeds and hashes the outside bytes.
  writeFileSync(secret,'bytes no manifest may hash');symlinkSync(relative(dirname(link),secret),link);
  assert.throws(()=>buildStateGraph(root),/escapes the owner root/,'the generator followed a link out of the owner root');
  rmSync(link);
  const inside=join(root,'fixture-target.ts');writeFileSync(inside,'bytes inside the owner root');
  symlinkSync(relative(dirname(link),inside),link);
  const graph=buildStateGraph(root),ref=[...graph.nodes].flatMap(n=>n.sourceRefs).find(s=>s.path===chosen)!;
  assert.equal(ref.digest,sha256(inside),`${chosen} was not digested through the link to its inside target`);
 }finally{rmSync(base,{recursive:true,force:true});}
});