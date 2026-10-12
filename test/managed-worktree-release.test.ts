/**
 * WTR-01..05: the explicit owner release of managed worktrees.
 *
 * Every case runs against a real Git repository, because the guard that matters
 * most is Git's own refusal to remove a modified, untracked or locked tree
 * without --force, and a fake would only prove the fake.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  allocateWorktree,
  listManagedWorktrees,
  managedAllocationIds,
  releaseManagedWorktree,
} from "../src/adapters/managed-worktrees.ts";
import { childEnv } from "./fixtures/hermetic-env.ts";

type Git = (...args: string[]) => string;

async function fixture(run: (source: string, managed: string, git: Git) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cs-release-")));
  const source = join(root, "source"), managed = join(root, "managed");
  mkdirSync(source);
  const git: Git = (...args) => execFileSync("git", args, { cwd: source, env: childEnv({ home: root, sessions: root }), encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(source, ".gitignore"), "build/\n");
    writeFileSync(join(source, "file"), "base");
    git("add", ".gitignore", "file");
    git("commit", "-qm", "base");
    await run(source, managed, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Allocate one worktree and return its path; the allocating process (this one) is its live owner. */
async function allocate(source: string, managed: string, git: Git, id = "w-one"): Promise<string> {
  const result = await allocateWorktree({
    repository: source,
    root: managed,
    allocation: { id, unit: "build", agent: "worker-1", objective: "goal", revision: 1, base: git("rev-parse", "HEAD") },
  });
  assert.equal(result.kind, "ready", JSON.stringify(result));
  return join(managed, id);
}

/** The owner dies: its recorded PID no longer exists. The ready receipt is kept. */
function killOwner(managed: string, id = "w-one"): void {
  const file = join(managed, id + ".jsonl");
  const [first, ...rest] = readFileSync(file, "utf8").trimEnd().split("\n");
  const saved = JSON.parse(first!);
  saved.pid = 2147483647;
  writeFileSync(file, [JSON.stringify(saved), ...rest].join("\n") + "\n");
}

const listed = (git: Git, path: string) => git("worktree", "list", "--porcelain").split("\n").includes("worktree " + path);
const archived = (managed: string, id = "w-one") => readFileSync(join(managed, id + ".released.jsonl"), "utf8").trimEnd().split("\n").map((l) => JSON.parse(l));

test("WTR-01 a dead-owner clean worktree is removed, unregistered and its ledger archived", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  // Ignored build output is not work; Git removes it with the tree.
  mkdirSync(join(path, "build"));
  writeFileSync(join(path, "build", "out.js"), "derived");
  killOwner(managed);
  const outcome = await releaseManagedWorktree(managed, "w-one");
  assert.equal(outcome.kind, "released", outcome.reason);
  assert.ok(!existsSync(path), "the worktree directory is gone");
  assert.ok(!listed(git, path), "Git no longer lists it");
  assert.ok(!existsSync(join(managed, "w-one.jsonl")), "the live ledger is gone");
  const lines = archived(managed);
  assert.equal(lines.length, 3, "reservation, ready receipt, release receipt");
  assert.equal(lines[2].phase, "released");
  assert.equal(lines[2].mode, "removed");
  assert.deepEqual(await listManagedWorktrees(managed), [], "the archive is not an allocation");
  assert.deepEqual(await managedAllocationIds(managed), []);
  assert.ok(!existsSync(join(managed, "w-one.jsonl.release")), "the release claim is removed");
}));

test("WTR-02 an alive owner holds its worktree", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  const outcome = await releaseManagedWorktree(managed, "w-one");
  assert.equal(outcome.kind, "held");
  assert.ok(existsSync(path) && listed(git, path));
  assert.ok(existsSync(join(managed, "w-one.jsonl")));
}));

