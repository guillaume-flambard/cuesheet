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
 * happens once, in `derive`, and a component cannot reach the other side.
 */

import type { TurnIntent } from "../turn.ts";

/** How certain the surface is about something, in the four words it is allowed. */
export type Certainty = "confirmed" | "active" | "unknown" | "failed";

/** One line in the conversation. */
export type Entry =
  | { readonly kind: "you"; readonly text: string }
  | { readonly kind: "cuesheet"; readonly text: string }
  /** A thing the producer did. Small, quiet, and never a paragraph. */
  | { readonly kind: "action"; readonly label: string; readonly detail?: string; readonly certainty: Certainty }
  /** The epistemic block: the one thing this surface can show that a log cannot. */
  | { readonly kind: "status"; readonly label: string; readonly value: string; readonly certainty: Certainty }
  /** Something went wrong, said plainly. */
  | { readonly kind: "failure"; readonly text: string };

/** The whole visible state. One object, passed down, never mutated in a component. */
export interface SurfaceState {
  readonly project: string | null;
  readonly entries: readonly Entry[];
  readonly composer: string;
  /** Which overlay is open, if any. Overlays are a state, not a component. */
  readonly overlay: "none" | "palette" | "projects" | "inspect" | "help";
  readonly statusRight: string;
  readonly busy: boolean;
}

/** What a component may ask for. Nothing else crosses the boundary. */
export type Control =
  | { readonly type: "submit"; readonly turn: TurnIntent }
  | { readonly type: "compose"; readonly text: string }
  | { readonly type: "open"; readonly overlay: SurfaceState["overlay"] }
  | { readonly type: "choose-project"; readonly path: string }
  | { readonly type: "close" }
  | { readonly type: "quit" };

/** The empty state. A surface that has to be built before it can be shown is not shown. */
export const emptySurface: SurfaceState = {
  project: null,
  entries: [],
  composer: "",
  overlay: "none",
  statusRight: "",
  busy: false,
};

/**
 * The surface, as a reducer over controls.
 *
 * Pure. No filesystem, no clock, no network. That is what makes every word in
 * this file assertable, which is the property the first surface lacked and the
 * reason its output could only be read by spawning a terminal.
 */
export function derive(state: SurfaceState, control: Control): SurfaceState {
  switch (control.type) {
    case "compose":
      return { ...state, composer: control.text };

    case "close":
      return { ...state, overlay: "none" };

    case "open":
      return { ...state, overlay: control.overlay };

    case "quit":
      return state;

    case "choose-project":
      return {
        ...state,
        project: control.path,
        overlay: "none",
        entries: [...state.entries, { kind: "cuesheet", text: `On travaille dans ${control.path}. Qu'est-ce qu'on y fait ?` }],
      };

    case "submit": {
      const said = control.turn.text.trim();
      if (!said) return state;
      const withYou: SurfaceState = {
        ...state,
        composer: "",
        busy: true,
        entries: [...state.entries, { kind: "you", text: said }],
      };
      // The answer to a turn, decided here and nowhere else. The five observed
      // kinds, and no others, because no others have been observed.
      switch (control.turn.kind) {
        case "CANCEL":
          return {
            ...withYou,
            busy: false,
            entries: [...withYou.entries, { kind: "cuesheet", text: "D'accord, on laisse." }],
          };
        case "HELP":
          return {
            ...withYou,
            busy: false,
            entries: [...withYou.entries, { kind: "cuesheet", text: "Donne-moi un projet et une tache. Tu peux aussi demander la liste." }],
          };
        case "SHOW_ME":
          return { ...withYou, busy: false, overlay: "projects" };
        case "UNCERTAINTY":
          return { ...withYou, busy: false, overlay: "projects" };
        case "PROJECT_CANDIDATE":
          // The surface has no model yet, so it cannot promise work it has not
          // started. Saying "working" and staying there is a lie with a spinner,
          // which is worse than saying nothing: a person waits for a thing that
          // will never arrive.
          //
          // So a project name is accepted and acknowledged, and `busy` is only
          // ever set by a control that actually has work behind it. The producer
          // will set it once it exists, and until then the surface says what it
          // can: the project is chosen.
          return {
            ...withYou,
            busy: false,
            project: withYou.project ?? said,
            entries: [
              ...withYou.entries,
              { kind: "cuesheet", text: `On travaille dans ${withYou.project ?? said}. Qu'est-ce qu'on y fait ?` },
            ],
          };
      }
    }
  }
}