/**
 * The first LLM worker, and the four runs that show it changed no law.
 *
 * P13 proved a *deterministic* worker could claim success and be rejected. That
 * is a weak result when the interesting worker is a model, because it can be
 * explained away: the fixture lied on a schedule. These tests close that gap by
 * running the LLM producer against a deterministic `ModelAdapter`, so every run
 * below is reproducible and none of it depends on a model choosing to misbehave.
 * A real model is then exercised once, separately, and it is not load-bearing.
 *
 * What is being defended is one sentence:
 *
 * ```text
 * LLM -> untrusted producer -> workspace -> FrozenArtifact -> verifier
 * ```
 *
 * and the four runs are the falsification of every shortcut around it:
 *
 * ```text
 * A1  the model says success, the code is wrong   -> REJECTED
 * A2  the model says success, the fix is right    -> VERIFIED
 * A3  the model explains it wrongly, fix is right -> VERIFIED
 * A4  the provider never answers                  -> attributed, nothing invented
 * ```
 *
 * The verifier in all four is the repository's own test suite, run by
 * `runAgainstArtifact` inside a frozen capture. The model never appears on the
 * path that decides, and the tests below are arranged so that a producer which
 * *did* appear on it would fail.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  produce,
  placeInWorkspace,
  writesFromResponse,
  type ProduceOptions,
} from "../src/adapters/llm-producer.ts";
import { capture, verifyCapture, type CapturedArtifact } from "../src/adapters/artifact-capture.ts";
import type { ArtifactStanding } from "../src/verify.ts";
import { runAgainstArtifact } from "../src/adapters/artifact-verifier.ts";
import { readReceipt, workOutcomeOf } from "../src/work.ts";
import { OpenRouterAdapter } from "../src/adapters/openrouter.ts";
import {
  BOAST,
  CORRECT_ADD,
  FALSE_EXPLANATION,
  FailingModel,
  HUMBLE,
  ScriptedModel,
  WRONG_ADD,
  otherTool,
  prose,
  write,
} from "./fixtures/llm/scripted-model.ts";
import type { ModelAdapter } from "../src/core/loop.ts";

const REPO = join(process.cwd(), "test", "fixtures", "repo");
const PRODUCER_SOURCE = join(process.cwd(), "src", "adapters", "llm-producer.ts");
const SESSION = "S9";

interface Bench {
  root: string;
  workspace: string;
  effectDir: string;
  effectId: string;
  cleanup: () => void;
}

function bench(effectId: string): Bench {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-llm-"));
  const workspace = join(root, "workspace");
  const effectDir = join(root, SESSION, "effects", effectId);
  cpSync(REPO, workspace, { recursive: true });
  mkdirSync(effectDir, { recursive: true });
  return {
    root,
    workspace,
    effectDir,
    effectId,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Run the fixture repo's own tests in a directory. This is the only oracle. */
function runTestsIn(dir: string): number {
  return spawnSync(process.execPath, ["test.mjs"], { cwd: dir, encoding: "utf8" }).status ?? -1;
}

/** Freeze, then verify against the freeze. Exactly what the runtime does. */
function freezeAndVerify(b: Bench) {
  const artifact = capture({
    sessionId: SESSION,
    effectId: b.effectId,
    workspace: b.workspace,
    root: b.root,
  });
  return {
    artifact,
    verification: runAgainstArtifact({
      artifact,
      command: process.execPath,
      args: ["test.mjs"],
      verificationId: "V1",
    }),
  };
}

function optionsFor(b: Bench, adapter: ModelAdapter, over: Partial<ProduceOptions> = {}): ProduceOptions {
  return {
    workspace: b.workspace,
    effectDir: b.effectDir,
    effectId: b.effectId,
    nonce: `n${b.effectId}`,
    input: "make the repository's own tests pass",
    adapter,
    ...over,
  };
}

/** Read a receipt the way `work.ts` does, with no filesystem of its own. */
function outcomeOf(b: Bench) {
  const exists = (name: string) => existsSync(join(b.effectDir, name));
  const text = (name: string) => {
    try {
      return readFileSync(join(b.effectDir, name), "utf8");
    } catch {
      return null;
    }
  };
  const parsed = (name: string) => {
    const raw = text(name);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  };
  return workOutcomeOf(b.effectId, readReceipt(b.effectId, `n${b.effectId}`, exists, text, parsed));
}

