import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BinaryModelAdapter} from '../src/adapters/binary-model.ts';
import type {ContextFrame} from '../src/core/loop.ts';

const frame:ContextFrame={goal:'Inspect without any native effects',history:[],directives:[],evidence:[],capabilities:[],model:'fixture/one',step:1};
test('OpenCode v2 standalone proposer uses private config, denies native effects and leaves project untouched',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cuesheet-v2-run-'));
  try{
    const project=join(root,'project');mkdirSync(project);
    const ownerConfig=join(project,'opencode.json');
    writeFileSync(ownerConfig,JSON.stringify({agents:{'cuesheet-proposal':{permissions:[{action:'*',resource:'*',effect:'allow'}]}}}));
    const capture=join(root,'capture.json'),binary=join(root,'opencode');
    const src=[
      '#!'+process.execPath,
      'const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");',
      'const args=process.argv.slice(2);',
      'assert.equal(args[0],"run");',
      'assert.ok(args.includes("--standalone"));',
      'assert.ok(!args.includes("--dir")&&!args.includes("--pure")&&!args.includes("--auto"));',
      'assert.equal(process.env.OPENCODE_PURE,"1");',
      'const cwd=process.cwd();',
      'const config=JSON.parse(fs.readFileSync(path.join(cwd,"opencode.json"),"utf8"));',
      'const rules=config.agents["cuesheet-proposal"].permissions;',
      'assert.ok(rules.some(x=>x.action==="*"&&x.resource==="*"&&x.effect==="deny"));',
      'assert.equal(config.agent["cuesheet-proposal"].permission["*"],"deny");',
      'const ix=args.indexOf("--model");assert.equal(args[ix+1],"fixture/one");',
      'fs.writeFileSync('+JSON.stringify(capture)+',JSON.stringify({args,cwd,pure:process.env.OPENCODE_PURE,mode:fs.statSync(path.join(cwd,"opencode.json")).mode&0o777}));',
      'console.log(JSON.stringify({type:"text",part:{type:"text",text:JSON.stringify({text:"isolated proposer replied",toolCalls:[]})}}));',
    ].join('\n')+'\n';
    writeFileSync(binary,src,{mode:0o700});
    const result=await new BinaryModelAdapter({binary,project,model:'fixture/one'}).infer(frame);
    assert.equal(result.text,'isolated proposer replied');
    assert.deepEqual(result.toolCalls,[]);
    assert.ok(existsSync(ownerConfig));
    assert.match(readFileSync(ownerConfig,'utf8'),/"effect":"allow"/);
    const call=JSON.parse(readFileSync(capture,'utf8'));
    assert.notEqual(call.cwd,project);
    assert.equal(call.mode,0o600);
    assert.equal(existsSync(call.cwd),false,'owned run directory should be removed');
  }finally{rmSync(root,{recursive:true,force:true});}
});
