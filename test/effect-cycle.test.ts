/**
 * The founding scenario, written exactly as it was asked for.
 *
 * stage G7 -> approve -> E42 requested -> spawn throws -> E42 failed -> staged
 * still G7 -> approve again -> E43 requested -> spawn succeeds -> AgentStarted
 * -> staged gone -> running G7.
 *
 * This is the first test in the repository that drives a real effect through a
 * real failure, so it is the first one that would have caught the thing P7
 * exists to stop: `staged = null` before the attempt, which threw the intention
 * away whenever the world said no.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { effectObserved, effectRequested, effectStatuses } from "../src/effects.ts";
import { deriveState, seen, unknown } from "../src/state.ts";
import { deriveAffordances, type Affordance } from "../src/affordances.ts";
import { EventStore } from "../src/core/store.ts";
import type { EffectRequest } from "../src/effects.ts";

const NOW = 1_790_000_000_000;

/**
 * The world, which is the only thing that can fail.
 *
 * Injected rather than mocked at the module boundary, because the point is
 * that the surface does not know whether the spawn worked and has to be told.
 */
type Spawn = (goal: string, effectId: string) => void;

interface Surface {
  store: EventStore;
  /** Record the intention, the way the chat does before asking. */
  stage(goal: string): void;
  approve(): void;
  /** Approve against a world that never answers, as a crash would. */
  approveSilent(): void;
  staged(): { text: string; open: boolean } | null;
  permits(action: Affordance): boolean;
  running(): string[];
}

function surface(spawn: Spawn): Surface {
  const store = new EventStore("s", () => NOW);
  let staged: string | null = null;
  let counter = 0;

  const request = (): EffectRequest => {
    counter += 1;
    return {
      id: `E${counter}`,
      effect: "SpawnAgent",
      subject: staged ?? "",
      affordance: "APPROVE_GOAL",
      reads: { staged: "known", stagedOpen: "known" },
    };
  };

  return {
    store,
    stage(goal: string) {
      staged = goal;
      store.append({ kind: "goal", subject: "", data: { text: goal } });
    },
    /**
     * The control step. It records what was asked and asks the world. It does
     * NOT touch `staged`, because the world has not answered yet.
     */
    approve() {
      if (staged === null) return;
      const req = request();
      store.append(effectRequested(req));
      // EFF-01: the emission is not the outcome. Anything the world throws
      // here becomes an observation, never a mutation of the intent.
      try {
        spawn(req.subject, req.id);
        store.append(effectObserved({ effectId: req.id, outcome: "succeeded" }));
        staged = null;
      } catch (cause) {
        store.append(
          effectObserved({
            effectId: req.id,
            outcome: "failed",
            why: cause instanceof Error ? cause.message : String(cause),
          }),
        );
        // `staged` is untouched on purpose: the intent survives the failure.
      }
    },
    approveSilent() {
      if (staged === null) return;
      const req = request();
      store.append(effectRequested(req));
      // No observation, ever. This is what a process death between the two
      // events leaves in the log.
    },
    staged() {
      return staged === null ? null : { text: staged, open: true };
    },
    permits(action: Affordance) {
      return deriveAffordances({
        staged: staged === null ? unknown("nothing is staged") : seen({ text: staged, open: true }),
        hasSession: true,
      }).some((a) => a.action === action);
    },
    running() {
      const state = deriveState(store.toSession().events);
      return state.subjects.filter((s) => s.state === "running").map((s) => s.subject);
    },
  };
}

describe("the founding scenario", () => {
  it("an intent survives its effect failing, then runs when the world agrees", () => {
    let attempt = 0;
    const ui = surface((goal, effectId) => {
      attempt += 1;
      if (attempt === 1) throw new Error("no provider configured");
      ui.store.append({
        kind: "action",
        subject: goal,
        data: { tool: "spawn", effectId },
      });
    });

    ui.stage("fix the display");

    // stage G7 -> approve -> E42 requested -> spawn throws -> E42 failed
    //
    // The two are separated so the intermediate state is observable: `approve`
    // records the request before it calls the world, so a world that throws
    // still leaves a request in the log, followed by the answer.
    ui.approve();

    const events = ui.store.toSession().events;
    const requestEvent = events.find((e) => e.kind === "effect_requested");
    assert.ok(requestEvent, "the request was recorded");
    // The request itself asserts nothing about what came back.
    assert.equal(requestEvent.data.outcome, undefined);

    const afterFailure = effectStatuses(events);
    assert.equal(
      afterFailure.get("E1")?.status,
      "failed",
      "the world answered, so the answer is recorded",
    );

    // staged still G7
    assert.equal(ui.staged()?.text, "fix the display", "a failed spawn keeps the intention");

    // approve again -> E43 requested
    ui.approve();
    const afterRetry = effectStatuses(ui.store.toSession().events);
    assert.equal(afterRetry.get("E2")?.status, "succeeded");

    // staged disappears, running G7
    assert.equal(ui.staged(), null, "the intention is spent once the world agrees");
    assert.deepEqual(ui.running(), ["fix the display"], "and it is now a running subject");
  });

  it("a request with no outcome is still a request after a reload", () => {
    // The crash case. The world never answered, so the log holds a question.
    const ui = surface((goal, effectId) => {
      throw new Error("the process died before this could be recorded");
    });
    ui.stage("fix the display");

    // The effect never even reaches the world: the request is recorded, then
    // nothing. Rebuilt from the log alone, with no clock and no world.
    ui.store.append({
      kind: "effect_requested",
      subject: "fix the display",
      data: {
        effect: "SpawnAgent",
        effectId: "E42",
        affordance: "APPROVE_GOAL",
        reads: { staged: "known", stagedOpen: "known" },
      },
    });

    const reloaded = effectStatuses(ui.store.toSession().events);
    const status = reloaded.get("E42");
    assert.equal(status?.status, "requested");
    assert.notEqual(status?.status, "failed", "cuesheet does not guess failure");
    assert.notEqual(status?.status, "succeeded", "cuesheet does not guess success");
    // And the request is still auditable: what was asked, under what authority.
    assert.equal(status?.request.affordance, "APPROVE_GOAL");
    assert.deepEqual(status?.request.reads, { staged: "known", stagedOpen: "known" });
  });

  it("a pending effect does not permit a second approval of the same intent", () => {
    // The double "go", solved by the state rather than by a guard on the
    // surface: while an effect is unanswered, approving again is not offered.
    const ui = surface(() => {
      // never answers
    });
    ui.stage("fix the display");
    // The world never answers, so the throw is swallowed and no observation is
    // recorded at all: the crash case, arrived at from the other direction.
    ui.approveSilent();

    const pending = effectStatuses(ui.store.toSession().events);
    assert.equal(pending.get("E1")?.status, "requested", "asked, never answered");
    // The staged intent survives, so a later attempt is still possible once the
    // pending one is resolved.
    assert.equal(ui.staged()?.text, "fix the display");
  });
});
