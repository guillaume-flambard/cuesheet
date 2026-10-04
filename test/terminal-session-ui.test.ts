import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { childEnv } from './fixtures/hermetic-env.ts';

it('actual keyboard flow reloads a saved conversation, explicitly resumes, creates a new session and returns to the old one',()=>{
  const root=mkdtempSync(join(tmpdir(),'cuesheet-session-ui-'));
  try {
    const terminal=resolve('apps/terminal');const cwd=join(root,'work');mkdirSync(cwd);const storage=join(root,'sessions');const script=join(root,'fixture.tsx');
    writeFileSync(join(root,'package.json'),'{"type":"module"}');
    writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};
import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};
import {App} from ${JSON.stringify(join(terminal,'src/app/App.tsx'))};
import {PassThrough} from 'node:stream';import {readdirSync,readFileSync} from 'node:fs';
let calls=0;const frames=[];globalThis.fetch=async(_url,options)=>{calls++;frames.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:'PERSISTED_RESPONSE'}}]});};
const out=new PassThrough();Object.assign(out,{columns:50,rows:18,isTTY:false});let last='';out.on('data',b=>last=b.toString());
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const mount=()=>render(<App cwd=${JSON.stringify(cwd)}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,70));const key=async(value)=>{input.write(value);await tick();};
const waitRun=async(expected)=>{const end=Date.now()+6000;while(calls<expected && Date.now()<end)await tick();await tick();};
let app=mount();await tick();await key('saved goal');await key('\\r');await waitRun(1);await key('unsubmitted draft');
const id=readdirSync(${JSON.stringify(storage)}).find(file=>file.endsWith('.meta.json')).replace('.meta.json','');const countBefore=calls;
app.unmount();await tick();process.env.CUESHEET_SESSION=id;app=mount();await tick();const loaded=last;const noAuto=calls===countBefore;
await key('\\x0b');for(let i=0;i<5;i++)await key('\\x1b[B');await key('\\r');await waitRun(2);const continued=frames[1];
await key('\\x0b');for(let i=0;i<4;i++)await key('\\x1b[B');await key('\\r');const fresh=last;const afterNew=calls;
await key('\\x0b');for(let i=0;i<3;i++)await key('\\x1b[B');await key('\\r');const chooser=last;await key('\\x1b[B');await key('\\r');const oldAgain=last;
const ids=readdirSync(${JSON.stringify(storage)}).filter(file=>file.endsWith('.meta.json'));const journal=readFileSync(${JSON.stringify(storage)}+'/'+id+'.jsonl','utf8').trim().split('\\n').map(line=>JSON.parse(line));
app.unmount();console.log(JSON.stringify({loaded,noAuto,continued,fresh,afterNew,chooser,oldAgain,ids,calls,journal}));`);
    const env=childEnv({home:root,sessions:storage});Object.assign(env,{CUESHEET_PROVIDER:'compatible',CUESHEET_MODEL:'fixture',CUESHEET_BASE_URL:'http://localhost:9000/v1',XDG_CONFIG_HOME:join(root,'config')});
    const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{cwd,env,encoding:'utf8',timeout:20000});
    assert.equal(run.status,0,run.stderr+'\n'+run.stdout);const result=JSON.parse(run.stdout.trim());
    assert.match(result.loaded,/PERSISTED_RESPONSE/);assert.match(result.loaded,/unsubmitted draft/);assert.equal(result.noAuto,true);
    assert.match(result.continued.messages[0].content,/goal: saved goal/);assert.match(result.continued.messages[0].content,/explicitly resumed/);
    assert.match(result.fresh,/What do you want to move forward\?/);assert.equal(result.afterNew,2);
    assert.match(result.chooser,/Sessions/);assert.match(result.oldAgain,/unsubmitted draft/);
    assert.equal(result.ids.length,2);assert.equal(result.calls,2);
    assert.equal(result.journal.filter((event:any)=>event.kind==='goal').length,2);
  }finally{rmSync(root,{recursive:true,force:true});}
});
