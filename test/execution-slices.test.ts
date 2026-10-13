import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { runExecutionSlices } from "../src/adapters/execution-slices.ts";

function options(signal=new AbortController().signal){return {subject:"builder",goal:"durable goal",maxSteps:2,maxSlices:3,executionId:"run-one",signal};}
test("execution continues with rebuilt context, monotone steps and a cumulative finite budget",async()=>{
  const store=new EventStore("continuity",()=>0);const steps:number[]=[];
  const result=await runExecutionSlices(store,{name:"fixture",async infer(frame){steps.push(frame.step);return {text:"",toolCalls:[{name:"read_document",input:{url:`https://example.com/${frame.step}`}}]};}},
    {async run(call){return {name:call.name,exit:0,output:String(call.input.url)};}},options());
  assert.deepEqual(steps,[1,2,3,4,5,6]);assert.equal(result.stop.reason,"budget-exhausted");
  if(result.stop.reason!=="blocked")assert.equal(result.stop.steps,6);
  const notes=store.toSession().events.filter(e=>e.subject==="terminal.execution");
  assert.equal(notes.at(-1)!.data.state,"limit");assert.equal(notes.at(-1)!.data.cost,null);
  assert.equal(store.toSession().goal!.open,true);
});
test("repeated successful observations and model claims cannot fund endless continuation",async()=>{
  for(const hasTool of [true,false]){
    const store=new EventStore("stagnation",()=>0);let calls=0;
    await runExecutionSlices(store,{name:"repeating",async infer(){calls++;return {text:"new claim",toolCalls:hasTool ? [{name:"cat",input:{path:"unchanged"}}] : []};}},
      {async run(call){return {name:call.name,exit:0,output:"unchanged"};}},options());
    assert.equal(calls,hasTool ? 4 : 2);assert.equal(store.toSession().events.at(-1)!.data.state,"stagnation");
  }
});
test("a cancellation at the slice boundary prevents any subsequent inference",async()=>{
  const store=new EventStore("cancel",()=>0);const controller=new AbortController();let calls=0;
  await assert.rejects(()=>runExecutionSlices(store,{name:"fixture",async infer(){calls++;return {text:"",toolCalls:[{name:"cat",input:{}}]};}},
    {async run(call){return {name:call.name,exit:0,output:String(calls)};}}, {...options(controller.signal),onEvent(event){if(event.subject==="terminal.execution"&&event.data.state==="continuing")controller.abort(new Error("human stop"));}}),/human stop/);
  assert.equal(calls,2);
});

test("a repeated text-only answer stops early and journals the real step count without verification",async()=>{
  const store=new EventStore("early-stagnation",()=>0);let calls=0;
  const result=await runExecutionSlices(store,{name:"repeating",async infer(){calls++;return {text:"BONJOUR-CUESHEET-OK",toolCalls:[]};}},
    {async run(call){throw Error("No tool should be invoked: "+call.name);}},
    {...options(),maxSteps:8,maxSlices:4});
  assert.equal(calls,2,"no identical repeated model proposals after the second");
  assert.equal(result.stop.reason,"stagnation");
  assert.equal(result.stop.steps,2);
  const observations=store.toSession().events.filter(e=>e.kind==="observation"&&e.data.text==="BONJOUR-CUESHEET-OK");
  assert.equal(observations.length,1,"only one durable answer, not a duplicated reply");
  assert.equal(store.toSession().goal?.open,true,"no model-only claim can close the goal");
  const recorded=store.toSession().events.filter(e=>e.subject==="terminal.execution");
  assert.equal(recorded.at(-1)?.data.state,"stagnation");
  assert.equal(recorded.at(-1)?.data.steps,2,"journal records the actual early stop");
});
