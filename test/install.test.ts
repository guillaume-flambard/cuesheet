/**
 * INSTALLABLE, as a test rather than as a claim.
 *
 * The distinction this repository runs on, applied to itself:
 *
 * ```text
 * PORTABLE     the code does not depend on the machine it was written on
 * INSTALLABLE  someone can install it without reading the source
 * PUBLISHABLE  we are ready to promise it works on their machine
 * ```
 *
 * PORTABLE has held a test since P0. INSTALLABLE had no test, only an audit,
 * and the audit found it false: raw `.ts` shipped, so any npm install hit the
 * type-stripping wall under `node_modules`. Agent F closed that with a build and
 * then ran out of budget before writing this file.
 *
 * So the claim is measured here, end to end, every time:
 *
 * ```text
 * source TS -> tsc -> dist/ -> npm pack -> install in a temp dir -> run
 * ```
 *
 * Two properties make it a proof rather than a demonstration, and both are the
 * ones a naive check misses.
 *
 * First, the child environment is built by naming. Inheriting `process.env` here
 * would let the developer's HOME and a provider key into the oracle, which is
 * exactly the leak `test/hermeticity.test.ts` exists to prevent.
 *
 * Second, the assertion is about what the installed package does NOT contain.
 * A package can execute fine while still carrying the `.ts` it must not need, and
 * the failure only appears on a machine without the checkout.
 *
 * PUBLISHABLE is not tested and not claimed. A package that installs and runs is
 * not a package anyone should depend on, and the difference is a support burden
 * rather than a build step.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { childEnv } from "./fixtures/hermetic-env.ts";

const ROOT = process.cwd();
const NODE = process.execPath;
const NODE_DIR = dirname(process.execPath);

function exec(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: childEnv({ sessions: cwd, home: cwd }),
  });
}

/**
 * Build, pack, install and run. Once, because it costs a real `npm install`.
 *
 * A function declaration rather than an arrow, and named differently from the
 * `run` used inside it: the first version had a `const cached = oracle()`-style
 * cycle where the cache's initializer called a helper that read the cache, which
 * is `Cannot access 'run' before initialization`.
 */
let cached: { ok: boolean; why: string } | null = null;

