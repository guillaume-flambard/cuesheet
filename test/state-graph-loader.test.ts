import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,unlinkSync,linkSync,renameSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {parseStateGraph} from '../src/adapters/state-graph/schema.ts';import {graphRevision,loadStateGraph,readChangeSet} from '../src/adapters/state-graph/loader.ts';
import {buildReverseIndex,mapChanges,computeChangeImpact} from '../src/adapters/state-graph/impact.ts';
import {childEnv} from './fixtures/hermetic-env.ts';
const ref={path:'domain.ts',digest:'a'.repeat(64)};
const node=(id:string,kind='entity')=>({id,kind,domainId:'domain',revision:1,sourceRefs:[ref],ownerRef:'owner',contractRefs:[],invariantRefs:[],checkRefs:[]});
const graph=()=>({version:1,nodes:[node('domain','domain'),node('a'),node('b')],edges:[{id:'ab',type:'depends_on',dependent:'a',dependency:'b',sourceRef:ref}]});
test('graph revision is independent of JSON formatting and set order, sensitive to content',()=>{
 const a=graph(),b=graph();b.nodes.reverse();const before=graphRevision(parseStateGraph(JSON.stringify(a)));assert.equal(before,graphRevision(parseStateGraph(JSON.stringify(b,null,2))));
 b.nodes[0]!.revision=2;assert.notEqual(before,graphRevision(parseStateGraph(JSON.stringify(b))));
 b.nodes[0]!.revision=1;b.edges[0]!.type='describes';assert.notEqual(before,graphRevision(parseStateGraph(JSON.stringify(b))));
});
test('owner manifest reads with provenance, rejects symlink/hardlink/corruption and absent definitions',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-state-graph-')),dir=join(root,'.cuesheet-project'),path=join(dir,'graph.json');mkdirSync(dir,{recursive:true});
 try{
  await assert.rejects(loadStateGraph(root));writeFileSync(path,JSON.stringify(graph()));const loaded=await loadStateGraph(root);assert.match(loaded.revision,/^[a-f0-9]{64}$/);assert.equal(loaded.graph.nodes.length,3);
  const other=join(root,'other');writeFileSync(other,JSON.stringify(graph()));unlinkSync(path);symlinkSync(other,path);await assert.rejects(loadStateGraph(root));
  unlinkSync(path);linkSync(other,path);await assert.rejects(loadStateGraph(root));unlinkSync(path);writeFileSync(path,'{');await assert.rejects(loadStateGraph(root));
  writeFileSync(path,Buffer.from([0xff]));await assert.rejects(loadStateGraph(root),/UTF-8/);
   rmSync(dir,{recursive:true});const redirected=join(root,'redirected');mkdirSync(redirected);writeFileSync(join(redirected,'graph.json'),JSON.stringify(graph()));symlinkSync(redirected,dir,'dir');await assert.rejects(loadStateGraph(root),/redirected/);
  }finally{rmSync(root,{recursive:true,force:true});}
 });