// ---------------------------------------------------------------------------

describe("the fixture is real before anything is claimed about it", () => {
  it("starts red, so a green verdict means something", () => {
    const b = bench("E-pre");
    const status = runTestsIn(b.workspace);
    const source = readFileSync(join(b.workspace, "add.mjs"), "utf8");
    b.cleanup();
    assert.notEqual(status, 0, "the fixture repo's tests fail before any producer runs");
    assert.match(source, /return a - b;/, "because add subtracts");
  });

  it("and the correction this file offers is the one that turns it green", () => {
    const b = bench("E-pre2");
    writeFileSync(join(b.workspace, "add.mjs"), CORRECT_ADD, "utf8");
    const status = runTestsIn(b.workspace);
    b.cleanup();
    assert.equal(status, 0, "so a VERIFIED below is about this change and not about luck");
  });
});

describe("A1 the model claims success and the code is wrong", () => {
  it("is REJECTED, and the claim is on the record", async () => {
    const b = bench("E61");
    const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", WRONG_ADD)] });

    const report = await produce(optionsFor(b, model));
    const { artifact, verification } = freezeAndVerify(b);
    const outcome = outcomeOf(b);
    const receipt = JSON.parse(readFileSync(join(b.effectDir, "result.json"), "utf8")) as {
      digest: string;
      success: boolean;
      producerClaim: { success: boolean; reason: string };
    };
    const anyResultReceipt = existsSync(join(b.effectDir, "result.json"));
    b.cleanup();

    assert.equal(report.kind, "produced", "the producer did its job: it produced something");
    assert.equal(verification.verdict, "REJECTED", "the oracle rejected it");

    // ART-01, seen from the other side: the producer reported a digest and it
    // is not the one anything decided on.
    assert.equal(receipt.success, true, "the receipt claims success");
    assert.match(receipt.producerClaim.reason, /40\/40/, "and mentions test counts it never ran");
    assert.equal(receipt.producerClaim.reason, BOAST, "carried verbatim");
    assert.notEqual(artifact.digest, receipt.digest, "the producer's digest is not the artifact");
    assert.equal(outcome.outcome, "CONFIRMED_COMPLETE", "the work itself did happen");
    assert.equal(anyResultReceipt, true);
  });
});

describe("A2 the model claims success and the fix is right", () => {
  it("is VERIFIED, by the tests and not by the receipt", async () => {
    const b = bench("E62");
    const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", CORRECT_ADD)] });

    await produce(optionsFor(b, model));
    const { verification } = freezeAndVerify(b);
    const outcome = outcomeOf(b);
    b.cleanup();

    assert.equal(verification.verdict, "VERIFIED");
    assert.equal(outcome.outcome, "CONFIRMED_COMPLETE");
  });

  it("the model was shown the task, and nothing else it could rely on", async () => {
    const b = bench("E63");
    const model = new ScriptedModel({ text: "", toolCalls: [write("add.mjs", CORRECT_ADD)] });

    await produce(optionsFor(b, model, { input: "fix the sign" }));
    const frame = model.frames[0];
    b.cleanup();

    assert.ok(frame, "the producer built a frame");
    assert.equal(frame.goal, "fix the sign");
    assert.equal(frame.history.length, 0, "and offered no session history to lean on");
    assert.equal(frame.evidence.length, 0, "nor any evidence");
    assert.ok(
      frame.directives.some((d) => d.text.includes("write_file")),
      "the one verb is stated",
    );
  });
});

describe("A3 the model explains it wrongly and the artifact satisfies", () => {
  it("is VERIFIED, because the prose is not a source of truth", async () => {
    const b = bench("E64");
    // Every sentence of this explanation is fiction. There is no scheduler, no
    // race and no mutex in a two-line fixture.
    const model = new ScriptedModel({
      text: FALSE_EXPLANATION,
      toolCalls: [write("add.mjs", CORRECT_ADD)],
    });

    await produce(optionsFor(b, model));
    const { verification } = freezeAndVerify(b);
    b.cleanup();

    assert.equal(verification.verdict, "VERIFIED");
  });

  it("and the false explanation is preserved, not corrected", async () => {
    const b = bench("E65");
    const model = new ScriptedModel({
      text: FALSE_EXPLANATION,
      toolCalls: [write("add.mjs", CORRECT_ADD)],
    });

    await produce(optionsFor(b, model));
    const receipt = JSON.parse(readFileSync(join(b.effectDir, "result.json"), "utf8")) as {
      producerClaim: { reason: string };
    };
    b.cleanup();

    assert.equal(
      receipt.producerClaim.reason,
      FALSE_EXPLANATION,
      "Cuesheet stores what the model said and does not edit it into shape",
    );
  });
});

