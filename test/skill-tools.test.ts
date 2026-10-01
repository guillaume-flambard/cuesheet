import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillTools } from "../src/adapters/skill-tools.ts";
import { EventStore } from "../src/core/store.ts";
import { surfaceEnvironment } from "../src/surface-cli.ts";

test("installed skills are discovered live and read lazily into sourced records",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-skill-tools-"));
  try{
    mkdirSync(join(root,"procedure"));
    const manifest=join(root,"procedure","SKILL.md");
    writeFileSync(manifest,"---\nname: check-output\n---\nRead exact bytes and use the declared acceptance check.");
    const skills=new SkillTools({roots:[root]});const store=new EventStore("skills",()=>0);
    const listing=JSON.parse(skills.run(store,{name:"list_skills",input:{}})!.output);
    assert.equal(listing.capabilities[0].name,"check-output");assert.equal(store.revision,-1);
    const result=skills.run(store,{name:"read_skill",input:{name:"check-output"}})!;
    assert.equal(result.exit,0);assert.equal(JSON.parse(result.output).sourceSeq,1);
    assert.equal(store.toSession().events[0]!.data.trust,"configured skill instructions, no extra permissions");
    const previous=listing.capabilities[0].version;
    writeFileSync(manifest,"name: check-output\nA revised procedure.");
    assert.notEqual(skills.catalog().capabilities[0]!.version,previous);
    assert.equal(store.toSession().evidence.length,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("unknown, unreadable and escaped manifests remain distinguishable and publish no instruction",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-skill-refusals-"));
  try{
    const base=join(root,"registry");mkdirSync(base);mkdirSync(join(base,"escaped"));
    const outside=join(root,"outside.md");writeFileSync(outside,"name: private-source\nprivate content");
    symlinkSync(outside,join(base,"escaped","SKILL.md"));
    const skills=new SkillTools({roots:[base,join(root,"missing")]});const store=new EventStore("refuse",()=>0);
    const listing=skills.catalog();
    assert.equal(listing.capabilities.length,0);assert.equal(listing.anyRootUnreadable,true);
    assert.match(listing.unreadable[0]!.reason,/outside/);
    assert.equal(skills.run(store,{name:"read_skill",input:{name:"private-source"}})!.exit,2);
    assert.equal(store.revision,-1);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("launcher forwards only explicitly named research and skill settings",()=>{
  const env=surfaceEnvironment([],{CUESHEET_SEARCH_PROVIDER:"brave",BRAVE_SEARCH_API_KEY:"fixture-key",CUESHEET_SKILL_ROOTS:"/fixture/skills",UNRELATED_SECRET:"hidden"});
  assert.equal(env.CUESHEET_SEARCH_PROVIDER,"brave");assert.equal(env.BRAVE_SEARCH_API_KEY,"fixture-key");
  assert.equal(env.CUESHEET_SKILL_ROOTS,"/fixture/skills");assert.equal(env.UNRELATED_SECRET,undefined);
});
