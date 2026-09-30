import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  effectObserved,
  effectRequested,
  effectStatuses,
  unobservedEffects,
  type EffectRequest,
} from "../src/effects.ts";
import { deriveState } from "../src/state.ts";
import { classifyFailure, FailureWithOrigin } from "../src/effects.ts";
import { deriveAffordances } from "../src/affordances.ts";
import { seen } from "../src/state.ts";
import { EventStore } from "../src/core/store.ts";
import type { Event } from "../src/core/store.ts";

const NOW = 1_790_000_000_000;

const request = (over: Partial<EffectRequest> = {}): EffectRequest => ({
  id: "E42",
  effect: "SpawnAgent",
  subject: "fix the display",
  affordance: "APPROVE_GOAL",
  reads: { staged: "known", stagedOpen: "known" },
  revision: 1,
  ...over,
});

/** A log, built through the real store so sequence and time are real. */
function log(): EventStore {
  return new EventStore("s", () => NOW);
}

describe("effects", () => {
  it("EFF-03 a request and its observation are two facts", () => {
    const store = log();
    store.append(effectRequested(request()));
    store.append(effectObserved({ effectId: "E42", outcome: "succeeded" }));
    const events = store.toSession().events;

    assert.equal(events.length, 2, "two events, not one");
    assert.equal(events[0]!.kind, "effect_requested");
    assert.equal(events[1]!.kind, "effect_observed");
    // The request asserts nothing about the outcome. If it did, the second
    // event would be confirming something already recorded.
    assert.equal(events[0]!.data.outcome, undefined);
  });

  it("EFF-04 a failure never produces the state a success produces", () => {
    // Built through the store both times, because the first version of this
    // test concatenated an observation onto an empty log and got nothing,
    // which is EFF-04b rather than EFF-04 and passed for the wrong reason.
    const withOutcome = (outcome: "succeeded" | "failed") => {
      const store = log();
      store.append(effectRequested(request()));
      store.append(effectObserved({ effectId: "E42", outcome, why: "no provider" }));
      return effectStatuses(store.toSession().events);
    };

    const failed = withOutcome("failed");
    assert.equal(failed.get("E42")?.status, "failed");
    // The distinction is not only the label: a failure carries a reason slot
    // and a success has none, so the two shapes cannot be confused downstream.
    assert.equal(
      failed.get("E42")!.status === "failed" && failed.get("E42")!.why,
      "no provider",
    );

    const succeeded = withOutcome("succeeded");
    assert.equal(succeeded.get("E42")?.status, "succeeded");
    assert.equal(
      succeeded.get("E42")!.status === "failed",
      false,
      "a success must not carry the failure shape",
    );
  });

  it("EFF-04b an observation with no request resolves nothing", () => {
    // The world said something about an effect nobody asked for. Recording it
    // is right; inferring a request from it would be inventing one.
    const store = log();
    store.append(effectObserved({ effectId: "E99", outcome: "succeeded" }));
    const statuses = effectStatuses(store.toSession().events);
    assert.equal(statuses.size, 0);
  });

  it("EFF-05 an effect keeps the affordance and read-set that allowed it", () => {
    const store = log();
    store.append(effectRequested(request({ id: "E7", affordance: "APPROVE_GOAL" })));
    store.append(effectObserved({ effectId: "E7", outcome: "succeeded" }));
    const status = effectStatuses(store.toSession().events).get("E7");
    assert.equal(status?.request.affordance, "APPROVE_GOAL");
    assert.deepEqual(status?.request.reads, { staged: "known", stagedOpen: "known" });
  });

  it("EFF-06 an intent survives the failure of the effect meant to carry it", () => {
    // The two states are separate facts. A refused spawn says something about
    // the spawn; it says nothing about whether the person still wants it.
    const store = log();
    store.append(effectRequested(request()));
    store.append(effectObserved({ effectId: "E42", outcome: "failed", why: "no provider" }));
    const events = store.toSession().events;

    const statuses = effectStatuses(events);
    assert.equal(statuses.get("E42")?.status, "failed");

    // The goal is still what the person asked for, because nothing observed
    // says otherwise. Deriving "no goal" from a failed spawn is the exact
    // inference EFF-01 forbids.
    const goalEvents = events.filter((e) => e.kind === "goal");
    assert.equal(goalEvents.length, 0, "and no goal event was fabricated by the failure");
  });

  it("EFF-07 a requested effect with no outcome stays unobserved", () => {
    // The crash case. The process died between the request and the answer, and
    // what the log holds is a question, not an answer.
    const store = log();
    store.append(effectRequested(request()));
    const reloaded = effectStatuses(store.toSession().events);

    const pending = unobservedEffects(reloaded);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.status, "requested");
    // And the state says the same thing, in its own words.
    assert.equal(reloaded.get("E42")?.status, "requested");
    assert.notEqual(reloaded.get("E42")?.status, "failed");
    assert.notEqual(reloaded.get("E42")?.status, "succeeded");
  });

  it("EFF-07b a pending effect removes the affordance that would repeat it", () => {
    // The double "go". If an effect is pending, approving again is not offered,
    // so the second go has nothing to select.
    //
    // The first version of this test asserted the opposite, that approving is
    // still available, and passed: it was describing the behaviour before the
    // affordance layer learned about pending, dressed as a requirement. The
    // rule lives in `deriveAffordances`, so the assertion belongs here too.
    const offered = (pending: boolean) =>
      deriveAffordances({
        staged: seen({ text: "fix the display", open: true }),
        hasSession: true,
        pending: seen(pending),
      }).map((a) => a.action);

    assert.equal(offered(true).includes("APPROVE_GOAL"), false, "a second go is withheld");
    assert.equal(offered(false).includes("APPROVE_GOAL"), true, "and returns once answered");
  });

  it("EFF-01 and EFF-02 the log is the only writer", () => {
    // A request recorded by the store keeps its sequence and its timestamp, so
    // the effect has a place in the history rather than sitting beside it.
    const store = log();
    store.append(effectRequested(request()));
    store.append(effectObserved({ effectId: "E42", outcome: "succeeded" }));
    const [first, second] = store.toSession().events;
    assert.equal(first!.seq, 1);
    assert.equal(second!.seq, 2);
    assert.equal(first!.at, NOW);
  });

  it("a repeated observation is kept rather than collapsing the retry", () => {
    // Two attempts, two outcomes. A projection that kept only the last one
    // would hide that a retry happened, which is the fact an audit needs.
    const store = log();
    store.append(effectRequested(request({ id: "E42" })));
    store.append(effectObserved({ effectId: "E42", outcome: "failed", why: "first" }));
    store.append(effectRequested(request({ id: "E43" })));
    store.append(effectObserved({ effectId: "E43", outcome: "succeeded" }));
    const statuses = effectStatuses(store.toSession().events);
    assert.equal(statuses.get("E42")?.status, "failed");
    assert.equal(statuses.get("E43")?.status, "succeeded");
    assert.equal(statuses.size, 2, "two effects, both visible");
  });

  it("the fold is pure and derives nothing from the current time", () => {
    const store = log();
    store.append(effectRequested(request()));
    store.append(effectObserved({ effectId: "E42", outcome: "succeeded" }));
    const events = store.toSession().events;

    // A status carries the timestamp of the event that decided it. The fold
    // reads no clock, so the only `at` it can produce came from the log.
    const statuses = effectStatuses(events);
    assert.equal(statuses.get("E42")?.status === "succeeded" && statuses.get("E42")!.at, NOW);

    // And two calls agree, which is what "pure" buys.
    assert.deepEqual(
      [...effectStatuses(events).entries()],
      [...effectStatuses(events).entries()],
    );
  });
});