describe("A4 the provider never answers", () => {
  it("records who is answerable, and claims nothing", async () => {
    const b = bench("E66");
    const report = await produce(optionsFor(b, new FailingModel()));
    const outcome = outcomeOf(b);
    const failure = JSON.parse(readFileSync(join(b.effectDir, "failure.json"), "utf8")) as {
      why: string;
    };
    const untouched = runTestsIn(b.workspace);
    // Read before the cleanup. Checked after it, the tree is gone and the
    // assertion would pass whatever the producer had done, which is the
    // vacuous version of this test.
    const inventedResult = existsSync(join(b.effectDir, "result.json"));
    b.cleanup();

    assert.equal(report.kind, "failed");
    if (report.kind !== "failed") throw new Error("unreachable");
    assert.equal(report.origin, "provider", "the provider is answerable, not the workspace");
    assert.match(failure.why, /503/, "and the reason is the provider's own");
    assert.equal(outcome.outcome, "CONFIRMED_FAILED", "the effect settled, and how it settled is recorded");
    assert.notEqual(untouched, 0, "the workspace still has the bug, so nothing was quietly fixed");
    assert.equal(
      inventedResult,
      false,
      "no result receipt was invented for a run that produced nothing",
    );
  });

  it("a model that answers with prose and no edit is the producer's failure, not the provider's", async () => {
    const b = bench("E67");
    const model = new ScriptedModel(prose("All done! The tests pass and the fix is in place."));

    const report = await produce(optionsFor(b, model));
    const outcome = outcomeOf(b);
    b.cleanup();

    assert.equal(report.kind, "failed");
    if (report.kind !== "failed") throw new Error("unreachable");
    assert.equal(report.origin, "producer", "the provider answered; the model declined to act");
    assert.equal(outcome.outcome, "CONFIRMED_FAILED");
  });

  it("a producer that dies after writing but before filing invents no receipt", async () => {
    const b = bench("E68");
    const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", CORRECT_ADD)] });

    // The window P12 named: the bytes are on disk and nothing records it. This
    // is the case a naive producer handles by assuming it worked.
    await assert.rejects(
      () => produce(optionsFor(b, model, { afterApply: () => { throw new Error("killed mid-flight"); } })),
      /killed mid-flight/,
    );

    const outcome = outcomeOf(b);
    const actuallyFixed = runTestsIn(b.workspace);
    const anyReceipt = existsSync(join(b.effectDir, "result.json"))
      || existsSync(join(b.effectDir, "failure.json"));
    b.cleanup();

    assert.equal(actuallyFixed, 0, "the work really is on disk: it is recoverable, not lost");
    assert.equal(anyReceipt, false, "and no receipt claims otherwise");
    assert.equal(outcome.outcome, "INCONCLUSIVE", "so the effect is unknown, not failed and not complete");
  });
});

/**
 * EXP-03A: the other mistake, which is easier to make and worse to hold.
 *
 * The test above proves the system does not call a crashed effect successful. It
 * does not stop the next person from fixing that by inspecting the disk, and the
 * fix would look like this:
 *
 * ```text
 * the work is on disk, therefore it happened, therefore CONFIRMED_COMPLETE
 * ```
 *
 * That is a capture. It produces a real artifact with a correct digest, and the
 * artifact is indistinguishable from a capture of a workspace nobody ever
 * touched. The bytes are genuine. The provenance is not there, and no amount of
 * looking at the bytes will produce it.
 *
 * So the test below builds the laundering attempt and refuses it.
 */
