import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { edit } from "../apps/terminal/src/components/editor.ts";
import { createStore } from "../apps/terminal/src/app/store.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";
import { ShellToolRunner } from "../src/adapters/shell.ts";
import { createCompletionCheck } from "../src/adapters/surface-verification.ts";
import { childEnv } from "./fixtures/hermetic-env.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function settled(store: ReturnType<typeof createStore>) {
  const end = Date.now() + 2000;
  while (store.get().busy && Date.now() < end) await delay(10);
  assert.equal(store.get().busy, false);
}

it("editing the middle of a sentence preserves Unicode graphemes and its suffix", () => {
  assert.deepEqual(edit("a👩‍💻b", 2, "backspace"), { text: "ab", cursor: 1 });
  assert.deepEqual(edit("aéz", 1, "delete"), { text: "az", cursor: 1 });
  assert.deepEqual(edit("abcd", 2, { insert: "X\nY" }), { text: "abX Ycd", cursor: 5 });
  assert.deepEqual(edit("abcd", 0, "left"), { text: "abcd", cursor: 0 });
});

it("cancelled inference settles immediately and its late proposal cannot execute", async () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-cancel-"));
  try {
    const store = createStore(); let release: (value: any) => void = () => {}; let calls = 0; let executions = 0;
    const producer = createProducer({ store, cwd: root, identities: [], projectsRoot: root,
      model: { name: "late", infer() { if (++calls === 1) return new Promise(resolve => { release = resolve; }); return Promise.resolve({text: "new request", toolCalls: []}); } },
      tools: { async run(request) { executions++; return { name: request.name, exit: 0, output: "" }; } },
    });
    producer.say("first"); assert.equal(store.get().busy, true);
    producer.cancel!(); await settled(store);
    producer.say("second"); await settled(store);
    release({ text: "stale answer", toolCalls: [{ name: "node", input: {} }] }); await delay(20);
    assert.equal(executions, 0);
    assert.equal(store.get().entries.some(e => e.kind === "cuesheet" && e.text === "stale answer"), false);
    assert.equal(store.get().log.some(l => l.startsWith("[evidence]")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("a pending action settles the correct row when bounded history trims during execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-history-trim-"));
  try {
    const store = createStore();
    store.send({type:"observed",entries:Array.from({length:400},()=>({kind:"status" as const,label:"old",value:"old",certainty:"unknown" as const}))});
    let release: () => void = () => {}; let ready: () => void = () => {};
    const started = new Promise<void>(resolve => { ready = resolve; });
    const producer = createProducer({store,cwd:root,identities:[],projectsRoot:root,
      model:{name:"fake",async infer(frame){return {text:"",toolCalls:frame.step===1?[{name:"cat",input:{path:"fixture"}}]:[]};}},
      tools:{async run(request){ready();await new Promise<void>(resolve=>{release=resolve;});return {name:request.name,exit:0,output:"fixture"};}}
    });
    producer.say("read"); await started; producer.say("also inspect"); release(); await settled(store);
    const actions = store.get().entries.filter(e=>e.kind==="action");
    assert.equal(actions.length,1); assert.equal(actions[0]!.certainty,"confirmed");
  } finally {rmSync(root,{recursive:true,force:true});}
});

it("cancelling a real tool stops its pending write", async () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-cancel-tool-"));
  try {
    const runner = new ShellToolRunner({ allow: ["node"], roots: [root], defaultCwd: root });
    const controller = new AbortController();
    const work = runner.run({ name: "node", input: { argv: ["node", "-e", "require('fs').writeFileSync('started','yes');setTimeout(()=>require('fs').writeFileSync('late','bad'),500)"] } }, controller.signal);
    const end = Date.now() + 1000;
    while (!existsSync(join(root,"started")) && Date.now() < end) await delay(5);
    assert.ok(existsSync(join(root,"started")));
    controller.abort(); await work; await delay(550);
    assert.equal(existsSync(join(root, "late")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("PTY: Ctrl+C cancels the model and the same terminal accepts another request", {skip: !existsSync("/usr/bin/expect")}, () => {
  const root = mkdtempSync(join(tmpdir(),"cuesheet-ux-pty-"));
  try {
    const bin=join(root,"bin");mkdirSync(bin);
    const counter=join(root,"calls");const ready=join(root,"ready");
    const stale={text:"STALE",toolCalls:[{name:"node",input:{argv:["node","-e","require('fs').writeFileSync('forbidden','bad')"]}}]};
    const fresh={text:"REPRISE_OK",toolCalls:[]};
    writeFileSync(join(bin,"opencode"),`#!${process.execPath}\nconst fs=require('fs');const file=${JSON.stringify(counter)};const n=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8'))+1:1;fs.writeFileSync(file,String(n));fs.writeFileSync(${JSON.stringify(ready)},'yes');setTimeout(()=>console.log(JSON.stringify({type:'text',part:{type:'text',text:JSON.stringify(n===1?${JSON.stringify(stale)}:${JSON.stringify(fresh)})}})),n===1?5000:0);`,{mode:0o755});
    const entry=new URL('../src/cuesheet.ts',import.meta.url).pathname;
    const driver=join(root,"drive.exp");
    writeFileSync(driver,`set stty_init {rows 30 columns 100}
match_max -d 100000
proc seen {pattern} {expect -timeout 10 -re $pattern {} timeout {catch {close};exit 8} eof {exit 9}}
proc waitms {ms} {set end [expr {[clock milliseconds]+$ms}];while {[clock milliseconds]<$end} {expect -timeout 1 -re {(?s).+} {} timeout {} eof {return}}}
spawn {${process.execPath}} {${entry}}
seen {Ctrl\\+K}
waitms 500
send "premier travail"
waitms 500
send "\\r"
set end [expr {[clock milliseconds]+10000}]
while {![file exists {${ready}}] && [clock milliseconds]<$end} {waitms 100}
if {![file exists {${ready}}]} {catch {close};exit 10}
send "\\003"
seen {Interrompu}
waitms 300
send "deuxieme travail"
waitms 500
send "\\r"
seen {REPRISE_OK}
seen {still open after 8 steps}
waitms 300
send "\\003"
after 200
catch {close}
exit 0
`);
    const env=childEnv({home:root,sessions:join(root,"sessions")});env.PATH=`${bin}:${env.PATH}`;env.TERM="xterm-256color";
    const run=spawnSync("/usr/bin/expect",[driver],{cwd:root,env,encoding:"utf8",timeout:30000});
    assert.equal(run.status,0,`${run.error??""}\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout,/REPRISE_OK/);assert.equal(existsSync(join(root,"forbidden")),false);
  } finally {rmSync(root,{recursive:true,force:true});}
});

it("cancellation during verification cannot become completion evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-cancel-check-"));
  try {
    const cwd = join(root, "work"); mkdirSync(cwd);
    const script = join(root, "check.mjs"); writeFileSync(script, "await new Promise(r=>setTimeout(r,5000));");
    const store = createStore();
    const producer = createProducer({ store, cwd, identities: [], projectsRoot: root,
      model: { name: "finish", async infer() { return { text: "", toolCalls: [{name: "finish", input: {}}] }; } },
      tools: { async run(request) { return {name: request.name,exit: 0,output: ""}; } },
      verification: createCompletionCheck({ script, root: join(root, "proof") }),
    });
    producer.say("check");
    while (!store.get().entries.some(e => e.kind === "status" && e.label === "check")) await delay(5);
    producer.cancel!(); await settled(store); await delay(100);
    assert.equal(store.get().log.some(l => l.startsWith("[evidence]")), false);
    assert.ok(store.get().entries.some(e => e.kind === "status" && e.value.includes("Interrompu")));
    assert.equal(store.get().entries.some(e => (e.kind === "status" || e.kind === "action") && e.certainty === "active"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("rendered terminal navigates wrapped history and restores a draft after recalling messages", () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-ux-render-"));
  try {
    const terminal = resolve("apps/terminal"); const script = join(root, "fixture.tsx");
    writeFileSync(join(root, "package.json"), '{"type":"module"}');
    writeFileSync(script, `import React from ${JSON.stringify(join(terminal,"node_modules/react/index.js"))};
import {render} from ${JSON.stringify(join(terminal,"node_modules/ink/build/index.js"))};
import {App} from ${JSON.stringify(join(terminal,"src/app/App.tsx"))};
import {createStore} from ${JSON.stringify(join(terminal,"src/app/store.ts"))};
import {PassThrough} from 'node:stream';
const store=createStore();store.send({type:'observed',entries:[{kind:'you',text:'alpha'},{kind:'you',text:'beta'},{kind:'cuesheet',text:'OLD_MARKER '+('old words '.repeat(100))},{kind:'cuesheet',text:('recent words '.repeat(100))+' NEWEST_MARKER'}]});
const out=new PassThrough();Object.assign(out,{columns:50,rows:18,isTTY:false});let last='';out.on('data',b=>last=b.toString());
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const app=render(<App store={store} producer={{say(t){store.send({type:'submit',text:t});},choose(){}} as any}/>,{stdout:out as any,stderr:out as any,stdin:input as any,debug:true,exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,40));await tick();
const newest=last;for(let i=0;i<20;i++){input.write('\\x1b[5~');await tick();}const oldest=last;
for(let i=0;i<20;i++){input.write('\\x1b[6~');await tick();}const live=last;
input.write('draft');await tick();input.write('\\x1b[A');await tick();const recalled=store.get().composer;
input.write('\\x1b[B');await tick();const draft=store.get().composer;
input.write('\\x1b[D');await tick();input.write('X');await tick();const edited=store.get().composer;
app.unmount();console.log(JSON.stringify({newest,oldest,live,recalled,draft,edited}));`);
    const run = spawnSync(process.execPath, [join(terminal,"node_modules/tsx/dist/cli.mjs"),script], {encoding:"utf8",timeout:20000});
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout.trim());
    assert.match(result.newest, /NEWEST_MARKER/); assert.match(result.oldest, /OLD_MARKER/); assert.match(result.live, /NEWEST_MARKER/);
    assert.equal(result.recalled, "beta"); assert.equal(result.draft, "draft"); assert.equal(result.edited, "drafXt");
  } finally { rmSync(root,{recursive:true,force:true}); }
});
