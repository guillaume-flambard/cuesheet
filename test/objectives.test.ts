import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { createObjective, bindObjectiveCheck, correctObjective, projectObjectives, verifyObjective } from "../src/adapters/objectives.ts";
import { organizeWork, projectOrganization } from "../src/adapters/work-organizer.ts";
import { TerminalSession } from "../src/adapters/terminal-session.ts";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const digest = "a".repeat(64);
function request(store: EventStore, text = "repair") {
  const source = store.append({ kind: "note", subject: "terminal.user", data: { text } });
  return createObjective(store, text, "/workspace", source.seq, digest);
}

test("identical requests have distinct stable IDs; human correction preserves identity and expires old plans", () => {
  const store = new EventStore("goals", () => 0);
  const first = request(store); const second = request(store);
  assert.notEqual(first.id, second.id);
  organizeWork(store, { name: "organize_work", input: { phase: "spec", rationale: "define", spec: "repair API", tasks: ["check API"] } });
  assert.ok(projectOrganization(store.toSession().events).plan);
  const source = store.append({ kind: "directive", subject: "builder", data: { text: "preserve schema" } });
  const corrected = correctObjective(store, "preserve schema", source.seq)!;
  assert.equal(corrected.id, second.id);
  assert.ok(corrected.revision > second.revision);
  const stalePlan = projectOrganization(store.toSession().events).plan!;
  assert.equal(stalePlan.current, false);
  assert.equal(stalePlan.objectiveRevision, second.revision);
  const beforeReadmission = store.revision;
  assert.equal(organizeWork(store, {name:"organize_work",input:{phase:"build",rationale:"reuse old plan"}})!.exit, 2);
  assert.equal(store.revision, beforeReadmission);
  assert.equal(corrected.check!.boundRevision, second.revision);
  assert.equal(corrected.corrections[0]!.source, source.seq);
  assert.deepEqual(projectObjectives(store.toSession().events), projectObjectives(store.toSession().events));
});

test("model descriptions are hypotheses; cycles and malformed records write nothing", () => {
  const store = new EventStore("goals", () => 0);
  const one = request(store); const two = request(store);
  const describe = (dependencies: string[]) => organizeWork(store, { name: "describe_objective", input: {
    text: "clear result", rationale: "derived", exclusions: [], dependencies, constraints: ["preserve schema"], criteria: ["generated test passes"],
  } });
  assert.equal(describe([one.id])!.exit, 0);
  const current = projectObjectives(store.toSession().events).current!;
  assert.equal(current.id, two.id);
  assert.equal(current.author, "human", "original intent retains human provenance");
  assert.equal(current.check!.boundRevision, two.revision, "model does not reauthorize its generated criteria");
  const before = store.revision;
  assert.equal(describe([two.id])!.exit, 2);
  assert.equal(describe(["unknown"])!.exit, 2);
  assert.equal(store.revision, before);
  store.append({kind:"note",subject:"terminal.objective",data:{version:1,operation:"status",id:one.id,expected:one.revision,status:"active",reason:"select previous work"}});
  const cycleBasis=store.revision;
  assert.equal(describe([two.id])!.exit,2,"a transitive cycle is also refused");
  assert.equal(store.revision,cycleBasis);
  const invalid = { kind: "note" as const, subject: "terminal.objective", seq: before + 1, at: 0,
    data: { version: 2, operation: "describe", id: two.id } };
  assert.throws(() => projectObjectives([...store.toSession().events, invalid]), /Invalid objective/);
  assert.equal(store.toSession().evidence.length, 0);
});