describe("a request read back out of the log", () => {
  it("carries the revision and the key, or says it does not know them", () => {
    // The round trip is the whole point of a record that outlives its process.
    // The first `readRequest` dropped both fields, so a request recovered from
    // disk had `revision: undefined` while the type promised a number, and had
    // lost the key that makes it reconciliable at all. Found by Agent E while
    // building the proof ledger.
    const store = log();
    store.append(effectRequested(request({ id: "E7", revision: 41, reconciliationKey: "spawn:E7" })));

    const recovered = effectStatuses(store.toSession().events).get("E7")?.request;
    assert.equal(recovered?.revision, 41, "the revision survives the round trip");
    assert.equal(recovered?.reconciliationKey, "spawn:E7", "and so does the key");
  });

  it("an older record with no revision says so rather than inventing one", () => {
    // A log written before P12 has no revision in it. Reading one back must not
    // fabricate a number, because a fabricated revision is a claim that the
    // decision was made against a state nobody recorded.
    const store = log();
    store.append({
      kind: "effect_requested",
      subject: "fix the display",
      data: { effect: "SpawnAgent", effectId: "E8", affordance: "APPROVE_GOAL", reads: {} },
    });
    const recovered = effectStatuses(store.toSession().events).get("E8")?.request;
    assert.equal(recovered?.revision, null, "unknown, not invented");
    assert.equal(recovered?.reconciliationKey, undefined, "and no key either");
  });
});

