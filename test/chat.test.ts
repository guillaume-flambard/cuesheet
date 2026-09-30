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
  it("a second greeting does not print the first one's answer again", () => {
    // Two greetings in a row got the identical line twice, which reads as a
    // hang. The check is on the answer not repeating, not on the greeting
    // repeating: "hey" then "hello" are different words and the second one is
    // still a second greeting.
    const { out } = say(["hey", "hello", "hey", "exit"]);
    const answers = out
      .split("\n")
      .filter((l) => l.includes("I answer state questions") || l.includes("still here"));
    assert.equal(answers.length, 3);
    assert.equal(new Set(answers).size, 2, `answers repeated: ${JSON.stringify(answers)}`);
  });

  it("a work goal in the home directory is refused, not staged", () => {
    // The header warns that ~ is not a project, and every other line was
    // treated as a goal. Without the refusal, "fix the test" was staged with
    // the whole home tree as its scope, and "go" would have run an agent there.
    // The rule was announced and not applied.
    const { out } = say(["fix the test", "exit"], homedir());
    assert.match(out, /refused fix the test/);
    assert.match(out, /home directory, not a project/);
    assert.doesNotMatch(out, /type go to run it/);
  });

  it("a complaint is not answered with a scope policy error", () => {
    // "c'est quoi cette merde" is not a task. Answering it with "your line is
    // out of scope" treats a person asking whether the tool works as a caller
    // who made a mistake, and answers neither question.
    const { out } = say(["c'est quoi cette merde", "exit"], homedir());
    assert.match(out, /not a goal/);
    assert.doesNotMatch(out, /refused/);
    assert.doesNotMatch(out, /prefix the line with/);
  });

  it("a complaint about the surface gets the surface's own state, not a redirect", () => {
    // "cd into a project" is true and answers nothing. The chat can report what
    // it is, so a complaint gets evidence rather than a place to go.
    const { out } = say(["c'est moche et ca marche pas du tout", "exit"], homedir());
    assert.match(out, /not a goal/);
    assert.match(out, /that is the whole limit/);
    assert.match(out, /state\s+\d+ capabilities, \d+ unreadable/);
    assert.doesNotMatch(out, /cd into a project/);
  });

  it("the first question anyone asks is answered from state", () => {
    // Opening a work surface and asking what to work on is the entry point,
    // and it is a question rather than a noun, so the keyword pattern above
    // could not reach it.
    const { out } = say(["on what can we work today ?", "exit"], homedir());
    assert.match(out, /free to write : \d+/);
    assert.match(out, /held\s+:/);
    assert.doesNotMatch(out, /not a goal/);
  });

  it("the same question in French is answered from state", () => {
    const { out } = say(["sur quoi on peut travailler ?", "exit"], homedir());
    assert.match(out, /free to write : \d+/);
    assert.doesNotMatch(out, /not a goal/);
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