test("WTR-02 untracked, modified and committed work is never removed", async (t) => {
  const cases: Array<[string, (path: string) => void]> = [
    ["untracked file", (path) => writeFileSync(join(path, "new"), "work")],
    ["modified tracked file", (path) => writeFileSync(join(path, "file"), "changed")],
    ["moved HEAD", (path) => {
      writeFileSync(join(path, "file"), "committed");
      execFileSync("git", ["-c", "user.name=W", "-c", "user.email=w@example.invalid", "commit", "-qam", "work"], { cwd: path });
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => fixture(async (source, managed, git) => {
      const path = await allocate(source, managed, git);
      mutate(path);
      killOwner(managed);
      const ledger = readFileSync(join(managed, "w-one.jsonl"), "utf8");
      const outcome = await releaseManagedWorktree(managed, "w-one");
      assert.equal(outcome.kind, "held", name);
      assert.ok(existsSync(path) && listed(git, path), "the worktree stays");
      assert.equal(readFileSync(join(managed, "w-one.jsonl"), "utf8"), ledger, "the ledger is unchanged");
      assert.ok(!existsSync(join(managed, "w-one.released.jsonl")));
    }));
  }
});

test("WTR-02 an invalid ledger or a pending finalize claim holds", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  killOwner(managed);
  writeFileSync(join(managed, "w-one.jsonl.finalize"), "");
  assert.equal((await releaseManagedWorktree(managed, "w-one")).kind, "held", "finalize claim");
  rmSync(join(managed, "w-one.jsonl.finalize"));
  writeFileSync(join(managed, "w-one.jsonl"), "{not json\n");
  assert.equal((await releaseManagedWorktree(managed, "w-one")).kind, "held", "invalid ledger");
  assert.ok(existsSync(path) && listed(git, path));
}));

test("WTR-02 Git is the last guard: a locked clean worktree is refused without --force", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  killOwner(managed);
  git("worktree", "lock", "--reason", "owner hold", path);
  const outcome = await releaseManagedWorktree(managed, "w-one");
  assert.equal(outcome.kind, "held");
  assert.match(outcome.reason, /Git refused/);
  assert.ok(existsSync(path) && listed(git, path));
  assert.ok(existsSync(join(managed, "w-one.jsonl")), "a refused release archives nothing");
}));

test("WTR-03 an allocation whose directory is gone is unregistered", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  killOwner(managed);
  rmSync(path, { recursive: true, force: true });
  assert.ok(listed(git, path), "the leak: the registration outlives the directory");
  const outcome = await releaseManagedWorktree(managed, "w-one");
  assert.equal(outcome.kind, "unregistered", outcome.reason);
  assert.ok(!listed(git, path));
  assert.equal(archived(managed).at(-1).mode, "unregistered");
}));

test("WTR-03 a vanished directory with a live owner is held", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  rmSync(path, { recursive: true, force: true });
  assert.equal((await releaseManagedWorktree(managed, "w-one")).kind, "held");
  assert.ok(listed(git, path));
}));

test("WTR-04 an existing release claim holds without effect", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  killOwner(managed);
  writeFileSync(join(managed, "w-one.jsonl.release"), "");
  const outcome = await releaseManagedWorktree(managed, "w-one");
  assert.equal(outcome.kind, "held");
  assert.match(outcome.reason, /release claim/);
  assert.ok(existsSync(path) && listed(git, path));
  assert.ok(existsSync(join(managed, "w-one.jsonl.release")), "the claim is never reclaimed");
}));

test("WTR-04 releasing twice is a no-op and a crash between removal and archive is resolved", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  killOwner(managed);
  assert.equal((await releaseManagedWorktree(managed, "w-one")).kind, "released");
  const archive = readFileSync(join(managed, "w-one.released.jsonl"), "utf8");
  assert.equal((await releaseManagedWorktree(managed, "w-one")).kind, "already-released");
  assert.equal(readFileSync(join(managed, "w-one.released.jsonl"), "utf8"), archive, "one archive, untouched");

  // The crash: Git removed the tree, the process died before the archive.
  const second = await allocate(source, managed, git, "w-two");
  killOwner(managed, "w-two");
  git("worktree", "remove", second);
  const outcome = await releaseManagedWorktree(managed, "w-two");
  assert.equal(outcome.kind, "unregistered", outcome.reason);
  assert.equal(archived(managed, "w-two").at(-1).mode, "unregistered");
  assert.ok(!listed(git, path) && !listed(git, second));
}));

test("WTR-05 a dry run reports and writes nothing", () => fixture(async (source, managed, git) => {
  const path = await allocate(source, managed, git);
  killOwner(managed);
  const ledger = readFileSync(join(managed, "w-one.jsonl"), "utf8");
  const outcome = await releaseManagedWorktree(managed, "w-one", { dryRun: true });
  assert.equal(outcome.kind, "released");
  assert.equal(outcome.dryRun, true);
  assert.ok(existsSync(path) && listed(git, path));
  assert.equal(readFileSync(join(managed, "w-one.jsonl"), "utf8"), ledger);
  assert.ok(!existsSync(join(managed, "w-one.jsonl.release")), "not even the claim");
  assert.ok(!existsSync(join(managed, "w-one.released.jsonl")));
}));