describe("a failure names a step and an origin", () => {
  it("our own defect is not reported as the world refusing", () => {
    // The distinction the whole type exists for. `registry is not defined` was
    // recorded faithfully as `failed` and the person was told to "go again when
    // the world can answer", which is nonsense about our own bug and is how the
    // defect survived a green suite. Honest and explained are not the same.
    const reference = classifyFailure(new ReferenceError("registry is not defined"));
    assert.equal(reference.origin, "cuesheet");
    assert.equal(typeof reference.step, "string");
    assert.equal(reference.why, "registry is not defined", "the detail is kept, not swallowed");

    // A provider that will not answer is not our wiring either, and the two
    // need opposite advice.
    assert.equal(classifyFailure(new Error("OPENROUTER_API_KEY is not set")).origin, "provider");
    assert.equal(classifyFailure(new Error("spawn E1 ENOENT")).origin, "world");
    assert.equal(classifyFailure(new Error("something odd")).origin, "unknown");
  });

  it("the cause survives the round trip through the log", () => {
    const store = log();
    store.append(effectRequested(request()));
    store.append(
      effectObserved({
        effectId: "E42",
        outcome: "failed",
        why: "registry is not defined",
        failure: { step: "launch", origin: "cuesheet", why: "registry is not defined" },
      }),
    );
    const status = effectStatuses(store.toSession().events).get("E42");
    // `status`, not `outcome`: the fold's field is `status`, and the first
    // version of this line read a field that does not exist, so the conjunction
    // was false and the assertion failed for a reason of its own.
    assert.equal(status?.status === "failed" && status.failure?.origin, "cuesheet");
    assert.equal(status?.status === "failed" && status.failure?.step, "launch");
  });

  it("a cause with an unknown shape is dropped rather than half-accepted", () => {
    // The log is read by whatever version comes next. A record written by a
    // future one may carry fields this one does not know, and guessing at them
    // would invent an origin nobody observed.
    const store = log();
    store.append(effectRequested(request()));
    store.append({
      kind: "effect_observed",
      subject: "g",
      data: {
        effectId: "E42",
        outcome: "failed",
        why: "x",
        failure: { origin: "cuesheet", weird: true },
      },
    });
    const status = effectStatuses(store.toSession().events).get("E42");
    assert.equal(status?.failure, undefined, "an incomplete cause is not a cause");
  });
});

describe("a boundary knows better than an exception type", () => {
  it("a failure the adapter attributed is not re-classified by its type", () => {
    // The case that makes `instanceof ReferenceError` insufficient on its own:
    // a provider SDK can throw a `ReferenceError` from inside code we do not
    // own, and a rule that reads that as "our wiring is broken" blames
    // Cuesheet for a bug it cannot see or fix.
    //
    // `classifyFailure` checks for an attributed failure FIRST, so the boundary
    // wins over the type. The bare `ReferenceError` below is the control: same
    // exception type, different origin, because the boundary said so.
    // A real instance, not a structural stand-in. `classifyFailure` reads it
    // through `instanceof`, and `tsc` caught that the first version of this test
    // exercised a path no adapter ever takes: the instance path read `cause.why`,
    // which does not exist on the class, so an attributed failure silently fell
    // through to the exception-type rules and was blamed on Cuesheet.
    const attributed = new FailureWithOrigin(
      "launch",
      "provider",
      "cannot read property of undefined",
    );
    assert.equal(classifyFailure(attributed).origin, "provider");
    assert.equal(
      classifyFailure(attributed).why,
      "cannot read property of undefined",
      "and the detail survives, read from the Error's own message",
    );

    const bare = new ReferenceError("cannot read property of undefined");
    assert.equal(classifyFailure(bare).origin, "cuesheet", "the same message, unadorned");
  });

  it("the origin the adapter set is the one that survives", () => {
    for (const origin of ["world", "cuesheet", "provider", "unknown"] as const) {
      const f = new FailureWithOrigin("run", origin, "x");
      const got = classifyFailure(f);
      assert.equal(got.origin, origin);
      assert.equal(got.step, "run", "and the step, not just the origin");
    }
  });
});
