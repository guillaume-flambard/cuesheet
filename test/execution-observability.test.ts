/**
 * OBS-§7: execution phases must not collapse into one another on the surface.
 *
 * The runtime already distinguishes eight phases. The surface carries four
 * certainty channels, and they are not the same thing: the four say how strongly
 * a person may believe what they are reading, the eight say how a run ended.
 * The defect this file guards against was found here: every phase was painted
 * `unknown`, so a technical failure and a deliberate cancellation showed the
 * same glyph. The text differed; the certainty channel lied.
 *
 * The two failure directions are different and both matter. Painting a failure
 * as unknown tells the reader to keep waiting for a fact that will never arrive.
 * Painting a budget exhaustion as failed would invent an error, which is the
 * opposite lie, so both are asserted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { certaintyOfExecutionPhase } from "../apps/terminal/src/producer/session-view.ts";
import type { ExecutionPhase } from "../src/adapters/execution-state.ts";

const PHASES: readonly ExecutionPhase[] = ["running", "continuing", "limit", "stagnation", "goal-closed", "blocked", "failed", "cancelled"];

test("OBS-§7 a technical failure is painted as a failure, never as uncertainty", () => {
  assert.equal(certaintyOfExecutionPhase("failed"), "failed");
});

test("OBS-§7 the phases that are not errors are never painted as failures", () => {
  // The opposite lie, and the one a careless fix would introduce.
  for (const phase of ["limit", "stagnation", "blocked", "cancelled", "interrupted"]) {
    assert.notEqual(certaintyOfExecutionPhase(phase), "failed", `${phase} ended without a result, it did not error`);
  }
});

test("OBS-§7 every phase the runtime can record gets an answer, and no phase is silently dropped", () => {
  for (const phase of PHASES) {
    const verdict = certaintyOfExecutionPhase(phase);
    assert.ok(["confirmed", "active", "unknown", "failed"].includes(verdict), `${phase} produced an unusable certainty`);
  }
  // A phase nobody has thought about must land on `unknown`, which is honest,
  // rather than on `failed`, which would be an invented error.
  assert.equal(certaintyOfExecutionPhase("some-future-phase"), "unknown");
});

test("OBS-§7 the distinction is observable: failed and cancelled do not share a channel", () => {
  // This is the collapse that was actually present. Both were `unknown`, so the
  // surface drew the same mark for a crash and for the person pressing stop.
  assert.notEqual(certaintyOfExecutionPhase("failed"), certaintyOfExecutionPhase("cancelled"));
});

test("OBS-§7 no phase invents a certainty stronger than the evidence", () => {
  // `confirmed` and `active` would claim a run is settled or moving now, and
  // none of these phases supports that: they all describe a run that stopped.
  for (const phase of [...PHASES, "interrupted"]) {
    const verdict = certaintyOfExecutionPhase(phase);
    assert.notEqual(verdict, "confirmed", `${phase} stopped, so it cannot be certain`);
    assert.notEqual(verdict, "active", `${phase} stopped, so it cannot be active`);
  }
});
