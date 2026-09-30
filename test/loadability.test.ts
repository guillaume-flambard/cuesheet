/**
 * Everything that ships has to load.
 *
 * This file exists because of an orphaned brace. While replacing the staged
 * branch in chat.ts I removed a `switch` and left its closing brace behind, so
 * the module stopped parsing, and the suite stayed green: every chat test
 * spawns the chat as a process and none of them said so, because they asserted
 * on the output of a run that never happened.
 *
 * So the gap was not "a test missed a bug". The gap was that a file that cannot
 * be loaded had no test at all. A suite that spawns subprocesses reports a
 * crashed entry point as an empty string, and an empty string does not match
 * anything.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/**
 * Every .ts file under src, recursively.
 *
 * Recursive because the core lives in `src/core` and the adapters in
 * `src/adapters`. A flat scan of `src` finds only the entry points, which
 * would have made LOAD-01 pass while saying nothing about the modules a
 * surface imports. That mistake was made while writing this file: the first
 * version listed `capability.ts` as if it were a sibling of `chat.ts`.
 */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sources(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const entrypoints = sources(SRC);

/**
 * One rule this file learned while being written, from the affordances work:
 *
 * > A probe must not hand-build a state the module already knows how to build.
 *
 * The first version of LOAD-03 listed `capability.ts` as if it were a sibling
 * of `chat.ts`, so the probe reported eight modules missing when they are all
 * in `src/core`. And while chasing the affordances bug I concluded the runtime
 * was broken when the fault was a hand-written `observed:` where the module
 * reads `known:`. Both times the probe was measuring a world that could not
 * exist, and both times the conclusion was confident and wrong.
 */
describe("loadability", () => {
  it("LOAD-01 every module under src parses and imports", () => {
    // The check that would have caught the orphaned brace. It imports rather
    // than reads, because a file can be syntactically fine and still fail on
    // an import that does not resolve.
    for (const file of entrypoints) {
      const r = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", `await import(${JSON.stringify(file)});`],
        { encoding: "utf8" },
      );
      assert.equal(
        r.status,
        0,
        `${file} does not load:\n${r.stderr.split("\n").slice(0, 4).join("\n")}`,
      );
    }
  });

  it("LOAD-01b the package entry point named in the README exists and loads", () => {
    // The README and the shim both point at src/cuesheet.ts. If that path is
    // wrong, a command on PATH fails for the person who installed it.
    const shim = readdirSync(join(ROOT, "bin"))[0]!;
    assert.ok(shim, "bin/ must not be empty");
    const entry = join(SRC, "cuesheet.ts");
    assert.ok(entry.endsWith("cuesheet.ts"));
    const r = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(entry)});`],
      { encoding: "utf8", input: "" },
    );
    assert.equal(r.status, 0, `the entry point does not load:\n${r.stderr}`);
  });

  it("LOAD-02 the CLI answers for help without observing the world", () => {
    // A help screen is the first thing a person and the first thing a script
    // ask for. It must not read git, a registry or a portfolio, both because
    // that is slow and because a help screen that can fail on an unrelated
    // machine-specific error is not help.
    for (const flag of ["--help", "-h"]) {
      const r = spawnSync(process.execPath, [join(SRC, "cuesheet.ts"), flag], {
        encoding: "utf8",
      });
      assert.equal(r.status, 0, `${flag} exited ${r.status}`);
      assert.match(r.stdout, /Subcommands:/, `${flag} printed no command list`);
      assert.doesNotMatch(r.stderr, /ENOENT|EACCES|not found/i, `${flag} reached the disk`);
    }
  });

  it("LOAD-02b help is available for every declared subcommand", () => {
    const help = spawnSync(process.execPath, [join(SRC, "cuesheet.ts"), "--help"], {
      encoding: "utf8",
    });
    const declared = [...help.stdout.matchAll(/^  (\w[\w-]*)\s+\S/gm)].map((m) => m[1]!);
    assert.ok(declared.length > 0, "no subcommand was declared");
    for (const name of declared) {
      if (name === "version") continue;
      const r = spawnSync(
        process.execPath,
        [join(SRC, "cuesheet.ts"), name, "--help"],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 0, `${name} --help exited ${r.status}`);
      assert.match(r.stdout, new RegExp(`cuesheet ${name}`), `${name} --help described nothing`);
    }
  });

  it("LOAD-03 the module surface is reachable from the entry point", () => {
    // The pieces a later surface would import, imported the way that surface
    // would import them. A refactor that leaves a module unreachable is legal
    // and useless, and this is the test that says so.
    const probe = `
      for (const file of ${JSON.stringify(entrypoints)}) {
        await import("file://" + file);
      }
    `;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `a core module is not reachable:\n${r.stderr}`);
  });

  it("the chat entry point is what the tests have been spawning", () => {
    // The 18 chat tests spawn a real chat per case. If that path silently
    // stopped being a chat, they would all pass on empty output, which is
    // what happened with the orphaned brace.
    const r = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(join(SRC, "chat.ts"))});`],
      { encoding: "utf8", input: "exit\n" },
    );
    assert.equal(r.status, 0, `chat.ts does not load:\n${r.stderr}`);
  });
});
