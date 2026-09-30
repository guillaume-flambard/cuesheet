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
