import { it } from "node:test";
import assert from "node:assert/strict";

import { runAgentLoop } from "../src/core/loop.ts";
import { EventStore } from "../src/core/store.ts";

const request = { name: "write", input: { path: "answer.txt", content: "42" } };
const model = { name: "scripted", async infer() { return { text: "", toolCalls: [request] }; } };

it("an unobserved tool intent blocks a second run before inference or dispatch", async () => {
  const store = new EventStore("orphan-run", () => 1000);
  await assert.rejects(runAgentLoop(
    store, model, { async run() { throw new Error("connection lost after dispatch"); } },
    { subject: "builder", goal: "write", maxSteps: 1 },
  ), /connection lost/);
  const before = store.toSession().events;
  const action = before.find(event => event.kind === "action");
  assert.ok(action);
  let inferences = 0, dispatched = 0;
  const resumed = await runAgentLoop(store, {
    name: "replacement-model", async infer() {
      inferences++;
      return { text: "", toolCalls: [request] };
    },
  }, {
    async run() { dispatched++; return { name: "write", exit: 0, output: "42" }; },
  }, { subject: "builder", goal: "write", maxSteps: 3 });
  assert.equal(resumed.stop.reason, "blocked");
  assert.equal(inferences, 0, "uncertain prior effect must prevent new inference");
  assert.equal(dispatched, 0, "never repeat an orphan side effect");
  assert.deepEqual(store.toSession().events, before, "blocked resume may not rewrite journal");
  assert.match(resumed.stop.reason === "blocked" ? resumed.stop.missing.join(",") : "", new RegExp(String(action.seq)));
});

it("a later checked receipt can resolve the matching intent without rewriting history", async () => {
  const store = new EventStore("orphan-reconciled", () => 1000);
  store.append({ kind: "action", subject: "builder", data: { tool: "write", input: request.input, step: 1 } });
  const intent = store.toSession().events.at(-1)!;
  store.append({ kind: "observation", subject: "builder", data: { tool: "write", step: 1, intentSeq: intent.seq, exit: 0, output: "owner inspected actual file" } });
  let count = 0;
  const outcome = await runAgentLoop(store, {
    name: "scripted", async infer() { count++; return { text: "", toolCalls: [] }; },
  }, { async run() { throw Error("unexpected"); } }, { subject: "builder", goal: "continue after reconciliation", maxSteps: 1 });
  assert.equal(count, 1);
  assert.equal(outcome.stop.reason, "budget-exhausted");
  assert.ok(store.toSession().events.some(event => event.seq === intent.seq), "original intent is immutable");
});

it("a tool result in the live loop explicitly identifies the intent it answers", async () => {
  const store = new EventStore("linked-effects", () => 1000);
  await runAgentLoop(store, model, {
    async run() { return { name: "write", exit: 0, output: "wrote" }; },
  }, { subject: "builder", goal: "write", maxSteps: 1 });
  const events = store.toSession().events;
  const intent = events.find(event => event.kind === "action");
  const receipt = events.find(event => event.kind === "observation" && event.data.tool === "write");
  assert.ok(intent && receipt);
  assert.equal(receipt.data.intentSeq, intent.seq, "each result must link to the exact request");
});

it("legacy action/observation pairs without intentSeq remain resumable", async () => {
  const store = new EventStore("legacy-receipt", () => 1000);
  store.append({ kind: "action", subject: "builder", data: { tool: "write", input: request.input, step: 1 } });
  store.append({ kind: "observation", subject: "builder", data: { tool: "write", exit: 0, output: "legacy success", step: 1 } });
  let calls = 0;
  const outcome = await runAgentLoop(store, {
    name: "model", async infer() { calls++; return { text: "", toolCalls: [] }; },
  }, { async run() { throw new Error("no tools expected"); } }, { subject: "builder", goal: "next goal", maxSteps: 1 });
  assert.equal(calls, 1);
  assert.equal(outcome.stop.reason, "budget-exhausted");
});

it("a receipt from another subject or for a different tool cannot clear an unresolved effect", async () => {
  const store = new EventStore("wrong-receipt", () => 1000);
  const requested = store.append({ kind: "action", subject: "builder", data: { tool: "write", step: 1, input: request.input } });
  store.append({ kind: "observation", subject: "other-worker", data: { tool: "write", step: 1, intentSeq: requested.seq, exit: 0, output: "ok" } });
  store.append({ kind: "observation", subject: "builder", data: { tool: "read", step: 1, intentSeq: requested.seq, exit: 0, output: "ok" } });
  let inferred = false;
  const outcome = await runAgentLoop(store, {
    name: "replacement", async infer() { inferred = true; return { text: "", toolCalls: [] }; },
  }, { async run() { throw Error("should never dispatch"); } }, { subject: "builder", goal: "later goal", maxSteps: 1 });
  assert.equal(outcome.stop.reason, "blocked");
  assert.equal(inferred, false);
});

it("a null-exit receipt is observed but inconclusive and cannot authorize blind replay", async () => {
  const store = new EventStore("unknown-receipt", () => 1000);
  await runAgentLoop(store, model, {
    async run() { return { name: "write", exit: null, output: "transport lost; world may have changed" }; },
  }, { subject: "builder", goal: "write", maxSteps: 1 });
  assert.ok(store.toSession().events.some(event =>
    event.kind === "observation" && event.data.exit === null), "keep the uncertainty in the journal");
  let calls = 0;
  const resumed = await runAgentLoop(store, {
    name: "fresh-model", async infer() { calls++; return { text: "", toolCalls: [] }; },
  }, { async run() { throw new Error("not allowed"); } },
  { subject: "builder", goal: "resume", maxSteps: 1 });
  assert.equal(resumed.stop.reason, "blocked");
  assert.equal(calls, 0);
});

it("a controller with independent receipt admission can inspect safely after an orphan", async () => {
  const store = new EventStore("controller-owned-recovery", () => 1000);
  store.append({ kind: "action", subject: "builder", data: { tool: "node", step: 1, input: { argv: ["node", "write"] } } });
  let inspections = 0;
  const outcome = await runAgentLoop(
    store,
    { name: "inspector", async infer() { return { text: "", toolCalls: [{ name: "cat", input: { path: "answer.txt" } }] }; } },
    { async run(request) { assert.equal(request.name, "cat"); inspections++; return { name: "cat", exit: 0, output: "42" }; } },
    { subject: "builder", goal: "inspect possible effect", maxSteps: 1, effectRecovery: "controller" },
  );
  assert.equal(inspections, 1, "the controller owns policy and allows safe inspection");
  assert.equal(outcome.stop.reason, "budget-exhausted");
  assert.equal(store.toSession().events.some(event => event.seq === 1 && event.kind === "action"), true);
});
