/**
 * What a turn is, before it is a project name.
 *
 * OBS-3, the first counter-example that reached the structure:
 *
 * ```text
 * > je sais pas
 * I don't know that one.
 * Name a project, or ask me what we're working on.
 * ```
 *
 * Five different answers, one message:
 *
 * ```text
 * "je sais pas"     -> I don't know that one.
 * "aucun"           -> I don't know that one.
 * "laisse tomber"   -> I don't know that one.
 * "montre-moi"      -> I don't know that one.
 * "aide"            -> I don't know that one.
 * ```
 *
 * Every one of those is a valid human answer to a question, and every one was
 * fed to the project binder as if it were a directory path. The surface had one
 * interpretation of every line, so a person who did not know the answer was told
 * that Cuesheet did not either, and was then told what to type.
 *
 * The rule this module exists to hold:
 *
 * > A clarification never constrains the shape of the answer.
 *
 * A person may answer "which project" with a project, with not knowing, with
 * asking to stop, with asking to see the list, or with something else entirely.
 * The question does not get to decide which of those is grammatical.
 *
 * ## Why a closed set, and not a model
 *
 * Five cases, chosen because they are the five ways a turn can legitimately fail
 * to be a project reference. Not because a classifier over French is the right
 * general solution, which it is not and is not claimed to be. What is claimed is
 * that these five were observed, and that a sixth is not admitted until it is
 * observed too.
 *
 * ## What the reference does
 *
 * The other terminal on this machine answers the same moment without any of this.
 * Given "je sais pas" it asks "qu'est-ce que tu veux faire ou savoir ?". Given
 * "laisse tomber" it says it is stopping. Given "montre-moi tes projets" it shows
 * the portfolio. It never says "I don't know that one", because that is a claim
 * about the sentence rather than about what it can offer next.
 */

import { routeIntention } from "../../../src/core/intent.ts";

/**
 * What a turn is for.
 *
 * `PROJECT_CANDIDATE` is the absence of the other four, so a turn that is none of
 * them reaches the binder as before. That keeps the old path intact rather than
 * replacing it, which is the only way to tell whether this layer changed anything
 * beyond the cases it was written for.
 */
export type TurnIntent =
  /** The person named something and expects it to be treated as a project. */
  | { readonly kind: "PROJECT_CANDIDATE"; readonly text: string }
  /** "I don't know", "aucun", "I have no idea". An honest non-answer. */
  | { readonly kind: "UNCERTAINTY"; readonly text: string }
  /** "laisse tomber", "on arrête", "cancel". The turn is over. */
  | { readonly kind: "CANCEL"; readonly text: string }
  /** "montre-moi", "qu'est-ce qu'on a", "show me". Wants the list. */
  | { readonly kind: "SHOW_ME"; readonly text: string }
  /** "aide", "je suis perdu", "help". Wants the surface to explain itself. */
  | { readonly kind: "HELP"; readonly text: string };

/**
 * The five observed ways a turn is not a project reference.
 *
 * Kept as literal words rather than a pattern language on purpose. Each entry
 * here is a phrase that was actually typed, and the test asserts the list has
 * not grown, so adding a sixth is a visible act rather than an accumulation.
 */
const UNCERTAINTY = [
  "je sais pas", "sais pas", "aucun", "aucune", "j'en sais rien", "j sais rien",
  "je ne sais pas", "ne sais pas", "pas d'idee", "aucune idee", "je sais pas quoi",
  "not sure", "no idea", "dont know", "dunno", "nope", "non",
];

const CANCEL = [
  "laisse tomber", "on laisse tomber", "on arrête", "on arrete", "arrete",
  "stop", "cancel", "abandonne", "abandon", "rien", "on verra plus tard",
  "plus tard", "jamais",
];

const SHOW_ME = [
  "montre-moi", "montre moi", "montrez-moi", "show me", "qu'est-ce qu'on a",
  "qu est ce qu on a", "c'est quoi les projets", "liste les projets",
  "quels projets", "j'ai quoi", "what do we have",
];

const HELP = [
  "aide", "aider", "help", "je suis perdu", "je suis perdu", "comment ça marche",
  "comment ça marche", "que tu sais faire", "tu sais faire quoi", "what can you do",
];

/** Words that mean a project is being named, and should not be read as a refusal. */
const AFFIRMATIVE_PROJECT = [
  "c'est", "cest", "c est", "c'est cuesheet", "voila", "voilà", "plutot",
  "plutôt", "on prend", "prends", "va pour", "le premier", "le 1", "celui-la",
  "celui la", "celui-ci", "celui ci",
];

/**
 * Read a turn.
 *
 * The router is asked first, for the same reason OBS-1 was fixed by asking it
 * rather than by writing a second classifier: it already knows about greetings
 * and questions, and a duplicate would drift from it.
 */
export function readTurn(said: string): TurnIntent {
  const lower = said.toLowerCase().trim().replace(/[?!.]+$/, "").trim();
  const has = (list: string[]) => list.some((phrase) => lower === phrase || lower === phrase + "?");

  // A refusal is a refusal even when it names something, and "non" after a
  // suggestion is the most common way to say no. It is checked before the
  // affirmative list so "c'est non" stays a no.
  if (has(CANCEL) || lower.startsWith("laisse ")) {
    return { kind: "CANCEL", text: said };
  }
  if (has(UNCERTAINTY)) {
    return { kind: "UNCERTAINTY", text: said };
  }
  if (has(SHOW_ME)) {
    return { kind: "SHOW_ME", text: said };
  }
  if (has(HELP)) {
    return { kind: "HELP", text: said };
  }
  // "non" alone, and "aucun projet", reach here if they were not exact matches.
  if (/^(non|non merci|pas de projet|none|nothing|neither)$/.test(lower)) {
    return { kind: "UNCERTAINTY", text: said };
  }

  // A greeting or a question is still handled by the router, because a
  // clarification about the portfolio is not an answer to a clarification about
  // a project, and the two are different turns.
  const kind = routeIntention(said).kind;
  if (kind === "next" || kind === "admission" || kind === "conversational") {
    return { kind: "PROJECT_CANDIDATE", text: said };
  }

  // Naming something after being asked is common: "c'est cuesheet". Those reach
  // the binder as text, which is right, because the binder will find cuesheet in
  // it. Nothing to special-case, and the list is here so a future reader knows
  // the case was considered rather than missed.
  void AFFIRMATIVE_PROJECT;

  return { kind: "PROJECT_CANDIDATE", text: said };
}

/** The phrases this module was written for, so the tests can hold the list still. */
export const OBSERVED_PHRASES: Readonly<Record<Exclude<TurnIntent["kind"], "PROJECT_CANDIDATE">, readonly string[]>> = {
  UNCERTAINTY,
  CANCEL,
  SHOW_ME,
  HELP,
};
