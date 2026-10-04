import type {Requirement} from "./core/capability.ts";
/**
 * CLI: two reports, one per mode.
 *
 * Ownership mode (the default) reports what the portfolio can currently
 * accept work on. Requirements mode (`--requirements <file>`) is the
 * delegation gate: it resolves a work packet's declared capabilities against
 * live skill roots and prints a conformance-style verdict before anything
 * spawns, exiting nonzero when blocked so a script can use it as a gate.
 *
 * This replaces an ad-hoc shell script that grew two silent bugs, both from
 * the same mistake: treating "no data" as "no data present" instead of "no
 * data available". A `git log @{u}..HEAD` exiting 128 on a repo with no
 * upstream aborted the run under `set -e`; a last line without a trailing
 * newline was dropped by `read`. Both lost rows with no error.
 *
 * The logic lives in the core and is tested there. This file only reads
 * adapters, resolves, and prints.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  resolveOwnership,
  type Ownership,
  type Project,
  type ProjectObservation,
} from "./core/ownership.ts";
import { OpenCodeAdapter } from "./adapters/opencode.ts";
import { SkillsAdapter } from "./adapters/skills.ts";
import { isEntryPoint } from "./is-entry-point.ts";
import {
  parseRequirements,
  preflightDelegation,
  RequirementsFormatError,
} from "./core/delegation.ts";

interface ParsedArgs {
  mode: "ownership" | "delegation";
  windowMinutes: number;
  roots: string[];
  requirementsFile: string | null;
  skillRoots: string[];
  format: "text" | "json";
}

function parseArgs(argv: string[]): ParsedArgs {
  let windowMinutes = 45;
  const roots: string[] = [];
  const skillRoots: string[] = [];
  let requirementsFile: string | null = null;
  let format: "text" | "json" = "text";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--minutes" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        fail("--minutes needs a positive number");
      }
      windowMinutes = n;
    } else if (argv[i] === "--root" && argv[i + 1]) {
      roots.push(argv[++i]!);
    } else if (argv[i] === "--requirements") {
      if (!argv[i + 1]) fail("--requirements needs a file path");
      requirementsFile = argv[++i]!;
    } else if (argv[i] === "--skill-root") {
      if (!argv[i + 1]) fail("--skill-root needs a directory");
      skillRoots.push(argv[++i]!);
    } else if (argv[i] === "--format" && argv[i + 1]) {
      const value = argv[++i]!;
      if (value !== "json" && value !== "text") {
        fail("--format takes json or text");
      }
      format = value;
    } else {
      fail(`unknown argument ${argv[i]}`);
    }
  }

  if (requirementsFile !== null) {
    if (skillRoots.length === 0) {
      fail("--requirements needs at least one --skill-root to resolve against");
    }
  } else if (skillRoots.length > 0) {
    fail("--skill-root only means something with --requirements");
  }

  return {
    mode: requirementsFile === null ? "ownership" : "delegation",
    windowMinutes,
    roots,
    requirementsFile,
    skillRoots,
    format,
  };
}

function fail(message: string): never {
  console.error(`cuesheet: ${message}`);
  process.exit(2);
}

/**
 * Read a project's git state. Every git call is failure-tolerant on purpose:
 * absence of an upstream is a normal condition, not an error, and a crash here
 * must never be reported as "clean".
 */
function readProjectState(root: string): ProjectObservation {
  const run = (args: string[]): { text: string } | { error: string } => {
    try {
      const text = execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { text };
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return { error: detail.split("\n")[0] ?? detail };
    }
  };

  const countLines = (text: string): number =>
    text.split("\n").filter((l) => l.trim()).length;

  // `git status` is the one call that decides whether a second writer is
  // authorised, so a failure here is never turned into a count. Reporting a
  // crashed read as zero dirty files is what makes a broken checkout look
  // available, and that is the exact failure this command exists to prevent.
  const status = run(["status", "--porcelain"]);
  if ("error" in status) {
    return { observed: false, reason: `git status failed: ${status.error}` };
  }

  // An absent upstream is a normal condition and is not an error, so this one
  // stays a boolean probe. A real failure and "no upstream" are different
  // facts and only the second one is a `false`.
  const upstream = run(["rev-parse", "--abbrev-ref", "@{u}"]);
  const hasUpstream = !("error" in upstream);

  let commitsAhead = 0;
  if (hasUpstream) {
    const ahead = run(["log", "--oneline", "@{u}..HEAD"]);
    if ("error" in ahead) {
      return { observed: false, reason: `git log failed: ${ahead.error}` };
    }
    commitsAhead = countLines(ahead.text);
  }

  return {
    observed: true,
    counts: {
      dirtyFiles: countLines(status.text),
      commitsAhead,
      hasUpstream,
    },
  };
}

/**
 * The requirements gate. The exit codes are the contract: 0 spawn, 1 blocked
 * refusal (a normal outcome, not a crash), 2 broken invocation.
 */
