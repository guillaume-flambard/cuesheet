import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consultAgents,projectAgents} from '../src/adapters/agent-consultation.ts';
import {EventStore} from '../src/core/store.ts';
import type {ContextFrame} from '../src/core/loop.ts';
const frame:ContextFrame={goal:'owner goal',history:[],directives:[],evidence:[],capabilities:[],model:'fixture',step:1};
function fixture(){const log=new EventStore('fixture-agents',Date.now);const controller=new AbortController();return {log,controller,options:{input:{tasks:[{role:'research',task:'Find assumptions'},{role:'review',task:'Find mistakes'}]},frame,signal:controller.signal,current:()=>true,append:(event:any)=>log.append(event),execution:'E1',modelLabel:'fixture',notice:()=>{}}};}
test('consultants run concurrently, cannot execute tools and preserve independent failures',async()=>{
 const f=fixture();let calls=0;let release!:()=>void;const barrier=new Promise<void>(r=>release=r);
 const result=await consultAgents({...f.options,model:{name:'fixture',async infer(received){assert.equal(received.goal,'owner goal');assert.equal(received.capabilities.length,0);assert.match(received.directives.at(-1)!.text,/No tools/);if(++calls===2)release();await barrier;return calls===2&&received.directives.at(-1)!.text.includes('research')?{text:'tool attempt',toolCalls:[{name:'node',input:{}}]}:{text:'review finding',toolCalls:[]};}}});
 assert.equal(calls,2);assert.equal(result.exit,0);const agents=projectAgents(f.log.toSession().events);assert.equal(agents.filter(a=>a.phase==='result').length,1);assert.equal(agents.filter(a=>a.phase==='failed').length,1);
});
test('correction refuses stale agent text and cancellation cannot admit a late result',async()=>{
 for(const cancel of [false,true]){const f=fixture();let current=true;let release!:()=>void;const pending=new Promise<void>(r=>release=r);let started!:()=>void;const ready=new Promise<void>(r=>started=r);
 const work=consultAgents({...f.options,current:()=>current,model:{name:'late',async infer(){started();await pending;return {text:'old answer',toolCalls:[]};}}});await ready;current=false;if(cancel)f.controller.abort();release();assert.equal((await work).exit,126);const agents=projectAgents(f.log.toSession().events);assert.ok(agents.every(a=>a.phase===(cancel?'cancelled':'stale')));assert.ok(agents.every(a=>!a.text.includes('old answer')));}
});
test('invalid batch has no model calls and active history reconstructs interrupted without writes',async()=>{
 const f=fixture();let calls=0;const result=await consultAgents({...f.options,input:{tasks:[{role:'invalid role',task:'x'}]},model:{name:'fixture',async infer(){calls++;return {text:'x',toolCalls:[]};}}});assert.equal(result.exit,126);assert.equal(calls,0);assert.equal(f.log.revision,-1);
 f.log.append({kind:'note',subject:'terminal.agent',data:{version:1,id:'a',role:'review',task:'t',model:'m',phase:'active'}});const before=f.log.revision;assert.equal(projectAgents(f.log.toSession().events)[0]!.phase,'interrupted');assert.equal(projectAgents(f.log.toSession().events,true)[0]!.phase,'active');assert.equal(projectAgents(f.log.toSession().events,'new-execution')[0]!.phase,'interrupted');assert.equal(f.log.revision,before);
});
test('producer delegates against common context, human correction is direct and old results remain stale',async()=>{
 const {createProducer}=await import('../apps/terminal/src/producer/index.ts');const {createStore}=await import('../apps/terminal/src/app/store.ts');
 const view=createStore();let release!:()=>void;const pending=new Promise<void>(r=>release=r);let arrive!:()=>void;const arrived=new Promise<void>(r=>arrive=r);let delegates=0,steps=0,tools=0;
 const producer=createProducer({store:view,cwd:'/fixture/project',identities:[],maxSlices:1,model:{name:'fixture-model',async infer(f){
  if(f.directives.at(-1)?.text.includes('Consultation ')){if(++delegates===2)arrive();await pending;return {text:'obsolete finding',toolCalls:[]};}
  return {text:'',toolCalls:++steps===1?[{name:'consult_agents',input:{tasks:[{role:'research',task:'Inspect assumptions'},{role:'review',task:'Inspect risks'}]}}]:[]};
 }},tools:{async run(){tools++;throw Error('no effects');}}});
 producer.say('qzfixture');await arrived;assert.match(producer.agentPage!().lines.join('\n'),/en cours/);producer.say('Preserve API and revise requirements');release();const end=Date.now()+3000;while(view.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(view.get().busy,false);assert.equal(delegates,2);assert.equal(tools,0);assert.match(producer.agentPage!().lines.join('\n'),/contexte périmé/);assert.doesNotMatch(producer.agentPage!().lines.join('\n'),/obsolete finding/);
});
test('two real binary provider processes consult concurrently with distinct receipts',async()=>{
 const {mkdtempSync,writeFileSync,chmodSync,readdirSync,rmSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {BinaryModelAdapter}=await import('../src/adapters/binary-model.ts');const root=mkdtempSync(join(tmpdir(),'cs-real-consult-'));const binary=join(root,'fixture-provider');
 try{writeFileSync(binary,`#!${process.execPath}\nconst fs=require('fs');const path=require('path');const root=${JSON.stringify(root)};fs.writeFileSync(path.join(root,'started-'+process.pid),'started');const end=Date.now()+3000;const timer=setInterval(()=>{if(fs.readdirSync(root).filter(n=>n.startsWith('started-')).length===2){clearInterval(timer);console.log(JSON.stringify({type:'text',part:{type:'text',text:JSON.stringify({text:'analysis from '+process.pid,toolCalls:[]})}}));}else if(Date.now()>end){clearInterval(timer);process.exitCode=1;}},10);`);chmodSync(binary,0o700);
 const f=fixture();const result=await consultAgents({...f.options,model:new BinaryModelAdapter({binary,project:root,timeoutMs:5000})});assert.equal(result.exit,0,result.output);assert.equal(readdirSync(root).filter(n=>n.startsWith('started-')).length,2);const agents=projectAgents(f.log.toSession().events);assert.equal(agents.length,2);assert.ok(agents.every(a=>a.phase==='result'),result.output);assert.notEqual(agents[0]!.text,agents[1]!.text);
 }finally{rmSync(root,{recursive:true,force:true});}
});
