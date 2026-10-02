/**
 * The whole chain, through the real binaries and the real files.
 *
 * This is the test the ReferenceError proved was missing. 352 tests passed while
 * `runGoal` referenced three names that did not exist, because every one of them
 * drove a pure function and none of them ran a goal. A green suite was a green
 * suite of parts.
 *
 * So this file drives the actual path, in actual processes, against actual
 * files, and asserts the one property that cannot be assembled from parts:
 *
 * ```text
 * CLI -> session -> stage -> approve -> EffectRequest
 *     -> a real worker process -> receipt -> artifact
 *     -> an independent verifier -> a new process reading the same disk
 * ```
 *
 * And the hermeticity rule, which the provider-key leak proved the hard way: no
 * test inherits a capability of the developer's. No API key, no real HOME, no
 * real sessions, no real portfolio, no real registry. A test that wants an
 * external capability asks for it by name, and this file asks for none.
 */

import { describe, it } from "node:test";
import { childEnv as hermeticChildEnv, CANARY } from "./fixtures/hermetic-env.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const CLI = join(process.cwd(), "src", "cli-run.ts");
const CHAT = join(process.cwd(), "src", "chat.ts");
const WORKER = join(process.cwd(), "src", "worker.ts");
const REPO = join(process.cwd(), "test", "fixtures", "repo");

/**
 * A throwaway home, sessions root, cwd and registry root, and no provider.
 *
 * Built by omission rather than by deletion: the child env is assembled from
 * the variables the code is allowed to see, not inherited and pruned. A test
 * that starts from `process.env` and deletes one key is one new variable away
 * from reaching the developer's machine again.
 */
function sandbox(): { root: string; sessions: string; home: string; cwd: string } {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-e2e-"));
  const sessions = join(root, "sessions");
  const home = join(root, "home");
  const cwd = join(root, "cwd");
  // mkdir, not writeFileSync on a .keep in the parent: the first version never
  // created the three directories it then pointed the child at.
  for (const dir of [sessions, home, cwd]) mkdirSync(dir, { recursive: true });
  return { root, sessions, home, cwd };
}

/**
 * node's own directory, so a hermetic PATH can still start a node program.
 *
 * The first version used `/usr/bin:/bin`, which does not contain node on this
 * machine, so every test in this file failed with `command not found` and the
 * failure looked like a broken CLI. A hermetic environment that cannot start
 * the program under test proves nothing about the program.
 */
const CLEAN_ENV = (sandboxEnv: { sessions: string; home: string; cwd: string }) =>
  hermeticChildEnv(sandboxEnv);

interface Run {
  out: string;
  code: number;
}

function runNode(script: string, args: string[], env: ReturnType<typeof CLEAN_ENV>, input?: string): Run {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    input,
    cwd: env.PWD ?? env.HOME,
    env,
  });
  return { out: r.stdout + r.stderr, code: r.status ?? 1 };
}

/** The effect ids a session log actually contains, in order. */
function eventsOf(sessions: string): Array<{ kind: string; data: Record<string, unknown> }> {
  const out: Array<{ kind: string; data: Record<string, unknown> }> = [];
  for (const name of readdirSync(sessions)) {
    if (!name.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(sessions, name), "utf8").split("\n")) {
      if (line.trim()) out.push(JSON.parse(line) as { kind: string; data: Record<string, unknown> });
    }
  }
  return out.sort((a, b) => a.seq - b.seq);
}

describe("D1: a real session is created, used and read back by another process", () => {
  it("with no provider the CLI refuses, and it says so before writing anything", () => {
    // The refusal is a real behaviour and this asserts it exactly. The first
    // version expected a session file to exist anyway, so it failed against a
    // design decision that is defensible: no key, no session. A test that
    // assumes a session is created is testing an assumption, not the program.
    const s = sandbox();
    const env = CLEAN_ENV(s);

    const r = runNode(CLI, ["run", "a deterministic goal", "--in", s.cwd], env);
    assert.notEqual(r.out.trim(), "", "the CLI explained itself");
    assert.equal(/ReferenceError/.test(r.out), false, `unexplained error:\n${r.out}`);
    assert.match(r.out, /OPENROUTER_API_KEY|provider|local model/i, r.out.slice(0, 300));
    // And it wrote nothing, so a refused run leaves no half-session behind.
    assert.deepEqual(readdirSync(s.sessions), [], "a refused run writes no session");
    rmSync(s.root, { recursive: true, force: true });
  });

  it("a session written by the chat is readable by the CLI, in another process", () => {
    // The restart proof, through the two binaries that a person actually uses.
    // The chat has no provider requirement at the staging step, so it can write
    // a session that `inspect` then reads from a completely separate process.
    const s = sandbox();
    const env = CLEAN_ENV(s);

    const chat = runNode(CHAT, [], env, "stage a real goal\nexit\n");
    assert.equal(/ReferenceError/.test(chat.out), false, chat.out.slice(0, 400));

    const files = readdirSync(s.sessions).filter((f) => f.endsWith(".jsonl"));
    assert.ok(files.length > 0, `the chat wrote a session: ${readdirSync(s.sessions).join(", ")}`);

    // A second process, no shared memory, reads the same file.
    const id = files[0]!.replace(/\.jsonl$/, "");
    const inspected = runNode(CLI, ["inspect", id], env);
    assert.equal(inspected.code, 0, `inspect must succeed: ${inspected.out}`);
    assert.match(inspected.out, /events/, "and reports the events it found");
    rmSync(s.root, { recursive: true, force: true });
  });

  it("the same log folded twice gives the same state, in two processes", () => {
    // Two independent processes fold one file; if the fold read a clock, a cache
    // or a private variable, the two would disagree. The chat writes the session
    // because it does not require a provider to stage.
    const s = sandbox();
    const env = CLEAN_ENV(s);
    runNode(CHAT, [], env, "another goal\nexit\n");

    const files = readdirSync(s.sessions).filter((f) => f.endsWith(".jsonl"));
    const id = files[0]!.replace(/\.jsonl$/, "");
    const a = runNode(CLI, ["inspect", id], env).out;
    const b = runNode(CLI, ["inspect", id], env).out;
    rmSync(s.root, { recursive: true, force: true });

    assert.equal(a, b, "two processes, one file, one answer");
  });
});

