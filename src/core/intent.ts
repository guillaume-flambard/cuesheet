/**
 * Core: route an intention to the surface that serves it.
 *
 * The chat is one input surface. A line typed into it is not a command, it is
 * an intention, and this file decides which tooling serves it. The fallback is
 * the point: anything that is not a question the state can answer is treated
 * as a goal, because the chat is a work surface and the user is there to work,
 * not to browse a command palette.
 *
 * Deliberately deterministic. An LLM classifier would be smoother and
 * untestable, and the same failure this whole project studies, a plausible
 * interpretation nobody can audit, would move into the router. The pattern set
 * is small, every route is pinned by a test, and a goal is the honest default.
 *
 * Owner override: a line starting with `!` keeps its intent but is marked
 * forced, which the chat reads as "the owner said so". The gate stays on by
 * default and the override is explicit, which is the difference between human
 * authority and a silent bypass.
 */

export type IntentKind =
  | "empty"
  | "exit"
  | "help"
  | "ownership"
  | "capabilities"
  | "sessions"
  | "inspect"
  | "resume"
  | "admission"
  | "conversational"
  | "goal";

export interface Intent {
  kind: IntentKind;
  /** The intention as text. A goal IS text; a query has already been routed. */
  text: string;
  /** The session id, for inspect and resume. */
  id?: string;
  /** True when the line began with `!`: the owner explicitly overrode. */
  forced: boolean;
}

/** Extracted from a line like `inspect ses_abc`, the session to act on. */
const ID = "[A-Za-z0-9._-]+";

export function routeIntention(raw: string): Intent {
  const text = raw.trim();
  if (!text) {
    return { kind: "empty", text, forced: false };
  }

  const forced = text.startsWith("!");
  const line = (forced ? text.slice(1) : text).trim();
  if (!line) {
    return { kind: "empty", text, forced };
  }

  const lower = line.toLowerCase();

  if (/^(exit|quit|q|sortie|quitte)$/.test(lower)) {
    return { kind: "exit", text: line, forced };
  }
  if (/^(help|aide|\?)$/.test(lower)) {
    return { kind: "help", text: line, forced };
  }
  // Social lines get a social answer, not a work order. "hello ?" once ran a
  // full agent budget trying to respond with tools, which is the most
  // expensive greeting this project has ever paid for. The set is exact words
  // with trailing punctuation stripped, so "fix the test" never lands here.
  const social = lower.replace(/[!?.\s]+$/, "");
  if (
    /^(hello|hi|hey|yo|bonjour|salut|coucou|allo|ça va|ca va|merci|merci beaucoup|ok|d'accord|daccord|test|plop)$/.test(
      social,
    )
  ) {
    return { kind: "conversational", text: line, forced };
  }
  if (/^(capabilities?|skills?|capacités?)$/.test(lower)) {
    return { kind: "capabilities", text: line, forced };
  }
  if (/^(sessions?|historique)$/.test(lower)) {
    return { kind: "sessions", text: line, forced };
  }

  const inspect = new RegExp(`^(?:inspect|inspecte)\\s+(${ID})$`, "i").exec(lower);
  if (inspect) {
    return { kind: "inspect", text: line, id: inspect[1], forced };
  }

  const resume = new RegExp(`^(?:resume|reprend)s?\\s+(${ID})$`, "i").exec(lower);
  if (resume) {
    return { kind: "resume", text: line, id: resume[1], forced };
  }

  // Ownership questions: the state answers who may write where. Bounded to
  // question shapes, so a goal about "the projects directory" still falls
  // through to goal.
  if (
    /^(projects?|projets?|ownership|dispo(?:nible)?s?|held|qui peut écrire|who can write\b.*)$/.test(
      lower,
    )
  ) {
    return { kind: "ownership", text: line, forced };
  }

  // Check a brief without running it. Useful to test a delegation before
  // spending anything on it. The colon form ("gate: ...") is accepted because
  // it is how a brief is naturally prefixed when pasting one in.
  const admission = /^(?:gate|admission|vérifie)(?:\s*:|\s+)\s*(.+)$/is.exec(line);
  if (admission) {
    return { kind: "admission", text: admission[1], forced };
  }

  // The default, and the reason the chat exists: everything else is work.
  return { kind: "goal", text: line, forced };
}
