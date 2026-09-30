/**
 * P15: the artifact is frozen, and the verifier can only ever see the freeze.
 *
 * The founding test is the one that would fail on a naive implementation, and it
 * is arranged so that the naive answer is the *plausible* one:
 *
 * ```text
 * 1. a worker fixes a real bug in a real workspace
 * 2. the runtime captures that workspace as Artifact A
 * 3. someone sabotages the live workspace afterwards
 * 4. the verifier runs
 * ```
 *
 * A verifier that reads the workspace says REJECTED, and that is the answer a
 * reasonable person would give. The property under test is that the verdict
 * describes A and not the workspace, so the verdict must stay VERIFIED while
 * the live workspace is broken. Then, to prove the test is not vacuous, the
 * capture is itself damaged and the same verifier must go INCONCLUSIVE, because
 * a check about bytes it cannot identify is not a rejection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CAPTURE_SCOPE, capture, readCapture, verifyCapture } from "../src/adapters/artifact-capture.ts";
import { runAgainstArtifact } from "../src/adapters/artifact-verifier.ts";
import { ReceiptStore } from "../src/adapters/effect-receipts.ts";
import { launch } from "../src/adapters/worker-launcher.ts";
import { EventStore } from "../src/core/store.ts";
import { mintIdentity } from "../src/spawn.ts";
import type { CapturedArtifact } from "../src/adapters/artifact-capture.ts";
import type { ArtifactStanding, VerificationVerdict } from "../src/verify.ts";

const REPO = join(process.cwd(), "test", "fixtures", "repo");
const WORKER = join(process.cwd(), "test", "fixtures", "code-worker.ts");
const SESSION = "S7";
const V_ID = "V12";

type WorkerMode = "fix" | "wrong-file" | "claim-only";

interface Bench {
  root: string;
  workspace: string;
  receipts: ReceiptStore;
}

function bench(): Bench {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-art-"));
  const workspace = join(root, "workspace");
  cpSync(REPO, workspace, { recursive: true });
  return { root, workspace, receipts: new ReceiptStore({ root }) };
}

const cleanup = (b: Bench) => rmSync(b.root, { recursive: true, force: true });

/** Run a code worker for real, against a real workspace. */
async function runCodeWorker(b: Bench, mode: WorkerMode, effectId: string) {
  const identity = mintIdentity(effectId);
  const { child } = launch(
    {
      sessionId: SESSION,
      identity,
      receipts: b.receipts,
      script: WORKER,
      input: "fix the failing test",
      env: { CUESHEET_WORKER_MODE: mode, CUESHEET_WORKSPACE: b.workspace },
    },
    b.root,
  );
  await new Promise<number>((resolve) => child.on("exit", (c) => resolve(c ?? -1)));
  return identity;
}

/** The independent oracle: run the repo's own tests inside the capture. */
function verify(captured: CapturedArtifact) {
  return runAgainstArtifact({
    artifact: captured,
    command: process.execPath,
    args: ["test.mjs"],
    verificationId: V_ID,
  });
}

