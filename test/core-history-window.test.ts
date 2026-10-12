import { it } from "node:test";
import assert from "node:assert/strict";

import { compileFrame, runAgentLoop } from "../src/core/loop.ts";
import { EventStore } from "../src/core/store.ts";

function longSession(total = 10_000) {
  const store = new EventStore("history-window-long", () => 1000);
  store.append({ kind: "goal", subject: "builder", data: { text: "Original human intent" } });
  store.append({ kind: "directive", subject: "builder", data: { target: "builder", text: "Preserve user-selected constraint" } });
  store.append({ kind: "evidence", subject: "other-worker", data: { claim: "Prior external check", backing: "digest:abc" } });
  for (let n = 0; n < total; n++) store.append({
    kind: "note", subject: "builder", data: { text: `old observation ${n}` },
  });
  return store;
}

it("compiles at most 128 recent history events after a long session", () => {
  const store = longSession();
  const session = store.toSession();
  const frame = compileFrame(session, { subject: "builder", goal: "latest human goal", maxSteps: 1 }, 1);
  assert.equal(session.events.length, 10_003, "canonical event log is never truncated");
  assert.equal(frame.history.length, 128);
  assert.equal(frame.history[0]?.seq, session.events.at(-128)?.seq);
  assert.equal(frame.history.at(-1)?.seq, session.events.at(-1)?.seq);
  assert.equal(frame.historyWindow?.omittedCount, session.events.length - 128);
  assert.equal(frame.historyWindow?.firstIncludedSeq, session.events.at(-128)?.seq);
  assert.equal(frame.historyWindow?.latestSeq, session.events.at(-1)?.seq);
  assert.equal(frame.goal, "latest human goal", "the active goal is authoritative outside the window");
  assert.equal(frame.directives.some(d => d.text === "Preserve user-selected constraint"), true, "active directives survive compaction");
  assert.equal(frame.evidence.some(e => e.backing === "digest:abc"), true, "evidence isn't silently declared missing");
  assert.equal(store.toSession().events.length, 10_003);
});

it("has a configurable event-count ceiling, never a zero, negative or unbounded override", () => {
  const session = longSession(600).toSession();
  const frame = compileFrame(session, { subject: "builder", goal: "g", maxSteps: 1, maxHistoryEvents: 32 }, 1);
  assert.equal(frame.history.length, 32);
  assert.equal(frame.historyWindow?.omittedCount, session.events.length - 32);
  for (const bad of [0, -1, 1.5, 513, Number.POSITIVE_INFINITY]) {
    assert.throws(() => compileFrame(session, { subject: "builder", goal: "g", maxSteps: 1, maxHistoryEvents: bad }, 1), /maxHistoryEvents/);
  }
});

it("small journals remain unaltered and do not invent missing sources", () => {
  const store = new EventStore("small", () => 1000);
  store.append({ kind: "goal", subject: "builder", data: { text: "g" } });
  const frame = compileFrame(store.toSession(), { subject: "builder", goal: "g", maxSteps: 1 }, 1);
  assert.equal(frame.history.length, 1);
  assert.equal(frame.historyWindow?.omittedCount, 0);
  assert.equal(frame.historyWindow?.firstIncludedSeq, 1);
});

it("every inference recompiles its recent window from new canonical events", async () => {
  const store = longSession(200);
  const windows: Array<{ length: number; last: number | undefined }> = [];
  const outcome = await runAgentLoop(store, {
    name: "fixture",
    async infer(frame) {
      windows.push({ length: frame.history.length, last: frame.history.at(-1)?.seq });
      return { text: "not a proof", toolCalls: [] };
    },
  }, { async run() { throw Error("no tool"); } }, { subject: "builder", goal: "continue", maxSteps: 2 });
  assert.equal(outcome.stop.reason, "budget-exhausted");
  assert.equal(windows.length, 2);
  assert.deepEqual(windows.map(w => w.length), [128, 128]);
  assert.equal(windows[1].last, (windows[0].last ?? 0) + 1);
});
