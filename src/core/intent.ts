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
  | "next"
  | "confirm"
  | "cancel"
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

/**
 * Whether a line is a decision about a staged action rather than new work.
 *
 * This is separated from `goal` on purpose. "go", "ok vas-y" and "fais-le"
 * all mean the same act, and the surface has one staged action waiting. If
 * they were goals, each one would become a new goal that replaced the previous
 * one, and the person's approval would turn into a fresh work order.
 */
export type Confirmation =
  | "confirm"
  | "cancel"
  | "none";

/** Extracted from a line like `inspect ses_abc`, the session to act on. */
const ID = "[A-Za-z0-9._-]+";

/**
 * A question about what is available to work on.
 *
 * Matched on question shape plus the topic, never on the topic alone, because
 * the topic words are the same ones a work order uses. `add a projects page`
 * is work; `what can we work on` is a question, and the difference is the
 * interrogative.
 *
 * `quoi` alone is not in here. "c'est quoi cette merde" contains it and is not
 * a question about the portfolio, so a bare topic word only counts inside a
 * phrase that is itself about working: quoi faire, quoi travailler, sur quoi.
 */
const INTERROGATIVE =
  /(?:\?|sur quoi|quoi (?:faire|travailler|on fait)|que (?:peut-on|puis-je|est-ce qu'on)|what can we|what should we|where can we|which (?:repo|project))/;

/** Words that open a line without asking for anything to be built. */
const GREETING_WORD =
  /^(?:hello|hi|hey|yo|hey there|hi there|bonjour|bonsoir|salut|coucou|allo|thanks|thank you|merci|ok|okay|test|plop)\b/;

/**
 * Lines that are social in their entirety rather than by opening.
 *
 * "ca va" and "d'accord" are greetings on their own, not prefixes, so they
 * cannot be expressed as a head word. They are exact phrases, which is safe
 * here because a phrase with a fixed shape cannot grow the way a head word
 * list does: there is only one way to write "ca va".
 */
const SOCIAL_PHRASE =
  /^(?:ça va|ca va|ça va bien|ca va bien|ça va aller|ca va aller|ok d'accord|ok d accord|d'accord|d accord|ouais|yep|yeah)$/;

/**
 * Approval of whatever is staged.
 *
 * The set is the shape "a greeting, then a verb of assent", not a list of the
 * ways a person says go, because the list is open and the shape is not. A
 * leading politeness is tolerated, so "ok go" and "vas-y" land on the same
 * act, and "go" alone is the shortest case of the same shape.
 */
const ASSENT =
  /^(?:(?:ok|ouais|allez|vas|vaz|yep|yes|yeah|sure|parfait|bon|alors|let's|lets|bah|voilà|voila)\s+)*(?:go|go !|lance|lancer|lancez|fais-le|fais le|fais|faites|execute|execute le|exécute|exécute le|run it|go for it|do it|launch|demarre|démarre|demarrer|démarrer|vas-y|vaz-y|allez-y|allez|c'est parti|c est parti|parce que c'est parti|parce que c est parti|y en a marre)$/;

/**
 * Refusal of whatever is staged. The same shape as assent, one polarity.
 */
const REFUSE =
  /^(?:non|no|nope|nah|stop|arrête|arrete|arrêter|arreter|laisse|laisse tomber|annule|annuler|Forget it|Forget|laisse tomber ça|laisse tomber ca|pas maintenant|pas maintenant)$/;

/**
 * Anything that reads as a request to make, change, check or run something.
 *
 * This is the guard, not the greeting list. Its job is one-directional: if a
 * line carries one of these, it is work no matter how it opens, which is what
 * keeps "hey, fix the failing test" out of the greeting path.
 */
const WORK_VERB =
  /\b(?:add|build|change|check|commit|create|debug|delete|deploy|extract|fix|implement|make|move|open|push|refactor|remove|rename|repair|revert|run|ship|test|update|write|écris|corrige|ajoute|crée|supprime|supprim|teste|verifie|vérifie|lance|modifie|refais|refait|nouvelle|nouveau)\b/;

/**
 * A line is social when it opens as a greeting, carries no question, and
 * carries no work verb.
 *
 * Requiring all three is what makes this safe. The greeting alone is not
 * enough, because "hey fix the test" opens the same way and is work. The
 * absence of a verb alone is not enough either, because "what can we work on"
 * has no verb and is a question. Together they separate the three cases that
 * a list of exact words could not keep separating.
 */
function isSocial(normalised: string): boolean {
  if (!normalised) {
    return false;
  }
  if (INTERROGATIVE.test(normalised)) {
    return false;
  }
  if (WORK_VERB.test(normalised)) {
    return false;
  }
  if (SOCIAL_PHRASE.test(normalised)) {
    return true;
  }
  return GREETING_WORD.test(normalised);
}

/**
 * A request for what to work on, which is not a request for what is free.
 *
 * "projects" answers with counts: 17 writable, 28 held. "on travaille sur
 * quoi" is the same person asking a different question, one that wants a
 * recommendation rather than an inventory. The two were routed to the same
 * place, and the inventory answered neither.
 */
const NEXT =
  /(?:sur quoi|que (?:faire|faut-il|est prioritaire|est-ce prioritaire)|priorit|quoi (?:faire|ensuite|maintenant)|par quoi commencer|ensuite quoi|et maintenant|maintenant quoi|(?:on|qu'on) (?:peut-?on )?(?:travailler|bosse|fait|continue)|on (?:travaille|travaille-t-on|fait|fait-on|bosse|bosse-t-on|commence|commence-t-on|continue)|what (?:can we|do|should we|next|would we)|where do we|next (?:step|up)?$|next$)/;

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

  // Approval is decided before the greeting check, because "ok go" and "ok
  // vas-y" open like a greeting and mean the opposite. The greeting guard runs
  // on the line with the assent phrase removed, so neither rule can swallow the
  // other's case.
  const lower = line.toLowerCase();
  const bare = lower
    .replace(/[!?.,;\s]+$/, "")
    .replace(/[.,;]\s+/g, " ")
    .trim();

  if (/^(exit|quit|q|sortie|quitte)$/.test(lower)) {
    return { kind: "exit", text: line, forced };
  }
  // Approval and refusal are decided before anything else, because they are
  // about the act already on the table and must never become new work. A
  // forced line is excluded: "!" is the owner overriding a refusal, so
  // "!go" means run the staged goal, not confirm a suggestion.
  if (!forced && (ASSENT.test(bare) || REFUSE.test(bare))) {
    return {
      kind: REFUSE.test(bare) ? "cancel" : "confirm",
      text: line,
      forced,
    };
  }
  if (/^(help|aide|\?)$/.test(lower)) {
    return { kind: "help", text: line, forced };
  }
  // Social lines get a social answer, not a work order. "hello ?" once ran a
  // full agent budget trying to respond with tools, which is the most
  // expensive greeting this project has ever paid for.
  //
  // Two attempts failed before this one and both are worth not repeating. The
  // first was a list of exact words, so "hey there", "ok go" and "thanks" fell
  // through to goal. The second was a shape, a greeting plus up to two address
  // words, which fixed those and then "bonjour la", then "salut toi", then
  // "bonjour tout le monde", then "hey how are you". Widening a list is the
  // wrong instrument for an open set, and I did it twice before noticing.
  //
  // The test is therefore not the greeting, it is the absence of work. A line
  // that opens with a greeting and carries no imperative verb anywhere is
  // social. "fix the test" has a verb, "hey fix the test" has one, and both
  // stay goals, which is the property that actually matters: the router must
  // never hand a work order to the greeting path.
  //
  // The assent phrase is stripped first. "ok go" and "ok vas-y" open with a
  // greeting word, and without this they were answered with a greeting, which
  // is how a person's approval turned into a dead keystroke.
  // Only a politeness word that has something behind it is stripped. "merci"
  // and "salut" are greetings in their own right, so stripping them there would
  // turn a greeting into an empty line.
  const social = bare.replace(
    /^(?:(?:ok|ouais|allez|vas|vaz|yep|yes|yeah|sure|parfait|bon|alors|let's|lets|bah|voilà|voila)\s+)(?=\S)/,
    "",
  );
  if (isSocial(social)) {
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

  // A question, not a keyword. "on peut travailler sur quoi" and "what can we
  // work on today" are the first thing anyone asks when they open a work
  // surface, and neither is a noun the pattern above can match. The shape is
  // interrogative, so a work order that merely contains one of these words,
  // "add a projects page", still falls through to goal.
  //
  // `next` is checked first because "on travaille sur quoi ?" is both a
  // question and a request for a recommendation, and the recommendation is the
  // more useful answer. An inventory would say "17 free" and end there.
  //
  // The work-verb guard applies unless the line ends in the marker, because a
  // line that ends in "next" is a question whatever verb it carries:
  // "what should we build next" is not an order to build. "on commence le
  // refactor" has no marker and stays work.
  const endsWithMarker = /\bnext$/.test(bare);
  if (
    NEXT.test(bare) &&
    (endsWithMarker || !WORK_VERB.test(bare.replace(/^(?:on|qu'on|what|where|which)\s+/, "")))
  ) {
    return { kind: "next", text: line, forced };
  }
  if (INTERROGATIVE.test(lower)) {
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