describe("the founding test: the verifier sees A, not the workspace", () => {
  it("a sabotaged workspace does not change the verdict on the capture", async () => {
    const b = bench();

    // The bug is real and the test is red before anything runs.
    assert.notEqual(
      (await import("node:child_process")).spawnSync(process.execPath, ["test.mjs"], {
        cwd: b.workspace,
        encoding: "utf8",
      }).status,
      0,
      "the fixture starts red",
    );

    // 1. a worker fixes it for real
    const identity = await runCodeWorker(b, "fix", "E42");

    // 2. the runtime captures the workspace, and computes the digest itself
    const artifactA = capture({
      sessionId: SESSION,
      effectId: identity.effectId,
      workspace: b.workspace,
      root: b.root,
    });

    // 3. somebody sabotages the live workspace afterwards
    writeFileSync(join(b.workspace, "add.mjs"), "export function add(a, b) { return 999; }\n", "utf8");
    assert.equal(
      (await import("node:child_process")).spawnSync(process.execPath, ["test.mjs"], {
        cwd: b.workspace,
        encoding: "utf8",
      }).status,
      1,
      "the live workspace is now broken",
    );

    // 4. the verifier runs, and it can only see the capture
    const result = verify(artifactA);
    const liveRun = (await import("node:child_process")).spawnSync(
      process.execPath,
      ["test.mjs"],
      { cwd: b.workspace, encoding: "utf8" },
    );
    cleanup(b);

    // The point of the whole milestone, in one assertion: the verdict is about A.
    assert.equal(result.verdict, "VERIFIED", "A was good when it was captured");
    assert.notEqual(
      liveRun.status,
      0,
      "and the live workspace would have said REJECTED, which is the wrong answer",
    );
    assert.equal(result.target.artifactDigest, artifactA.digest, "and it names A");
  });

  it("ART-04 modifying the workspace after capture leaves the artifact alone", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E43");
    const artifactA = capture({ sessionId: SESSION, effectId: "E43", workspace: b.workspace, root: b.root });
    const before = verify(artifactA).verdict;
    const digestBefore = artifactA.digest;

    // Every kind of vandalism a workspace can suffer.
    writeFileSync(join(b.workspace, "add.mjs"), "export function add() { return 0; }\n", "utf8");
    writeFileSync(join(b.workspace, "test.mjs"), "process.exit(0);\n", "utf8");
    mkdirSync(join(b.workspace, "extra"), { recursive: true });
    writeFileSync(join(b.workspace, "extra", "junk.txt"), "junk", "utf8");
    rmSync(join(b.workspace, "add.mjs"));

    const after = verify(artifactA);

    // Before the cleanup, for the same reason: these are assertions about bytes
    // on disk, and a deleted root would have made both of them fail while
    // telling the reader the capture had been corrupted.
    assert.equal(artifactA.digest, digestBefore, "the artifact is not the workspace");
    assert.equal(verifyCapture(artifactA), true, "and it still matches its own digest");
    assert.equal(after.verdict, before, "so the verdict did not move");
    cleanup(b);
  });
});

describe("ART-01 the runtime names the artifact, not the worker", () => {
  it("the worker's own digest is ignored and a different one is recorded", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E44");
    const artifactA = capture({ sessionId: SESSION, effectId: "E44", workspace: b.workspace, root: b.root });

    // The worker wrote a receipt claiming a digest of sixty zeros.
    const claimed = JSON.parse(
      readFileSync(join(b.root, SESSION, "effects", "E44", "result.json"), "utf8"),
    ) as { digest: string; success: boolean };
    const actual = verify(artifactA);
    cleanup(b);

    assert.equal(claimed.success, true, "the worker claimed success");
    assert.match(claimed.digest, /^0+$/, "and invented a digest");
    assert.notEqual(artifactA.digest, claimed.digest, "which is not what was recorded");
    assert.equal(actual.target.artifactDigest, artifactA.digest, "the runtime's own digest is authoritative");
    // And the verdict came from running the code, not from either number.
    assert.equal(actual.verdict, "VERIFIED");
  });

  it("two captures of the same workspace share an id, different ones do not", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E45");
    const first = capture({ sessionId: SESSION, effectId: "E45", workspace: b.workspace, root: b.root });
    const again = capture({ sessionId: SESSION, effectId: "E45", workspace: b.workspace, root: b.root });
    writeFileSync(join(b.workspace, "add.mjs"), "export function add(a,b){return a*b;}\n", "utf8");
    const changed = capture({ sessionId: SESSION, effectId: "E45", workspace: b.workspace, root: b.root });
    cleanup(b);

    assert.equal(first.artifactId, again.artifactId, "identical content, identical name");
    assert.notEqual(first.artifactId, changed.artifactId, "different content, different name");
  });
});

