/**
 * REC-01 to REC-05, against a fake adapter rather than a real process.
 *
 * The point of a fake here is that it can be wrong in the ways the world is
 * wrong: forget, refuse to answer, report something ambiguous. A real process
 * that always succeeds would prove nothing about a crash, and could not be
 * asked what it does when it does not know.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EventStore } from "../src/core/store.ts";
import { deriveState } from "../src/state.ts";
import { affordancesOf } from "../src/affordances.ts";
import {
  effectObserved,
  effectRequested,
  effectStatuses,
  type EffectRequest,
} from "../src/effects.ts";
import {
  describe as describeResult,
  reconcile,
  settles,
  terminalObservation,
  type RealityObservation,
  type ReconciliationResult,
} from "../src/reconcile.ts";

const NOW = 1_790_000_000_000;

const request = (over: Partial<EffectRequest> = {}): EffectRequest => ({
  id: "E42",
  effect: "SpawnAgent",
  subject: "fix the display",
  affordance: "APPROVE_GOAL",
  reads: { goal: "known", pendingEffect: "known" },
  revision: 1,
  ...over,
});

/** A staged intention, so there is something to approve and to keep. */
function stagedLog(): EventStore {
  const store = new EventStore("s", () => NOW);
  store.append({ kind: "goal", subject: "", data: { text: "fix the display", staged: true } });
  return store;
}

const fold = (store: EventStore) => deriveState(store.toSession().events, "s", "complete");

describe("the five answers", () => {
  it("each reality maps to exactly one result, and none is invented", () => {
    const cases: Array<[RealityObservation, ReconciliationResult["outcome"]]> = [
      [{ kind: "completed_successfully" }, "CONFIRMED_SUCCESS"],
      [{ kind: "completed_with_failure", why: "spawn refused" }, "CONFIRMED_FAILURE"],
      [{ kind: "running", since: NOW }, "STILL_ACTIVE"],
      [{ kind: "absent" }, "NOT_FOUND"],
      [{ kind: "unreadable", why: "status file is a directory" }, "INCONCLUSIVE"],
      [{ kind: "no_key" }, "INCONCLUSIVE"],
      [{ kind: "not_applicable", why: "no adapter for this effect" }, "INCONCLUSIVE"],
    ];

    for (const [reality, expected] of cases) {
      assert.equal(reconcile(request(), reality).outcome, expected, reality.kind);
    }

    // The vocabulary is closed: seven observations in, five results out, and no
    // result that is not one of the five.
    const allowed = new Set([
      "CONFIRMED_SUCCESS",
      "CONFIRMED_FAILURE",
      "STILL_ACTIVE",
      "NOT_FOUND",
      "INCONCLUSIVE",
    ]);
    for (const [reality] of cases) {
      assert.ok(allowed.has(reconcile(request(), reality).outcome));
    }
  });

  it("REC-03 inconclusive stays inconclusive", () => {
    // An unreadable status is the case that matters: it is what a crashed
    // process actually leaves behind. Turning it into a failure would let a
    // retry loop duplicate an effect that had run.
    const unreadable = reconcile(request(), { kind: "unreadable", why: "truncated" });
    assert.equal(unreadable.outcome, "INCONCLUSIVE");
    assert.equal(settles(unreadable), false);
    assert.equal(terminalObservation(request(), unreadable), null, "so no observation is justified");

    // A missing PID is the same shape of problem.
    const noKey = reconcile(request(), { kind: "no_key" });
    assert.equal(noKey.outcome, "INCONCLUSIVE");
    assert.match(noKey.outcome === "INCONCLUSIVE" ? noKey.why : "", /no reconciliation key/);
  });

  it("REC-01 not-found is not failure", () => {
    // This is the distinction that keeps a lost record from becoming a repeated
    // effect. The world's records say nothing; the effect may well have run.
    const absent = reconcile(request(), { kind: "absent" });
    assert.equal(absent.outcome, "NOT_FOUND");
    assert.notEqual(absent.outcome, "CONFIRMED_FAILURE");
    assert.equal(settles(absent), false, "and it settles nothing");
    assert.equal(terminalObservation(request(), absent), null);
  });

  it("still running settles nothing and says why", () => {
    const running = reconcile(request(), { kind: "running", since: NOW });
    assert.equal(running.outcome, "STILL_ACTIVE");
    assert.equal(settles(running), false);
    assert.match(describeResult(running), /still running/);
  });

  it("reconcile is pure, so the same evidence gives the same answer", () => {
    const reality: RealityObservation = { kind: "unreadable", why: "locked" };
    assert.deepEqual(reconcile(request(), reality), reconcile(request(), reality));
  });
});

