/**
 * Asking the world to do something, and what it said back.
 *
 * Until now the surface mutated its own state when a person typed a word:
 * `staged = null` before `runGoal`. That is a command being taken as its own
 * outcome, and it is the difference between "the person asked" and "the world
 * agreed".
 *
 * So an effect has two events and never one. The request says what was asked and
 * carries the affordance and the read-set that allowed it. The observation says
 * what came back and names the request it answers. Between them the process may
 * die, and what survives a restart is a request with no answer, which is a third
 * state and the only honest one:
 *
 * ```text
 * requested, outcome unobserved
 * ```
 *
 * Not success, because nobody saw it start. Not failure, because nobody saw it
 * refuse. Guessing either would be inventing a fact about the world, which is
 * the one move this repository exists to prevent.
 *
 * An intent therefore survives the failure of the effect meant to carry it out.
 * A refused spawn is a fact about the spawn, not about the intention, and a
 * surface that drops the goal on a failed attempt has thrown away the work for
 * no reason.
 */

import type { Event } from "./core/store.ts";

export type EffectName = "SpawnAgent";

export type EffectOutcome = "succeeded" | "failed";

/** An effect that was asked for, with the authority it was asked under. */
export interface EffectRequest {
  id: string;
  effect: EffectName;
  /** What the world is being asked to do, in its own terms. */
  subject: string;
  /** The affordance that permitted this, and the facts it read to do so. */
  affordance: string;
  reads: Record<string, "known">;
  /**
   * The revision this request was committed against, as CON-01 requires.
   *
   * Part of the request rather than of the surrounding append, because a request
   * outlives the process that made it: the whole point of P11 is reading this
   * record again after a restart, and a record that cannot say which state it
   * was judged against is a decision nobody can audit.
   *
   * Nullable, and that is not a hedge. A log written before P12 has no revision
   * in it, and reading one back must not invent a number. `null` means "this
   * record does not say", which is a fact about the record.
   */
  revision: number | null;
  /**
   * An identifier the world will still recognise after a restart, when the
   * adapter can genuinely look the effect up by it.
   *
   * Optional, and the default, because it is a claim about an external system
   * that only an adapter with real knowledge may make. A PID that has exited is
   * not proof the spawn failed, and a key that resolves to nothing is not proof
   * it never started. So this field exists only when something can honour it,
   * and its absence is itself meaningful: without one, reconciliation can only
   * be INCONCLUSIVE.
   */
  reconciliationKey?: string;
}

/**
 * Why an effect failed, in a form somebody can act on.
 *
 * An honest failure is not an explained one. Cuesheet reported
 * `registry is not defined` faithfully as `outcome: "failed"`, kept the
 * intention, and was still impossible to diagnose: the message said what
 * happened and nothing about which stage failed, whether the world refused or
 * our own wiring broke, or what kind of thing would fix it.
 *
 * So a failure names three things instead of carrying a sentence:
 *
 * ```text
 * step     where it broke, from a closed set
 * origin   whose fault, which is a different question from what broke
 * why      the detail, free text, because detail is not a classification
 * ```
 *
 * `origin` is the load-bearing field. `Cuesheet` means our wiring is broken and
 * no world would have helped; `world` means the world answered no. Those need
 * opposite responses and they used to be the same string.
 */
export type FailureStep =
  /** Preparing the effect: identity, directory, input. */
  | "prepare"
  /** Starting the process. */
  | "launch"
  /** The effect ran and did not finish. */
  | "run"
  /** Reading what came back. */
  | "observe"
  /** Reconciling after a restart. */
  | "reconcile";

/**
 * Whose failure this is.
 *
 * `cuesheet` is the one that was invisible. Every other value describes the
 * world, and the world refusing is a normal outcome that the intention survives.
 * Our wiring breaking is not a normal outcome, and treating it as one is how a
 * broken feature reports success for hundreds of tests.
 */
export type FailureOrigin = "world" | "cuesheet" | "provider" | "unknown";

export interface FailureCause {
  readonly step: FailureStep;
  readonly origin: FailureOrigin;
  readonly why: string;
}

