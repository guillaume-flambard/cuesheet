import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelBinding, ModelSelectionChanged } from "../src/adapters/model-binding.ts";
import { TerminalSession } from "../src/adapters/terminal-session.ts";
import { persistentView } from "../apps/terminal/src/producer/session-view.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";
import { projectObjectives } from "../src/adapters/objectives.ts";
const choice=(model:string)=>({provider:"compatible" as const,model,baseUrl:"http://localhost:9000/v1"});
const env={CUESHEET_PROVIDER:"compatible",CUESHEET_MODEL:"first",CUESHEET_BASE_URL:choice("first").baseUrl};
const reply=(tool:string)=>({function:{name:"tool_call",arguments:JSON.stringify({tool,input:{argv:["node","-e",tool]}})}});
const idle=async(store:ReturnType<typeof persistentView>)=>{const until=Date.now()+5000;while(store.get().busy&&Date.now()<until)await new Promise(r=>setTimeout(r,5));assert.equal(store.get().busy,false);};
test("active switch aborts an old signal-ignorant inference and only the new model sees the rebuilt current objective",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-switch-"));const original=globalThis.fetch;let journal:TerminalSession|undefined;
  try{
    const cwd=join(root,"work");mkdirSync(cwd);journal=new TerminalSession({root:join(root,"sessions"),cwd});
    const binding=createModelBinding({project:cwd,path:join(root,"models.json"),env});const view=persistentView(journal);
    let release:(r:Response)=>void=()=>{};let ready=()=>{};const pending=new Promise<void>(r=>{ready=r;});let oldSignal:AbortSignal|undefined;const requests:any[]=[];let calls=0;
    globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options?.body));requests.push(body);if(body.model==="first"){oldSignal=options!.signal as AbortSignal;ready();return new Promise<Response>(r=>{release=r;});}return Response.json({choices:[{message:{content:"new provider observation"}}]});};
    const producer=createProducer({store:view,journal,cwd,projectsRoot:root,identities:[],model:binding.adapter,tools:{async run(request){calls++;return {name:request.name,exit:0,output:""};}}});
    producer.say("preserve the API while completing this objective");await pending;const objective=projectObjectives(journal.core.toSession().events).current!.id;
    assert.deepEqual(binding.select(choice("second"),{busy:true,save:false,beforeCommit:selection=>producer.modelSelected!(selection)}),{ok:true});
    assert.equal(oldSignal!.aborted,true);
    release(Response.json({choices:[{message:{content:"obsolete result",tool_calls:[reply("node")]}}]}));await idle(view);
    assert.equal(calls,0);assert.equal(projectObjectives(journal.core.toSession().events).current!.id,objective);
    const next=requests.find(r=>r.model==="second");assert.ok(next);assert.match(JSON.stringify(next.messages),new RegExp(objective));assert.match(JSON.stringify(next.messages),/preserve the API/);
    assert.equal(journal.core.toSession().models.get("builder")!.model,"second");assert.equal(journal.lastModel!.model,"second");
    assert.equal(view.get().entries.some(e=>e.kind==="cuesheet"&&e.text.includes("obsolete result")),false);
  }finally{globalThis.fetch=original;journal?.close();rmSync(root,{recursive:true,force:true});}
});
test("a switch during a tool waits for that effect and discards the remaining old proposal",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-switch-tool-"));const original=globalThis.fetch;let journal:TerminalSession|undefined;
  try{
    const cwd=join(root,"work");mkdirSync(cwd);journal=new TerminalSession({root:join(root,"sessions"),cwd});const view=persistentView(journal);
    const binding=createModelBinding({project:cwd,path:join(root,"models.json"),env});let ready=()=>{};const arrived=new Promise<void>(r=>{ready=r;});let release=()=>{};const gate=new Promise<void>(r=>{release=r;});let writes=0;const models:string[]=[];
    globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options?.body));models.push(body.model);return Response.json({choices:[{message:body.model==="first" ? {tool_calls:[reply("node"),reply("node")]} : {content:"continue from the observed effect"}}]});};
    const producer=createProducer({store:view,journal,cwd,projectsRoot:root,identities:[],model:binding.adapter,tools:{async run(request){writes++;writeFileSync(join(cwd,"effect.txt"),"one effect");ready();await gate;return {name:request.name,exit:0,output:"effect completed"};}}});
    producer.say("complete work");await arrived;
    assert.deepEqual(binding.select(choice("second"),{busy:true,save:false,beforeCommit:selection=>producer.modelSelected!(selection)}),{ok:true});
    assert.equal(view.get().busy,true);release();await idle(view);
    assert.equal(writes,1);assert.equal(readFileSync(join(cwd,"effect.txt"),"utf8"),"one effect");assert.ok(models.includes("second"));
    assert.ok(journal.core.toSession().events.some(e=>e.subject==="terminal.receipt"&&e.data.operation==="completed"));
  }finally{globalThis.fetch=original;journal?.close();rmSync(root,{recursive:true,force:true});}
});
test("stop wins over model substitution and failed beforeCommit leaves the active binding intact",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-switch-stop-"));const original=globalThis.fetch;
  try{
    const binding=createModelBinding({project:root,path:join(root,"models.json"),env});let oldSignal:AbortSignal|undefined;
    globalThis.fetch=async(_url,options)=>{oldSignal=options!.signal as AbortSignal;return new Promise(()=>{});};
    const controller=new AbortController();const frame={model:"first",goal:"g",step:1,directives:[],evidence:[],capabilities:[],history:[]};
    const pending=(binding.adapter as any).infer(frame,controller.signal);
    assert.ok("error" in binding.select(choice("second"),{busy:true,save:false,beforeCommit(){throw new Error("storage refused");}}));assert.equal(binding.selection.model,"first");assert.equal(oldSignal!.aborted,false);
    controller.abort(new Error("human stop"));assert.deepEqual(binding.select(choice("second"),{busy:true,save:false}),{ok:true});
    await assert.rejects(pending,/human stop/);assert.equal(oldSignal!.aborted,true);
    assert.ok(ModelSelectionChanged.prototype instanceof Error);
  }finally{globalThis.fetch=original;rmSync(root,{recursive:true,force:true});}
});

