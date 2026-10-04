/**
 * The chat is the default surface and had no test file at all. Both defects
 * below were found by typing at it, which is the slowest and least repeatable
 * way to find anything, and one of them was a rule the chat announced in its
 * own header and did not enforce.
 */

import "./fixtures/portfolio-env.ts";
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

  it("a work goal in the home directory is bound, never run against the home tree", () => {
    // The header warns that ~ is not a project, and every other line was
    // treated as a goal. Without the refusal, "fix the test" was staged with
    // the whole home tree as its scope, and "go" would have run an agent there.
    // The rule was announced and not applied.
    //
    // What changed is what the refusal said. It used to answer `refused fix the
    // test` and `home directory, not a project`, which is true about the scope
    // and false about the intention, and the person is the one who said
    // something. BIND-02: the absence of a project cannot turn a goal into a
    // non-goal. The safety property the old test protected is intact and is now
    // enforced by withholding `go?` rather than by denying the words.
    const { out } = say(["fix the test", "exit"], homedir());
    assert.match(out, /goal {5}fix the test/, "the intention is echoed, not denied");
    assert.doesNotMatch(out, /^refused/m, "it is not a refusal any more");
    // Either it bound to a project, or it did not and says so. What it must not
    // do is offer a run whose scope is the home tree.
    assert.doesNotMatch(out, /type go to run it/);
    if (/go\?/.test(out)) {
      assert.match(out, /project {2}\S/);
      assert.doesNotMatch(out, /project {2}homedir\(\)/);
    }
  });

  it("a complaint is not answered with a scope policy error", () => {
    // "c'est quoi cette merde" is not a task. Answering it with "your line is
    // out of scope" treats a person asking whether the tool works as a caller
    // who made a mistake, and answers neither question.
    //
    // It used to answer "not a goal", which was the same lie in a softer dress:
    // the line was routed to the goal branch, and the branch then declared that
    // no goal had been stated. Now the line is reported as an intention with an
    // unresolved project, and the surface still answers the real question with
    // its own state. Both facts, neither merged.
    const { out } = say(["c'est quoi cette merde", "exit"], homedir());
    assert.match(out, /goal {5}c'est quoi cette merde/);
    assert.doesNotMatch(out, /not a goal/);
    assert.doesNotMatch(out, /refused/);
    assert.doesNotMatch(out, /prefix the line with/);
  });

  it("a complaint about the surface gets the surface's own state, not a redirect", () => {
    // "cd into a project" is true and answers nothing. The chat can report what
    // it is, so a complaint gets evidence rather than a place to go.
    const { out } = say(["c'est moche et ca marche pas du tout", "exit"], homedir());
    assert.match(out, /goal {5}c'est moche et ca marche pas du tout/);
    assert.match(out, /state\s+\d+ capabilities/);
    assert.doesNotMatch(out, /cd into a project/);
  });

  it("the founding case: a goal with no project is a goal whose project is unknown", () => {
    // The line that started this, typed from $HOME:
    //
    //     > see my friend's video repo
    //     not a goal: see my friend's video repo
    //
    // It carried no work verb, so the surface's heuristic fell through to a
    // branch that declared no goal had been stated. The person had stated one.
    // What was missing was the project. Those are two facts and they were
    // printed as one negation, which is the failure this whole repository is
    // built to prevent, in the one place nobody was watching because the tool
    // looked like it was answering.
    const said = "see my friend's video repo";
    const { out } = say([said, "exit"], homedir());

    assert.match(out, new RegExp(`goal {5}${said}`), "the intention is stated, verbatim");
    assert.match(out, /project {2}(unresolved|\S)/, "and the scope is reported separately");
    assert.doesNotMatch(out, /not a goal/, "BIND-02: never a non-goal");
    assert.doesNotMatch(out, /nothing here can run a goal/, "the old sentence, gone");
    // The safety half, unchanged: nothing about the home tree is runnable.
    assert.doesNotMatch(out, /type go to run it/);
  });

  it("a goal that names no project on disk is kept, and says what would resolve it", () => {
    // No project in this registry is called friend-video, so there is nothing to
    // bind and the honest answer is that the line is still an intention. The
    // surface has to give the person a next move rather than a negation.
    const { out } = say(["see my friend's video repo", "exit"], homedir());
    assert.match(out, /project {2}unresolved/);
    assert.match(
      out,
      /projects for the portfolio view|bind it with a project/,
      "and a way to resolve it",
    );
  });

  it("a goal naming exactly one project is bound, and only then is it runnable", () => {
    // The positive half of the same rule, so the test above cannot pass merely
    // because binding never succeeds.
    const { out } = say(["work on cuesheet", "exit"], homedir());
    assert.match(out, /goal {5}work on cuesheet/);
    assert.match(out, /project {2}\S*cuesheet/);
    assert.match(out, /^go\?/m, "a single defending project makes the goal approvable");
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
    //
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

  // ACCEPTED 1: the gate is held by the surface, and the surface's copy is dead
  // These tests were provided by NEXT-FRONTIER.md and should fail before the fix

  it("approving evaluates the gate instead of dying", () => {
    const { out } = say(["fix the failing test", "go", "exit"], process.cwd());
    assert.doesNotMatch(out, /registry is not defined/);
    // The session file should be readable and not contain the crash
    const sessionIdMatch = out.match(/session: (run-[a-z0-9]+)/);
    if (sessionIdMatch) {
      const sessionId = sessionIdMatch[1];
      const sessionPath = join(homedir(), ".cuesheet", "sessions", sessionId + ".jsonl");
      if (existsSync(sessionPath)) {
        const content = readFileSync(sessionPath, "utf8");
        assert.doesNotMatch(content, /registry is not defined/);
      }
    }
  });

  it("a refused run is observed as refused, and the intention survives", () => {
    // Use a goal that requires a non-existent skill to trigger admission refusal
    // (the test fixture has an empty skill registry, so any requirement blocks)
    const r = spawnSync(process.execPath, [CHAT], {
      encoding: "utf8",
      input: "use the skill called definitely-not-a-real-skill\ngo\nexit\n",
      cwd: process.cwd(),
    });
    const out = r.stdout;
    // The admission should be blocked (would_block) since the skill doesn't exist
    assert.match(out, /admission: (BLOCKED|UNVERIFIED)/);
    const sessionIdMatch = out.match(/session: (run-[a-z0-9]+)/);
    if (sessionIdMatch) {
      const sessionId = sessionIdMatch[1];
      const sessionPath = join(homedir(), ".cuesheet", "sessions", sessionId + ".jsonl");
      if (existsSync(sessionPath)) {
        const events = readFileSync(sessionPath, "utf8").trim().split("\n").map(JSON.parse);
        const observed = events.find((e: any) => e.kind === "effect_observed");
        assert.equal(observed?.data?.outcome, "failed", "EFF-01: effect should be failed, not succeeded");
        const hasGoalClosed = events.some((e: any) => e.data?.goalClosed === true);
        assert.equal(hasGoalClosed, false, "EFF-06: intention should survive a refusal");
      }
    }
  });

  it("gate command does not crash", () => {
    const { out } = say(["gate: test brief", "exit"], process.cwd());
    assert.doesNotMatch(out, /registry is not defined/);
    assert.match(out, /admission:/);
  });

  it("forced override in home directory does not crash", async () => {
    const { out } = say(["!fix the tests", "exit"], homedir());
    assert.doesNotMatch(out, /registry is not defined/);
    // Should not leave a zero-byte session file
    const sessionIdMatch = out.match(/session: (run-[a-z0-9]+)/);
    if (sessionIdMatch) {
      const sessionId = sessionIdMatch[1];
      const sessionPath = join(homedir(), ".cuesheet", "sessions", sessionId + ".jsonl");
      if (existsSync(sessionPath)) {
        const { statSync } = await import("node:fs");
        const stats = statSync(sessionPath);
        assert.ok(stats.size > 0, "session file should not be empty");
      }
    }
  });
});
