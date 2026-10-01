import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,existsSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {childEnv} from "./fixtures/hermetic-env.ts";
import {createProducer} from "../apps/terminal/src/producer/index.ts";
import {createStore} from "../apps/terminal/src/app/store.ts";
import {SharedContexts,SharedMemoryStore,sharedScope} from "../src/adapters/shared-memory.ts";

const fixture=(cwd:string,contexts?:SharedContexts)=>createProducer({cwd,store:createStore(),sharedContexts:contexts,identities:[],model:{name:"unused",async infer(){throw new Error("inspection must not infer");}},tools:{async run(){throw new Error("inspection must not execute");}}});
test("shared context inspection is read-only, paginated, sourced and refreshed",()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-context-inspect-"));
 try{
  const project=join(root,"project"),organization=join(root,"organization"),other=join(root,"other");mkdirSync(project);mkdirSync(other);
  const org=new SharedMemoryStore({root:organization,scope:sharedScope("organization",organization)});
  org.create({kind:"constraint",text:"company convention",rationale:"shared policy",sources:[{session:"team",seq:1}]},-1);
  const contexts=new SharedContexts({cwd:project,organizations:[organization]});
  for(let i=0;i<22;i++)contexts.project.create({kind:"decision",text:`project decision ${i}`,rationale:"fixture",sources:[{session:"local",seq:i+1}]},contexts.project.read().revision);
  const isolated=new SharedContexts({cwd:other});isolated.project.create({kind:"decision",text:"other private context",rationale:"fixture",sources:[{session:"other",seq:1}]},-1);
  const producer=fixture(project,contexts);const path=join(contexts.project.root,"context.jsonl"),before=readFileSync(path,"utf8");
  const page=producer.sharedContextPage!();assert.equal(page.nextOffset,20);assert.match(page.lines.join("\n"),/local:1/);assert.match(page.lines.join("\n"),/organization/);assert.doesNotMatch(page.lines.join("\n"),/other private/);
  const next=producer.sharedContextPage!(page.nextOffset!,page.digest);assert.match(next.lines.join("\n"),/company convention/);assert.match(next.lines.join("\n"),/team:1/);assert.equal(next.nextOffset,null);assert.equal(next.offset,20);
  assert.equal(readFileSync(path,"utf8"),before);
  contexts.project.create({kind:"question",text:"new decision pending",rationale:"fixture",sources:[{session:"local",seq:24}]},contexts.project.read().revision);
  const refreshed=producer.sharedContextPage!(20,page.digest);assert.equal(refreshed.offset,0);assert.notEqual(refreshed.digest,page.digest);
  writeFileSync(path,"invalid-json\n");assert.match(producer.sharedContextPage!().lines.join("\n"),/indisponible ou invalide/);assert.equal(readFileSync(path,"utf8"),"invalid-json\n");
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("empty/unconfigured/unavailable contexts never create storage or pretend a mounted scope is empty",()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-context-empty-"));
 try{
  const contexts=new SharedContexts({cwd:root});assert.match(fixture(root,contexts).sharedContextPage!().lines.join("\n"),/Aucun souvenir partagé/);assert.equal(existsSync(join(root,".cuesheet")),false);
  assert.match(fixture(root).sharedContextPage!().lines.join("\n"),/Aucun contexte partagé configuré/);
  const unavailable=new SharedContexts({cwd:root,organizations:[join(root,"absent")]});assert.match(fixture(root,unavailable).sharedContextPage!().lines.join("\n"),/indisponible ou invalide/);assert.equal(existsSync(join(root,"absent")),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});


test("real terminal palette opens shared sources, pages, resizes and closes without writes",()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-context-ui-"));
 try{
  const terminal=resolve("apps/terminal"),repo=resolve(".");const script=join(root,"context-ui.tsx");writeFileSync(join(root,"package.json"),'{"type":"module"}');
  writeFileSync(script,`import React from ${JSON.stringify(join(terminal,"node_modules/react/index.js"))};
import {render} from ${JSON.stringify(join(terminal,"node_modules/ink/build/index.js"))};
import {App} from ${JSON.stringify(join(terminal,"src/app/App.tsx"))};
import {createStore} from ${JSON.stringify(join(terminal,"src/app/store.ts"))};
import {createProducer} from ${JSON.stringify(join(terminal,"src/producer/index.ts"))};
import {SharedContexts} from ${JSON.stringify(join(repo,"src/adapters/shared-memory.ts"))};
import {TerminalSession} from ${JSON.stringify(join(repo,"src/adapters/terminal-session.ts"))};
import {PassThrough} from 'node:stream';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const root=${JSON.stringify(root)};const contexts=new SharedContexts({cwd:root});
for(let i=0;i<22;i++)contexts.project.create({kind:'decision',text:'shared row '+i,rationale:'fixture',sources:[{session:'source-session',seq:i+1}]},contexts.project.read().revision);
const journal=new TerminalSession({root:join(root,'sessions'),cwd:root});const store=createStore();let calls=0;
const producer=createProducer({store,journal,cwd:root,identities:[],sharedContexts:contexts,model:{name:'unused',async infer(){calls++;throw new Error('no inference');}},tools:{async run(){throw new Error('no tools');}}});
const out=new PassThrough();Object.assign(out,{columns:80,rows:24,isTTY:false});let last='';const frames=[];out.on('data',b=>{last=b.toString();frames.push(last);});
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const app=render(<App store={store} producer={producer}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});const tick=()=>new Promise(r=>setTimeout(r,45));
const before=journal.core.revision;const bytes=readFileSync(join(contexts.project.root,'context.jsonl'),'utf8');
input.write('\\x0b');await tick();for(let i=0;i<7;i++){input.write('\\x1b[B');await tick();}input.write('\\r');await tick();const opened=last;
input.write('n');await tick();for(let i=0;i<20;i++){input.write('\\x1b[B');await tick();}const next=frames.join('\\n');
input.write('p');await tick();const previous=last;const sizes=[];for(const [columns,rows] of [[40,14],[80,24],[120,36]]){out.columns=columns;out.rows=rows;out.emit('resize');await tick();sizes.push({rows,frame:last});}
input.write('\\x1b');await tick();const closed=store.get().overlay==='none';const unchanged=before===journal.core.revision&&bytes===readFileSync(join(contexts.project.root,'context.jsonl'),'utf8');app.unmount();journal.close();console.log(JSON.stringify({opened,next,previous,sizes,closed,unchanged,calls}));`);
  const run=spawnSync(process.execPath,[join(terminal,"node_modules/tsx/dist/cli.mjs"),script],{encoding:"utf8",timeout:20000,env:childEnv(root)});assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim());
  assert.match(result.opened,/Contexte partagé/);assert.match(result.opened,/révision 22/);assert.match(result.next,/shared row 21/);assert.match(result.next,/source-session:22/);assert.match(result.previous,/Souvenirs 1–20/);
  assert.equal(result.closed,true);assert.equal(result.unchanged,true);assert.equal(result.calls,0);for(const size of result.sizes){assert.match(size.frame,/N\/P pages/);assert.ok(size.frame.split("\n").length<=size.rows,size.frame);}
 }finally{rmSync(root,{recursive:true,force:true});}
});