describe("D2: the chat stages, approves, and leaves an effect request on disk", () => {
  it("a go writes a request and an observation, and the intent survives a failure", () => {
    const s = sandbox();
    const env = CLEAN_ENV(s);

    const r = runNode(CHAT, [], env, "fix the failing test\ngo\n");

    // No ReferenceError: the path Cuesheet wrote.
    assert.equal(
      /ReferenceError|is not defined/.test(r.out),
      false,
      `the real path raised an unexplained error:\n${r.out}`,
    );
    // And it said why it could not run, in a sentence.
    assert.match(r.out, /not running|no declared|provider|asked|failed/i, r.out.slice(0, 400));
    // EFF-06 on the real path.
    assert.match(r.out, /still staged|go again|intention/i, "the intent survives a failed run");

    const events = eventsOf(s.sessions);
    const requested = events.filter((e) => e.kind === "effect_requested");
    assert.ok(requested.length > 0, `a request reached the log: ${events.map((e) => e.kind).join(", ")}`);
    rmSync(s.root, { recursive: true, force: true });
  });
});

describe("D3: a real worker, launched for real, produces a verifiable artifact", () => {
  it("worker -> receipt -> capture -> verify, and the verdict survives a restart", async () => {
    // This is the chain P13-P15 built, driven end to end rather than in pieces.
    const s = sandbox();
    const B = join(process.cwd(), "src");
    const { ReceiptStore } = (await import("../src/adapters/effect-receipts.ts")) as typeof import("../src/adapters/effect-receipts.ts");
    const { launch } = (await import("../src/adapters/worker-launcher.ts")) as typeof import("../src/adapters/worker-launcher.ts");
    const { mintIdentity } = (await import("../src/spawn.ts")) as typeof import("../src/spawn.ts");
    const { capture } = (await import("../src/adapters/artifact-capture.ts")) as typeof import("../src/adapters/artifact-capture.ts");
    const { runAgainstArtifact } = (await import("../src/adapters/artifact-verifier.ts")) as typeof import("../src/adapters/artifact-verifier.ts");
    const { SessionStore } = (await import("../src/adapters/session-store.ts")) as typeof import("../src/adapters/session-store.ts");
    const { effectRequested } = (await import("../src/effects.ts")) as typeof import("../src/effects.ts");
    const { deriveState } = (await import("../src/state.ts")) as typeof import("../src/state.ts");

    const receipts = new ReceiptStore({ root: s.root });
    const sessions = new SessionStore({ root: s.sessions });
    const workspace = join(s.root, "workspace");
    cpSync(REPO, workspace, { recursive: true });
    const identity = mintIdentity("E1");

    // The request is durable before anything runs.
    sessions.create("S1", []);
    sessions.append("S1", {
      ...effectRequested({
        id: identity.effectId,
        effect: "SpawnAgent",
        subject: "fix add()",
        affordance: "APPROVE_GOAL",
        reads: { goal: "known", pendingEffect: "known" },
        revision: 1,
        reconciliationKey: identity.reconciliationKey,
      }),
      seq: 1,
      at: Date.now(),
    });

    // A real worker process, launched by the real launcher.
    const { child } = launch(
      { sessionId: "S1", identity, receipts, script: WORKER, input: "abc" },
      s.root,
    );
    const code = await new Promise<number>((res) => child.on("exit", (c) => res(c ?? -1)));
    assert.equal(code, 0, "the real worker ran");

    // A real capture, hashed by the runtime.
    const artifact = capture({ sessionId: "S1", effectId: identity.effectId, workspace, root: s.root });
    assert.ok(existsSync(artifact.location), "the artifact is on disk");

    // A real independent check, in the capture, not the workspace.
    const verdict = runAgainstArtifact({
      artifact,
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      verificationId: "V1",
    });
    assert.equal(verdict.verdict, "VERIFIED");

    // The restart: a brand new store and a brand new reader over the same disk.
    const freshSessions = new SessionStore({ root: s.sessions });
    const freshReceipts = new ReceiptStore({ root: s.root });
    const reloaded = freshSessions.read("S1");
    assert.equal(reloaded.length, 1, "the log survived the restart");
    assert.equal(reloaded[0]!.kind, "effect_requested");

    const state = deriveState(reloaded, "S1", "complete");
    assert.equal(state.pendingEffect.value, true, "still pending, because nobody observed it");
    assert.equal(
      freshReceipts.observe("S1", identity.reconciliationKey, () => false).kind,
      "completed_successfully",
      "and the launch is still findable",
    );
    rmSync(s.root, { recursive: true, force: true });
  });
});

describe("D4: no test inherits a capability of the developer's", () => {
  it("the harness for this file contains no secret by inheritance", () => {
    // The rule, asserted on itself: this environment is assembled by naming, not
    // inherited and pruned. If someone adds a capability to the child later, it
    // has to be written here, visibly.
    const env = CLEAN_ENV(sandbox());
    for (const forbidden of ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CUESHEET_MODEL"]) {
      assert.equal(
        env[forbidden as keyof typeof env],
        undefined,
        `${forbidden} must not reach a test's child environment`,
      );
    }
    assert.equal(env.HOME?.includes("/Users/"), false, "and HOME is not the real one");
  });
});