test("durable objectives reload and a corrupt version refuses without rewriting journals", () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-objectives-"));
  let session: TerminalSession | undefined;
  try {
    session = new TerminalSession({root,cwd:root});
    const id=session.metadata.id;
    request(session.core);
    const original=projectObjectives(session.core.toSession().events);
    session.close();session=new TerminalSession({root,cwd:root,id});
    assert.deepEqual(projectObjectives(session.core.toSession().events),original);
    assert.throws(()=>session!.core.append({kind:"note",subject:"terminal.objective",data:{version:999,id:original.current!.id}}),/Invalid objective/);
    assert.deepEqual(projectObjectives(session.core.toSession().events),original);
    session.close();session=undefined;
    const path=join(root,`${id}.jsonl`);
    const bytes=readFileSync(path,"utf8");
    const lines=bytes.trim().split("\n").map(line=>JSON.parse(line));
    lines.find(event=>event.subject==="terminal.objective").data.version=999;
    const corrupt=lines.map(event=>JSON.stringify(event)).join("\n")+"\n";
    writeFileSync(path,corrupt);
    assert.throws(()=>new TerminalSession({root,cwd:root,id}),/Invalid objective/);
    assert.equal(readFileSync(path,"utf8"),corrupt);
  } finally {session?.close();rmSync(root,{recursive:true,force:true});}
});

test("proof is bound to the authoritative contract revision, never model prose or a stale check", () => {
  const store = new EventStore("proof", () => 0);
  const objective = request(store);
  const verification = store.append({ kind: "work_verified", subject: "effect", data: { verdict: "VERIFIED", record: "/proof.json", checkDigest: digest, objectiveId: objective.id, objectiveRevision: objective.revision } });
  assert.equal(verifyObjective(store, verification, digest, "/proof.json"), true);
  assert.equal(projectObjectives(store.toSession().events).current!.status, "verified");
  const source = store.append({ kind: "directive", subject: "builder", data: { text: "new requirement" } });
  correctObjective(store, "new requirement", source.seq);
  assert.equal(projectObjectives(store.toSession().events).current!.status, "active");
  assert.equal(verifyObjective(store, verification, digest, "/proof.json"), false);
  assert.equal(projectObjectives(store.toSession().events).current!.id, objective.id);
});

test("legacy goals replay with sequence identities and unknown authorship without migration writes", () => {
  const store = new EventStore("legacy", () => 0);
  store.append({ kind: "goal", subject: "builder", data: { text: "same" } });
  store.append({ kind: "goal", subject: "builder", data: { text: "same" } });
  const before = store.revision;
  const projected = projectObjectives(store.toSession().events);
  assert.equal(projected.objectives.length, 2);
  assert.equal(projected.current!.id, "legacy-goal-2");
  assert.equal(projected.current!.author, "unknown");
  assert.equal(projected.current!.check, null);
  assert.equal(store.revision, before);
});


test("human check renewal requires an exact receipt and rejects earlier proof",()=>{
 const store=new EventStore('renew',()=>0);const original=request(store);
 const proof=store.append({kind:'work_verified',subject:'effect',data:{verdict:'VERIFIED',record:'/old.json',checkDigest:digest,objectiveId:original.id,objectiveRevision:original.revision}});
 const correction=store.append({kind:'directive',subject:'builder',data:{text:'new requirement'}});const changed=correctObjective(store,'new requirement',correction.seq)!;
 const before=store.revision;assert.equal(bindObjectiveCheck(store,{id:changed.id,revision:original.revision,digest,source:correction.seq}),false);assert.equal(store.revision,before);
 assert.throws(()=>bindObjectiveCheck(store,{id:changed.id,revision:changed.revision,digest,source:correction.seq}),/Invalid objective/);assert.equal(store.revision,before);
 const confirmation=store.append({kind:'note',subject:'terminal.user',data:{operation:'confirm_check',objectiveId:changed.id,objectiveRevision:changed.revision,checkDigest:digest}});
 assert.equal(bindObjectiveCheck(store,{id:changed.id,revision:changed.revision,digest,source:confirmation.seq}),true);
 const renewed=projectObjectives(store.toSession().events).current!;assert.equal(renewed.id,original.id);assert.equal(renewed.check!.boundRevision,renewed.revision);assert.equal(renewed.corrections.length,1);
 assert.equal(verifyObjective(store,proof,digest,'/old.json'),false);
 const fresh=store.append({kind:'work_verified',subject:'effect',data:{verdict:'VERIFIED',record:'/new.json',checkDigest:digest,objectiveId:renewed.id,objectiveRevision:renewed.revision}});assert.equal(verifyObjective(store,fresh,digest,'/new.json'),true);
});
