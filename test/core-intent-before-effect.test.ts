import { it } from "node:test";
import assert from "node:assert/strict";

import { runAgentLoop } from "../src/core/loop.ts";
import { EventStore } from "../src/core/store.ts";

const request = { name: "write", input: { path: "answer.txt", content: "42" } };

it("persists the requested action before dispatching any external effect", async () => {
  const store = new EventStore("intent-before-effect", () => 1000);
  let calls = 0;
  await runAgentLoop(
    store,
    { name: "scripted", async infer() { return { text: "", toolCalls: [request] }; } },
    {
      async run(call) {
        calls++;
        const events = store.toSession().events;
        assert.ok(events.some(event => event.kind === "action"
          && event.data.tool === call.name
          && JSON.stringify(event.data.input) === JSON.stringify(call.input)),
          "effect intent must be in the journal before any mutating tool is called");
        assert.equal(events.some(event => event.kind === "observation" && event.data.tool === call.name), false,
          "a receipt may only follow execution");
        return { name: call.name, exit: 0, output: "wrote" };
      },
    },
    { subject: "builder", goal: "write answer", maxSteps: 1 },
  );
  assert.equal(calls, 1);
  assert.equal(store.toSession().events.filter(event => event.kind === "action").length, 1);
  assert.equal(store.toSession().events.filter(event => event.kind === "observation" && event.data.tool === "write").length, 1);
});

it("a dispatched tool crash preserves an unpaired intent rather than pretending to have a receipt", async () => {
  const store = new EventStore("unknown-effect", () => 1000);
  await assert.rejects(
    runAgentLoop(
      store,
      { name: "scripted", async infer() { return { text: "", toolCalls: [request] }; } },
      { async run() { throw new Error("disconnected during tool execution"); } },
      { subject: "builder", goal: "write answer", maxSteps: 1 },
    ), /disconnected/);
  const events = store.toSession().events;
  assert.equal(events.filter(event => event.kind === "action").length, 1, "intent persists even if no receipt arrives");
  assert.equal(events.filter(event => event.kind === "observation" && event.data.tool === "write").length, 0);
  assert.equal(store.toSession().goal?.open, true);
});

it("a failed durability callback refuses effect dispatch", async () => {
  const store = new EventStore("no-commit-no-effect", () => 1000);
  let toolCalls = 0;
  await assert.rejects(
    runAgentLoop(
      store,
      { name: "scripted", async infer() { return { text: "", toolCalls: [request] }; } },
      { async run() { toolCalls++; return { name: "write", exit: 0, output: "" }; } },
      {
        subject: "builder", goal: "write answer", maxSteps: 1,
        onEvent(event) {
          if (event.kind === "action") throw new Error("journal append not confirmed on disk");
        },
      },
    ), /journal append not confirmed/);
  assert.equal(toolCalls, 0, "no dispatched side effect without confirmed durable intent");
});
