import {it} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {childEnv} from "./fixtures/hermetic-env.ts";

it("session filter finds older project, refuses empty selection and keeps original arrow workflow",()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-session-search-ui-"));
 try{
  const terminal=resolve("apps/terminal"),script=join(root,"fixture.tsx");
  writeFileSync(join(root,"package.json"),'{"type":"module"}');
  const lines=[
   'import React from '+JSON.stringify(join(terminal,"node_modules/react/index.js"))+';',
   'import {render} from '+JSON.stringify(join(terminal,"node_modules/ink/build/index.js"))+';',
   'import {Sessions} from '+JSON.stringify(join(terminal,"src/overlays/Sessions.tsx"))+';',
   'import {PassThrough} from "node:stream";',
   'const out=new PassThrough();Object.assign(out,{columns:50,rows:14,isTTY:false});let frame="";out.on("data",b=>frame=b.toString());',
   'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
   'const selected=[];const rows=[{id:"s1",cwd:"/tmp/work",goal:"Bonjour",lastAt:3,damaged:false},{id:"s2",cwd:"/tmp/kollio",goal:"Reprendre l’étude",lastAt:2,damaged:false}];',
   'const app=render(React.createElement(Sessions,{rows:11,current:"s1",list:()=>rows,onChoose:id=>selected.push(id)}),{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});',
   'const tick=()=>new Promise(r=>setTimeout(r,90));await tick();',
   'input.write("kollio");await tick();const found=frame;',
   'input.write("\\x15");await tick();input.write("zzzz");await tick();const empty=frame;',
   'input.write("\\r");await tick();const afterEmpty=selected.length;',
   'input.write("\\x15");await tick();input.write("\\x1b[B");await tick();input.write("\\r");await tick();',
   'app.unmount();console.log(JSON.stringify({found,empty,afterEmpty,selected}));'
  ];
  writeFileSync(script,lines.join("\n"));
  const run=spawnSync(process.execPath,[join(terminal,"node_modules/tsx/dist/cli.mjs"),script],
   {encoding:"utf8",timeout:20000,env:{...childEnv({home:root,sessions:join(root,"sessions")}),NO_COLOR:"1",FORCE_COLOR:"0"}});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const r=JSON.parse(run.stdout.trim());
  const clean=(text:string)=>text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"");
  assert.match(clean(r.found),/étude/);
  assert.doesNotMatch(clean(r.found),/Bonjour/);
  assert.match(clean(r.empty),/Aucune session correspondante/);
  assert.equal(r.afterEmpty,0);
  assert.deepEqual(r.selected,["s2"]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
