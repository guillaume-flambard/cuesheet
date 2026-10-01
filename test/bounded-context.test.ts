import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { withSharedContext } from "../src/adapters/shared-context.ts";
import { readHistory } from "../src/adapters/history-tool.ts";
import { memoryCommand } from "../src/adapters/work-memory.ts";
import type { ContextFrame } from "../src/core/loop.ts";

function frame(store: EventStore): ContextFrame {
  const session=store.toSession();
  return {goal:"repair",history:session.events,directives:session.openDirectives,evidence:session.evidence,capabilities:[],model:"fixture",step:1};
}
function snapshot(result: ContextFrame){return JSON.parse(result.directives.at(-1)!.text.split("\n").slice(1).join("\n"));}

test("10000 events compile within budget while old human constraints survive and omitted sources remain retrievable",()=>{
  const store=new EventStore("bounded",()=>0);
  const constraint=store.append({kind:"directive",subject:"builder",data:{text:"preserve the public API"}});
  memoryCommand(store,"/memory constraint maintain schema compatibility");
  for(let i=0;i<10000;i++)store.append({kind:"observation",subject:"worker",data:{text:`observation ${i}: inspected file`,tool:"read"}});
  const before=store.revision;
  const original=frame(store);
  const result=withSharedContext(original,store.toSession(),{maxChars:16000});
  assert.ok(JSON.stringify(result).length<=16000);
  assert.ok(result.directives.some(d=>d.seq===constraint.seq && d.text.includes("public API")));
  const data=snapshot(result);
  assert.equal(data.memory[0].text,"maintain schema compatibility");
  assert.ok(data.context.omittedHistory>9900);
  assert.equal(data.context.sourceRange.to,store.revision);
  const recovered=JSON.parse(readHistory(store,{name:"read_history",input:{from:1,to:3}})!.output);
  assert.equal(recovered.events[0].data.text,"preserve the public API");
  assert.equal(store.revision,before);
  assert.equal(original.history.length,10002);
  assert.deepEqual(withSharedContext(original,store.toSession(),{maxChars:16000}),result);
});

test("oversized authoritative context refuses rather than discarding human instructions",()=>{
  const store=new EventStore("essential",()=>0);
  store.append({kind:"directive",subject:"builder",data:{text:"authoritative ".repeat(1000)}});
  assert.throws(()=>withSharedContext(frame(store),store.toSession(),{maxChars:4000}),/Authoritative/);
});

test("history pages are bounded, valid JSON, explicit about clipping and never mutate the source",()=>{
  const store=new EventStore("retrieval",()=>0);
  for(let i=0;i<5;i++)store.append({kind:"observation",subject:"worker",data:{text:"x".repeat(10000)}});
  const before=store.revision;
  const result=readHistory(store,{name:"read_history",input:{from:1,to:5}})!;
  assert.equal(result.exit,0);
  assert.ok(result.output.length<=12000);
  const page=JSON.parse(result.output);
  assert.equal(page.complete,false);
  assert.equal(page.next,3);
  assert.equal(page.events[0].truncated,true);
  let encoded=page.events[0].dataExcerpt;
  let offset=page.events[0].nextOffset;
  while(offset!==null){
    const part=JSON.parse(readHistory(store,{name:"read_history",input:{from:1,to:1,offset}})!.output).events[0];
    encoded+=part.dataExcerpt;offset=part.nextOffset;
  }
  assert.deepEqual(JSON.parse(encoded),store.toSession().events[0]!.data,"all clipped source bytes remain available");
  const next=readHistory(store,{name:"read_history",input:{from:page.next,to:5}})!;
  assert.equal(next.exit,0);
  assert.equal(readHistory(store,{name:"read_history",input:{from:1,to:999}})!.exit,2);
  assert.equal(store.revision,before);
});
