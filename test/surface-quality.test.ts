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
setTimeout(()=>{Object.assign(out,{columns:30,rows:14});out.emit('resize');},30);setTimeout(()=>{app.unmount();console.log(JSON.stringify(frames));},70);
`);
    const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{encoding:'utf8',timeout:30000});
    assert.equal(run.status,0,run.stderr);
    const frames=JSON.parse(run.stdout.trim());
    assert.ok(frames.length>=2,"initial and resized frames were rendered");
    for(const snapshot of [frames[0],frames.at(-1)]){
      const plain=snapshot.frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').trimEnd();
      assert.match(plain,/NEWEST_MARKER/);
      assert.match(plain,/cuesheet/);
      assert.match(plain,/help/);
      assert.ok(plain.split('\n').length<=snapshot.rows-1,`frame exceeds terminal height: ${plain}`);
      assert.ok(plain.split('\n').every((line:string)=>line.length<=snapshot.columns),"frame exceeds terminal width");
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

it('a conversation fills the terminal window and hides execution metadata',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-compact-ui-'));
 try {
  const terminal=resolve('apps/terminal'),script=join(root,'compact.tsx');writeFileSync(join(root,'package.json'),'{"type":"module"}');
  writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};import {PassThrough} from 'node:stream';import {App} from ${JSON.stringify(join(terminal,'src/app/App.tsx'))};import {createStore} from ${JSON.stringify(join(terminal,'src/app/store.ts'))};
const store=createStore();store.send({type:'observed',entries:[{id:'u',kind:'you',text:'hey there'},{id:'s',kind:'status',label:'outils',value:'conteneur Linux isolé',certainty:'unknown'},{id:'a',kind:'cuesheet',text:'Hey there!'},{id:'t',kind:'status',label:'tour',value:'Réponse reçue. Le but reste ouvert.',certainty:'unknown'}]});
const out=new PassThrough();Object.assign(out,{columns:220,rows:65,isTTY:false});let last='';out.on('data',b=>last=b.toString());const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});const app=render(<App store={store} producer={{say(){},choose(){}} as any}/>,{stdout:out as any,stderr:out as any,stdin:input as any,debug:true,exitOnCtrlC:false});setTimeout(()=>{console.log(JSON.stringify({frame:last,entries:store.get().entries}));app.unmount();},80);`);
  const run=spawnSync(join(terminal,'node_modules/.bin/tsx'),[script],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout.trim().split('\n').at(-1)!);const frame=result.frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
  assert.match(frame,/Hey there!/);assert.match(frame,/hey there/);assert.match(frame,/Enter send/);assert.equal(frame.trimEnd().split('\n').length,64,'surface fills the available height');assert.ok(frame.includes('─'.repeat(220)),'surface fills the available width');assert.doesNotMatch(frame,/conteneur Linux|Le but reste ouvert/);assert.equal(result.entries.length,4,'metadata remains available for inspection');
 } finally {rmSync(root,{recursive:true,force:true});}
});

