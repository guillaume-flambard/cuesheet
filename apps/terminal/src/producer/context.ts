/**
 * What the environment says about the sentence, resolved without asking.
 *
 * This is the producer's half, and it observes: it reads the working directory
 * and the portfolio registry. It is separated from `app/state.ts` for exactly
 * that reason, and `app/state.ts` cannot reach it.
 *
 * ## The rule
 *
 * > The environment disambiguates a sentence. A person is never asked to name
 * > something the machine already knows.
 *
 * Three steps, in order, and the third is the one that matters:
 *
 * 1. The working directory is inside a portfolio project. That is the scope.
 * 2. Otherwise `bindProject` finds exactly one project: that is the scope.
 * 3. Otherwise more than one defends itself: that is a choice, not a guess.
 * 4. Otherwise **the working directory stands and the run happens anyway.**
 *
 * Step 4 is the whole design. BIND-01 in `src/adapters/project-binding.ts` says
 * an actionable intention stays an intention when its project is unknown, and
 * OBS-3 says a clarification never constrains the shape of the answer. So a
 * sentence that matches no project is not a dead end, and it never becomes the
 * words "name a project". It runs, where the person is standing.
 *
 * `bindProject` is used as written rather than re-decided here, for BIND-05: more
 * than one candidate means a question to a person, because guessing writes work
 * into the wrong repository and the point of binding is that the path is known
 * before anything runs.
 */

import { bindProject, projectIdentities, type Binding, type ProjectIdentity } from "../../../../src/adapters/project-binding.ts";
import { snapshotPortfolio } from "../../../../src/adapters/frontier.ts";
import type { Option } from "../app/state.ts";

/** Where the work will happen, and how sure we are. */
export type Scope =
  /** Resolved from the working directory. The most common case by far. */
  | { readonly at: "cwd"; readonly path: string; readonly name: string }
  /** Resolved from the portfolio: exactly one project defended itself. */
  | { readonly at: "bound"; readonly path: string; readonly name: string }
  /** More than one defends itself. A question, because BIND-05 forbids guessing. */
  | { readonly at: "choice"; readonly options: readonly Option[] }
  /** Nothing matched. The directory stands and the run happens. */
  | { readonly at: "unresolved"; readonly path: string; readonly name: string };

/** How a candidate was found, in the words a person can check. */
const REASON: Record<string, string> = {
  "exact-name": "named exactly",
  "name-token": "its name matched",
  "description-token": "its description matched",
  none: "",
};

/**
 * A candidate, as this module needs it.
 *
 * `exists` is part of it because a registry entry naming a project that is not
 * on disk is still worth offering: naming it is how a person learns it is missing
 * (`src/adapters/project-binding.ts:220`). The reason says so, rather than the
 * option being dropped and the absence looking like a failure to find anything.
 */
type Candidate = { path: string; name: string; basis: string; exists: boolean };

const toOption = (c: Candidate): Option => ({
  name: c.name,
  path: c.path,
  why: c.exists ? REASON[c.basis] ?? "it matched" : "in the registry, not on disk",
});

/**
 * The project the working directory is inside, if it is inside one.
 *
 * Registry paths are relative to the projects root, so the comparison is done
 * against the absolute directory and the longest match wins. The longest rule is
 * what makes a nested project resolve to itself rather than to its parent.
 */
function projectUnder(
  cwd: string,
  identities: readonly ProjectIdentity[],
  projectsRoot: string,
): { path: string; name: string } | null {
  const absolute = identities
    .map((i) => ({ name: i.name, path: `${projectsRoot}/${i.path}`.replace(/\/{2,}/g, "/") }))
    .filter((i) => cwd === i.path || cwd.startsWith(`${i.path}/`))
    // The longest match wins, so a project nested inside another resolves to
    // itself rather than to its parent.
    .sort((a, b) => b.path.length - a.path.length);
  return absolute[0] ?? null;
}

/**
 * Resolve the scope of a sentence from the environment.
 *
 * Pure enough to test with a fake binding, and honest about being an observer:
 * it takes the registry and the cwd as arguments so a test never has to reach
 * into the real portfolio.
 */
export function resolveScope(
  said: string,
  cwd: string,
  identities: readonly ProjectIdentity[],
  bind: (text: string, ids: readonly ProjectIdentity[]) => Binding,
  projectsRoot: string,
): Scope {
  // Keep an established project for generic descriptions. A complete named
  // project can change scope; weak description/partial-name tokens cannot.
  const here=projectUnder(cwd,identities,projectsRoot);
  const binding=bind(said,identities);
  const candidates=binding.kind==="bound"?[binding.candidate]:binding.candidates;
  const words=new Set(said.toLowerCase().split(/[^a-z0-9]+/));
  const explicitlyNamed=candidates.some(c=>c.basis==="exact-name"||c.basis==="name-token"&&c.name.toLowerCase().split(/[^a-z0-9]+/).every(word=>words.has(word)));
  if(here&&!explicitlyNamed)return {at:"cwd",path:here.path,name:here.name};
  if (binding.kind === "bound") {
    return {
      at: "bound",
      path: `${projectsRoot}/${binding.candidate.path}`.replace(/\/+/g, "/"),
      name: binding.candidate.name,
    };
  }
  if (binding.kind === "unbound" && binding.candidates.length > 1) {
    return { at: "choice", options: binding.candidates.map(candidate=>toOption({...candidate,path:`${projectsRoot}/${candidate.path}`.replace(/\/+/g,"/")})) };
  }
  if (binding.kind === "unbound" && binding.candidates.length === 1) {
    // One candidate that is not on disk. Naming it is how the person learns it
    // is missing, but there is no directory to write in, so the run still needs
    // somewhere to happen and the cwd is where that is.
    return { at: "unresolved", path: cwd, name: binding.candidates[0]!.name };
  }
  if(here)return {at:"cwd",path:here.path,name:here.name};

  // Step 4. Nothing matched. Not a failure and not a question: the intention
  // stands and the directory the person is standing in is the scope.
  return { at: "unresolved", path: cwd, name: basename(cwd) };
}

/** The last path segment, without importing `node:path` into a file that tests read. */
function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

/**
 * The one observation the producer needs from the portfolio when a sentence
 * produces no scope of its own.
 *
 * Expensive by construction, so it is called once and only when there is a
 * sentence that needs an offer. Naming a project costs nothing, because naming
 * needs no evidence beyond the path (`src/adapters/project-binding.ts:78`).
 */
export function offerPortfolio(projectsRoot?: string): Option[] {
  const snap = snapshotPortfolio(projectsRoot === undefined ? {} : { projectsRoot });
  return snap.free.slice(0, 8).map((path) => ({ name: path.split("/").pop() ?? path, path, why: "free to write to" }));
}

/** How many projects are held, for the line that explains a short offer. */
export function portfolioHeld(projectsRoot?: string): number {
  const snap = snapshotPortfolio(projectsRoot === undefined ? {} : { projectsRoot });
  return snap.held.length;
}

/** The identities, read once per launch. Reused across every sentence. */
export function identities(projectsRoot?: string): readonly ProjectIdentity[] {
  return projectIdentities(projectsRoot === undefined ? {} : { projectsRoot });
}

export { bindProject };
export type { ProjectIdentity };