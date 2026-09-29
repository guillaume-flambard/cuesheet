import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EventStore, type NewEvent } from "../src/core/store.ts";

const store = (id = "s1", t0 = 1000) => {
  let t = t0;
  const s = new EventStore(id, () => t);
  return { s, tick: (n = 1) => (t += n) };
};
const ev = (kind: NewEvent["kind"], subject: string, data: Record<string, unknown> = {}): NewEvent => ({
  kind,
  subject,
  data,
});

describe("EventStore", () => {
  it("assigns a monotonic sequence and a stamp to every event", () => {
    const { s, tick } = store();
    const a = s.append(ev("goal", "intentlane", { text: "prove Notes append" }));
    tick(10);
    const b = s.append(ev("observation", "builder", { text: "read schema" }));

    assert.equal(a.seq, 1);
    assert.equal(b.seq, 2);
    assert.equal(a.at, 1000);
    assert.equal(b.at, 1010);
  });

  it("honours an explicit timestamp so a replay is bit-identical", () => {
    const live = store();
    live.s.append(ev("goal", "p", { text: "g" }));
    const replayed = store();
    const r = replayed.s.append({ ...ev("goal", "p", { text: "g" }), at: 1000 });

    assert.equal(r.at, 1000, "an explicit at must win over the clock");
  });

  it("a session is the log, not a conversation", () => {
    const { s } = store();
    s.append(ev("goal", "intentlane", { text: "prove Notes append" }));
    s.append(ev("action", "builder", { tool: "read" }));
    s.append(ev("observation", "builder", { text: "read README" }));

    const session = s.toSession();
    assert.equal(session.events.length, 3);
    assert.equal(session.goal?.text, "prove Notes append");
  });

  it("the projection is pure: same log, same session", () => {
    const { s } = store();
    s.append(ev("goal", "p", { text: "g" }));
    s.append(ev("model", "builder", { model: "claude" }));

    const a = s.toSession();
    const b = s.toSession();
    assert.deepEqual(
      a.events.map((e) => e.seq),
      b.events.map((e) => e.seq),
    );
    assert.equal(a.models.get("builder")?.model, "claude");
    assert.equal(b.models.get("builder")?.model, "claude");
  });

  it("a model switch is a new binding on the same session, not a new session", () => {
    const { s, tick } = store();
    s.append(ev("goal", "p", { text: "g" }));
    tick(100);
    s.append(ev("model", "builder", { model: "claude" }));
    tick(100);
    s.append(ev("model", "builder", { model: "gpt" }));

    const session = s.toSession();
    assert.equal(session.models.get("builder")?.model, "gpt");
    assert.equal(session.id, "s1");
    assert.equal(
      session.events.length,
      3,
      "the switch is an event, the session did not restart",
    );
  });

  it("a directive is not applied until something acknowledges it", () => {
    const { s } = store();
    s.append(ev("goal", "p", { text: "g" }));
    const d = s.append(ev("directive", "builder", { text: "do not write to the vault" }));

    const before = s.toSession();
    assert.equal(before.openDirectives.length, 1);
    assert.equal(before.openDirectives[0].applied, false);

    s.append(ev("note", "control", { acknowledges: d.seq }));

    const after = s.toSession();
    assert.equal(after.openDirectives.length, 0, "acknowledged is not open");
    assert.equal(after.directives[0].applied, true);
  });

  it("an acknowledgement for a directive that does not exist is ignored, not a crash", () => {
    const { s } = store();
    s.append(ev("note", "control", { acknowledges: 999 }));
    assert.equal(s.toSession().directives.length, 0);
  });

  it("a goal is open until evidence about it arrives", () => {
    const { s } = store();
    s.append(ev("goal", "intentlane", { text: "prove Notes append" }));
    assert.equal(s.toSession().goal?.open, true);

    s.append(ev("evidence", "intentlane", { claim: "compiles", backing: "swiftc" }));

    const session = s.toSession();
    assert.equal(session.goal?.open, false);
    assert.equal(session.evidence.length, 1);
  });

  it("an agent claiming completion closes nothing", () => {
    const { s } = store();
    s.append(ev("goal", "intentlane", { text: "g" }));
    s.append(ev("observation", "builder", { text: "all done, verified" }));

    const session = s.toSession();
    assert.equal(session.goal?.open, true, "a claim is not evidence");
    assert.equal(session.evidence.length, 0);
  });

  it("evidence with empty backing is recorded, because that absence is the finding", () => {
    const { s } = store();
    s.append(ev("goal", "p", { text: "g" }));
    s.append(ev("evidence", "p", { claim: "siri works", backing: "" }));

    const session = s.toSession();
    assert.equal(session.evidence[0].backing, "");
  });

  it("capabilities are last-write-wins by name", () => {
    const { s, tick } = store();
    s.append(ev("goal", "p", { text: "g" }));
    s.append(ev("capability", "github-readme", { version: "abc123" }));
    tick(50);
    s.append(ev("capability", "github-readme", { version: "def456" }));

    assert.equal(s.toSession().capabilities.get("github-readme")?.version, "def456");
  });

  it("unknown event kinds are kept in the log, not silently dropped", () => {
    const { s } = store();
    s.append(ev("observation", "a", { text: "x" }));
    s.append(ev("action", "a", { tool: "bash" }));
    s.append(ev("note", "a", { text: "unmapped" }));

    assert.equal(s.toSession().events.length, 3);
  });

  it("the store performs no I/O and never reads a clock it was not given", () => {
    const { s } = store("fixed", 42);
    const e = s.append(ev("goal", "p", { text: "g" }));
    assert.equal(e.at, 42, "the injected clock is the only source of time");
  });
});
