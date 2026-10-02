import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TerminalSession} from '../src/adapters/terminal-session.ts';
import {SessionContainers} from '../src/adapters/container-receipts.ts';
import {createScopedToolRunner} from '../apps/terminal/src/producer/runtime.ts';
import {completeAttempt,projectEffectAttempts} from '../src/adapters/tool-receipts.ts';
test('production container factory admits only its private worker intent and cleans owned resources',{skip:!process.env.CUESHEET_TEST_TOOL_SOCKET||!process.env.CUESHEET_TEST_TOOL_IMAGE},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cs-private-container-'))),source=join(root,'source');mkdirSync(source);
 const parent=new TerminalSession({root:join(root,'state'),cwd:source}),children:TerminalSession[]=[];
 try{
  for(const id of ['a','b']){const cwd=join(root,id);mkdirSync(cwd);children.push(new TerminalSession({root:join(parent.root,'workers',parent.metadata.id),cwd}));}
  const route={kind:'container' as const,socket:process.env.CUESHEET_TEST_TOOL_SOCKET!,image:process.env.CUESHEET_TEST_TOOL_IMAGE!,defaultImage:false,reason:'explicit fixture'};
  const request={name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('private-result','coded')"]}};
  const runners=children.map(child=>createScopedToolRunner({scope:child.metadata.cwd,journal:child,route}));
  const parentIntent=parent.core.append({kind:'action',subject:'terminal.intent',data:{version:1,phase:'requested',tool:request.name,input:request.input,effectId:'parent',scopeCwd:children[0]!.metadata.cwd}});
  assert.notEqual((await runners[0]!.run(request)).exit,0,'parent intent cannot admit private child execution');
  completeAttempt(parent.core,parentIntent,{name:'node',exit:126,output:'refused'});
  for(let index=0;index<children.length;index++){
   const child=children[index]!,intent=child.core.append({kind:'action',subject:'terminal.intent',data:{version:1,phase:'requested',tool:request.name,input:request.input,effectId:`child-${index}`,scopeCwd:child.metadata.cwd}});
   const result=await runners[index]!.run(request);assert.equal(result.exit,0,result.output);completeAttempt(child.core,intent,result);
   assert.equal(readFileSync(join(child.metadata.cwd,'private-result'),'utf8'),'coded');
   const resources=new SessionContainers({root:child.root,sessionId:child.metadata.id,assertWritable:()=>child.assertWritable()}).read();
   assert.equal(resources.length,1);assert.equal(resources[0]!.status,'removed');assert.equal(resources[0]!.scope,child.metadata.cwd);assert.equal(resources[0]!.intentSeq,intent.seq);
   assert.equal(projectEffectAttempts(child.core.toSession().events)[0]!.phase,'completed');
  }
  assert.equal(new SessionContainers({root:parent.root,sessionId:parent.metadata.id}).read().length,0);
 }finally{for(const child of children)child.close();parent.close();rmSync(root,{recursive:true,force:true});}
});
