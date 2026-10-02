import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,existsSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {TerminalSession} from "../src/adapters/terminal-session.ts";
import {ShellToolRunner} from "../src/adapters/shell.ts";
import {createObjective,projectObjectives} from "../src/adapters/objectives.ts";
import {createCompletionCheck} from "../src/adapters/surface-verification.ts";
import {createProducer} from "../apps/terminal/src/producer/index.ts";
import {persistentView} from "../apps/terminal/src/producer/session-view.ts";
async function idle(store:ReturnType<typeof persistentView>){const deadline=Date.now()+5000;while(store.get().busy&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);}

test("reopened session resumes its human bound project and preserves objective identity",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-scope-resume-"));const launch=join(root,"launch"),target=join(root,"target");mkdirSync(launch);mkdirSync(target);
 let session=new TerminalSession({root:join(root,"sessions"),cwd:launch});
 const tools=(cwd:string)=>new ShellToolRunner({allow:["node"],roots:[cwd],defaultCwd:cwd});
 try{
  let view=persistentView(session);
  const initial=createProducer({store:view,journal:session,cwd:launch,projectsRoot:root,identities:[{name:"target",path:"target",kind:"repo",status:"active",nature:"fixture",stack:"typescript",exists:true}],maxSlices:1,tools:tools(launch),toolsForScope:tools,model:{name:"fixture",async infer(){return {text:"inspected",toolCalls:[]};}}});
  initial.say("work on target");await idle(view);
  const objective=projectObjectives(session.core.toSession().events).current!;assert.equal(objective.scope,target);
  const id=session.metadata.id;session.close();session=new TerminalSession({root:join(root,"sessions"),cwd:launch,id});view=persistentView(session);
  let calls=0;
  const resumed=createProducer({store:view,journal:session,cwd:launch,identities:[],toolNames:["node"],maxSlices:1,tools:tools(launch),toolsForScope:tools,model:{name:"fixture",async infer(){return {text:"",toolCalls:++calls===1?[{name:"node",input:{argv:["node","-e","require('fs').writeFileSync('resumed.txt','same objective')"]}}]:[]};}}});
  resumed.resume!();await idle(view);
  assert.ok(calls>0,"the original bound project must be resumable from the session launch directory");
  assert.equal(existsSync(join(target,"resumed.txt")),true);assert.equal(existsSync(join(launch,"resumed.txt")),false);
  assert.equal(projectObjectives(session.core.toSession().events).current!.id,objective.id);
 }finally{session.close();rmSync(root,{recursive:true,force:true});}
});


test("resume refuses unproven other-project scopes without inference or core mutation",async()=>{
 for(const mode of ["legacy","unknown","model","mismatch","nonhuman-source"]){
  const root=mkdtempSync(join(tmpdir(),"cuesheet-scope-refused-"));const launch=join(root,"launch"),target=join(root,"target");mkdirSync(launch);mkdirSync(target);
  const session=new TerminalSession({root:join(root,"sessions"),cwd:launch});
  try{
   const source=session.core.append({kind:"note",subject:mode==="nonhuman-source"?"builder":"terminal.user",data:{text:"work"}});
   if(mode!=="legacy"){
    if(mode==="model")session.core.append({kind:"note",subject:"terminal.objective",data:{version:1,operation:"create",id:"objective-fixture",text:"work",scope:target,source:source.seq,author:"model"}});
    else createObjective(session.core,"work",mode==="mismatch"?launch:target,source.seq,undefined,mode==="unknown"?"unknown":"human");
   }
   session.core.append({kind:"goal",subject:"builder",data:{text:"work"}});
   session.core.append({kind:"effect_requested",subject:"scope-request",data:{effect:"RunAgent",cwd:target,project:"target",goal:"work"}});
   const before=session.core.revision;const store=persistentView(session);let calls=0;
   const producer=createProducer({store,journal:session,cwd:launch,identities:[],maxSlices:1,tools:new ShellToolRunner({allow:["node"],roots:[launch],defaultCwd:launch}),model:{name:"fixture",async infer(){calls++;return {text:"",toolCalls:[]};}}});
    producer.resume!();await idle(store);
    assert.equal(calls,0,mode);assert.equal(session.core.revision,before,mode);
   }finally{session.close();rmSync(root,{recursive:true,force:true});}
  }
});


