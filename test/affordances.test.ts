import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  affordancesOf,
  allows,
  deriveAffordances,
  type AffordanceInput,
} from "../src/affordances.ts";
import { deriveState, seen, unknown } from "../src/state.ts";
import { EventStore } from "../src/core/store.ts";
import type { Event } from "../src/core/store.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const state_events = () => [
  event({ seq: 1, kind: "goal", subject: "", data: { text: "fix the display" } }),
  event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
];
const has = (input: AffordanceInput, action: string) =>
  deriveAffordances(input).some((a) => a.action === action);

const ev = (kind: Event["kind"], data: Record<string, unknown>, seq: number): Event => ({
  kind,
  subject: "fix the display",
  data,
  seq,
  at: 1_790_000_000_000 + seq,
});
const goalEvent = () => ev("goal", { text: "fix the display" }, 1);
const requested = (id: string, seq: number) =>
  ev("effect_requested", { effect: "SpawnAgent", effectId: id, affordance: "APPROVE_GOAL", reads: {} }, seq);
const observed = (id: string, outcome: string, seq: number) =>
  ev("effect_observed", { effectId: id, outcome }, seq);

const stagedOpen: AffordanceInput = {
  staged: seen({ text: "fix the display", open: true }),
  hasSession: true,
  pending: seen(false),
  revision: 7,
};
const nothingStaged: AffordanceInput = {
  staged: unknown("no goal was staged"),
  hasSession: true,
  pending: seen(false),
  revision: 7,
};
const unobserved: AffordanceInput = {
  staged: unknown(),
  pending: seen(false),
  revision: 7,
  hasSession: true,
};

const event = (over: Partial<Event> = {}): Event => ({
  seq: 1,
  at: new Date("2026-09-29T16:08:00").getTime(),
  kind: "observation",
  subject: "builder",
  data: {},
  ...over,
});

