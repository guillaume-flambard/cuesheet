/**
 * Adapter: the portfolio, read from the repositories that actually exist.
 *
 * This is the generator behind `FRONTIER.md`. A frontier written by hand is a
 * fourth place where the portfolio's state can be wrong, and the failure is
 * silent: an agent reads a confident summary of work that has moved. So the
 * frontier is derived from things that cannot drift quietly: the registry of
 * projects, their git state, and the durable objects.
 *
 * The Frontier is the answer to "where do we stand", and it is deliberately
 * small. A session that must read 480 KB of research to learn its own direction
 * will not read it, and will instead re-derive direction from whatever it
 * touched.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DurableObject, Frontier } from "../core/memory.ts";
import { buildFrontier, wakeable } from "../core/memory.ts";
import {
  resolveOwnership,
  type Project,
  type ActiveSession,
  type ProjectObservation,
  type OwnershipOptions,
  type Ownership,
} from "../core/ownership.ts";

/**
 * Where the portfolio lives on the machine that is not asking.
 *
 * `~/projects` is this machine's layout, and it used to be a module constant,
 * which meant the adapter could not be pointed at any other layout at all. It
 * is now a default that every entry point can override, so a second person can
 * read their own portfolio without editing this file. See test/portability.test.ts.
 */
export const DEFAULT_PROJECTS_ROOT = (()=>{try{return join(homedir(),"projects");}catch{return "";}})();

/** The five categories the registry groups projects into. */
const CATEGORIES = ["products", "tools", "infrastructure", "experiments", "clients"];

export interface FrontierOptions {
  /** Where the projects tree is. Defaults to `~/projects`. */
  projectsRoot?: string;
  /** Active sessions to consider for ownership. */
  sessions?: Array<{ id: string; directory: string; lastActivity: number }>;
}

/** What the registry says, which is the declared truth about what exists. */
export interface RegistryEntry {
  name: string;
  path: string;
  kind: string;
  status: string;
  nature: string;
  stack: string;
}

/** What the repository itself says, which is what actually happened. */
export interface RepoReality {
  entry: RegistryEntry;
  exists: boolean;
  branch: string | null;
  dirty: number;
  ahead: number;
  hasRemote: boolean;
}

