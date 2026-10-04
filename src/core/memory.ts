/**
 * Core: durable objects, and the conditions that wake them.
 *
 * The problem this solves is not storage. It is that a portfolio of this shape
 * has more ideas than hours, so the failure modes are both forgetting and
 * noise. An idea with no wake condition is read once, judged not urgent, and
 * never returned to. An idea that can wake on anything is read constantly and
 * never acted on. The middle is a set of durable objects, each carrying the
 * condition under which reality would make it relevant again.
 *
 * Three commitments:
 *
 * 1. Falsifying never deletes. A claim that turned out wrong keeps its original
 *    belief, its counterexample, and whatever replaced it, because the next
 *    agent will make the same mistake and needs to be told it was made before.
 *    Deleting the mistake is how it gets remade.
 *
 * 2. A wake condition is a checkable statement, never a date. A date in a
 *    calendar tells nobody whether the world has changed; "at least 3
 *    reproducible alignment failures that no existing primitive addresses" can
 *    be evaluated by anyone, and disagrees when it should.
 *
 * 3. This core decides nothing. It says which ideas have a satisfied
 *    condition, and the caller decides what that means. Automating the
 *    selection would be a transfer of authority that the portfolio rules
 *    forbid, exactly as the radar already states.
 *
 * No I/O, no clock. A measurement arrives as an argument.
 */

export type ObjectKind =
  | "Finding"
  | "Claim"
  | "Decision"
  | "Program"
  | "Gate"
  | "FutureTrigger";

export type ObjectStatus = "active" | "falsified" | "superseded" | "closed";

/** The horizon an object occupies. Selection stays human; this is bookkeeping. */
export type Horizon = "now" | "watch" | "sleep";

/** What established the object, and where that can be checked. */
export interface Evidence {
  source: string;
  observed: string;
  at: string;
}

/**
 * The wake condition. `requires` is prose by design: a condition nobody can
 * evaluate is a wish, and the whole mechanism fails if these are not checkable
 * statements. `satisfiedBy` is the measurement that settles it.
 */
export interface RevisitCondition {
  signal: string;
  requires: string;
  /** Names of measurements that, taken together, would satisfy this. */
  satisfiedBy: string[];
  matched: boolean;
}

export interface DurableObject {
  id: string;
  kind: ObjectKind;
  horizon: Horizon;
  what: string;
  why: string;
  evidence: Evidence[];
  status: ObjectStatus;
  /** Absent means the object sleeps permanently. That is a valid choice. */
  revisit_when?: RevisitCondition;
  related_to: string[];

  /** Present exactly when status is `falsified`. */
  original_belief?: string;
  counterexample?: string;
  replacement?: string;

  /** The object this one supersedes, if any. The graph keeps both. */
  supersedes?: string;
}

export interface WakeEvaluation {
  id: string;
  satisfied: boolean;
  /**
   * True when a named measurement is missing, so the condition could not be
   * checked. Distinct from "checked and not met", because those two lead to
   * opposite decisions and the caller must be able to tell them apart.
   */
  unevaluable: boolean;
  /** The measurements that were present, for the caller to judge. */
  measured: Record<string, number | boolean>;
}

/**
 * Evaluate one wake condition against a measurement set.
 *
 * Three things can be true, and only two of them wake anything:
 *
 * 1. Every named measurement is present AND the object is marked `matched`.
 *    The object is woken.
 * 2. Every named measurement is present but `matched` is false. The world has
 *    produced the numbers and they did not reach the threshold. Not woken.
 * 3. A measurement is missing. Not woken, and the caller is told the condition
 *    is unevaluable rather than unmet.
 *
 * The `matched` flag is what makes this a gate and not a coincidence. An
 * earlier version inferred satisfaction from the presence of a measurement,
 * which meant any object naming a measurement could wake on it. That is the
 * same class of bug this project exists to catch, committed in the primitive
 * meant to prevent it: converting an inability to observe into an absence of
 * fact, in the opposite direction.
 */
