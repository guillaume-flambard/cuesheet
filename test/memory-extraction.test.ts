import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {EventStore} from "../src/core/store.ts";
import {TerminalSession, listTerminalSessions} from "../src/adapters/terminal-session.ts";
import {organizeWork} from "../src/adapters/work-organizer.ts";
import {projectMemory,memoryCommand} from "../src/adapters/work-memory.ts";
const remember=(store:EventStore,sources:number[],text="preserve schema")=>organizeWork(store,{name:"remember",input:{operation:"create",kind:"constraint",text,rationale:"Extract useful context",sources}})!;

test("same extraction is idempotent across source ordering and human correction/resolution",()=>{
  const store=new EventStore("memory",()=>0);
  store.append({kind:"note",subject:"terminal.user",data:{text:"schema"}});
  store.append({kind:"observation",subject:"builder",data:{text:"inspect"}});
  assert.equal(remember(store,[1,2]).exit,0);const first=projectMemory(store.toSession().events)[0]!;const seq=store.revision;
  assert.equal(JSON.parse(remember(store,[2,1,1]).output).id,first.id);assert.equal(store.revision,seq);
  memoryCommand(store,`/memory edit ${first.id} preserve the new schema`);
  const corrected=store.revision;
  assert.equal(JSON.parse(remember(store,[1,2]).output).reused,true);assert.equal(store.revision,corrected);
  assert.equal(projectMemory(store.toSession().events)[0]!.text,"preserve the new schema");
  memoryCommand(store,`/memory resolve ${first.id} obsolete constraint`);
  const resolved=store.revision;remember(store,[1,2]);assert.equal(store.revision,resolved);
  assert.equal(projectMemory(store.toSession().events)[0]!.active,false);
  assert.equal(remember(store,[2],"preserve schema").exit,0);
  assert.equal(remember(store,[1,2],"schema changed").exit,0);
  assert.equal(projectMemory(store.toSession().events).length,3);
  assert.equal(store.toSession().evidence.length,0);
});

test("versioned edits preserve ownership and reject stale or invalid sources without append",()=>{
  const store=new EventStore("memory",()=>0);store.append({kind:"note",subject:"terminal.user",data:{text:"request"}});
  remember(store,[1]);const original=projectMemory(store.toSession().events)[0]!;
  const edit={operation:"edit",id:original.id,text:"new model interpretation",rationale:"new observation",sources:[1]};
  assert.equal(organizeWork(store,{name:"remember",input:edit})!.exit,0);
  const events=store.toSession().events;const record=events.at(-1)!;
  assert.throws(()=>projectMemory([...events,{...record,seq:record.seq+1}]),/Invalid memory/);
  const seq=store.revision;assert.equal(remember(store,[999]).exit,2);assert.equal(store.revision,seq);
  memoryCommand(store,`/memory edit ${original.id} owner decision`);
  const byHuman=store.revision;assert.equal(organizeWork(store,{name:"remember",input:edit})!.exit,2);assert.equal(store.revision,byHuman);
});

test("durable restart reuses extraction; corruption is refused and listing marks damaged",()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-memory-replay-"));let session:TerminalSession|undefined;
  try {
    session=new TerminalSession({root,cwd:root});session.core.append({kind:"note",subject:"terminal.user",data:{text:"schema"}});
    remember(session.core,[1]);const id=session.metadata.id;session.close();session=new TerminalSession({root,cwd:root,id});
    const seq=session.core.revision;remember(session.core,[1]);assert.equal(session.core.revision,seq);
    const record=session.core.toSession().events.at(-1)!;
    assert.throws(()=>session!.core.append({...record,data:{...record.data,version:99}}),/Invalid memory/);
    assert.equal(session.core.revision,seq);session.close();session=undefined;
    const path=join(root,`${id}.jsonl`);const records=readFileSync(path,"utf8").trim().split("\n").map(line=>JSON.parse(line));
    records.find(e=>e.subject==="terminal.memory").data.extractionKey="forged";
    const corrupt=records.map(e=>JSON.stringify(e)).join("\n")+"\n";writeFileSync(path,corrupt);
    assert.throws(()=>new TerminalSession({root,cwd:root,id}),/Invalid memory/);
    assert.equal(listTerminalSessions(root)[0]!.damaged,true);assert.equal(readFileSync(path,"utf8"),corrupt);
  } finally {session?.close();rmSync(root,{recursive:true,force:true});}
});
