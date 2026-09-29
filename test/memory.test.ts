import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildFrontier,
  evaluateWake,
  falsify,
  lessonFrom,
  permanentlyAsleep,
  wakeable,
  type DurableObject,
} from "../src/core/memory.ts";

const obj = (over: Partial<DurableObject> = {}): DurableObject => ({
  id: "o1",
  kind: "FutureTrigger",
  horizon: "sleep",
  what: "a runtime is justified",
  why: "ADR-001 forbids it until measured",
  evidence: [{ source: "bench", observed: "0 observed", at: "2026-09-29" }],
  status: "active",
  related_to: [],
  ...over,
});

describe("evaluateWake", () => {
  it("is not satisfied when it has no condition at all", () => {
    const r = evaluateWake(obj(), { failures: 5 });
    assert.equal(r.satisfied, false, "no condition means no wake, not a wake");
  });

  it("needs every named measurement, not any of them", () => {
    const o = obj({
      revisit_when: {
        signal: "repeated alignment failures",
        requires: ">= 3 reproducible failures and no existing primitive",
        satisfiedBy: ["failures", "no_existing_primitive"],
        matched: true,
      },
    });

    assert.equal(evaluateWake(o, { failures: 9 }).satisfied, false);
    assert.equal(evaluateWake(o, { failures: 9 }).unevaluable, true);
    assert.equal(
      evaluateWake(o, { failures: 9, no_existing_primitive: true }).satisfied,
      true,
    );
  });

  it("a matched condition is not woken when a measurement is missing", () => {
    const o = obj({
      revisit_when: {
        signal: "s",
        requires: "r",
        satisfiedBy: ["never_measured"],
        matched: true,
      },
    });
    const r = evaluateWake(o, { something_else: 1 });
    assert.equal(r.satisfied, false);
    assert.equal(r.unevaluable, true, "cannot tell is not the same as not met");
  });

  it("every measurement present but not matched is not a wake", () => {
    const o = obj({
      revisit_when: {
        signal: "threshold not reached",
        requires: ">= 3",
        satisfiedBy: ["failures"],
        matched: false,
      },
    });
    const r = evaluateWake(o, { failures: 99 });
    assert.equal(r.satisfied, false, "numbers present, condition unmet");
    assert.equal(r.unevaluable, false, "it was checked, and it did not fire");
  });

  it("a zero measurement is a measurement, not an absence", () => {
    const o = obj({
      revisit_when: {
        signal: "any failure",
        requires: ">= 1",
        satisfiedBy: ["failures"],
        matched: true,
      },
    });
    assert.equal(evaluateWake(o, { failures: 0 }).satisfied, true, "the caller judges the value");
  });

  it("a condition naming nothing can never fire", () => {
    const o = obj({
      revisit_when: {
        signal: "unmeasurable",
        requires: "vibes",
        satisfiedBy: [],
        matched: false,
      },
    });
    assert.equal(evaluateWake(o, {}).satisfied, false);
  });
});

describe("wakeable", () => {
  it("returns only active objects whose condition is both evaluable and met", () => {
    const condition = (matched: boolean): DurableObject["revisit_when"] => ({
      signal: "s",
      requires: "r",
      satisfiedBy: ["m"],
      matched,
    });
    const objects = [
      obj({ id: "a", revisit_when: condition(false) }),
      obj({ id: "b", revisit_when: condition(true) }),
      obj({ id: "c", status: "falsified", revisit_when: condition(true) }),
      obj({ id: "d" }),
    ];
    assert.deepEqual(wakeable(objects, { m: 1 }).map((o) => o.id), ["b"]);
  });

  it("permanentlyAsleep is the set with no condition, and they are not woken by any measurement", () => {
    const never = obj({ id: "never" });
    assert.deepEqual(permanentlyAsleep([never]).map((o) => o.id), ["never"]);
    assert.equal(wakeable([never], { anything: 1 }).length, 0);
  });
});

describe("falsify", () => {
  it("keeps the original belief verbatim, because that is the whole value", () => {
    const original = obj({ what: "unchanged content does not invalidate dependants" });
    const dead = falsify(original, "world-kernel 15/16", "hash plus deriver policy");

    assert.equal(dead.status, "falsified");
    assert.equal(dead.original_belief, "unchanged content does not invalidate dependants");
    assert.equal(dead.counterexample, "world-kernel 15/16");
    assert.equal(dead.replacement, "hash plus deriver policy");
  });

  it("never overwrites a belief that was already recorded", () => {
    const already = obj({
      what: "v2 belief",
      original_belief: "v1 belief",
      status: "falsified",
    });
    const again = falsify(already, "new counterexample", "new replacement");
    assert.equal(again.original_belief, "v1 belief", "the first belief is the one that misled");
  });

  it("a falsified object keeps its evidence", () => {
    const dead = falsify(obj(), "c", "r");
    assert.equal(dead.evidence.length, 1);
  });
});

describe("lessonFrom", () => {
  it("returns null for a live object, so there is no lesson to invent", () => {
    assert.equal(lessonFrom(obj(), [obj()]), null);
  });

  it("tells the next agent what was believed, what broke it, and what replaced it", () => {
    const dead = obj({ id: "F2", what: "hash alone suffices" });
    const fixed = obj({ id: "F2b", what: "hash plus deriver policy identity" });
    const trail = lessonFrom(falsify(dead, "cases 15/16", "F2b"), [dead, fixed]);

    assert.ok(trail);
    assert.equal(trail.believed, "hash alone suffices");
    assert.equal(trail.counterexample, "cases 15/16");
    assert.equal(trail.now, "hash plus deriver policy identity");
  });

  it("says so plainly when the replacement was never recorded", () => {
    const dead = falsify(obj({ id: "F3", what: "w" }), "c", "");
    const trail = lessonFrom(dead, [dead]);
    assert.ok(trail);
    assert.match(trail.now, /nothing recorded/);
  });
});

describe("buildFrontier", () => {
  it("separates the three horizons and collects the lessons", () => {
    const objects = [
      obj({ id: "now", horizon: "now" }),
      obj({ id: "watch", horizon: "watch" }),
      obj({ id: "sleep", horizon: "sleep" }),
      obj({ id: "dead", status: "falsified" }),
    ];
    const f = buildFrontier(objects, {});

    assert.deepEqual(f.now.map((o) => o.id), ["now"]);
    assert.deepEqual(f.watch.map((o) => o.id), ["watch"]);
    assert.deepEqual(
      f.asleep.map((o) => o.id),
      ["sleep"],
      "a falsified object is not asleep, it is a lesson",
    );
    assert.equal(f.lessons.length, 1, "a falsified object becomes a lesson");
  });

  it("a new session gets the frontier, not the history", () => {
    const objects = [
      obj({ id: "buried", horizon: "sleep", what: "an old idea", revisit_when: undefined }),
    ];
    const f = buildFrontier(objects, {});
    assert.equal(f.now.length, 0, "nothing was promoted without a measurement");
    assert.equal(f.asleep.length, 1, "and the idea is still there, asleep");
  });
});
