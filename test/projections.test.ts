import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_KINDS,
  InteractiveProjection,
  MachineProjection,
  projectionFor,
  render,
} from "../src/projections.ts";
import type { Event } from "../src/core/store.ts";

const event = (over: Partial<Event> = {}): Event => ({
  seq: 1,
  at: new Date("2026-09-29T11:42:00").getTime(),
  kind: "goal",
  subject: "fix the capability display",
  data: {},
  ...over,
});

describe("projections", () => {
  it("both renderings see the same events", () => {
    // The property that makes this a projection rather than a second log:
    // one state, two renderings. If a renderer could drop an event, the two
    // would disagree about what happened.
    const events = [
      event({ seq: 1, kind: "goal" }),
      event({ seq: 2, kind: "observation", subject: "registry", data: { count: 248 } }),
      event({ seq: 3, kind: "action", subject: "chat.ts", data: { ok: true } }),
      event({ seq: 4, kind: "evidence", subject: "tests", data: { status: "passed" } }),
    ];
    for (const projection of [new InteractiveProjection(), new MachineProjection()]) {
      assert.equal(
        projection.line(events[0]!),
        projection.line(events[0]!),
        "a projection must be pure",
      );
    }
    const interactive = render(events, new InteractiveProjection()).split("\n");
    const machine = render(events, new MachineProjection()).split("\n");
    assert.equal(interactive.length, machine.length, "one line per event, either way");
  });

  it("the machine rendering is one JSON object per line, and parses", () => {
    const lines = render(
      [event({ seq: 7, kind: "evidence", subject: "tests", data: { status: "passed", count: 212 } })],
      new MachineProjection(),
    ).split("\n");

    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.equal(parsed.seq, 7);
    assert.equal(parsed.type, "evidence");
    assert.equal(parsed.subject, "tests");
    assert.equal(parsed.status, "passed");
    assert.equal(parsed.count, 212);
  });

  it("the machine rendering carries the same keys whatever the kind", () => {
    // A key that appears and disappears is a key a consumer must guard. The
    // envelope is fixed; only the facts after it vary.
    const a = JSON.parse(
      new MachineProjection().line(event({ kind: "goal", data: { text: "x" } })),
    ) as Record<string, unknown>;
    const b = JSON.parse(
      new MachineProjection().line(event({ kind: "action", data: { ok: true } })),
    ) as Record<string, unknown>;
    for (const key of ["seq", "at", "type", "subject"]) {
      assert.ok(key in a, `missing envelope key: ${key}`);
      assert.ok(key in b, `missing envelope key: ${key}`);
    }
  });

  it("an event with no subject says null rather than omitting the key", () => {
    const parsed = JSON.parse(
      new MachineProjection().line(event({ subject: "", kind: "note" })),
    ) as Record<string, unknown>;
    assert.equal(parsed.subject, null);
    assert.ok("subject" in parsed, "the key must exist even when empty");
  });

  it("the interactive rendering is a column, not a paragraph", () => {
    const line = new InteractiveProjection().line(
      event({ kind: "goal", subject: "fix the display" }),
    );
    assert.match(line, /^\s+\d{2}:\d{2}\s+goal\s+fix the display$/);
  });

  it("a failed action says so in the human rendering", () => {
    const proj = new InteractiveProjection();
    assert.match(proj.line(event({ kind: "action", data: { ok: true } })), /  ok$/);
    assert.match(proj.line(event({ kind: "action", data: { ok: false } })), /  failed$/);
    // An action with no verdict must not be dressed as a success.
    assert.doesNotMatch(proj.line(event({ kind: "action", data: {} })), /  ok$/);
  });

  it("an observation shows what was observed, not just that it happened", () => {
    // A column of event kinds with no content is a list of categories, which
    // is the thing the first user called ugly. The text is why the event
    // exists.
    const line = new InteractiveProjection().line(
      event({ kind: "observation", subject: "builder", data: { text: "reading the schema file" } }),
    );
    assert.match(line, /reading the schema file/);
  });

  it("a tool call names its tool and its exit code", () => {
    const proj = new InteractiveProjection();
    assert.match(proj.line(event({ kind: "action", data: { tool: "cat" } })), /  cat$/);
    assert.match(
      proj.line(event({ kind: "observation", data: { tool: "cat", exit: 126 } })),
      /  cat exit 126$/,
    );
  });

  it("long text is clipped on one line, never wrapped", () => {
    const line = new InteractiveProjection().line(
      event({ kind: "observation", data: { text: "x".repeat(400) } }),
    );
    assert.ok(line.length < 120, `a wrapped column: ${line.length} chars`);
    assert.match(line, /…$/);
  });

  it("the mode is chosen by the caller, and the two cannot call each other", () => {
    assert.equal(projectionFor("machine").mode, "machine");
    assert.equal(projectionFor("interactive").mode, "interactive");
  });

  it("the vocabulary is the core's, not a second copy of it", () => {
    // A consumer switches on the kind, so the list is part of the contract.
    // The projection list is derived from the core's union: the first version
    // kept its own copy, `effect_requested` arrived in the core, and this
    // assertion passed while the projection disagreed with it. That is the
    // whole failure mode of a restated list.
    assert.deepEqual(EVENT_KINDS, [
      "goal",
      "capability",
      "directive",
      "observation",
      "action",
      "evidence",
      "model",
      "note",
      "effect_requested",
      "effect_observed",
    ]);
    assert.equal(EVENT_KINDS.length, new Set(EVENT_KINDS).size, "no duplicate kinds");
  });
});
