/**
 * What a person sees, as a pure function.
 *
 * Split out of the terminal component on purpose. Ink components cannot be
 * imported by `node --test`, because the extension is `.tsx` and the type
 * stripper does not handle JSX. So the words live here, with no React and no
 * terminal, and every claim about what the surface says is assertable by
 * running it. The component in `slice.tsx` only decides when to call this.
 *
 * The banned vocabulary below is the whole point of the exercise. The previous
 * surface printed `goal`, `project unresolved`, `248 capabilities` and
 * `sessions on disk` in ordinary conversation, which is the same failure mode
 * as the one the core spent sixteen milestones refusing: reporting machinery in
 * place of facts. A person does not need to see the machine to be protected by
 * it.
 */

import { bindProject, type Binding } from "../../../src/adapters/project-binding.ts";
import { routeIntention } from "../../../src/core/intent.ts";

// ─── the slice's states ────────────────────────────────────────────────────

export type Slice =
  | { readonly at: "welcome" }
  | { readonly at: "resolving" }
  | { readonly at: "ambiguous"; readonly said: string; readonly binding: Extract<Binding, { kind: "unbound" }> }
  | { readonly at: "unresolved"; readonly said: string }
  | { readonly at: "question"; readonly said: string; readonly about: "portfolio" }
  | { readonly at: "greeting"; readonly said: string }
  | { readonly at: "bound"; readonly said: string; readonly project: string; readonly path: string }
  | { readonly at: "refused"; readonly said: string };

/**
 * The one decision this slice makes: is this sentence about a project, and
 * which one. It delegates, because BIND-01 through BIND-06 already live in
 * `project-binding.ts` and re-deciding them here would create a second opinion.
 */
export function resolve(said: string): Slice {
  // The question comes first, because OBS-1 was this line asked in the wrong
  // order. "on fait quoi ?" is not a failed project lookup; it is a question
  // about the portfolio, and the router in `core/intent.ts` has known that since
  // it was written. The slice was calling the binder first and asking nobody,
  // so a question received "I can't tell which one you mean", which is a
  // helpful way of saying something false.
  //
  // The router is not duplicated here. It is the same function the diagnostic
  // chat uses, so a greeting or a question is recognised the same way in both
  // places, and a second classifier would drift from the first.
  const kind = routeIntention(said).kind;
  if (kind === "next" || kind === "admission") {
    return { at: "question", said, about: "portfolio" };
  }
  if (kind === "conversational") {
    return { at: "greeting", said };
  }

  const binding = bindProject(said);
  if (binding.kind === "bound") {
    return { at: "bound", said, project: binding.candidate.name, path: binding.candidate.path };
  }
  if (binding.kind === "unbound" && binding.candidates.length > 1) {
    return { at: "ambiguous", said, binding };
  }
  return { at: "unresolved", said };
}

// ─── the render ────────────────────────────────────────────────────────────

const ACCENT = "cyan";
const MUTED = "gray";

/**
 * What a person sees. A pure function of the slice, so every line below is
 * assertable without spawning a terminal, which is the property the last
 * version did not have.
 */
export function render(slice: Slice, typed: string): string[] {
  switch (slice.at) {
    case "welcome":
      return ["", "cuesheet", "", "What are we working on?", ""];

    case "resolving":
      return [`${typed}`, "", "Looking through your projects…", ""];

    case "ambiguous":
      return [
        `${slice.said}`,
        "",
        `I can see ${count(slice.binding.candidates.length, "project")} that could be it:`,
        "",
        ...slice.binding.candidates.map((c) => `  ${c.name}  ${MUTED_MARK}${c.path}`),
        "",
        "Which one?",
        "",
      ];

    case "unresolved":
      return [
        `${slice.said}`,
        "",
        "I don't know that one.",
        "Name a project, or ask me what we're working on.",
        "",
      ];

    // OBS-1. This state exists because the surface used to answer "on fait
    // quoi ?" with "I can't tell which one you mean", which is a false claim
    // about what the person said. A question is answered as a question.
    case "question":
      return [
        `${slice.said}`,
        "",
        "Your projects are in ~/projects.",
        "Name one and we'll work there.",
        "",
      ];

    case "greeting":
      return [`${slice.said}`, "", "Name a project when you're ready.", ""];

    case "bound":
      return [
        `${slice.said}`,
        "",
        `${slice.project}  ${MUTED_MARK}${slice.path}`,
        "",
        "What do you want to look at?",
        "",
      ];

    case "refused":
      return [`${slice.said}`, "", "Ask me about a project and we can start there.", ""];
  }
}

const MUTED_MARK = "";
const count = (n: number, word: string) => (n === 1 ? `one ${word}` : `${n} ${word}s`);

