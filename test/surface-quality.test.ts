import {it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {BinaryModelAdapter,AGENT_CONFIG} from '../src/adapters/binary-model.ts';
import {compileFrame} from '../src/core/loop.ts';
import {EventStore} from '../src/core/store.ts';

it('project inference carries the proposal config without rewriting owner settings',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cuesheet-quality-'));
  const previous=process.env.OPENCODE_CONFIG_CONTENT;
  const inherited={model:'owner/model',agent:{other:{description:'owner agent'}}};
  process.env.OPENCODE_CONFIG_CONTENT=JSON.stringify(inherited);
  try {
    const project=join(root,'work');mkdirSync(project);
    const config=join(project,'opencode.json');const original='{"agent":{"build":{"permission":{"*":"allow"}}}}';writeFileSync(config,original);
    const envFile=join(root,'child-env.json');const fake=join(root,'model');
    writeFileSync(fake,`#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(envFile)},process.env.OPENCODE_CONFIG_CONTENT);console.log(JSON.stringify({type:'text',part:{type:'text',text:JSON.stringify({text:'proposal',toolCalls:[]})}}));`);chmodSync(fake,0o755);
    const frame=compileFrame(new EventStore('quality',()=>1).toSession(),{subject:'builder',goal:'proposal',maxSteps:1},1);
    await new BinaryModelAdapter({binary:fake,project}).infer(frame);
    assert.deepEqual(JSON.parse(readFileSync(envFile,'utf8')),{...inherited,...AGENT_CONFIG,agent:{...inherited.agent,...(AGENT_CONFIG.agent as object)}});
    assert.equal(readFileSync(config,'utf8'),original);
  } finally {
    if(previous===undefined)delete process.env.OPENCODE_CONFIG_CONTENT;else process.env.OPENCODE_CONFIG_CONTENT=previous;
    rmSync(root,{recursive:true,force:true});
  }
});

it('long wrapped timelines retain the newest result inside the terminal row budget',()=>{
  const root=mkdtempSync(join(tmpdir(),'cuesheet-layout-'));
  try {
    writeFileSync(join(root,'package.json'),'{"type":"module"}');const terminal=resolve('apps/terminal');const script=join(root,'render.tsx');
    writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};
import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};
import {PassThrough} from 'node:stream';
import {App} from ${JSON.stringify(join(terminal,'src/app/App.tsx'))};
import {createStore} from ${JSON.stringify(join(terminal,'src/app/store.ts'))};
const store=createStore();
store.send({type:'observed',entries:[{id:'x:old',kind:'cuesheet',text:'OLD '.repeat(500)},{id:'x:new',kind:'cuesheet',text:'wrapped '.repeat(200)+' NEWEST_MARKER'}]});
const out=new PassThrough();Object.assign(out,{columns:40,rows:18,isTTY:false});const frames=[];out.on('data',b=>frames.push({columns:out.columns,rows:out.rows,frame:b.toString()}));
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});const app=render(<App store={store} producer={{say(){},choose(){}} as any}/>,{stdout:out as any,stderr:out as any,stdin:input as any,debug:true,exitOnCtrlC:false});
setTimeout(()=>{Object.assign(out,{columns:30,rows:14});out.emit('resize');},120);setTimeout(()=>{app.unmount();console.log(JSON.stringify(frames));},280);
`);
    const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{encoding:'utf8',timeout:20000});
    assert.equal(run.status,0,run.stderr);
    const frames=JSON.parse(run.stdout.trim());
    assert.ok(frames.length>=2,"initial and resized frames were rendered");
    // Ink can emit a blank control frame before the first painted UI, especially
    // on Linux. Require a meaningful render at BOTH dimensions, not an
    // arbitrary first/last transport chunk.
    for(const size of [{columns:40,rows:18},{columns:30,rows:14}]){
      const snapshots=frames.filter((frame:{columns:number;rows:number;frame:string})=>frame.columns===size.columns&&frame.rows===size.rows);
      const rendered=snapshots.map((snapshot:{frame:string})=>snapshot.frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').trimEnd());
      const matching=rendered.filter((plain:string)=>/NEWEST_MARKER/.test(plain)&&/cuesheet/.test(plain)&&/help/.test(plain));
      assert.ok(matching.length>0,`no complete painted frame for ${size.columns}x${size.rows} (${snapshots.length} frames)`);
      const plain=matching.at(-1)!; // settled paint, not transient pre-layout frames
      assert.ok(plain.split('\n').length<=size.rows-1,`frame exceeds terminal height: ${plain}`);
      assert.ok(plain.split('\n').every((line:string)=>line.length<=size.columns),"frame exceeds terminal width");
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});
