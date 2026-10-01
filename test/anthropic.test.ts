import {test} from "node:test";
import assert from "node:assert/strict";
import {AnthropicAdapter} from "../src/adapters/anthropic.ts";
import {resolveModel} from "../src/adapters/default-model.ts";
import {listModels} from "../src/adapters/model-catalog.ts";
import {validatePreferences} from "../src/adapters/model-preferences.ts";
import {surfaceEnvironment} from "../src/surface-cli.ts";
import type {ContextFrame} from "../src/core/loop.ts";
const frame:ContextFrame={goal:"preserve API",step:1,model:"unset",history:[],directives:[{text:"tools: cat, finish",seq:1,target:"builder"} as any],evidence:[],capabilities:[]};
const response=(content:unknown[],stop="end_turn",usage:unknown=undefined)=>Response.json({type:"message",role:"assistant",content,stop_reason:stop,usage});
const adapter=()=>new AnthropicAdapter({apiKey:"private-test-key",model:"explicit-model",maxTokens:128});

test("Anthropic requires explicit route, model, key and output budget; credentials do not persist",()=>{
  assert.ok('missing' in resolveModel({provider:'anthropic',preferences:{},env:{},model:'m',maxTokens:1}));
  assert.ok('missing' in resolveModel({provider:'anthropic',preferences:{},env:{ANTHROPIC_API_KEY:'key'},maxTokens:1}));
  assert.ok('missing' in resolveModel({provider:'anthropic',preferences:{},env:{ANTHROPIC_API_KEY:'key'},model:'m'}));
  const resolved=resolveModel({provider:'anthropic',preferences:{},env:{ANTHROPIC_API_KEY:'key'},model:'m',maxTokens:64});
  assert.ok(!('missing' in resolved));if(!('missing' in resolved))assert.equal(resolved.name,'anthropic');
  const prefs=validatePreferences({provider:'anthropic',model:'m',maxTokens:64,apiKey:'must not persist'});assert.deepEqual(prefs,{provider:'anthropic',model:'m',maxTokens:64});
  const env=surfaceEnvironment([],{ANTHROPIC_API_KEY:'fixture-key',OTHER_SECRET:'hidden'});assert.equal(env.ANTHROPIC_API_KEY,'fixture-key');assert.equal(env.OTHER_SECRET,undefined);
});

test("Messages uses native system/tools, selected model and validated complete tool inputs",async()=>{
  const original=globalThis.fetch;let body:any;
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),'https://api.anthropic.com/v1/messages');assert.equal(options?.redirect,'error');
    const headers=options?.headers as Record<string,string>;assert.equal(headers['x-api-key'],'private-test-key');assert.equal(headers['anthropic-version'],'2023-06-01');assert.equal(headers.authorization,undefined);
    body=JSON.parse(String(options?.body));
    return response([{type:'text',text:'inspect first'},{type:'tool_use',id:'t1',name:'tool_call',input:{tool:'cat',input:{argv:['cat','a.ts']}}}],'tool_use',{input_tokens:22,output_tokens:8});
  };
  try {
    const model=adapter();const result=await model.infer({...frame,model:'switched-model'});
    assert.equal(body.model,'switched-model');assert.equal(body.max_tokens,128);assert.equal(body.messages[0].role,'user');assert.match(body.messages[0].content,/preserve API/);assert.equal(typeof body.system,'string');
    assert.deepEqual(body.tools[0].input_schema.properties.tool.enum,['cat','finish']);
    assert.deepEqual(result,{text:'inspect first',toolCalls:[{name:'cat',input:{argv:['cat','a.ts']}}]});
    assert.deepEqual(model.lastUsage,{inputTokens:22,outputTokens:8,cost:null});assert.equal(JSON.stringify(body).includes('private-test-key'),false);
  } finally {globalThis.fetch=original;}
});

