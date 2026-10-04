import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {registerAppResource,registerAppTool,RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';
import {MissionService,type ProjectConfig} from './service.ts';
import {missionSummary,missionText,type Mission} from './projection.ts';
export const UI_URI='ui://cuesheet/mission-control/v1';
const here=dirname(fileURLToPath(import.meta.url));
export function missionResult(m:Mission){return {content:[{type:'text' as const,text:missionText(m)}],structuredContent:{mission:missionSummary(m)},_meta:{mission:m}};}
export function createMissionServer(service:MissionService){
  const server=new McpServer({name:'Cuesheet Mission Control',version:'0.1.0'});
  const id=z.string().regex(/^t-[A-Za-z0-9_-]{1,100}$/),requestId=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
  const register=(name:string,description:string,schema:z.ZodType,readOnly:boolean,card:boolean,handler:(input:any)=>unknown)=>{
    registerAppTool(server,name,{title:name.split('_').join(' '),description,inputSchema:schema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:!readOnly,idempotentHint:readOnly},
      _meta:{ui:{...(card?{resourceUri:UI_URI}:{}),visibility:readOnly?['model','app']:['model']}}},async input=>{
        try{return handler(input) as ReturnType<typeof missionResult>;}
        catch(error){return {isError:true,content:[{type:'text',text:error instanceof Error?error.message:'Mission request refused.'}]};}
      });
  };
  register('list_missions','Read active and recent locally admitted missions. Does not start execution.',z.strictObject({}),true,false,()=>{const missions=service.list();return {structuredContent:{missions:missions.map(missionSummary)},content:[{type:'text',text:missions.length?missions.map(missionText).join('\n\n'):'No admitted missions.'}]};});
  register('get_mission','Inspect one admitted mission and its current evidence, without starting work.',z.strictObject({missionId:id}),true,true,input=>missionResult(service.get(input.missionId)));
  register('start_mission','Start a bounded objective in an owner-configured project. Requires local mutation admission. Use a unique requestId; steer an existing active mission instead of duplicating it.',z.strictObject({project:z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),objective:z.string().min(1).max(20000),requestId}),false,true,input=>missionResult(service.start(input)));
  register('steer_mission','Correct the SAME mission and objective through Cuesheet live context. Read its revision first. No shell commands or permission changes.',z.strictObject({missionId:id,text:z.string().min(1).max(20000),expectedRevision:z.number().int().positive(),requestId}),false,false,input=>missionResult(service.steer(input)));
  register('stop_mission','Explicitly interrupt a mission. Preserve its goal, files and receipts; do not integrate or delete work.',z.strictObject({missionId:id,requestId}),false,false,input=>missionResult(service.stop(input)));
  register('get_human_delta','Read actual human decisions required by the runtime. Ordinary failures are not human gates.',z.strictObject({missionId:id}),true,false,input=>{const mission=service.get(input.missionId);return {structuredContent:{missionId:mission.id,humanDelta:missionSummary(mission).humanDelta},content:[{type:'text',text:mission.humanDelta.required?mission.humanDelta.reason!:'No human decision recorded.'}],_meta:{mission}};});
  registerAppResource(server,'Mission Control',UI_URI,{mimeType:RESOURCE_MIME_TYPE},async()=>({contents:[{uri:UI_URI,mimeType:RESOURCE_MIME_TYPE,text:readFileSync(join(here,'dist','mission-control.html'),'utf8'),_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}}}}]}));
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=process.argv.indexOf('--config');
  if(arg<0||!process.argv[arg+1])throw Error('Supply --config with an owner-owned local configuration file.');
  const raw=JSON.parse(readFileSync(process.argv[arg+1]!,'utf8')) as {root:string;projects:Record<string,ProjectConfig>};
  const service=new MissionService({...raw,allowMutations:process.argv.includes('--allow-mutations')});
  const server=createMissionServer(service);
  await server.connect(new StdioServerTransport());
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;await service.close();await server.close();};
  process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
  server.server.onclose=()=>void close();
}
