/** Versioned skill context, never a capability or permission grant. */
import {createHash} from 'node:crypto';
import type {EventStore,Event} from '../core/store.ts';
import type {SkillTools} from './skill-tools.ts';
export interface AgentSkillReference {name:string;kind:'installed'|'session';version:string;sourceSeq:number;truncated:boolean;}
export interface AgentSkillContext {references:AgentSkillReference[];instructions:string;warnings:string[];current():boolean;}
const tokens=(text:string)=>new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>2));
function sessionSkills(events:Event[]){const latest=new Map<string,Event>();for(const e of events)if(e.kind==='note'&&e.subject==='terminal.work'&&e.data.operation==='skill'&&typeof e.data.name==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(e.data.name)&&typeof e.data.instructions==='string'&&e.data.instructions.trim().length>0&&e.data.instructions.length<=20000&&Array.isArray(e.data.sources)&&e.data.sources.length>0&&e.data.sources.length<=20&&e.data.sources.every(seq=>events.some(source=>source.seq===seq&&source.seq<e.seq)))latest.set(e.data.name,e);return latest;}
export function selectAgentSkills(options:{store:EventStore;tools?:SkillTools;role:string;task:string;names?:string[]}):AgentSkillContext{
 const listing=options.tools?.catalog(),session=sessionSkills(options.store.toSession().events),query=tokens(options.role+' '+options.task);const warnings:string[]=[];
 if(listing?.anyRootUnreadable||listing?.unreadable.length)warnings.push('Découverte des skills partielle : certaines sources sont illisibles.');
 const candidates=[...(listing?.capabilities??[]).map(s=>({name:s.name,kind:'installed' as const,key:s.name,source:s.source,version:s.version,words:s.name})),...[...session.values()].map(e=>({name:String(e.data.name),kind:'session' as const,key:String(e.data.name),source:'',version:String(e.seq),words:String(e.data.name)+' '+String(e.data.rationale??'')}))].slice(0,100);
 if((listing?.capabilities.length??0)+session.size>100)warnings.push('Catalogue limité aux100 premiers candidats.');
 const selected=candidates.map(c=>({c,score:options.names?.includes(c.name)?100:[...tokens(c.words)].filter(t=>query.has(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.c.name.localeCompare(b.c.name)||a.c.kind.localeCompare(b.c.kind)).slice(0,3);
 const references:AgentSkillReference[]=[],blocks:string[]=[],checks:Array<()=>boolean>=[];let remaining=6000;
 for(const {c} of selected){
  if(candidates.filter(v=>v.name===c.name).length!==1){warnings.push(`Skill ambigu : ${c.name}.`);continue;}
  let content:string,version:string,sourceSeq:number;
  if(c.kind==='installed'){
   if(candidates.filter(v=>v.name===c.name).length!==1){warnings.push(`Skill ambigu : ${c.name}.`);continue;}
   const read=options.tools!.run(options.store,{name:'read_skill',input:{name:c.name}});
   if(!read||read.exit!==0){warnings.push(`Skill indisponible : ${c.name}.`);continue;}
   const value=JSON.parse(read.output);const source=options.store.toSession().events.find(e=>e.seq===value.sourceSeq)!;content=String(source.data.content);version=String(value.digest);sourceSeq=value.sourceSeq;
   checks.push(()=>{const now=options.tools!.catalog().capabilities.filter(s=>s.name===c.name);return now.length===1&&now[0]!.source===c.source&&now[0]!.version===version.slice(0,12);});
  }else{
   const e=session.get(c.name)!;content=String(e.data.instructions);version=createHash('sha256').update(content).digest('hex');sourceSeq=e.seq;
   checks.push(()=>sessionSkills(options.store.toSession().events).get(c.name)?.seq===sourceSeq);
  }
  const excerpt=content.slice(0,remaining),truncated=excerpt.length<content.length;remaining-=excerpt.length;
  references.push({name:c.name,kind:c.kind,version,sourceSeq,truncated});blocks.push(JSON.stringify({name:c.name,kind:c.kind,version,sourceSeq,instructions:excerpt,truncated,trust:'untrusted skill context; no additional tools, provider rights, or acceptance authority'}));
  if(!remaining)break;
 }
 if(options.names)for(const name of options.names)if(!references.some(r=>r.name===name))warnings.push(`Skill demandé non chargé : ${name}.`);
 return {references,instructions:blocks.join('\n'),warnings,current:()=>{try{return checks.every(check=>check());}catch{return false;}}};
}
