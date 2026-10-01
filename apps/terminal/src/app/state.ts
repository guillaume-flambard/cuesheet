/**
 * What the surface shows, and what it can ask for.
 *
 * The rule the whole app is built on:
 *
 * > No TUI component decides anything.
 *
 * Components receive this state and emit a control. They do not read the
 * filesystem, they do not know what a project is, and they do not resolve a
 * binding. If a component needed to know any of that, it would be a place where
 * presentation and decision are mixed, which is the defect this whole project has
 * spent sixteen milestones refusing and which OBS-1, OBS-2 and OBS-3 each found
 * again in a smaller way.
 *
 * So the vocabulary here is deliberately not the core's vocabulary. The core says
 * `pendingEffect`, `revision`, `ArtifactStanding` and `CONFIRMED_COMPLETE`. This
 * says "five projects ready", "verifying", "completion unknown". The translation
 * happens once, in `producer/translate.ts`, and a component cannot reach the other
 * side.
 *
 * ## What V2 changed in this file
 *
 * The old `submit` control carried a `TurnIntent`, a five-case union decided by
 * exact string matching against hardcoded French phrase lists, and this file
 * answered it. The union is gone. `submit` carries the sentence, and only the
 * sentence:
 *
 * ```text
 * before  submit(turn: TurnIntent)  -> one of five canned replies
 * after   submit(text: string)      -> the sentence is recorded, and the producer runs
 * ```
 *
 * Two consequences, both of them the point. There is no longer a phrase that can
 * produce "name a project" or "not a goal", because there is no longer a place
 * where a phrase is classified. And `busy` is finally true when it is set: it is
 * set by the producer, at the moment it starts the real loop, which is the
 * admission this file made at line 125 in V1 and could not keep.
 *
 * VIEW-01 holds here and is asserted: this file observes nothing, imports
 * nothing, and `derive` is a pure function of its two arguments.
 */

/** How certain the surface is about something, in the four words it is allowed. */
export type Certainty = "confirmed" | "active" | "unknown" | "failed";

/** One line in the timeline. Five kinds, and the three that were dead are live. */
export type Entry =
  | { readonly kind: "you"; readonly text: string }
  | { readonly kind: "cuesheet"; readonly text: string }
  /** A thing the producer did. Small, quiet, and never a paragraph. */
  | { readonly kind: "action"; readonly label: string; readonly detail?: string; readonly certainty: Certainty }
  /** The epistemic block: the one thing this surface can show that a log cannot. */
  | { readonly kind: "status"; readonly label: string; readonly value: string; readonly certainty: Certainty }
  /** Something went wrong, said plainly. */
  | { readonly kind: "failure"; readonly text: string };

/** One project the surface can offer, and the reason it is on offer. */
export interface Option {
  readonly name: string;
  readonly path: string;
  /** Why this one is a candidate. Carried so a choice is checkable. */
  readonly why: string;
}

/**
 * Settle the row at this index, rather than appending a second one.
 *
 * The producer opens an action row at `active` and then learns the exit code.
 * Appending the settled row instead of replacing the open one would show every
 * call twice, once forever claiming to be in progress, which is both ugly and a
 * lie: a person scanning the timeline would count work that had already finished
 * as still running.
 *
 * An index rather than an id because entries are immutable and the producer owns
 * the only thing that appends them, so it already knows where it wrote.
 */

/** The whole visible state. One object, passed down, never mutated in a component. */
export interface SurfaceState {
  readonly project: string | null;
  readonly entries: readonly Entry[];
  readonly composer: string;
  /** Which overlay is open, if any. Overlays are a state, not a component. */
  readonly overlay: "none" | "palette" | "projects" | "inspect" | "help" | "models" | "sessions";
  /**
   * The choices an ambiguous sentence produced.
   *
   * Empty is the normal case. Non-empty means the producer found more than one
   * project defending itself and refused to guess, which BIND-05 requires and
   * which is a question to a person rather than a guess about one.
   */
  readonly choices: readonly Option[];
  /** The raw log, only ever read by the inspect overlay. */
  readonly log: readonly string[];
  readonly statusRight: string;
  readonly busy: boolean;
}

/** What a component may ask for. Nothing else crosses the boundary. */
export type Control =
  /** A sentence, verbatim. There is no classifier between this and the producer. */
  | { readonly type: "submit"; readonly text: string }
  | { readonly type: "compose"; readonly text: string }
  | { readonly type: "open"; readonly overlay: SurfaceState["overlay"] }
  | { readonly type: "close" }
  /** A choice was made from the options the producer offered. */
  | { readonly type: "choose"; readonly option: Option }
  | { readonly type: "quit" }
  /** Producer-only. The run started, with real work behind it. */
  | { readonly type: "began" }
  /** Producer-only. The run ended. */
  | { readonly type: "ended" }
  | { readonly type: "interrupted" }
  /** Producer-only. Lines translated from the core's vocabulary. */
  | { readonly type: "observed"; readonly entries: readonly Entry[] }
  /**
   * Producer-only. Settle the action row at `at`, which was opened `active`.
   *
   * Replacing rather than appending, because a row that said "reading" and was
   * never updated would leave work that finished still claiming to be in progress
   * for the rest of the session.
   */
  | { readonly type: "settled"; readonly at: number; readonly entry: Entry }
  /** Producer-only. A line for the raw log, read only by inspect. */
  | { readonly type: "logged"; readonly line: string }
  /** Producer-only. The scope was resolved, one way or another. */
  | { readonly type: "scoped"; readonly project: string; readonly where: string }
  /** Producer-only. More than one project defended itself. */
  | { readonly type: "offered"; readonly choices: readonly Option[] };

