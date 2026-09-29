import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const ENTRY = join(process.cwd(), "src", "cuesheet.ts");
const run = (args: string[]) =>
  spawnSync(process.execPath, [ENTRY, ...args], { encoding: "utf8" });

describe("cuesheet dispatcher", () => {
  it("no command opens the chat, and a closed stdin leaves it cleanly", () => {
    const r = spawnSync(process.execPath, [ENTRY], { encoding: "utf8", input: "" });
    assert.equal(r.status, 0, "stdin EOF is a clean exit, not a crash");
    assert.match(r.stdout, /cuesheet chat/);
    assert.match(r.stdout, /a goal is staged and runs when you type go/);
  });

  it("an unknown command names it and exits 2", () => {
    const r = run(["definitely-not-a-command"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown command "definitely-not-a-command"/);
  });

  it("the usage lists every subcommand with its purpose, chat included", () => {
    // Help is a request, so it is answered on stdout with exit 0. It used to
    // be printed on stderr behind an error, which meant asking for help was
    // indistinguishable from getting one.
    const r = run(["--help"]);
    assert.equal(r.status, 0);
    for (const name of ["projects", "gate", "run", "resume", "sessions", "inspect", "capabilities", "frontier", "chat"]) {
      assert.match(r.stdout, new RegExp(`^  ${name}`, "m"), `missing subcommand: ${name}`);
    }
  });

  it("--help on a subcommand describes that subcommand, not the whole tool", () => {
    const r = run(["gate", "--help"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^cuesheet gate/m);
    assert.match(r.stdout, /cuesheet gate --requirements <file>/);
    assert.doesNotMatch(r.stdout, /^  frontier/m, "one command's help lists only that command");
  });

  it("--version prints the version, and it is the one in package.json", () => {
    const r = run(["--version"]);
    assert.equal(r.status, 0);
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    assert.equal(r.stdout.trim(), pkg.version);
  });

  it("a bare invocation is the chat, not the usage text", () => {
    // The chat is the default surface, so no argument means chat. Usage is
    // printed only when help is asked for.
    const r = spawnSync(process.execPath, [ENTRY], { encoding: "utf8", input: "" });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /Subcommands:/);
  });

  it("--format json produces a report a machine can read", () => {
    // A verdict a machine cannot read is a printout, not a verdict. This is
    // what makes the command usable as a sensor rather than something a human
    // has to watch.
    const root = mkdtempSync(join(tmpdir(), "cuesheet-json-"));
    try {
      const repo = join(root, "repo");
      mkdirSync(repo);
      spawnSync("git", ["-C", repo, "init", "-q"], { encoding: "utf8" });
      // `projects` is flag-driven, so the dispatcher does not forward the
      // command name. The invocation matches the documented usage.
      const r = run(["projects", "--root", repo, "--format", "json"]);
      assert.equal(r.status, 0);
      const parsed = JSON.parse(r.stdout) as {
        now: number;
        projects: Array<{
          availability: string;
          unobserved: boolean;
          dirtyFiles: number | null;
          reasons: string[];
        }>;
      };
      assert.equal(typeof parsed.now, "number");
      assert.equal(parsed.projects.length, 1);
      // A freshly initialised repository with nothing committed has no upstream
      // and no dirt, and both are real observations, so they are numbers.
      assert.equal(parsed.projects[0]!.unobserved, false);
      assert.equal(parsed.projects[0]!.dirtyFiles, 0);
      assert.equal(parsed.projects[0]!.availability, "available");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a directory that is not a repository is held, with null counts", () => {
    // The regression this guards: a crashed `git status` used to be counted as
    // zero dirty files, which released a broken checkout to a second writer.
    const root = mkdtempSync(join(tmpdir(), "cuesheet-notrepo-"));
    try {
      const plain = join(root, "plain");
      mkdirSync(plain);
      const r = run(["projects", "--root", plain, "--format", "json"]);
      assert.equal(r.status, 0);
      const parsed = JSON.parse(r.stdout) as {
        projects: Array<{
          availability: string;
          unobserved: boolean;
          dirtyFiles: number | null;
          reasons: string[];
        }>;
      };
      assert.equal(parsed.projects[0]!.unobserved, true);
      assert.equal(parsed.projects[0]!.dirtyFiles, null);
      assert.equal(parsed.projects[0]!.availability, "held");
      assert.match(parsed.projects[0]!.reasons.join(" "), /git status failed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("--format rejects a value it does not know", () => {
    const r = run(["projects", "--root", ".", "--format", "yaml"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--format takes json or text/);
  });

  it("gate passes its exit code through: a missing requirements file is exit 2", () => {
    const r = run(["gate", "--requirements", "/nonexistent/req.json", "--skill-root", "."]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /cannot read requirements file/);
  });

  it("gate passes exit 1 through when the registry refuses a requirement", () => {
    const root = mkdtempSync(join(tmpdir(), "cuesheet-dispatch-"));
    try {
      const req = join(root, "req.json");
      writeFileSync(
        req,
        JSON.stringify({ requirements: [{ kind: "skill", name: "not-a-real-skill-anywhere" }] }),
      );
      // An empty skill root: the registry reads as empty but readable, so the
      // verdict is a real block, not an unverified one.
      const skillRoot = join(root, "skills");
      mkdirSync(skillRoot);
      const r = run(["gate", "--requirements", req, "--skill-root", skillRoot]);
      assert.equal(r.status, 1, "a blocked gate must exit 1 through the dispatcher");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a subcommand-driven CLI receives the command: capabilities resolves", () => {
    // This one touches the machine's live registry, which is the point: the
    // dispatcher is only correct if the command actually reaches the CLI.
    const r = run(["capabilities"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /capabilities in the live registry/);
  });
});
