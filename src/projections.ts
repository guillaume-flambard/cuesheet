/**
 * One stream of events, two renderings.
 *
 * The core already has an event log with a closed vocabulary: goal, capability,
 * directive, observation, action, evidence, model, note. It is written to a
 * file and nothing renders it. So this is not a new event model, it is the
 * existing one given a surface, and the surface exists twice.
 *
 * The same state, the same events, two projections:
 *
 * ```text
 * interactive   a line per event, timestamped, in prose a person reads
 * machine       one JSON object per line, stable keys, nothing decorative
 * ```
 *
 * The reason this is a module and not a flag is that the temptation is exactly
 * a flag. One output function with an `if (tty)` inside it is where a decoration
 * leaks into a pipe and a script starts parsing a greeting. Two renderers over
 * one event list cannot drift in that direction, because neither can call the
 * other.
 *
 * What the core must not learn: that any of this exists. A projection is a
 * consumer of a log, the same way a script is.
 */

import type { Event, EventKind } from "./core/store.ts";

export type RenderMode = "interactive" | "machine";

export interface Projection {
  readonly mode: RenderMode;
  /** One line per event. A machine line is a complete JSON object. */
  line(event: Event): string;
}

/** `11:42  goal       Fix capability display` */
function clock(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The human projection: a timestamp, the kind, and whatever the event says.
 *
 * The kind is padded to a column so a run reads as a list of things that
 * happened rather than a wall of sentences, which is the difference between a
 * transcript and a log.
 */
export class InteractiveProjection implements Projection {
  readonly mode = "interactive" as const;

  line(event: Event): string {
    const kind = event.kind.padEnd(11);
    const subject = event.subject ? ` ${event.subject}` : "";
    return `  ${clock(event.at)}  ${kind}${subject}${detail(event)}`;
  }
}

/**
 * The machine projection: one JSON object per line, newline delimited.
 *
 * Every line carries the same keys whatever the kind, so a consumer reads
 * `type` and `at` without a schema per event. Absent facts are null rather
 * than omitted, because a key that appears and disappears is a key a consumer
 * has to guard.
 */
export class MachineProjection implements Projection {
  readonly mode = "machine" as const;

  line(event: Event): string {
    return JSON.stringify({
      seq: event.seq,
      at: event.at,
      type: event.kind,
      subject: event.subject || null,
      ...event.data,
    });
  }
}

export function projectionFor(mode: RenderMode): Projection {
  return mode === "machine" ? new MachineProjection() : new InteractiveProjection();
}

/** The readable tail of an event, when it carries facts worth a column. */
function detail(event: Event): string {
  const { data } = event;
  // An observation that does not say what was observed is a category, not a
  // line. The text is the reason the event exists, so it belongs in the view.
  if (typeof data.text === "string" && data.text.length > 0) {
    return `  ${clip(data.text)}`;
  }
  if (typeof data.tool === "string") {
    // An action is named by its tool, and an observation of a tool's result
    // carries the exit code, which is the fact worth seeing.
    const exit = "exit" in data ? ` exit ${String(data.exit)}` : "";
    return event.kind === "action" ? `  ${data.tool}${exit}` : `  ${data.tool}${exit}`;
  }
  if (event.kind === "evidence") {
    const status = typeof data.status === "string" ? data.status : null;
    return status ? `  ${status}` : "";
  }
  if (event.kind === "action" && data.ok === true) {
    return "  ok";
  }
  if (event.kind === "action" && data.ok === false) {
    return "  failed";
  }
  return "";
}

/** Long enough to read a sentence, short enough not to wrap a column. */
function clip(text: string, max = 60): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

/**
 * Render a whole log through one projection.
 *
 * Takes the projection rather than a mode, so a caller that wants both has to
 * say so by calling twice. A function with a mode parameter invites a caller to
 * pass the wrong one to a pipe.
 */
export function render(events: Event[], projection: Projection): string {
  return events.map((e) => projection.line(e)).join("\n");
}

/** Every kind the log can carry, for a consumer that switches on it. */
export const EVENT_KINDS: EventKind[] = [
  "goal",
  "capability",
  "directive",
  "observation",
  "action",
  "evidence",
  "model",
  "note",
];
