import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {childEnv} from './fixtures/hermetic-env.ts';

test('OpenCode model chooser starts at search, filters and applies by keyboard',()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-model-first-use-'));
 try{
  const terminal=resolve('apps/terminal'),script=join(root,'picker.tsx');
  writeFileSync(join(root,'package.json'),'{"type":"module"}');
  const lines=[
    "import React from "+JSON.stringify(join(terminal,'node_modules/react/index.js'))+";",
    "import {render} from "+JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))+";",
    "import {Models} from "+JSON.stringify(join(terminal,'src/overlays/Models.tsx'))+";",
    "import {PassThrough} from 'node:stream';",
    "const out=new PassThrough();Object.assign(out,{columns:80,rows:24,isTTY:false});",
    "let frame='';out.on('data',b=>frame=b.toString());",
    "const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});",
    "let applied,closed=0;",
    "const app=render(<Models rows={12} width={72} startWithModels selection={{provider:'opencode'}} list={async()=>[{id:'local/first',name:'Premier'},{id:'local/second',name:'Second'}]} apply={(choice,save)=>{applied={choice,save};return {ok:true};}} onClose={()=>closed++}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});",
    "const tick=()=>new Promise(r=>setTimeout(r,45));",
    "const until=async(predicate)=>{const end=Date.now()+4000;while(!predicate()&&Date.now()<end)await tick();if(!predicate())throw Error('UI not ready: '+frame);};",
    "await until(()=>frame.includes('local/first'));",
    "const initial=frame;",
    "input.write('second');await until(()=>frame.includes('local/second')&&!frame.includes('local/first'));",
    "input.write('\\r');await until(()=>frame.includes('Appliquer'));",
    "input.write('\\r');await tick();app.unmount();",
    "const other=render(<Models rows={8} width={40} startWithModels selection={{provider:'opencode'}} list={async()=>[{id:'local/first',name:'Premier'}]} apply={()=>({ok:true})} onClose={()=>closed++}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});",
    "await until(()=>frame.includes('Rechercher un modèle'));",
    "await tick();input.write('\\x1b');await until(()=>frame.includes('Fournisseur et modèle'));",
    "const back=frame;other.unmount();",
    "console.log(JSON.stringify({initial,applied,closed,back}));",
  ];
  writeFileSync(script,lines.join('\n')+'\n');
  const env=childEnv({home:root,sessions:join(root,'sessions')});
  const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{cwd:root,env,encoding:'utf8',timeout:17000});
  assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
  const value=JSON.parse(run.stdout.trim());
  assert.match(value.initial,/Rechercher un modèle/);
  assert.doesNotMatch(value.initial,/Fournisseur et modèle/);
  assert.deepEqual(value.applied,{choice:{provider:'opencode',model:'local/second'},save:true});
  assert.equal(value.closed,1);
  assert.match(value.back,/Fournisseur et modèle/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
