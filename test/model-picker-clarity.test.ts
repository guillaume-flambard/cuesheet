import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {childEnv} from './fixtures/hermetic-env.ts';

test('model picker keeps the keyboard focus visible; loading or empty search cannot apply a guessed ID',()=>{
  const root=mkdtempSync(join(tmpdir(),'cuesheet-picker-clarity-'));
  try{
    const terminal=resolve('apps/terminal'),script=join(root,'picker.tsx');
    writeFileSync(join(root,'package.json'),'{"type":"module"}');
    const lines=[
      'import React from '+JSON.stringify(join(terminal,'node_modules/react/index.js'))+';',
      'import {render} from '+JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))+';',
      'import {Models} from '+JSON.stringify(join(terminal,'src/overlays/Models.tsx'))+';',
      "import {PassThrough} from 'node:stream';",
      'const out=new PassThrough();Object.assign(out,{columns:66,rows:12,isTTY:false});',
      "let frame='';out.on('data',b=>frame=b.toString());",
      'const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});',
      'let resolveList;let applied=null;let appliedCount=0;',
      "const list=()=>new Promise(resolve=>resolveList=resolve);",
      "const app=render(<Models rows={8} width={66} startWithModels selection={{provider:'opencode'}} list={list} apply={(choice)=>{applied=choice;appliedCount++;return {ok:true};}} onClose={()=>{}}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});",
      'const tick=()=>new Promise(r=>setTimeout(r,45));',
      "const until=async(predicate)=>{const end=Date.now()+4000;while(!predicate()&&Date.now()<end)await tick();if(!predicate())throw Error('UI not ready: '+frame);};",
      "await until(()=>frame.includes('Chargement du catalogue'));",
      "input.write('\\r');await tick();if(frame.includes('Appliquer'))throw Error('Early Enter changed stage');",
      "resolveList(Array.from({length:17},(_,i)=>({id:'local/model-'+i,name:'Modèle '+i,configured:true})));",
      "await until(()=>frame.includes('local/model-0'));",
      "for(let i=0;i<7;i++){input.write('\\x1b[B');await tick();}",
      "await until(()=>frame.includes('› local/model-7'));",
      "const scrolled=frame;",
      "input.write('zzx-no-match');await until(()=>frame.includes('0 sur 17 modèles'));",
      "const empty=frame;",
      "input.write('\\r');await until(()=>frame.includes('Aucun modèle correspondant'));",
      "const invalid=frame;",
      "if(appliedCount!==0||frame.includes('Appliquer'))throw Error('Search became a model ID');",
      "input.write('\\t');await until(()=>frame.includes('ID libre :'));",
      "input.write('\\r');await until(()=>frame.includes('Appliquer'));",
      "const confirm=frame;app.unmount();",
      'console.log(JSON.stringify({scrolled,empty,invalid,confirm,appliedCount,applied}));',
    ];
    writeFileSync(script,lines.join('\n')+'\n');
    const env=childEnv({home:root,sessions:join(root,'sessions')});
    const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{cwd:root,env,encoding:'utf8',timeout:22000});
    assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
    const result=JSON.parse(run.stdout.trim());
    assert.match(result.scrolled,/› local\/model-7/);
    assert.match(result.invalid,/Aucun modèle correspondant/);
    assert.match(result.empty,/0 sur 17 modèles/);
    assert.match(result.confirm,/Appliquer/);
    assert.equal(result.appliedCount,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