export function evaluateWake(
  object: DurableObject,
  measured: Record<string, number | boolean>,
): WakeEvaluation {
  const condition = object.revisit_when;
  if (!condition) {
    return { id: object.id, satisfied: false, unevaluable: false, measured };
  }

  const present = condition.satisfiedBy.filter((m) => m in measured);
  const unevaluable = present.length < condition.satisfiedBy.length;
  const satisfied =
    !unevaluable &&
    condition.satisfiedBy.length > 0 &&
    condition.matched;

  return { id: object.id, satisfied, unevaluable, measured };
}

/** Objects whose wake condition is now met, and that are still alive. */
export function wakeable(
  objects: DurableObject[],
  measured: Record<string, number | boolean>,
): DurableObject[] {
  return objects.filter(
    (o) =>
      o.status === "active" &&
      o.revisit_when !== undefined &&
      evaluateWake(o, measured).satisfied,
  );
}

/**
 * Objects that are genuinely dormant: alive, with no wake condition, and not
 * currently consuming attention.
 *
 * The horizon filter matters here. An object in `now` or `watch` has no wake
 * condition because it does not need one, and counting those as asleep would
 * tell a session that work already in progress is merely waiting, which is the
 * confusion this module exists to prevent.
 */
export function permanentlyAsleep(objects: DurableObject[]): DurableObject[] {
  return objects.filter(
    (o) =>
      o.status === "active" &&
      o.horizon === "sleep" &&
      o.revisit_when === undefined,
  );
}

/**
 * Falsify an object without destroying it.
 *
 * The original belief is preserved verbatim, because the value of a falsified
 * claim is entirely in what it used to say. An agent arriving later needs the
 * wrong belief in its own words, not a summary of the correction.
 */
export function falsify(
  object: DurableObject,
  counterexample: string,
  replacement: string,
): DurableObject {
  if (object.status === "falsified") {
    return object;
  }
  return {
    ...object,
    status: "falsified",
    original_belief: object.original_belief ?? object.what,
    counterexample,
    replacement,
  };
}

/**
 * The full trail an agent needs before repeating a mistake: what was believed,
 * what broke it, and what replaced it. Returns null when there is no lesson,
 * which is the common case and must not be dressed up as one.
 */
export function lessonFrom(
  object: DurableObject,
  objects: DurableObject[],
): { believed: string; counterexample: string; now: string } | null {
  if (object.status !== "falsified") {
    return null;
  }
  const replaced = object.replacement
    ? objects.find((o) => o.what === object.replacement || o.id === object.replacement)
    : undefined;
  return {
    believed: object.original_belief ?? object.what,
    counterexample: object.counterexample ?? "(none recorded)",
    // An empty replacement is a real gap in the record, and saying nothing
    // would let a later reader assume the correction was trivial or obvious.
    now: replaced ? replaced.what : object.replacement || "(nothing recorded)",
  };
}

/** The frontier a new session reconstructs, instead of rereading history. */
export interface Frontier {
  now: DurableObject[];
  watch: DurableObject[];
  woken: DurableObject[];
  asleep: DurableObject[];
  lessons: Array<{ id: string } & ReturnType<typeof lessonFrom>>;
}

export function buildFrontier(
  objects: DurableObject[],
  measured: Record<string, number | boolean>,
): Frontier {
  const alive = objects.filter((o) => o.status === "active");
  return {
    now: alive.filter((o) => o.horizon === "now"),
    watch: alive.filter((o) => o.horizon === "watch"),
    woken: wakeable(objects, measured),
    asleep: permanentlyAsleep(objects),
    lessons: objects
      .filter((o) => o.status === "falsified")
      .flatMap((o) => {const lesson=lessonFrom(o,objects);return lesson?[{id:o.id,...lesson}]:[];}),
  };
}
