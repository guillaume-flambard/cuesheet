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

export interface SessionState {
  id: string;
  goal: Observed<{ text: string; open: boolean }>;
  subjects: SubjectView[];
  /** Claims backed by evidence, with the evidence named. */
  proven: Array<{ claim: string; evidence: string; at: number }>;
  running: number;
  waiting: number;
  /** How many events, which is the only number a fold may count. */
  events: number;
  /** The tail, for a view that wants a trace. History, never current state. */
  recent: Event[];
}

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
export function deriveState(events: Event[], id = "session"): SessionState {
  const goalEvent = last(events, (e) => e.kind === "goal");
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

  return {
    id,
    goal: goalEvent
      ? seen({
          text: typeof goalEvent.data.text === "string" ? goalEvent.data.text : goalEvent.subject,
          open: !goalOpen,
        })
      : unknown("no goal was staged in this log"),
    subjects: [...subjects.values()].sort((a, b) => a.subject.localeCompare(b.subject)),
    proven,
    // Both counts come from the same pass, so they cannot disagree. A subject
    // that is neither running nor waiting is not "done", it is unknown, and
    // counting it as finished would be a number invented for the layout.
    running: [...subjects.values()].filter((s) => s.state === "running").length,
    waiting: [...subjects.values()].filter((s) => s.state === "waiting").length,
    events: events.length,
    recent: events.slice(-RECENT),
  };
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
