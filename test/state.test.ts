import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveState, seen, stateReport, unknown } from "../src/state.ts";
import { InteractiveProjection, MachineProjection, render } from "../src/projections.ts";
import type { Event } from "../src/core/store.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const sources = ["state.ts", "projections.ts"].map((f) => ({
  file: f,
  text: readFileSync(join(SRC, f), "utf8"),
}));

const event = (over: Partial<Event> = {}): Event => ({
  seq: 1,
  at: new Date("2026-09-29T16:08:00").getTime(),
  kind: "observation",
  subject: "builder",
  data: {},
  ...over,
});

describe("VIEW the state, and what a view may do to it", () => {
  it("VIEW-01 rendering performs no observation", () => {
    // The rule that keeps the banner cheap and the prompt free. A view that
    // reaches for git, a registry or the filesystem stops being a view and
    // becomes an observation, and the cost returns on every repaint.
    const forbidden = [
      /\bexecFileSync\b/,
      /\bspawnSync\b/,
      /\breadFileSync\b/,
      /\bexistsSync\b/,
      /\breaddirSync\b/,
      /snapshotPortfolio/,
      /\bnew Date\b(?!\s*\()/,
      /Date\.now\(/,
      /Math\.random\(/,
    ];
    for (const { file, text } of sources) {
      for (const pattern of forbidden) {
        assert.doesNotMatch(
          text,
          pattern,
          `${file} observes or invents: ${pattern.source}`,
        );
      }
    }
  });

  it("VIEW-01b the state module imports nothing that could observe", () => {
    // Static imports are checked separately from the bodies, because a module
    // can observe with an import it never calls.
    const text = readFileSync(join(SRC, "state.ts"), "utf8");
    for (const match of text.matchAll(/from\s+["']([./][^"']*)["']/g)) {
      assert.equal(
        match[1],
        "./core/store.ts",
        `state.ts imports ${match[1]}; a view may read the log and nothing else`,
      );
    }
    assert.doesNotMatch(text, /from\s+["']node:/);
  });

  it("VIEW-02 unknown stays unknown", () => {
    // A log with no goal yields unknown, not a goal that happens to be empty
    // and not an invented one. The gap is the information.
    const state = deriveState([]);
    assert.equal(state.goal.known, false);
    // Not `value` at all on the unknown side, so a caller cannot reach through
    // it and get undefined dressed as a goal.
    assert.equal("value" in state.goal, false, "an unknown carries no value to read");
    assert.match((state.goal as { why: string }).why, /no goal/);
  });

  it("VIEW-03 human and machine views derive from the same state", () => {
    const state = deriveState([
      event({ seq: 1, kind: "goal", subject: "", data: { text: "fix the display" } }),
      event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
      event({ seq: 3, kind: "evidence", subject: "tests", data: { claim: "portability", source: "PORT-04" } }),
    ]);
    // The same fold, so the same numbers, so a disagreement is impossible by
    // construction rather than by review.
    assert.equal(state.goal.known && state.goal.value.text, "fix the display");
    assert.equal(state.running, 1);
    assert.equal(state.proven.length, 1);

    const interactive = render(state.recent, new InteractiveProjection());
    const machine = render(state.recent, new MachineProjection())
      .split("\n")
      .map((l) => JSON.parse(l) as { seq: number });
    assert.equal(machine.length, state.recent.length);
    assert.deepEqual(
      machine.map((m) => m.seq),
      state.recent.map((e) => e.seq),
    );
    assert.ok(interactive.length > 0);
  });

  it("VIEW-04 recent events are history, not current state", () => {
    // An old action is not a running subject. Recency is the view's problem,
    // and if the fold decided it from the tail, a finished goal would still
    // look busy for as long as the window held.
    const state = deriveState([
      event({ seq: 1, kind: "action", subject: "builder", data: { tool: "edit" } }),
      event({ seq: 2, kind: "evidence", subject: "builder", data: { status: "passed" } }),
      event({ seq: 3, kind: "observation", subject: "builder", data: { text: "waiting for review" } }),
    ]);
    const builder = state.subjects.find((s) => s.subject === "builder");
    // The last event that said anything about state was the evidence, on the
    // same subject, so the subject is done. The trailing observation is
    // history: it carries text, not a state change, and it does not revive
    // the subject. This is the property: recency is not state.
    assert.ok(builder, "the subject is present");
    assert.equal(builder.state, "done");
    assert.equal(state.running, 0, "nothing is running once the evidence landed");
    assert.equal(state.recent.length, 3, "the tail is history and is kept whole");
    assert.match(
      state.recent[2]!.data.text as string,
      /waiting for review/,
      "history keeps the text that the state chose not to read as a transition",
    );
  });

  it("VIEW-04b the fold is pure, so a second call agrees with the first", () => {
    const events = [
      event({ seq: 1, kind: "goal", subject: "", data: { text: "x" } }),
      event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
    ];
    const once = deriveState(events);
    const twice = deriveState(events);
    assert.deepEqual(
      JSON.parse(JSON.stringify(once)),
      JSON.parse(JSON.stringify(twice)),
      "a projection called twice on one log must agree",
    );
  });

  it("VIEW-05 a known value is distinguishable from an absent one", () => {
    // The type distinction is the whole point, so it is exercised directly
    // rather than only through a goal that happens to be missing.
    assert.equal(seen(3).known, true);
    assert.equal(unknown().known, false);
    assert.equal(unknown("git failed").known, false);
    assert.match((unknown("git failed") as { why: string }).why, /git failed/);
  });

  it("VIEW-06 pipe output carries no presentation-only state", () => {
    // The machine rendering must not carry a word addressed to a person: no
    // prompt, no "staged", no encouragement. A script reading it should get
    // facts and nothing to be confused by.
    const state = deriveState([
      event({ seq: 1, kind: "goal", subject: "", data: { text: "fix the display" } }),
      event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
    ]);
    const lines = render(state.recent, new MachineProjection()).split("\n");
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      for (const key of Object.keys(parsed)) {
        assert.doesNotMatch(key, /prompt|staged|message|help/i, `presentation key: ${key}`);
      }
      assert.doesNotMatch(line, /cuesheet>|go\?/);
    }
  });

  it("the human report reads a state and never a source", () => {
    // The report is where a view is most tempted to fetch a missing fact, so
    // it gets its own property: everything it prints came from the object it
    // was handed, and a gap is reported as a gap.
    const withGoal = stateReport(
      deriveState([
        event({ seq: 1, kind: "goal", subject: "", data: { text: "fix the display" } }),
        event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
      ]),
    );
    assert.match(withGoal, /goal\s+fix the display/);
    assert.match(withGoal, /builder\s+running/);

    const without = stateReport(deriveState([]));
    assert.match(without, /goal\s+unknown: no goal/, "an absent goal is stated, not left blank");
    assert.match(without, /subjects\s+none in this log/);
    assert.match(
      without,
      /proven\s+nothing carries both a claim and its evidence/,
      "no claims is a fact about the log, not an invitation to look for some",
    );
  });

  it("the fold counts only what it saw", () => {
    // A state with two subjects and one goal must not invent an "idle" entry
    // for a subject nobody mentioned, nor count an event twice.
    const state = deriveState([
      event({ seq: 1, kind: "goal", subject: "", data: { text: "x" } }),
      event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
      event({ seq: 3, kind: "action", subject: "builder", data: { tool: "test" } }),
    ]);
    assert.equal(state.events, 3);
    assert.equal(state.subjects.length, 1);
    assert.equal(state.running, 1, "one subject, counted once");
  });
});


describe("the intention is folded, not held by the surface", () => {
  const goal = (seq: number, staged = true) =>
    event({ seq, kind: "goal", subject: "", data: { text: "fix the display", ...(staged ? { staged: true } : {}) } });
  const requested = (seq: number, id: string) =>
    event({
      seq,
      kind: "effect_requested",
      subject: "fix the display",
      data: { effect: "SpawnAgent", effectId: id, affordance: "APPROVE_GOAL", reads: {} },
    });
  const observed = (seq: number, id: string, outcome: string) =>
    event({ seq, kind: "effect_observed", subject: "fix the display", data: { effectId: id, outcome } });
  const closed = (seq: number) =>
    event({ seq, kind: "evidence", subject: "", data: { claim: "intention discarded", source: "s", goalClosed: true } });

  it("VIEW-07 a staged intention is in the log, so the surface need not know it", () => {
    // The surface used to hold `staged` in a variable and hand the affordances
    // a state whose `goal` it had overwritten with a fabricated event
    // sequenced 0. This is the log saying it instead, with nothing spliced.
    const state = deriveState([goal(1)], "s", "complete");
    assert.deepEqual(state.goal.value, { text: "fix the display", open: true });
  });

  it("VIEW-08 a failed effect leaves the intention to decide", () => {
    // EFF-06, seen by the fold rather than asserted by a surface variable.
    const state = deriveState(
      [goal(1), requested(2, "E42"), observed(3, "E42", "failed")],
      "s",
      "complete",
    );
    assert.deepEqual(state.goal.value, { text: "fix the display", open: true });
    assert.equal(state.pendingEffect.value, false, "and nothing is in flight");
  });

  it("VIEW-09 a succeeded effect spends the intention", () => {
    const state = deriveState(
      [goal(1), requested(2, "E43"), observed(3, "E43", "succeeded")],
      "s",
      "complete",
    );
    assert.equal(state.goal.known, false, "nothing left to decide");
    assert.equal(state.goal.why.includes("handed"), true);
  });

  it("VIEW-10 a discarded intention does not come back as staged", () => {
    // The regression this removes: `clearIt` wrote an evidence claim the fold
    // did not read as a close, so the intention stayed visible and reappeared
    // as something to decide.
    const state = deriveState([goal(1), closed(2)], "s", "complete");
    assert.equal(state.goal.known, false);
    assert.equal(state.goal.why.includes("closed"), true);
  });

  it("VIEW-11 an observation naming an effect nobody requested spends nothing", () => {
    // The world talked about an effect that does not exist. Inventing a request
    // from it, or a spent intention from it, would both be inferences nobody
    // observed.
    const state = deriveState([goal(1), observed(2, "E99", "succeeded")], "s", "complete");
    assert.deepEqual(state.goal.value, { text: "fix the display", open: true });
  });

  it("VIEW-12 the last intention wins", () => {
    const state = deriveState(
      [goal(1), goal(2, false), { ...goal(3), data: { text: "ship the thing" } } as Event],
      "s",
      "complete",
    );
    assert.equal(state.goal.value?.text, "ship the thing");
  });

  it("VIEW-13 a recorded rejection is not the same as no verification", () => {
    // ACCEPTED 3: the fold must distinguish "work was checked and rejected"
    // from "work was never checked". VER-06: producing satisfies nothing.
    const baseEvents = [
      goal(1, false),
      requested(2, "E42"),
      observed(3, "E42", "succeeded"),
      event({ seq: 4, kind: "action", subject: "builder", data: { tool: "edit" } }),
      event({ seq: 5, kind: "work_produced", subject: "builder", data: { artifactId: "A-abc", artifactDigest: "abc", summary: "fixed the sign" } }),
    ];

    // No verification at all
    const stateNoVerification = deriveState(baseEvents, "s", "complete");
    assert.equal(stateNoVerification.goalVerified.known, false, "no verification recorded");

    // Work REJECTED by oracle
    const eventsRejected = [
      ...baseEvents,
      event({ seq: 6, kind: "work_verified", subject: "builder", data: { effectId: "E42", artifactId: "A-abc", artifactDigest: "abc", verdict: "REJECTED" } }),
    ];
    const stateRejected = deriveState(eventsRejected, "s", "complete");
    assert.equal(stateRejected.goalVerified.known, true, "verification recorded");
    assert.equal(stateRejected.goalVerified.value, "REJECTED", "rejected outcome");

    // The two states must differ in what a surface would decide
    const decide = (s: ReturnType<typeof deriveState>) => ({
      goalVerified: s.goalVerified.known ? s.goalVerified.value : "unknown",
      // goal should be different too: with REJECTED, the intention is still open
      goalOpen: s.goal.known ? s.goal.value.open : false,
    });
    assert.notDeepEqual(decide(stateNoVerification), decide(stateRejected), "rejection changes the state");

    // Work VERIFIED by oracle
    const eventsVerified = [
      ...baseEvents,
      event({ seq: 6, kind: "work_verified", subject: "builder", data: { effectId: "E42", artifactId: "A-abc", artifactDigest: "abc", verdict: "VERIFIED" } }),
    ];
    const stateVerified = deriveState(eventsVerified, "s", "complete");
    assert.equal(stateVerified.goalVerified.value, "VERIFIED", "verified outcome");
    assert.notDeepEqual(decide(stateRejected), decide(stateVerified), "passed vs rejected differs");
  });
});
