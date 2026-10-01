import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { projectEffectAttempts,completeAttempt,reconcileEffect,appendReceipt,invocationKey } from "../src/adapters/tool-receipts.ts";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,appendFileSync,rmSync,renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TerminalSession } from "../src/adapters/terminal-session.ts";
import { persistentView } from "../apps/terminal/src/producer/session-view.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";
import { createCompletionCheck } from "../src/adapters/surface-verification.ts";
import { ShellToolRunner } from "../src/adapters/shell.ts";
const intent=(store:EventStore,version?:number)=>store.append({kind:"action",subject:"terminal.intent",data:{...(version===undefined ? {} : {version}),phase:"requested",tool:"node",input:{argv:["node","-e","effect"]},effectId:"E-old"}});
const observation=(store:EventStore,tool:string,exit=0)=>store.append({kind:"observation",subject:"builder",data:{tool,exit,output:"observed"}});
test("linked completion is sufficient even when core response was never written",()=>{
  const store=new EventStore("receipt",()=>0);const requested=intent(store,1);
  completeAttempt(store,requested,{name:"node",exit:0,output:"done"});
  assert.equal(projectEffectAttempts(store.toSession().events)[0]!.phase,"completed");
  const before=store.revision;assert.throws(()=>completeAttempt(store,requested,{name:"node",exit:0,output:"done"}),/Invalid effect/);assert.equal(store.revision,before);
  assert.equal(store.toSession().evidence.length,0);
  const future=new EventStore("future",()=>0);intent(future,2);assert.throws(()=>projectEffectAttempts(future.toSession().events),/Invalid tool intent/);
  assert.equal(invocationKey("node",{a:1,b:2}),invocationKey("node",{b:2,a:1}));
});
test("legacy results stay serial and cannot be completed by another execution's refusal",()=>{
  const legacy=new EventStore("legacy",()=>0);intent(legacy);observation(legacy,"node",1);
  assert.equal(projectEffectAttempts(legacy.toSession().events)[0]!.phase,"completed");
  const interrupted=new EventStore("interrupted",()=>0);intent(interrupted);
  interrupted.append({kind:"effect_observed",subject:"E-old",data:{reason:"cancelled"}});observation(interrupted,"node",126);
  assert.equal(projectEffectAttempts(interrupted.toSession().events)[0]!.phase,"uncertain");
  const modern=new EventStore("modern",()=>0);intent(modern,1);observation(modern,"node",126);
  assert.equal(projectEffectAttempts(modern.toSession().events)[0]!.phase,"uncertain");
});
test("reconciliation requires a real later inspection and leaves inconclusive effects gated",()=>{
  const store=new EventStore("inspect",()=>0);const old=observation(store,"cat");const requested=intent(store,1);
  const reconcile=(observationSeq:number,conclusion="performed")=>reconcileEffect(store,{name:"reconcile_effect",input:{intentSeq:requested.seq,observationSeq,conclusion,rationale:"inspected the file"}},"E-resume");
  const before=store.revision;assert.equal(reconcile(old.seq).exit,2);assert.equal(store.revision,before);
  const claim=store.append({kind:"note",subject:"model",data:{text:"I checked"}});assert.equal(reconcile(claim.seq).exit,2);
  const failed=observation(store,"cat",1);assert.equal(reconcile(failed.seq).exit,2);
  const real=observation(store,"cat");assert.equal(reconcile(real.seq,"inconclusive").exit,0);assert.equal(projectEffectAttempts(store.toSession().events)[0]!.phase,"uncertain");
  assert.equal(reconcile(real.seq).exit,0);assert.equal(projectEffectAttempts(store.toSession().events)[0]!.phase,"performed");
  assert.equal(store.toSession().evidence.length,0);
  assert.throws(()=>appendReceipt(store,{version:2,operation:"completed",intentSeq:requested.seq,tool:"node",exit:0,digest:"a".repeat(64)}),/Invalid effect/);
});
test("a real side effect interrupted before its receipt is inspected and never appended twice on resume",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-reconcile-"));let journal:TerminalSession|undefined;
  const untilIdle=async(store:ReturnType<typeof persistentView>)=>{const until=Date.now()+5000;while(store.get().busy&&Date.now()<until)await new Promise(r=>setTimeout(r,5));assert.equal(store.get().busy,false);};
  try{
    const cwd=join(root,"work");mkdirSync(cwd);const storage=join(root,"sessions");
    const oracle=join(root,"check.mjs");writeFileSync(oracle,"import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';assert.equal(readFileSync('effect.txt','utf8'),'one\\n');");
    const verification=createCompletionCheck({script:oracle,root:join(root,"proof")});
    journal=new TerminalSession({root:storage,cwd,check:verification.pinned});const id=journal.metadata.id;const first=persistentView(journal);
    const call={name:"node",input:{argv:["node","-e","require('fs').appendFileSync('effect.txt','one\\n')"]}};
    let ready=()=>{};const written=new Promise<void>(r=>{ready=r;});
    const producer=createProducer({store:first,journal,cwd,projectsRoot:root,identities:[],verification,toolNames:["node","cat"],model:{name:"first",async infer(){return {text:"",toolCalls:[call]};}},tools:{async run(){appendFileSync(join(cwd,"effect.txt"),"one\n");ready();await new Promise(()=>{});return {name:"node",exit:0,output:""};}}});
    producer.say("produce exactly one line");await written;producer.cancel!();await untilIdle(first);
    assert.equal(projectEffectAttempts(journal.core.toSession().events).filter(a=>a.phase==="uncertain"&&a.tool==="node").length,1);journal.close();
    journal=new TerminalSession({root:storage,cwd,id});const replay=persistentView(journal);let dispatched=0;let inferred=0;
    const shell=new ShellToolRunner({allow:["node","cat"],roots:[cwd],defaultCwd:cwd});
    const resumed=createProducer({store:replay,journal,cwd,projectsRoot:root,identities:[],verification,toolNames:["node","cat"],tools:{async run(request,signal){dispatched++;return shell.run(request,signal);}},
      model:{name:"reconciling",async infer(frame){inferred++;
        if(frame.step===1)return {text:"",toolCalls:[call]};
        if(frame.step===2)return {text:"",toolCalls:[{name:"cat",input:{argv:["cat","effect.txt"]}}]};
        if(frame.step===3){const source=frame.history.findLast(e=>e.kind==="observation"&&e.data.tool==="cat"&&e.data.exit===0)!;const pending=projectEffectAttempts(journal!.core.toSession().events).find(a=>a.phase==="uncertain"&&a.tool==="node")!;
          return {text:"",toolCalls:[{name:"reconcile_effect",input:{intentSeq:pending.intentSeq,observationSeq:source.seq,conclusion:"performed",rationale:"effect.txt already contains the required line"}}]};}
        if(frame.step===4)return {text:"",toolCalls:[call]};
        return {text:"",toolCalls:[{name:"finish",input:{}}]};
      }}});
    assert.equal(inferred,0,"loading never infers");resumed.resume!();await untilIdle(replay);
    assert.equal(dispatched,1,"only the real cat inspection was dispatched; both repeat mutations were refused");
    assert.equal(readFileSync(join(cwd,"effect.txt"),"utf8"),"one\n");assert.equal(journal.core.toSession().goal!.open,false);
    assert.ok(journal.core.toSession().events.some(e=>e.subject==="terminal.receipt"&&e.data.operation==="reconcile"));
  }finally{journal?.close();rmSync(root,{recursive:true,force:true});}
});