it('busy surface animates, reports active tools and stops after completion',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-progress-ui-'));
 try {
  const terminal=resolve('apps/terminal'),script=join(root,'progress.tsx');writeFileSync(join(root,'package.json'),'{"type":"module"}');
  writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};import {PassThrough} from 'node:stream';import {App} from ${JSON.stringify(join(terminal,'src/app/App.tsx'))};import {createStore} from ${JSON.stringify(join(terminal,'src/app/store.ts'))};
const store=createStore();store.send({type:'began'});const out=new PassThrough();Object.assign(out,{columns:100,rows:24,isTTY:false});const frames=[];out.on('data',b=>frames.push(b.toString()));const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});const app=render(<App store={store} producer={{say(){},choose(){}} as any}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});
setTimeout(()=>store.send({type:'observed',entries:[{id:'tool',kind:'action',label:'read_document',detail:'README.md',certainty:'active'}]}),450);setTimeout(()=>store.send({type:'ended'}),800);setTimeout(()=>{app.unmount();console.log(JSON.stringify(frames));},1050);`);
  const run=spawnSync(join(terminal,'node_modules/.bin/tsx'),[script],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);const frames=JSON.parse(run.stdout.trim());const waiting=frames.filter((frame:string)=>frame.includes('Waiting for the model'));assert.ok(waiting.length>=2);assert.ok(new Set(waiting).size>=2,'spinner changes while the model is silent');assert.ok(frames.some((frame:string)=>frame.includes('Reading')&&frame.includes('README.md')));assert.match(frames.at(-1),/Ready/);assert.doesNotMatch(frames.at(-1),/Outil en cours|En attente de la réponse/);
 }finally{rmSync(root,{recursive:true,force:true});}
});


it('current intent and work retain the composer at every master size',()=>{
 const root=mkdtempSync(join(tmpdir(),'cs-work-layout-'));
 try {
  const terminal=resolve('apps/terminal'),script=join(root,'work.tsx');writeFileSync(join(root,'package.json'),'{"type":"module"}');
  writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};import {PassThrough} from 'node:stream';import {App} from ${JSON.stringify(join(terminal,'src/app/App.tsx'))};import {createStore} from ${JSON.stringify(join(terminal,'src/app/store.ts'))};import {terminalInput} from ${JSON.stringify(join(terminal,'src/terminal-input.ts'))};
const store=createStore();store.send({type:'compose',text:'DRAFT_KEEP'});store.send({type:'began'});const out=new PassThrough();Object.assign(out,{columns:80,rows:24,isTTY:false});let last='';out.on('data',b=>last=b.toString());const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});const sent=[];const producer={say(text){sent.push(text);store.send({type:'submit',text});},choose(){},workSurface(){return {intent:'INTENT_KEEP inspect Apple impact',corrections:['Leave Kollio'],tasks:[{id:'task',text:'Inspect IntentLane'}],workers:[]}}};const keyboard=terminalInput(input as any);const app=render(<App store={store} producer={producer as any}/>,{stdout:out,stderr:out,stdin:keyboard.input,debug:true,exitOnCtrlC:false});const frames=[];for(const [columns,rows] of [[80,24],[120,30],[160,50],[240,70]]){Object.assign(out,{columns,rows});out.emit('resize');await new Promise(r=>setTimeout(r,60));frames.push({columns,rows,frame:last});}input.write(String.fromCharCode(27,13));await new Promise(r=>setTimeout(r,60));if(!store.get().composer.endsWith(String.fromCharCode(10))){app.unmount();throw new Error('Alt+Enter did not insert a newline');}input.write(String.fromCharCode(15));await new Promise(r=>setTimeout(r,60));if(!store.get().composer.endsWith(String.fromCharCode(10,10))){app.unmount();throw new Error('Control+O did not insert a newline');}input.write(String.fromCharCode(27)+'[200~pasted'+String.fromCharCode(10)+'lines'+String.fromCharCode(27)+'[201~');await new Promise(r=>setTimeout(r,60));frames.push({columns:out.columns,rows:out.rows,frame:last});input.write(String.fromCharCode(13));await new Promise(r=>setTimeout(r,60));if(sent.length!==1||!sent[0].includes(String.fromCharCode(10,10))||store.get().composer!==''){app.unmount();throw new Error('Return must submit the intact multiline draft exactly once');}input.write('BURST_ONE'+String.fromCharCode(13)+'BURST_TWO'+String.fromCharCode(13));await new Promise(r=>setTimeout(r,60));if(sent.length!==3||sent[1]!=='BURST_ONE'||sent[2]!=='BURST_TWO'||store.get().composer!==''){app.unmount();throw new Error('Batched keyboard packets lost or duplicated human input');}app.unmount();keyboard.dispose();console.log(JSON.stringify(frames));`);
  const run=spawnSync(join(terminal,'node_modules/.bin/tsx'),[script],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);
  for(const shot of JSON.parse(run.stdout.trim())){const frame=shot.frame.replace(/\\x1b\\[[0-?]*[ -/]*[@-~]/g,'');assert.match(frame,/INTENT_KEEP/);assert.match(frame,/DRAFT_KEEP/);assert.match(frame,/Leave Kollio/);assert.match(frame,/planned/);assert.doesNotMatch(frame,/no project|reads|working/);assert.ok(frame.trimEnd().split('\n').length<=shot.rows-1);}
 } finally {rmSync(root,{recursive:true,force:true});}
});
