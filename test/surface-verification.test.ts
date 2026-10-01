import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCompletionCheck } from "../src/adapters/surface-verification.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";
import { createStore } from "../apps/terminal/src/app/store.ts";
import { ShellToolRunner } from "../src/adapters/shell.ts";
import { ResearchTools } from "../src/adapters/research-tools.ts";
import { SkillTools } from "../src/adapters/skill-tools.ts";
import { capture } from "../src/adapters/artifact-capture.ts";
import type { ModelAdapter } from "../src/core/loop.ts";

function world(script: string) {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-completion-"));
  const workspace = join(root, "work"); mkdirSync(workspace);
  const oracle = join(workspace, "accept.mjs"); writeFileSync(oracle, script);
  return { root, workspace, oracle, storage: join(root, "proof"), clean: () => rmSync(root, { recursive: true, force: true }) };
}
const accepted = `import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; assert.equal(readFileSync("answer.txt","utf8"),"42");`;
async function idle(store: ReturnType<typeof createStore>) {
  const until = Date.now() + 5000;
  while (store.get().busy && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
  assert.equal(store.get().busy, false, "run settled within the test budget");
}
function rig(w: ReturnType<typeof world>, model: ModelAdapter, timeoutMs = 1000) {
  const store = createStore();
  const verification = createCompletionCheck({ script: w.oracle, root: w.storage, timeoutMs });
  const producer = createProducer({ store, model, tools: new ShellToolRunner({ allow: ["node"], roots: [w.workspace], defaultCwd: w.workspace }), toolNames: ["node"], cwd: w.workspace, identities: [], projectsRoot: w.root, verification });
  return { producer, store, verification };
}

it("surface: real work, frozen artifact, pinned independent check and evidence close the goal", async () => {
  const w = world(accepted);
  try {
    const { producer, store } = rig(w, { name: "scripted", async infer(frame) {
      if (frame.step === 1) return { text: "I fixed it", toolCalls: [{ name: "node", input: { argv: ["node", "-e", `require('fs').writeFileSync('answer.txt','42')`] } }] };
      return { text: "Please check", toolCalls: [{ name: "finish", input: { script: "process.exit(0)" } }, { name: "node", input: { argv: ["node", "-e", `require('fs').writeFileSync('answer.txt','bad')`] } }] };
    } });
    producer.say("produce answer.txt containing 42"); await idle(store);
    assert.equal(readFileSync(join(w.workspace, "answer.txt"), "utf8"), "42", "no writes execute after verified completion");
    assert.ok(store.get().log.some((l) => l.startsWith("[work_produced]")));
    const row = store.get().log.find((l) => l.startsWith("[work_verified]"))!;
    const data = JSON.parse(row.slice(row.indexOf("{")));
    const record = JSON.parse(readFileSync(data.record, "utf8"));
    assert.equal(record.verification.verdict, "VERIFIED");
    assert.equal(record.verification.target.artifactDigest, record.artifact.digest);
    assert.equal(readFileSync(join(record.artifact.location, "answer.txt"), "utf8"), "42");
    assert.ok(store.get().log.some((l) => l.startsWith("[evidence]")));
    assert.ok(store.get().entries.some((e) => e.kind === "status" && e.label === "work" && e.certainty === "confirmed"));
  } finally { w.clean(); }
});

it("a model cannot weaken the check by rewriting its source or passing another command to finish", async () => {
  const w = world(accepted);
  try {
    const { producer, store } = rig(w, { name: "liar", async infer(frame) {
      if (frame.step === 1) return { text: "tests pass", toolCalls: [{ name: "node", input: { argv: ["node", "-e", `require('fs').writeFileSync('accept.mjs','process.exit(0)');require('fs').writeFileSync('answer.txt','wrong')`] } }] };
      return { text: "done", toolCalls: frame.step === 2 ? [{ name: "finish", input: { command: "true" } }] : [] };
    } });
    producer.say("produce answer.txt containing 42"); await idle(store);
    assert.ok(store.get().log.some((l) => l.includes('"verdict":"REJECTED"')));
    assert.equal(store.get().log.some((l) => l.startsWith("[evidence]")), false);
    assert.ok(store.get().entries.some((e) => e.kind === "status" && e.label === "work" && e.certainty === "unknown"));
  } finally { w.clean(); }
});

it("a correction during asynchronous verification lands immediately and keeps the goal open", async () => {
  const w = world('await new Promise(r=>setTimeout(r,200));');
  try {
    const { producer, store } = rig(w, { name: "scripted", async infer(frame) { return { text: "", toolCalls: frame.step === 1 ? [{ name: "finish", input: {} }] : [] }; } });
    let unsubscribe = () => {};
    const checking = new Promise<void>((resolve) => {
      unsubscribe = store.subscribe(() => {
        if (store.get().entries.some(e => e.kind === "status" && e.label === "check" && e.certainty === "active")) resolve();
      });
    });
    producer.say("first request");
    await checking; unsubscribe();
    assert.ok(store.get().busy);
    producer.say("use the new requirement instead");
    assert.ok(store.get().entries.some((e) => e.kind === "you" && e.text === "use the new requirement instead"));
    await idle(store);
    assert.ok(store.get().log.some((l) => l.includes('"verdict":"VERIFIED"')));
    assert.equal(store.get().log.some((l) => l.startsWith("[evidence]")), false);
  } finally { w.clean(); }
});

it("timeout and mutated capture produce INCONCLUSIVE rather than goal closure", async () => {
  for (const script of ['await new Promise(r=>setTimeout(r,10000));', `import {writeFileSync} from 'node:fs'; writeFileSync('extra.txt','changed');`]) {
    const w = world(script);
    try {
      const check = createCompletionCheck({ script: w.oracle, root: w.storage, timeoutMs: 80 });
      const result = await check.verify(w.workspace, "E-test");
      assert.equal(result.verification.verdict, "INCONCLUSIVE");
      assert.ok(existsSync(result.record));
    } finally { w.clean(); }
  }
});

it("capture excludes environment files and ignored directories from both stored bytes and digest coverage", () => {
  const w = world('process.exit(0)');
  try {
    writeFileSync(join(w.workspace, '.env'), 'synthetic fixture');
    mkdirSync(join(w.workspace, 'node_modules')); writeFileSync(join(w.workspace,'node_modules','ignored'), 'fixture');
    const artifact = capture({ sessionId: 'test', effectId: 'E-one', workspace: w.workspace, root: w.storage });
    assert.equal(existsSync(join(artifact.location, '.env')), false);
    assert.equal(existsSync(join(artifact.location, 'node_modules')), false);
    assert.equal(artifact.covers.includes('.env'), false);
  } finally { w.clean(); }
});

it("without a declared check, a finish claim cannot close a goal", async () => {
  const w = world(accepted);
  try {
    const store = createStore();
    const producer = createProducer({ store, cwd: w.workspace, projectsRoot: w.root, identities: [], model: { name: 'liar', async infer() { return { text: 'done', toolCalls: [{name:'finish',input:{}}] }; } }, tools: { async run() { throw new Error('finish must not reach the generic runner'); } } });
    producer.say('produce answer.txt containing 42'); await idle(store);
    assert.equal(store.get().log.some(l=>l.startsWith('[evidence]')), false);
  } finally { w.clean(); }
});

it("research and installed skills reach subsequent inference before real work is independently verified", async () => {
  const w = world(accepted);
  try {
    const skillsRoot=join(w.root,"skills");mkdirSync(skillsRoot);mkdirSync(join(skillsRoot,"answer"));
    writeFileSync(join(skillsRoot,"answer","SKILL.md"),"---\nname: answer-procedure\n---\nUse the configured acceptance check.");
    const store=createStore();let reads=0;let sourced=false;
    const producer=createProducer({store,cwd:w.workspace,projectsRoot:w.root,identities:[],toolNames:["node"],
      skills:new SkillTools({roots:[skillsRoot]}),
      research:new ResearchTools({read:async()=>{reads++;return {status:200,contentType:"text/plain",body:"The documented answer is 42."};}}),
      verification:createCompletionCheck({script:w.oracle,root:w.storage}),
      tools:new ShellToolRunner({allow:["node"],roots:[w.workspace],defaultCwd:w.workspace}),
      model:{name:"scripted integration",async infer(frame){
        if(frame.step===1)return {text:"",toolCalls:[{name:"list_skills",input:{}},{name:"read_skill",input:{name:"answer-procedure"}},{name:"read_document",input:{url:"https://docs.example.com/answer"}}]};
        if(frame.step===2){
          const snapshot=frame.directives.at(-1)!.text;
          assert.match(snapshot,/answer-procedure/);assert.match(snapshot,/docs\.example\.com/);
          assert.ok(frame.history.some(e=>e.subject==="terminal.research"&&e.data.text==="The documented answer is 42."));
          assert.ok(frame.history.some(e=>e.subject==="terminal.skill"));sourced=true;
          return {text:"",toolCalls:[{name:"node",input:{argv:["node","-e","require('fs').writeFileSync('answer.txt','42')"]}}]};
        }
        return {text:"",toolCalls:[{name:"finish",input:{}}]};
      }}
    });
    producer.say("Read the documented answer and installed procedure, then produce answer.txt");await idle(store);
    assert.equal(reads,1);assert.equal(sourced,true);
    assert.equal(readFileSync(join(w.workspace,"answer.txt"),"utf8"),"42");
    assert.ok(store.get().log.some(l=>l.startsWith("[evidence]")),"closure requires the independent artifact check");
  } finally { w.clean(); }
});

it("a real task requiring more than eight inferences continues within the same objective",async()=>{
  const w=world(accepted);
  try{
    const steps:number[]=[];
    const {producer,store}=rig(w,{name:"long task",async infer(frame){
      steps.push(frame.step);
      return {text:"",toolCalls:frame.step<=9 ? [{name:"node",input:{argv:["node","-e",`require('fs').writeFileSync('answer.txt',${JSON.stringify(frame.step===9 ? "42" : "pending")});console.log(${frame.step})`]}}] : [{name:"finish",input:{}}]};
    }});
    producer.say("complete a task with nine necessary steps");await idle(store);
    assert.deepEqual(steps,[1,2,3,4,5,6,7,8,9,10]);
    assert.ok(store.get().log.some(l=>l.startsWith("[evidence]")));
    assert.equal(readFileSync(join(w.workspace,"answer.txt"),"utf8"),"42");
  }finally{w.clean();}
});