describe("affordances", () => {
  it("AFF-01 affordances are a pure function of the state", () => {
    const text = readFileSync(join(SRC, "affordances.ts"), "utf8");
    // Checked in the source rather than by timing or by mocking: a fold that
    // reads the clock is a fold whose answer depends on when it was asked.
    for (const pattern of [
      /\bexecFileSync\b/,
      /\bspawnSync\b/,
      /\breadFileSync\b/,
      /\bexistsSync\b/,
      /\breaddirSync\b/,
      /Date\.now\(/,
      /new Date\b/,
      /Math\.random\(/,
      /snapshotPortfolio/,
    ]) {
      assert.doesNotMatch(text, pattern, `affordances.ts observes: ${pattern.source}`);
    }
    for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.ok(
        match[1]!.startsWith("."),
        `affordances.ts imports ${match[1]}, which could observe`,
      );
    }
    // And the same input gives the same answer twice.
    assert.deepEqual(deriveAffordances(stagedOpen), deriveAffordances(stagedOpen));
  });

  it("AFF-02 an unavailable action is absent, not merely flagged", () => {
    // Not "approve unless something": approve is not in the list at all, so a
    // surface that renders the list cannot render it disabled or enabled by
    // mistake. Absence is the only representation that cannot be misread.
    assert.equal(has(stagedOpen, "APPROVE_GOAL"), true);
    assert.equal(has(nothingStaged, "APPROVE_GOAL"), false);
    assert.equal(has(nothingStaged, "REJECT_GOAL"), false);
    assert.equal(has(nothingStaged, "CANCEL_SESSION"), false);
    // And no affordance carries a boolean that a caller could ignore.
    for (const a of deriveAffordances(nothingStaged)) {
      assert.equal("enabled" in a, false, `${a.action} carries an enabled flag`);
      assert.equal("available" in a, false, `${a.action} carries an available flag`);
    }
  });

  it("AFF-03 rendering an affordance observes nothing", () => {
    // The label map is the only thing a renderer needs, so it carries no
    // formatting that could reach for a fact.
    const text = readFileSync(join(SRC, "affordances.ts"), "utf8");
    const labelBlock = text.slice(text.indexOf("AFFORDANCE_LABEL"));
    assert.doesNotMatch(labelBlock, /\bgit\b|registry|portfolio/i);
  });

  it("AFF-04 affordances are a function of the state, and of nothing else", () => {
    // The consistency check P8 exists for, as a table of real sequences rather
    // than a property test. Two rules, one fold, one reading:
    //
    //   pendingEffect known(true) -> APPROVE_GOAL absent
    //   pendingEffect unknown      -> APPROVE_GOAL absent
    //
    // The important half is the shape of the call: `affordancesOf(state)` takes
    // the fold and nothing else. There is no second argument that could carry a
    // different reading of the same events, so the two cannot disagree even in
    // principle rather than merely today.
    const cases: Array<{ name: string; events: Event[]; complete: boolean }> = [
      { name: "a goal, nothing asked", events: [goalEvent()], complete: true },
      {
        name: "an effect requested and answered",
        events: [goalEvent(), requested("E1", 2), observed("E1", "succeeded", 3)],
        complete: true,
      },
      {
        name: "an effect requested and refused",
        events: [goalEvent(), requested("E1", 2), observed("E1", "failed", 3)],
        complete: true,
      },
      { name: "an effect requested, unanswered", events: [goalEvent(), requested("E1", 2)], complete: true },
      {
        name: "two effects, one answered",
        events: [goalEvent(), requested("E1", 2), observed("E1", "succeeded", 3), requested("E2", 4)],
        complete: true,
      },
      {
        name: "an observation naming an effect nobody asked for",
        events: [goalEvent(), observed("E9", "succeeded", 2)],
        complete: true,
      },
      { name: "an empty log", events: [], complete: true },
      { name: "a goal, log not attested complete", events: [goalEvent()], complete: false },
      {
        name: "every effect resolved but the log is incomplete",
        events: [goalEvent(), requested("E1", 2), observed("E1", "succeeded", 3)],
        complete: false,
      },
    ];

    for (const c of cases) {
      const state = deriveState(c.events, "s", c.complete ? "complete" : "incomplete");
      const actions = affordancesOf(state).map((a) => a.action);

      if (state.pendingEffect.value === true) {
        assert.equal(
          actions.includes("APPROVE_GOAL"),
          false,
          `${c.name}: pending is known true, so approving must be absent`,
        );
      }
      if (!state.pendingEffect.known) {
        assert.equal(
          actions.includes("APPROVE_GOAL"),
          false,
          `${c.name}: pending is unknown, so approving must be absent`,
        );
      }
      // The positive case, so the two assertions above are not satisfied by a
      // function that never offers approving at all. It is conditioned on a
      // staged goal because an empty log has nothing to approve, which my first
      // version of this table forgot and the assertion caught.
      if (state.pendingEffect.value === false && state.goal.known && state.goal.value.open) {
        assert.equal(
          actions.includes("APPROVE_GOAL"),
          true,
          `${c.name}: a goal is staged and nothing is in flight, so approving must be offered`,
        );
      }
    }
  });

  it("AFF-09 the two surfaces cannot disagree, because there is only one reading", () => {
    // Before P8 this compared a state-derived list against an input-derived
    // list, which was two readings of the same log and could have diverged.
    // Now there is one function and one input, so the strongest thing to say is
    // that it is a function: same state in, same answer out.
    const state = deriveState([goalEvent(), requested("E1", 2)], "s", "complete");
    assert.deepEqual(affordancesOf(state).map((a) => a.action), affordancesOf(state).map((a) => a.action));
    assert.equal(affordancesOf(state).some((a) => a.action === "APPROVE_GOAL"), false);
  });

  it("AFF-05 an unknown state enables nothing that mutates the intent", () => {
    assert.equal(has(unobserved, "APPROVE_GOAL"), false);
    assert.equal(has(unobserved, "REJECT_GOAL"), false);
    assert.equal(has(unobserved, "REPLACE_GOAL"), false);
    // Leaving and reading are still there, because a state nobody has looked
    // at cannot refuse the ability to quit or to look.
    assert.equal(has(unobserved, "EXIT"), true);
    assert.equal(has(unobserved, "INSPECT"), true);
  });

  it("AFF-06 an action that mutates names the precondition it read", () => {
    // No exemption, which is what the first version of this test got wrong by
    // skipping EXIT. Leaving does change the state, so it has to say what it
    // read to decide it was allowed, and the honest answer for it is nothing:
    // a state nobody observed cannot refuse the ability to quit. That is a
    // precondition of the empty set, and saying so is more useful than
    // inventing one.
    for (const input of [stagedOpen, nothingStaged, unobserved]) {
      for (const a of deriveAffordances(input)) {
        if (!a.mutates) continue;
        // The set of consumable names is fixed and small, and the module
        // asserts it internally, so this checks the two are the same list.
        for (const key of Object.keys(a.reads)) {
          assert.ok(
            ["staged", "stagedOpen", "hasSession"].includes(key),
            `${a.action} read "${key}", which is not a fact of the state`,
          );
          assert.equal(a.reads[key], "known", `${a.action} read an unknown`);
        }
        if (a.action === "EXIT") {
          assert.deepEqual(a.reads, {}, "leaving consumes nothing, and says so");
        } else {
          assert.ok(
            Object.keys(a.reads).length > 0,
            `${a.action} mutates and names nothing it read`,
          );
        }
      }
    }
    // Approving a staged goal read exactly the fact that one was staged.
    const approve = deriveAffordances(stagedOpen).find((a) => a.action === "APPROVE_GOAL");
    assert.deepEqual(approve?.reads, { staged: "known", stagedOpen: "known" });
  });

  it("the answering actions come as a set, never as a wall", () => {
    // Showing "reject" without "approve" is a lock rather than a gate, and a
    // gate with no override is a wall.
    const actions = deriveAffordances(stagedOpen).map((a) => a.action);
    for (const paired of ["APPROVE_GOAL", "REJECT_GOAL", "REPLACE_GOAL", "CANCEL_SESSION"]) {
      assert.ok(actions.includes(paired as never), `missing ${paired}`);
    }
  });

  it("a closed goal is not approvable", () => {
    const closed: AffordanceInput = {
      staged: seen({ text: "fix the display", open: false }),
      hasSession: true,
    };
    assert.equal(has(closed, "APPROVE_GOAL"), false);
    // Naming another is still possible, so the surface is not stuck.
    assert.equal(has(closed, "REPLACE_GOAL"), true);
  });

  it("allows() asks the same question the list answers", () => {
    // "complete" is stated here because the fold now refuses to guess, and the
    // refusal is visible: without it this log is unobservable as far as effects
    // go and APPROVE_GOAL is withheld.
    const state = deriveState(
      [
        event({ seq: 1, kind: "goal", subject: "", data: { text: "fix the display" } }),
        event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
      ],
      "s",
      "complete",
    );
    assert.equal(allows(state, "APPROVE_GOAL"), true);
    // The same events, not attested: approving is withheld because nobody said
    // nothing is in flight.
    assert.equal(
      allows(deriveState(state_events(), "s", "incomplete"), "APPROVE_GOAL"),
      false,
      "an unattested log cannot clear the way",
    );
    assert.equal(allows(state, "INSPECT"), true);
    assert.equal(allows(deriveState([]), "APPROVE_GOAL"), false);
    assert.equal(
      allows(deriveState([]), "INSPECT"),
      false,
      "no events, nothing to inspect",
    );
  });
});


describe("CON: an affordance says when it was judged", () => {
  it("CON-01 every action that reads something names the revision it read", () => {
    // An action with a read-set and no revision describes what it consulted but
    // not when, and "when" is what makes it committable. This is the assertion
    // that would have caught `revision` being optional.
    for (const input of [stagedOpen, nothingStaged, unobserved]) {
      for (const a of deriveAffordances(input)) {
        if (Object.keys(a.reads).length === 0) {
          assert.equal(a.revision, null, `${a.action} reads nothing, so it needs no revision`);
        } else {
          assert.equal(a.revision, input.revision, `${a.action} names the revision it read`);
          assert.equal(typeof a.revision, "number");
        }
      }
    }
  });

  it("CON-06 an action that reads nothing is explicitly revision-independent", () => {
    // `null`, not a number that happens to match. The distinction matters
    // because a number would make "leaving" look conditional on a state that
    // it never consulted, and refusing to leave on a moved state is a lock.
    const [exit] = deriveAffordances(stagedOpen).filter((a) => a.action === "EXIT");
    assert.equal(exit!.revision, null);
    assert.deepEqual(exit!.reads, {}, "and it reads nothing, which is the same statement");

    // Same for an empty state: quitting is never gated.
    for (const input of [nothingStaged, unobserved]) {
      assert.equal(
        deriveAffordances(input).find((a) => a.action === "EXIT")!.revision,
        null,
        "leaving is never revision-dependent",
      );
    }
  });

  it("CON-02 the revision an affordance carries is the one the fold reported", () => {
    // The affordance layer must not invent or reuse a revision. If it kept its
    // own counter it would drift from the log, and a commit against it would be
    // refused for reasons that have nothing to do with reality.
    const store = new EventStore("s", () => 1_790_000_000_000);
    store.append({ kind: "goal", subject: "", data: { text: "fix the display", staged: true } });
    const state = deriveState(store.toSession().events, "s", "complete");
    assert.equal(state.revision, 1);

    for (const a of affordancesOf(state)) {
      if (Object.keys(a.reads).length > 0) {
        assert.equal(a.revision, state.revision, `${a.action} carries the fold's revision`);
      }
    }

    // Append, re-fold, and the affordances move with it.
    store.append({ kind: "note", subject: "", data: { text: "later" } });
    const later = deriveState(store.toSession().events, "s", "complete");
    assert.equal(later.revision, 2);
    assert.equal(
      affordancesOf(later).find((a) => a.action === "APPROVE_GOAL")!.revision,
      2,
      "and an approval read at the newer revision is committable at it",
    );
  });
});
