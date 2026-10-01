import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { appendExecutionNote, projectExecutions } from "../src/adapters/execution-state.ts";
import { runExecutionSlices } from "../src/adapters/execution-slices.ts";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalSession, listTerminalSessions } from "../src/adapters/terminal-session.ts";
import { persistentView } from "../apps/terminal/src/producer/session-view.ts";

const data=(state:string,slice=1,steps=0)=>({version:1,executionId:"run-one",slice,state,steps,maxSlices:2,stepsPerSlice:2,cost:null});
test("execution replay validates finite transitions without altering objective or inventing old provenance",()=>{
  const store=new EventStore("states",()=>0);
  appendExecutionNote(store,data("running"));appendExecutionNote(store,data("continuing",1,2));
  appendExecutionNote(store,data("running",2,2));appendExecutionNote(store,data("limit",2,4));
  const before=store.revision;const [run]=projectExecutions(store.toSession().events,{replaying:true});
  assert.equal(run!.phase,"limit");assert.equal(run!.objectiveId,null);assert.equal(run!.cost,null);
  assert.equal(store.revision,before);assert.equal(store.toSession().evidence.length,0);
  assert.throws(()=>appendExecutionNote(store,data("running",1,0)),/Invalid execution/);assert.equal(store.revision,before);
});
test("invalid schemas, reordered counters and changed budgets refuse before append",()=>{
  const store=new EventStore("refusals",()=>0);appendExecutionNote(store,data("running"));const before=store.revision;
  for(const patch of [{version:2},{state:"verified"},{slice:2},{maxSlices:3},{steps:-1},{cost:0},{objectiveId:"invented"},{state:"limit",steps:2},{state:"continuing",steps:1},{stepsPerSlice:0}]){
    assert.throws(()=>appendExecutionNote(store,{...data("continuing",1,2),...patch}),/Invalid execution/);
    assert.equal(store.revision,before);
  }
});
test("cancellation and provider failures leave a durable terminal state while the objective remains open",async()=>{
  for(const cancelled of [false,true]){
    const store=new EventStore("failure",()=>0);const controller=new AbortController();
    await assert.rejects(()=>runExecutionSlices(store,{name:"failure",async infer(){if(cancelled)controller.abort(new Error("stop"));throw new Error("provider unavailable");}},
      {async run(call){return {name:call.name,exit:0,output:""};}},
      {subject:"builder",goal:"continue later",maxSteps:2,maxSlices:2,executionId:"run-one",signal:controller.signal}));
    const run=projectExecutions(store.toSession().events).at(-1)!;
    assert.equal(run.phase,cancelled ? "cancelled" : "failed");assert.equal(run.steps,0);
    assert.equal(store.toSession().goal!.open,true);
  }
});
test("crashed execution is reconstructed without rewriting journals; corrupt state refuses restart and is listed damaged",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-state-replay-"));let session:TerminalSession|undefined;
  try{
    const cwd=join(root,"work");mkdirSync(cwd);const storage=join(root,"sessions");
    session=new TerminalSession({root:storage,cwd});const id=session.metadata.id;
    appendExecutionNote(session.core,data("running"));session.close();
    const file=join(storage,`${id}.jsonl`);const before=readFileSync(file,"utf8");
    session=new TerminalSession({root:storage,cwd,id});const view=persistentView(session);
    assert.equal(view.get().busy,false);
    assert.ok(view.get().entries.some(e=>e.kind==="status" && e.value.includes("sans résultat final")));
    assert.equal(projectExecutions(session.core.toSession().events,{replaying:true})[0]!.phase,"interrupted");
    assert.equal(readFileSync(file,"utf8"),before);session.close();
    const event=JSON.parse(before.trim());event.data.version=2;const corrupted=JSON.stringify(event)+"\n";writeFileSync(file,corrupted);
    assert.throws(()=>new TerminalSession({root:storage,cwd,id}),/Invalid execution/);
    assert.equal(readFileSync(file,"utf8"),corrupted);assert.equal(listTerminalSessions(storage)[0]!.damaged,true);
  }finally{session?.close();rmSync(root,{recursive:true,force:true});}
});
