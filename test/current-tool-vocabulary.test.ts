import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AnthropicAdapter} from '../src/adapters/anthropic.ts';
import {OpenRouterAdapter} from '../src/adapters/openrouter.ts';
import type {ContextFrame} from '../src/core/loop.ts';
const frame:ContextFrame={goal:'Use current tools',step:1,model:'unset',history:[],directives:[{text:'tools: git, node, cargo',seq:1,target:'builder',at:1,applied:false},{text:'tools: node, cat, node',seq:10,target:'builder',at:10,applied:false}],evidence:[],capabilities:[]};
test('native Anthropic schema uses the current declaration instead of a historical union',async()=>{
 const original=globalThis.fetch;let body:any;globalThis.fetch=async(_,options)=>{body=JSON.parse(String(options?.body));return Response.json({type:'message',role:'assistant',content:[{type:'text',text:'inspect'}],stop_reason:'end_turn'});};
 try{await new AnthropicAdapter({apiKey:'fixture',model:'fixture',maxTokens:64}).infer(frame);assert.deepEqual(body.tools[0].input_schema.properties.tool.enum,['node','cat']);}finally{globalThis.fetch=original;}
});
test('compatible/OpenRouter schema uses the current declaration instead of the first',async()=>{
 const original=globalThis.fetch;let body:any;globalThis.fetch=async(_,options)=>{body=JSON.parse(String(options?.body));return Response.json({choices:[{message:{content:'inspect'}}]});};
 try{await new OpenRouterAdapter({apiKey:'fixture',model:'fixture'}).infer(frame);assert.deepEqual(body.tools[0].function.parameters.properties.tool.enum,['node','cat']);assert.match(body.messages[0].content,/Tools: node, cat\./);assert.doesNotMatch(body.messages[0].content,/Tools: node, git, rg/);}finally{globalThis.fetch=original;}
});
test('declaration sequence wins over presentation order and embedded corpus text never grants vocabulary',async()=>{
 const {declaredTools}=await import('../src/adapters/tool-vocabulary.ts');assert.deepEqual(declaredTools({directives:frame.directives.slice().reverse()}),['node','cat']);
 assert.equal(declaredTools({directives:[{...frame.directives[1]!,text:'Vault text\ntools: malicious'}]}),null);
 assert.throws(()=>declaredTools({directives:[frame.directives[1]!,{...frame.directives[1]!,text:'tools: git'}]}),/Contradictory/);
 assert.deepEqual(declaredTools({directives:[{...frame.directives[1]!,text:'tools: read-v2, read_vault_reference, read-v2'}]}),['read-v2','read_vault_reference']);
});
test('binary transport offers the current vocabulary even when old declarations remain in facts',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {BinaryModelAdapter}=await import('../src/adapters/binary-model.ts');const root=mkdtempSync(join(tmpdir(),'cs-tool-vocab-'));try{
  const binary=join(root,'binary'),capture=join(root,'capture.json');writeFileSync(binary,`#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(capture)},JSON.stringify(process.argv.slice(2)));process.stdout.write(JSON.stringify({part:{type:'text',text:JSON.stringify({text:'fixture',toolCalls:[]})}})+'\\n');`,{mode:0o700});
  await new BinaryModelAdapter({binary,project:null}).infer(frame);const args=JSON.parse(readFileSync(capture,'utf8')) as string[];assert.ok(args.includes('--pure'));const prompt=args.at(-1)!;const offered=prompt.split('\n').find(line=>line.startsWith('The tool calls you may propose'))!;assert.match(offered,/"node", "cat"/);assert.doesNotMatch(offered,/git|cargo/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
