import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { createObjective, bindObjectiveCheck, correctObjective, changeObjectiveStatus, projectObjectives, verifyObjective } from "../src/adapters/objectives.ts";
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


test("objective replay never invents a human author from missing or model provenance", () => {
  const source={kind:"note" as const,subject:"terminal.user",seq:1,at:0,data:{text:"repair"}};
  const record={kind:"note" as const,subject:"terminal.objective",seq:2,at:0,data:{version:1,operation:"create",id:"objective-2",text:"repair",scope:"/workspace",source:1}};
  const before=JSON.stringify([source,record]);
  for(const author of [undefined,"model","human","unknown"]){
    const data=author===undefined?record.data:{...record.data,author};
    const current=projectObjectives([source,{...record,data}]).current!;
    assert.equal(current.author,author??"unknown");assert.equal(current.descriptionAuthor,author??"unknown");
    assert.equal(current.originalText,"repair");assert.deepEqual(current.sources,[1]);
  }
  for(const author of ["robot",null,{},1])assert.throws(()=>projectObjectives([source,{...record,data:{...record.data,author}}]),/Invalid objective/);
  assert.equal(JSON.stringify([source,record]),before);
});


test("documentary objective never shows a false verified status", () => {
  // An objective whose proof is documentary has no programmatic check bound to
  // its contract, so no evidence may promote it: its state must keep saying
  // produced, not verified.
  const store = new EventStore("documentary", () => 0);
  const source = store.append({ kind: "note", subject: "terminal.user", data: { text: "write the migration report" } });
  const objective = createObjective(store, "write the migration report", "/workspace", source.seq);
  assert.equal(objective.check, null, "a documentary objective pins no programmatic check");
  const proof = store.append({ kind: "work_verified", subject: "effect",
    data: { verdict: "VERIFIED", record: "/report.json", checkDigest: digest, objectiveId: objective.id, objectiveRevision: objective.revision } });
  const before = store.revision;
  assert.equal(verifyObjective(store, proof, digest, "/report.json"), false, "evidence without a bound check cannot verify");
  assert.equal(store.revision, before, "the refusal writes nothing");
  assert.equal(projectObjectives(store.toSession().events).current!.status, "active");
  const forged = { kind: "note", subject: "terminal.objective", seq: store.revision + 1, at: 0,
    data: { version: 1, operation: "status", id: objective.id, expected: objective.revision, status: "verified", reason: "human review done" } };
  assert.throws(() => projectObjectives([...store.toSession().events, forged]), /Invalid objective/, "a status record cannot hand-write verified");
  assert.equal(store.revision, before);
  const root = mkdtempSync(join(tmpdir(), "cuesheet-documentary-"));
  let session: TerminalSession | undefined;
  try {
    session = new TerminalSession({root,cwd:root});
    const id = session.metadata.id;
    const note = session.core.append({ kind: "note", subject: "terminal.user", data: { text: "publish the audit note" } });
    const documented = createObjective(session.core, "publish the audit note", "/workspace", note.seq);
    const path = join(root, `${id}.jsonl`);
    const bytes = readFileSync(path, "utf8");
    assert.throws(() => session!.core.append({ kind: "note", subject: "terminal.objective",
      data: { version: 1, operation: "status", id: documented.id, expected: documented.revision, status: "verified", reason: "human review done" } }), /Invalid objective/);
    assert.equal(readFileSync(path, "utf8"), bytes, "the journal keeps no false verified record");
    assert.equal(projectObjectives(session.core.toSession().events).current!.status, "active");
    session.close(); session = new TerminalSession({root,cwd:root,id});
    assert.equal(projectObjectives(session.core.toSession().events).current!.status, "active", "reload still shows the true state");
  } finally {session?.close();rmSync(root,{recursive:true,force:true});}
});


