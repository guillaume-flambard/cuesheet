import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { childEnv } from './fixtures/hermetic-env.ts';

it('rendered selector recovers missing credentials, cancels stale catalogs, saves a choice and preserves the composer', () => {
  const root=mkdtempSync(join(tmpdir(),'cuesheet-provider-ui-'));
  try {
    const terminal=resolve('apps/terminal'); const script=join(root,'fixture.tsx');
    writeFileSync(join(root,'package.json'),'{"type":"module"}');
    writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};
import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};
import {App} from ${JSON.stringify(join(terminal,'src/app/App.tsx'))};
import {createStore} from ${JSON.stringify(join(terminal,'src/app/store.ts'))};
import {readModelPreferences,preferencesPath} from ${JSON.stringify(resolve('src/adapters/model-preferences.ts'))};
import {PassThrough} from 'node:stream';
let calls=0;let oldResolve;let oldSignal;
globalThis.fetch=async(url,options)=>{if(!String(url).endsWith('/models'))throw Error('unexpected inference');if(++calls===1){oldSignal=options.signal;return await new Promise(resolve=>oldResolve=resolve);}return Response.json({data:[{id:'UI_NEW_MODEL'}]});};
const store=createStore();store.send({type:'observed',entries:[{kind:'you',text:'OLD_CONVERSATION'}]});store.send({type:'compose',text:'draft preserved'});
const out=new PassThrough();Object.assign(out,{columns:40,rows:14,isTTY:false});let last='';out.on('data',b=>last=b.toString());
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const app=render(<App store={store} cwd=${JSON.stringify(root)}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,60));const key=async(value)=>{input.write(value);await tick();};await tick();const initial=last;
await key('\\x0b');await key('\\x1b[B');await key('\\x1b[B');await key('\\r');const providerScreen=last;
await key('\\x1b[B');await key('\\r');await key('http://localhost:9000/v1');await key('\\r');
const waiting=last;await key('\\x1b');const cancelled=oldSignal?.aborted===true;
await key('\\x0b');await key('\\x1b[B');await key('\\x1b[B');await key('\\r');await key('\\x1b[B');await key('\\r');await key('http://localhost:9000/v1');await key('\\r');
oldResolve(Response.json({data:[{id:'LATE_MODEL_MUST_NOT_APPEAR'}]}));await tick();const catalog=last;
await key('UI_NEW');await key('\\r');await key('256');await key('\\r');const confirm=last;
await key('\\r');const applied=last;const preferences=readModelPreferences(preferencesPath());
const composer=store.get().composer;const entries=store.get().entries;app.unmount();
console.log(JSON.stringify({initial,providerScreen,waiting,cancelled,catalog,confirm,applied,preferences,composer,entries,calls}));`);
    const env=childEnv({home:root,sessions:join(root,'sessions')});
    env.XDG_CONFIG_HOME=join(root,'config');env.CUESHEET_PROVIDER='openai';env.CUESHEET_MODEL='unavailable';
    delete env.OPENAI_API_KEY;delete env.OPENROUTER_API_KEY;
    const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{cwd:root,env,encoding:'utf8',timeout:15000});
    assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
    const result=JSON.parse(run.stdout.trim());
    assert.match(result.initial,/OPENAI_API_KEY/);
    assert.match(result.providerScreen,/Provider et modèle/);
    assert.equal(result.cancelled,true);
    assert.match(result.catalog,/UI_NEW_MODEL/);
    assert.doesNotMatch(result.catalog,/LATE_MODEL/);
    assert.match(result.confirm,/Appliquer/);
    assert.match(result.applied,/compatible.*UI_NEW_MODEL/);
    assert.deepEqual(result.preferences,{provider:'compatible',model:'UI_NEW_MODEL',baseUrl:'http://localhost:9000/v1',maxTokens:256});
    assert.equal(result.composer,'draft preserved');
    assert.ok(result.entries.some((entry:any)=>entry.kind==='you' && entry.text==='OLD_CONVERSATION'));
    assert.equal(result.calls,2);
    for(const screen of [result.providerScreen,result.catalog,result.confirm,result.applied]) assert.ok(screen.trimEnd().split('\n').length<=13);
  } finally {rmSync(root,{recursive:true,force:true});}
});

it('rendered manual fallback validates the output limit and can apply without saving', () => {
  const root=mkdtempSync(join(tmpdir(),'cuesheet-provider-manual-'));
  try {
    const terminal=resolve('apps/terminal');const script=join(root,'fixture.tsx');
    writeFileSync(join(root,'package.json'),'{"type":"module"}');
    writeFileSync(script,`import React from ${JSON.stringify(join(terminal,'node_modules/react/index.js'))};
import {render} from ${JSON.stringify(join(terminal,'node_modules/ink/build/index.js'))};
import {Models} from ${JSON.stringify(join(terminal,'src/overlays/Models.tsx'))};
import {PassThrough} from 'node:stream';
const out=new PassThrough();Object.assign(out,{columns:40,rows:14,isTTY:false});let last='';out.on('data',b=>last=b.toString());
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});let applied;let closed=false;
const list=async()=>{throw Error('Catalogue indisponible');};
const app=render(<Models rows={5} busy={false} selection={{provider:'compatible',baseUrl:'http://localhost:9000/v1'}} list={list} apply={(choice,save)=>{applied={choice,save};return {ok:true};}} onClose={()=>closed=true}/>,{stdout:out,stderr:out,stdin:input,debug:true,exitOnCtrlC:false});
const tick=()=>new Promise(r=>setTimeout(r,50));const key=async(value)=>{input.write(value);await tick();};await tick();
await key('\\r');await key('\\r');const failedCatalog=last;await key('\\t');const manual=last;
await key('MANUAL_ID');await key('\\r');await key('0');await key('\\r');const invalidLimit=last;
await key('\\x7f');await key('512');await key('\\r');await key('\\x1b[A');await key('\\r');app.unmount();
console.log(JSON.stringify({failedCatalog,manual,invalidLimit,applied,closed}));`);
    const run=spawnSync(process.execPath,[join(terminal,'node_modules/tsx/dist/cli.mjs'),script],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,0,run.stderr);
    const result=JSON.parse(run.stdout.trim());
    assert.match(result.failedCatalog,/Catalogue indisponible/);assert.match(result.manual,/ID libre/);
    assert.match(result.invalidLimit,/entier positif/);
    assert.deepEqual(result.applied,{choice:{provider:'compatible',baseUrl:'http://localhost:9000/v1',model:'MANUAL_ID',maxTokens:512},save:false});
    assert.equal(result.closed,true);
  } finally {rmSync(root,{recursive:true,force:true});}
});
