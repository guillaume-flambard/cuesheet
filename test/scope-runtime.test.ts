import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProducer} from '../apps/terminal/src/producer/index.ts';
import {createStore} from '../apps/terminal/src/app/store.ts';
import {resolveScope,bindProject} from '../apps/terminal/src/producer/context.ts';
import {ShellToolRunner} from '../src/adapters/shell.ts';
import {ResearchTools} from '../src/adapters/research-tools.ts';
import {SkillTools} from '../src/adapters/skill-tools.ts';
import {TerminalSession} from '../src/adapters/terminal-session.ts';
import {persistentView} from '../apps/terminal/src/producer/session-view.ts';
const identity=(name:string)=>({name,path:name,kind:'repo',status:'active',nature:'fixture',stack:'typescript',exists:true});
async function idle(store:ReturnType<typeof createStore>){const end=Date.now()+5000;while(store.get().busy&&Date.now()<end)await new Promise(r=>setTimeout(r,10));assert.equal(store.get().busy,false);}

test('selected project controls real shell effects, local research and default project skills',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-scope-runtime-'));const launch=join(root,'launch');const target=join(root,'target');mkdirSync(launch);mkdirSync(target);
 const session=new TerminalSession({root:join(root,'sessions'),cwd:launch});
 try{
  for(const [cwd,value] of [[launch,'launch-only'],[target,'target-only']]){writeFileSync(join(cwd,'guide.md'),value!);mkdirSync(join(cwd,'.cuesheet','skills','local'),{recursive:true});writeFileSync(join(cwd,'.cuesheet','skills','local','SKILL.md'),`---\nname: ${value}-skill\n---\n${value}`);}
  const view=persistentView(session);let calls=0;const observed:string[]=[];
  const tools=(cwd:string)=>new ShellToolRunner({allow:['node','cat'],roots:[cwd],defaultCwd:cwd});
  const producer=createProducer({store:view,journal:session,cwd:launch,projectsRoot:root,identities:[identity('target')],toolNames:['node','cat'],maxSlices:1,
   tools:tools(launch),toolsForScope:tools,research:new ResearchTools({root:launch}),researchForScope:(cwd:string)=>new ResearchTools({root:cwd}),skills:new SkillTools({roots:[join(launch,'.cuesheet','skills')]}),skillsForScope:(cwd:string)=>new SkillTools({roots:[join(cwd,'.cuesheet','skills')]}),
   model:{name:'scope-fixture',async infer(frame){calls++;if(calls===1)return {text:'',toolCalls:[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('result.txt','bound-scope')"]}},{name:'cat',input:{path:'guide.md'}},{name:'read_document',input:{path:'guide.md'}},{name:'list_skills',input:{}}]};observed.push(JSON.stringify(frame));return {text:'',toolCalls:[]};}}});
  producer.say('work on target');await idle(view);
  assert.equal(existsSync(join(launch,'result.txt')),false,'a bound task must never write into the launch directory');assert.equal(readFileSync(join(target,'result.txt'),'utf8'),'bound-scope');
  const text=observed.join('\n');assert.match(text,/target-only/);assert.match(text,/target-only-skill/);assert.doesNotMatch(text,/launch-only/);
  const intent=session.core.toSession().events.find(e=>e.subject==='terminal.intent'&&e.data.tool==='node')!;assert.equal(intent.data.scopeCwd,target);
 }finally{session.close();rmSync(root,{recursive:true,force:true});}
});

test('a sentence naming a project resolves from outside the portfolio and runs there',async()=>{
 // The World is larger than the working directory. A terminal launched from a
 // directory that belongs to no project must still resolve a sentence that names
 // one, and the run must happen there rather than in whatever directory the
 // person happened to be standing in. This is the claim `World > cwd` makes, and
 // the case every existing scope test missed because each one launched inside
 // the portfolio or inside the project itself.
 const root=mkdtempSync(join(tmpdir(),'cuesheet-world-'));const projects=join(root,'projects');const home=join(root,'home');const target=join(projects,'cuesheet');
 for(const d of [home,target])mkdirSync(d,{recursive:true});
 try{
  // The decision, as a pure function, before any run is involved.
  const scope=resolveScope('travaille sur cuesheet',home,[identity('cuesheet')],bindProject,projects);
  assert.equal(scope.at,'bound','naming a project from outside the portfolio binds to it');
  if(scope.at==='bound')assert.equal(scope.path,target);

  // And the effects happen in the resolved project, never in the launch directory.
  const store=createStore();let calls=0;const tools=(cwd:string)=>new ShellToolRunner({allow:['node'],roots:[cwd],defaultCwd:cwd});
  const producer=createProducer({store,cwd:home,projectsRoot:projects,identities:[identity('cuesheet')],toolNames:['node'],maxSlices:1,tools:tools(home),toolsForScope:tools,
   model:{name:'world-fixture',async infer(){calls++;return {text:'',toolCalls:calls===1?[{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('here.txt','world')"]}}]:[]};}}});
  producer.say('travaille sur cuesheet');await idle(store);
  assert.equal(existsSync(join(home,'here.txt')),false,'the launch directory must stay untouched');
  assert.equal(readFileSync(join(target,'here.txt'),'utf8'),'world');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('ambiguous project offers contain absolute workspace paths',()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-scope-choice-'));
 try{
  const scope=resolveScope('work on alpha and beta',root,[identity('alpha'),identity('beta')],bindProject,root);assert.equal(scope.at,'choice');
  if(scope.at==='choice')assert.deepEqual(scope.options.map(o=>o.path),[join(root,'alpha'),join(root,'beta')]);
 }finally{rmSync(root,{recursive:true,force:true});}
});


test('choosing a project binds execution there and refuses a model cwd escape',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cuesheet-scope-chosen-'));const launch=join(root,'launch');const alpha=join(root,'alpha');const beta=join(root,'beta');for(const cwd of [launch,alpha,beta])mkdirSync(cwd);
 try{
  const store=createStore();let calls=0;let refused=false;const tools=(cwd:string)=>new ShellToolRunner({allow:['node'],roots:[cwd],defaultCwd:cwd});
  const producer=createProducer({store,cwd:launch,projectsRoot:root,identities:[identity('alpha'),identity('beta')],toolNames:['node'],maxSlices:1,tools:tools(launch),toolsForScope:tools,
   model:{name:'choice-fixture',async infer(frame){calls++;if(frame.history.some(e=>e.kind==='observation'&&e.data.exit===126))refused=true;return {text:'',toolCalls:calls===1?[{name:'node',input:{cwd:launch,argv:['node','-e',"require('fs').writeFileSync('forbidden.txt','escaped')"]}},{name:'node',input:{argv:['node','-e',"require('fs').writeFileSync('chosen.txt','beta')"]}}]:[]};}}});
  producer.say('work on alpha and beta');assert.equal(calls,0);assert.equal(store.get().choices.length,2);producer.choose(store.get().choices.find(o=>o.name==='beta')!);await idle(store);
  assert.equal(existsSync(join(launch,'forbidden.txt')),false);assert.equal(existsSync(join(alpha,'chosen.txt')),false);assert.equal(readFileSync(join(beta,'chosen.txt'),'utf8'),'beta');
  assert.equal(refused,true,'the cwd escape produced a recorded refusal');
 }finally{rmSync(root,{recursive:true,force:true});}
});