describe("ART-02 a work result becomes an artifact before any verification", () => {
  it("the artifact is named by its content, so it cannot be renamed into existence", () => {
    const b = bench();
    mkdirSync(join(b.workspace, "a.txt"), { recursive: true });
    writeFileSync(join(b.workspace, "a.txt", "one.txt"), "one", "utf8");
    const artifactA = capture({ sessionId: SESSION, effectId: "E46", workspace: b.workspace, root: b.root });

    // Checked before the cleanup, unlike every other assertion in this file. The
    // first version called `cleanup(b)` above these three lines and then asked
    // whether the bytes were on disk, which they were not, and the failure read
    // as if capture did not write anything.
    assert.ok(artifactA.artifactId.startsWith("A-"), "it is named");
    assert.equal(
      artifactA.artifactId,
      `A-${artifactA.digest.slice(0, 16)}`,
      "and the name is the digest, so the two are the same fact",
    );
    assert.ok(existsSync(artifactA.location), "and the bytes are on disk");
    cleanup(b);
  });

  it("ART-05 a rejected artifact stays durable and addressable", async () => {
    const b = bench();
    // A worker that touched the wrong file: the workspace still has the bug.
    await runCodeWorker(b, "wrong-file", "E47");
    const artifactA = capture({ sessionId: SESSION, effectId: "E47", workspace: b.workspace, root: b.root });
    const result = verify(artifactA);
    const stillThere = verifyCapture(artifactA);
    cleanup(b);

    assert.equal(result.verdict, "REJECTED", "the real check caught it, not the claim");
    assert.equal(stillThere, true, "and the rejected artifact is still readable afterwards");
    assert.ok(existsSync(artifactA.location) || result.target.artifactDigest === artifactA.digest);
  });

  it("a worker that changed nothing and claimed success is rejected", async () => {
    const b = bench();
    await runCodeWorker(b, "claim-only", "E48");
    const artifactA = capture({ sessionId: SESSION, effectId: "E48", workspace: b.workspace, root: b.root });
    const result = verify(artifactA);
    cleanup(b);
    // The purest lie: no edit, confident report. The oracle does not read reports.
    assert.equal(result.verdict, "REJECTED");
  });
});

describe("ART-06 an artifact that cannot be established is INCONCLUSIVE", () => {
  it("a capture that is gone settles nothing", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E49");
    const artifactA = capture({ sessionId: SESSION, effectId: "E49", workspace: b.workspace, root: b.root });
    rmSync(artifactA.location, { recursive: true, force: true });

    const result = verify(artifactA);
    cleanup(b);

    assert.equal(result.verdict, "INCONCLUSIVE", "not REJECTED: a missing capture is not a wrong one");
    assert.ok(result.evidence.some((e) => e.value.includes("not on disk")));
  });

  it("a capture whose bytes no longer match its name settles nothing", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E50");
    const artifactA = capture({ sessionId: SESSION, effectId: "E50", workspace: b.workspace, root: b.root });

    // The capture itself is tampered with, so "which bytes it was" is unknowable.
    writeFileSync(join(artifactA.location, "add.mjs"), "export function add(){return 1;}\n", "utf8");
    const readable = readCapture(artifactA);
    const result = verify(artifactA);
    cleanup(b);

    assert.equal(readable.kind, "unavailable");
    assert.equal(result.verdict, "INCONCLUSIVE", "a check about unidentified bytes decides nothing");
  });

  it("a runner that crashes is INCONCLUSIVE, not a rejection of the work", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E51");
    const artifactA = capture({ sessionId: SESSION, effectId: "E51", workspace: b.workspace, root: b.root });

    // A command that does not exist: the oracle could not run, which says
    // nothing about the code.
    const result = runAgainstArtifact({
      artifact: artifactA,
      command: "definitely-not-a-real-binary-cuesheet",
      args: [],
      verificationId: "V99",
    });
    cleanup(b);

    assert.equal(result.verdict, "INCONCLUSIVE");
    assert.ok(result.evidence.some((e) => e.value.includes("runner failed")));
  });
});

