/**
 * Project Binding: a stated intention stays an intention when its project is unknown.
 *
 * This module exists because of a lie the surface told, and the lie was of the
 * kind the rest of this repository exists to prevent.
 *
 * ```text
 * cwd = /Users/memo
 * > see my friend's video repo
 * not a goal: see my friend's video repo
 * ```
 *
 * "see my friend's video repo" is an intention. It was reported as a non-goal
 * because the information needed to *run* it was missing. The surface collapsed
 * two different facts into one negation:
 *
 * ```text
 * goal = absent          false, the person stated one
 * project = unknown       true, and not the same fact
 * ```
 *
 * `unknown != absent` already governs pending effects and capture scope. It had
 * never been applied to the scope of an intention, which is why this one slipped
 * through: a missing project is precisely the situation where a false absence
 * is cheapest to emit and most damaging.
 *
 * The rules, stated once so they can be checked:
 *
 * ```text
 * BIND-01  an actionable intention stays an intention when its project is unknown
 * BIND-02  the absence of a current project can never turn a goal into a non-goal
 * BIND-03  an unresolved goal is durable, staged in the log, not held in a surface variable
 * BIND-04  APPROVE_GOAL is absent until the project is resolved
 * BIND-05  resolution never invents a match when more than one defends itself
 * BIND-06  once resolved, the same goal continues; it is not recreated
 * ```
 *
 * BIND-04 is the important safety half. Binding a project is what makes a goal
 * runnable, so an unbound goal must not be approvable, and the affordance has to
 * be genuinely absent rather than present-and-refused, so a surface cannot
 * render it and an agent cannot select it. The home directory stays a control
 * plane: the portfolio is reachable from here, which is how an intention gets
 * bound to a project and becomes work.
 *
 * Nothing in here writes. Binding produces a proposal, and the caller decides.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PROJECTS_ROOT, parseRegistry, type RegistryEntry } from "./frontier.ts";

/**
 * What is needed to name a project. No git, no branch, no working tree.
 *
 * This type is the whole point of the module. Binding asks "which project is
 * this", and the registry already answers that. Whether the project is clean,
 * pushed and writable is a different question, asked at the moment a decision
 * needs it, by a different function, reading the machine freshly.
 *
 * The earlier version took a git-probed portfolio, which forced the caller to
 * read every repository's working state before it could name one. That is why
 * typing a project name took 1.9 seconds: identity was being purchased with
 * evidence that identity did not need.
 */
export interface ProjectIdentity {
  readonly name: string;
  readonly path: string;
  /** Free text the registry declares about the project. Identity, not state. */
  readonly kind: string;
  readonly status: string;
  readonly nature: string;
  readonly stack: string;
  /** Whether the path is on disk. A filesystem read, not a git observation. */
  readonly exists: boolean;
}

/**
 * The identities in the portfolio, read from the registry alone.
 *
 * One file, no subprocesses. `exists` is a `stat`, which is why this returns in
 * single-digit milliseconds on a portfolio of any size.
 */
export function projectIdentities(options: { projectsRoot?: string } = {}): ProjectIdentity[] {
  const root = options.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  return parseRegistry(root)
    .filter((entry: RegistryEntry) => entry.kind === "repo")
    .map((entry: RegistryEntry) => ({
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
      status: entry.status,
      nature: entry.nature,
      stack: entry.stack,
      exists: existsSync(join(root, entry.path)),
    }));
}

/** How a candidate was found. A matched project is a fact about the machine. */
export type MatchBasis = "exact-name" | "name-token" | "description-token" | "none";

/** One project that could be the scope of the intention. */
export interface BindingCandidate {
  /** Absolute path, so nothing downstream has to guess it. */
  readonly path: string;
  /** Registry name, which is what a person reads. */
  readonly name: string;
  /** Why this one matched, in words a person can check. */
  readonly basis: MatchBasis;
  /** The tokens that matched. Empty for an exact name. */
  readonly tokens: string[];
  /** Whether the project exists on disk right now, not only in the registry. */
  readonly exists: boolean;
}

/**
 * The outcome of trying to bind an intention to a project.
 *
 * Three shapes, and the middle one is the case this module was written for:
 * `unbound` is not a failure of the intention, it is a missing input.
 */
export type Binding =
  /** Exactly one candidate, and nothing else defends itself. */
  | { readonly kind: "bound"; readonly candidate: BindingCandidate }
  /** The intention stands; the scope does not. */
  | { readonly kind: "unbound"; readonly candidates: readonly BindingCandidate[] }
  /** No project defends itself. Distinct from a refusal. */
  | { readonly kind: "no_match"; readonly candidates: readonly BindingCandidate[] };

/** Words that carry no project identity, excluded from matching. */
const STOP = new Set([
  "a", "an", "and", "the", "my", "friend", "friends", "s", "see", "look", "at",
  "for", "on", "in", "of", "to", "go", "work", "repo", "repository", "project",
  "projects", "thing", "stuff", "can", "you", "i", "we", "me", "it", "that",
  "this", "with", "about", "is", "are", "do", "does", "how", "what", "why",
]);

