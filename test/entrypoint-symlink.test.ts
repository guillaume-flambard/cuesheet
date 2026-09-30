/**
 * A command reached through a symlink still has to do something.
 *
 * Found by Agent F, auditing installability rather than behaviour. Five entry
 * scripts guarded their dispatcher with:
 *
 * ```ts
 * if (import.meta.url === `file://${process.argv[1]}`)
 * ```
 *
 * `import.meta.url` is a resolved realpath. `process.argv[1]` is the path as
 * typed. Put a symlink anywhere in that path and the two differ, the guard is
 * false, the dispatcher never runs, and the process exits 0 having done nothing:
 *
 * ```bash
 * $ ln -s .../src/cli-run.ts /tmp/x/cli-run.ts
 * $ node /tmp/x/cli-run.ts sessions list
 * exit=0
 * $ node src/cli-run.ts sessions list
 * chat-0321x5muo359so  events=  0  evidence=0
 * ```
 *
 * The worst part is that this passes. Exit 0, no output, no write, no error. A
 * user who installs by symlink gets a command that agrees with everything and
 * does nothing, which is exactly the shape of a system lying convincingly.
 *
 * This file is the regression. The rule it holds: an entry point invoked by a
 * path that is not its own realpath must still dispatch.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childEnv as hermeticChildEnv, sandboxDir } from "./fixtures/hermetic-env.ts";

const SRC = join(process.cwd(), "src");

/**
 * Entry points that own a dispatcher, and an invocation each one answers.
 *
 * Each CLI has its own grammar, which the first version of this file got wrong:
 * it passed `sessions list` to all three, so two of them correctly complained
 * about an unknown argument. The complaint proved the dispatcher had run, which
 * is the property under test, but only by accident.
 *
 * So the assertion is deliberately loose about the content and strict about the
 * fact of a response. What must not happen is silence with exit 0.
 */
const ENTRIES: Array<{ file: string; args: string[]; answers: RegExp }> = [
  { file: "cli-run.ts", args: ["sessions", "list"], answers: /no sessions|sessions/i },
  // An empty throwaway root, never the real one. Passing `--root .` made this
  // test scan the developer's actual portfolio, which is the hidden
  // observation the whole cost guard is about: a test that acquires real state
  // as a side effect of checking something else.
  { file: "cli.ts", args: ["--root", "<empty>"], answers: /REPO|STATE|free|held|pass at least/i },
  { file: "frontier-cli.ts", args: [], answers: /cuesheet-frontier|ENOENT|object|frontier/i },
];

/** One definition of the child's environment, shared by every test. */
const childEnv = (sessions: string) =>
  hermeticChildEnv({ sessions, home: sandboxDir("symlink-home") });

/** Run an entry point through a symlink, in a throwaway sessions root. */
function throughSymlink(file: string, args: string[]): { out: string; err: string; code: number } {
  const dir = mkdtempSync(join(tmpdir(), "cuesheet-symlink-"));
  const link = join(dir, file);
  symlinkSync(join(SRC, file), link);

  // A symlink and not a copy, checked with lstat, because the defect is
  // specific to a path that has to be resolved. An earlier version of this
  // asserted on `readlinkSync(...) !== target`, which is the same string the
  // function returns and so could never be true.
  assert.equal(lstatSync(link).isSymbolicLink(), true, "the entry point is reached via a symlink");

  const sessions = mkdtempSync(join(tmpdir(), "cuesheet-symlink-home-"));
  // `cli.ts` takes a real directory to scan, so an empty throwaway one is
  // substituted for the placeholder. Scanning a real one would make this test
  // depend on the developer's machine, which is the failure mode the cost guard
  // exists to catch.
  const emptyRoot = mkdtempSync(join(tmpdir(), "cuesheet-empty-root-"));
  const resolved = args.map((a) => (a === "<empty>" ? emptyRoot : a));
  const r = spawnSync(process.execPath, [link, ...resolved], {
    encoding: "utf8",
    env: childEnv(sessions),
  });
  return { out: r.stdout, err: r.stderr, code: r.status ?? 1 };
}

