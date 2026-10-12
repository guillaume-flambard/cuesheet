/**
 * The capsule tests that borrow a real worktree of this repository are gated on
 * a container, so their cleanup never runs in an ordinary `npm test`. This file
 * proves the release they rely on, without a container, against a throwaway
 * repository: a fixture root deleted under a registered worktree must not leave
 * an entry behind in the source repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { releaseFixtureWorktree } from "./fixtures/fixture-worktree.ts";

function fixture(run: (source: string, root: string, git: (...args: string[]) => string) => void): void {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "cs-fixture-worktree-")));
  const source = join(base, "source"), root = join(base, "root");
  const env = { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: source, env, encoding: "utf8" }).trim();
  try {
    execFileSync("git", ["init", "-q", source], { env });
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "--allow-empty", "-m", "base");
    run(source, root, git);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const registered = (git: (...args: string[]) => string, path: string) =>
  git("worktree", "list", "--porcelain").split("\n").includes("worktree " + path);

test("a fixture root deleted under a registered worktree leaves no entry once released", () => fixture((source, root, git) => {
  const path = join(root, "workspaces", "alias");
  git("worktree", "add", "-q", "--detach", path, "HEAD");
  assert.ok(registered(git, path));
  // The leak: the root goes, the registration stays and points at nothing.
  rmSync(root, { recursive: true, force: true });
  assert.ok(registered(git, path), "deleting the directory alone keeps the registration");
  releaseFixtureWorktree(source, path);
  assert.ok(!registered(git, path), "the release drops a registration whose directory is gone");
}));

test("a present fixture worktree is removed with its directory", () => fixture((source, root, git) => {
  const path = join(root, "workspaces", "owned");
  git("worktree", "add", "-q", "--detach", path, "HEAD");
  releaseFixtureWorktree(source, path);
  assert.ok(!registered(git, path));
  assert.ok(!existsSync(path));
}));

test("a path the allocation never registered is a silent no-op", () => fixture((source, root, git) => {
  const before = git("worktree", "list", "--porcelain");
  assert.doesNotThrow(() => releaseFixtureWorktree(source, join(root, "workspaces", "never")));
  assert.equal(git("worktree", "list", "--porcelain"), before);
}));
