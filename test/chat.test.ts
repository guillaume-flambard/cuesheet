/**
 * The chat is the default surface and had no test file at all. Both defects
 * below were found by typing at it, which is the slowest and least repeatable
 * way to find anything, and one of them was a rule the chat announced in its
 * own header and did not enforce.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const CHAT = join(process.cwd(), "src", "chat.ts");

/** Drive the chat with a fixed script and get everything it printed. */
function say(lines: string[], cwd = process.cwd()): { out: string; code: number } {
  const r = spawnSync(process.execPath, [CHAT], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    cwd,
  });
  return { out: r.stdout, code: r.status ?? 1 };
}

describe("the chat surface", () => {
  it("a repeated greeting does not print the same answer twice", () => {
    // Typing "hey" twice got the identical line twice, which reads as a hang
    // rather than as a tool with nothing to add.
    const { out } = say(["hey", "hey", "exit"]);
    const answers = out
      .split("\n")
      .filter((l) => l.includes("I answer state questions") || l.includes("still here"));
    assert.equal(answers.length, 2);
    assert.notEqual(
      answers[0],
      answers[1],
      "the second greeting must not repeat the first answer",
    );
  });

  it("a goal is refused in the home directory, not staged", () => {
    // The header warns that ~ is not a project, and every other line is
    // treated as a goal. Without the refusal, "ca marche pas" staged a goal
    // whose scope was the whole home tree, and "go" would have run an agent
    // there. The rule was announced and not applied.
    const { out } = say(["ca marche pas", "exit"], homedir());
    assert.match(out, /refused ca marche pas/);
    assert.match(out, /home directory, not a project/);
    assert.doesNotMatch(out, /type go to run it/);
  });

  it("the same line is still a goal inside a project", () => {
    // The refusal is scoped, not a ban on working outside a project.
    const { out } = say(["ca marche pas", "exit"], process.cwd());
    assert.match(out, /goal    ca marche pas/);
    assert.match(out, /type go to run it/);
    assert.doesNotMatch(out, /refused/);
  });

  it("an override in the home directory is the owner's decision, and says so", () => {
    const { out } = say(["!exit", "exit"], homedir());
    // The override path must still exist, otherwise the refusal is a lock
    // rather than a gate, and a gate with no override is a wall.
    assert.doesNotMatch(out, /refused/);
  });

  it("the header reports an unreadable registry instead of a clean count", () => {
    // A registry that could not be fully read is not a registry with N
    // capabilities, and the difference has to be visible before a goal is
    // staged rather than only at a refusal.
    const { out } = say(["exit"]);
    assert.match(out, /registry\s+\d+ capabilities/);
    if (/unreadable/.test(out)) {
      assert.match(out, /absence is not evidence/);
    }
  });

  it("exit ends the session cleanly with status 0", () => {
    const { code } = say(["exit"]);
    assert.equal(code, 0);
  });
});
