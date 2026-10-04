/**
 * What the person sees, derived from what was already observed.
 *
 * Three things that harnesses usually mix, kept apart here:
 *
 * ```text
 * REALITY  what was observed, and the observation is in the log
 * STATE    what the system kept, a fold over the log
 * VIEW     what a person reads, a rendering of the state
 * ```
 *
 * The rule that matters is that a view observes nothing. It reads a state that
 * was handed to it and formats it. If the view needed git, or a skill registry,
 * or a portfolio, then rendering would be an observation, and the cost would
 * come back exactly where it was removed: on the banner, on a resize, on every
 * keystroke of a prompt that repaints.
 *
 * So a value the surface has not observed is `unknown`, and it stays
 * `unknown`. Filling a gap by looking is how a display becomes a lie, and the
 * gap is usually small enough that nobody notices the difference until the
 * moment it matters.
 */

import type { Event, Evidence, Session } from "./core/store.ts";

/**
 * A fact that may or may not have been observed.
 *
 * Not `T | undefined`: the difference between "there is no such fact" and "no
 * one has looked" is the whole point, and collapsing them is the defect this
 * type exists to prevent. An empty registry and an unreadable one are
 * different facts, and the same applies here.
 */
export type Observed<T> =
  | { readonly known: true; readonly value: T }
  | { readonly known: false; readonly why: string };

export const seen = <T>(value: T): Observed<T> => ({ known: true, value });
export const unknown = (why = "not observed"): Observed<never> => ({
  known: false,
  why,
});

/** What a subject in the session is doing, from what the log recorded. */
export type SubjectState = "idle" | "running" | "waiting" | "done";

export interface SubjectView {
  subject: string;
  state: SubjectState;
  /** The event that decided the state, so a claim can be traced. */
  lastSeq: number;
  lastAt: number;
}

/** The verification outcome of work, if any. */
export type VerificationOutcome = "VERIFIED" | "REJECTED" | "INCONCLUSIVE";

export interface SessionState {
  id: string;
  goal: Observed<{ text: string; open: boolean }>;
  /**
   * The verification outcome of the work produced for the goal, if any.
   * `unknown` when no work was produced or no verification ran.
   * This distinguishes "work was produced but never checked" from "work was checked and rejected".
   */
  goalVerified: Observed<VerificationOutcome>;
  subjects: SubjectView[];
  /** Claims backed by evidence, with the evidence named. */
  proven: Array<{ claim: string; evidence: string; at: number }>;
  running: number;
  waiting: number;
  /** How many events, which is the only number a fold may count. */
  events: number;
  /** The tail, for a view that wants a trace. History, never current state. */
  recent: Event[];
  /**
   * Whether an effect was asked for and has not been answered.
   *
   * Derived here rather than beside the fold, because a second reading of the
   * same log is a second place for the truth to be wrong. The only fold in the
   * repository answers what the session permits.
   *
   * Observed, and `unknown` unless the caller can attest that the log it holds
   * is the whole log. A file that exists is not a log that is complete: a
   * truncated write, a resumed session, an event still buffered in a process
   * that died. Saying `false` in any of those cases is a claim nobody checked,
   * and it is the claim that starts a second spawn.
   */
  pendingEffect: Observed<boolean>;
  /**
   * The revision this state was folded from: the sequence of the last event.
   *
   * `-1` for an empty log, because there was nothing to read and a caller that
   * read nothing must not claim to have read revision 0.
   *
   * This is what an affordance is authorised against. The decision to act says
   * "I judged this at revision 41", and the append refuses if the journal is
   * no longer there. Without it, two surfaces can both read a state where
   * approving is allowed and both be right about what they saw, and one of them
   * wrong by the time it writes.
   */
  revision: number;
}

/**
 * Whether the events handed to the fold are the whole session.
 *
 * An enum rather than a boolean because the three states are not two, and a
 * boolean makes the caller write `true` or lie. `completeness: "unknown"` is
 * the default, so a caller that says nothing gets the honest answer.
 */
export type LogCompleteness =
  | "complete"
  | "incomplete"
  | "unknown";

export const LOG_UNKNOWN: LogCompleteness = "unknown";

/** How many trailing events a view is entitled to show as "recent". */
const RECENT = 8;

/**
 * Fold a log into the state a view may render.
 *
 * Pure, like every projection in this repository: the same log gives the same
 * state, and nothing here reads the clock, the filesystem or the network.
 * `now` is absent by construction, which is the cheapest way to keep it that
 * way.
 */
