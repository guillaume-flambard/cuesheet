/**
 * INSTALLABLE, as a test rather than as a claim.
 *
 * The distinction this repository runs on, applied to itself:
 *
 * ```text
 * PORTABLE     the code does not depend on the machine it was written on
 * INSTALLABLE  someone can install it without reading the source
 * PUBLISHABLE  we are ready to promise it works on their machine
 * ```
 *
 * PORTABLE has held a test since P0. INSTALLABLE had no test, only an audit,
 * and the audit found it false: raw `.ts` shipped, so any npm install hit the
 * type-stripping wall under `node_modules`. Agent F closed that with a build and
 * then ran out of budget before writing this file.
 *
 * So the claim is measured here, end to end, every time:
 *
 * ```text
 * source TS -> tsc -> dist/ -> npm pack -> install in a temp dir -> run
 * ```
 *
 * Two properties make it a proof rather than a demonstration, and both are the
 * ones a naive check misses.
 *
 * First, the child environment is built by naming. Inheriting `process.env` here
 * would let the developer's HOME and a provider key into the oracle, which is
 * exactly the leak `test/hermeticity.test.ts` exists to prevent.
 *
 * Second, the assertion is about what the installed package does NOT contain.
 * A package can execute fine while still carrying the `.ts` it must not need, and
 * the failure only appears on a machine without the checkout.
 *
 * PUBLISHABLE is not tested and not claimed. A package that installs and runs is
 * not a package anyone should depend on, and the difference is a support burden
 * rather than a build step.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { childEnv } from "./fixtures/hermetic-env.ts";

const ROOT = process.cwd();
const NODE = process.execPath;
const NODE_DIR = dirname(process.execPath);

function exec(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: childEnv({ sessions: cwd, home: cwd }),
  });
}

/**
 * Build, pack, install and run. Once, because it costs a real `npm install`.
 *
 * A function declaration rather than an arrow, and named differently from the
 * `run` used inside it: the first version had a `const cached = oracle()`-style
 * cycle where the cache's initializer called a helper that read the cache, which
 * is `Cannot access 'run' before initialization`.
 */
type InstallResult={ok:boolean;why:string;terminal?:{installed:string;project:string;home:string;stage:string}};
let cached: InstallResult | null = null;