describe("across a crash", () => {
  it("the founding case: reload, reconcile, and stay honest", () => {
    // request E42 -> crash -> reload -> INCONCLUSIVE -> pending stays,
    // APPROVE stays absent. Then reconcile again -> CONFIRMED_FAILURE ->
    // a failure event -> pending goes, the staged goal survives, APPROVE returns.
    const store = stagedLog();
    store.append(effectRequested(request({ reconciliationKey: "spawn:abc" })));
    store.append(effectRequested(request({ id: "E43", revision: 2 })));

    // The crash. Nothing else was written, and this is a fresh fold of the log
    // with no memory of the process that wrote it.
    const before = fold(store);
    assert.equal(before.pendingEffect.value, true, "two unanswered requests");
    assert.equal(affordancesOf(before).some((a) => a.action === "APPROVE_GOAL"), false);

    // Reconciliation of E42 with a world that will not answer.
    const keyless = reconcile(
      { ...request({ reconciliationKey: "spawn:abc" }) },
      { kind: "unreadable", why: "the adapter cannot read that status" },
    );
    assert.equal(keyless.outcome, "INCONCLUSIVE");
    assert.equal(terminalObservation(request({ id: "E42" }), keyless), null);

    // REC-01: unresolved remains unresolved. Nothing was appended.
    const stillPending = fold(store);
    assert.equal(stillPending.pendingEffect.value, true);
    assert.equal(
      affordancesOf(stillPending).some((a) => a.action === "APPROVE_GOAL"),
      false,
      "so the second go is still withheld",
    );
    assert.equal(
      stillPending.goal.value?.text,
      "fix the display",
      "and the intention is untouched",
    );

    // Reconcile again, and this time the world answers.
    const failed = reconcile(request({ reconciliationKey: "spawn:abc" }), {
      kind: "completed_with_failure",
      why: "the provider refused the request",
    });
    assert.equal(failed.outcome, "CONFIRMED_FAILURE");
    const observation = terminalObservation(request({ id: "E42" }), failed);
    assert.ok(observation, "a confirmed failure justifies an observation");
    store.append(effectObserved(observation));

    // One request is answered, one is not, so the session is still pending.
    const afterOne = fold(store);
    assert.equal(afterOne.pendingEffect.value, true, "E43 was never asked to be answered");

    // Answer E43 too, this time by finding nothing at all.
    const gone = reconcile(request({ id: "E43" }), { kind: "absent" });
    assert.equal(gone.outcome, "NOT_FOUND");
    assert.equal(terminalObservation(request({ id: "E43" }), gone), null, "NOT_FOUND settles nothing");

    // And when the world finally confirms both, the intention survives the pair.
    store.append(effectObserved({ effectId: "E43", outcome: "succeeded" }));
    const done = fold(store);
    assert.equal(done.pendingEffect.value, false, "nothing is in flight");
    // The intention is gone, because a success spends it, and what is left is
    // the history rather than a decision.
    assert.equal(done.goal.known, false);
    assert.equal(affordancesOf(done).some((a) => a.action === "APPROVE_GOAL"), false);

    // The status fold agrees, from the same events.
    const statuses = effectStatuses(store.toSession().events);
    assert.equal(statuses.get("E42")?.status, "failed");
    assert.equal(statuses.get("E43")?.status, "succeeded");
  });

  it("a failed spawn, confirmed after a crash, keeps the intention", () => {
    // EFF-06 has to survive a restart. The person wanted it, the world said it
    // did not happen, and the person still wants it.
    const store = stagedLog();
    store.append(effectRequested(request({ reconciliationKey: "spawn:abc" })));

    const result = reconcile(request({ reconciliationKey: "spawn:abc" }), {
      kind: "completed_with_failure",
      why: "no provider",
    });
    store.append(effectObserved(terminalObservation(request(), result)!));

    const state = fold(store);
    assert.deepEqual(state.goal.value, { text: "fix the display", open: true });
    assert.equal(state.pendingEffect.value, false);
    assert.equal(
      affordancesOf(state).some((a) => a.action === "APPROVE_GOAL"),
      true,
      "so the person can go again",
    );
  });

  it("REC-05 reconciling twice cannot produce contradictory terminal outcomes", () => {
    // REC-05 has two halves. The fold keeps the first terminal answer it sees,
    // so a later contradicting observation does not rewrite history. And the
    // request stays readable, so a reader can see that a second answer arrived.
    const store = stagedLog();
    store.append(effectRequested(request({ reconciliationKey: "spawn:abc" })));
    store.append(effectObserved({ effectId: "E42", outcome: "succeeded" }));

    // A second, contradicting answer about the same effect.
    store.append(effectObserved({ effectId: "E42", outcome: "failed", why: "contradicts" }));

    // Both facts are in the log, in order, and nothing was erased.
    const observations = store.toSession().events.filter((e) => e.kind === "effect_observed");
    assert.equal(observations.length, 2, "history keeps both");
    assert.equal(observations[0]!.data.outcome, "succeeded");
    assert.equal(observations[1]!.data.outcome, "failed");

    // And the fold reads the first, so the state does not flip because someone
    // reconciled again with worse information.
    const state = fold(store);
    assert.equal(state.goal.known, false, "spent, because the first answer said it started");
    assert.equal(state.pendingEffect.value, false);
  });

  it("REC-02 reconcile cannot perform the effect again", () => {
    // Structural, so it is checked structurally: the function takes two values
    // and returns a value. There is no executor parameter, no world handle and
    // nothing to call, so a retry would have to be written somewhere else.
    const arity = reconcile.length;
    assert.equal(arity, 2, "two arguments: the request, and what was seen");

    // And the observable consequence: reconciling an effect the world never
    // ran appends no event, because there is nothing to append.
    const store = stagedLog();
    store.append(effectRequested(request()));
    const before = store.toSession().events.length;

    for (const reality of [
      { kind: "unreadable", why: "x" },
      { kind: "absent" } as RealityObservation,
      { kind: "running", since: NOW },
      { kind: "no_key" },
    ] as RealityObservation[]) {
      const result = reconcile(request(), reality);
      const observation = terminalObservation(request(), result);
      if (observation) store.append(effectObserved(observation));
    }
    assert.equal(store.toSession().events.length, before, "four reconciliations, no new events");
    assert.equal(
      store.toSession().events.filter((e) => e.kind === "effect_observed").length,
      0,
      "and no observation was manufactured",
    );
  });

  it("REC-05b reconciliation only ever justifies the answer the evidence gives", () => {
    // The regression that motivated this test: `terminalObservation` was
    // patched to turn CONFIRMED_SUCCESS into a failure, and the whole suite
    // stayed green, because every earlier test only ever exercised the failure
    // path. A test that checks one direction of a mapping is not a test of the
    // mapping.
    const success = reconcile(request(), { kind: "completed_successfully" });
    assert.equal(success.outcome, "CONFIRMED_SUCCESS");
    assert.deepEqual(
      terminalObservation(request({ id: "E42" }), success),
      { effectId: "E42", outcome: "succeeded" },
      "a confirmed success becomes a success observation, never anything else",
    );

    const failure = reconcile(request(), { kind: "completed_with_failure", why: "refused" });
    assert.deepEqual(
      terminalObservation(request({ id: "E42" }), failure),
      { effectId: "E42", outcome: "failed", why: "refused" },
      "and a confirmed failure stays a failure",
    );

    // Both directions, plus every non-terminal answer returning nothing.
    for (const reality of [
      { kind: "running", since: NOW },
      { kind: "absent" },
      { kind: "unreadable", why: "x" },
      { kind: "no_key" },
      { kind: "not_applicable", why: "y" },
    ] as RealityObservation[]) {
      assert.equal(terminalObservation(request(), reconcile(request(), reality)), null);
    }
  });

  it("a key that resolves to nothing is reported honestly, not as success", () => {
    const gone = reconcile(request({ reconciliationKey: "spawn:abc" }), { kind: "absent" });
    assert.match(describeResult(gone), /does not mean it failed/);
  });
});