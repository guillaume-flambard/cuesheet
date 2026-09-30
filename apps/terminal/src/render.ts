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
import { snapshotPortfolio } from "../../../src/adapters/frontier.ts";
import { readTurn } from "./turn.ts";
import { routeIntention } from "../../../src/core/intent.ts";

// ─── the slice's states ────────────────────────────────────────────────────

export type Slice =
  | { readonly at: "welcome" }
  | { readonly at: "resolving" }
  | { readonly at: "ambiguous"; readonly said: string; readonly binding: Extract<Binding, { kind: "unbound" }> }
  | { readonly at: "unresolved"; readonly said: string }
  | { readonly at: "question"; readonly said: string; readonly suggestions: readonly Suggestion[]; readonly held: number }
  | { readonly at: "uncertain"; readonly said: string; readonly suggestions: readonly Suggestion[] }
  | { readonly at: "cancelled"; readonly said: string }
  | { readonly at: "show-me"; readonly said: string; readonly suggestions: readonly Suggestion[]; readonly held: number }
  | { readonly at: "help"; readonly said: string }
  | { readonly at: "greeting"; readonly said: string }
  | { readonly at: "bound"; readonly said: string; readonly project: string; readonly path: string }
  | { readonly at: "refused"; readonly said: string };

/**
 * One project the surface can offer, and why it can.
 *
 * A suggestion without a reason is a guess dressed as help, so each one carries
 * the fact that made it eligible: its tree is clean, its commits are pushed, and
 * it has a remote. Those are the same three facts the admission check uses, and
 * a project that fails any of them is not offered at all.
 */
export interface Suggestion {
  readonly name: string;
  readonly path: string;
}

/**
 * The one decision this slice makes: is this sentence about a project, and
 * which one. It delegates, because BIND-01 through BIND-06 already live in
 * `project-binding.ts` and re-deciding them here would create a second opinion.
 */
export function resolve(said: string): Slice {
  // OBS-3. The turn is read before anything is bound, because five observed
  // answers to "which project" were all being handed to the project binder as if
  // they were directory paths. "je sais pas" became "I don't know that one", and
  // a person admitting they did not know was told that Cuesheet did not either,
  // and then told what to type.
  const turn = readTurn(said);
  if (turn.kind === "CANCEL") {
    return { at: "cancelled", said };
  }
  if (turn.kind === "HELP") {
    return { at: "help", said };
  }
  if (turn.kind === "SHOW_ME") {
    const snap = snapshotPortfolio();
    return {
      at: "show-me",
      said,
      held: snap.held.length,
      suggestions: snap.free.slice(0, 8).map((path) => ({ name: path.split("/").pop() ?? path, path: path.includes("/") ? path : "" })),
    };
  }
  if (turn.kind === "UNCERTAINTY") {
    // The offer is concrete rather than a re-ask. The person does not know which
    // project, so the useful thing is to make choosing cheaper, not to repeat the
    // question with the same expected answer.
    const snap = snapshotPortfolio();
    return {
      at: "uncertain",
      said,
      suggestions: snap.free.slice(0, 3).map((path) => ({ name: path.split("/").pop() ?? path, path: path.includes("/") ? path : "" })),
    };
  }

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
    // OBS-2. This used to answer "Your projects are in ~/projects. Name one",
    // which hands the question straight back. The person asked what we should
    // work on, and the honest answer is a proposal with a reason, not a
    // directory listing.
    //
    // This is the one place the surface pays for the expensive observation, and
    // it is worth it here: "what can we work on" is a question about writing, so
    // the answer has to come from the repositories' real state rather than from
    // a registry that has no idea which ones are dirty. Naming a project stays
    // cheap, because naming needs no evidence beyond the path.
    const snap = snapshotPortfolio();
    const suggestions = snap.free.slice(0, 5).map((path) => ({
      name: path.split("/").pop() ?? path,
      // A bare name is a real answer and a repeated path is noise, so the path
      // is only shown when it says something the name does not: the category.
      path: path.includes("/") ? path : "",
    }));
    return { at: "question", said, suggestions, held: snap.held.length };
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

    // OBS-3. The message this replaces was "I don't know that one. Name a
    // project.", which was a claim about the sentence rather than an offer, and
    // which turned not knowing into a mistake the person had made. Now an
    // unfamiliar line is just unfamiliar, and the way out is named.
    case "unresolved":
      return [
        `${slice.said}`,
        "",
        "Je n'ai pas de projet sous ce nom-la.",
        "Tu peux m'en dire plus, ou me demander la liste.",
        "",
      ];

    // A person who does not know which project, and is told to name one. The
    // useful reply makes choosing cheaper instead of repeating the question with
    // the same expected shape of answer.
    case "uncertain": {
      if (slice.suggestions.length === 0) {
        return [`${slice.said}`, "", "Aucun projet n'est libre pour l'instant.", "Decris-moi ce que tu veux faire, on verra apres.", ""];
      }
      return [
        `${slice.said}`,
        "",
        "Pas grave. Quelques projets ici :",
        "",
        ...slice.suggestions.map((s) => `  ${s.name}`),
        "",
        "Un de ceux-la, ou dis-moi ce que tu voulais faire.",
        "",
      ];
    }

    case "cancelled":
      return [`${slice.said}`, "", "D'accord, on laisse. Dis-moi quand tu veux repartir.", ""];

    case "show-me": {
      const held = slice.held > 0 ? `  ${slice.held} occupes.` : "";
      return [
        `${slice.said}`,
        "",
        `${slice.suggestions.length} libres a l'ecriture.`,
        ...(held ? [held] : []),
        "",
        ...slice.suggestions.map((s) => `  ${s.name}`),
        "",
      ];
    }

    case "help":
      return [
        `${slice.said}`,
        "",
        "Donne-moi un projet et une tache, je m'en occupe.",
        "Je peux aussi te montrer la liste, si tu veux.",
        "",
      ];

    // OBS-2. The answer to "what are we working on" is a proposal, not a
    // directory. The first one is offered as the default so the next word can
    // be its name, which is cheaper than another decision.
    case "question": {
      if (slice.suggestions.length === 0) {
        return [
          `${slice.said}`,
          "",
          `Every project is held: ${slice.held} of them have work in progress.`,
          "That's not a problem, it just means now isn't the moment.",
          "",
        ];
      }
      // The held count sits with the count it explains, not spliced into the
      // middle of the list, which is what an earlier version did and which put
      // it between two projects.
      const held = slice.held > 0 ? `  ${slice.held} occupes, donc absents de la liste.` : "";
      return [
        `${slice.said}`,
        "",
        `${slice.suggestions.length} libres a l'ecriture.`,
        ...(held ? [held] : []),
        "",
        ...slice.suggestions.map((s) => `  ${s.name}  ${MUTED_MARK}${s.path}`),
        "",
        `${slice.suggestions[0]!.name}?`,
        "",
      ];
    }

    case "greeting":
      return [`${slice.said}`, "", "Name a project when you're ready.", ""];

    case "bound":
      return [
        `${slice.said}`,
        "",
        `${slice.project}  ${MUTED_MARK}${slice.path}`,
        "",
        "Qu'est-ce qu'on y fait ?",
        "",
      ];

    case "refused":
      return [`${slice.said}`, "", "Ask me about a project and we can start there.", ""];
  }
}

const MUTED_MARK = "";
const count = (n: number, word: string) => (n === 1 ? `one ${word}` : `${n} ${word}s`);

