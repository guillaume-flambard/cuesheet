import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readModelPreferences, saveModelPreferences } from '../src/adapters/model-preferences.ts';
import { resolveModel } from '../src/adapters/default-model.ts';
import { createModelBinding } from '../src/adapters/model-binding.ts';
import { listModels } from '../src/adapters/model-catalog.ts';
import { createStore } from '../apps/terminal/src/app/store.ts';
import { createProducer } from '../apps/terminal/src/producer/index.ts';

const fixture = () => mkdtempSync(join(tmpdir(), 'cuesheet-provider-'));
const frame = { model: 'unset', goal: 'g', step: 0, directives: [], evidence: [], capabilities: [], history: [] };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

it('preferences persist only validated non-secret fields and explicit selections override defaults coherently', () => {
  const root = fixture(); const path = join(root, 'config', 'models.json');
  try {
    saveModelPreferences({ provider: 'compatible', model: 'local-model', baseUrl: 'http://localhost:9000/v1', maxTokens: 500, apiKey: 'DO_NOT_SAVE' } as any, path);
    const preferences = readModelPreferences(path);
    assert.equal(preferences.model, 'local-model');
    assert.ok(!readFileSync(path, 'utf8').includes('DO_NOT_SAVE'));
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const saved = resolveModel({ preferences, env: {} });
    assert.ok(!('missing' in saved)); assert.equal(saved.model, 'local-model');
    const ignoredLimit = resolveModel({ provider: 'opencode', maxTokens: 100, preferences: {}, env: {} });
    assert.ok('missing' in ignoredLimit); assert.match(ignoredLimit.missing, /configured output limit/);
    const coherent = createModelBinding({project:root,path,env:{CUESHEET_PROVIDER:'openai',CUESHEET_MODEL:'remote',OPENAI_API_KEY:'key'}});
    assert.equal(coherent.selection.baseUrl,undefined);
    assert.equal(coherent.selection.maxTokens,undefined);
    const explicit = resolveModel({ provider: 'openai', preferences, env: {OPENAI_API_KEY:'key'} });
    assert.ok('missing' in explicit); assert.match(explicit.missing, /explicit model/);
    const environment = resolveModel({ preferences, env: {CUESHEET_PROVIDER:'openai',CUESHEET_MODEL:'other',OPENAI_API_KEY:'key'} });
    assert.ok(!('missing' in environment)); assert.equal(environment.model, 'other');
    writeFileSync(path, '{"private":"SECRET"');
    assert.throws(() => readModelPreferences(path), error => error instanceof Error && error.message.includes('Invalid model preferences') && !error.message.includes('SECRET'));
  } finally { rmSync(root, {recursive:true,force:true}); }
});

it('switching during inference preserves producer and directives; invalid/save failure leaves active model intact', async () => {
  const root = fixture(); const original = globalThis.fetch;
  try {
    const env = {CUESHEET_PROVIDER:'compatible',CUESHEET_MODEL:'first',CUESHEET_BASE_URL:'http://localhost:9000/v1'};
    const path = join(root,'models.json');
    const binding = createModelBinding({ project:root, env, path });
    const requests: any[] = [];
    let release: ((value: Response) => void) | undefined;
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(String(options?.body)));
      if (requests.length === 1) return await new Promise<Response>(resolve => {release = resolve;});
      return Response.json({choices:[{message:{content:'observed',tool_calls:[]}}]});
    };
    const store = createStore();
    const producer = createProducer({store,cwd:root,projectsRoot:root,identities:[],model:binding.adapter,tools:{async run(r){return {name:r.name,exit:0,output:''};}}});
    producer.say('first goal');
    while (!release) await wait(5);
    producer.say('keep this directive');
    assert.deepEqual(binding.select({provider:'compatible',model:'second',baseUrl:env.CUESHEET_BASE_URL},{busy:store.get().busy,save:true,beforeCommit:choice=>producer.modelSelected!(choice)}),{ok:true});
    assert.equal(binding.selection.model,'second'); assert.equal(existsSync(path),true);
    release(Response.json({choices:[{message:{content:'obsolete first result',tool_calls:[{function:{name:'tool_call',arguments:JSON.stringify({tool:'node',input:{argv:['node','-e','obsolete effect']}})}}]}}]}));
    while (store.get().busy) await wait(5);
    assert.equal(store.get().entries.some(e=>e.kind==='cuesheet'&&e.text.includes('obsolete first')),false);
    const before = [...store.get().log];
    assert.deepEqual(binding.select({provider:'compatible',model:'second',baseUrl:env.CUESHEET_BASE_URL,maxTokens:256},{busy:false,save:true}),{ok:true});
    assert.equal(readModelPreferences(path).model,'second');
    assert.equal(createModelBinding({project:root,env:{},path}).selection.model,'second');
    producer.say('second goal'); while (store.get().busy) await wait(5);
    assert.deepEqual(store.get().log.slice(0,before.length),before);
    const second = requests.find(request => request.model === 'second');
    assert.ok(second); assert.match(second.messages[0].content, /keep this directive/);
    assert.ok(store.get().entries.some(entry=>entry.kind==='you' && entry.text==='first goal'));
    assert.ok('error' in binding.select({provider:'openai',model:'third'},{busy:false,save:false}));
    assert.equal(binding.selection.model,'second');
    assert.ok('error' in binding.select({provider:'compatible',model:'third',baseUrl:env.CUESHEET_BASE_URL},{busy:false,save:false,beforeCommit(){throw new Error('journal refused');}}));
    assert.equal(binding.selection.model,'second');
    const blocked = createModelBinding({project:root,env,path:root});
    assert.ok('error' in blocked.select({provider:'compatible',model:'third',baseUrl:env.CUESHEET_BASE_URL},{busy:false,save:true}));
    assert.equal(blocked.missing !== null,true);
  } finally {globalThis.fetch=original;rmSync(root,{recursive:true,force:true});}
});

