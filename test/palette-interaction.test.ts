import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { childEnv } from "./fixtures/hermetic-env.ts";

it("typing in the palette filters commands, empty matches never invoke another action, and Esc retains draft", () => {
  const root=mkdtempSync(join(tmpdir(),"cuesheet-search-palette-"));
  try {
    const terminal=resolve("apps/terminal");
    const fixture=join(root,"fixture.tsx");
    writeFileSync(join(root,"package.json"),'{"type":"module"}');
    const lines=[
      'import React from '+JSON.stringify(join(terminal,"node_modules/react/index.js"))+';',
      'import {render} from '+JSON.stringify(join(terminal,"node_modules/ink/build/index.js"))+';',
      'import {createStore} from '+JSON.stringify(join(terminal,"src/app/store.ts"))+';',
      'import {App} from '+JSON.stringify(join(terminal,"src/app/App.tsx"))+';',
      'import {PassThrough} from "node:stream";',
      'const store=createStore();store.send({type:"compose",text:"draft preserved"});',
      'const out=new PassThrough();Object.assign(out,{columns:80,rows:24,isTTY:false});let current="";',
      'out.on("data",b=>current=b.toString());',
      'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
      'let calls=0;const app=render(React.createElement(App,{store,producer:{say(){calls++},choose(){}}}),{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});',
      'const tick=()=>new Promise(r=>setTimeout(r,125));',
      'input.write("\\x0b");await tick();input.write("MODELE");await tick();',
      'const filtered=current;const searchMode=store.get().overlay;',
      'input.write("\\x15");await tick();input.write("ZZZX");await tick();const noMatch=current;',
      'input.write("\\r");await tick();const afterNoMatch=store.get().overlay;',
      'input.write("\\x15");await tick();input.write("help");await tick();',
      'input.write("\\r");await tick();const opened=store.get().overlay;',
      'input.write("\\x1b");await tick();',
      'const closed=store.get().overlay;const draft=store.get().composer;',
      'app.unmount();console.log(JSON.stringify({filtered,noMatch,searchMode,afterNoMatch,opened,closed,draft,calls}));',
    ];
    writeFileSync(fixture,lines.join("\n"));
    const run=spawnSync(process.execPath,[join(terminal,"node_modules/tsx/dist/cli.mjs"),fixture],
      {encoding:"utf8",timeout:25000,env:{...childEnv({home:root,sessions:join(root,"sessions")}),NO_COLOR:"1",FORCE_COLOR:"0"}});
    assert.equal(run.status,0,run.stderr||run.stdout);
    const result=JSON.parse(run.stdout.trim());
    const plain=(s:string)=>s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"");
    assert.equal(result.searchMode,"palette");
    assert.match(plain(result.filtered),/Fournisseur et modèle/);
    assert.match(plain(result.filtered),/Modèles des agents/);
    assert.doesNotMatch(plain(result.filtered),/Voir le journal/);
    assert.match(plain(result.noMatch),/Aucune commande/);
    assert.equal(result.afterNoMatch,"palette","Enter without matches cannot select a hidden command");
    assert.equal(result.opened,"help","Help can be reached by just typing help and Enter");
    assert.equal(result.closed,"none");
    assert.equal(result.draft,"draft preserved");
    assert.equal(result.calls,0,"search and opening overlays may never call the model");
  } finally {rmSync(root,{recursive:true,force:true});}
});
