import {it} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {childEnv} from "./fixtures/hermetic-env.ts";
it("Tab selects an attributed tracked file, preserves rest of draft and never sends",()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-mention-ui-"));
 try{
  const t=resolve("apps/terminal"),script=join(root,"fixture.tsx");
  writeFileSync(join(root,"package.json"),'{"type":"module"}');
  const lines=[
   'import React from '+JSON.stringify(join(t,"node_modules/react/index.js"))+';',
   'import {render} from '+JSON.stringify(join(t,"node_modules/ink/build/index.js"))+';',
   'import {App} from '+JSON.stringify(join(t,"src/app/App.tsx"))+';',
   'import {createStore} from '+JSON.stringify(join(t,"src/app/store.ts"))+';',
   'import {PassThrough} from "node:stream";',
   'const store=createStore();let calls=0;',
   'const out=new PassThrough();Object.assign(out,{columns:80,rows:24,isTTY:false});let paint="";out.on("data",b=>paint=b.toString());',
   'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
   'const producer={say(){calls++},choose(){},fileSuggestions:async()=>["src/composer.ts","src/core.ts","docs/readme.md"]};',
   'const app=render(React.createElement(App,{store,producer}),{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});',
   'const tick=()=>new Promise(r=>setTimeout(r,140));await tick();',
   'input.write("Modifier @composer");await tick();const before=paint;',
   'input.write("\\t");await tick();const chosen=store.get().composer;',
   'input.write("\\x0b");await tick();const palette=store.get().overlay;',
   'input.write("\\x1b");await tick();const draft=store.get().composer;',
   'app.unmount();console.log(JSON.stringify({before,chosen,palette,draft,calls}));'
  ];
  writeFileSync(script,lines.join("\n"));
  const run=spawnSync(process.execPath,[join(t,"node_modules/tsx/dist/cli.mjs"),script],{encoding:"utf8",timeout:25000,env:{...childEnv({home:root,sessions:join(root,"sessions")}),NO_COLOR:"1",FORCE_COLOR:"0"}});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const v=JSON.parse(run.stdout.trim());
  assert.match(v.before,/src\/composer\.ts/);
  assert.equal(v.chosen,"Modifier @src/composer.ts ");
  assert.equal(v.draft,v.chosen);
  assert.equal(v.palette,"palette");
  assert.equal(v.calls,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
