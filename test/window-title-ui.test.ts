import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';

/** Renders the real shell once, on the stream a terminal or a pipe would be. */
function render(isTTY:boolean):string{
  const root=mkdtempSync(join(tmpdir(),'cs-title-ui-'));
  try{
    const terminal=resolve('apps/terminal'),script=join(root,'title.tsx');writeFileSync(join(root,'package.json'),'{"type":"module"}');
    writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};import {PassThrough} from 'node:stream';import {App} from ${JSON.stringify(join(terminal,'src/app/App.tsx'))};import {createStore} from ${JSON.stringify(join(terminal,'src/app/store.ts'))};
const store=createStore();
const out=new PassThrough();Object.assign(out,{columns:100,rows:24,isTTY:${isTTY}});let data='';out.on('data',b=>data+=b.toString());
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const app=render(<App store={store} producer={{say(){},choose(){},workSurface:()=>({intent:'Fix the resize path',objects:[],criteria:[],corrections:[],tasks:[],workers:[]})} as any}/>,{stdout:out as any,stderr:out as any,stdin:input as any,debug:true,exitOnCtrlC:false});
setTimeout(()=>{app.unmount();console.log(JSON.stringify(data));},80);`);
    const run=spawnSync(join(terminal,'node_modules/.bin/tsx'),[script],{encoding:'utf8',timeout:30000});
    assert.equal(run.status,0,run.stderr);
    const frame=JSON.parse(run.stdout.trim().split('\n').at(-1)!);
    assert.match(frame,/◈ cuesheet/,'the shell rendered, so a crash cannot pass for a clean stream');
    return frame;
  }finally{rmSync(root,{recursive:true,force:true});}
}

test('a real terminal carries the live task in its window title',()=>{
  const frame=render(true);
  assert.match(frame,/\u001b\]0;cuesheet · Fix the resize path\u0007/,'the title names the work');
});

test('a pipe or a file stays free of control sequences',()=>{
  const frame=render(false);
  assert.doesNotMatch(frame,/\u001b\]0;/, 'a non-TTY stream is not a title surface');
});
