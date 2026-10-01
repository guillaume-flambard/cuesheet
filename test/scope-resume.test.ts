import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {TerminalSession} from "../src/adapters/terminal-session.ts";
import {ShellToolRunner} from "../src/adapters/shell.ts";
import {createObjective,projectObjectives} from "../src/adapters/objectives.ts";
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