it('malformed saved preferences can be replaced through an explicit valid UI choice', () => {
  const root=fixture(); const path=join(root,'models.json');
  try {
    writeFileSync(path,'not-json');
    const binding=createModelBinding({project:root,env:{},path});
    assert.match(binding.missing!,/Invalid model preferences/);
    assert.deepEqual(binding.select({provider:'compatible',model:'local',baseUrl:'http://localhost:9000/v1'},{busy:false,save:true}),{ok:true});
    assert.equal(binding.missing,null); assert.equal(readModelPreferences(path).model,'local');
  } finally {rmSync(root,{recursive:true,force:true});}
});

it('catalog routing filters known non-tool OpenRouter models and never exposes error bodies or bad ids', async () => {
  const original=globalThis.fetch;
  try {
    let url=''; let auth: string | undefined;
    globalThis.fetch=async (target,options)=>{
      url=String(target);auth=(options?.headers as Record<string,string>).authorization;
      assert.equal(options?.redirect,'error');
      return Response.json({data:[{id:'valid',supported_parameters:['tools']},{id:'text-only',supported_parameters:[]},{id:'bad\nID'},{id:'valid',name:'duplicate'}]});
    };
    assert.deepEqual((await listModels({provider:'openrouter'},{env:{OPENROUTER_API_KEY:'test'}})).map(m=>m.id),['valid']);
    assert.equal(url,'https://openrouter.ai/api/v1/models'); assert.equal(auth,'Bearer test');
    await listModels({provider:'compatible',baseUrl:'http://localhost:9000/v1/'},{env:{}});
    assert.equal(url,'http://localhost:9000/v1/models'); assert.equal(auth,undefined);
    globalThis.fetch=async()=>new Response('SECRET echoed credential',{status:401});
    await assert.rejects(listModels({provider:'openai'},{env:{OPENAI_API_KEY:'test'}}),error=>error instanceof Error && /HTTP 401/.test(error.message) && !/SECRET/.test(error.message));
    globalThis.fetch=async()=>Response.json({not:'a catalog'});
    await assert.rejects(listModels({provider:'compatible',baseUrl:'http://localhost:9000/v1'}),/illisible/);
  } finally {globalThis.fetch=original;}
});

it('catalog requests time out and external cancellation reaches the transport', async () => {
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(_url,options)=>await new Promise((_resolve,reject)=>{
      const signal=options!.signal!; signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      // Keep the test alive until the unref-ed AbortSignal timeout fires.
      const timer=setTimeout(()=>reject(new Error('timeout did not fire')),200);
      signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
    });
    await assert.rejects(listModels({provider:'openrouter'},{timeoutMs:20}),error=>(error as Error).name==='TimeoutError');
    const controller=new AbortController();
    const work=listModels({provider:'openrouter'},{signal:controller.signal}); controller.abort(new Error('closed'));
    await assert.rejects(work,/closed/);
  } finally {globalThis.fetch=original;}
});