/** Split an intention into identity-bearing tokens, lowercased. */
export function tokensOf(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1 && !STOP.has(t)),
    ),
  ].sort();
}

/** A candidate from the portfolio, carrying its own reasons. */
function candidateFor(project: ProjectIdentity, tokens: readonly string[]): BindingCandidate {
  const name = project.name.toLowerCase();
  const words = `${name} ${project.path.toLowerCase()} ${project.stack.toLowerCase()} ${project.nature.toLowerCase()}`;
  const tokensOfProject = new Set(name.split(/[^a-z0-9]+/));

  if (name === tokens.join("-") || name === tokens.join("")) {
    return { path: project.path, name: project.name, basis: "exact-name", tokens: [], exists: project.exists };
  }

  const nameHits = tokens.filter((t) => tokensOfProject.has(t));
  // A single generic token is not an identity. "see my friend's video repo"
  // matches `videoai` on the substring "video", and binding an unattended
  // writer to experiments/videoai because a line contained the word "video" is
  // the same class of mistake as binding it to nothing, aimed at a real
  // directory instead of at no directory. BIND-05 is about not inventing a
  // match, and a match invented from one weak token is invented.
  //
  // The rule: a name-token match must either be the whole name, or cover at
  // least half the project's own tokens, or pair a project token with an
  // intention token that the project name does not already imply.
  if (nameHits.length > 0) {
    const projectTokens = [...tokensOfProject];
    const wholeName = projectTokens.every((t) => tokens.includes(t));
    const coversProject = nameHits.length >= Math.ceil(projectTokens.length / 2);
    const strong = tokens.some(
      (t) => t.length >= 4 && !tokensOfProject.has(t) && name.includes(t),
    );
    if (wholeName || coversProject || strong) {
      return { path: project.path, name: project.name, basis: "name-token", tokens: nameHits, exists: project.exists };
    }
  }

  // Description matching is the loosest thing here and has to stay that tight.
  // The registry carries free text, so a substring test over it will eventually
  // match a project because the line contains the word "pilot" and some entry
  // says "pilot".
  //
  // A description hit has to be a whole word in the row, not a substring of the
  // path. `video` is a substring of `videoai` but it is not a word the registry
  // wrote, and that distinction is the whole reason "see my friend's video repo"
  // stopped resolving to experiments/videoai. A row token must also be a
  // distinctive word: a project's own name is handled above, so what is left
  // here is stack, status and nature, and those are exactly the words too generic
  // to bind a writer to on their own.
  const rowWords = new Set(words.split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
  const descHits = tokens.filter((t) => rowWords.has(t));
  if (descHits.length > 0) {
    return { path: project.path, name: project.name, basis: "description-token", tokens: descHits, exists: project.exists };
  }

  return { path: project.path, name: project.name, basis: "none", tokens: [], exists: project.exists };
}

/**
 * Try to bind an intention to a project.
 *
 * BIND-05 is the line that matters: more than one candidate means `unbound`,
 * never a silent pick. An ambiguous match is a question to a person, because
 * guessing here writes work into the wrong repository and the whole point of
 * binding is that the path is known before anything runs.
 */
export function bindProject(
  text: string,
  identities: readonly ProjectIdentity[] = projectIdentities(),
): Binding {
  const tokens = tokensOf(text);
  const named = identities
    .map((p) => candidateFor(p, tokens))
    .filter((c) => c.basis !== "none");

  // A registry entry that names a project which is not on disk is still a
  // candidate, because naming it is how the person learns it is missing. It is
  // not a bound answer, though: there is no directory to work in.
  const onDisk = named.filter((c) => c.exists);
  if (onDisk.length === 1) return { kind: "bound", candidate: onDisk[0]! };
  if (onDisk.length > 1) return { kind: "unbound", candidates: onDisk };
  if (named.length > 0) return { kind: "unbound", candidates: named };
  return { kind: "no_match", candidates: [] };
}

/**
 * Whether a goal may be approved.
 *
 * BIND-04 stated as a function so the affordance layer and the surface cannot
 * disagree about it. It is derived from the binding, never stored beside it.
 */
export function mayApprove(binding: Binding): boolean {
  return binding.kind === "bound";
}

/** The two lines a surface prints to keep the state visible. */
export function describeBinding(text: string, binding: Binding): string[] {
  const goal = `goal     ${text}`;
  if (binding.kind === "bound") {
    return [goal, `project  ${binding.candidate.path}`, "", `go? ${text}`];
  }
  if (binding.kind === "unbound") {
    return [
      goal,
      "project  unresolved",
      "",
      "I found these possible projects:",
      ...binding.candidates.map((c) => `  ${c.name}  ${c.path}${c.exists ? "" : "  (declared, not on disk)"}`),
      "",
      `project? ${text}>`,
    ];
  }
  return [
    goal,
    "project  unresolved",
    "",
    "no project in the portfolio matches this line.",
    `        ask what to work on, or type projects for the portfolio view.`,
  ];
}
