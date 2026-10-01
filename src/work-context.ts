/**
 * Context sources: where the work reads from, when a repository is not it.
 *
 * The brief for this repository is that a repository is *a* context source
 * among several, not the precondition for having one. Today that is false in
 * practice: `bindProject` (`src/adapters/project-binding.ts:211`) resolves a
 * sentence to a project, so work starts from a directory or it does not start.
 * A person who works for hours without opening a repository has no way to say
 * what they are working on.
 *
 * So the source is a closed union rather than a path, and the kinds are named
 * for *what they are* rather than for where they live:
 *
 * ```text
 * repository | web | file | artifact | scratch | previous_session
 * ```
 *
 * Two of those are worth defending, because they are the ones that change what
 * this project is:
 *
 * - `scratch` is a source with no disk behind it. Without it, "work with no
 *   repository" has no representation at all and the only honest answer is an
 *   error, which is the thing being removed.
 * - `previous_session` is the substitution made durable. It is how a temporary
 *   worker learns what an earlier one did without reading its messages, and it
 *   is the one kind that refers to no world outside the log.
 *
 * The union is closed and every member carries the same three things, which is
 * what lets a worker read a source without knowing which kind it is. A worker
 * that had to branch per kind would be branching on where work happens to live,
 * which is the coupling this removes.
 *
 * No I/O, no clock, no `bindProject`. Resolution is the adapter's job
 * (`src/adapters/project-binding.ts`); this module only describes, and
 * `contextSourceFromBinding` is the one crossing that takes what the binder
 * already resolved. That is the same discipline `translate.ts` follows for the
 * surface: one crossing, and it is visible.
 */

import type { Sourced } from "./work-state.ts";
import type { Binding } from "./adapters/project-binding.ts";

/** Every kind, as a value, so a consumer enumerates instead of restating. */
export const CONTEXT_SOURCE_KINDS = [
  "repository",
  "web",
  "file",
  "artifact",
  "scratch",
  "previous_session",
] as const;

export type ContextSourceKind = (typeof CONTEXT_SOURCE_KINDS)[number];

/**
 * Where the work reads from.
 *
 * `name` is what a person would recognise, and it is never interpreted here: a
 * URL is not fetched and a path is not resolved. Interpreting it is an adapter's
 * job, and doing it in this module would make reading a source an observation,
 * which is the defect VIEW-01 exists to prevent.
 */
export interface ContextSource extends Sourced {
  readonly id: string;
  readonly kind: ContextSourceKind;
  readonly name: string;
  /**
   * Why this source is in the work, when it was recorded with a reason.
   *
   * A later worker reads this to know whether the source is still the right one,
   * and a source with no reason recorded is a source nobody can judge.
   */
  readonly why: string | null;
}

/** True when a string names a kind this module knows. */
export function isContextSourceKind(value: string): value is ContextSourceKind {
  return (CONTEXT_SOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * Build a source from a binder's answer, or nothing when there is no scope.
 *
 * `unbound` and `no_match` both give null, and they are deliberately not
 * distinguished here. BIND-05 says more than one candidate is a question to a
 * person, not a pick (`src/adapters/project-binding.ts:121-127`), and this
 * function has no person to ask. Collapsing both into null keeps the
 * un-asked question visible upstream instead of hiding it behind a source.
 */
export function contextSourceFromBinding(
  binding: Binding,
  sourced: Sourced,
): ContextSource | null {
  if (binding.kind !== "bound") return null;
  const candidate = binding.candidate;
  return {
    ...sourced,
    id: `repo:${candidate.name}`,
    kind: "repository",
    name: candidate.path,
    // The basis the binder recorded, in the binder's own words. A worker's
    // reader can check it, which is the point of BIND-01.
    why: `matched on ${candidate.basis}`,
  };
}

/**
 * A source with no disk behind it.
 *
 * Exists so that "working on something, in no repository" is a state the work
 * language can hold. Without it, the only ways to have a context are to have
 * opened a directory or to have named a file, and a person who has done neither
 * is not describable.
 */
export function scratchSource(id: string, name: string, sourced: Sourced): ContextSource {
  return { ...sourced, id, kind: "scratch", name, why: null };
}

/**
 * A source that is another session, referred to and not read.
 *
 * This is the kind that makes substitution checkable: it names the session it
 * continues rather than carrying its events, so a reader knows to project that
 * session rather than expecting the answer to be here already.
 */
export function previousSessionSource(
  id: string,
  sessionId: string,
  sourced: Sourced,
): ContextSource {
  return { ...sourced, id, kind: "previous_session", name: sessionId, why: null };
}

/**
 * A sentence for a reader. The kind leads, because that is the question a person
 * actually has ("where are we working?"), and the name follows.
 */
export function describeContextSource(source: ContextSource): string {
  switch (source.kind) {
    case "repository":
      return `repository ${source.name}`;
    case "web":
      return `web ${source.name}`;
    case "file":
      return `file ${source.name}`;
    case "artifact":
      return `artifact ${source.name}`;
    case "scratch":
      return `working with no repository (${source.name})`;
    case "previous_session":
      return `continuing session ${source.name}`;
  }
}
