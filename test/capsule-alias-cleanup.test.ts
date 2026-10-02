/**
 * CAP-ALIAS-01: a capsule command must leave the candidate host-valid.
 *
 * The capsule bootstrap creates `node_modules` links inside the container, but
 * the candidate is a bind mount, so those links are written on the HOST pointing
 * at a path that exists only inside the image. Before this, a build left a
 * dangling `node_modules` in the candidate and every later host-side step had to
 * repair it by hand.
 *
 * The loop is made reversible at its source: the bootstrap records exactly the
 * links it created and removes them when the command ends, so a link the owner
 * provided is never touched and a link the capsule made never outlives it.
 *
 * Gated like the other capsule tests: without the pinned image and socket there
 * is no container to observe, and a skipped test is honest where a fabricated
 * pass is not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { allocateWorktree } from "../src/adapters/managed-worktrees.ts";
import { captureGitSnapshot } from "../src/adapters/git-snapshot.ts";
import { ContainerToolRunner } from "../src/adapters/container-tools.ts";
import { NODE_CAPSULE_ROOT } from "../src/adapters/node-capsule.ts";

const image = process.env.CUESHEET_TEST_CAPSULE_IMAGE;
const socket = process.env.CUESHEET_TEST_TOOL_SOCKET;

/** A dangling or capsule-pointing link is the defect; anything else is the owner's. */
function capsuleLinks(root: string): string[] {
  const found: string[] = [];
  for (const rel of ["node_modules", join("apps", "terminal", "node_modules")]) {
    const path = join(root, rel);
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() && readlinkSync(path) === NODE_CAPSULE_ROOT) found.push(rel);
    } catch {
      // Absent is the expected and desired end state.
    }
  }
  return found;
}

test("CAP-ALIAS-01 a capsule command leaves no capsule dependency link behind on the host", { skip: !image || !socket }, async () => {
  const source = realpathSync(process.cwd());
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cs-capsule-alias-")));
  let workspace: string | undefined;
  try {
    const snapshot = await captureGitSnapshot(source);
    const allocated = await allocateWorktree({
      repository: source,
      root: join(root, "workspaces"),
      allocation: { id: "alias", unit: "capsule-alias", agent: "fixture", objective: "fixture", revision: 1, base: snapshot.base },
      snapshot,
    });
    assert.equal(allocated.kind, "ready", JSON.stringify(allocated));
    if (allocated.kind !== "ready") return;
    workspace = allocated.path;

    assert.deepEqual(capsuleLinks(workspace), [], "the candidate starts with no capsule link");

    const runner = new ContainerToolRunner({ allow: ["node"], roots: [workspace], defaultCwd: workspace, socket: socket!, image: image!, timeoutMs: 120000, outputBytes: 8000 });
    // Any admitted command runs the bootstrap first, which is the thing under test.
    const ran = await runner.run({ name: "node", input: { argv: ["node", "-e", "process.stdout.write('capsule-ran')"] } });
    assert.equal(ran.exit, 0, ran.output);
    assert.match(ran.output, /capsule-ran/);

    assert.deepEqual(
      capsuleLinks(workspace),
      [],
      "a capsule command must not leave node_modules pointing into the image; the next host step would be running against a dangling link",
    );
  } finally {
    if (workspace) {
      try { execFileSync("git", ["-c", "core.hooksPath=/dev/null", "worktree", "remove", "--force", workspace], { cwd: source, stdio: "pipe", env: { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }); } catch { /* already gone */ }
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test("CAP-ALIAS-01 a link the owner already provided is not removed", { skip: !image || !socket }, async () => {
  // The counterpart invariant: cleanup must remove only what the capsule made.
  // A foreign link is refused by the bootstrap, and an owner link must survive a
  // command that never touched it.
  const source = realpathSync(process.cwd());
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cs-capsule-alias-owned-")));
  let workspace: string | undefined;
  try {
    const snapshot = await captureGitSnapshot(source);
    const allocated = await allocateWorktree({
      repository: source,
      root: join(root, "workspaces"),
      allocation: { id: "owned", unit: "capsule-alias-owned", agent: "fixture", objective: "fixture", revision: 1, base: snapshot.base },
      snapshot,
    });
    assert.equal(allocated.kind, "ready", JSON.stringify(allocated));
    if (allocated.kind !== "ready") return;
    workspace = allocated.path;

    const { symlinkSync } = await import("node:fs");
    const owned = join(source, "node_modules");
    assert.ok(existsSync(owned), "the repository has its own node_modules to lend");
    symlinkSync(owned, join(workspace, "node_modules"));

    const runner = new ContainerToolRunner({ allow: ["node"], roots: [workspace], defaultCwd: workspace, socket: socket!, image: image!, timeoutMs: 120000, outputBytes: 8000 });
    const ran = await runner.run({ name: "node", input: { argv: ["node", "-e", "process.stdout.write('ok')"] } });
    // A capsule build bootstraps first and refuses to replace a foreign link
    // rather than silently discarding it. Either outcome is acceptable; the
    // invariant under test is that the owner's link is still the owner's.
    assert.ok(ran.exit === 0 || ran.exit === 126, `unexpected exit ${ran.exit}: ${ran.output}`);
    assert.ok(existsSync(join(workspace, "node_modules")), "the owner's link survived");
    assert.equal(readlinkSync(join(workspace, "node_modules")), owned, "and it still points where the owner put it");
  } finally {
    if (workspace) {
      try { execFileSync("git", ["-c", "core.hooksPath=/dev/null", "worktree", "remove", "--force", workspace], { cwd: source, stdio: "pipe", env: { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }); } catch { /* already gone */ }
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
