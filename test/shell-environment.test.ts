import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalSession } from "../src/adapters/terminal-session.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";
import { persistentView } from "../apps/terminal/src/producer/session-view.ts";
import { ShellToolRunner } from "../src/adapters/shell.ts";

it("actual tool process cannot read harness credentials or model environment overrides", async () => {
  const root=mkdtempSync(join(tmpdir(),"cuesheet-tool-env-"));
  const keys=["ANTHROPIC_API_KEY","OPENAI_API_KEY","OPENROUTER_API_KEY","CUESHEET_API_KEY","BRAVE_SEARCH_API_KEY"];
  const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:root,HTTPS_PROXY:"http://fixture.invalid",BUILD_TARGET:"local",NO_COLOR:"0"};
  for(const key of keys){env[key]="synthetic-fixture";env[key.toLowerCase()]="synthetic-fixture";}
  const runner=new ShellToolRunner({allow:["node"],roots:[root],defaultCwd:root,env});
  env.BUILD_TARGET="changed-after-admission";
  try {
    const result=await runner.run({name:"node",input:{env:{CUESHEET_API_KEY:"model-injection",BUILD_TARGET:"model"},argv:["node","-e",`console.log(JSON.stringify({keys:Object.keys(process.env).filter(k=>${JSON.stringify(keys)}.includes(k.toUpperCase())),home:process.env.HOME,build:process.env.BUILD_TARGET,proxy:process.env.HTTPS_PROXY,color:process.env.NO_COLOR}))`]}});
    assert.equal(result.exit,0);
    assert.deepEqual(JSON.parse(result.output),{keys:[],home:root,build:"local",proxy:"http://fixture.invalid",color:"1"});
    assert.equal(result.output.includes("synthetic-fixture"),false);
    assert.equal(result.output.includes("model-injection"),false);
    assert.equal(env.CUESHEET_API_KEY,"synthetic-fixture");
  } finally {rmSync(root,{recursive:true,force:true});}
});

it("default runner snapshots process environment without changing provider credentials", async () => {
  const root=mkdtempSync(join(tmpdir(),"cuesheet-env-default-"));
  const prior=process.env.CUESHEET_API_KEY;
  process.env.CUESHEET_API_KEY="synthetic-fixture-only";
  try {
    const runner=new ShellToolRunner({allow:["node"],roots:[root],defaultCwd:root});
    const result=await runner.run({name:"node",input:{argv:["node","-e","console.log(process.env.CUESHEET_API_KEY ? 'EXPOSED' : 'ABSENT')"]}});
    assert.equal(result.exit,0); assert.equal(result.output.trim(),"ABSENT");
    assert.equal(process.env.CUESHEET_API_KEY,"synthetic-fixture-only");
  } finally {if(prior===undefined) delete process.env.CUESHEET_API_KEY; else process.env.CUESHEET_API_KEY=prior;rmSync(root,{recursive:true,force:true});}
});


it("tool observation persisted by the producer contains no inherited provider credential", async () => {
  const root=mkdtempSync(join(tmpdir(),"cuesheet-env-journal-"));
  const session=new TerminalSession({root:join(root,"sessions"),cwd:root});
  try {
    const store=persistentView(session);let calls=0;
    const producer=createProducer({store,journal:session,cwd:root,identities:[],toolNames:["node"],maxSlices:1,
      tools:new ShellToolRunner({allow:["node"],roots:[root],defaultCwd:root,env:{PATH:process.env.PATH,CUESHEET_API_KEY:"synthetic-journal-secret"}}),
      model:{name:"env-fixture",async infer(){return {text:"",toolCalls:++calls===1?[{name:"node",input:{argv:["node","-e","console.log(process.env.CUESHEET_API_KEY || 'NO_HARNESS_CREDENTIAL')"]}}]:[]};}}});
    producer.say("inspect tool environment");
    const deadline=Date.now()+5000;while(store.get().busy&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(store.get().busy,false);
    const events=session.core.toSession().events;
    assert.ok(events.some(event=>event.kind==="observation"&&JSON.stringify(event.data).includes("NO_HARNESS_CREDENTIAL")));
    assert.equal(JSON.stringify(events).includes("synthetic-journal-secret"),false);
  } finally {session.close();rmSync(root,{recursive:true,force:true});}
});
