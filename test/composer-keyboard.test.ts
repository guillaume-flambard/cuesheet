import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { childEnv } from "./fixtures/hermetic-env.ts";

it("real Ink keys preserve pasted newlines; bare Enter submits only once", () => {
 const root=mkdtempSync(join(tmpdir(),"cuesheet-compose-keyboard-"));
 try {
  const terminal=resolve("apps/terminal");const fixture=join(root,"fixture.tsx");
  writeFileSync(join(root,"package.json"),'{"type":"module"}');
  const lines=[
   'import React from '+JSON.stringify(join(terminal,"node_modules/react/index.js"))+';',
   'import {render} from '+JSON.stringify(join(terminal,"node_modules/ink/build/index.js"))+';',
   'import {App} from '+JSON.stringify(join(terminal,"src/app/App.tsx"))+';',
   'import {createStore} from '+JSON.stringify(join(terminal,"src/app/store.ts"))+';',
   'import {PassThrough} from "node:stream";',
   'const store=createStore(); const sends=[];',
   'const output=new PassThrough();Object.assign(output,{columns:80,rows:24,isTTY:false});',
   'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
   'const app=render(React.createElement(App,{store,producer:{say(t){sends.push(t);store.send({type:"submit",text:t})},choose(){}}}),{stdout:output,stderr:output,stdin:input,debug:true,exitOnCtrlC:false});',
   'const tick=()=>new Promise(r=>setTimeout(r,90));await tick();',
   'input.write("first line");await tick();',
   'input.write("\\x0a");await tick();const afterNewline=store.get().composer;',
   'input.write("code\\nwith\\nlines");await tick();const afterPaste=store.get().composer;',
   'input.write("\\x0b");await tick();const inPalette=store.get().overlay;',
   'input.write("\\x1b");await tick();const savedDraft=store.get().composer;',
   'input.write("\\r");await tick();const sent=[...sends];',
   'app.unmount();console.log(JSON.stringify({afterNewline,afterPaste,inPalette,savedDraft,sent}));'
  ];
  writeFileSync(fixture,lines.join("\n"));
  const env={...childEnv({home:root,sessions:join(root,"sessions")}),NO_COLOR:"1",FORCE_COLOR:"0"};
  const run=spawnSync(process.execPath,[join(terminal,"node_modules/tsx/dist/cli.mjs"),fixture],{encoding:"utf8",env,timeout:25000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const result=JSON.parse(run.stdout.trim());
  assert.equal(result.afterNewline,"first line\n");
  assert.equal(result.afterPaste,"first line\ncode\nwith\nlines");
  assert.equal(result.inPalette,"palette");
  assert.equal(result.savedDraft,result.afterPaste);
  assert.deepEqual(result.sent,[result.afterPaste]);
 } finally {rmSync(root,{recursive:true,force:true});}
});
