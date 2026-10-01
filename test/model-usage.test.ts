import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SessionUsage,summarizeUsage} from '../src/adapters/model-usage.ts';
import {AnthropicAdapter} from '../src/adapters/anthropic.ts';
import {createModelBinding} from '../src/adapters/model-binding.ts';
import {createTerminalRuntime} from '../apps/terminal/src/producer/runtime.ts';
import type {ContextFrame} from '../src/core/loop.ts';
const frame:ContextFrame={goal:'read',model:'unset',step:1,history:[],directives:[],evidence:[],capabilities:[]};
const start={phase:'started' as const,requestId:'r-one',provider:'anthropic',model:'requested-model'};
const observed={...start,phase:'observed' as const,inputTokens:10,outputTokens:4,cacheCreationInputTokens:2,cacheReadInputTokens:8};
const response=(stop='end_turn',usage:unknown={input_tokens:10,output_tokens:4,cache_creation_input_tokens:2,cache_read_input_tokens:8})=>Response.json({type:'message',role:'assistant',stop_reason:stop,content:[{type:'text',text:'reply'}],usage});

test('usage reads do not create data; receipts reject duplicates and corruption without rewrite',()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-usage-'));const missing=join(root,'absent');
 try{
  const store=new SessionUsage({root:missing,sessionId:'t-test'});assert.deepEqual(store.read(),[]);assert.equal(existsSync(missing),false);
  assert.throws(()=>store.record(observed),/Invalid/);assert.equal(existsSync(missing),false);
  store.record(start);store.record(observed);const path=join(missing,'t-test.usage.jsonl');const bytes=readFileSync(path,'utf8');assert.throws(()=>store.record(observed),/Invalid/);assert.equal(readFileSync(path,'utf8'),bytes);
  assert.deepEqual(new SessionUsage({root:missing,sessionId:'t-test'}).read(),store.read());
  const corrupt=bytes.replace('"version":1','"version":999');writeFileSync(path,corrupt);assert.throws(()=>store.read(),/Invalid/);assert.equal(readFileSync(path,'utf8'),corrupt);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('known counters are exact and unknown/pending requests never become zero-cost usage',()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-usage-total-'));
 try{
  const store=new SessionUsage({root,sessionId:'t-test'});store.record(start);store.record(observed);store.record({...start,requestId:'r-two'});
  const summary=summarizeUsage(store.read());assert.equal(summary.requests,2);assert.equal(summary.pending,1);assert.equal(summary.cost,null);assert.deepEqual(summary.counters.inputTokens,{known:'10',unknownRequests:1});assert.deepEqual(summary.counters.cacheReadInputTokens,{known:'8',unknownRequests:1});
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('truncated provider output still records reported usage; transport abort remains unknown',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-usage-native-'));const original=globalThis.fetch;
 try{
  const store=new SessionUsage({root,sessionId:'t-test'});const adapter=new AnthropicAdapter({apiKey:'private-fixture-secret',model:'requested-model',maxTokens:20,onUsage:store.record});
  globalThis.fetch=async()=>response('max_tokens');await assert.rejects(adapter.infer(frame),/incomplete/);assert.equal(store.read()[0]!.status,'observed');assert.equal(store.read()[0]!.outputTokens,4);
  const controller=new AbortController();globalThis.fetch=async()=>{controller.abort(new Error('stop'));return response();};await assert.rejects(adapter.infer(frame,controller.signal),/stop/);assert.equal(store.read()[1]!.status,'pending');
  globalThis.fetch=async()=>response('end_turn',{input_tokens:-1,output_tokens:1.5});await adapter.infer(frame);assert.equal(store.read()[2]!.inputTokens,null);assert.equal(store.read()[2]!.outputTokens,null);
  assert.equal(readFileSync(join(root,'t-test.usage.jsonl'),'utf8').includes('private-fixture-secret'),false);
 }finally{globalThis.fetch=original;rmSync(root,{recursive:true,force:true});}
});

test('model switching retains the usage sink and records the requested model per inference',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-usage-binding-'));const original=globalThis.fetch;
 try{
  const store=new SessionUsage({root,sessionId:'t-test'});const binding=createModelBinding({project:root,preferences:{provider:'anthropic',model:'model-a',maxTokens:20},env:{ANTHROPIC_API_KEY:'fixture'},onUsage:store.record});
  globalThis.fetch=async()=>response();await binding.adapter.infer(frame);
  assert.ok('ok' in binding.select({provider:'anthropic',model:'model-b',maxTokens:20},{busy:false,save:false}));await binding.adapter.infer(frame);
  assert.deepEqual(store.read().map(r=>r.model),['model-a','model-b']);assert.equal(summarizeUsage(store.read()).counters.inputTokens.known,'20');
 }finally{globalThis.fetch=original;rmSync(root,{recursive:true,force:true});}
});

test('production terminal runtime hooks the ledger without invalidating model proposals',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-usage-runtime-'));const cwd=join(root,'work');mkdirSync(cwd);const original=globalThis.fetch;const old={...process.env};let runtime:ReturnType<typeof createTerminalRuntime>|undefined;
 try{
  for(const key of Object.keys(process.env))if(key.startsWith('CUESHEET_')||key==='ANTHROPIC_API_KEY')delete process.env[key];
  process.env.CUESHEET_PROVIDER='anthropic';process.env.CUESHEET_MODEL='model-runtime';process.env.CUESHEET_MAX_TOKENS='20';process.env.ANTHROPIC_API_KEY='fixture';process.env.CUESHEET_SESSIONS=join(root,'sessions');process.env.CUESHEET_MAX_SLICES='1';
  globalThis.fetch=async()=>response();runtime=createTerminalRuntime(cwd);assert.ok(!('missing' in runtime));if('missing' in runtime)throw new Error(runtime.missing);
  runtime.producer.say('read the current workspace');const end=Date.now()+5000;while(runtime.store.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(runtime.store.get().busy,false);
  const usage=new SessionUsage({root:runtime.session.root,sessionId:runtime.session.metadata.id}).read();assert.ok(usage.length>0);assert.ok(usage.every(r=>r.status==='observed'));
  assert.ok(runtime.store.get().entries.some(e=>e.kind==='cuesheet'&&e.text==='reply'),'usage bookkeeping did not force every valid proposal to rebase');
 }finally{if(runtime&&!('missing' in runtime))runtime.session.close();globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);rmSync(root,{recursive:true,force:true});}
});


test('usage storage refusal blocks dispatch or proposal admission rather than inventing a receipt',async()=>{
 const original=globalThis.fetch;let dispatched=0;
 try{
  globalThis.fetch=async()=>{dispatched++;return response();};
  const before=new AnthropicAdapter({apiKey:'fixture',model:'m',maxTokens:20,onUsage(){throw new Error('receipt write refused');}});
  await assert.rejects(before.infer(frame),/receipt write refused/);assert.equal(dispatched,0);
  const after=new AnthropicAdapter({apiKey:'fixture',model:'m',maxTokens:20,onUsage(receipt){if(receipt.phase==='observed')throw new Error('receipt write refused');}});
  await assert.rejects(after.infer(frame),/receipt write refused/);assert.equal(dispatched,1);
 }finally{globalThis.fetch=original;}
});

test('aggregation retains exact decimal totals beyond the safe-number range',()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-usage-big-'));
 try{
  const store=new SessionUsage({root,sessionId:'t-test'});
  for(const requestId of ['r-a','r-b']){store.record({...start,requestId});store.record({...observed,requestId,inputTokens:Number.MAX_SAFE_INTEGER});}
  assert.equal(summarizeUsage(store.read()).counters.inputTokens.known,(2n*BigInt(Number.MAX_SAFE_INTEGER)).toString());
 }finally{rmSync(root,{recursive:true,force:true});}
});
