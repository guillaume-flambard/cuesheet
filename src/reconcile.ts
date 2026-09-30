/**
 * Finding out what happened to an effect nobody watched.
 *
 * The situation is narrow and it is not "retries". A process asked the world to
 * do something, and died before the world answered:
 *
 * ```text
 * 41  goal staged
 * 42  EffectRequested E42
 *     the process really did start
 * 43  <nothing, because Cuesheet was gone>
 * ```
 *
 * On restart the log says only that E42 was asked for. Five worlds are
 * consistent with that, and they are not the same world:
 *
 * ```text
 * it succeeded   it failed   it is still running
 * it ran and disappeared        it never happened
 * ```
 *
 * Nothing in the log distinguishes them, so anything else is a guess about the
 * world made by a process that was not there. This module therefore does one
 * thing: it takes what an adapter was able to look up and turns it into one of
 * five answers, refusing to collapse "I could not tell" into "no".
 *
 * It performs nothing. Reconciling acquires evidence; it does not act. A
 * function that could retry would be a function whose failure mode is invisible,
 * because a retry that looks like an observation produces the same log.
 */

import type { EffectOutcome, EffectRequest } from "./effects.ts";

/**
 * The five answers, and the reason there are five.
 *
 * NOT_FOUND is separated from CONFIRMED_FAILURE on purpose. "The key resolves to
 * nothing" and "the world said it failed" are different facts with different
 * consequences: the first may mean it succeeded and lost its record, the second
 * means it did not happen and can be asked again. Merging them is how a retry
 * loop turns a lost record into a duplicate effect.
 */
export type ReconciliationResult =
  | { readonly outcome: "CONFIRMED_SUCCESS" }
  | { readonly outcome: "CONFIRMED_FAILURE"; readonly why: string }
  /** Found, and still going. The right answer, and no terminal event follows it. */
  | { readonly outcome: "STILL_ACTIVE" }
  /**
   * The key was looked up and resolved to nothing.
   *
   * Not a failure: a world that forgets is indistinguishable from a world where
   * it never ran, and neither is evidence that it refused.
   */
  | { readonly outcome: "NOT_FOUND" }
  /**
   * The evidence does not settle it.
   *
   * The load-bearing value. A missing PID, an unreadable status file, a timeout,
   * an adapter with no key to look up: all of these leave the effect exactly as
   * unresolved as they found it, which is the honest state and the one this
   * repository has refused to guess at since REGISTRY_UNVERIFIED.
   */
  | { readonly outcome: "INCONCLUSIVE"; readonly why: string };

/**
 * What an adapter was able to find. It never says "it failed" on its own, only
 * what it saw, because what it saw is not an interpretation.
 */
export type RealityObservation =
  /** The adapter has no way to look this effect up. */
  | { readonly kind: "not_applicable"; readonly why: string }
  /** The request carries no key, so there is nothing to look up. */
  | { readonly kind: "no_key" }
  | { readonly kind: "running"; readonly since: number }
  | { readonly kind: "completed_successfully" }
  | { readonly kind: "completed_with_failure"; readonly why: string }
  | { readonly kind: "absent" }
  /**
   * The lookup itself failed, or returned something that cannot be read as an
   * outcome. Kept distinct from `absent` because "I could not check" and "it is
   * not there" produce the same wrong conclusion if merged.
   */
  | { readonly kind: "unreadable"; readonly why: string };

/**
 * Turn what an adapter saw into one of five answers.
 *
 * Pure. No clock, no filesystem, no network. The same request and the same
 * observation always give the same result, which is what lets a test be the
 * evidence rather than a rerun.
 *
 * REC-03 is the rule that shapes the whole function: an observation that cannot
 * be read settles nothing, and neither does the absence of a key. There is no
 * branch anywhere below that turns "I could not tell" into a terminal outcome,
 * because that is precisely the inference EFF-07 and REC-01 forbid.
 */
export function reconcile(
  request: EffectRequest,
  reality: RealityObservation,
): ReconciliationResult {
  // REC-02 first, and structurally: this function cannot perform the effect,
  // because it has no executor, no reference to one, and no path to the world.
  // It is a function of two values.
  switch (reality.kind) {
    case "completed_successfully":
      return { outcome: "CONFIRMED_SUCCESS" };

    case "completed_with_failure":
      return { outcome: "CONFIRMED_FAILURE", why: reality.why };

    case "running":
      // Still going is an answer, and a non-terminal one. The effect stays
      // pending, which is correct: it is genuinely unresolved.
      return { outcome: "STILL_ACTIVE" };

    case "absent":
      // The key resolved and nothing is there. This is a fact about the
      // world's records, not proof about the effect, so it is NOT_FOUND and not
      // CONFIRMED_FAILURE.
      return { outcome: "NOT_FOUND" };

    case "unreadable":
      return { outcome: "INCONCLUSIVE", why: reality.why };

    case "no_key":
      return {
        outcome: "INCONCLUSIVE",
        why: `effect ${request.id} carries no reconciliation key, so nothing can be looked up`,
      };

    case "not_applicable":
      return { outcome: "INCONCLUSIVE", why: reality.why };
  }
}

/** The answers that settle an effect, and the one that does not. */
export const TERMINAL_RECONCILIATIONS: ReadonlySet<ReconciliationResult["outcome"]> =
  new Set<ReconciliationResult["outcome"]>(["CONFIRMED_SUCCESS", "CONFIRMED_FAILURE"]);

/**
 * Does this answer let the effect stop being pending?
 *
 * A separate predicate rather than a comment, because the caller is about to
 * decide whether to append a terminal event and the two questions must not be
 * conflated: an answer can be definitive without being terminal.
 */
export function settles(result: ReconciliationResult): boolean {
  return TERMINAL_RECONCILIATIONS.has(result.outcome);
}

/**
 * The terminal observation this answer justifies, or null when it justifies
 * none.
 *
 * REC-05 falls out of this being the only way to make an observation: there is
 * exactly one function that turns evidence into a terminal event, and it hands
 * back null for anything that is not evidence. A caller that invents its own
 * mapping is the thing this shape prevents.
 */
export function terminalObservation(
  request: EffectRequest,
  result: ReconciliationResult,
): { effectId: string; outcome: EffectOutcome; why?: string } | null {
  switch (result.outcome) {
    case "CONFIRMED_SUCCESS":
      return { effectId: request.id, outcome: "succeeded" };
    case "CONFIRMED_FAILURE":
      return { effectId: request.id, outcome: "failed", why: result.why };
    case "STILL_ACTIVE":
    case "NOT_FOUND":
    case "INCONCLUSIVE":
      return null;
  }
}

/**
 * A sentence for a surface to print.
 *
 * A person who finds a crashed session needs to know what is knowable, and the
 * honest answer is usually longer than "retrying". Saying nothing here would
 * leave the surface to invent a summary, which is the failure mode this whole
 * project is against.
 */
export function describe(result: ReconciliationResult): string {
  switch (result.outcome) {
    case "CONFIRMED_SUCCESS":
      return "the effect finished and succeeded";
    case "CONFIRMED_FAILURE":
      return `the effect failed: ${result.why}`;
    case "STILL_ACTIVE":
      return "the effect is still running";
    case "NOT_FOUND":
      return "the effect is not in the world's records; this does not mean it failed";
    case "INCONCLUSIVE":
      return `still unknown: ${result.why}`;
  }
}