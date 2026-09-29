/**
 * Core: ownership resolution.
 *
 * The core knows nothing about any particular machine, user, project registry
 * or agent runtime. It receives already-normalized facts and decides who is
 * free to write where. That constraint is the whole point of the split: a
 * personal system may be the proving ground, but only invariants that survive
 * contact with it are allowed in here.
 *
 * Admission rule, applied to this file as to every future primitive: it entered
 * Core after existing as a working local script (bin/portfolio-owners) and
 * after failing without it, when a second writer in a live checkout was found
 * to be indistinguishable from available work. It is here because it was
 * demonstrated twice, not because it looked reusable.
 */

/** A place that work can be done. A path, a repository, a workspace. */
export interface Project {
  /** Stable identifier the caller uses. Never interpreted by the core. */
  id: string;
  /** Absolute path to the project root, as the caller resolved it. */
  path: string;
}

/** An activity that could be writing to a project. Supplied by an adapter. */
export interface ActiveSession {
  /** Opaque handle for the runtime that reported it. */
  id: string;
  /** Directory the session is working in, as the runtime reported it. */
  directory: string;
  /** Epoch milliseconds of the session's last observed activity. */
  lastActivity: number;
}

/** The repository state the core cannot observe itself. */
/**
 * Counts that were actually observed. Every count is a number because it was
 * read; a count that could not be read is not a zero, and it does not live in
 * this shape. See `ProjectObservation`.
 */
export interface ObservedCounts {
  /** Files with uncommitted changes. */
  dirtyFiles: number;
  /** Commits present locally but not on the upstream branch. */
  commitsAhead: number;
  /**
   * Whether the project's VCS tracks an upstream branch. Absence is normal
   * after a branch rename or a registry move, and it is reported rather than
   * treated as an error.
   */
  hasUpstream: boolean;
}

/**
 * What an adapter could establish about a project, and what it could not.
 *
 * A caller that has not looked must say so. Defaulting an unobserved project
 * to zero dirty files and zero unpushed commits is the same mistake as
 * reporting a failed read as "clean": it invents the one fact that authorises
 * a second writer, from nothing.
 *
 * `observed: false` is never a free pass. An unobserved project is held.
 */
export type ProjectObservation =
  | { readonly observed: true; readonly counts: ObservedCounts }
  | { readonly observed: false; readonly reason: string };

/**
 * A project the adapter observed. Counts are always real, because the adapter
 * only constructs this shape after a successful read.
 */
export type ProjectState = ObservedCounts;

export type Availability = "available" | "held";

export interface Ownership {
  project: Project;
  availability: Availability;
  /**
   * The most recent session seen on this project inside the window, if any.
   * Present even when availability is `held` on git evidence alone, so a
   * caller can tell "someone is here" from "someone left work behind".
   */
  lastSession: ActiveSession | null;
  /** Human-readable grounds for the verdict. Never empty. */
  reasons: string[];
  /** True when work exists here that is not yet on the remote. */
  needsPush: boolean;
  /**
   * True when no state was observed at all. An unobserved project is always
   * held, and this flag is how a caller tells "held because work is visible"
   * from "held because we could not look".
   */
  unobserved: boolean;
}

export interface OwnershipOptions {
  /**
   * How long a session keeps a project held after its last activity. This is
   * an inference, not a lock: a long single step and an abandoned session look
   * identical from the outside. Default is deliberately conservative, because
   * the cost of a false "available" is a corrupted checkout.
   */
  windowMs?: number;
  /** Epoch milliseconds treated as "now". Injected so this stays testable. */
  now: number;
}

const DEFAULT_WINDOW_MS = 45 * 60 * 1000;

export function resolveOwnership(
  projects: Project[],
  sessions: ActiveSession[],
  states: Map<string, ProjectObservation>,
  options: OwnershipOptions,
): Ownership[] {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  // Newest first, so the first match per project is the most recent.
  const byDirectory = new Map<string, ActiveSession>();
  for (const s of sessions) {
    const current = byDirectory.get(s.directory);
    if (!current || s.lastActivity > current.lastActivity) {
      byDirectory.set(s.directory, s);
    }
  }

  return projects.map((project) => {
    const reasons: string[] = [];
    const observation = states.get(project.id);

    // A project nobody looked at is not a clean project. The whole point of
    // this primitive is that a second writer must never be authorised from an
    // absence of observation, so an unobserved project is held on that ground
    // alone, and the reason says which one it was.
    if (!observation) {
      return {
        project,
        availability: "held" as const,
        lastSession: null,
        reasons: [`no observation was supplied for this project, so its state is unknown`],
        needsPush: false,
        unobserved: true,
      };
    }
    if (!observation.observed) {
      return {
        project,
        availability: "held" as const,
        lastSession: null,
        reasons: [`state could not be observed: ${observation.reason}`],
        needsPush: false,
        unobserved: true,
      };
    }
    const state = observation.counts;

    // A session inside the window is a live owner, not a historical record.
    const candidate = byDirectory.get(project.path);
    const lastSession =
      candidate && options.now - candidate.lastActivity < windowMs ? candidate : null;

    if (lastSession) {
      const ageMin = Math.round((options.now - lastSession.lastActivity) / 60000);
      reasons.push(`session active ${ageMin} min ago`);
    }

    if (state.dirtyFiles > 0) {
      reasons.push(`${state.dirtyFiles} uncommitted file(s)`);
    }

    const needsPush = state.commitsAhead > 0;
    if (needsPush) {
      reasons.push(`${state.commitsAhead} commit(s) not pushed`);
    }

    // Uncommitted or unpushed work means someone touched this without
    // finishing. That is not proof they are still here, and it is not proof
    // they are gone. It is enough to refuse a second writer.
    return {
      project,
      availability: reasons.length > 0 ? ("held" as const) : ("available" as const),
      lastSession,
      reasons,
      needsPush,
      unobserved: false,
    };
  });
}

/** Projects with no live session and no leftover work. */
export function availableProjects(ownership: Ownership[]): Ownership[] {
  return ownership.filter((o) => o.availability === "available");
}
