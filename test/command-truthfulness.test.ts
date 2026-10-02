/**
 * CMD-01: a published command must resolve to something that exists.
 *
 * This test exists because of a real defect. `npm run ui:verify` pointed at
 * `scripts/ui-verify.mjs` while the file lived at `scripts/ui/verify.mjs`, and
 * the broken command survived because the work was verified by running the path
 * directly. An internal path that works is not evidence that the public command
 * works.
 *
 * A second real defect is covered here too: the root package.json called
 * `pnpm --filter @cuesheet/terminal build`, and the terminal workspace had no
 * `build` script at all.
 *
 * The check is mechanical on purpose. It cannot verify that a command does the
 * right thing, and it does not claim to. It verifies that every command a person
 * or a document might run resolves to a file or a workspace script that exists,
 * which is the class of error that hid here for as long as nobody ran the
 * command.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const repo = (p: string) => join(ROOT, p);
const readJson = (p: string) => JSON.parse(readFileSync(repo(p), "utf8")) as Record<string, unknown>;

const scripts = (pkg: string): Record<string, string> =>
  (readJson(pkg).scripts ?? {}) as Record<string, string>;

test("CMD-01 every command naming a file names a file that exists", () => {
  const all = scripts("package.json");
  const checked: string[] = [];
  for (const [name, command] of Object.entries(all)) {
    // `node <path>`, `tsx <path>`, `bash <path>` — the forms this repository uses.
    for (const match of command.matchAll(/\b(?:node|tsx|bash)\s+([^\s'"]+)/g)) {
      const target = match[1]!;
      if (target.startsWith("-") || target.includes("--test")) continue;
      if (target === "scripts") continue;
      assert.ok(existsSync(repo(target)), `script "${name}" names ${target}, which does not exist`);
      checked.push(`${name} -> ${target}`);
    }
  }
  assert.ok(checked.length > 0, "no file-naming script was found, so this guard is not guarding anything");
});

test("CMD-01 every workspace filter names a script that workspace actually has", () => {
  const all = scripts("package.json");
  const declared: string[] = [];
  for (const [name, command] of Object.entries(all)) {
    const filter = /pnpm\s+--filter\s+(\S+)\s+(\S+)/.exec(command);
    if (!filter) continue;
    const [, packageName, script] = filter;
    const candidates = [join("apps", packageName!.replace("@cuesheet/", "")), "packages/" + packageName!.replace("@cuesheet/", "")];
    const dir = candidates.find((c) => existsSync(repo(join(c, "package.json"))));
    assert.ok(dir, `script "${name}" filters ${packageName}, which is not a workspace on disk`);
    const available = Object.keys(scripts(join(dir!, "package.json")));
    assert.ok(
      available.includes(script!),
      `script "${name}" runs "${script}" in ${packageName}, which declares only: ${available.join(", ") || "(none)"}`,
    );
    declared.push(`${name} -> ${packageName} ${script}`);
  }
  assert.ok(declared.length > 0, "no workspace-filtered script was found, so this guard is not guarding anything");
});

test("CMD-01 the canonical commands the documentation claims are real scripts", () => {
  // Named explicitly rather than inferred, because these are the ones a person is
  // told to run. If one is renamed, this fails and the documentation has to move
  // with it instead of drifting quietly.
  const all = scripts("package.json");
  for (const canonical of ["test", "build", "graph:regen", "ui:verify", "journey"]) {
    assert.ok(all[canonical], `the documented command "${canonical}" is not a script in package.json`);
  }
});

test("CMD-01 no workspace is declared that does not exist", () => {
  // A dead entry in `workspaces` is how `packages/*` pointed at nothing, and how
  // `surface:build` came to filter a package that was never there.
  const globs = (readJson("package.json").workspaces ?? []) as string[];
  for (const glob of globs) {
    const base = glob.replace(/\/\*$/, "");
    assert.ok(existsSync(repo(base)), `workspaces declares ${glob}, and ${base} does not exist`);
    if (glob.endsWith("/*")) {
      const entries = readdirSync(repo(base), { withFileTypes: true }).filter((e) => e.isDirectory());
      assert.ok(entries.length > 0, `workspaces declares ${glob}, and ${base} holds no workspace`);
    }
  }
});