test("malformed, truncated, unknown or duplicate tools never produce executable calls",async()=>{
  const original=globalThis.fetch;
  const tool={type:'tool_use',id:'t1',name:'tool_call',input:{tool:'cat',input:{path:'a'}}};
  try {
    for(const [content,stop] of [[[{...tool,input:{tool:'cat',input:'partial JSON'}}],'tool_use'],[[{...tool,input:{tool:'unknown',input:{}}}],'tool_use'],[[tool,tool],'tool_use'],[[tool],'max_tokens'],[[tool],'end_turn'],[[{type:'server_tool_use'}],'tool_use']] as [unknown[],string][]) {
      globalThis.fetch=async()=>response(content,stop);await assert.rejects(adapter().infer(frame),/invalid or incomplete/);
    }
    globalThis.fetch=async()=>Response.json({content:[]});await assert.rejects(adapter().infer(frame),/invalid or incomplete/);
  } finally {globalThis.fetch=original;}
});

test("provider errors cannot echo secrets; cancelled late responses are refused; unknown usage stays null",async()=>{
  const original=globalThis.fetch;
  try {
    for(const status of [401,429,500]) {
      globalThis.fetch=async()=>new Response('private-test-key echoed by provider',{status});
      await assert.rejects(adapter().infer(frame),e=>e instanceof Error && e.message.includes(String(status)) && !e.message.includes('private-test-key'));
    }
    globalThis.fetch=async()=>{throw new Error('private-test-key leaked by transport');};await assert.rejects(adapter().infer(frame),e=>e instanceof Error && !e.message.includes('private-test-key'));
    const controller=new AbortController();globalThis.fetch=async()=>{controller.abort(new Error('human stop'));return response([{type:'text',text:'late'}]);};
    await assert.rejects(adapter().infer(frame,controller.signal),/human stop/);
    globalThis.fetch=async()=>response([{type:'text',text:'response'}]);const model=adapter();await model.infer(frame);assert.deepEqual(model.lastUsage,{inputTokens:null,outputTokens:null,cost:null});
    globalThis.fetch=async()=>new Response('bad JSON');await assert.rejects(adapter().infer(frame),/transport or response/);
    globalThis.fetch=async()=>new Response(' '.repeat(2*1024*1024+1));await assert.rejects(adapter().infer(frame),/transport or response/);
  } finally {globalThis.fetch=original;}
});

test("Anthropic catalog paginates without hardcoded models, sanitizes and rejects cursor cycles",async()=>{
  const original=globalThis.fetch;let calls=0;
  const options={env:{ANTHROPIC_API_KEY:'catalog-secret'},timeoutMs:1000};
  globalThis.fetch=async(url,init)=>{
    const request=new URL(String(url));assert.equal(request.origin,'https://api.anthropic.com');assert.equal((init?.headers as Record<string,string>)['x-api-key'],'catalog-secret');
    calls++;if(calls===1){assert.equal(request.searchParams.get('after_id'),null);return Response.json({data:[{id:'m-z',display_name:'Z'}],has_more:true,last_id:'m-z'});}
    assert.equal(request.searchParams.get('after_id'),'m-z');return Response.json({data:[{id:'m-a',display_name:'A'},{id:'bad id'},{id:'m-z'}],has_more:false,last_id:'m-a'});
  };
  try {
    assert.deepEqual(await listModels({provider:'anthropic'},options),[{id:'m-a',name:'A'},{id:'m-z',name:'m-z'}]);assert.equal(calls,2);
    globalThis.fetch=async()=>Response.json({data:[],has_more:true,last_id:'same'});await assert.rejects(listModels({provider:'anthropic'},options),/Catalogue Anthropic indisponible/);
    globalThis.fetch=async()=>new Response('catalog-secret',{status:401});await assert.rejects(listModels({provider:'anthropic'},options),e=>e instanceof Error && !e.message.includes('catalog-secret'));
    const controller=new AbortController();controller.abort(new Error('stop catalog'));await assert.rejects(listModels({provider:'anthropic'},{...options,signal:controller.signal}),/stop catalog/);
  } finally {globalThis.fetch=original;}
});