export function parseRegistry(projectsRoot: string): RegistryEntry[] {
  if(!projectsRoot)throw new Error("Projects root unavailable: configure a project directory; no home directory could be resolved.");
  const registry = join(projectsRoot, "PROJECTS.md");
  if (!existsSync(registry)) {
    return [];
  }
  const out: RegistryEntry[] = [];
  for (const line of readFileSync(registry, "utf8").split("\n")) {
    if (!line.startsWith("| ")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    // Header and separator rows carry no project.
    if (cells.length < 6) continue;
    if (cells[0] === "Name" || cells[0]!.startsWith("---")) continue;
    const [name, path, kind, status, nature, stack] = cells;
    out.push({
      name: name!,
      path: path!,
      kind: kind!,
      status: status!,
      nature: nature!,
      stack: stack!,
    });
  }
  return out;
}

function probe(entry: RegistryEntry, projectsRoot: string): RepoReality {
  const dir = join(projectsRoot, entry.path);
  if (!existsSync(join(dir, ".git"))) {
    return {
      entry,
      exists: existsSync(dir),
      branch: null,
      dirty: 0,
      ahead: 0,
      hasRemote: false,
    };
  }
  const run = (args: string[]): string => {
    try {
      // stderr is discarded on purpose: a repo with no upstream makes git
      // write "fatal: no upstream configured" on every probe, and 44 of those
      // lines would drown the Frontier this function is generating. The number
      // that matters is the empty result, not the complaint about it.
      return execFileSync("git", ["-C", dir, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  };
  return {
    entry,
    exists: true,
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]) || null,
    dirty: run(["status", "--porcelain"]).split("\n").filter(Boolean).length,
    ahead: Number(run(["rev-list", "--count", "@{u}..HEAD"]) || "0"),
    hasRemote: run(["remote"]).length > 0,
  };
}

export interface PortfolioSnapshot {
  projects: RepoReality[];
  /** Projects the registry names but that are not on disk. */
  declaredButMissing: string[];
  /** Projects on disk that the registry does not name. */
  presentButUndeclared: string[];
  /** A project is writable when it is clean, pushed, and has a remote. */
  free: string[];
  /** A project is held when there is unfinished or unpushed work. */
  held: string[];
}

/**
 * Read the portfolio. Every number here is read from git rather than recalled,
 * which is the only reason the Frontier can be trusted to describe the present.
 */
export function snapshotPortfolio(options: FrontierOptions = {}): PortfolioSnapshot {
  const projectsRoot = options.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  const entries = parseRegistry(projectsRoot);
  const repoRealities = entries
    .filter((e) => e.kind === "repo")
    .map((e) => probe(e, projectsRoot));

  const declared = new Set(repoRealities.map((p) => p.entry.path));

  const presentButUndeclared: string[] = [];
  for (const category of CATEGORIES) {
    const dir = join(projectsRoot, category);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const rel = `${category}/${name}`;
      if (!existsSync(join(dir, name, ".git"))) continue;
      if (!declared.has(rel)) presentButUndeclared.push(rel);
    }
  }

  // Convert to core types and delegate ownership decision to the core.
  const projects: Project[] = repoRealities.map((p) => ({
    id: p.entry.path,
    path: join(projectsRoot, p.entry.path),
  }));

  // Build ProjectObservation map from probe results.
  const states = new Map<string, ProjectObservation>();
  for (const p of repoRealities) {
    if (!p.exists) {
      states.set(p.entry.path, { observed: false, reason: "not on disk" });
    } else if (!existsSync(join(projectsRoot, p.entry.path, ".git"))) {
      states.set(p.entry.path, { observed: false, reason: "not a repository" });
    } else {
      states.set(p.entry.path, {
        observed: true,
        counts: {
          dirtyFiles: p.dirty,
          commitsAhead: p.ahead,
          hasUpstream: p.hasRemote,
        },
      });
    }
  }

  // Convert options.sessions to core ActiveSession type
  const sessions: ActiveSession[] = (options.sessions ?? []).map((s) => ({
    id: s.id,
    directory: s.directory,
    lastActivity: s.lastActivity,
  }));

  const ownershipOptions: OwnershipOptions = { now: Date.now() };
  const ownership = resolveOwnership(projects, sessions, states, ownershipOptions);

  const free: string[] = [];
  const held: string[] = [];
  for (const o of ownership) {
    // Map core project ID back to registry entry name for display
    const entry = entries.find((e) => e.path === o.project.id);
    const displayName = entry?.name ?? o.project.id;
    if (o.availability === "available") {
      free.push(displayName);
    } else {
      const reason = o.reasons.join("; ");
      held.push(`${displayName}  [${reason}]`);
    }
  }

  return {
    projects: repoRealities,
    declaredButMissing: repoRealities
      .filter((p) => !p.exists)
      .map((p) => p.entry.name),
    presentButUndeclared,
    free,
    held,
  };
}

export interface FrontierInput {
  objects: DurableObject[];
  measured: Record<string, number | boolean>;
  snapshot?: PortfolioSnapshot;
}

/**
 * Build the frontier. Now and watch come from the durable objects, woken comes
 * from the conditions, and the portfolio facts are attached rather than
 * summarised, so a reader can see which repositories can actually be written
 * to without asking.
 */
export function buildSnapshotFrontier(input: FrontierInput): {
  frontier: Frontier;
  snapshot: PortfolioSnapshot | null;
  unevaluable: Array<{ id: string; why: string }>;
} {
  const frontier = buildFrontier(input.objects, input.measured);
  const snapshot = input.snapshot ?? snapshotPortfolio();

  const unevaluable: Array<{ id: string; why: string }> = [];
  for (const object of input.objects) {
    if (object.status !== "active" || !object.revisit_when) continue;
    const missing = object.revisit_when.satisfiedBy.filter(
      (m) => !(m in input.measured),
    );
    if (missing.length > 0) {
      unevaluable.push({
        id: object.id,
        why: `missing measurement(s): ${missing.join(", ")}`,
      });
    }
  }

  return { frontier, snapshot, unevaluable };
}

/** Render the frontier as the Markdown a session reads. Size is the budget. */
export function renderFrontier(
  frontier: Frontier,
  snapshot: PortfolioSnapshot | null,
  unevaluable: Array<{ id: string; why: string }>,
  woken: DurableObject[],
): string {
  const lines: string[] = [];
  const line = (s = ""): void => void lines.push(s);

  line("# Frontier");
  line();
  line("<!-- GENERATED by `cuesheet frontier`. Do not edit by hand: this file is");
  line("     derived from the project registry, git state and durable objects, and");
  line("     a hand-edited frontier is a second place for the portfolio to be wrong. -->");
  line();

  line("## Now");
  if (frontier.now.length === 0) {
    line("_nothing in the now horizon_");
  }
  for (const o of frontier.now) {
    line(`### ${o.what}`);
    line(`- kind: ${o.kind} (${o.id})`);
    line(`- why: ${o.why}`);
    if (o.evidence.length > 0) {
      line(`- evidence: ${o.evidence.map((e) => e.source).join(", ")}`);
    }
    if (o.related_to.length > 0) {
      line(`- related: ${o.related_to.join(", ")}`);
    }
    line();
  }

  line("## Woken this session");
  if (woken.length === 0) {
    line("_no wake condition met_");
  }
  for (const o of woken) {
    line(`- **${o.what}**: ${o.revisit_when?.signal ?? ""}`);
  }
  line();

  line("## Watch");
  if (frontier.watch.length === 0) {
    line("_nothing in the watch horizon_");
  }
  for (const o of frontier.watch) {
    line(`### ${o.what}`);
    if (o.revisit_when) {
      line(`- wake when: ${o.revisit_when.requires}`);
    }
    line();
  }

  line("## Asleep");
  if (frontier.asleep.length === 0) {
    line("_nothing dormant_");
  }
  for (const o of frontier.asleep) {
    line(`- ${o.what}`);
  }
  line();

  line("## Falsified, kept as lessons");
  if (frontier.lessons.length === 0) {
    line("_nothing falsified yet_");
  }
  for (const l of frontier.lessons) {
    if (!l || l.believed === undefined) continue;
    line(`- believed: ${l.believed}`);
    line(`  broken by: ${l.counterexample}`);
    line(`  now: ${l.now}`);
  }
  line();

  if (unevaluable.length > 0) {
    line("## Conditions that could not be evaluated");
    line();
    line("An unevaluable condition is not a met condition. These are missing data, not a verdict.");
    line();
    for (const u of unevaluable) {
      line(`- \`${u.id}\`: ${u.why}`);
    }
    line();
  }

  if (snapshot) {
    line("## Portfolio reality");
    line();
    line(`- declared repositories: ${snapshot.projects.length}`);
    line(`- free to write: ${snapshot.free.length}`);
    line(`- held: ${snapshot.held.length}${snapshot.held.length > 0 ? ` (${snapshot.held.join(", ")})` : ""}`);
    if (snapshot.declaredButMissing.length > 0) {
      line(`- declared but not on disk: ${snapshot.declaredButMissing.join(", ")}`);
    }
    if (snapshot.presentButUndeclared.length > 0) {
      line(`- on disk but undeclared: ${snapshot.presentButUndeclared.join(", ")}`);
    }
    line();
  }

  return lines.join("\n");
}
