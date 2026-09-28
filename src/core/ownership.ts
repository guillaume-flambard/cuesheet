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
export interface ProjectState {
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
  states: Map<string, ProjectState>,
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
    const state = states.get(project.id) ?? {
      dirtyFiles: 0,
      commitsAhead: 0,
      hasUpstream: false,
    };

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
      availability: reasons.length > 0 ? "held" : "available",
      lastSession,
      reasons,
      needsPush,
    };
  });
}

/** Projects with no live session and no leftover work. */
export function availableProjects(ownership: Ownership[]): Ownership[] {
  return ownership.filter((o) => o.availability === "available");
}