test("every objective mutation reloads from the durable journal unchanged", () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-objectives-reload-"));
  let session: TerminalSession | undefined;
  const reload = () => {
    const before = projectObjectives(session!.core.toSession().events);
    const id = session!.metadata.id;
    session!.close(); session = new TerminalSession({root,cwd:root,id});
    assert.deepEqual(projectObjectives(session.core.toSession().events), before);
    return before;
  };
  try {
    session = new TerminalSession({root,cwd:root});
    request(session.core);
    const created = reload();
    const correction = session.core.append({ kind: "directive", subject: "builder", data: { text: "preserve schema" } });
    correctObjective(session.core, "preserve schema", correction.seq);
    const corrected = reload();
    assert.equal(corrected.current!.corrections.length, 1);
    assert.equal(organizeWork(session.core, { name: "describe_objective", input: {
      text: "clear result", rationale: "derived", exclusions: [], dependencies: [], constraints: ["preserve schema"], criteria: ["generated test passes"],
    } })!.exit, 0);
    const described = reload();
    assert.equal(described.current!.descriptionAuthor, "model");
    changeObjectiveStatus(session.core, "paused", "waiting for the owner");
    const paused = reload();
    assert.equal(paused.current!.status, "paused");
    const receipt = session.core.append({ kind: "note", subject: "terminal.user",
      data: { operation: "confirm_check", objectiveId: paused.current!.id, objectiveRevision: paused.current!.revision, checkDigest: digest } });
    assert.equal(bindObjectiveCheck(session.core, { id: paused.current!.id, revision: paused.current!.revision, digest, source: receipt.seq }), true);
    const bound = reload();
    assert.deepEqual(bound.current!.check, { digest, boundRevision: bound.current!.revision });
    const proof = session.core.append({ kind: "work_verified", subject: "effect",
      data: { verdict: "VERIFIED", record: "/proof.json", checkDigest: digest, objectiveId: bound.current!.id, objectiveRevision: bound.current!.revision } });
    assert.equal(verifyObjective(session.core, proof, digest, "/proof.json"), true);
    const verified = reload();
    assert.equal(verified.current!.status, "verified");
    assert.equal(verified.objectives.length, 1, "no mutation invented a second identity");
  } finally {session?.close();rmSync(root,{recursive:true,force:true});}
});


test("renewed check binding reloads with its human receipt and stays authoritative", () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-binding-reload-"));
  let session: TerminalSession | undefined;
  try {
    session = new TerminalSession({root,cwd:root});
    const id = session.metadata.id;
    const objective = request(session.core);
    const correction = session.core.append({ kind: "directive", subject: "builder", data: { text: "new requirement" } });
    const changed = correctObjective(session.core, "new requirement", correction.seq)!;
    assert.notEqual(changed.check!.boundRevision, changed.revision, "the pinned check is stale until a human renews it");
    const receipt = session.core.append({ kind: "note", subject: "terminal.user",
      data: { operation: "confirm_check", objectiveId: changed.id, objectiveRevision: changed.revision, checkDigest: digest } });
    assert.equal(bindObjectiveCheck(session.core, { id: changed.id, revision: changed.revision, digest, source: receipt.seq }), true);
    const renewed = projectObjectives(session.core.toSession().events).current!;
    session.close(); session = new TerminalSession({root,cwd:root,id});
    const loaded = projectObjectives(session.core.toSession().events).current!;
    assert.deepEqual(loaded, renewed, "the renewed binding replays exactly");
    assert.equal(loaded.id, objective.id, "identity survives the renewal and the reload");
    assert.equal(loaded.check!.digest, digest);
    assert.equal(loaded.check!.boundRevision, loaded.revision, "the renewed binding is authoritative after reload");
    assert.ok(loaded.sources.includes(receipt.seq), "the human receipt stays the provenance of the renewal");
    const stale = session.core.append({ kind: "work_verified", subject: "effect",
      data: { verdict: "VERIFIED", record: "/old.json", checkDigest: digest, objectiveId: loaded.id, objectiveRevision: changed.revision } });
    const before = session.core.revision;
    assert.equal(verifyObjective(session.core, stale, digest, "/old.json"), false, "proof from before the renewal still cannot close it");
    assert.equal(session.core.revision, before, "the refusal writes nothing");
    const fresh = session.core.append({ kind: "work_verified", subject: "effect",
      data: { verdict: "VERIFIED", record: "/new.json", checkDigest: digest, objectiveId: loaded.id, objectiveRevision: loaded.revision } });
    assert.equal(verifyObjective(session.core, fresh, digest, "/new.json"), true);
    const proven = projectObjectives(session.core.toSession().events).current!;
    assert.equal(proven.status, "verified");
    session.close(); session = new TerminalSession({root,cwd:root,id});
    assert.deepEqual(projectObjectives(session.core.toSession().events).current!, proven, "the verified state survives a second reload");
  } finally {session?.close();rmSync(root,{recursive:true,force:true});}
});
