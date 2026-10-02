/**
 * How many observations a surface makes, counted rather than timed.
 *
 * The defect this pins down was not a slow banner, it was a banner that read
 * 45 repositories to greet someone: 180 git subprocesses on every start. The
 * suite went from seconds to 69 s, and nothing failed, because nothing was
 * wrong except the cost.
 *
 * A duration budget would not have caught it well. 154 ms against a 5 s limit
 * leaves a slow CI deciding correctness, which is the same mistake as a latency
 * target standing in for a property. Counting holds on any machine.
 *
 * This lives in its own file because the shim costs about 20 ms per call and
 * one portfolio question makes 180 of them. Two assertions pay for that; the
 * rest of the surface is asserted without a counter in test/chat.test.ts.
 */

import "./fixtures/portfolio-env.ts";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CHAT = join(process.cwd(), "src", "chat.ts");

/**
 * Run something and count the git processes it started.
 *
 * The counter is a shim on `PATH` rather than a mock. The chat spawns `git`
 * through `execFileSync` inside an adapter, and mocking at the module boundary
 * would need a seam that does not exist. A counting executable in a temporary
 * directory measures what the process actually did, which is the only claim
 * worth making about a subprocess.
 */
function countGitCalls(fn: () => unknown): number {
  const dir = mkdtempSync(join(tmpdir(), "cuesheet-gitcount-"));
  const log = join(dir, "count");
  const shim = join(dir, "git");
  try {
    writeFileSync(
      shim,
      ["#!/bin/sh", `echo x >> ${JSON.stringify(log)}`, 'exec /usr/bin/git "$@"', ""].join("\n"),
    );
    chmodSync(shim, 0o755);
    const before = process.env.PATH ?? "";
    process.env.PATH = `${dir}:${before}`;
    try {
      fn();
    } finally {
      process.env.PATH = before;
    }
    // No calls means no log file at all, and zero is the answer this test is
    // looking for. Treating the missing file as an error would have made the
    // passing case the failing one.
    if (!existsSync(log)) {
      return 0;
    }
    return readFileSync(log, "utf8").split("\n").filter(Boolean).length;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function say(lines: string[], cwd: string): void {
  spawnSync(process.execPath, [CHAT], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    cwd,
  });
}

describe("observation cost", () => {
  it("the banner reads nothing", () => {
    // The regression: a portfolio read added to the chat header so the surface
    // could greet with "16 free, 29 held". It read 45 repositories on every
    // start. Verified to fail when that line is put back.
    const counted = countGitCalls(() => say(["exit"], homedir()));
    assert.equal(counted, 0, `the banner spawned ${counted} git calls`);
  });

  it("the portfolio is read once per session, not once per question", () => {
    // "on bosse sur quoi" and "projects" are two questions about the same
    // world. The session-scoped observation is what stops the second one from
    // paying 180 subprocesses again, and the count is a multiple of the four
    // calls per repository, so a partial read would show up as a remainder.
    const counted = countGitCalls(() =>
      say(["on bosse sur quoi", "projects", "exit"], homedir()),
    );
    assert.ok(counted > 0, "asking about the portfolio must read it");
    assert.equal(
      counted % 4,
      0,
      `expected whole repository probes, got ${counted} calls`,
    );
  });
});