describe("EXP-03A bytes on disk are not provenance, and a capture cannot supply it", () => {
  it("a capture of crashed work is a valid artifact that establishes nothing about the effect", async () => {
    const b = bench("E81");
    const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", CORRECT_ADD)] });

    await assert.rejects(
      () => produce(optionsFor(b, model, { afterApply: () => { throw new Error("killed mid-flight"); } })),
      /killed mid-flight/,
    );

    // The workspace now holds the completed edit and no receipt exists. Exactly
    // the state a recovery routine would find.
    const orphan = capture({
      sessionId: "S",
      effectId: "E81",
      workspace: b.workspace,
      root: b.root,
    });
    const holdsTheWork = readFileSync(join(orphan.location, "add.mjs"), "utf8") === CORRECT_ADD;
    // Asked before the teardown, because integrity is a question about bytes that
    // have to still be there to answer it.
    const digestHolds = verifyCapture(orphan);
    const stillUnknown = outcomeOf(b).outcome;
    b.cleanup();

    assert.equal(holdsTheWork, true, "the artifact really does contain the completed work");
    assert.equal(digestHolds, true, "and its digest is correct");
    assert.equal(
      stillUnknown,
      "INCONCLUSIVE",
      "so the effect is still unknown: the artifact did not resolve it",
    );
  });

  it("a capture of a workspace nobody touched has the same shape as the crashed one", async () => {
    // The comparison that makes the point. Both are valid artifacts. Both are
    // `holds` on integrity. Neither says anything about which effect, or whose
    // approval, produced the bytes. If a recovery path can tell them apart it is
    // reading something other than the artifact, and that something has to be
    // named.
    const crashed = bench("E82");
    const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", CORRECT_ADD)] });
    // Awaited rather than floated: the capture below has to happen after the
    // write is on disk, which is the whole comparison.
    await assert.rejects(
      () => produce(optionsFor(crashed, model, { afterApply: () => { throw new Error("killed"); } })),
      /killed/,
    );
    const touched = capture({ sessionId: "S", effectId: "E82", workspace: crashed.workspace, root: crashed.root });
    const touchedHolds = verifyCapture(touched);
    crashed.cleanup();

    const untouched = bench("E83");
    const idle = capture({ sessionId: "S", effectId: "E83", workspace: untouched.workspace, root: untouched.root });
    const idleHolds = verifyCapture(idle);
    // The file counts differ and that is fine. The point is not that the two
    // workspaces resemble each other; the point is that an artifact cannot tell
    // you whether the work in it came from an approved effect or from nobody.
    const sameFields = Object.keys(touched).sort().join() === Object.keys(idle).sort().join();
    untouched.cleanup();

    assert.equal(touchedHolds, true, "the crashed workspace yields a valid artifact");
    assert.equal(idleHolds, true, "and so does an untouched one");
    assert.ok(sameFields, "both artifacts carry the same fields, so those fields cannot answer the question");
    // The standing of both is identical on the dimensions an artifact carries,
    // which is exactly why neither can be laundered into a work outcome.
    const standingOf = (a: CapturedArtifact): ArtifactStanding => ({
      integrity: verifyCapture(a) ? "holds" : "violated",
      temporalCoherence: "not-established",
      conformance: "INCONCLUSIVE",
    });
    assert.deepEqual(standingOf(touched), standingOf(idle));
  });
});

describe("the producer's claim cannot move a verdict", () => {
  it("three different accounts of the same correct change give one verdict", async () => {
    const claims = [BOAST, FALSE_EXPLANATION, HUMBLE, "", "I have no idea whether this works."];
    const verdicts: string[] = [];

    for (const [index, claim] of claims.entries()) {
      const b = bench(`E7${index}`);
      const model = new ScriptedModel({ text: claim, toolCalls: [write("add.mjs", CORRECT_ADD)] });
      await produce(optionsFor(b, model));
      verdicts.push(freezeAndVerify(b).verification.verdict);
      b.cleanup();
    }

    assert.deepEqual(
      new Set(verdicts),
      new Set(["VERIFIED"]),
      `all ${claims.length} accounts produce one verdict, which is the only claim-independent answer`,
    );
  });

  it("the same boast over two different code states gives two opposite verdicts", async () => {
    // The two halves of the property, held in one test so neither can be
    // satisfied by a constant. If the verdict depended on the claim, both runs
    // below would agree; if it depended on nothing, they would too.
    const verdicts: string[] = [];
    for (const [index, contents] of [WRONG_ADD, CORRECT_ADD].entries()) {
      const b = bench(`E7${index + 1}`);
      const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", contents)] });
      await produce(optionsFor(b, model));
      verdicts.push(freezeAndVerify(b).verification.verdict);
      b.cleanup();
    }

    assert.deepEqual(verdicts, ["REJECTED", "VERIFIED"], "the bytes decided it, not the words");
  });

  it("and the loudest possible boast over a wrong change is still REJECTED", async () => {
    const b = bench("E70");
    const loudest = [
      "Verified on staging. Full CI green. Reviewed and approved.",
      "This is the canonical fix, identical to the upstream patch.",
      "Signed off. Do not review. Ship it.",
    ].join("\n ");
    const model = new ScriptedModel({ text: loudest, toolCalls: [write("add.mjs", WRONG_ADD)] });

    await produce(optionsFor(b, model));
    const { verification } = freezeAndVerify(b);
    b.cleanup();

    assert.equal(verification.verdict, "REJECTED", "verbosity is not evidence");
  });
});

