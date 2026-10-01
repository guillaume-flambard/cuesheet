import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawn} from "node:child_process";
import {SharedContexts,SharedMemoryStore,sharedScope} from "../src/adapters/shared-memory.ts";
import {withSharedContext} from "../src/adapters/shared-context.ts";
import {TerminalSession} from "../src/adapters/terminal-session.ts";
import {persistentView} from "../apps/terminal/src/producer/session-view.ts";
import {createProducer} from "../apps/terminal/src/producer/index.ts";
import {projectObjectives} from "../src/adapters/objectives.ts";
const extraction={kind:"constraint" as const,text:"old requirement",rationale:"model interpretation",sources:[{session:"model-session",seq:1}]};

test("human shared correction preserves history, refuses stale writers and old retry never resurrects",()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-shared-edit-"));const store=new SharedMemoryStore({root,scope:sharedScope("project",root)});
 try{
  const created=store.create(extraction,-1);assert.ok(!("conflict" in created));if("conflict" in created)return;
  const edit={id:created.entry.id,revision:1,operation:"edit" as const,text:"human requirement",source:{session:"human-session",seq:4}};
  const corrected=store.correct(edit,1);assert.ok(!("conflict" in corrected));
  const before=readFileSync(join(root,"context.jsonl"),"utf8");
  assert.equal(store.correct(edit,-1).reused,true);
  assert.deepEqual(store.correct({...edit,source:{session:"another-human",seq:1}},1),{conflict:true});
  assert.throws(()=>store.correct({...edit,text:"conflicting reuse"},2),/already used/);
  assert.throws(()=>store.correct({...edit,revision:2},2),/already used/);
  const old=store.create(extraction,-1);assert.ok(!("conflict" in old));if("conflict" in old)return;
  assert.equal(old.entry.text,"human requirement");assert.equal(old.entry.author,"human");assert.equal(old.entry.active,true);
  assert.equal(readFileSync(join(root,"context.jsonl"),"utf8"),before);
  const resolved=store.correct({...edit,revision:2,operation:"resolve",text:"requirement retired",source:{session:"human-session",seq:5}},2);assert.ok(!("conflict" in resolved));
  const fresh=new SharedMemoryStore({root,scope:store.scope}).read().entries[0]!;
  assert.equal(fresh.id,created.entry.id);assert.equal(fresh.originalText,extraction.text);assert.deepEqual(fresh.sources,extraction.sources);assert.equal(fresh.active,false);assert.equal(fresh.corrections.length,2);
  assert.equal(store.correct(edit,1).entry.active,false,"retry of the older human edit does not undo the later resolution");
  const retry=store.create(extraction,1);assert.ok(!("conflict" in retry));if(!("conflict" in retry))assert.equal(retry.entry.active,false);
  const path=join(root,"context.jsonl");const rows=readFileSync(path,"utf8").trim().split("\n").map(line=>JSON.parse(line));rows[2].data.expectedItem=1;const corrupt=rows.map(row=>JSON.stringify(row)).join("\n")+"\n";writeFileSync(path,corrupt);
  assert.throws(()=>store.read(),/Invalid shared context/);assert.equal(readFileSync(path,"utf8"),corrupt);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("compaction preserves active human shared memories, excludes resolved history and refuses impossible budget",()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-shared-human-frame-"));
 try{
  const contexts=new SharedContexts({cwd:root});const made=contexts.project.create(extraction,-1);assert.ok(!("conflict" in made));if("conflict" in made)return;
  contexts.project.correct({id:made.entry.id,revision:1,operation:"edit",text:"HUMAN_MUST_REMAIN",source:{session:"owner",seq:2}},1);
  for(let i=0;i<100;i++)contexts.project.create({...extraction,text:"optional "+i+"x".repeat(1000),sources:[{session:"model-session",seq:i+2}]},contexts.project.read().revision);
  const frame={goal:"feature",history:[],directives:[],evidence:[],capabilities:[],model:"unset",step:1};const session=new TerminalSession({root:join(root,"sessions"),cwd:root});
  try{
   const snapshot=contexts.read(),before=JSON.stringify(snapshot);const result=withSharedContext(frame,session.core.toSession(),{maxChars:7000,sharedContexts:snapshot});
   assert.match(JSON.stringify(result),/HUMAN_MUST_REMAIN/);assert.equal(JSON.stringify(snapshot),before);assert.ok(JSON.stringify(result).length<=7000);
   contexts.project.correct({id:made.entry.id,revision:2,operation:"resolve",text:"RESOLVED_ONLY_HISTORY",source:{session:"owner",seq:3}},contexts.project.read().revision);
   assert.doesNotMatch(JSON.stringify(withSharedContext(frame,session.core.toSession(),{maxChars:7000,sharedContexts:contexts.read()})),/RESOLVED_ONLY_HISTORY/);
   const large=contexts.project.create({...extraction,text:"z".repeat(3900),sources:[{session:"large",seq:1}]},contexts.project.read().revision);assert.ok(!("conflict" in large));if("conflict" in large)return;
   contexts.project.correct({id:large.entry.id,revision:large.entry.revision,operation:"edit",text:"H".repeat(3900),source:{session:"owner",seq:4}},contexts.project.read().revision);
   assert.throws(()=>withSharedContext(frame,session.core.toSession(),{maxChars:4000,sharedContexts:contexts.read()}),/exceed the context budget/);
  }finally{session.close();}
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("human terminal correction stales pending inference and cannot mutate mounted company context",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-shared-human-terminal-"));const cwd=join(root,"work");mkdirSync(cwd);
 const org=new SharedMemoryStore({root:join(root,"company"),scope:sharedScope("organization",join(root,"company"))});const company=org.create({...extraction,sources:[{session:"company",seq:1}]},-1);assert.ok(!("conflict" in company));
 const contexts=new SharedContexts({cwd,organizations:[org.root]});const made=contexts.project.create(extraction,-1);assert.ok(!("conflict" in made));
 const journal=new TerminalSession({root:join(root,"sessions"),cwd});
 try{
  if("conflict" in made || "conflict" in company)return;
  const store=persistentView(journal);let release!:()=>void,ready!:()=>void;const waiting=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r);let calls=0,effects=0,fresh="";
  const producer=createProducer({store,journal,cwd,sharedContexts:contexts,identities:[],maxSlices:1,tools:{async run(request){effects++;return {name:request.name,exit:0,output:"unexpected"};}},model:{name:"fixture",async infer(frame){if(++calls===1){ready();await gate;return {text:"stale",toolCalls:[{name:"node",input:{argv:["node","obsolete"]}}]};}fresh=JSON.stringify(frame);return {text:"",toolCalls:[]};}}});
  producer.say("deliver current requirement");await waiting;const objective=projectObjectives(journal.core.toSession().events).current!.id;
  producer.say(`/context edit ${made.entry.id} 1 updated by human`);release();
  const deadline=Date.now()+5000;while(store.get().busy&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.equal(store.get().busy,false);assert.equal(effects,0);assert.match(fresh,/updated by human/);assert.equal(projectObjectives(journal.core.toSession().events).current!.id,objective);
  const corrected=contexts.project.read().entries[0]!;assert.equal(corrected.author,"human");const source=journal.core.toSession().events.find(e=>e.subject==="terminal.user"&&e.data.operation==="shared_context")!;
  assert.deepEqual(corrected.corrections[0]!.source,{session:journal.metadata.id,seq:source.seq});
  const bytes=readFileSync(join(org.root,"context.jsonl"),"utf8");producer.say(`/context resolve ${company.entry.id} 1 forbidden company edit`);
  assert.equal(readFileSync(join(org.root,"context.jsonl"),"utf8"),bytes);
  assert.equal(projectObjectives(journal.core.toSession().events).current!.id,objective);
  const prior=journal.core.toSession().events.filter(e=>e.subject==="terminal.objective"&&e.data.operation==="create").length;producer.resume!();while(store.get().busy&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.equal(journal.core.toSession().events.filter(e=>e.subject==="terminal.objective"&&e.data.operation==="create").length,prior,"human control command never becomes a new objective on resume");
  assert.equal(projectObjectives(journal.core.toSession().events).current!.id,objective);
  assert.equal(journal.core.toSession().events.filter(e=>e.kind==="goal").at(-1)!.data.text,"deliver current requirement");
 }finally{journal.close();rmSync(root,{recursive:true,force:true});}
});

test("two actual human writers on the same revision serialize one correction and one conflict",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-shared-edit-race-"));const scope=sharedScope("project",root);const store=new SharedMemoryStore({root,scope});const created=store.create(extraction,-1);assert.ok(!("conflict" in created));
 const children:ReturnType<typeof spawn>[]=[];
 try{
  if("conflict" in created)return;
  const module=resolve("src/adapters/shared-memory.ts");
  const code=`import {SharedMemoryStore} from ${JSON.stringify(module)};const store=new SharedMemoryStore({root:${JSON.stringify(root)},scope:${JSON.stringify(scope)}});const base=store.read().revision;console.log("READY");await new Promise(r=>process.stdin.once("data",r));console.log(JSON.stringify(store.correct({id:${JSON.stringify(created.entry.id)},revision:1,operation:"edit",text:process.argv[1],source:{session:process.argv[1],seq:1}},base)));`;
  const launch=(name:string)=>{
   const child=spawn(process.execPath,["--input-type=module","-e",code,name],{stdio:["pipe","pipe","pipe"]});children.push(child);let output="",errors="";let readyResolve!:()=>void;
   const ready=new Promise<void>(r=>readyResolve=r);child.stdout!.on("data",chunk=>{output+=String(chunk);if(output.includes("READY"))readyResolve();});child.stderr!.on("data",chunk=>errors+=String(chunk));
   const done=new Promise<{conflict?:boolean;entry?:unknown}>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("shared correction writer timeout"));},10000);child.on("exit",status=>{clearTimeout(timer);if(status!==0)reject(new Error(errors));else resolve(JSON.parse(output.trim().split("\n").at(-1)!));});});
   return {child,ready,done};
  };
  const a=launch("human-a"),b=launch("human-b");await Promise.all([a.ready,b.ready]);a.child.stdin!.end("go");b.child.stdin!.end("go");const results=await Promise.all([a.done,b.done]);
  assert.equal(results.filter(result=>result.conflict).length,1);assert.equal(results.filter(result=>result.entry).length,1);const fresh=store.read();assert.equal(fresh.revision,2);assert.equal(fresh.entries[0]!.corrections.length,1);assert.equal(fresh.entries[0]!.author,"human");
 }finally{for(const child of children)if(child.exitCode===null)child.kill("SIGKILL");rmSync(root,{recursive:true,force:true});}
});