/** What the world answered. Never derived from the request. */
export interface EffectObservation {
  /** The request this answers. An unmatched observation is a fact, too. */
  effectId: string;
  outcome: EffectOutcome;
  /** Why it failed, when it failed. Absence is not a reason. */
  why?: string;
  /**
   * The structured cause, required whenever the outcome is `failed`.
   *
   * Required rather than optional because the first version made it optional and
   * a failure without one is a failure nobody can act on, which is the case this
   * type exists to rule out.
   */
  failure?: FailureCause;
}

/**
 * What the log knows about one effect.
 *
 * Three states, not two. `unobserved` is the load-bearing one: it is what a
 * crash between the request and the answer leaves behind, and it is the reason
 * this type exists rather than a boolean.
 */
export type EffectStatus =
  | { readonly status: "requested"; readonly request: EffectRequest }
  | { readonly status: "succeeded"; readonly request: EffectRequest; readonly at: number }
  | {
      readonly status: "failed";
      readonly request: EffectRequest;
      readonly at: number;
      readonly why: string | null;
      /**
       * The classified cause, when the record carried one.
       *
       * Optional rather than required, because a log written before this field
       * existed carries a `why` and nothing else. That is a real record and
       * inventing an origin for it would be guessing, which is the same rule as
       * `revision: number | null` applied to a cause.
       */
      readonly failure?: FailureCause;
    };

export type { EffectRequest as Effect };

/** Build the event that records an ask. It asserts nothing about the outcome. */
export function effectRequested(request: EffectRequest): Omit<Event, "seq" | "at"> {
  return {
    kind: "effect_requested",
    subject: request.subject,
    data: {
      effect: request.effect,
      effectId: request.id,
      affordance: request.affordance,
      reads: request.reads,
      // Recorded, not trusted on the way back in: a log that says it was
      // committed at 41 is evidence for a human reading it, and the fold
      // re-derives the real revision from the sequence anyway.
      revision: request.revision,
      ...(request.reconciliationKey ? { reconciliationKey: request.reconciliationKey } : {}),
    },
  };
}

/** Build the event that records what the world said. */
export function effectObserved(observation: EffectObservation): Omit<Event, "seq" | "at"> {
  return {
    kind: "effect_observed",
    subject: observation.effectId,
    data: {
      effectId: observation.effectId,
      outcome: observation.outcome,
      why: observation.why ?? null,
      // Recorded as a nested object rather than flattened into the event, so a
      // reader can tell "no cause given" from "cause given and it is null".
      failure: observation.failure ?? null,
    },
  };
}

/**
 * Is this a usable cause?
 *
 * Checked on the way back in rather than trusted, because the log is read by
 * whatever version comes next and a record written by a future one may carry
 * fields this one does not know. An unknown shape is dropped rather than
 * half-accepted, which keeps a failure's origin from being guessed.
 */
function isFailureCause(value: unknown): value is FailureCause {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.step === "string" &&
    typeof c.origin === "string" &&
    typeof c.why === "string"
  );
}

function readRequest(event: Event): EffectRequest | null {
  const d = event.data as Record<string, unknown>;
  const id = d.effectId;
  const effect = d.effect;
  const affordance = d.affordance;
  if (typeof id !== "string" || typeof effect !== "string" || typeof affordance !== "string") {
    return null;
  }
  // `revision` and `reconciliationKey` are restored here rather than left out.
  //
  // The first version of this reader dropped both, so a request read back out
  // of the log had `revision: undefined` while the type said `revision: number`,
  // and lost the one field that makes a crash recoverable. Found by Agent E
  // while building the proof ledger, which is the argument for having one.
  const revision = typeof d.revision === "number" ? d.revision : null;
  const key = typeof d.reconciliationKey === "string" ? d.reconciliationKey : undefined;

  return {
    id,
    effect: effect as EffectName,
    subject: event.subject,
    affordance,
    reads: (d.reads as Record<string, "known"> | undefined) ?? {},
    // A log written before P12 has no revision field. Rather than inventing
    // one, the request says it does not know, which is the honest answer and
    // the only reason `revision` is nullable on the read side.
    revision,
    ...(key ? { reconciliationKey: key } : {}),
  };
}

/**
 * Fold every effect in the log into its current status.
 *
 * Pure, and it never guesses. A request with no matching observation stays
 * `requested`, whatever else the log says, and a second observation for the
 * same effect is kept rather than overwritten, because "tried twice" is a fact
 * the log holds and a projection that collapses it is hiding a retry.
 */