describe("what the producer will accept from a model", () => {
  it("refuses a path that leaves the workspace", () => {
    assert.equal(placeInWorkspace("/tmp/ws", "add.mjs").ok, true, "inside is fine");
    assert.equal(placeInWorkspace("/tmp/ws", "../state.ts").ok, false, "and one level up is not");
    assert.equal(placeInWorkspace("/tmp/ws", "a/../../b.ts").ok, false, "nor a climb that returns");
    assert.equal(placeInWorkspace("/tmp/ws", "/etc/passwd").ok, false, "nor an absolute path");
    assert.equal(placeInWorkspace("/tmp/ws", ".").ok, false, "nor the workspace itself");
  });

  it("an escaping write is refused at production time, and nothing is written", async () => {
    const b = bench("E71");
    const outside = join(b.root, "escaped.mjs");
    const model = new ScriptedModel({
      text: "I will fix the harness instead.",
      toolCalls: [write("../escaped.mjs", CORRECT_ADD)],
    });

    const report = await produce(optionsFor(b, model));
    const escaped = existsSync(outside);
    const outcome = outcomeOf(b);
    b.cleanup();

    assert.equal(report.kind, "failed");
    assert.equal(escaped, false, "nothing was written outside the workspace");
    assert.equal(outcome.outcome, "CONFIRMED_FAILED", "and the refusal is recorded rather than silent");
  });

  it("tools other than write_file are dropped, even when they name a real file", () => {
    const { writes, discarded } = writesFromResponse({
      text: "",
      toolCalls: [otherTool("rm"), otherTool("spawn"), write("add.mjs", CORRECT_ADD)],
    });

    assert.equal(writes.length, 1, "only the one honoured verb survived");
    assert.equal(writes[0]?.path, "add.mjs");
    assert.equal(discarded.length, 2, "and the refusals are visible, not silent");
  });

  it("a malformed write is dropped rather than half-applied", () => {
    const missingContents = writesFromResponse({
      text: "",
      toolCalls: [{ name: "write_file", input: { path: "add.mjs" } }],
    });
    const absolute = writesFromResponse({
      text: "",
      toolCalls: [write("/etc/passwd", "x")],
    });

    assert.equal(missingContents.writes.length, 0, "no contents is not an empty file");
    assert.equal(absolute.writes.length, 0, "an absolute path is not inside a workspace");
    assert.equal(missingContents.discarded.length, 1);
    assert.equal(absolute.discarded.length, 1);
  });

  it("reads the payload through the provider's envelope as well as flat", () => {
    // This is a bug that was really hit, not a shape invented for coverage: the
    // first live run produced nothing because `openrouter.ts` hands back the
    // whole argument object, so the real payload sat under `input.input`. The
    // flat form is what a stub returns, so both have to work or the suite is
    // green while the integration is dead.
    const enveloped = writesFromResponse({
      text: "",
      toolCalls: [
        {
          name: "write_file",
          input: { tool: "write_file", input: { path: "add.mjs", contents: CORRECT_ADD } },
        },
      ],
    });
    const flat = writesFromResponse({
      text: "",
      toolCalls: [{ name: "write_file", input: { path: "add.mjs", contents: CORRECT_ADD } }],
    });

    assert.equal(enveloped.writes.length, 1, "the envelope a real provider emits is read");
    assert.equal(enveloped.writes[0]?.contents, CORRECT_ADD);
    assert.equal(flat.writes.length, 1, "and so is a flat one");
    assert.deepEqual(enveloped.writes, flat.writes, "to the same value");
  });

  it("an absent path is not silently an empty write at the workspace root", () => {
    const { writes } = writesFromResponse({
      text: "",
      toolCalls: [{ name: "write_file", input: { tool: "write_file", input: { contents: "x" } } }],
    });
    assert.equal(writes.length, 0, "a write with no path names no file");
  });
});

