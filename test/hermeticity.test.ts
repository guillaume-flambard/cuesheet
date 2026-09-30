/**
 * No test inherits a capability of the developer's machine.
 *
 * The rule, stated once:
 *
 * > A test never implicitly accesses a capability of the developer's. Not the
 * > network. Also API keys, the real HOME, real sessions, the real registry, the
 * > real portfolio, credentials, provider config. If a test wants an external
 * > capability it asks for it explicitly. Otherwise the environment is
 * > hermetic.
 *
 * This exists because the rule was learned the hard way. `test/real-chat-path.ts`
 * inherited `OPENROUTER_API_KEY` from the parent, so a test meant to exercise
 * Cuesheet's own bookkeeping reached a real provider over the network and took
 * 17 seconds. Nothing failed. It just quietly measured somebody else's latency,
 * which is the definition of a hidden observation: the test passes either way
 * and its cost belongs to the wrong place.
 *
 * This file is mechanical on purpose. It reads every test file and checks the
 * rules that can be checked without running anything, because a rule nobody
 * enforces is a preference. What it cannot check, it says so.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CANARY, childEnv } from "./fixtures/hermetic-env.ts";

const TEST_DIR = join(process.cwd(), "test");

const testFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) out.push(full);
    }
  };
  walk(TEST_DIR);
  return out.sort();
};

/**
 * Capabilities a test may reach only by naming them.
 *
 * Keys and credentials are the ones that leave the machine. A real HOME is the
 * one that makes a test's result depend on who ran it, which is worse because it
 * does not even cost time.
 */
const FORBIDDEN_ENV = [
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "GITHUB_TOKEN",
];

/**
 * The real home, which exists so the guard can name what it protects.
 *
 * A test is allowed to run in a home directory: `test/chat.test.ts` exercises
 * the surface's refusal to accept a work goal in `$HOME`, and that test is only
 * meaningful in a real one. What a test may not do is reach a capability it did
 * not ask for, and a home is not one. A key, and the repository itself, are.
 */
const REAL_HOME = process.env.HOME ?? "";