test("resume never picks a confirm_check receipt as the pending intention",async()=>{
 // Reproduction of the discovered H01.3 defect: before the fix, resume treated
 // the terminal.user confirm_check receipt as an unanswered intention, minted a
 // new objective identity from it and moved the binding to a later sequence.
 const root=mkdtempSync(join(tmpdir(),"cuesheet-resume-confirm-"));const cwd=join(root,"work");mkdirSync(cwd);
 const oracle=join(cwd,"accept.mjs");writeFileSync(oracle,"await new Promise(r=>setTimeout(r,200));");
 const verification=createCompletionCheck({script:oracle,root:join(root,"proof")});const storage=join(root,"sessions");
 let session:TerminalSession|undefined;
 try{
  session=new TerminalSession({root:storage,cwd});const id=session.metadata.id;const store=persistentView(session);
  let calls=0;let finishNext=false;
  const producer=createProducer({store,cwd,journal:session,identities:[],projectsRoot:root,maxSlices:1,verification,
   tools:{async run(){throw new Error("internal check");}},
   model:{name:"resume-confirm-fixture",async infer(){calls++;return {text:"",toolCalls:(calls===1||finishNext)?[{name:"finish",input:{}}]:[]};}}});
  let off=()=>{};
  const checking=new Promise<void>(r=>{off=store.subscribe(()=>{if(store.get().entries.some(e=>e.kind==="status"&&e.label==="check"&&e.certainty==="active"))r();});});
  producer.say("original requirement");await checking;off();
  producer.say("preserve the new requirement");
  const corrected=projectObjectives(session.core.toSession().events).current!;
  producer.say(`/check confirm ${corrected.id} ${corrected.revision} ${verification.pinned!.digest}`);
  const renewed=projectObjectives(session.core.toSession().events).current!;
  assert.equal(renewed.check!.boundRevision,renewed.revision,"the receipt renews the binding on the current revision");
  const binding=renewed.check!.boundRevision;const identities=projectObjectives(session.core.toSession().events).objectives.length;
  await idle(store);
  assert.equal(session.core.toSession().evidence.length,0,"the correction keeps the goal open for resume");
  assert.equal(projectObjectives(session.core.toSession().events).current!.id,renewed.id);
  session.close();session=new TerminalSession({root:storage,cwd,id});const replay=persistentView(session);
  const frames:unknown[]=[];let resumedCalls=0;
  const resumed=createProducer({store:replay,cwd,journal:session,identities:[],projectsRoot:root,maxSlices:1,verification,
   tools:{async run(){throw new Error("internal check");}},
   model:{name:"resume-fixture",async infer(frame){frames.push(frame);resumedCalls++;return {text:"",toolCalls:[]};}}});
  resumed.resume!();await idle(replay);
  assert.ok(resumedCalls>0,"the open goal is run again on resume");
  const goalOf=(frames[0] as {goal?:string}).goal;
  assert.equal(goalOf,"original requirement","the confirm_check receipt must not be picked as the pending intention");
  const current=projectObjectives(session.core.toSession().events).current!;
  assert.equal(current.id,renewed.id,"resume keeps the original identity instead of minting a new one");
  assert.equal(current.check!.boundRevision,binding,"the binding keeps its original sequence instead of moving to a later one");
  assert.equal(projectObjectives(session.core.toSession().events).objectives.length,identities,"no new objective was appended by resume");
  const creates=session.core.toSession().events.filter(e=>e.subject==="terminal.objective"&&e.data.operation==="create").length;
  assert.equal(creates,1,"exactly one objective creation exists in the journal");
 }finally{session?.close();rmSync(root,{recursive:true,force:true});}
});
