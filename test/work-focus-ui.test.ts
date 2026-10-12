import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { childEnv } from "./fixtures/hermetic-env.ts";

it("WorkFocus stays legible after resize and palette preserves a draft", () => {
  const root=mkdtempSync(join(tmpdir(),"cuesheet-workfocus-"));
  try {
    const terminal=resolve("apps/terminal");
    const script=join(root,"fixture.tsx");
    writeFileSync(join(root,"package.json"),'{"type":"module"}');
    const lines=[
      'import React from '+JSON.stringify(join(terminal,"node_modules/react/index.js"))+';',
      'import {render} from '+JSON.stringify(join(terminal,"node_modules/ink/build/index.js"))+';',
      'import {App} from '+JSON.stringify(join(terminal,"src/app/App.tsx"))+';',
      'import {createStore} from '+JSON.stringify(join(terminal,"src/app/store.ts"))+';',
      'import {PassThrough} from "node:stream";',
      'const store=createStore();',
      'store.send({type:"submit",text:"Corriger la session sans inventer de vérification"});',
      'store.send({type:"observed",entries:[{id:"action:1",kind:"action",label:"edit",detail:"core.ts",certainty:"unknown"},{id:"last:1",kind:"cuesheet",text:"LATEST_MARKER"}]});',
      'const out=new PassThrough();Object.assign(out,{columns:120,rows:40,isTTY:false});',
      'const frames=[];out.on("data",b=>frames.push({columns:out.columns,rows:out.rows,frame:b.toString()}));',
      'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
      'let calls=0;',
      'const app=render(React.createElement(App,{store,producer:{say(){calls++},choose(){}}}),{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});',
      'const tick=()=>new Promise(r=>setTimeout(r,130));',
      'await tick();',
      'for(const [columns,rows] of [[80,24],[40,14]]){Object.assign(out,{columns,rows});out.emit("resize");await tick();}',
      'input.write("draft preserved");await tick();const before=store.get().composer;',
      'input.write("\\x0b");await tick();const palette=store.get().overlay;',
      'input.write("\\x1b");await tick();const after=store.get().composer;const closed=store.get().overlay;',
      'app.unmount();console.log(JSON.stringify({frames,before,after,palette,closed,calls,entries:store.get().entries.length}));'
    ];
    writeFileSync(script,lines.join("\n"));
    const run=spawnSync(process.execPath,[join(terminal,"node_modules/tsx/dist/cli.mjs"),script],
      {encoding:"utf8",timeout:25_000,env:{...childEnv({home:root,sessions:join(root,"sessions")}),NO_COLOR:"1",FORCE_COLOR:"0"}});
    assert.equal(run.status,0,run.stderr || run.stdout);
    const result=JSON.parse(run.stdout.trim());
    const plain=(s:string)=>s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"").trimEnd();
    for(const size of [{columns:120,rows:40},{columns:80,rows:24},{columns:40,rows:14}]){
      const painted=result.frames.filter((f:{columns:number;rows:number})=>f.columns===size.columns&&f.rows===size.rows)
        .map((f:{frame:string})=>plain(f.frame))
        .filter((v:string)=>v.includes("LATEST_MARKER")&&v.includes("vérifier")&&v.includes("Corriger la session"));
      assert.ok(painted.length>0,"no complete painted frame at "+size.columns+"x"+size.rows);
      const frame=painted.at(-1)!;
      assert.ok(frame.split("\n").length<=size.rows-1,"frame taller than "+size.rows);
      assert.ok(frame.split("\n").every((line:string)=>[...line].length<=size.columns),"frame wider than "+size.columns);
      assert.doesNotMatch(frame,/Travail terminé|Résultat vérifié/);
    }
    assert.equal(result.before,"draft preserved");
    assert.equal(result.after,"draft preserved");
    assert.equal(result.palette,"palette");
    assert.equal(result.closed,"none");
    assert.equal(result.calls,0,"opening and dismissing overlays cannot dispatch model work");
    assert.equal(result.entries,3,"render and resize cannot fabricate events");
  } finally {rmSync(root,{recursive:true,force:true});}
});