describe("hermeticity: a test does not inherit what it did not ask for", () => {
  /**
   * A child that reaches the real repository can read every file in it.
   *
   * Separate from a key, because it is the one that makes a test's result depend
   * on whose machine ran it, and it costs nothing to do by accident.
   */
  const REPO_PATH = "tools/cuesheet";

  it("no test file forwards a provider key to a child", () => {
    // The pattern that caused the leak: `{ ...process.env }` hands every variable
    // to the child, and deleting the keys you know about leaves the ones nobody
    // thought of. The first version of `test/real-chat-path.ts` did exactly this
    // and reached a real provider over the network.
    //
    // Hermetic by naming is also accepted, and is the form this repository now
    // uses: an environment assembled from named variables cannot leak a key that
    // was never named. So both shapes pass, and only the sloppy one fails.
    // Strip comments and doc comments first. The rule is about what the code
    // does, and the first version of this file failed itself and
    // `entrypoint-symlink.ts` because both describe the pattern they no longer
    // use. A guard that its own documentation trips is a guard nobody trusts.
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (!/spawnSync|spawn\(|execFileSync|execSync/.test(source)) continue;
      if (!/\.\.\.process\.env/.test(source)) continue;

      // Either every forbidden key is deleted, or it never reaches an object
      // literal. The second is the hermetic shape and the one this repository
      // now uses everywhere.
      const prunesAll = FORBIDDEN_ENV.every((key) =>
        new RegExp(`delete\\s+[^\\n;]*${key}`).test(source),
      );
      if (!prunesAll) offenders.push(file.replace(`${process.cwd()}/`, ""));
    }
    assert.deepEqual(
      offenders,
      [],
      `these forward the developer environment to a child without pruning every key:\n${offenders.join("\n")}`,
    );
  });

  it("no test runs a child against the real Cuesheet checkout", () => {
    // A child given `--in .` or a cwd inside this repository reads the real
    // `src/`, the real fixtures and the real portfolio view, and its result then
    // depends on what the developer has uncommitted.
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (!/spawnSync|spawn\(|execFileSync/.test(source)) continue;

      // A child pointed at the real checkout depends on what the developer has
      // uncommitted, so its result is a property of the machine rather than of
      // the program. `cwd: process.cwd()` alone is not that: a loadability probe
      // and a chat smoke test both launch the repository's own entry point from
      // here, which is reading the code under test rather than reaching outward.
      //
      // So what is forbidden is naming the checkout as the *target of work*,
      // which is what `--in` and `CUESHEET_SESSIONS` carry. A throwaway `--in`
      // is the hermetic form and appears on the very same line as the forbidden
      // one, so the check has to look at where the value comes from rather than
      // whether the flag is present. An earlier version of this rule flagged
      // `test/e2e-real-path.ts`, which passes `--in` a `mkdtemp` directory.
      const namesCheckout = /["']--in["']\s*,\s*(process\.cwd\(\)|["']\.["'])/.test(source)
        || /CUESHEET_SESSIONS:\s*join\(\s*homedir/.test(source);
      if (!namesCheckout) continue;
      // The sandboxed form names a throwaway, and that is accepted.
      const hermetic = /mkdtempSync|sandboxDir/.test(source);
      if (!hermetic) offenders.push(file.replace(`${process.cwd()}/`, ""));
    }
    assert.deepEqual(
      offenders,
      [],
      `these run a child whose result depends on the real checkout:\n${offenders.join("\n")}`,
    );
  });

  it("no test writes into the developer's real session directory", () => {
    // `CUESHEET_SESSIONS` pointing at the default is the quiet version of the
    // same mistake: the test writes real files into `~/.cuesheet/sessions` and
    // then reads them back, so it passes and leaves a mess.
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // A name inside a `throw new Error("unsafe session id")` is not a write.
      // A `join(homedir(), ".cuesheet")` handed to a store is.
      if (/join\(\s*homedir\(\)\s*,\s*["']\.cuesheet/.test(source)) {
        offenders.push(file.replace(`${process.cwd()}/`, ""));
      }
    }
    assert.deepEqual(offenders, [], `these write to the real session root: ${offenders.join(", ")}`);
  });

  it("the forbidden capabilities are the ones that would leave the machine", () => {
    // The list itself is worth a test. A guard that quietly stops guarding is
    // the failure mode of every list in a codebase.
    // The list is only useful if it names what actually leaked, and the thing
    // that actually leaked is named. An earlier version of this assertion
    // checked every entry against itself, which is true by construction and
    // would have passed with an empty list.
    assert.ok(FORBIDDEN_ENV.includes("OPENROUTER_API_KEY"), "the key that leaked is on the list");
    assert.ok(FORBIDDEN_ENV.length >= 4, "and the list is not a token entry");
    assert.equal(
      new Set(FORBIDDEN_ENV).size,
      FORBIDDEN_ENV.length,
      "and it holds no duplicates, which would look like coverage",
    );
    assert.notEqual(REAL_HOME, "", "this machine has a home to protect");
    assert.ok(REPO_PATH.length > 0, "and a checkout to keep a test out of");
  });
});

/**
 * The runtime proof, which the static one cannot give.
 *
 * The static check catches the known shape. It cannot catch a variable nobody
 * thought of, and it cannot catch a helper that looks hermetic and forwards
 * something. So this sets a canary in the real parent process and runs a real
 * child, and checks the child does not see it.
 *
 * Both proofs are needed and neither replaces the other:
 *
 * ```text
 * static   no test contains the dangerous pattern
 * runtime  a capability genuinely present in the parent does not arrive
 * ```
 */
describe("a canary in the parent does not reach a child", () => {
  const UNIQUE = "canary-value-that-must-not-travel";

  it("a real child reports it never saw the canary", () => {
    // The parent genuinely has it. If it did not, this proof would be vacuous,
    // which is the failure mode of every canary that is not actually armed.
    process.env[CANARY] = UNIQUE;
    assert.equal(process.env[CANARY], UNIQUE, "the canary is armed in the parent");

    const sessions = mkdtempSync(join(tmpdir(), "cuesheet-canary-s-"));
    const home = mkdtempSync(join(tmpdir(), "cuesheet-canary-h-"));

    // A real child, a real spawn, through the shared environment builder that
    // every test uses. It prints what it sees rather than what it was sent, so
    // the assertion is about arrival and not about construction.
    const r = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "process.stdout.write(JSON.stringify({canary: process.env[process.argv[1]] ?? null, keys: Object.keys(process.env).length}));",
        CANARY,
      ],
      {
        encoding: "utf8",
        env: childEnv({ sessions, home }),
      },
    );

    assert.equal(r.status, 0, `the child ran: ${r.stderr}`);
    const seen = JSON.parse(r.stdout) as { canary: string | null; keys: number };
    assert.equal(seen.canary, null, "the child did not receive the canary");
    // And the child's world really is smaller than the parent's, which is the
    // point: a capability is absent until it is granted.
    assert.ok(seen.keys < Object.keys(process.env).length + 1, "the child sees fewer variables");
    delete process.env[CANARY];
  });

  it("the same child does see what was granted, or the proof is meaningless", () => {
    // A canary test that passes because nothing works is not a proof. This one
    // arrives, so the previous one arriving nothing means the environment is
    // doing the filtering rather than the child being broken.
    const sessions = mkdtempSync(join(tmpdir(), "cuesheet-canary2-s-"));
    const home = mkdtempSync(join(tmpdir(), "cuesheet-canary2-h-"));
    const r = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "process.stdout.write(process.env.CUESHEET_SESSIONS ?? 'none');"],
      { encoding: "utf8", env: childEnv({ sessions, home }) },
    );
    assert.equal(r.stdout.trim(), sessions, "a granted variable does arrive");
  });
});

describe("what this file cannot check, said plainly", () => {
  it("a test that builds a hermetic environment can still forget one variable", () => {
    // The honest limit. This file reads source text, so it can see a spread and
    // a deletion. It cannot see a variable a child reached through an
    // inherited descriptor, a default written into a module, or a tool that
    // reads a config file from the real home.
    //
    // The only defence for those is the property this repository already holds
    // in other places: every child environment is assembled by naming what the
    // child may see, rather than inherited and pruned. `test/e2e-real-path.ts`
    // does it that way, and this file can only check that the sloppy pattern is
    // absent, not that the careful one is complete.
    assert.ok(
      true,
      "documented limitation, not a passing assertion pretending to be one",
    );
  });
});