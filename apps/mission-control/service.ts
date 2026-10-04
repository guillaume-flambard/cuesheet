import {realpathSync,statSync,mkdirSync,existsSync,lstatSync,readFileSync,openSync,writeFileSync,closeSync} from 'node:fs';
import {join,isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {TerminalSession} from '../../src/adapters/terminal-session.ts';
import {SessionUsage} from '../../src/adapters/model-usage.ts';
import {createCompletionCheck} from '../../src/adapters/surface-verification.ts';
import {createLiveProducer} from '../terminal/src/producer/runtime.ts';
import {persistentView} from '../terminal/src/producer/session-view.ts';
import type {Producer} from '../terminal/src/producer/index.ts';
import type {Store} from '../terminal/src/app/store.ts';
import {projectMission} from './projection.ts';

export interface ProjectConfig {path:string;check?:string;}
export interface MissionRuntime {session:TerminalSession;store:Store;producer:Producer;missing?:string;}
export class MissionService {
  private control:TerminalSession;
  private runtimes=new Map<string,MissionRuntime>();
  readonly projects:Record<string,ProjectConfig>;
  private options:{root:string;projects:Record<string,ProjectConfig>;allowMutations:boolean;factory?:(cwd:string,id?:string)=>MissionRuntime};
  constructor(options:{root:string;projects:Record<string,ProjectConfig>;allowMutations:boolean;factory?:(cwd:string,id?:string)=>MissionRuntime}){
    const entries=Object.entries(options.projects);
    if(!entries.length||entries.length>8||!isAbsolute(options.root))throw Error('Configure an absolute state root and 1 to 8 projects.');
    this.projects=Object.fromEntries(entries.map(([id,p])=>{
      if(!/^[a-z][a-z0-9-]{0,63}$/.test(id)||!isAbsolute(p.path)||realpathSync(p.path)!==resolve(p.path)||!statSync(p.path).isDirectory())throw Error('Project IDs must map to canonical owner-configured directories.');
      return [id,{...p,path:realpathSync(p.path)}];
    }));this.options={...options,projects:this.projects};
    mkdirSync(options.root,{recursive:true,mode:0o700});
    const pointer=join(options.root,'controller-id');
    if(existsSync(pointer)){
      if(!lstatSync(pointer).isFile()||lstatSync(pointer).isSymbolicLink()||statSync(pointer).size>100)throw Error('Invalid control journal pointer.');
      const id=readFileSync(pointer,'utf8').trim();if(!/^t-[A-Za-z0-9_-]+$/.test(id))throw Error('Control initialization is incomplete; preserve and inspect.');
      this.control=new TerminalSession({root:join(options.root,'control'),cwd:entries[0]![1].path,id});
    }else{
      const fd=openSync(pointer,'wx',0o600);
      try{this.control=new TerminalSession({root:join(options.root,'control'),cwd:entries[0]![1].path});writeFileSync(fd,this.control.metadata.id);}finally{closeSync(fd);}
    }
  }
  private records(){return this.control.core.toSession().events.filter(e=>e.kind==='note'&&e.subject==='mission.registration');}
  private runtime(id:string){
    const cached=this.runtimes.get(id);if(cached)return cached;
    const saved=this.records().find(e=>e.data.id===id);
    if(!saved||typeof saved.data.project!=='string'||typeof saved.data.path!=='string'||!this.projects[saved.data.project]||this.projects[saved.data.project]!.path!==saved.data.path)throw Error('Unknown mission or changed owner project configuration.');
    const runtime=this.construct(saved.data.project,id);this.runtimes.set(id,runtime);return runtime;
  }
  private construct(project:string,id?:string):MissionRuntime{
    const config=this.projects[project]!;
    if(realpathSync(config.path)!==config.path)throw Error('Project ownership changed.');
    if(this.options.factory)return this.options.factory(config.path,id);
    const verification=config.check?createCompletionCheck({script:config.check,root:join(this.options.root,'proofs')}):undefined;
    const session=new TerminalSession({root:join(this.options.root,'missions'),cwd:config.path,id,check:verification?.pinned});
    try{
      const store=persistentView(session);
      const live=createLiveProducer(store,config.path,{journal:session,verification,identities:[]});
      if('missing'in live)throw Error(live.missing);
      if(live.binding.missing)throw Error('The configured Cuesheet model is unavailable.');
      return {session,store,producer:live.producer};
    }catch(error){session.close();throw error;}
  }
  list(){return this.records().slice(-20).reverse().map(e=>this.get(String(e.data.id)));}
  get(id:string){
    const runtime=this.runtime(id),saved=this.records().find(e=>e.data.id===id)!;
    const usage=new SessionUsage({root:runtime.session.root,sessionId:id}).read();
    return projectMission({id,project:String(saved.data.project),events:runtime.session.core.toSession().events,busy:runtime.store.get().busy,live:true,usage,confirmation:runtime.producer.checkConfirmation?.()??null});
  }
  private command(op:string,input:Record<string,unknown>,run:()=>string){
    if(!this.options.allowMutations)throw Error('Mission mutations are disabled by the local owner.');
    this.control.assertWritable();
    const id=input.requestId;
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('A bounded requestId is required.');
    const digest=createHash('sha256').update(JSON.stringify(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
    const history=this.control.core.toSession().events.filter(e=>e.subject==='mission.command'&&e.data.requestId===id);
    if(history.length){const prior=history.at(-1)!;if(prior.data.op!==op||prior.data.digest!==digest)throw Error('Conflicting requestId reuse.');if(prior.data.phase!=='completed')throw Error('Previous request was interrupted or refused. Inspect before another mutation.');return this.get(String(prior.data.missionId));}
    this.control.core.append({kind:'note',subject:'mission.command',data:{op,digest,requestId:id,phase:'requested'}});
    try{const missionId=run();this.control.core.append({kind:'note',subject:'mission.command',data:{op,digest,requestId:id,phase:'completed',missionId}});return this.get(missionId);}
    catch(error){this.control.core.append({kind:'note',subject:'mission.command',data:{op,digest,requestId:id,phase:'refused'}});throw error;}
  }
  start(input:{project:string;objective:string;requestId:string}){
    return this.command('start',input,()=>{
      if(!Object.hasOwn(this.projects,input.project)||!input.objective.trim()||input.objective.length>20000||input.objective.trim().startsWith('/'))throw Error('Select a configured project and a bounded natural-language objective.');
      if(this.records().some(e=>e.data.project===input.project&&this.runtime(String(e.data.id)).store.get().busy))throw Error('This project already has an active mission. Steer that mission.');
      const runtime=this.construct(input.project),id=runtime.session.metadata.id;
      this.runtimes.set(id,runtime);this.control.core.append({kind:'note',subject:'mission.registration',data:{id,project:input.project,path:this.projects[input.project]!.path}});
      runtime.producer.say(input.objective);return id;
    });
  }
  steer(input:{missionId:string;text:string;expectedRevision:number;requestId:string}){
    return this.command('steer',input,()=>{
      const before=this.get(input.missionId);
      if(before.revision!==input.expectedRevision)throw Error('Mission revision changed. Read it before steering.');
      if(before.state==='verified')throw Error('Verified mission is closed; admit a new objective instead.');
      if(!this.runtime(input.missionId).producer.steer?.(input.text))throw Error('Correction was refused; no new mission was started.');
      return input.missionId;
    });
  }
  stop(input:{missionId:string;requestId:string}){return this.command('stop',input,()=>{this.runtime(input.missionId).producer.cancel?.();return input.missionId;});}
  async close(){
    for(const r of this.runtimes.values())r.producer.cancel?.();
    const deadline=Date.now()+3000;
    while([...this.runtimes.values()].some(r=>r.store.get().busy)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
    for(const r of this.runtimes.values())r.session.close();this.control.close();
  }
}
