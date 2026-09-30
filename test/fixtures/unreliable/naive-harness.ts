/**
 * A harness that is wrong in the ordinary ways, for contrast.
 *
 * The mutants in `mutants.ts` answer "can this row go red". They cannot answer
 * "is this row measuring a distinction anybody actually makes", because a mutant
 * is a one-expression surgery on a system that is otherwise correct, and the
 * question worth asking is whether the row would notice a *different system*
 * getting the answer wrong.
 *
 * So this file is that different system. It is a competent, plausible agent
 * harness, assembled out of choices that have all shipped somewhere:
 *
 *   - verify the workspace as it is now, not a frozen copy of it
 *   - take `success: true` from the worker's receipt as the answer
 *   - require the worker's self-reported digest to match the one on disk
 *   - read "no receipt" as "the worker failed"
 *   - read a non-zero exit as "the work failed"
 *   - assume nothing is in flight unless a log says so
 *
 * Every one of those is defensible in a review meeting. Two of them are the
 * reason agent harnesses report success on work that never happened, and one of
 * them is the reason they double-charge for a job already done.
 *
 * What it is for is the table. A row where the naive harness and Cuesheet agree
 * is a row that is not measuring the distinction it claims to, and saying so is
 * more useful than a longer green column. This file never decides anything: the
 * matrix asks both and prints both, and only Cuesheet's answer is the result.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Bench } from "./bench.ts";
import { receiptOnDisk, workOutcomeOnDisk } from "./bench.ts";
import { deriveAffordances } from "../../../src/affordances.ts";
import { deriveState, seen } from "../../../src/state.ts";
import { effectStatuses } from "../../../src/effects.ts";
import type { Event } from "../../../src/core/store.ts";

export interface NaiveAnswer {
  verdict: "VERIFIED" | "REJECTED" | "INCONCLUSIVE";
  workOutcome: "CONFIRMED_COMPLETE" | "CONFIRMED_FAILED" | "INCONCLUSIVE";
  offerSecondSpawn: boolean;
  reason: string;
}

/** Run a command in a directory. The naive harness has no other verb. */
function runIn(dir: string, args: string[]): { status: number | null } {
  return spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" });
}

/**
 * The whole naive pipeline, on one bench.
 *
 * The order of the checks is the interesting part and is not arbitrary: it is
 * the order in which each shortcut gets a chance to fire, which is why a
 * receipt with `success: true` never reaches the test runner.
 *
 * An earlier version also carried a fourth shortcut, requiring the worker's
 * self-reported digest to match the one the runtime computed. It was removed
 * rather than left in place: no row ever reached it, because the
 * `success: true` shortcut always fires first on the same workers, so it was
 * unreachable code describing a behaviour nothing measured. The over-strict
 * harness it modelled is a real thing and it deserves a row of its own when
 * somebody writes one.
 */
export function naiveAnswer(b: Bench): NaiveAnswer {
  const receipt = receiptOnDisk(b, "result.json");

  // Shortcut 1: the worker says it worked.
  if (receipt !== null && receipt.success === true) {
    return {
      verdict: "VERIFIED",
      workOutcome: "CONFIRMED_COMPLETE",
      offerSecondSpawn: false,
      reason: "trusted success: true in the worker's own receipt",
    };
  }

  // Shortcut 2: no receipt means it failed.
  const onDisk = workOutcomeOnDisk(b);
  if (onDisk.outcome === "INCONCLUSIVE") {
    return {
      verdict: "REJECTED",
      workOutcome: "CONFIRMED_FAILED",
      offerSecondSpawn: false,
      reason: `no usable receipt (${onDisk.why})`,
    };
  }

  // Shortcut 3: verify the workspace as it is right now.
  const live = runIn(b.workspace, ["test.mjs"]);

  // Shortcut 4: a non-zero exit is a failed job.
  if (b.process !== null && b.process.exitCode !== 0) {
    return {
      verdict: "REJECTED",
      workOutcome: "CONFIRMED_FAILED",
      offerSecondSpawn: false,
      reason: `the worker exited ${String(b.process.exitCode)}`,
    };
  }

  return {
    verdict: live.status === 0 ? "VERIFIED" : "REJECTED",
    workOutcome: "CONFIRMED_COMPLETE",
    offerSecondSpawn: false,
    reason: `ran the test in the live workspace, exit ${String(live.status)}`,
  };
}