function gate(requirementsFile: string, skillRoots: string[]): void {
  let text: string;
  try {
    text = readFileSync(requirementsFile, "utf8");
  } catch (cause) {
    fail(
      `cannot read requirements file ${requirementsFile}: ${(cause as Error).message}`,
    );
  }

  let requirements: Requirement[];
  try {
    requirements = parseRequirements(text);
  } catch (cause) {
    if (cause instanceof RequirementsFormatError) fail(cause.message);
    throw cause;
  }

  const now = Date.now();
  const listing = new SkillsAdapter({ roots: skillRoots }).listCapabilities();
  const preflight = preflightDelegation(requirements, listing.capabilities, {
    now,
    registryUnverified: listing.anyRootUnreadable || listing.unreadable.length > 0,
  });
  const { resolved, unresolved } = preflight.resolution.resolution;
  const total = requirements.length;

  console.log(
    `requirements: ${requirementsFile} (${total} declared, ` +
      `${skillRoots.length} skill root${skillRoots.length === 1 ? "" : "s"})`,
  );
  for (const c of resolved) {
    console.log(`ok      ${c.kind} "${c.name}" ${c.version} ${c.source}`);
  }
  // A folder that looks like a skill and whose manifest could not be read is
  // neither a resolved capability nor a proven absence. Printing it is the
  // whole point: the requirement below may be unmet, or merely unreadable,
  // and only the operator can tell which.
  for (const u of listing.unreadable) {
    console.log(
      `UNREADABLE ${u.folder}: ${u.reason} (${u.path})`,
    );
  }
  for (const u of unresolved) {
    console.log(
      `BLOCKED ${u.requirement.kind} "${u.requirement.name}": ${u.reasons.join("; ")}`,
    );
  }

  if (preflight.spawnable) {
    console.log(
      total === 0
        ? "conformance verdict: ready (no requirements declared)"
        : `conformance verdict: ready (${resolved.length} of ${total} resolved)`,
    );
    return;
  }
  console.log(
    `conformance verdict: blocked (${resolved.length} of ${total} resolved): do not spawn`,
  );
  process.exit(1);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "delegation") {
    gate(args.requirementsFile!, args.skillRoots);
    return;
  }

  if (args.roots.length === 0) fail("pass at least one --root");

  const now = Date.now();
  const windowMs = args.windowMinutes * 60_000;

  const projects: Project[] = args.roots
    .filter((r) => existsSync(r))
    .map((path) => ({ id: path, path }));

  const states = new Map(projects.map((p) => [p.id, readProjectState(p.path)]));

  const sessions = new OpenCodeAdapter({ now, windowMs }).getActiveSessions();
  const ownership = resolveOwnership(projects, sessions, states, { now, windowMs });

  // A report that a machine cannot read is not a verdict, it is a printout.
  // `--format json` is what makes this usable as a sensor instead of a command
  // a human has to watch, and `unknown` is a real value here rather than a 0.
  if (args.format === "json") {
    console.log(
      JSON.stringify(
        {
          now,
          windowMinutes: args.windowMinutes,
          projects: ownership.map((o) => {
            const observation = states.get(o.project.id);
            return {
              id: o.project.id,
              path: o.project.path,
              availability: o.availability,
              unobserved: o.unobserved,
              dirtyFiles: observation?.observed ? observation.counts.dirtyFiles : null,
              commitsAhead: observation?.observed ? observation.counts.commitsAhead : null,
              hasUpstream: observation?.observed ? observation.counts.hasUpstream : null,
              lastSession: o.lastSession,
              reasons: o.reasons,
            };
          }),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("REPO".padEnd(30) + "STATE".padEnd(10) + "DIRTY".padStart(6) + "AHEAD".padStart(7));
  for (const o of ownership) {
    const observation = states.get(o.project.id);
    // Not `?? 0`. A count that was never read prints as `?`, because a zero
    // here would be the same claim as "this checkout is clean".
    const dirty = observation?.observed ? String(observation.counts.dirtyFiles) : "?";
    const ahead = observation?.observed ? String(observation.counts.commitsAhead) : "?";
    console.log(
      o.project.path.replace(`${process.env.HOME}/projects/`, "").padEnd(30) +
        o.availability.padEnd(10) +
        dirty.padStart(6) +
        ahead.padStart(7),
    );
  }

  console.log("");
  for (const o of ownership) {
    if (o.reasons.length > 0) {
      console.log(`held  ${(process.env.HOME?o.project.path.replace(process.env.HOME, "~"):o.project.path)}: ${o.reasons.join(", ")}`);
    }
  }
  const free = ownership.filter((o) => o.availability === "available");
  console.log("");
  console.log(
    free.length === 0
      ? "No project is free. A held project is not an error: wait, choose another, or use an isolated worktree."
      : `available: ${free.map((o) => o.project.path.replace(`${process.env.HOME}/projects/`, "")).join(", ")}`,
  );
}

/**
 * Run only when this file is the program. See the same guard in cli-run.ts:
 * without it, importing this module ran the ownership report and exited, which
 * is invisible to every caller because they all spawn it as a process.
 */
if (isEntryPoint(import.meta.url)) {
  main();
}