export function effectStatuses(events: Event[]): Map<string, EffectStatus> {
  const out = new Map<string, EffectStatus>();
  for (const event of events) {
    if (event.kind === "effect_requested") {
      const request = readRequest(event);
      if (request) out.set(request.id, { status: "requested", request });
      continue;
    }
    if (event.kind === "effect_observed") {
      const id = event.data.effectId;
      const outcome = event.data.outcome;
      if (typeof id !== "string" || (outcome !== "succeeded" && outcome !== "failed")) continue;
      const previous = out.get(id);
      // EFF-04: an observation only resolves an effect that was asked for. A
      // success is never inferred for an effect nobody requested, and a request
      // nobody observed stays unresolved no matter how many events follow.
      if (!previous) continue;
      if (outcome === "succeeded") {
        out.set(id, { status: "succeeded", request: previous.request, at: event.at });
      } else {
        out.set(id, {
          status: "failed",
          request: previous.request,
          at: event.at,
          why: typeof event.data.why === "string" ? event.data.why : null,
          ...(isFailureCause(event.data.failure) ? { failure: event.data.failure } : {}),
        });
      }
    }
  }
  return out;
}

/** Effects that were asked for and never answered. */
export function unobservedEffects(statuses: Map<string, EffectStatus>): EffectStatus[] {
  return [...statuses.values()].filter((s) => s.status === "requested");
}

/**
 * Work out whether a failure is the world's or ours.
 *
 * The distinction is not cosmetic. Every value of `origin` except `cuesheet`
 * describes a world that answered, and a world refusing is a normal outcome the
 * intention survives. `cuesheet` means our own wiring broke, and retrying into it
 * is pointless. A throw inside the run is the second: no world was ever asked.
 *
 * A programming error is recognisable by its own shape rather than by its name,
 * because names are what the `registry` defect got wrong. `ReferenceError` and
 * `TypeError` mean a name or a shape did not exist, which is never something
 * the world does.
 */
export function classifyFailure(cause: unknown): {
  step: FailureStep;
  origin: FailureOrigin;
  why: string;
} {
  const why = cause instanceof Error ? cause.message : String(cause);

  // A boundary that already knows wins, before any type is examined.
  //
  // The reason is a provider SDK. An adapter that calls a third-party client can
  // throw a `ReferenceError` from inside that client, and a rule that reads
  // `ReferenceError` as "our wiring" would blame Cuesheet for a bug in code we
  // do not own and cannot read. The boundary is closer to the cause than the
  // exception type is, so it goes first.
  if (cause instanceof FailureWithOrigin) {
    return { step: cause.step, origin: cause.origin, why: cause.message };
  }

  if (cause instanceof ReferenceError || cause instanceof SyntaxError) {
    return { step: "launch", origin: "cuesheet", why };
  }
  if (cause instanceof TypeError) {
    return { step: "launch", origin: "cuesheet", why };
  }
  if (cause instanceof Error && /OPENROUTER_API_KEY|provider|api key|unauthorized|401/i.test(why)) {
    return { step: "launch", origin: "provider", why };
  }
  if (cause instanceof Error && /ENOENT|EACCES|EPERM|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(why)) {
    return { step: "run", origin: "world", why };
  }
  return { step: "run", origin: "unknown", why };
}

/**
 * A failure whose boundary already knows who it belongs to.
 *
 * The escape hatch for the case `classifyFailure` cannot solve alone, and it is
 * the shape every adapter should throw from its own catch: a provider adapter
 * wrapping a third-party SDK is the concrete example, because that SDK can
 * throw anything at all.
 *
 * Without this, the only way to attribute a provider failure is to match on its
 * message, which is the guess the type was supposed to replace.
 */
export class FailureWithOrigin extends Error {
  readonly step: FailureStep;
  readonly origin: FailureOrigin;
  /**
   * The detail, kept as its own field rather than only as the message.
   *
   * `classifyFailure` read `cause.why` when only `cause.message` existed, so an
   * attributed failure reported `why: undefined` and fell back to the exception
   * type. The tests passed because they never constructed an instance. `tsc`
   * found it in one line, which is the argument for having a type check at all.
   */
  readonly why: string;

  constructor(step: FailureStep, origin: FailureOrigin, why: string) {
    super(why);
    this.name = "FailureWithOrigin";
    this.step = step;
    this.origin = origin;
    this.why = why;
  }
}
