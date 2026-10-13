import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {childEnv} from './fixtures/hermetic-env.ts';

test('header reserves the status on narrow screens and keeps the model visible',()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-header-'));
 try{
  const terminal=resolve('apps/terminal'),script=join(root,'header.tsx');
  writeFileSync(join(root,'package.json'),'{"type":"module"}');
  writeFileSync(script,[
   'import React from '+JSON.stringify(join(terminal,'node_modules/react/index.js'))+';',
   'import {render} from '+JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))+';',
   'import {Header} from '+JSON.stringify(join(terminal,'src/components/Header.tsx'))+';',
   "import {PassThrough} from 'node:stream';",
   'const screens=[];',
   'for(const width of [40,80]){',
   'const out=new PassThrough();Object.assign(out,{columns:width,rows:15,isTTY:false});',
   "let frame='';out.on('data',b=>frame=b.toString());",
   'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
   "const app=render(<Header width={width} busy={true} project='cuesheet-e2e-fixed-20261013' model='opencode-go/longcat-2.5-preview-free'/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});",
   'await new Promise(r=>setTimeout(r,100));screens.push({width,frame});app.unmount();',
   '}',
   'console.log(JSON.stringify(screens));'
  ].join('\n')+'\n');
  const env=childEnv({home:root,sessions:join(root,'sessions')});
  const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{encoding:'utf8',env,cwd:root,timeout:17000});
  assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
  const screens=JSON.parse(run.stdout.trim());
  const small=screens[0].frame.split('\n');
  assert.match(small[0],/cuesheet/);
  assert.match(small[0],/en cours/);
  assert.doesNotMatch(small[0],/e2e-fixed/);
  assert.ok(small[0].length<=40);
  assert.match(small[1],/opencode-go/);
  assert.match(screens[1].frame,/cuesheet-e2e-fixed-20261013/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
