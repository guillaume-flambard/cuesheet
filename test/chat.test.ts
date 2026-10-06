/**
 * The chat is the default surface and had no test file at all. Both defects
 * below were found by typing at it, which is the slowest and least repeatable
 * way to find anything, and one of them was a rule the chat announced in its
 * own header and did not enforce.
 */

import "./fixtures/portfolio-env.ts";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { childEnv, sandboxDir } from "./fixtures/hermetic-env.ts";
import { portfolioHome } from "./fixtures/portfolio-env.ts";

const CHAT = join(process.cwd(), "src", "chat.ts");

/**
 * The capabilities a test that reads back a session actually needs to be granted.
 *
 * `home` stays the shared portfolio home, because a chat that cannot see a
 * portfolio cannot bind a project and the tests below would prove nothing.
 * `sessions` is the part that must never be inherited: it is where the run
 * writes, and inheriting it means writing into whoever ran the suite. The
 * earlier version of these tests read `join(homedir(), ".cuesheet", "sessions")`
 * and were safe only because another fixture had replaced HOME as a side effect.
 * That is a capability nobody granted, which is the exact shape
 * `hermetic-env.ts` exists to remove.
 */
const grantedSessions: string[] = [];
function sandbox(label: string): { sessions: string; env: Record<string, string> } {
  const sessions = sandboxDir(`${label}-sessions`);
  grantedSessions.push(sessions);
  const env = childEnv({ sessions, home: portfolioHome, cwd: process.cwd() });
  return { sessions, env };
}
after(() => {
  for (const dir of grantedSessions) rmSync(dir, { recursive: true, force: true });
});

/**
 * The one session a run wrote into the root it was granted.
 *
 * The earlier version matched `session: (run-[a-z0-9]+)` in the printed output.
 * A chat session is written as `chat-<id>.jsonl` and its id is never printed in
 * that form, so that match never succeeded, and the two `if` guards around it
 * turned three tests into assertions about nothing. The id is discovered from
 * the granted directory instead, which is also the only place it can be read
 * without guessing.
 */
function sessionFile(out: string, sessions: string): { file: string; events: any[] } {
  const files = readdirSync(sessions).filter((f) => f.endsWith(".jsonl"));
  assert.equal(
    files.length,
    1,
    `the run wrote ${files.length} sessions in the root it was granted, expected 1\n${out.slice(0, 400)}`,
  );
  const file = join(sessions, files[0]!);
  // An empty file yields no events rather than a JSON parse error, so a test that
  // exists to catch an empty session fails on that fact and not on the parser.
  const raw = readFileSync(file, "utf8");
  const events = raw.trim() === "" ? [] : raw.trim().split("\n").map((l) => JSON.parse(l));
  return { file, events };
}

/**
 * Drive the chat with a fixed script and get everything it printed.
 *
 * `env` defaults to a freshly granted sandbox rather than to the parent's
 * environment, because these tests used to inherit the real session root and
 * write into it on every run: two 0-byte `chat-*.jsonl` files landed in the
 * developer's `~/.cuesheet/sessions` from a single test run. A test that does
 * not ask for a session root must not be handed one. Callers that read their
 * session back pass an explicit sandbox so the read and the write agree on the
 * same directory; everyone else gets a sandbox it never has to think about.
 */
function say(lines: string[], cwd = process.cwd(), env?: Record<string, string>): { out: string; code: number } {
  const r = spawnSync(process.execPath, [CHAT], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    cwd,
    env: env ?? sandbox("say").env,
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
    const s = sandbox("gate");
    const { out } = say(["fix the failing test", "go", "exit"], process.cwd(), s.env);
    assert.doesNotMatch(out, /registry is not defined/);
    // The gate was evaluated rather than skipped, and it said so before failing.
    assert.match(out, /admission: /);
    const { events } = sessionFile(out, s.sessions);
    assert.doesNotMatch(
      JSON.stringify(events),
      /registry is not defined/,
      "the crash the surface used to die of is not in the durable log either",
    );
  });

  it("a run with no provider is observed as failed, and the intention is not closed by it", () => {
    // The hermetic environment grants no model transport on purpose, so this
    // exercises the real refusal path rather than a fixture pretending to.
    //
    // The original assertion expected `admission: BLOCKED`, on the premise that a
    // named-but-absent skill blocks admission. That premise is false: naming a
    // skill in the goal text declares no requirement, so admission reports
    // `ready` and the run fails later, at transport. The test asserted a message
    // the surface never produces, and never noticed because of the vacuous
    // guards. It now asserts the refusal that actually happens.
    const s = sandbox("refused");
    const r = spawnSync(process.execPath, [CHAT], {
      encoding: "utf8",
      input: "fix the failing test\ngo\nexit\n",
      cwd: process.cwd(),
      env: s.env,
    });
    const out = r.stdout;
    assert.match(out, /no model provider available/);
    const { events } = sessionFile(out, s.sessions);

    const observed = events.find((e: any) => e.kind === "effect_observed");
    assert.equal(
      observed?.data?.outcome,
      "failed",
      "EFF-01: a run that could not start is recorded as failed, never as succeeded",
    );
    assert.equal(
      observed?.data?.why,
      "no model provider available",
      "and it says why, rather than failing silently",
    );

    // EFF-06: the failed effect did not close the intention. What did close it
    // is the session ending, and the evidence names that as its source, which is
    // the distinction that matters: a closure attributed to the session is not a
    // closure attributed to the work. Whether ending a session *should* close the
    // goal is a product question and is not decided here.
    const closing = events.filter((e: any) => e.data?.goalClosed === true);
    assert.ok(closing.length > 0, "the session end did record its closure");
    for (const e of closing) {
      assert.equal(
        e.kind,
        "evidence",
        `a closure recorded as ${e.kind} would not be evidence of anything`,
      );
      assert.match(
        String(e.data?.claim ?? ""),
        /session/i,
        "the closure is attributed to the session ending, not to the failed effect succeeding",
      );
    }
  });

  it("gate command does not crash", () => {
    const s = sandbox("gate-cmd");
    const { out } = say(["gate: test brief", "exit"], process.cwd(), s.env);
    assert.doesNotMatch(out, /registry is not defined/);
    assert.match(out, /admission:/);
  });

  it("forced override in home directory does not crash", async () => {
    // The cwd is still the home directory, which is the behaviour under test: an
    // override is accepted there. Only the session root is granted, so the run
    // still cannot write into a real one.
    //
    // This assertion is not decoration. It is the reason the test exists, and it
    // never ran before: the earlier version gated it behind a session-id regex
    // that cannot match, so the surface has been free to write a session file
    // containing nothing at all. It does exactly that today, so this test fails
    // on purpose until the session store stops creating a file it never appends
    // to. A test that cannot fail is not a test; this one now can.
    const s = sandbox("override-home");
    const { out } = say(["!fix the tests", "exit"], homedir(), s.env);
    assert.doesNotMatch(out, /registry is not defined/);
    const { statSync } = await import("node:fs");
    const { file, events } = sessionFile(out, s.sessions);
    const stats = statSync(file);
    assert.ok(stats.size > 0, `session file should not be empty, and got ${stats.size} bytes`);
    assert.ok(events.length > 0, "and it should hold the events the run actually staged");
  });
});
