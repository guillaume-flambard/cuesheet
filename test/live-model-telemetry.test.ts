import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BinaryModelAdapter,type ModelStreamProgress} from "../src/adapters/binary-model.ts";
import {derive,emptySurface} from "../apps/terminal/src/app/state.ts";
import {telemetryText} from "../apps/terminal/src/components/telemetry-text.ts";
import type {ContextFrame} from "../src/core/loop.ts";

const frame:ContextFrame={goal:"respond",model:"unset",step:1,history:[],directives:[],evidence:[],capabilities:[]};

test("live NDJSON exposes only safe phases and reported usage before process finishes",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-telemetry-"));
 try{
   const binary=join(root,"model");
   writeFileSync(binary,"#!"+process.execPath+"\n"+
     'const events=[{type:"step_start",part:{type:"step-start"}},{type:"reasoning",part:{type:"reasoning",text:"PRIVATE TRACE"}},{type:"text",part:{type:"text",text:JSON.stringify({text:"ok",toolCalls:[]})}},{type:"step_finish",part:{type:"step-finish",tokens:{total:19,input:15,output:4},cost:0.0012}}];\n'+
     'let i=0;const timer=setInterval(()=>{if(i===events.length){clearInterval(timer);setTimeout(()=>process.exit(0),220);return} process.stdout.write(JSON.stringify(events[i++])+"\\n");},65);\n');
   chmodSync(binary,0o700);
   const updates:ModelStreamProgress[]=[];
   const adapter=new BinaryModelAdapter({binary,project:root,onProgress:p=>updates.push(p)});
   let finished=false;
   const work=adapter.infer(frame).finally(()=>{finished=true;});
   const until=Date.now()+3000;
   while(!updates.some(p=>p.kind==="response") && Date.now()<until)
     await new Promise(resolve=>setTimeout(resolve,25));
   assert.equal(finished,false,"streaming phases must precede final inference response");
   assert.ok(updates.some(p=>p.kind==="reasoning"),"reasoning metadata arrives before process exit");
   assert.ok(updates.some(p=>p.kind==="response"),"response metadata arrives before process exit");
   const reply=await work;
   assert.equal(reply.text,"ok");
   assert.deepEqual(updates.map(p=>p.kind),["started","reasoning","response","usage"]);
   assert.deepEqual(updates.at(-1),{kind:"usage",input:15,output:4,tokens:19,cost:0.0012});
   assert.ok(!JSON.stringify(updates).includes("PRIVATE TRACE"),"never forward model thought text to UI");
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("UI differentiates missing metrics from recorded zero and sums only reported steps",()=>{
 let state=emptySurface;
 const send=(progress:Parameters<typeof derive>[1] & {type:"model-progress"})=>{
   state=derive(state,progress);
 };
 send({type:"model-progress",progress:{kind:"started"}});
 send({type:"model-progress",progress:{kind:"reasoning"}});
 assert.equal(state.telemetry.phase,"raisonnement");
 assert.match(telemetryText(state.telemetry),/jetons — · coût —/);
 send({type:"model-progress",progress:{kind:"response"}});
 send({type:"model-progress",progress:{kind:"usage",input:100,output:20,tokens:120,cost:0}});
 assert.equal(state.telemetry.phase,"réponse");
 assert.match(telemetryText(state.telemetry),/in 100 · out 20 · coût \$0\.0000/);
 send({type:"model-progress",progress:{kind:"started"}});
 send({type:"model-progress",progress:{kind:"usage",input:null,output:3,tokens:null,cost:null}});
 assert.equal(state.telemetry.requests,2);
 assert.equal(state.telemetry.steps,2);
 assert.match(telemetryText(state.telemetry),/in \? · out 23 · coût \?/);
 state=derive(state,{type:"ended"});
 assert.equal(state.telemetry.phase,"terminé");
});
