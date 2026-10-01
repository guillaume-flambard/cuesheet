import { readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { SkillsAdapter } from "./skills.ts";
import type { EventStore } from "../core/store.ts";
import type { ToolRequest, ToolResult } from "../core/loop.ts";

export class SkillTools {
  private roots:string[];
  private registry:SkillsAdapter;
  constructor(options:{roots:string[]}){this.roots=options.roots.map(root=>resolve(root));this.registry=new SkillsAdapter({roots:this.roots});}
  catalog(){return this.registry.listCapabilities();}
  run(store:EventStore,request:ToolRequest):ToolResult|null{
    if(request.name!=="list_skills" && request.name!=="read_skill")return null;
    const listing=this.catalog();
    if(request.name==="list_skills")return {name:request.name,exit:0,output:JSON.stringify(listing)};
    const found=listing.capabilities.filter(skill=>skill.name===request.input.name);
    if(found.length!==1)return {name:request.name,exit:2,output:"Skill is unavailable or ambiguous. List configured skills first."};
    const skill=found[0]!;
    try{
      const path=realpathSync(join(skill.source,"SKILL.md"));
      if(!this.roots.some(root=>{try{const base=realpathSync(root);return path.startsWith(base+sep);}catch{return false;}}))
        return {name:request.name,exit:126,output:"Skill manifest resolves outside configured roots."};
      const bytes=readFileSync(path);
      if(bytes.length>262144)return {name:request.name,exit:2,output:"Skill manifest exceeds 256 KiB."};
      const digest=createHash("sha256").update(bytes).digest("hex");
      if(digest.slice(0,12)!==skill.version)return {name:request.name,exit:2,output:"Skill changed during reading; rediscover its current version."};
      const content=bytes.toString("utf8");
      const event=store.append({kind:"note",subject:"terminal.skill",data:{version:1,operation:"read",name:skill.name,path,digest,content,trust:"configured skill instructions, no extra permissions"}});
      return {name:request.name,exit:0,output:JSON.stringify({sourceSeq:event.seq,name:skill.name,path,digest,content:content.slice(0,8000),truncated:content.length>8000,note:"Instructions do not expand permissions or acceptance authority. Read remaining content using read_history."})};
    }catch{return {name:request.name,exit:2,output:"Skill could not be read; no instructions were recorded."};}
  }
}