export function deriveState(
  events: Event[],
  id = "session",
  completeness: LogCompleteness = LOG_UNKNOWN,
): SessionState {
  // An intention that has been staged, and one that has been spent, are both
  // `goal` events and they are not the same fact. `staged: true` marks the
  // first; an effect request and its observation settle the second. Without
  // the distinction the fold cannot tell a decision waiting for a person from
  // a goal already handed to the world, which is the difference between an
  // affordance being offered and being withheld.
  const goalEvent = last(
    events,
    (e) => e.kind === "goal" && e.data.staged !== true,
  );
  const stagedEvent = last(
    events,
    (e) => e.kind === "goal" && e.data.staged === true,
  );
  const goalOpen = events.some(
    (e) => e.kind === "evidence" && e.data.goalClosed === true,
  );

  const subjects = new Map<string, SubjectView>();
  for (const event of events) {
    if (!event.subject) continue;
    const state = subjectStateOf(event);
    if (!state) continue;
    subjects.set(event.subject, {
      subject: event.subject,
      state,
      lastSeq: event.seq,
      lastAt: event.at,
    });
  }

  const evidence = events.filter((e) => e.kind === "evidence");
  const proven: SessionState["proven"] = [];
  for (const e of evidence) {
    const claim = typeof e.data.claim === "string" ? e.data.claim : null;
    const source = typeof e.data.source === "string" ? e.data.source : null;
    if (claim && source) {
      proven.push({ claim, evidence: source, at: e.at });
    }
  }

  // An intention is spent once the world said it started. A failure does not
  // spend it: the person still wants it, which is EFF-06, and keying on the
  // observation's outcome rather than on its presence is what keeps that true.
  const spent = events.some(
    (e) =>
      e.kind === "effect_observed" &&
      e.data.outcome === "succeeded" &&
      typeof e.data.effectId === "string" &&
      requestsById(events).has(e.data.effectId as string),
  );

  // Track work verification outcome. The last work_verified event for the goal's
  // effect determines the outcome. This distinguishes "work was checked and rejected"
  // from "work was never checked" (VER-06).
  const goalVerified = (() => {
    // Find the effect_id that corresponds to the goal's SpawnAgent request
    const goalEffectIds = new Set<string>();
    for (const e of events) {
      if (e.kind === "effect_requested" && e.data.effect === "SpawnAgent") {
        const id = typeof e.data.effectId === "string" ? e.data.effectId : null;
        if (id) goalEffectIds.add(id);
      }
    }
    // Find the last work_verified for any of those effect IDs
    let lastVerdict: VerificationOutcome | null = null;
    for (const e of events) {
      if (e.kind === "work_verified") {
        const effectId = typeof e.data.effectId === "string" ? e.data.effectId : null;
        const artifactId = typeof e.data.artifactId === "string" ? e.data.artifactId : null;
        // Check if this verification relates to our goal's effect
        if (effectId && goalEffectIds.has(effectId)) {
          const verdict = typeof e.data.verdict === "string" ? e.data.verdict.toUpperCase() : null;
          if (verdict === "VERIFIED" || verdict === "REJECTED" || verdict === "INCONCLUSIVE") {
            lastVerdict = verdict;
          }
        } else if (artifactId) {
          // Fallback: check if artifact was produced by this goal's effect
          // (in practice, artifactId is linked to the effect via work_produced)
          const verdict = typeof e.data.verdict === "string" ? e.data.verdict.toUpperCase() : null;
          if (verdict === "VERIFIED" || verdict === "REJECTED" || verdict === "INCONCLUSIVE") {
            lastVerdict = verdict;
          }
        }
      }
    }
    return lastVerdict !== null ? seen(lastVerdict) : unknown("no work verification recorded");
  })();

  // The intention in the log, if there is one. `staged: true` marks the fact
  // that a person decided something and the world has not taken it yet, but the
  // decision and the handover are the same kind of fact here, because both
  // answer "what is this session trying to do".
  const intent = last(
    events,
    (e) => e.kind === "goal" && typeof e.data.text === "string",
  );

  return {
    id,
    // Gone once it is closed or spent, not merely marked closed. A closed
    // intention is a decision already taken, so leaving it in `goal` makes it
    // reappear as something to decide, which is how a discarded goal used to
    // come back as a staged one.
    goal: intent && !spent && !goalOpen
      ? seen({
          text: intent.data.text as string,
          open: true,
        })
      : intent
        ? unknown(
            spent
              ? "the intention was handed to the world and nothing remains to decide"
              : "the intention was closed and nothing remains to decide",
          )
        : unknown("no goal was staged in this log"),
    goalVerified,
    subjects: [...subjects.values()].sort((a, b) => a.subject.localeCompare(b.subject)),
    proven,
    // Both counts come from the same pass, so they cannot disagree. A subject
    // that is neither running nor waiting is not "done", it is unknown, and
    // counting it as finished would be a number invented for the layout.
    running: [...subjects.values()].filter((s) => s.state === "running").length,
    waiting: [...subjects.values()].filter((s) => s.state === "waiting").length,
    events: events.length,
    recent: events.slice(-RECENT),
    pendingEffect: pendingEffectOf(events, completeness),
    revision: events.length === 0 ? -1 : events[events.length - 1]!.seq,
  };
}

