import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),source=join(here,'../..');
const root=process.argv[2];if(!root)throw Error('Provide a fresh absolute proof directory.');mkdirSync(root,{recursive:true});
const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8'});
const before={head:git('rev-parse','HEAD'),status:git('status','--porcelain'),staged:git('diff','--cached'),diff:git('diff'),index:createHash('sha256').update(readFileSync(join(source,'.git/index'))).digest('hex')};
const check=join(root,'owner.mjs');writeFileSync(check,`import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';const p=JSON.parse(readFileSync('package.json','utf8'));assert.equal(p.name,'cuesheet');assert.ok(p.scripts.test);console.log('Cuesheet package identity and declared test command observed');`);
const config=join(root,'config.json');writeFileSync(config,JSON.stringify({root:join(root,'state'),projects:{cuesheet:{path:source,check}}},null,2));
const transport=new StdioClientTransport({command:process.execPath,args:[join(here,'server.ts'),'--config',config,'--allow-mutations'],env:{...process.env,CUESHEET_PROVIDER:'opencode',CUESHEET_MODEL:'opencode-go/gpt-5.6-luna',CUESHEET_TOOL_MODE:'container',CUESHEET_TOOL_IMAGE:'sha256:358569078158e76f822a2cd0ed86c440f2244a65ab1385362ab5d29d2d28ceb4',CUESHEET_TOOL_SOCKET:'/Users/memo/.docker/run/docker.sock',CUESHEET_MAX_SLICES:'1'},stderr:'pipe'});
const client=new Client({name:'Cuesheet real mission demo',version:'0.1.0'});let last,steered=false,workersActive=false;
try{
 await client.connect(transport);
 const start=await client.callTool({name:'start_mission',arguments:{project:'cuesheet',objective:'Inspect the current Cuesheet recovery implementation without changing source files. Use one read-only consult_agents reviewer to assess the existing interruption behavior and report what remains unverified. Keep the mission bounded, do not install anything or change files. Then attempt the declared independent owner check. Do not claim usability or Siri acceptance.',requestId:'real-start'}});
 if(start.isError)throw Error(JSON.stringify(start.content));let m=start._meta.mission;const id=m.id;const began=Date.now();
 while(Date.now()-began<120000){await new Promise(r=>setTimeout(r,500));last=await client.callTool({name:'get_mission',arguments:{missionId:id}});if(last.isError)throw Error(JSON.stringify(last.content));m=last._meta.mission;
   writeFileSync(join(root,'mission.json'),JSON.stringify(last,null,2));
   const hasObjective=m.objectiveId!==null;workersActive ||= m.workers.active>0;
   if(!steered&&hasObjective&&(m.workers.active>0||Date.now()-began>25000&&m.state==='running')){
     const prior=m.objectiveId;const result=await client.callTool({name:'steer_mission',arguments:{missionId:id,text:'Correction: recovery inspection only. Do not add Mission Control or MCP features, and preserve every existing source edit.',expectedRevision:m.revision,requestId:'real-steer'}});
     if(result.isError)throw Error(JSON.stringify(result.content));m=result._meta.mission;if(m.id!==id||m.objectiveId!==prior)throw Error('Steering changed mission/objective identity');steered=true;console.log('Same real objective corrected; current state: '+m.state);
   }
   if(steered&&m.humanDelta.required){console.log('Genuine human check-renewal boundary observed');break;}
   if(hasObjective&&m.state==='failed')break;
 }
 if(!steered)throw Error('Real mission did not reach a correctable active boundary');
 const delta=await client.callTool({name:'get_human_delta',arguments:{missionId:id}});writeFileSync(join(root,'human-delta.json'),JSON.stringify(delta,null,2));
 await client.callTool({name:'stop_mission',arguments:{missionId:id,requestId:'real-stop'}});await new Promise(r=>setTimeout(r,1000));
 last=await client.callTool({name:'get_mission',arguments:{missionId:id}});writeFileSync(join(root,'mission.json'),JSON.stringify(last,null,2));
 const after={head:git('rev-parse','HEAD'),status:git('status','--porcelain'),staged:git('diff','--cached'),diff:git('diff'),index:createHash('sha256').update(readFileSync(join(source,'.git/index'))).digest('hex')};
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Cuesheet source/index changed during read-only mission');
 const audit={steered,workersActive,sameMission:true,genuineHumanDelta:delta.structuredContent?.humanDelta?.required===true,sourcePreserved:true,elapsedSeconds:Math.round((Date.now()-began)/1000),scope:'real Cuesheet read-only mission and check-renewal boundary; not Siri or verified selfhost'};
 writeFileSync(join(root,'audit.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
}catch(error){writeFileSync(join(root,'failure.json'),JSON.stringify({message:error.message},null,2));throw error;}
finally{await client.close();await transport.close();}
