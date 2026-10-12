/**
 * WTR-06: `cuesheet worktrees` through the real dispatcher.
 *
 * The exit code is the contract: a script runs `release` and deletes the root
 * only on 0, so a held worktree must exit 1 and a bad invocation must exit 2,
 * never 0 with nothing done.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateWorktree } from "../src/adapters/managed-worktrees.ts";
import { childEnv } from "./fixtures/hermetic-env.ts";

const ENTRY = join(process.cwd(), "src", "cuesheet.ts");

async function fixture(run: (ctx: { root: string; source: string; sessions: string; git: (...a: string[]) => string }) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cs-worktrees-cli-")));
  const source = join(root, "source"), sessions = join(root, "sessions");
  mkdirSync(source);
  const git = (...a: string[]) => execFileSync("git", a, { cwd: source, env: childEnv({ home: root, sessions: root }), encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(source, "file"), "base");
    git("add", "file");
    git("commit", "-qm", "base");
    await run({ root, source, sessions, git });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** One allocation under `<sessions>/workspaces/<task>/`, the layout the terminal producer uses, with a dead owner. */
async function deadAllocation(source: string, sessions: string, git: (...a: string[]) => string, task: string, id: string): Promise<string> {
  const managed = join(sessions, "workspaces", task);
  const result = await allocateWorktree({ repository: source, root: managed, allocation: { id, unit: "build", agent: "worker", objective: "goal", revision: 1, base: git("rev-parse", "HEAD") } });
  assert.equal(result.kind, "ready");
  const file = join(managed, id + ".jsonl");
  const [first, ...rest] = readFileSync(file, "utf8").trimEnd().split("\n");
  const saved = JSON.parse(first!);
  saved.pid = 2147483647;
  writeFileSync(file, [JSON.stringify(saved), ...rest].join("\n") + "\n");
  return join(managed, id);
}

const cli = (args: string[], sessions: string) =>
  spawnSync(process.execPath, [ENTRY, "worktrees", ...args], { encoding: "utf8", env: { ...childEnv({ home: sessions, sessions }), CUESHEET_SESSIONS: sessions } });

test("WTR-06 release over a sessions directory frees the clean, holds the dirty and exits 1", () => fixture(async ({ source, sessions, git }) => {
  const clean = await deadAllocation(source, sessions, git, "t-one", "w-clean");
  const dirty = await deadAllocation(source, sessions, git, "t-two", "w-dirty");
  writeFileSync(join(dirty, "work"), "unmerged");

  const dry = cli(["release", "--dry-run"], sessions);
  assert.equal(dry.status, 1, dry.stderr);
  assert.match(dry.stdout, /released\s+.*w-clean/);
  assert.match(dry.stdout, /held\s+.*w-dirty/);
  assert.ok(existsSync(clean), "a dry run leaves the tree");

  const real = cli(["release"], sessions);
  assert.equal(real.status, 1, "something was held, so the root must not be deleted");
  assert.ok(!existsSync(clean));
  assert.ok(existsSync(join(dirty, "work")));
  assert.match(real.stdout, /1 freed, 1 held/);

  rmSync(join(dirty, "work"));
  const again = cli(["release", "--format", "json"], sessions);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  const outcomes = JSON.parse(again.stdout) as Array<{ kind: string }>;
  assert.deepEqual(outcomes.map((o) => o.kind), ["released"], "only the remaining live ledger is considered");
  assert.ok(!git("worktree", "list", "--porcelain").includes(join(sessions, "workspaces")), "nothing under the sessions directory is registered");
}));

test("WTR-06 list shows each allocation and its reason; an empty or absent root is not an error", () => fixture(async ({ source, sessions, git }) => {
  await deadAllocation(source, sessions, git, "t-one", "w-clean");
  const listed = cli(["list"], sessions);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /recoverable\s+present\s+.*w-clean/);
  const json = JSON.parse(cli(["list", "--format", "json"], sessions).stdout) as Array<{ id: string; condition: string }>;
  assert.deepEqual(json.map((s) => [s.id, s.condition]), [["w-clean", "recoverable"]]);
  const absent = cli(["release", "--root", join(sessions, "nowhere")], sessions);
  assert.equal(absent.status, 0);
  assert.match(absent.stdout, /no managed worktrees/);
}));

test("WTR-06 bad invocations exit 2 and change nothing", () => fixture(async ({ root, source, sessions, git }) => {
  const clean = await deadAllocation(source, sessions, git, "t-one", "w-clean");
  writeFileSync(join(root, "a-file"), "");
  for (const args of [[], ["prune"], ["release", "--force"], ["list", "--id", "w-clean"], ["release", "--id", "w-clean"], ["release", "--root", join(root, "a-file")], ["list", "--format", "yaml"]]) {
    const r = cli(args, sessions);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
  }
  assert.ok(existsSync(clean), "no bad invocation released anything");
  const named = cli(["release", "--root", join(sessions, "workspaces", "t-one"), "--id", "w-clean"], sessions);
  assert.equal(named.status, 0, named.stdout + named.stderr);
  assert.ok(!existsSync(clean));
}));
