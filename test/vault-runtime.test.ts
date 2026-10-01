import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {VaultStore,VaultRetrieval} from '../src/adapters/vault.ts';
import {createProducer} from '../apps/terminal/src/producer/index.ts';
import {createStore} from '../apps/terminal/src/app/store.ts';
async function idle(store:ReturnType<typeof createStore>){const end=Date.now()+5000;while(store.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);}
for(const change of ['document','grant'] as const)test(`automatic goal retrieval discards an inference after ${change} changes`,async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-vault-infer-'));try{
  const vault=new VaultStore({root:join(root,'vault')});const original=vault.write({id:'spec',title:'Harness memory',text:'Harness memory OLD',active:true,source:{author:'human',reference:'owner/1'},expectedDocument:null},-1);
  let allowed=true;const retrieval=new VaultRetrieval({principal:'owner',scopes:[{kind:'project',id:'project',root:join(root,'vault')}],authorize:()=>allowed});
  let release!:(value:any)=>void;let entered!:()=>void;const waiting=new Promise<void>(r=>entered=r);const paused=new Promise<any>(r=>release=r);const store=createStore();let calls=0,tools=0;const frames:string[]=[];
  const producer=createProducer({store,cwd:root,identities:[],projectsRoot:root,maxSlices:1,toolNames:['node'],tools:{async run(request){tools++;return {name:request.name,exit:0,output:'unexpected'};}},vaultForScope:()=>retrieval,
   model:{name:'fixture',async infer(frame){frames.push(JSON.stringify(frame));if(++calls===1){entered();return paused;}return {text:'',toolCalls:[]};}}});
  producer.say('Implement harness memory');await waiting;assert.match(frames[0]!,/Harness memory OLD/);assert.match(frames[0]!,/owner\/1/);
  if(change==='document')vault.write({id:'spec',title:original.title,text:'Harness memory NEW',active:true,source:{author:'human',reference:'owner/2'},expectedDocument:1},1);else allowed=false;
  release({text:'',toolCalls:[{name:'node',input:{argv:['node','-e','0']}}]});await idle(store);assert.equal(tools,0);assert.ok(calls>=2);
  if(change==='document'){assert.match(frames[1]!,/Harness memory NEW/);assert.doesNotMatch(frames[1]!,/Harness memory OLD/);}else assert.doesNotMatch(frames[1]!,/Harness memory OLD/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('full Vault reference retrieval is sourced and read-only',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-vault-read-'));try{
  const vault=new VaultStore({root:join(root,'vault')});const source=vault.write({id:'spec',title:'Harness',text:'Full harness text',active:true,source:{author:'human',reference:'owner/1'},expectedDocument:null},-1);
  const retrieval=new VaultRetrieval({principal:'owner',scopes:[{kind:'project',id:'project',root:join(root,'vault')}],authorize:()=>true});const store=createStore();let calls=0;let observed='';
  const producer=createProducer({store,cwd:root,identities:[],projectsRoot:root,maxSlices:1,tools:{async run(){throw Error('No external tool is needed');}},vaultForScope:()=>retrieval,
   model:{name:'fixture',async infer(frame){if(++calls===1)return {text:'',toolCalls:[{name:'read_vault_reference',input:{scope:'project',id:source.id,revision:source.revision,digest:source.digest}}]};observed=JSON.stringify(frame);return {text:'',toolCalls:[]};}}});
  producer.say('Review harness');await idle(store);assert.match(observed,/Full harness text/);assert.match(observed,/owner\/1/);assert.equal(vault.read().revision,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