describe("the boundary, read off the source rather than asserted in prose", () => {
  it("the producer cannot reach state, affordances, the log or the verifier", () => {
    const source = readFileSync(PRODUCER_SOURCE, "utf8");
    const specifiers = [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map((m) => m[1] ?? "");

    const forbidden = [
      "state", "affordances", "effects", "reconcile", "chat", "cli-run",
      "spawn", "core/store", "projections", "replay",
    ];
    for (const specifier of specifiers) {
      for (const banned of forbidden) {
        assert.ok(
          !specifier.includes(banned),
          `the producer imports ${specifier}, which can reach ${banned}`,
        );
      }
    }
  });

  it("and the only thing it takes from verify.ts is a hash", () => {
    const source = readFileSync(PRODUCER_SOURCE, "utf8");
    const fromVerify = source.match(/import\s*\{([^}]*)\}\s*from\s*"\.\.\/verify\.ts"/)?.[1] ?? "";
    const names = fromVerify.split(",").map((n) => n.trim()).filter(Boolean);

    assert.deepEqual(names, ["digestOf"], "digestOf is a function, and takes the whole value");
  });

  it("the provider is named only at the edge, where a process is started", () => {
    const source = readFileSync(PRODUCER_SOURCE, "utf8");
    const edge = source.indexOf("const invokedDirectly");

    assert.ok(
      source.split("\n").some((l) => l.includes('from "./openrouter.ts"')),
      "the provider is imported at all",
    );
    assert.ok(
      source.indexOf("new OpenRouterAdapter(") > edge,
      "and constructed only inside the direct-invoke block, after the edge",
    );

    // The part that matters: `produce` is handed a ModelAdapter and must never
    // learn a provider's name, or the seam a test uses stops being the seam.
    // Comments are stripped first. A check that also fires on a prose mention
    // gets satisfied by rewording the prose, which teaches the reader that the
    // guard is a style rule rather than a reachability one.
    const code = source
      .slice(source.indexOf("export async function produce"), edge)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.ok(!code.includes("OpenRouterAdapter"), "produce() has no provider in it");
  });
});

describe("the real provider, which is not load-bearing", () => {
  it(
    "a live model produces an edit and the same oracle decides",
    { skip: process.env["OPENROUTER_API_KEY"] ? false : "OPENROUTER_API_KEY is not set" },
    async () => {
      const b = bench("E80");
      const adapter = new OpenRouterAdapter({
        apiKey: process.env["OPENROUTER_API_KEY"] as string,
        model: process.env["CUESHEET_MODEL"] ?? "anthropic/claude-sonnet-4-6",
      });

      let report;
      try {
        report = await produce(
          optionsFor(b, adapter, {
            // Declared, not scanned. The model gets the one file it must change
            // and still only has `write_file`.
            workspaceFiles: ["add.mjs"],
            input:
              "add.mjs defines add(a, b) but returns a - b, so the repository's own " +
              "tests in test.mjs fail. Change add.mjs so the tests pass.",
          }),
        );
      } catch (cause) {
        b.cleanup();
        throw new Error(`the live run failed and this test is not allowed to hide it: ${String(cause)}`);
      }

      const { artifact, verification } = freezeAndVerify(b);
      const receiptPath = join(b.effectDir, "result.json");
      const receipt = existsSync(receiptPath)
        ? (JSON.parse(readFileSync(receiptPath, "utf8")) as { producerClaim: { reason: string } })
        : null;
      b.cleanup();

      // Reported, not asserted. A model may decline to act, may be rate limited,
      // and may produce a wrong fix; none of those is a failure of this
      // repository, and asserting VERIFIED here would be tuning a test to a
      // model. What is asserted is that the run produced a real verdict from the
      // real oracle, whatever the model did.
      assert.notEqual(verification.verdict, undefined);
      assert.equal(verification.target.artifactDigest, artifact.digest, "the verdict names the capture");
      if (report.kind === "produced") {
        assert.ok(receipt, "a produced run leaves a receipt");
      } else {
        assert.equal(report.origin === "producer" || report.origin === "provider", true);
      }
    },
  );
});
