import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {EventStore} from "../src/core/store.ts";
import {SkillTools} from "../src/adapters/skill-tools.ts";
import {skillRootsForScope} from "../src/adapters/skill-scope.ts";
import {selectAgentSkills} from "../src/adapters/agent-skills.ts";
import {consultAgents,projectAgents} from "../src/adapters/agent-consultation.ts";
import type {ContextFrame} from "../src/core/loop.ts";

const ownerTask = "Verify the evidence and launch readiness of a real project issue.";

test("external skill library is opt-in for one exact project, not adjacent projects",()=>{
  const root=mkdtempSync(join(tmpdir(),"cs-founder-scope-"));
  try {
    const project=join(root,"emargo"),other=join(root,"other"),lookalike=join(root,"emargo-other");
    const library=join(root,"founder-skills");for(const path of [project,other,lookalike,library])mkdirSync(path);
    const config={CUESHEET_SKILL_ROOTS:library,CUESHEET_SKILL_PROJECT:project};
    assert.deepEqual(skillRootsForScope(project,config),[library]);
    assert.deepEqual(skillRootsForScope(other,config),[join(other,".cuesheet","skills")]);
    assert.deepEqual(skillRootsForScope(lookalike,config),[join(lookalike,".cuesheet","skills")]);
    assert.throws(()=>skillRootsForScope(project,{CUESHEET_SKILL_ROOTS:library}),/CUESHEET_SKILL_PROJECT/);
    assert.throws(()=>skillRootsForScope(project,{CUESHEET_SKILL_ROOTS:"relative/path",CUESHEET_SKILL_PROJECT:project}),/absolute/);
    assert.deepEqual(skillRootsForScope(project,{}),[join(project,".cuesheet","skills")]);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("Emargo-style issue drives real SkillsAdapter -> SkillTools -> consultant with pinned receipts",async()=>{
  const base=mkdtempSync(join(tmpdir(),"cs-founder-realpath-"));
  const project=join(base,"emargo"),library=join(base,"memo-founder-skills","skills");
  mkdirSync(project);mkdirSync(library,{recursive:true});
  try {
    for(const [name,body] of [
      ["evidence-verification","Distinguish original source evidence from project hearsay."],
      ["opportunity-qualification","Do not treat vendor prices as verified customer purchases."],
      ["product-launch-readiness","Require completed end to end user journeys before public launch."]
    ]) {
      const dir=join(library,name);mkdirSync(dir);
      writeFileSync(join(dir,"SKILL.md"),`---
name: ${name}
description: ${body}
---
# ${name}
${body}
`);
    }
    const tools=new SkillTools({roots:skillRootsForScope(project,{
      CUESHEET_SKILL_PROJECT:project,CUESHEET_SKILL_ROOTS:library
    })});
    const log=new EventStore("founder-issue",()=>0);
    const names=["evidence-verification","opportunity-qualification","product-launch-readiness"];
    const skills=selectAgentSkills({store:log,tools,role:"founder",task:ownerTask,names});
    assert.deepEqual(skills.references.map(r=>r.name),names);
    assert(skills.references.every(ref=>ref.version.length===64&&ref.sourceSeq>0));
    assert.equal(skills.current(),true);
    assert.match(skills.instructions,/Do not treat vendor prices/);

    const frame:ContextFrame={goal:"Audit a founder issue",history:[],directives:[],evidence:[],capabilities:[],model:"fixture",step:0};
    const response=await consultAgents({
      input:{tasks:[{role:"founder",task:ownerTask,skills:names}]},
      frame,signal:new AbortController().signal,current:()=>true,
      append:event=>log.append(event),execution:"e-founder",modelLabel:"offline-fixture",notice:()=>{},
      model:{name:"offline-fixture",async infer(received){
        assert.deepEqual(received.capabilities,[]);
        const content=received.directives.at(-1)!.text;
        for(const name of names)assert.match(content,new RegExp(name));
        assert.match(content,/no additional tools/i);
        return {text:"Proposed steps only: validate sign-up, onboarding and invoicing before launch.",toolCalls:[]};
      }},
      skills:(role,task,selected)=>selectAgentSkills({store:log,tools,role,task,names:selected})
    });
    assert.equal(response.exit,0,response.output);
    const agent=projectAgents(log.toSession().events)[0]!;
    assert.equal(agent.phase,"result");
    assert.equal(agent.skills.length,3);
    assert(agent.skills.every(s=>s.kind==="installed"&&s.version.length===64));
    assert.equal(log.toSession().evidence.length,0,"A consultant is not an evidence source");
    const first=join(library,"evidence-verification","SKILL.md");
    writeFileSync(first,"name: evidence-verification\nnew version");
    assert.equal(skills.current(),false,"A modified source invalidates its previous context");
  } finally {rmSync(base,{recursive:true,force:true});}
});

test("unreadable external registry cannot be represented as an empty proven catalog",()=>{
  const base=mkdtempSync(join(tmpdir(),"cs-founder-missing-"));
  try {
    const tools=new SkillTools({roots:[join(base,"missing")]});
    const log=new EventStore("missing-library",()=>0);
    const selection=selectAgentSkills({store:log,tools,role:"founder",task:ownerTask,names:["evidence-verification"]});
    assert.equal(selection.references.length,0);
    assert.match(selection.warnings.join(" "),/illisibles|non chargé/);
    assert.equal(tools.catalog().anyRootUnreadable,true);
  }finally{rmSync(base,{recursive:true,force:true});}
});