test("receipt corruption refuses restart without rewriting the journal",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-receipt-corrupt-"));let journal:TerminalSession|undefined;
  try{
    const cwd=join(root,"work");mkdirSync(cwd);const storage=join(root,"sessions");
    journal=new TerminalSession({root:storage,cwd});const id=journal.metadata.id;const requested=intent(journal.core,1);
    completeAttempt(journal.core,requested,{name:"node",exit:0,output:"done"});journal.close();
    const path=join(storage,`${id}.jsonl`);const rows=readFileSync(path,"utf8").trim().split("\n").map(row=>JSON.parse(row));
    rows.at(-1).data.intentSeq=9999;const corrupted=rows.map(row=>JSON.stringify(row)).join("\n")+"\n";writeFileSync(path,corrupted);
    assert.throws(()=>new TerminalSession({root:storage,cwd,id}),/Invalid effect receipt/);assert.equal(readFileSync(path,"utf8"),corrupted);
  }finally{journal?.close();rmSync(root,{recursive:true,force:true});}
});
test("failure to persist a receipt after the effect stops subsequent tools and leaves the restored intent uncertain",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-receipt-write-"));let journal:TerminalSession|undefined;
  try{
    const cwd=join(root,"work");mkdirSync(cwd);const storage=join(root,"sessions");
    journal=new TerminalSession({root:storage,cwd});const id=journal.metadata.id;const core=join(storage,`${id}.jsonl`);const saved=join(root,"saved.jsonl");
    const view=persistentView(journal);let dispatched=0;
    const producer=createProducer({store:view,journal,cwd,projectsRoot:root,identities:[],model:{name:"two effects",async infer(){return {text:"",toolCalls:[{name:"node",input:{argv:["node","-e","first"]}},{name:"node",input:{argv:["node","-e","second"]}}]};}},tools:{async run(request){dispatched++;writeFileSync(join(cwd,"effect.txt"),"already happened");renameSync(core,saved);mkdirSync(core);return {name:request.name,exit:0,output:"complete"};}}});
    producer.say("do the two effects");const until=Date.now()+3000;while(view.get().busy&&Date.now()<until)await new Promise(r=>setTimeout(r,5));
    assert.equal(view.get().busy,false);assert.equal(dispatched,1);assert.ok(journal.failure);assert.equal(readFileSync(join(cwd,"effect.txt"),"utf8"),"already happened");
    journal.close();rmSync(core,{recursive:true});renameSync(saved,core);journal=new TerminalSession({root:storage,cwd,id});
    assert.equal(projectEffectAttempts(journal.core.toSession().events).filter(a=>a.tool==="node"&&a.phase==="uncertain").length,1);
  }finally{journal?.close();rmSync(root,{recursive:true,force:true});}
});