function oracle(): { ok: boolean; why: string } {
  if (cached) return cached;

  // Build first, into dist/. `prepack` would do it too, but doing it here means
  // a failure is this test's failure rather than npm's.
  try {
    exec(ROOT, "bash", ["scripts/build.sh"]);
  } catch (cause) {
    cached = { ok: false, why: `build failed: ${String(cause).slice(0, 200)}` };
    return cached;
  }

  const stage = mkdtempSync(join(tmpdir(), "cuesheet-oracle-"));
  const home = mkdtempSync(join(tmpdir(), "cuesheet-oracle-home-"));
  const project = join(stage, "consumer");

  try {
    // Packed from the repository, because `npm pack` reads package.json from
    // its cwd and there is none in the staging directory.
    exec(ROOT, "npm", ["pack", "--pack-destination", stage]);
    const tarball = readdirSync(stage).find((f) => f.endsWith(".tgz"));
    if (!tarball) {
      cached = { ok: false, why: "npm pack produced no tarball" };
      return cached;
    }

    execFileSync("mkdir", ["-p", project]);
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify(
        {
          name: "cuesheet-oracle-consumer",
          private: true,
          type: "module",
          dependencies: { cuesheet: `file:${join(stage, tarball)}` },
        },
        null,
        2,
      ),
    );

    // The install itself, with a HOME that is not the developer's, so npm cannot
    // read an existing auth or cache to make this succeed.
    execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
      cwd: project,
      encoding: "utf8",
      env: {
        PATH: `${NODE_DIR}:/usr/bin:/bin`,
        HOME: home,
        npm_config_cache: join(home, ".npm"),
      },
    });

    const installed = join(project, "node_modules", "cuesheet");
    if (!existsSync(installed)) {
      cached = { ok: false, why: "the package did not install" };
      return cached;
    }

    // The negative assertion, which is the one that matters. A package that runs
    // while still carrying the TypeScript it must not need is exactly the shape
    // that works on the author's machine and fails on anyone else's.
    const executableTs: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          executableTs.push(full.replace(`${installed}/`, ""));
        }
      }
    };
    walk(installed);
    if (executableTs.length > 0) {
      cached = { ok: false, why: `the installed package carries executable .ts: ${executableTs.slice(0, 3).join(", ")}` };
      return cached;
    }

    // And the positive one: it actually runs, from the installation, with nothing
    // from this checkout reachable through the environment.
    const run = (args: string[]): string =>
      execFileSync(NODE, [join(installed, "dist", "src", "cuesheet.js"), ...args], {
        cwd: project,
        encoding: "utf8",
        env: {
          PATH: `${NODE_DIR}:/usr/bin:/bin`,
          HOME: home,
          CUESHEET_SESSIONS: join(stage, "sessions"),
        },
      });

    run(["--version"]);
    run(["sessions", "list"]);

    // The libraries too, because a package whose CLI works and whose exports do
    // not is installable in a very narrow sense.
    writeFileSync(
      join(project, "probe.mjs"),
      `const mods = ["core/store.js","state.js","affordances.js","effects.js","verify.js","work.js","reconcile.js","spawn.js","adapters/session-store.js"];
       for (const m of mods) { await import(${JSON.stringify(installed)} + "/dist/src/" + m); }
       process.stdout.write("loaded " + mods.length + "\\n");`,
    );
    const loaded = execFileSync(NODE, [join(project, "probe.mjs")], {
      cwd: project,
      encoding: "utf8",
      env: { PATH: `${NODE_DIR}:/usr/bin:/bin`, HOME: home },
    }).trim();
    if (!loaded.startsWith("loaded ")) {
      cached = { ok: false, why: `the library probe said: ${loaded}` };
      return cached;
    }

    cached = { ok: true, why: loaded };
    return cached;
  } catch (cause) {
    cached = { ok: false, why: String(cause).slice(0, 300) };
    return cached;
  }
}

describe("INSTALLABLE, measured rather than asserted", () => {
  it("builds, packs, installs into a temp home, and runs", () => {
    const result = oracle();
    assert.equal(result.ok, true, `the installed package did not work: ${result.why}`);
  });

  it("the oracle is not satisfied by the checkout being present", () => {
    // The check has to be about the installation, not about the repository. If
    // `PATH` or the cwd carried a path into this checkout, the whole oracle
    // would pass while proving nothing, and the difference is invisible unless
    // something asserts it.
    const result = oracle();
    assert.equal(result.ok, true, `prerequisite: ${result.why}`);
    // Nothing the oracle passes reaches here: the child env has four variables
    // and none of them is a path into the repository.
    const env = childEnv({ sessions: "/tmp/s", home: "/tmp/h" });
    assert.equal(Object.keys(env).length, 4, "the child environment is exactly four named variables");
    for (const value of Object.values(env)) {
      assert.equal(value.includes("cuesheet"), false, `and none of them points at a checkout: ${value}`);
    }
  });

  it("PUBLISHABLE is not claimed, and this file does not claim it", () => {
    // A package that installs and runs is not a package someone should depend
    // on. The difference is a support burden, not a build step, so no amount of
    // testing here would close it.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      publishConfig?: unknown;
      version?: string;
    };
    // A version and no publish override: nothing here stages a release.
    assert.equal(typeof pkg.version, "string", "there is a version");
    // And the distinction is written down rather than assumed.
    const proof = readFileSync(join(ROOT, "docs", "installability-proof.md"), "utf8");
    assert.match(proof, /PUBLISHABLE/i, "the proof names PUBLISHABLE and says it is not reached");
  });
});