/**
 * Would this log let a second spawn start?
 *
 * The naive version of the pending question: unless the log positively names an
 * effect as resolved, assume the field is clear. It is a one-word difference
 * from the honest fold, and it is the difference between retrying a job that
 * already ran and not.
 */
export function naiveOffersSecondSpawn(events: readonly Event[]): boolean {
  const statuses = effectStatuses([...events]);
  const unanswered = [...statuses.values()].some((s) => s.status === "requested");
  if (unanswered) return false;

  const state = deriveState([...events], "S-matrix", "complete");
  const affordances = deriveAffordances({
    staged: seen({ text: "make the failing test pass", open: true }),
    hasSession: true,
    // The default the honest fold refuses to make.
    pending: seen(false),
    revision: state.revision,
  });
  return affordances.some((a) => a.action === "APPROVE_GOAL");
}

/**
 * The naive check, with the receipt shortcut removed.
 *
 * This is the naive harness at its most favourable: a harness that actually runs
 * the test instead of believing the worker. It still looks at the live
 * workspace, because that is the only directory it was told about, and that one
 * choice is the whole of the freeze property.
 */
export function naiveVerifyLiveWorkspace(b: Bench): "VERIFIED" | "REJECTED" {
  return runIn(b.workspace, ["test.mjs"]).status === 0 ? "VERIFIED" : "REJECTED";
}

/**
 * What a naive harness concludes when the checker itself could not run.
 *
 * The shortcut is unmissable: the oracle did not produce a pass, therefore the
 * work did not pass. It is how a missing binary or a hung runner becomes a
 * defect in somebody's code, and it is the reason an infrastructure hiccup
 * produces a false REJECTED rather than an honest unknown.
 */
export function naiveOnRunnerFailure(): "VERIFIED" | "REJECTED" {
  return "REJECTED";
}

/**
 * Does this harness consider the work finished, before any check has run?
 *
 * A capture exists on disk and nothing contradicts it, which for a harness with
 * no separate verification event is as close to done as the evidence gets. The
 * crash window between "the artifact is taken" and "the verdict is recorded" is
 * exactly where this answers yes.
 */
export function naiveWorkOutcomeInLog(b: Bench): string {
  return existsSync(join(b.root, SESSION_ID, "artifacts")) ? "CONFIRMED_COMPLETE" : "INCONCLUSIVE";
}

const SESSION_ID = "S-matrix";

/** What the naive harness answers about any bench, keyed the way a row names it. */
export function naiveFacts(b: Bench): Record<string, string> {
  const answer = naiveAnswer(b);
  return {
    verdict: answer.verdict,
    workOutcome: answer.workOutcome,
    approveOffered: answer.offerSecondSpawn ? "yes" : "no",
    verdictIgnoringClaim: naiveVerifyLiveWorkspace(b),
    missingBinary: naiveOnRunnerFailure(),
    workOutcomeInLog: naiveWorkOutcomeInLog(b),
    accountPromotedToProof: naiveTreatsClaimAsEvidence(b) ? "yes" : "no",
  };
}

/**
 * Does this harness turn a worker's account into a proven fact?
 *
 * The naive way to close a task is to record what the worker said as evidence,
 * because evidence is the thing the fold knows how to display as established. It
 * is one line, and it turns a fabricated account into a fact that a surface will
 * later render without a question mark.
 *
 * Derived rather than returned from a constant, so the answer is a fold and not
 * a claim.
 */
export function naiveTreatsClaimAsEvidence(b: Bench): boolean {
  const receipt = receiptOnDisk(b, "result.json");
  if (receipt === null || typeof receipt.summary !== "string") return false;
  const log = [
    {
      seq: 1,
      at: 1_790_000_000_000,
      kind: "evidence" as const,
      subject: "fix add()",
      // `source` is what makes it provable. A naive harness writes the worker's
      // own name there, because that is where the sentence came from.
      data: { claim: receipt.summary, source: `worker ${b.identity.effectId}` },
    },
  ];
  return deriveState(log, "S-naive", "complete").proven.length > 0;
}