test("a selected OpenRouter model supersedes stale frame model metadata without changing the direct adapter contract",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-switch-routing-"));const original=globalThis.fetch;
  try{
    const binding=createModelBinding({project:root,path:join(root,"models.json"),env:{CUESHEET_PROVIDER:"openrouter",CUESHEET_MODEL:"owner/first",OPENROUTER_API_KEY:"fixture-key"}});
    const requested:string[]=[];
    globalThis.fetch=async(_url,options)=>{requested.push(JSON.parse(String(options!.body)).model);return Response.json({choices:[{message:{content:"observed"}}]});};
    const frame={model:"stale/metadata",goal:"g",step:1,directives:[],evidence:[],capabilities:[],history:[]};
    await binding.adapter.infer(frame);
    assert.deepEqual(binding.select({provider:"openrouter",model:"owner/second"},{busy:false,save:false}),{ok:true});await binding.adapter.infer(frame);
    assert.deepEqual(requested,["owner/first","owner/second"]);assert.equal(frame.model,"stale/metadata");
  }finally{globalThis.fetch=original;rmSync(root,{recursive:true,force:true});}
});

test("durability failure preserves the previously saved defaults and removes the staged choice",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-switch-durable-"));
  try{
    const path=join(root,"models.json");writeFileSync(path,JSON.stringify(choice("first")));const before=readFileSync(path,"utf8");
    const binding=createModelBinding({project:root,path,env:{}});
    assert.ok("error" in binding.select(choice("second"),{busy:true,save:true,beforeCommit(){throw new Error("journal refused");}}));
    assert.equal(binding.selection.model,"first");assert.equal(readFileSync(path,"utf8"),before);assert.deepEqual(readdirSync(root),["models.json"]);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("a global preference commit failure after durable admission keeps the session selection and reports the separate save failure",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-switch-pref-race-"));
  try{
    const path=join(root,"models.json");const binding=createModelBinding({project:root,path,env});let recorded="";
    const result=binding.select(choice("second"),{busy:true,save:true,beforeCommit(selection){recorded=selection.model!;mkdirSync(path);}});
    assert.ok("ok" in result);assert.equal(binding.selection.model,"second");assert.equal(recorded,"second");
    if("ok" in result)assert.match(result.warning!,/préférence globale/);
    assert.deepEqual(readdirSync(root),["models.json"]);
  }finally{rmSync(root,{recursive:true,force:true});}
});
