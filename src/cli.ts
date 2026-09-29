/**
 * CLI: report what the portfolio can currently accept work on.
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
import { existsSync } from "node:fs";

import {
  resolveOwnership,
  type Ownership,
  type Project,
  type ProjectState,
} from "./core/ownership.ts";
import { OpenCodeAdapter } from "./adapters/opencode.ts";

/** A project the caller wants to know about. Resolved by the caller, not here. */
function parseArgs(argv: string[]): { windowMinutes: number; roots: string[] } {
  let windowMinutes = 45;
  const roots: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--minutes" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        fail("--minutes needs a positive number");
      }
      windowMinutes = n;
    } else if (argv[i] === "--root" && argv[i + 1]) {
      roots.push(argv[++i]!);
    } else {
      fail(`unknown argument ${argv[i]}`);
    }
  }
  return { windowMinutes, roots };
}

function fail(message: string): never {
  console.error(`cuesheet-ownership: ${message}`);
  process.exit(2);
}

/**
 * Read a project's git state. Every git call is failure-tolerant on purpose:
 * absence of an upstream is a normal condition, not an error, and a crash here
 * must never be reported as "clean".
 */
function readProjectState(root: string): ProjectState {
  const run = (args: string[]): string | null => {
    try {
      return execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };

  const status = run(["status", "--porcelain"]);
  const hasUpstream = run(["rev-parse", "--abbrev-ref", "@{u}"]) !== null;
  const aheadText = hasUpstream ? run(["log", "--oneline", "@{u}..HEAD"]) : null;

  return {
    dirtyFiles: status === null ? 0 : status.split("\n").filter((l) => l.trim()).length,
    commitsAhead: aheadText === null ? 0 : aheadText.split("\n").filter((l) => l.trim()).length,
    hasUpstream,
  };
}

function main(): void {
  const { windowMinutes, roots } = parseArgs(process.argv.slice(2));
  if (roots.length === 0) fail("pass at least one --root");

  const now = Date.now();
  const windowMs = windowMinutes * 60_000;

  const projects: Project[] = roots
    .filter((r) => existsSync(r))
    .map((path) => ({ id: path, path }));

  const states = new Map(projects.map((p) => [p.id, readProjectState(p.path)]));

  const sessions = new OpenCodeAdapter({ now, windowMs }).getActiveSessions();
  const ownership = resolveOwnership(projects, sessions, states, { now, windowMs });

  console.log("REPO".padEnd(30) + "STATE".padEnd(10) + "DIRTY".padStart(6) + "AHEAD".padStart(7));
  for (const o of ownership) {
    const state = states.get(o.project.id);
    console.log(
      o.project.path.replace(`${process.env.HOME}/projects/`, "").padEnd(30) +
        o.availability.padEnd(10) +
        String(state?.dirtyFiles ?? 0).padStart(6) +
        String(state?.commitsAhead ?? 0).padStart(7),
    );
  }

  console.log("");
  for (const o of ownership) {
    if (o.reasons.length > 0) {
      console.log(`held  ${o.project.path.replace(process.env.HOME, "~")}: ${o.reasons.join(", ")}`);
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

main();
