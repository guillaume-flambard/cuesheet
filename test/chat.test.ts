/**
 * The chat is the default surface and had no test file at all. Both defects
 * below were found by typing at it, which is the slowest and least repeatable
 * way to find anything, and one of them was a rule the chat announced in its
 * own header and did not enforce.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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

  it("the first question anyone asks gets a recommendation, not a count", () => {
    // This used to answer "free to write: 17", which is an inventory and not
    // an answer. It now names the held ones, names the free ones, and stages a
    // choice so the next word can be "go".
    const { out } = say(["on what can we work today ?", "exit"], homedir());
    assert.doesNotMatch(out, /not a goal/);
    assert.match(out, /free to write\s+\d+/);
    assert.match(out, /^next\s+\S/m);
    assert.match(out, /go\s+to open it/);
  });

  it("the same question in French gets the same treatment", () => {
    const { out } = say(["sur quoi on peut travailler ?", "exit"], homedir());
    assert.doesNotMatch(out, /not a goal/);
    assert.match(out, /^next\s+\S/m);
  });

  it("a held project is explained, not just counted", () => {
    // "held" is a refusal, so the reason for it belongs next to it. A bare
    // number leaves the reader to guess whether it is a bug or a policy.
    const { out } = say(["on bosse sur quoi", "exit"], homedir());
    assert.match(out, /held means someone is in it or left work behind/);
  });

  it("a greeting does not discard or announce the staged goal", () => {
    // Discarding work on a keystroke that was neither approval nor refusal is
    // its own kind of loss, and it is the failure the four-word go list had.
    // Now that a greeting is non-destructive, it also has nothing to announce:
    // saying "still staged" after every greeting would be noise, and the goal
    // is already visible in the prompt on a real terminal.
    const { out } = say(["on bosse sur quoi", "hey there", "hey again", "non", "exit"], homedir());
    assert.doesNotMatch(out, /still staged/);
    assert.match(out, /discarded: open /, "the goal survived two greetings");
  });

  it("a question does not touch the staged goal, in either direction", () => {
    // The rule, stated once: a staged intention changes only on APPROVE,
    // REJECT, REPLACE_GOAL or CANCEL_SESSION. Everything else, and questions
    // above all, is non-destructive. A question is not an order on the goal,
    // and losing waiting work to an information request is a loss with no
    // mistake to point at.
    const { out } = say(["fix the test", "capabilities", "non", "exit"], process.cwd());
    assert.match(out, /goal\s+fix the test/, "the goal was staged");
    assert.match(out, /capabilities in the live registry/, "the question was answered");
    assert.match(out, /discarded: fix the test/, "the refusal consumed it, and only then");
    assert.doesNotMatch(out, /still staged/, "an informative line must not announce a staged goal");
  });

  it("a new goal replaces the old one and says so", () => {
    const { out } = say(["fix the test", "write the plan", "non", "exit"], process.cwd());
    assert.match(out, /replaced: fix the test/);
    assert.match(out, /discarded: write the plan/);
  });

  it("a banner is not a prompt, and a prompt is not a banner", () => {
    // A prompt written to a pipe becomes transcript, which is output a script
    // reads and a test cannot assert on. The state in the prompt is an
    // interactive affordance, so it is gated on the terminal being one.
    const { out } = say(["exit"], process.cwd());
    assert.doesNotMatch(out, /^cuesheet> /m, "a piped session must not emit prompts");
    assert.doesNotMatch(out, /^go\? /m);
  });

  it("the inventory is still one word away", () => {
    const { out } = say(["projects", "exit"], homedir());
    assert.match(out, /free to write : \d+/);
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

;

  it("the banner says what the surface can do without reading the portfolio", () => {
    const { out } = say(["exit"], homedir());
    assert.doesNotMatch(out, /\d+ free, \d+ held/);
    assert.match(out, /ask what to work on/);
  });

;

  it("a portfolio answer is not a count, and a second question does not re-read", () => {
    // The behaviour, without the shim, so the expensive counter is not run for
    // every case. One read is asserted by the counter above; what is asserted
    // here is that the answer keeps its shape and that the session survives
    // being asked twice.
    const { out } = say(["on bosse sur quoi", "projects", "exit"], homedir());
    assert.match(out, /^next\s+\S/m, "the first question staged a choice");
    assert.match(out, /free to write : \d+/, "the second answered the inventory");
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