/** Every effect id the log asked for, so an observation can be matched to one. */
function requestsById(events: Event[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.kind === "effect_requested" && typeof e.data.effectId === "string") {
      out.add(e.data.effectId);
    }
  }
  return out;
}

/**
 * Is there an effect asked for and not answered?
 *
 * The whole rule, in order:
 *
 *   requested E42                  -> known(true)
 *   requested E42, observed failed -> known(false)
 *   requested E42, observed ok     -> known(false)
 *   the log is not known complete -> unknown
 *
 * The completeness check comes first and short-circuits on purpose. If the log
 * might be missing its tail, then "no pending effect appears here" is a fact
 * about this file, not about the session, and the difference between those two
 * is the entire effect. So an incomplete log answers `unknown` even when the
 * effects it does contain are all resolved, which is the case that a naive
 * "scan for unresolved requests" would get wrong.
 *
 * A terminal observation matches a request by `effectId`, and only one. An
 * observation naming an id nobody requested resolves nothing: the world talked
 * about an effect that does not exist, and inventing the request from it would
 * be the mirror of EFF-04b.
 */
function pendingEffectOf(
  events: Event[],
  completeness: LogCompleteness,
): Observed<boolean> {
  if (completeness !== "complete") {
    return unknown(
      completeness === "incomplete"
        ? "the log is incomplete, so a missing observation cannot be ruled out"
        : "nobody attested that this log is the whole log",
    );
  }

  const requested = new Set<string>();
  for (const e of events) {
    if (e.kind === "effect_requested") {
      const id = typeof e.data.effectId === "string" ? e.data.effectId : null;
      if (id) requested.add(id);
    }
  }
  for (const e of events) {
    if (e.kind === "effect_observed") {
      const id = typeof e.data.effectId === "string" ? e.data.effectId : null;
      if (id) requested.delete(id);
    }
  }

  // An empty log is a complete log that asked for nothing.
  return seen(requested.size > 0);
}

/** Derive from an already-folded session, for a caller that has one. */
export function stateOf(session: Session): SessionState {
  return deriveState(session.events, session.id);
}

function last<T extends Event>(events: Event[], where: (e: Event) => boolean): Event | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (where(events[i]!)) return events[i]!;
  }
  return null;
}

/**
 * What an event says about its subject's state.
 *
 * Returns null when the event says nothing about state, which is the common
 * case: an observation is a fact, not an activity change, and treating every
 * event as "still running" is how a log fills with subjects that appear busy
 * and never finish.
 */
function subjectStateOf(event: Event): SubjectState | null {
  switch (event.kind) {
    case "action":
      return "running";
    case "observation":
      return typeof event.data.awaiting === "string" ? "waiting" : null;
    case "evidence":
      return "done";
    default:
      return null;
  }
}

/** Human label for a subject state, for a view. */
export const SUBJECT_LABEL: Record<SubjectState, string> = {
  idle: "idle",
  running: "running",
  waiting: "waiting",
  done: "done",
};

/**
 * A state, read by a person.
 *
 * Every line here comes from a field the fold filled. Where the fold said it
 * does not know, this says so rather than leaving a gap that a reader fills
 * with an assumption, and there is no place in this function that could go and
 * look.
 */
export function stateReport(state: SessionState): string {
  const lines: string[] = [];
  lines.push(`session  ${state.id}   ${state.events} events`);

  // The goal is either observed or explicitly unknown, and "unknown" is a
  // legitimate thing to read. An empty goal line would be a claim.
  lines.push(
    state.goal.known
      ? `goal      ${state.goal.value.text}${state.goal.value.open ? "" : "   (closed)"}`
      : `goal      unknown: ${state.goal.why}`,
  );

  if (state.subjects.length === 0) {
    lines.push("subjects  none in this log");
  } else {
    lines.push(`subjects  ${state.running} running, ${state.waiting} waiting`);
    for (const s of state.subjects) {
      lines.push(`  ${s.subject.padEnd(20)}${SUBJECT_LABEL[s.state]}`);
    }
  }

  if (state.proven.length === 0) {
    lines.push("proven     nothing carries both a claim and its evidence");
  } else {
    lines.push(`proven     ${state.proven.length}`);
    for (const p of state.proven) {
      lines.push(`  ${p.claim.padEnd(28)}${p.evidence}`);
    }
  }
  return lines.join("\n");
}

export type { Evidence };