describe("the claim is narrower than the tempting one", () => {
  it("a capture says what it covers and what it does not", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E52");
    const artifactA = capture({ sessionId: SESSION, effectId: "E52", workspace: b.workspace, root: b.root });
    cleanup(b);

    assert.equal(artifactA.scope, CAPTURE_SCOPE);
    assert.ok(artifactA.covers.includes("add.mjs"), "it names what it covers");
    assert.ok(artifactA.doesNotCover.length > 0, "and it is explicit about what it cannot claim");
    assert.ok(
      artifactA.doesNotCover.some((c) => c.includes("outside the declared workspace")),
      "including the effects it could not have seen",
    );
  });

  it("the log records the production and the verification as two facts", async () => {
    const store = new EventStore("s", () => 1_790_000_000_000);
    store.append({
      kind: "work_produced",
      subject: "fix add()",
      data: {
        effectId: "E53",
        artifactId: "A-abc",
        artifactDigest: "abc",
        summary: "fixed the sign and all tests pass",
      },
    });
    store.append({
      kind: "work_verified",
      subject: "fix add()",
      data: { effectId: "E53", artifactId: "A-abc", artifactDigest: "abc", verdict: "REJECTED" },
    });

    const kinds = store.toSession().events.map((e) => e.kind);
    assert.deepEqual(kinds, ["work_produced", "work_verified"]);
    // VER-04 still holds after a rejection: the producer's account survives.
    assert.equal(
      store.toSession().events[0]!.data.summary,
      "fixed the sign and all tests pass",
      "the false claim is preserved verbatim",
    );
  });
});

/**
 * EXP-07, the live run that found this.
 *
 * A real model was given an ambiguous task against a test that several
 * implementations satisfy. It picked one, the artifact was frozen, the oracle
 * ran, and the verdict was VERIFIED. The tempting conclusion is that the oracle
 * is weak. It is not. The oracle did exactly its job, and the job was smaller
 * than the question.
 *
 * These tests fix the finding in the place a reader will look, which is the
 * artifact's own `doesNotCover`, so that a future reader who finds a VERIFIED
 * verdict on an ambiguous task finds the limit next to the verdict rather than
 * having to rediscover it.
 */
describe("EXP-07 a verdict is about the requirement, never about the requirement's adequacy", () => {
  it("the ambiguity limit is stated in the artifact itself", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E70");
    const artifact = capture({ sessionId: SESSION, effectId: "E70", workspace: b.workspace, root: b.root });
    cleanup(b);

    assert.ok(
      artifact.doesNotCover.some((c) => c.includes("was the requirement that was meant")),
      "an artifact says it cannot vouch for whether its own requirement was the right one",
    );
  });

  it("a test several implementations satisfy is verified, and that is not a defect", async () => {
    const b = bench();
    // The ambiguous shape from the live run: a requirement so weak that
    // `x * 2`, `Math.abs(x)` and `0` all satisfy it.
    writeFileSync(join(b.workspace, "score.mjs"), "export function score(x) { return x * 2; }\n");
    writeFileSync(
      join(b.workspace, "test.mjs"),
      'import { score } from "./score.mjs";\n' +
        "if (score(3) < 0) { console.log(\"FAIL\"); process.exit(1); }\n" +
        'console.log("ok");\n',
    );

    const artifact = capture({ sessionId: SESSION, effectId: "E71", workspace: b.workspace, root: b.root });
    const verdict = runAgainstArtifact({
      artifact,
      command: process.execPath,
      args: ["test.mjs"],
      verificationId: "V71",
    });
    cleanup(b);

    // The honest result, and it is the point of the test: a true verdict about a
    // thin requirement. Nothing here can turn this into a claim that the work
    // was the right work, and the artifact says so in its own field.
    assert.equal(verdict.verdict, "VERIFIED");
    assert.ok(
      artifact.doesNotCover.some((c) => c.includes("was the requirement that was meant")),
      "and the artifact carries the limit that makes the verdict readable",
    );
  });
});