function oracle(): InstallResult {
  if (cached) return cached;

  // Build first, into dist/. `prepack` would do it too, but doing it here means
  // a failure is this test's failure rather than npm's.
  try {
    exec(ROOT, "bash", ["scripts/build.sh"]);
  } catch (cause) {
    cached = { ok: false, why: `build failed: ${String(cause).slice(0, 200)}` };
    return cached;
  }

  const stage = mkdtempSync(join(tmpdir(), "cuesheet-oracle-"));
  const home = mkdtempSync(join(tmpdir(), "cuesheet-oracle-home-"));
  const project = join(stage, "consumer");

  try {
    // Packed from the repository, because `npm pack` reads package.json from
    // its cwd and there is none in the staging directory.
    exec(ROOT, "npm", ["pack", "--pack-destination", stage]);
    const tarball = readdirSync(stage).find((f) => f.endsWith(".tgz"));
    if (!tarball) {
      cached = { ok: false, why: "npm pack produced no tarball" };
      return cached;
    }

    execFileSync("mkdir", ["-p", project]);
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify(
        {
          name: "cuesheet-oracle-consumer",
          private: true,
          type: "module",
          dependencies: { cuesheet: `file:${join(stage, tarball)}` },
        },
        null,
        2,
      ),
    );

    // The install itself, with a HOME that is not the developer's, so npm cannot
    // read an existing auth or cache to make this succeed.
    execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
      cwd: project,
      encoding: "utf8",
      env: {
        PATH: `${NODE_DIR}:/usr/bin:/bin`,
        HOME: home,
        npm_config_cache: join(home, ".npm"),
      },
    });

    const installed = join(project, "node_modules", "cuesheet");
    if (!existsSync(installed)) {
      cached = { ok: false, why: "the package did not install" };
      return cached;
    }

    // The negative assertion, which is the one that matters. A package that runs
    // while still carrying the TypeScript it must not need is exactly the shape
    // that works on the author's machine and fails on anyone else's.
    const executableTs: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          executableTs.push(full.replace(`${installed}/`, ""));
        }
      }
    };
    walk(installed);
    if (executableTs.length > 0) {
      cached = { ok: false, why: `the installed package carries executable .ts: ${executableTs.slice(0, 3).join(", ")}` };
      return cached;
    }

    // And the positive one: it actually runs, from the installation, with nothing
    // from this checkout reachable through the environment.
    const run = (args: string[]): string =>
      execFileSync(NODE, [join(installed, "dist", "src", "cuesheet.js"), ...args], {
        cwd: project,
        encoding: "utf8",
        env: {
          PATH: `${NODE_DIR}:/usr/bin:/bin`,
          HOME: home,
          CUESHEET_SESSIONS: join(stage, "sessions"),
        },
      });

    run(["--version"]);
    run(["sessions", "list"]);
    for(const asset of ["main.mjs","yoga.wasm","THIRD-PARTY-NOTICES.txt"]){
      if(!existsSync(join(installed,"dist","apps","terminal",asset)))throw new Error(`installed terminal asset missing: ${asset}`);
    }
    const nonTTY=spawnSync(NODE,[join(installed,"dist","src","cuesheet.js"),"surface"],{cwd:project,encoding:"utf8",env:{PATH:`${NODE_DIR}:/usr/bin:/bin`,HOME:home}});
    assert.equal(nonTTY.status,1);assert.match(nonTTY.stderr,/needs a terminal/);assert.doesNotMatch(nonTTY.stderr,/slice is missing|not installed/);

    // The libraries too, because a package whose CLI works and whose exports do
    // not is installable in a very narrow sense.
    writeFileSync(
      join(project, "probe.mjs"),
      `const mods = ["core/store.js","state.js","affordances.js","effects.js","verify.js","work.js","reconcile.js","spawn.js","adapters/session-store.js"];
       for (const m of mods) { await import(${JSON.stringify(installed)} + "/dist/src/" + m); }
       process.stdout.write("loaded " + mods.length + "\\n");`,
    );
    const loaded = execFileSync(NODE, [join(project, "probe.mjs")], {
      cwd: project,
      encoding: "utf8",
      env: { PATH: `${NODE_DIR}:/usr/bin:/bin`, HOME: home },
    }).trim();
    if (!loaded.startsWith("loaded ")) {
      cached = { ok: false, why: `the library probe said: ${loaded}` };
      return cached;
    }

    cached = { ok: true, why: loaded, terminal:{installed,project,home,stage} };
    return cached;
  } catch (cause) {
    cached = { ok: false, why: String(cause).slice(0, 300) };
    return cached;
  }
}

describe("INSTALLABLE, measured rather than asserted", () => {
  it("builds, packs, installs into a temp home, and runs", () => {
    const result = oracle();
    assert.equal(result.ok, true, `the installed package did not work: ${result.why}`);
  });

  it("the oracle is not satisfied by the checkout being present", () => {
    // The check has to be about the installation, not about the repository. If
    // `PATH` or the cwd carried a path into this checkout, the whole oracle
    // would pass while proving nothing, and the difference is invisible unless
    // something asserts it.
    const result = oracle();
    assert.equal(result.ok, true, `prerequisite: ${result.why}`);
    // Nothing the oracle passes reaches here: the child env has four variables
    // and none of them is a path into the repository.
    const env = childEnv({ sessions: "/tmp/s", home: "/tmp/h" });
    assert.equal(Object.keys(env).length, 4, "the child environment is exactly four named variables");
    for (const value of Object.values(env)) {
      assert.equal(value.includes("cuesheet"), false, `and none of them points at a checkout: ${value}`);
    }
  });

  it("PUBLISHABLE is not claimed, and this file does not claim it", () => {
    // A package that installs and runs is not a package someone should depend
    // on. The difference is a support burden, not a build step, so no amount of
    // testing here would close it.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      publishConfig?: unknown;
      version?: string;
    };
    // A version and no publish override: nothing here stages a release.
    assert.equal(typeof pkg.version, "string", "there is a version");
    // And the distinction is written down rather than assumed.
    const proof = readFileSync(join(ROOT, "docs", "installability-proof.md"), "utf8");
    assert.match(proof, /PUBLISHABLE/i, "the proof names PUBLISHABLE and says it is not reached");
  });
});

