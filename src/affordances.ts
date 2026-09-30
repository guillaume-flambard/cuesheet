/**
 * What the state permits, derived from the state and nothing else.
 *
 * The surface used to decide for itself. `chat.ts` carried the table of what a
 * staged intention may be answered with, and the staged branch was written
 * twice before it stopped throwing work away. That knowledge was in a file
 * that renders, which is the wrong place for it: a CLI, a TUI, an API and an
 * agent each need it, and none of them should have to learn it from the other.
 *
 * So it moves here. A function of the state, with no I/O, no clock and no
 * model, which means every surface can hold the same rule and a test can
 * check it without running anything.
 *
 * The property this is for:
 *
 * > The interface never decides what is possible. It shows what the state
 * > allows.
 */

import type { Observed, SessionState } from "./state.ts";

/**
 * The reduced state an affordance is computed from.
 *
 * Deliberately smaller than a session: an affordance that read evidence counts
 * and agent activity would need those to be present, and a caller with a partial
 * view would then get a different set. Three facts, each of them already
 * observed or explicitly not.
 */
export interface AffordanceInput {
  /** The intent waiting for a decision, if there is one. */
  staged: Observed<{ text: string; open: boolean }>;
  /** Whether a session exists to inspect at all. */
  hasSession: boolean;
  /**
   * Whether an effect was asked for and has not been answered.
   *
   * Carried in, not derived here, because `affordancesOf` already has the state
   * that carries it and `deriveAffordances` is the shape that predates it.
   *
   * Observed rather than boolean, and that is the whole point. A caller that
   * never looked cannot say "nothing is in flight": not knowing is not the same
   * as knowing there is nothing, which is REGISTRY_UNVERIFIED in the execution
   * path and EFF-07 in this one. Only an observed `false` clears the way.
   *
   * Required. An optional one would let every pre-P7 caller keep compiling and
   * silently mean `false`, and the double approval would come back without
   * anyone touching the code that allows it.
   */
  pending: Observed<boolean>;
}

export type Affordance =
  | "APPROVE_GOAL"
  | "REJECT_GOAL"
  | "REPLACE_GOAL"
  | "CANCEL_SESSION"
  | "INSPECT"
  | "EXIT";

/**
 * An action, and the state it was derived from.
 *
 * `reads` is the part that matters for what comes next. An action that
 * changes the state has just used a precondition to decide it was allowed, and
 * that precondition is the thing to record: it is what an audit needs, and it
 * is what tells a later reader why the action existed at all. Without it, the
 * only trace of a decision is that something happened.
 */
export interface AvailableAction {
  action: Affordance;
  /**
   * The state facts this action's availability was computed from, which is its
   * read-set.
   *
   * It answers a second question, and the second one is the interesting one:
   * not only "is this action permitted" but "which observed facts permitted it".
   * That is what makes an action auditable before anything runs: the trace of a
   * decision is the precondition it was allowed by, not the fact that it
   * happened.
   *
   * Deliberately a flat list of names and nothing more. No dependency graph, no
   * invalidation, no hashing: the shape is already enough to answer "was this
   * still true", and anything richer would be a second truth to keep in step.
   */
  reads: Record<string, "known">;
  /** True when this action would change the state it was derived from. */
  mutates: boolean;
}

/**
 * What the state permits.
 *
 * AFF-01: pure. No clock, no I/O, no model, and no dependence on anything the
 * caller did not pass. Two calls with the same input give the same set, which
 * is what lets a surface render it and an agent check it and get one answer.
 *
 * The shape of the rule is absence: `APPROVE_GOAL` is not "allowed unless
 * something", it is simply absent when there is no staged intention. A surface
 * that renders a list of affordances cannot render an unavailable one, because
 * there is nothing to render. That is AFF-02 by construction rather than by
 * review.
 */
export function deriveAffordances(input: AffordanceInput): AvailableAction[] {
  const out: AvailableAction[] = [];

  if (!input.staged.known) {
    if (input.hasSession) {
      out.push({
        action: "INSPECT",
        reads: { hasSession: "known" as const },
        mutates: false,
      });
    }
    // Consumes nothing, and says so: a state nobody observed cannot refuse the
    // ability to quit. That is a precondition of the empty set, which is more
    // useful to a reader than inventing one.
    out.push({ action: "EXIT", reads: {}, mutates: true });
    return out;
  }

  const open = input.staged.value.open;
  // Flat on purpose. `stagedOpen` is a field *of* the staged intention rather
  // than a fact of its own, and a consumer checking "did this action read
  // anything it was not given" needs a flat set of names to check against.
  const reads = {
    staged: "known" as const,
    stagedOpen: "known" as const,
  };
  /** The names an action may read, so AFF-06 can be checked mechanically. */
  const FACT_NAMES = new Set(["staged", "stagedOpen", "hasSession", "pending"]);
  for (const key of Object.keys(reads)) {
    if (!FACT_NAMES.has(key)) {
      throw new Error(`affordance read an unknown fact: ${key}`);
    }
  }
  if (open) {
    // Approving is the one action that starts an effect, so it is the one
    // action a pending effect suspends. Everything else stays: a person whose
    // spawn has not come back yet must still be able to replace the goal,
    // discard it, or leave. Only the thing that would start a second one of the
    // same kind is withheld, and only while the first is unanswered.
    //
    // Withheld as absence, not as a flag: the affordance is not in the list at
    // all, so a surface cannot render it and an agent cannot select it.
    if (input.pending.value === false) {
      out.push({ action: "APPROVE_GOAL", reads, mutates: true });
    }
    out.push({ action: "REJECT_GOAL", reads, mutates: true });
    out.push({ action: "REPLACE_GOAL", reads, mutates: true });
    out.push({ action: "CANCEL_SESSION", reads: { staged: "known" as const }, mutates: true });
  } else {
    out.push({ action: "REPLACE_GOAL", reads, mutates: true });
  }

  if (input.hasSession) {
    out.push({ action: "INSPECT", reads: { hasSession: "known" as const }, mutates: false });
  }

  // Leaving is always permitted and consumes nothing: it cannot be refused by
  // a state that has not been observed, because refusing it would be a lock.
  out.push({ action: "EXIT", reads: {}, mutates: true });

  return out;
}

/**
 * The affordances of a session, from the fold that produced it.
 *
 * `pending` comes out of the same log the state came out of, so a surface that
 * renders from a fold cannot disagree with itself about whether something is
 * in flight.
 */
export function affordancesOf(state: SessionState): AvailableAction[] {
  return deriveAffordances({
    staged: state.goal,
    hasSession: state.events > 0,
    pending: state.pendingEffect,
  });
}

/**
 * True when the state permits the action. A surface asks; it does not decide.
 *
 * The pending effect comes out of `state`, which is the point of P8: a control
 * decision reads the fold and nothing else. There is no second reading of the
 * log to disagree with this one.
 *
 * The first version of this function took `pending` as a parameter and
 * defaulted it to `seen(false)`. That default is the exact claim EFF-07
 * forbids, so every call site compiled unchanged while asserting that nothing
 * was in flight.
 */
export function allows(state: SessionState, action: Affordance): boolean {
  return affordancesOf(state).some((a) => a.action === action);
}

export const AFFORDANCE_LABEL: Record<Affordance, string> = {
  APPROVE_GOAL: "go",
  REJECT_GOAL: "no",
  REPLACE_GOAL: "name another",
  CANCEL_SESSION: "exit",
  INSPECT: "inspect",
  EXIT: "exit",
};