describe("an entry point reached through a symlink still dispatches", () => {
  for (const entry of ENTRIES) {
    it(`${entry.file} answers through a symlink, rather than exiting 0 in silence`, () => {
      const r = throughSymlink(entry.file, entry.args);

      // The defect in full: exit 0, no output, no error. Each of those alone
      // would be survivable; together they are a command that lies, and exit 0
      // is indistinguishable from success when nothing was expected to print.
      const said = `${r.out}${r.err}`.trim();
      assert.notEqual(
        said,
        "",
        `${entry.file} through a symlink produced no output at all; the dispatcher never ran`,
      );
      assert.ok(
        entry.answers.test(said),
        `${entry.file} answered with something unrecognisable: ${said.slice(0, 200)}`,
      );
    });
  }

  it("the guard compares resolved paths, so a symlinked path is still its own file", () => {
    // The property the fix rests on, stated directly rather than only through
    // the process behaviour above: whatever the caller typed, the two sides are
    // compared after both have been resolved.
    //
    // The probe is a real file rather than `-e`, because with `-e` node puts the
    // first argument in `argv[1]` and there is no file to resolve.
    const dir = mkdtempSync(join(tmpdir(), "cuesheet-realpath-"));
    const probe = join(dir, "probe.mjs");
    const link = join(dir, "linked.mjs");
    writeFileSync(
      probe,
      `import { realpathSync } from "node:fs";
       const typed = process.argv[1];
       const self = realpathSync(new URL(import.meta.url).pathname);
       console.log(JSON.stringify({
         typed,
         resolvedArgv: realpathSync(typed),
         self,
         naiveMatch: import.meta.url === "file://" + typed,
         resolvedMatch: import.meta.url === "file://" + realpathSync(typed),
         bothResolve: realpathSync(typed) === self,
       }));\n`,
      "utf8",
    );
    symlinkSync(probe, link);

    const r = spawnSync(process.execPath, [link], { encoding: "utf8" });
    assert.equal(r.status, 0, `the probe itself must run: ${r.stderr.slice(0, 200)}`);
    const result = JSON.parse(r.stdout.trim()) as {
      typed: string;
      resolvedArgv: string;
      self: string;
      naiveMatch: boolean;
      resolvedMatch: boolean;
      bothResolve: boolean;
    };

    // The whole defect, isolated: the naive comparison fails on a symlink and
    // the resolved one succeeds. If this ever stops being true, the guard in
    // src/ can go back to the naive form and the entry points above will fail.
    assert.equal(result.naiveMatch, false, "the naive comparison is what the defect was");
    assert.equal(result.resolvedMatch, true, "resolving argv[1] fixes it");
    assert.equal(result.bothResolve, true);
    assert.equal(result.self, result.resolvedArgv, "they are the same file");
  });

  it("a file invoked directly still dispatches, so the fix did not break the normal path", () => {
    // The realpath, not the symlink. An empty sessions root prints nothing, so
    // "it produced output" cannot be the assertion here: the assertion is that
    // it printed the empty-state line rather than staying silent, which is the
    // difference between a dispatcher that ran and one that did not.
    const sessions = mkdtempSync(join(tmpdir(), "cuesheet-direct-home-"));
    const r = spawnSync(process.execPath, [join(SRC, "cli-run.ts"), "sessions", "list"], {
      encoding: "utf8",
      env: childEnv(sessions),
    });
    // `status`, not `code`: `code` is my wrapper field, and reading it here
    // compared undefined against 0 on a perfectly healthy run.
    assert.equal(r.status, 0, `direct invocation must still succeed: ${r.stderr.slice(0, 200)}`);
    assert.ok(
      /no sessions|0 session|sessions/i.test(`${r.stdout}${r.stderr}`),
      `a dispatched empty listing should say so, got: ${`${r.stdout}${r.stderr}`.slice(0, 200)}`,
    );
  });
});