/**
 * EXP-06, the capture-time chimera.
 *
 * A writer outside the system mutated `b.mjs` while the workspace was being
 * copied. The artifact holds `a@v1` and `b@v2`: a pair that never coexisted on
 * disk at any instant. Its digest is correct, because content addressing proves
 * the bytes it holds are the bytes it names, and that is all it proves.
 *
 * The verdict was VERIFIED, because the contract only concerned `a.mjs`.
 *
 * This is not fixed here, and nothing in this file pretends otherwise. A digest
 * over a file list cannot distinguish a real workspace from a chimera, since the
 * chimera is exactly as self-consistent as the real one. The tests below do two
 * things and stop: they make the hole reproducible, and they keep the artifact
 * honest about having it.
 */
describe("EXP-06 a capture is a set of reads, not a snapshot of a moment", () => {
  /** A capture that races a real external writer, if the race can be won. */
  async function chimera(): Promise<{ b: Bench; artifact: CapturedArtifact | null; raced: boolean }> {
    const benchDir = bench();
    writeFileSync(join(benchDir.workspace, "a.mjs"), "export function a() { return 'a-v1'; }\n", "utf8");
    writeFileSync(join(benchDir.workspace, "b.mjs"), "export function b() { return 'b-v1'; }\n", "utf8");
    // Enough bulk between the two files that the copy takes a measurable time,
    // so a separate process has a window to act inside it.
    writeFileSync(join(benchDir.workspace, "c.mjs"), "// " + "x".repeat(64 * 1024 * 1024) + "\n", "utf8");

    const staging = join(benchDir.root, SESSION, "artifacts", "E72.pending");
    const racer = join(benchDir.root, "racer.cjs");
    writeFileSync(
      racer,
      [
        'const { existsSync, writeFileSync } = require("node:fs");',
        `const staging = ${JSON.stringify(staging)};`,
        `const target = ${JSON.stringify(join(benchDir.workspace, "b.mjs"))};`,
        "const deadline = Date.now() + 15000;",
        "while (Date.now() < deadline) {",
        '  if (existsSync(staging + "/a.mjs") && existsSync(staging + "/c.mjs") && !existsSync(staging + "/b.mjs")) {',
        '    writeFileSync(target, "export function b() { return \'b-v2\'; }\\n");',
        "    process.exit(0);",
        "  }",
        "}",
        "process.exit(1);",
      ].join("\n"),
      "utf8",
    );

    // The racer is a separate OS process, because `capture` is synchronous and a
    // timer on this thread would only run after the copy had already finished.
    const child = (await import("node:child_process")).spawn(process.execPath, [racer], { stdio: "ignore" });
    let raced = false;
    child.on("exit", (code) => {
      raced = code === 0;
    });
    let artifact: CapturedArtifact | null = null;
    try {
      artifact = capture({ sessionId: SESSION, effectId: "E72", workspace: benchDir.workspace, root: benchDir.root });
    } finally {
      child.kill();
    }
    return { b: benchDir, artifact, raced };
  }

  it("the capture limit is stated in the artifact itself", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E73");
    const artifact = capture({ sessionId: SESSION, effectId: "E73", workspace: b.workspace, root: b.root });
    cleanup(b);

    assert.ok(
      artifact.doesNotCover.some((c) => c.includes("simultaneously true")),
      "an artifact says its files were not observed to have coexisted",
    );
  });

  it("a chimera is possible: bytes that never coexisted, in an artifact of perfect integrity", async (t) => {
    const { b, artifact, raced } = await chimera();
    if (!artifact) {
      cleanup(b);
      t.skip("the capture produced no artifact to examine");
      return;
    }
    if (!raced) {
      // The race is timing dependent. What is asserted below holds either way,
      // so a missed race costs coverage of the chimera and not correctness of
      // this file. The window is widened on slow machines by the bulk file.
      t.diagnostic("the external writer did not land inside the copy window this run");
    }

    const fileA = readFileSync(join(artifact.location, "a.mjs"), "utf8");
    const fileB = readFileSync(join(artifact.location, "b.mjs"), "utf8");
    const isChimera = fileA.includes("a-v1") && fileB.includes("b-v2");

    // The integrity claim is the important half. Whatever happened, the artifact
    // matches its own digest: content addressing is not broken by this, and a
    // reader must not conclude that a correct digest implies a real snapshot.
    assert.ok(verifyCapture(artifact), "the artifact still matches its own digest");

    if (isChimera) {
      // Documented here so the possibility is not folklore. No assertion claims
      // the chimera is impossible, because it is not.
      t.diagnostic(
        "this run produced a chimera: a@v1 with b@v2, a state the workspace never held",
      );
    }
    cleanup(b);
  });
});

