/**
 * Unregister a fixture worktree from the repository that lent it.
 *
 * The capsule tests allocate a real worktree of this repository under a
 * temporary root, then delete that root. Git keeps the registration in the
 * source repository's own `.git/worktrees`, so a root deleted while the
 * worktree is still registered leaves an entry pointing at nothing. Those
 * entries accumulated in the developer's checkout: one per interrupted or
 * non-ready allocation.
 *
 * The cleanup was conditional on the allocation reporting `ready`. An
 * allocation can run `git worktree add` and still report `uncertain` (the
 * attestation after creation failed), and then nothing unregistered it. So the
 * caller passes the deterministic path it asked for, not the path it got back,
 * and this runs whatever the allocation said.
 *
 * `git worktree remove --force` also drops the registration when the directory
 * is already gone, and refuses a path that was never registered; that refusal
 * is the expected outcome when the allocation never reached Git, so it is
 * swallowed here and only here.
 */
import { execFileSync } from "node:child_process";

export function releaseFixtureWorktree(source: string, path: string): void {
  try {
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "worktree", "remove", "--force", path], {
      cwd: source,
      stdio: "pipe",
      env: { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    });
  } catch {
    // Never registered: the allocation stopped before `git worktree add`.
  }
}
