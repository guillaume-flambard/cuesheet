import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {TerminalSession} from "../src/adapters/terminal-session.ts";
import {EventStore} from "../src/core/store.ts";
import {organizeWork, projectOrganization} from "../src/adapters/work-organizer.ts";
import {projectWorkPlans} from "../src/adapters/work-plans.ts";
import {createObjective, correctObjective} from "../src/adapters/objectives.ts";
const plan = (store: EventStore, fields: Record<string, unknown>) => organizeWork(store,{name:"organize_work",input:{phase:"spec",rationale:"Define the deliverable",...fields}})!;

test("plans retain identities, distinguish repeated task text and admit explicit revisions",()=>{
  const store=new EventStore("plans", () => 0);
  assert.equal(plan(store,{spec:"Preserve API",tasks:["inspect","inspect"]}).exit,0);
  const first=projectOrganization(store.toSession().events).plan!;
  assert.notEqual(first.taskRecords![0].id,first.taskRecords![1].id);
  assert.equal(plan(store,{phase:"build"}).exit,0);
  const next=projectOrganization(store.toSession().events).plan!;
  assert.equal(next.id,first.id);assert.deepEqual(next.taskRecords,first.taskRecords);
  const [a,b]=next.taskRecords!;
  assert.equal(plan(store,{tasks:[{id:a.id,text:"inspect schema",expected:"schema documented",dependencies:[]},{id:b.id,text:"inspect",expected:"inspect",dependencies:[a.id]}]}).exit,0);
  const revised=projectOrganization(store.toSession().events).plan!;
  assert.equal(revised.taskRecords![0].id,a.id);assert.ok(revised.taskRecords![0].revision>a.revision);
  assert.deepEqual(revised.taskRecords![1].dependencies,[a.id]);
  assert.equal(store.toSession().evidence.length,0);
});

test("invalid, cyclic and missing task dependencies refuse without changing the journal",()=>{
  const store=new EventStore("plans", () => 0);plan(store,{tasks:["a","b"]});
  const [a,b]=projectOrganization(store.toSession().events).plan!.taskRecords!;
  const seq=store.revision;
  for(const tasks of [[{id:a.id,text:"a",expected:"result",dependencies:[b.id]},{id:b.id,text:"b",expected:"result",dependencies:[a.id]}],
    [{id:a.id,text:"a",expected:"result",dependencies:["unknown"]}],
    [{id:a.id,text:"a",expected:"result",dependencies:[a.id]}],
    [{id:"new-untrusted-id",text:"a",expected:"result",dependencies:[]}],
    [{text:"a"}], [42]]) {
    assert.equal(plan(store,{tasks}).exit,2);assert.equal(store.revision,seq);
  }
});

test("correction exposes stale plan and requires explicit spec/tasks before readmission",()=>{
  const store=new EventStore("plans", () => 0);
  const user=store.append({kind:"note",subject:"terminal.user",data:{text:"keep API"}});
  const objective=createObjective(store,"keep API","project",user.seq);
  plan(store,{spec:"Keep old API",tasks:["check API"]});const prior=projectOrganization(store.toSession().events).plan!;
  const correction=store.append({kind:"note",subject:"terminal.user",data:{text:"also support Unicode"}});
  correctObjective(store,"also support Unicode",correction.seq);
  const stale=projectOrganization(store.toSession().events).plan!;assert.equal(stale.current,false);assert.equal(stale.id,prior.id);
  const seq=store.revision;assert.equal(plan(store,{phase:"build"}).exit,2);assert.equal(store.revision,seq);
  assert.equal(plan(store,{spec:"Keep API and Unicode",tasks:["check API","check Unicode"]}).exit,0);
  const current=projectOrganization(store.toSession().events).plan!;assert.equal(current.current,true);assert.equal(current.objectiveId,objective.id);assert.equal(current.id,prior.id);
  assert.equal(current.taskRecords![0].id,prior.taskRecords![0].id);
});

test("legacy projection is read-only; versioned corruption and resurrection are rejected",()=>{
  const store=new EventStore("legacy", () => 0);
  store.append({kind:"note",subject:"terminal.work",data:{operation:"plan",goal:null,phase:"spec",rationale:"legacy",spec:"old",tasks:["old"]}});
  const bytes=JSON.stringify(store.toSession().events);assert.equal(projectOrganization(store.toSession().events).plan!.id,null);assert.equal(JSON.stringify(store.toSession().events),bytes);
  plan(store,{phase:"build"});const record=store.toSession().events.at(-1)!;
  assert.throws(()=>projectWorkPlans([...store.toSession().events.slice(0,-1),{...record,data:{...record.data,version:99}}]),/Invalid work plan/);
  const old=projectOrganization(store.toSession().events).plan!.taskRecords![0];
  plan(store,{tasks:[]});const seq=store.revision;
  assert.equal(plan(store,{tasks:[{id:old.id,text:old.text,expected:old.expected,dependencies:[]}]}).exit,2);assert.equal(store.revision,seq);
});

test("durable plan reload preserves identities and refuses corrupt records without rewriting",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-plan-replay-"));let session:TerminalSession|undefined;
  try {
    session=new TerminalSession({root,cwd:root});
    assert.equal(plan(session.core,{spec:"durable spec",tasks:["inspect","build"]}).exit,0);
    const original=projectOrganization(session.core.toSession().events);
    const id=session.metadata.id;session.close();
    session=new TerminalSession({root,cwd:root,id});
    assert.deepEqual(projectOrganization(session.core.toSession().events),original);
    const seq=session.core.revision;
    const record=session.core.toSession().events.at(-1)!;
    assert.throws(()=>session!.core.append({...record,data:{...record.data,version:99}}),/Invalid work plan/);
    assert.equal(session.core.revision,seq);
    session.close();session=undefined;
    const path=join(root,`${id}.jsonl`);
    const bytes=readFileSync(path,"utf8");
    const corrupt=bytes.split("\n").map(line=>line ? JSON.stringify({...JSON.parse(line),data:{...JSON.parse(line).data,version:99}}):line).join("\n");
    writeFileSync(path,corrupt);
    assert.throws(()=>new TerminalSession({root,cwd:root,id}),/Invalid work plan/);
    assert.equal(readFileSync(path,"utf8"),corrupt);
  } finally {session?.close();rmSync(root,{recursive:true,force:true});}
});
