import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {VaultStore,searchVault} from '../src/adapters/vault.ts';
test('Vault preserves source history and reconstructs text retrieval without an index',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-vault-'));try{
  const vault=new VaultStore({root});assert.equal(vault.read().revision,-1);assert.equal(existsSync(join(root,'documents.jsonl')),false);
  const first=vault.write({id:'architecture',title:'Mémoire durable',text:'Le Vault conserve les décisions. Le RAG sélectionne les passages.',active:true,source:{author:'human',reference:'session:t-example/1'},expectedDocument:null},-1);
  vault.write({id:'other',title:'Plan',text:'Une autre décision sur le RAG.',active:true,source:{author:'model',reference:'session:t-example/2'},expectedDocument:null},1);
  const changed=vault.write({id:'architecture',title:first.title,text:'Le Vault canonique versionné conserve les décisions.',active:true,source:{author:'human',reference:'session:t-example/3'},expectedDocument:1},2);
  assert.notEqual(changed.digest,first.digest);assert.equal(vault.read().history[0]!.text,first.text);
  const hits=searchVault(vault.read().documents,'mémoire Vault');assert.equal(hits[0]!.id,'architecture');assert.equal(hits[0]!.revision,3);assert.equal(hits[0]!.source.author,'human');assert.deepEqual(searchVault(new VaultStore({root}).read().documents,'mémoire Vault'),hits);
  assert.throws(()=>vault.write({id:'architecture',title:'Bad',text:'stale',active:true,source:first.source,expectedDocument:1},3));assert.equal(vault.read().revision,3);
  vault.write({id:'architecture',title:changed.title,text:changed.text,active:false,source:changed.source,expectedDocument:3},3);
  assert.deepEqual(searchVault(vault.read().documents,'Vault'),[]);assert.equal(vault.read().history.length,4);
  const path=join(root,'documents.jsonl');const before=readFileSync(path,'utf8');writeFileSync(path,before+'broken\n');assert.throws(()=>vault.read());assert.equal(readFileSync(path,'utf8'),before+'broken\n');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('Vault source data cannot silently invent human authorship',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-vault-invalid-'));try{
  const vault=new VaultStore({root});assert.throws(()=>vault.write({id:'x',title:'Title',text:'data',active:true,source:{author:'other' as any,reference:'untrusted'},expectedDocument:null},-1));assert.equal(existsSync(join(root,'documents.jsonl')),false);
  assert.throws(()=>searchVault([],'query',0));assert.deepEqual(searchVault([],'!?'),[]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('retrieval checks grants before IO and after selection; old references cannot bypass revocation',async()=>{
 const {VaultRetrieval}=await import('../src/adapters/vault.ts');const root=mkdtempSync(join(tmpdir(),'cs-grants-'));try{
  const permitted=join(root,'permitted'),denied=join(root,'denied');const {mkdirSync}=await import('node:fs');mkdirSync(denied);writeFileSync(join(denied,'documents.jsonl'),'broken');
  const version=new VaultStore({root:permitted}).write({id:'spec',title:'Shared harness',text:'Vault retrieval goal',active:true,source:{author:'human',reference:'session/1'},expectedDocument:null},-1);
  let allowed=true;const scopes=[{kind:'project' as const,id:'project',root:permitted},{kind:'personal' as const,id:'private',root:denied}];
  const retrieval=new VaultRetrieval({principal:'alice',scopes,authorize:(principal,scope)=>principal==='alice'&&scope.id==='project'&&allowed});
  const result=retrieval.search('Vault');assert.equal(result.length,1);const ref={scope:result[0]!.scope,id:version.id,revision:version.revision,digest:version.digest};assert.equal(retrieval.read(ref).text,version.text);
  allowed=false;assert.deepEqual(retrieval.search('Vault'),[]);assert.throws(()=>retrieval.read(ref),/authorized/);assert.throws(()=>retrieval.read({...ref,scope:'invented'}),/authorized/);
  let calls=0;const raced=new VaultRetrieval({principal:'alice',scopes:[scopes[0]!],authorize:()=>++calls<=2});assert.throws(()=>raced.search('Vault'),/changed/);calls=0;const racedRead=new VaultRetrieval({principal:'alice',scopes:[scopes[0]!],authorize:()=>++calls===1});assert.throws(()=>racedRead.read(ref),/changed/);
  scopes[0]!.root=denied;allowed=true;assert.equal(retrieval.search('Vault')[0]!.id,'spec');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('two real Vault writers cannot both commit the same scope revision',async()=>{
 const {spawn}=await import('node:child_process');const root=mkdtempSync(join(tmpdir(),'cs-vault-race-'));try{
  const vault=new VaultStore({root});vault.write({id:'initial',title:'Initial',text:'source',active:true,source:{author:'human',reference:'owner/1'},expectedDocument:null},-1);
  const module=new URL('../src/adapters/vault.ts',import.meta.url).href;
  const script=`import {VaultStore} from ${JSON.stringify(module)};const vault=new VaultStore({root:${JSON.stringify(root)}});const revision=vault.read().revision;console.log('ready');process.stdin.once('data',()=>{try{vault.write({id:process.argv[1],title:'Race',text:'fixture',active:true,source:{author:'model',reference:'fixture/'+process.argv[1]},expectedDocument:null},revision);console.log('committed')}catch{console.log('conflict')}process.exit()});`;
  const writers=['one','two'].map(id=>{const child=spawn(process.execPath,['--input-type=module','-e',script,id],{stdio:['pipe','pipe','pipe']});let output='';let err='';const ready=new Promise<void>((resolve,reject)=>{child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('ready'))resolve();});child.on('error',reject);});child.stderr.on('data',chunk=>err+=chunk.toString());const done=new Promise<string>((resolve,reject)=>child.on('exit',code=>code===0?resolve(output):reject(Error(err))));return {child,ready,done};});
  await Promise.all(writers.map(w=>w.ready));writers.forEach(w=>w.child.stdin.write('go'));const outputs=await Promise.all(writers.map(w=>w.done));assert.equal(outputs.filter(o=>o.includes('committed')).length,1);assert.equal(outputs.filter(o=>o.includes('conflict')).length,1);assert.equal(vault.read().history.length,2);
 }finally{rmSync(root,{recursive:true,force:true});}
});