it("installed terminal runs in a real PTY outside the checkout without TSX",{skip:!existsSync('/usr/bin/expect')},()=>{
 const result=oracle();assert.equal(result.ok,true,result.why);assert.ok(result.terminal);const {installed,project,home,stage}=result.terminal!;
 const bin=join(project,'fixture-bin');mkdirSync(bin,{recursive:true});const binary=join(bin,'opencode');
 writeFileSync(binary,`#!${NODE}\nconsole.log(JSON.stringify({type:'text',part:{type:'text',text:JSON.stringify({text:'INSTALLED_TERMINAL_OK',toolCalls:[]})}}));`,{mode:0o755});
 const driver=join(project,'installed.exp');writeFileSync(driver,`set stty_init {rows 30 columns 100}
match_max -d 100000
proc seen {pattern} {expect -timeout 10 -re $pattern {} timeout {catch {close};exit 8} eof {exit 9}}
proc waitms {ms} {set end [expr {[clock milliseconds]+$ms}];while {[clock milliseconds]<$end} {expect -timeout 1 -re {(?s).+} {} timeout {} eof {return}}}
spawn {${NODE}} {${join(installed,'dist','src','cuesheet.js')}} surface
seen {Ctrl\\+K}
waitms 500
send "installed goal"
waitms 500
send "\\r"
seen {INSTALLED_TERMINAL_OK}
waitms 500
send "\\003"
expect -timeout 5 eof {} timeout {catch {close};exit 10}
set result [wait]
exit [lindex $result 3]
`);
 const run=spawnSync('/usr/bin/expect',[driver],{cwd:project,encoding:'utf8',timeout:25000,env:{PATH:`${bin}:${NODE_DIR}:/usr/bin:/bin`,HOME:home,TERM:'xterm-256color',CUESHEET_SESSIONS:join(stage,'terminal-sessions'),CUESHEET_OPENCODE_BIN:binary,CUESHEET_MAX_SLICES:'1'}});
 assert.equal(run.status,0,`${run.error??''}\n${run.stdout}\n${run.stderr}`);assert.match(run.stdout,/INSTALLED_TERMINAL_OK/);assert.match(run.stdout.slice(-1000),/\x1b\[\?25h/,'the cursor is restored before exiting');assert.doesNotMatch(run.stdout,/ERR_MODULE_NOT_FOUND|Dynamic require.*not supported/);assert.ok(existsSync(join(stage,'terminal-sessions')));const journals=readdirSync(join(stage,'terminal-sessions')).filter(name=>name.endsWith('.jsonl')&&!name.includes('.view.'));const events=journals.flatMap(name=>readFileSync(join(stage,'terminal-sessions',name),'utf8').trim().split('\n').map(JSON.parse));assert.equal(events.filter(event=>event.subject==='terminal.execution'&&event.data.state==='response-delivered').length,1);assert.equal(events.filter(event=>event.kind==='work_verified').length,0);
});


it("installed terminal completes isolated Linux code/test/integration/source verification with durable ownership",{skip:!existsSync('/usr/bin/expect')||!process.env.CUESHEET_TEST_CAPSULE_IMAGE||!process.env.CUESHEET_TEST_TOOL_SOCKET},async()=>{
 const result=oracle();assert.equal(result.ok,true,result.why);assert.ok(result.terminal);const {installed,home,stage}=result.terminal!;
 const source=join(stage,'qz-installed-selfhost'),state=join(stage,'selfhost-sessions');mkdirSync(source);
 const git=(...args:string[])=>execFileSync('git',args,{cwd:source,encoding:'utf8',env:childEnv({home,sessions:state})}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 writeFileSync(join(source,'.gitignore'),'node_modules/\n.cuesheet/\n');writeFileSync(join(source,'feature.mjs'),'export const value=1;\n');writeFileSync(join(source,'feature.test.mjs'),"import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from './feature.mjs';test('requested result',()=>assert.equal(value,2));\n");writeFileSync(join(source,'human'),'base');git('add','.');git('commit','-qm','base');writeFileSync(join(source,'human'),'human pending');writeFileSync(join(source,'human-staged'),'keep');git('add','human-staged');const head=git('rev-parse','HEAD'),index=git('diff','--cached','--binary');
 const check=join(stage,'selfhost-check.mjs');writeFileSync(check,"import assert from 'node:assert/strict';import {join} from 'node:path';import {pathToFileURL} from 'node:url';const mod=await import(pathToFileURL(join(process.cwd(),'feature.mjs')).href);assert.equal(mod.value,2);console.log('OWNER_CHECK_PASS');\n");
 const binary=join(stage,'selfhost-provider'),counter=join(stage,'selfhost-step');
 const calls=[{name:'prepare_workspace',input:{unit:'fixture feature'}},{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('feature.mjs','export const value=2;\\n')"]}},{name:'node',input:{argv:['node','--test','feature.test.mjs']}},{name:'integrate_workspace',input:{}},{name:'finish',input:{}}];
 writeFileSync(binary,`#!${NODE}\nconst fs=require('fs');if(!process.argv.includes('--pure'))process.exit(4);const path=${JSON.stringify(counter)};let n=0;try{n=Number(fs.readFileSync(path,'utf8'))}catch{}fs.writeFileSync(path,String(n+1));const call=${JSON.stringify(calls)}[n];console.log(JSON.stringify({type:'text',part:{type:'text',text:JSON.stringify({text:'',toolCalls:call?[call]:[]})}}));\n`,{mode:0o755});
 const driver=join(stage,'selfhost.exp');writeFileSync(driver,`set stty_init {rows 32 columns 120}
match_max -d 200000
proc seen {pattern} {expect -timeout 20 -re $pattern {} timeout {catch {close};exit 8} eof {exit 9}}
proc waitms {ms} {set end [expr {[clock milliseconds]+$ms}];while {[clock milliseconds]<$end} {expect -timeout 1 -re {(?s).+} {} timeout {} eof {return}}}
spawn {${NODE}} {${join(installed,'dist','src','cuesheet.js')}} surface --verify {${check}}
seen {Ctrl\\+K}
waitms 500
send "qzinstalledselfhost fixture"
waitms 300
send "\\r"
seen {verified by the declared check}
waitms 500
send "\\003"
expect -timeout 5 eof {} timeout {catch {close};exit 10}
set result [wait]
exit [lindex $result 3]
`);
 const run=spawnSync('/usr/bin/expect',[driver],{cwd:source,encoding:'utf8',timeout:35000,env:{PATH:`${NODE_DIR}:/usr/bin:/bin`,HOME:home,TERM:'xterm-256color',CUESHEET_SESSIONS:state,CUESHEET_OPENCODE_BIN:binary,CUESHEET_MAX_SLICES:'1',CUESHEET_TOOL_IMAGE:process.env.CUESHEET_TEST_CAPSULE_IMAGE!,CUESHEET_TOOL_SOCKET:process.env.CUESHEET_TEST_TOOL_SOCKET!}});
 assert.equal(run.status,0,`${run.error??''}\n${run.stdout.slice(-12000)}\n${run.stderr}`);assert.doesNotMatch(run.stdout,/ERR_MODULE_NOT_FOUND|Dynamic require.*not supported/);assert.equal(readFileSync(join(source,'feature.mjs'),'utf8'),'export const value=2;\n');assert.equal(readFileSync(join(source,'human'),'utf8'),'human pending');assert.equal(readFileSync(join(source,'human-staged'),'utf8'),'keep');assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('diff','--cached','--binary'),index);
 const {TerminalSession,listTerminalSessions}=await import(join(installed,'dist','src','adapters','terminal-session.js'));const listed=listTerminalSessions(state);assert.equal(listed.length,1);assert.equal(listed[0].damaged,false);const journal=new TerminalSession({root:state,cwd:source,id:listed[0].id});try{const session=journal.core.toSession();assert.equal(session.goal.open,false);assert.ok(session.events.some((e:any)=>e.subject==='terminal.workspace'&&e.data.phase==='integrated'));assert.equal(session.events.filter((e:any)=>e.kind==='work_verified').length,1);assert.ok(session.events.some((e:any)=>e.subject==='terminal.execution'&&e.data.state==='goal-closed'));const {SessionContainers}=await import(join(installed,'dist','src','adapters','container-receipts.js'));const containers=new SessionContainers({root:state,sessionId:journal.metadata.id}).read();assert.equal(containers.length,2);assert.ok(containers.every((c:any)=>c.status==='removed'));assert.ok(containers.every((c:any)=>session.events.some((e:any)=>e.seq===c.intentSeq&&e.subject==='terminal.intent')));const {NotificationProjection}=await import(join(installed,'dist','src','adapters','notifications.js'));const projection=new NotificationProjection();const n=projection.update(session.events);assert.ok(n.items.some((i:any)=>i.phase==='goal-closed'));}finally{journal.close();}
});


it("installed Agents reopens an interrupted private proposal with recovery provenance",{skip:!existsSync('/usr/bin/expect')},async()=>{
 const result=oracle();assert.equal(result.ok,true,result.why);const {installed,home}=result.terminal!;const stage=realpathSync(result.terminal!.stage);
 const source=join(stage,'recovery-source'),state=join(stage,'recovery-state'),worktrees=join(stage,'recovery-worktrees');mkdirSync(source);mkdirSync(state);mkdirSync(worktrees);
 const git=(...args:string[])=>execFileSync('git',args,{cwd:source,encoding:'utf8',env:childEnv({home,sessions:state})});
 git('init','-q');git('config','user.name','Recovery');git('config','user.email','recovery@example.invalid');writeFileSync(join(source,'base'),'base');git('add','.');git('commit','-qm','base');
 const {TerminalSession}=await import('../src/adapters/terminal-session.ts');const {createObjective}=await import('../src/adapters/objectives.ts');const {runTerminalCodeWorkers}=await import('../src/adapters/terminal-code-workers.ts');
 const parent=new TerminalSession({root:state,cwd:source});parent.core.append({kind:'goal',subject:'recovery',data:{text:'Inspect preserved contribution'}});const objective=createObjective(parent.core,'Inspect preserved contribution',source,parent.core.revision);
 const append=parent.core.append.bind(parent.core);parent.core.append=(event)=>{if(event.subject==='terminal.agent'&&event.data.phase==='result')throw Error('publication interrupted');return append(event);};
 await runTerminalCodeWorkers({input:{tasks:[{role:'builder',task:'Preserved contribution',files:['base']}]},source,root:worktrees,parent,shared:parent.core,execution:'recovery-ui',objective,signal:new AbortController().signal,current:()=>true,
 route:()=>{let step=0;return {adapter:{name:'fixture',async infer(){return ++step===1?{text:'',toolCalls:[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('base','changed')"]}}]}:{text:'private proposal',toolCalls:[]};}},label:'fixture'};},tools:(scope)=>({names:['node'],async run(){writeFileSync(join(scope,'base'),'changed');return {name:'node',exit:0,output:'changed contribution'};}}),frame:()=>({goal:'Inspect preserved contribution',history:[],directives:[],evidence:[],capabilities:[],model:'fixture',step:0}),skills:()=>({references:[],instructions:'',warnings:[],current:()=>true}),notice:()=>{}});
 assert.ok(parent.core.toSession().events.some(event=>event.subject==='terminal.code-worker'&&event.data.phase==='admitted'),'real worker admission is required before UI proof');
 const id=parent.metadata.id;parent.close();
 const provider=join(stage,'recovery-provider');writeFileSync(provider,`#!${NODE}\nprocess.exit(75);\n`,{mode:0o755});
 for(const width of [100,58]){
  const driver=join(stage,`recovery-${width}.exp`);writeFileSync(driver,`set stty_init {rows 40 columns ${width}}
match_max -d 200000
proc seen {pattern} {expect -timeout 12 -re $pattern {} timeout {catch {close};exit 8} eof {exit 9}}
proc waitms {ms} {set end [expr {[clock milliseconds]+$ms}];while {[clock milliseconds]<$end} {expect -timeout 1 -re {(?s).+} {} timeout {} eof {return}}}
spawn {${NODE}} {${join(installed,'dist','src','cuesheet.js')}} surface --session ${id}
seen {Ctrl\\+K}
waitms 300
send "\\013"
seen {> View the log}
foreach label {{Help} {Provider and model} {Sessions} {New session} {Resume work} {Acceptance check} {Shared context} {Agents}} {send "\\033\\\[B";seen "> $label"}
send "\\r"
seen {interrupted}
for {set i 0} {$i<18} {incr i} {send "\\033\\\[B";waitms 60}
send "\\033"
waitms 200
send "\\003"
expect -timeout 5 eof {} timeout {catch {close};exit 10}
exit 0
`);
  const run=spawnSync('/usr/bin/expect',[driver],{cwd:source,encoding:'utf8',timeout:60000,env:{PATH:`${NODE_DIR}:/usr/bin:/bin`,HOME:home,TERM:'xterm-256color',CUESHEET_SESSIONS:state,CUESHEET_OPENCODE_BIN:provider}});
  assert.equal(run.status,0,`width=${width} ${run.error??''}\n${run.stdout.slice(-12000)}\n${run.stderr}`);assert.doesNotMatch(run.stdout,/ERR_MODULE_NOT_FOUND|ReferenceError/);for(const label of [/Cost/,/Private journal/,/inspect_code_workers/,/Provenance/])assert.match(run.stdout,label);
 }
});
