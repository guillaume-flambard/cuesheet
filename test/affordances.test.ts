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
import type { Event } from "../src/core/store.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const has = (input: AffordanceInput, action: string) =>
  deriveAffordances(input).some((a) => a.action === action);

const stagedOpen: AffordanceInput = {
  staged: seen({ text: "fix the display", open: true }),
  hasSession: true,
  pending: seen(false),
};
const nothingStaged: AffordanceInput = {
  staged: unknown("no goal was staged"),
  hasSession: true,
  pending: seen(false),
};
const unobserved: AffordanceInput = {
  staged: unknown(),
  pending: seen(false),
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

  it("AFF-04 both surfaces receive the same set", () => {
    // There is one function. A CLI and an API cannot disagree about what is
    // possible unless one of them stopped calling it, which a test would see.
    const state = deriveState([
      event({ seq: 1, kind: "goal", subject: "", data: { text: "fix the display" } }),
    ]);
    const fromState = affordancesOf(state, seen(false)).map((a) => a.action);
    const fromInput = deriveAffordances({
      staged: state.goal,
      hasSession: true,
      pending: seen(false),
    }).map((a) => a.action);
    assert.deepEqual(fromState, fromInput);
  });

  it("AFF-07 a pending effect withholds approving and nothing else", () => {
    // The double "go". While an effect is asked for and unanswered, approving
    // again is not in the list at all, so a surface cannot render it and an
    // agent cannot select it. Everything else survives: a person whose spawn
    // has not come back yet must still be able to change their mind.
    const inFlight = deriveAffordances({
      staged: seen({ text: "fix the display", open: true }),
      hasSession: true,
      pending: seen(true),
    }).map((a) => a.action);

    assert.equal(inFlight.includes("APPROVE_GOAL"), false, "a second go is not offered");
    assert.equal(inFlight.includes("REJECT_GOAL"), true, "discarding still works");
    assert.equal(inFlight.includes("REPLACE_GOAL"), true, "changing the mind still works");
    assert.equal(inFlight.includes("CANCEL_SESSION"), true, "leaving still works");
    assert.equal(inFlight.includes("EXIT"), true, "and quitting is never a lock");

    // Withheld as absence rather than as a flag, which is AFF-02 applied to
    // an effect: there is nothing to render and nothing to select.
    assert.equal(inFlight.includes("APPROVE_GOAL"), false);

    // Once the world answers, approving comes back. Observed false, not absent.
    const answered = deriveAffordances({
      staged: seen({ text: "fix the display", open: true }),
      hasSession: true,
      pending: seen(false),
    }).map((a) => a.action);
    assert.equal(answered.includes("APPROVE_GOAL"), true);
  });

  it("AFF-08 an unobserved pending effect withholds approving too", () => {
    // The doctrine, one level up. Not knowing whether something is in flight is
    // not the same as knowing nothing is, so a caller who never looked cannot
    // start an effect. If this ever relaxed, every surface that forgot to look
    // would silently get the double "go" back.
    const neverLooked = deriveAffordances({
      staged: seen({ text: "fix the display", open: true }),
      hasSession: true,
      pending: unknown("nobody checked the log"),
    }).map((a) => a.action);

    assert.equal(neverLooked.includes("APPROVE_GOAL"), false);
    // And the refusal to start is not a lock on everything else.
    assert.equal(neverLooked.includes("REJECT_GOAL"), true);
    assert.equal(neverLooked.includes("EXIT"), true);
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
    const state = deriveState([
      event({ seq: 1, kind: "goal", subject: "", data: { text: "fix the display" } }),
      event({ seq: 2, kind: "action", subject: "builder", data: { tool: "edit" } }),
    ]);
    assert.equal(allows(state, "APPROVE_GOAL", seen(false)), true);
    assert.equal(allows(state, "INSPECT", seen(false)), true);
    assert.equal(allows(deriveState([]), "APPROVE_GOAL", seen(false)), false);
    assert.equal(
      allows(deriveState([]), "INSPECT", seen(false)),
      false,
      "no events, nothing to inspect",
    );
  });
});
