import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { withSharedContext } from "../src/adapters/shared-context.ts";
import type { ContextFrame } from "../src/core/loop.ts";

test("replacement models receive sourced work, refreshed corrections and no invented verification", () => {
  const store = new EventStore("shared", () => 12);
  store.append({ kind: "goal", subject: "builder", data: { text: "repair" } });
  const decision = store.append({ kind: "action", subject: "worker-a", data: { text: "keep API", against: 1 } });
  store.append({ kind: "note", subject: "human", data: { text: "which migration?", goal: "builder" } });
  store.append({ kind: "note", subject: "terminal.user", data: { text: "repair" } });
  store.append({ kind: "observation", subject: "worker-a", data: { text: "done" } });
  const frame: ContextFrame = { goal: "repair", history: [], directives: [], evidence: [], capabilities: [], model: "replacement", step: 0 };
  const before = JSON.stringify(store.toSession().events);
  const restored = withSharedContext(frame, store.toSession());
  const snapshot = JSON.parse(restored.directives.at(-1)!.text.split("\n").slice(1).join("\n"));
  assert.equal(snapshot.decisions[0].at, decision.seq);
  assert.equal(snapshot.decisions[0].by, "worker-a");
  assert.equal(snapshot.openQuestions.length, 1);
  assert.equal(snapshot.claims[0].fromTool, false);
  assert.deepEqual(snapshot.evidence, []);
  assert.equal(frame.directives.length, 0);
  assert.equal(JSON.stringify(store.toSession().events), before);
  assert.deepEqual(withSharedContext(frame, store.toSession()), restored);
  store.append({ kind: "directive", subject: "builder", data: { text: "preserve schema" } });
  const next = withSharedContext(frame, store.toSession());
  assert.match(next.directives.at(-1)!.text, /preserve schema/);
  assert.notEqual(next.directives.at(-1)!.text, restored.directives.at(-1)!.text);
});


test("context reduction retains recent tool feedback and retrieval references without changing journal",()=>{
 const store=new EventStore("feedback",()=>12);
 for(let i=0;i<20;i++)store.append({kind:"observation",subject:"builder",data:{tool:"cat",exit:0,output:"old".repeat(2000)}});
 store.append({kind:"note",subject:"terminal.user",data:{text:"improve Cuesheet"}});
 store.append({kind:"observation",subject:"builder",data:{text:"I propose a bounded isolated edit."}});
 store.append({kind:"note",subject:"terminal.user",data:{text:"ok vas y"}});
 const latest=store.append({kind:"observation",subject:"builder",data:{tool:"node",exit:126,output:"Engine preflight: "+"x".repeat(16000)+" No command was executed."}});
 const session=store.toSession(),before=JSON.stringify(session);
 const frame:ContextFrame={goal:"fix execution",history:session.events,directives:[],evidence:[],capabilities:[],model:"fixture",step:1};
 const reduced=withSharedContext(frame,session,{maxChars:12000});
 const snapshot=JSON.parse(reduced.directives.at(-1)!.text.split("\n").slice(1).join("\n"));
 assert.deepEqual(snapshot.recentConversation.map((e:any)=>e.text),["improve Cuesheet","I propose a bounded isolated edit.","ok vas y"]);
 assert.match(snapshot.recentConversation[1].note,/not execution/);
 const feedback=snapshot.latestToolResults.at(-1);
 assert.equal(feedback.sourceSeq,latest.seq);assert.equal(feedback.exit,126);assert.equal(feedback.truncated,true);
 assert.match(feedback.output,/Engine preflight/);assert.match(feedback.output,/No command was executed/);assert.match(feedback.output,/read_history/);
 assert.ok(snapshot.context.omittedHistory>0);assert.ok(JSON.stringify(reduced).length<=12000);assert.equal(JSON.stringify(session),before);
});