test('a real dirty and committed diff maps onto seeds, and its deletions and unknowns survive the mapping',async()=>{
 // A real repository rather than a hand-written change list, because the thing being proven is that git's
 // own vocabulary survives the read. A fixture of {path,kind} objects would agree with the parser by
 // construction and prove nothing about `--name-status` output.
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cs-changeset-')));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root,env:{...childEnv({home:root,sessions:root}),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},encoding:'utf8'}).trim();
 const file=(path:string,body:string)=>{mkdirSync(join(root,path.split('/').slice(0,-1).join('/'))||root,{recursive:true});writeFileSync(join(root,path),body);};
 try{
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  file('src/contract.ts','export const contract=1;\n');file('src/impl.ts','export const impl=1;\n');file('src/doomed.ts','export const doomed=1;\n');
  file('src/old-name.ts','export const renamed=1;\n');
  git('add','-A');git('commit','-qm','base');

  // Dirty: one declared source edited, one file this graph never declared, one untracked new file.
  writeFileSync(join(root,'src/impl.ts'),'export const impl=2;\n');
  file('src/undeclared.ts','export const stranger=1;\n');
  file('src/fresh.ts','export const fresh=1;\n');
  // Deleted: a declared file that no longer exists, so only the path can carry the change.
  unlinkSync(join(root,'src/doomed.ts'));
  // Renamed: one file under two names, detected by content.
  renameSync(join(root,'src/old-name.ts'),join(root,'src/new-name.ts'));
  const dirty=await readChangeSet(root);
  // Git pairs a rename only when both sides are tracked. In the working tree the new name is still
  // untracked, so git itself reports the deletion and the addition separately, and the reader reports
  // what git says. Asserting a rename here would be asserting a fiction, and the fiction is exactly what
  // would make a deletion look like a rename and stop being represented as one.
  assert.deepEqual(dirty,[
   {path:'src/doomed.ts',kind:'deleted'},
   {path:'src/fresh.ts',kind:'added'},
   {path:'src/impl.ts',kind:'modified'},
   {path:'src/new-name.ts',kind:'added'},
   {path:'src/old-name.ts',kind:'deleted'},
   {path:'src/undeclared.ts',kind:'added'},
  ],'every working-tree change is read, in a stable order');
  assert.deepEqual(await readChangeSet(root),dirty,'the same tree reads the same way twice');

  // The graph knows the deleted and the renamed file under its committed names, and nothing else.
  const declared=parseStateGraph(JSON.stringify({version:1,
   nodes:[node('domain','domain'),{...node('contract','contract'),sourceRefs:[{path:'src/contract.ts',digest:'a'.repeat(64)}]},
    {...node('impl'),sourceRefs:[{path:'src/impl.ts',digest:'a'.repeat(64)}]},
    {...node('doomed'),sourceRefs:[{path:'src/doomed.ts',digest:'a'.repeat(64)}]},
    {...node('renamed'),sourceRefs:[{path:'src/old-name.ts',digest:'a'.repeat(64)}]}],
   edges:[{id:'e1',type:'depends_on',dependent:'impl',dependency:'contract',sourceRef:{path:'src/contract.ts',digest:'a'.repeat(64)}}]}));
  const mapping=mapChanges(buildReverseIndex(declared),dirty);
  assert.deepEqual(mapping.seeds,['doomed','impl','renamed'],'a deleted file still seeds the node it was declared by');
  assert.deepEqual(mapping.deletions,['src/doomed.ts','src/old-name.ts'],'both removals are recorded, neither is dropped');
  // The new name is undeclared in the working tree and the two new files were never declared at all.
  assert.deepEqual(mapping.unresolved,['src/fresh.ts','src/new-name.ts','src/undeclared.ts']);
  assert.deepEqual(mapping.coverage,{declared:3,unmapped:3});

  // The whole point: the unknown files keep the plan incomplete instead of reading as a clean no-op.
  const plan=computeChangeImpact(declared,dirty);
  assert.equal(plan.complete,false);
  assert.deepEqual(plan.unmappedPaths,['src/fresh.ts','src/new-name.ts','src/undeclared.ts']);
  assert.deepEqual(plan.deletions,['src/doomed.ts','src/old-name.ts']);
  assert.ok(plan.impacted.some(n=>n.id==='impl'),'editing an implementation still impacts its contract');
  assert.ok(plan.impacted.some(n=>n.id==='doomed'),'a deleted file still impacts what it fed');
  // With the unknown paths removed from the change set, coverage is total and the plan completes.
  const covered=['src/doomed.ts','src/old-name.ts','src/impl.ts'];
  const declaredOnly=computeChangeImpact(declared,dirty.filter(change=>covered.includes(change.path)));
  assert.equal(declaredOnly.complete,true,'a fully covered change set is complete, so complete is not just always false');
  assert.deepEqual(declaredOnly.unresolved,[]);

  // Once committed, git pairs the rename, and the reader carries both names so the mapping can resolve
  // through the one the graph knows and record the one it does not.
  git('add','-A');git('commit','-qm','work');
  assert.deepEqual(await readChangeSet(root),[],'a clean tree has no changes to map');
  const committed=await readChangeSet(root,'HEAD~1');
  assert.deepEqual(committed,[
   {path:'src/doomed.ts',kind:'deleted'},
   {path:'src/fresh.ts',kind:'added'},
   {path:'src/impl.ts',kind:'modified'},
   {path:'src/new-name.ts',kind:'renamed',from:'src/old-name.ts'},
   {path:'src/undeclared.ts',kind:'added'},
  ],'a committed range reports the rename as one change with both names');
  const committedPlan=computeChangeImpact(declared,committed);
  // The declared old name covers the rename, so the undeclared new name is not a coverage hole.
  assert.equal(committedPlan.complete,false,'the two files this graph never declared still hold it open');
  assert.deepEqual(committedPlan.unmappedPaths,['src/fresh.ts','src/undeclared.ts']);
  assert.deepEqual(committedPlan.deletions,['src/doomed.ts','src/old-name.ts']);
  assert.deepEqual(mapChanges(buildReverseIndex(declared),committed).seeds,mapping.seeds,'the same work seeds the same nodes');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('a change set read from a directory that is not a repository is refused, not read as empty',async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cs-changeset-bare-')));
 try{await assert.rejects(readChangeSet(root),/could not be read/);}
 finally{rmSync(root,{recursive:true,force:true});}
});