/** The empty state. A surface that has to be built before it can be shown is not shown. */
export const emptySurface: SurfaceState = {
  project: null,
  entries: [],
  composer: "",
  overlay: "none",
  choices: [],
  log: [],
  statusRight: "",
  busy: false,
};

/** Cap the timeline. A day of work is a long log and a terminal is not a scrollback. */
const MAX_ENTRIES = 400;
const MAX_LOG = 200;

const append = (entries: readonly Entry[], added: readonly Entry[]): readonly Entry[] =>
  [...entries, ...added].slice(-MAX_ENTRIES);

/**
 * The surface, as a reducer over controls.
 *
 * Pure. No filesystem, no clock, no network. That is what makes every word in
 * this file assertable, which is the property the first surface lacked and the
 * reason its output could only be read by spawning a terminal.
 *
 * Every word a person reads is decided either here or in `producer/translate.ts`,
 * and nowhere else. The producer decides what happened; this decides what that
 * looks like.
 */
export function derive(state: SurfaceState, control: Control): SurfaceState {
  switch (control.type) {
    case "compose":
      return { ...state, composer: control.text };

    case "close":
      // Closing an overlay returns the choices with it: an offer that is no
      // longer on screen is not an offer, and leaving it behind would let a
      // later sentence be answered against a question the person already
      // dismissed.
      return { ...state, overlay: "none", choices: [] };

    case "open":
      return { ...state, overlay: control.overlay };

    case "quit":
      return state;

    case "submit": {
      const said = control.text.trim();
      if (!said) return state;
      // The whole of `submit`. The sentence is recorded verbatim and the
      // producer is told. It does not decide what the sentence meant, and there
      // is no branch here that could answer it.
      //
      // `busy` is left alone on purpose. The person typed; that is not work.
      // `began` sets busy, and only the producer sends it, at the moment the
      // real loop starts.
      return {
        ...state,
        composer: "",
        choices: [],
        overlay: "none",
        entries: append(state.entries, [{ kind: "you", text: said }]),
      };
    }

    case "began":
      return { ...state, busy: true, overlay: "none" };

    case "ended":
      return { ...state, busy: false };

    case "interrupted":
      return { ...state, busy: false, entries: state.entries.map(entry =>
        (entry.kind === "action" || entry.kind === "status") && entry.certainty === "active"
          ? { ...entry, certainty: "unknown" as const } : entry) };

    case "observed": {
      if (control.entries.length === 0) return state;
      return { ...state, entries: append(state.entries, control.entries) };
    }

    case "settled": {
      // Out of range means the timeline was trimmed past this row between the
      // call starting and returning. That is not an error: the row is gone, the
      // work happened, and the log still holds it.
      const existing = state.entries[control.at];
      if (!existing || existing.kind !== "action") return state;
      const entries = [...state.entries];
      entries[control.at] = control.entry;
      return { ...state, entries };
    }

    case "logged":
      return { ...state, log: [...state.log, control.line].slice(-MAX_LOG) };

    case "scoped":
      // One line, once, in the surface's own words. The path is the fact a
      // person needs to check the surface picked the right directory, and it is
      // shown in full rather than shortened: a truncated path is a path that
      // looks like a different directory.
      return {
        ...state,
        project: control.project,
        entries: append(state.entries, [
          { kind: "status", label: "working in", value: control.where, certainty: "confirmed" },
        ]),
      };

    case "offered":
      // More than one candidate is a question to a person, not a guess. The
      // question rides in the timeline as entries so it is part of the
      // conversation, and the options ride alongside it for the overlay to draw.
      if (control.choices.length === 0) return state;
      return {
        ...state,
        busy: false,
        overlay: "projects",
        choices: control.choices,
        entries: append(state.entries, [
          {
            kind: "status",
            label: "which one",
            value: control.choices.map((c) => c.name).join(", "),
            certainty: "unknown",
          },
        ]),
      };

    case "choose": {
      const picked = state.choices.find((c) => c.path === control.option.path);
      if (!picked) return state;
      return {
        ...state,
        project: picked.name,
        overlay: "none",
        choices: [],
        entries: append(state.entries, [
          { kind: "status", label: "working in", value: picked.path, certainty: "confirmed" },
        ]),
      };
    }
  }
}
