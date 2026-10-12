import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { childEnv } from "./fixtures/hermetic-env.ts";

it("palette opens a read-only diff review with keyboard paging, redraw and draft preserved", () => {
 const root=mkdtempSync(join(tmpdir(),"cuesheet-review-overlay-"));
 try {
  const terminal=resolve("apps/terminal");const script=join(root,"review.tsx");
  writeFileSync(join(root,"package.json"),'{"type":"module"}');
  const lines=[
    'import React from '+JSON.stringify(join(terminal,"node_modules/react/index.js"))+';',
    'import {render} from '+JSON.stringify(join(terminal,"node_modules/ink/build/index.js"))+';',
    'import {App} from '+JSON.stringify(join(terminal,"src/app/App.tsx"))+';',
    'import {createStore} from '+JSON.stringify(join(terminal,"src/app/store.ts"))+';',
    'import {PassThrough} from "node:stream";',
    'const store=createStore();store.send({type:"compose",text:"draft intact"});',
    'const stdout=new PassThrough();Object.assign(stdout,{columns:80,rows:24,isTTY:false});let paint="";',
    'stdout.on("data",b=>paint=b.toString());',
    'const stdin=new PassThrough();Object.assign(stdin,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
    'let called=0;let loads=0;',
    'const producer={say(){called++},choose(){},async reviewPage(){loads++;return {kind:"observed",workspace:"/fixture",head:"a".repeat(40),digest:"digest",truncated:false,lines:["Index · staged","diff --git a/a.ts b/a.ts","@@ -1 +1 @@", "-old","+new",...Array.from({length:70},(_,i)=>"line "+i)]}}};',
    'const app=render(React.createElement(App,{store,producer}),{stdin,stdout,stderr:stdout,debug:true,exitOnCtrlC:false});',
    'const tick=()=>new Promise(r=>setTimeout(r,130));await tick();',
    'stdin.write("\\x0b");await tick();stdin.write("review");await tick();stdin.write("\\r");await tick();await tick();',
    'const opened=store.get().overlay;const first=paint;',
    'stdin.write("\\x1b[6~");await tick();const later=paint;',
    'Object.assign(stdout,{columns:40,rows:14});stdout.emit("resize");await tick();const narrow=paint;',
    'stdin.write("r");await tick();await tick();const refreshed=loads;',
    'stdin.write("\\x1b");await tick();const draft=store.get().composer;const closed=store.get().overlay;',
    'app.unmount();console.log(JSON.stringify({opened,first,later,narrow,refreshed,draft,closed,called}));',
  ];
  writeFileSync(script,lines.join("\n"));
  const env={...childEnv({home:root,sessions:join(root,"sessions")}),NO_COLOR:"1",FORCE_COLOR:"0"};
  const run=spawnSync(process.execPath,[join(terminal,"node_modules/tsx/dist/cli.mjs"),script],{encoding:"utf8",env,timeout:30000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const v=JSON.parse(run.stdout.trim());
  const plain=(s:string)=>s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"");
  assert.equal(v.opened,"review");
  assert.match(plain(v.first),/Revue des changements/);
  assert.match(plain(v.first),/Index · staged/);
  assert.match(plain(v.first),/Non vérifié/);
  assert.match(plain(v.later),/line (?:[7-9]|1[0-9])/);
  assert.ok(plain(v.narrow).split("\n").length<=13,"review respects compact viewport height");
  assert.ok(plain(v.narrow).split("\n").every((l:string)=>[...l].length<=40),"review respects compact width");
  assert.ok(v.refreshed>=2);
  assert.equal(v.draft,"draft intact");
  assert.equal(v.closed,"none");
  assert.equal(v.called,0);
 } finally {rmSync(root,{recursive:true,force:true});}
});
