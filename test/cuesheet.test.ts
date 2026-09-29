import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const ENTRY = join(process.cwd(), "src", "cuesheet.ts");
const run = (args: string[]) =>
  spawnSync(process.execPath, [ENTRY, ...args], { encoding: "utf8" });

describe("cuesheet dispatcher", () => {
  it("no command opens the chat, and a closed stdin leaves it cleanly", () => {
    const r = spawnSync(process.execPath, [ENTRY], { encoding: "utf8", input: "" });
    assert.equal(r.status, 0, "stdin EOF is a clean exit, not a crash");
    assert.match(r.stdout, /cuesheet chat/);
    assert.match(r.stdout, /every line is an intention/);
  });

  it("an unknown command names it and exits 2", () => {
    const r = run(["definitely-not-a-command"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown command "definitely-not-a-command"/);
  });

  it("the usage lists every subcommand with its purpose, chat included", () => {
    const r = run(["definitely-not-a-command"]);
    for (const name of ["projects", "gate", "run", "resume", "sessions", "inspect", "capabilities", "frontier", "chat"]) {
      assert.match(r.stdout, new RegExp(`^  ${name}`, "m"), `missing subcommand: ${name}`);
    }
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
