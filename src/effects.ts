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
}

/** What the world answered. Never derived from the request. */
export interface EffectObservation {
  /** The request this answers. An unmatched observation is a fact, too. */
  effectId: string;
  outcome: EffectOutcome;
  /** Why it failed, when it failed. Absence is not a reason. */
  why?: string;
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
    };

export type { EffectRequest as Effect };

/** Build the event that records an ask. It asserts nothing about the outcome. */
export function effectRequested(request: EffectRequest): Omit<Event, "seq" | "at"> {
  return {
    kind: "effect_requested",
    subject: request.subject,
    data: { effect: request.effect, effectId: request.id, affordance: request.affordance, reads: request.reads },
  };
}

/** Build the event that records what the world said. */
export function effectObserved(observation: EffectObservation): Omit<Event, "seq" | "at"> {
  return {
    kind: "effect_observed",
    subject: observation.effectId,
    data: { effectId: observation.effectId, outcome: observation.outcome, why: observation.why ?? null },
  };
}

function readRequest(event: Event): EffectRequest | null {
  const d = event.data as Record<string, unknown>;
  const id = d.effectId;
  const effect = d.effect;
  const affordance = d.affordance;
  if (typeof id !== "string" || typeof effect !== "string" || typeof affordance !== "string") {
    return null;
  }
  return {
    id,
    effect: effect as EffectName,
    subject: event.subject,
    affordance,
    reads: (d.reads as Record<string, "known"> | undefined) ?? {},
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
