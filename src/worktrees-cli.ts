/**
 * CLI: list and release the worktrees Cuesheet allocated.
 *
 * A managed worktree stays registered in its source repository until it goes
 * through Git, and deleting a sessions directory cannot unregister it. Before
 * this command the only way out was deleting the directory, which left one
 * dangling registration per worker in the source repository: 56 of them in this
 * repository's own checkout on 2026-10-12.
 *
 * `release` is the explicit owner action that empties a managed root before it
 * is deleted. It frees only what is provably safe and exits 1 when anything was
 * held, so `cuesheet worktrees release --root X && rm -rf X` never drops work.
 * The rules live in `releaseManagedWorktree`; this file only finds the roots,
 * calls it and prints. Spec: docs/harness/WORKTREE-RELEASE.md.
 */

import { readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  listManagedWorktrees,
  managedAllocationIds,
  releaseManagedWorktree,
  type ManagedWorktreeState,
  type ReleaseOutcome,
} from "./adapters/managed-worktrees.ts";
import { isEntryPoint } from "./is-entry-point.ts";

const DEFAULT_ROOT = join(process.env.CUESHEET_SESSIONS ?? join(homedir(), ".cuesheet", "sessions"), "workspaces");

const USAGE = `usage:
  cuesheet worktrees list [--root <dir>]... [--format json]
  cuesheet worktrees release [--root <dir>]... [--id <id>]... [--dry-run] [--format json]

--root is a managed root, or a directory whose immediate children are managed
roots (the default, ${DEFAULT_ROOT}, is one). release exits 0 when nothing under
the roots is left registered by Cuesheet, 1 when anything was held.`;

interface Args {
  action: "list" | "release";
  roots: string[];
  ids: string[];
  dryRun: boolean;
  format: "text" | "json";
}

function fail(message: string): never {
  console.error(`cuesheet worktrees: ${message}`);
  console.error(USAGE);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  // The dispatcher passes the command name first for subcommand-style entries.
  const rest = argv[0] === "worktrees" ? argv.slice(1) : argv;
  const action = rest[0];
  if (action !== "list" && action !== "release") fail(action ? `unknown action "${action}"` : "missing action");
  const args: Args = { action, roots: [], ids: [], dryRun: false, format: "text" };
  for (let i = 1; i < rest.length; i++) {
    const flag = rest[i]!;
    if (flag === "--root" || flag === "--id" || flag === "--format") {
      const value = rest[++i];
      if (!value) fail(`${flag} needs a value`);
      if (flag === "--root") {
        // An absent root is an empty one; a file in its place is a usage error, not an empty result.
        let kind: "directory" | "absent" | "other" = "absent";
        try { kind = statSync(value).isDirectory() ? "directory" : "other"; } catch { /* absent */ }
        if (kind === "other") fail(`--root ${value} is not a directory`);
        // Ledgers record canonical paths, so an alias such as /tmp on macOS is resolved here rather than held later.
        args.roots.push(kind === "directory" ? realpathSync(value) : resolve(value));
      }
      if (flag === "--id") args.ids.push(value);
      if (flag === "--format") {
        if (value === "text" || value === "json") args.format = value;
        else fail(`--format must be text or json, not "${value}"`);
      }
    } else if (flag === "--dry-run" && action === "release") {
      args.dryRun = true;
    } else {
      fail(`unknown argument "${flag}"`);
    }
  }
  if (args.action === "list" && args.ids.length > 0) fail("--id only means something with release");
  if (args.ids.length > 0 && args.roots.length !== 1) fail("--id needs exactly one --root, the managed root that holds those ids");
  if (args.roots.length === 0) args.roots.push(DEFAULT_ROOT);
  return args;
}

/**
 * The managed roots under a directory: itself if it holds ledgers, otherwise
 * its immediate children that do. The terminal producer allocates under
 * `<sessions>/workspaces/<task>/`, so one level covers the real layout without
 * walking an arbitrary tree.
 */
async function managedRoots(dir: string): Promise<string[]> {
  if ((await managedAllocationIds(dir)).length > 0) return [dir];
  let children: string[];
  try {
    children = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => join(dir, e.name)).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const roots: string[] = [];
  for (const child of children) if ((await managedAllocationIds(child)).length > 0) roots.push(child);
  return roots;
}

function printStates(states: ManagedWorktreeState[]): void {
  if (states.length === 0) {
    console.log("no managed worktrees");
    return;
  }
  for (const s of states) {
    console.log(`${s.condition.padEnd(12)}${s.worktree.padEnd(9)}${s.path}`);
    console.log(`            ${s.unit} / ${s.agent} / ${s.objective}#${s.revision}: ${s.reason}`);
  }
}

function printOutcomes(outcomes: ReleaseOutcome[], dryRun: boolean): void {
  if (outcomes.length === 0) {
    console.log("no managed worktrees");
    return;
  }
  for (const o of outcomes) console.log(`${o.kind.padEnd(17)}${o.path}\n                 ${o.reason}`);
  const held = outcomes.filter((o) => o.kind === "held").length;
  console.log(`\n${outcomes.length - held} ${dryRun ? "would be freed" : "freed"}, ${held} held${held ? ": do not delete these roots" : ""}`);
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.action === "list") {
    const states: ManagedWorktreeState[] = [];
    for (const dir of args.roots) for (const root of await managedRoots(dir)) states.push(...await listManagedWorktrees(root, { limit: 4096 }));
    if (args.format === "json") console.log(JSON.stringify(states, null, 2));
    else printStates(states);
    return 0;
  }
  const outcomes: ReleaseOutcome[] = [];
  if (args.ids.length > 0) {
    for (const id of args.ids) outcomes.push(await releaseManagedWorktree(args.roots[0]!, id, { dryRun: args.dryRun }));
  } else {
    for (const dir of args.roots) {
      for (const root of await managedRoots(dir)) {
        for (const id of await managedAllocationIds(root)) outcomes.push(await releaseManagedWorktree(root, id, { dryRun: args.dryRun }));
      }
    }
  }
  if (args.format === "json") console.log(JSON.stringify(outcomes, null, 2));
  else printOutcomes(outcomes, args.dryRun);
  return outcomes.some((o) => o.kind === "held") ? 1 : 0;
}

if (isEntryPoint(import.meta.url)) {
  if (process.argv.slice(2).some((a) => a === "-h" || a === "--help")) {
    console.log(USAGE);
    process.exit(0);
  }
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(`cuesheet worktrees: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