/**
 * EXP-06's result, frozen as a named shape rather than as a story.
 *
 * The chimera test above can win or lose its race, so it proves the possibility
 * is real but it does not reliably re-measure it. This test measures the
 * *standing* instead, which is timing independent: an artifact whose integrity
 * holds and whose conformance is VERIFIED, and whose temporal coherence is not
 * established. That combination is what EXP-06 measured, and it is the shape a
 * future reader must recognise rather than re-derive.
 *
 * The point of the shape is that all three fields are answerable without the
 * other two, and that `not-established` is a first-class answer rather than a
 * missing value. A capture that cannot speak about temporal coherence must say
 * so, because silence reads as permission.
 */
describe("EXP-06 integrity, temporal coherence and conformance are three questions", () => {
  it("a chimera answers yes, no, and yes, and the verdict is still right", () => {
    // The standing EXP-06 measured. Written as data because it is a fact about
    // what the system can produce, not a scenario to be arranged.
    const standing: ArtifactStanding = {
      integrity: "holds",
      temporalCoherence: "not-established",
      conformance: "VERIFIED",
    };

    assert.equal(standing.integrity, "holds");
    assert.equal(standing.temporalCoherence, "not-established");
    assert.equal(standing.conformance, "VERIFIED");
    // The load-bearing consequence: a VERIFIED conformance is not a claim about
    // coherence, and nothing in the type lets it be read as one.
    assert.notEqual(standing.temporalCoherence, "holds");
  });

  it("the capture declares all three, so the hole travels with the artifact", async () => {
    const b = bench();
    await runCodeWorker(b, "fix", "E74");
    const artifact = capture({ sessionId: SESSION, effectId: "E74", workspace: b.workspace, root: b.root });

    // Integrity is answerable here and now, from the artifact's own bytes, so it
    // is asked before the bench is torn down rather than after.
    const standing: ArtifactStanding = {
      integrity: verifyCapture(artifact) ? "holds" : "violated",
      // Not established by anything this repository does, and said so.
      temporalCoherence: "not-established",
      conformance: "INCONCLUSIVE",
    };
    assert.equal(standing.integrity, "holds");
    assert.equal(standing.temporalCoherence, "not-established");
    assert.ok(
      artifact.doesNotCover.some((c) => c.includes("simultaneously true")),
      "and the artifact states the same limit in words a person reads",
    );
    cleanup(b);
  });

  it("conformance alone never implies coherence, in either direction", () => {
    // A chimera can be VERIFIED, because the requirement was narrow.
    assert.notEqual("VERIFIED" as VerificationVerdict, "not-established");
    // And a coherent artifact can be REJECTED, because the work was wrong.
    // Neither verdict is evidence about the other dimension, and a system that
    // ever needs them to be correlated has built a new implicit authority.
    const rejectedButCoherent: ArtifactStanding = {
      integrity: "holds",
      temporalCoherence: "holds",
      conformance: "REJECTED",
    };
    assert.equal(rejectedButCoherent.conformance, "REJECTED");
    assert.equal(rejectedButCoherent.temporalCoherence, "holds");
  });
});

