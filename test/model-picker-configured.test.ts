import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {childEnv} from './fixtures/hermetic-env.ts';

test('OpenCode first-run selection focuses a declared account, not the unverified default',()=>{
  const root=mkdtempSync(join(tmpdir(),'cuesheet-configured-picker-'));
  try {
    const terminal=resolve('apps/terminal'),script=join(root,'picker.tsx');
    writeFileSync(join(root,'package.json'),'{"type":"module"}');
    const lines=[
      'import React from '+JSON.stringify(join(terminal,'node_modules/react/index.js'))+';',
      'import {render} from '+JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))+';',
      'import {Models} from '+JSON.stringify(join(terminal,'src/overlays/Models.tsx'))+';',
      "import {PassThrough} from 'node:stream';",
      'const out=new PassThrough();Object.assign(out,{columns:80,rows:24,isTTY:false});',
      "let frame='';out.on('data',b=>frame=b.toString());",
      'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
      'let applied=null;',
      "const app=render(<Models rows={12} width={72} startWithModels selection={{provider:'opencode'}} list={async()=>[{id:'google/connected',name:'Gemini',configured:true},{id:'bai/unconfigured',name:'Autre'}]} apply={(choice)=>{applied=choice;return {ok:true};}} onClose={()=>{}}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});",
      'const tick=()=>new Promise(r=>setTimeout(r,45));',
      "const until=async(predicate)=>{const end=Date.now()+4000;while(!predicate()&&Date.now()<end)await tick();if(!predicate())throw Error('UI not ready: '+frame);};",
      "await until(()=>frame.includes('› ● google/connected'));",
      'const first=frame;',
      "input.write('\\r');await until(()=>frame.includes('Appliquer'));",
      "input.write('\\r');await tick();app.unmount();",
      'console.log(JSON.stringify({first,applied}));'
    ];
    writeFileSync(script,lines.join('\n')+'\n');
    const env=childEnv({home:root,sessions:join(root,'sessions')});
    const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{cwd:root,env,encoding:'utf8',timeout:17000});
    assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
    const result=JSON.parse(run.stdout.trim());
    assert.match(result.first,/› ● google\/connected/);
    assert.deepEqual(result.applied,{provider:'opencode',model:'google/connected'});
  }finally{rmSync(root,{recursive:true,force:true});}
});
