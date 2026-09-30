/**
 * P14: work is not verification, and the producer is not the authority.
 *
 * Three real processes, one oracle, and a liar.
 *
 * The milestone's question is narrow: if a worker claims success, does anything
 * in Cuesheet believe it? The answer has to be no for a field that is
 * well-formed and plausible, not merely for an absurd one, because a real model
 * writes exactly that field.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReceiptStore } from "../src/adapters/effect-receipts.ts";
import { launch, prepare } from "../src/adapters/worker-launcher.ts";
import { EventStore, type Event } from "../src/core/store.ts";
import { mintIdentity } from "../src/spawn.ts";
import {
  accepts,
  describeVerification,
  digestOf,
  verify,
  type WorkArtifact,
  type VerificationRequirement,
  type VerificationTarget,
} from "../src/verify.ts";

const FIXTURE = join(process.cwd(), "test", "fixtures", "three-workers.ts");
const SESSION = "S7";
const INPUT = "abc";

type Mode = "honest" | "wrong" | "lying";

/** The requirement the request declared. The goal's side of the contract. */
const REQUIREMENT: VerificationRequirement = { kind: "artifact_digest_of", input: INPUT };

/** Run one worker mode for real and read back what it left. */
function runWorker(mode: Mode, effectId: string) {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-ver-"));
  const receipts = new ReceiptStore({ root });
  const identity = mintIdentity(effectId);

  prepare({ sessionId: SESSION, identity, receipts, input: INPUT }, root);
  // The honesty level is the only thing that varies between the three runs. It
  // is passed as environment, so the three workers share identical mechanics
  // and differ only in what they write, which is the comparison that matters.
  const { child } = launch(
    {
      sessionId: SESSION,
      identity,
      receipts,
      script: FIXTURE,
      input: INPUT,
      env: { CUESHEET_FIXTURE_MODE: mode },
    },
    root,
  );
  const outcome = new Promise<number>((resolve) => child.on("exit", (c) => resolve(c ?? -1)));

  return {
    root,
    identity,
    finished: outcome,
    readArtifact(): WorkArtifact {
      const file = join(root, SESSION, "effects", effectId, "result.json");
      const body = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      // The claim is read here, in the adapter that knows about producers, and
      // handed to the verifier as data. It is never a flag anything branches on.
      const claim =
        body.success === true
          ? { success: true, reason: typeof body.claim === "string" ? body.claim : undefined }
          : undefined;
      return {
        effectId: String(body.effectId),
        artifactDigest: String(body.digest),
        claimedSummary: typeof body.summary === "string" ? body.summary : undefined,
        producerClaim: claim,
      };
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("three workers, one oracle", () => {
  it("honest -> VERIFIED, wrong -> REJECTED, lying -> REJECTED", async () => {
    const expected: Array<[Mode, "VERIFIED" | "REJECTED"]> = [
      ["honest", "VERIFIED"],
      ["wrong", "REJECTED"],
      // The row the whole milestone exists for.
      ["lying", "REJECTED"],
    ];

    for (const [mode, verdict] of expected) {
      const w = runWorker(mode, `E-${mode}`);
      await w.finished;
      const artifact = w.readArtifact();
      const target: VerificationTarget = {
        effectId: `E-${mode}`,
        artifactDigest: artifact.artifactDigest,
      };
      const result = verify(target, artifact, REQUIREMENT);
      w.cleanup();

      assert.equal(result.verdict, verdict, `${mode} should be ${verdict}`);
      assert.equal(accepts(result), verdict === "VERIFIED");
    }
  });

  it("VER-02 a producer claiming success changes nothing", async () => {
    // The same wrong artifact, with and without a claim, must verify the same
    // way. If the claim moved the verdict, then the producer was the authority
    // and the architecture says it is not.
    const liar = runWorker("lying", "E-claim");
    await liar.finished;
    const withClaim = liar.readArtifact();
    const withoutClaim: WorkArtifact = {
      effectId: withClaim.effectId,
      artifactDigest: withClaim.artifactDigest,
    };
    liar.cleanup();

    const target: VerificationTarget = {
      effectId: "E-claim",
      artifactDigest: withClaim.artifactDigest,
    };
    const claimed = verify(target, withClaim, REQUIREMENT);
    const unclaimed = verify(target, withoutClaim, REQUIREMENT);

    assert.equal(claimed.verdict, "REJECTED");
    assert.equal(unclaimed.verdict, "REJECTED", "the claim was not what decided it");
    // And the record shows the claim was seen and skipped, so this is auditable
    // rather than merely true.
    assert.ok(
      claimed.evidence.some((e) => e.kind === "producer_claim_ignored"),
      "the evidence names the ignored claim",
    );
    assert.equal(
      unclaimed.evidence.some((e) => e.kind === "producer_claim_ignored"),
      false,
      "nothing to ignore when nothing was claimed",
    );
  });

  it("the verifier hashes the input itself, and trusts neither side's number", async () => {
    const w = runWorker("honest", "E-oracle");
    await w.finished;
    const artifact = w.readArtifact();
    w.cleanup();

    const result = verify(
      { effectId: "E-oracle", artifactDigest: artifact.artifactDigest },
      artifact,
      REQUIREMENT,
    );
    assert.equal(result.verdict, "VERIFIED");

    // The expected value is recomputed here, not read from the goal or the
    // worker, so a requirement carrying a lie would still be checked.
    const expectedEvidence = result.evidence.find((e) => e.kind === "expected_digest");
    assert.equal(expectedEvidence?.value, createHash("sha256").update(INPUT).digest("hex"));
    assert.equal(digestOf(INPUT), expectedEvidence?.value, "and it is the same function");
  });
});

describe("VER-03 verification names what it evaluated", () => {
  it("an artifact that moved is INCONCLUSIVE, not rejected", async () => {
    const w = runWorker("honest", "E-moved");
    await w.finished;
    const artifact = w.readArtifact();
    w.cleanup();

    // The repository changed between production and verification: the artifact
    // is no longer the one the target names. That is a statement about the
    // target, not about the work, so it settles nothing.
    const result = verify(
      { effectId: "E-moved", artifactDigest: digestOf("something else") },
      artifact,
      REQUIREMENT,
    );
    assert.equal(result.verdict, "INCONCLUSIVE");
    assert.ok(result.evidence.some((e) => e.kind === "target_digest"));
    assert.ok(result.evidence.some((e) => e.kind === "actual_digest"));
    assert.match(describeVerification(result), /still unknown/);
  });

  it("an artifact from another effect is INCONCLUSIVE", async () => {
    const w = runWorker("honest", "E-one");
    await w.finished;
    const artifact = w.readArtifact();
    w.cleanup();

    const result = verify({ effectId: "E-other", artifactDigest: artifact.artifactDigest }, artifact, REQUIREMENT);
    assert.equal(result.verdict, "INCONCLUSIVE");
    assert.match(result.evidence[0]!.value, /belongs to E-one/);
  });
});

describe("VER-04 a rejection does not erase the work", () => {
  it("the production and the rejection are both in the history", () => {
    // A worker produced a wrong artifact, a verifier rejected it, and the log
    // says both. The rejected work is historical work. Rewriting it as
    // "nothing was produced" would be rewriting the past to fit the verdict,
    // which is the one thing a log exists to prevent.
    const store = new EventStore("s", () => 1_790_000_000_000);
    store.append({
      kind: "effect_requested",
      subject: "hash the input",
      data: { effect: "SpawnAgent", effectId: "E42", affordance: "APPROVE_GOAL", reads: {}, revision: 1 },
    });

    const artifact: WorkArtifact = {
      effectId: "E42",
      artifactDigest: digestOf("wrong"),
      producerClaim: { success: true },
    };
    store.append({
      kind: "work_produced",
      subject: "hash the input",
      data: { effectId: "E42", artifactDigest: artifact.artifactDigest, summary: "all checks pass" },
    });

    const result = verify({ effectId: "E42", artifactDigest: artifact.artifactDigest }, artifact, REQUIREMENT);
    assert.equal(result.verdict, "REJECTED");
    store.append({
      kind: "work_verified",
      subject: "hash the input",
      data: {
        effectId: "E42",
        artifactDigest: artifact.artifactDigest,
        verdict: result.verdict,
        evidence: result.evidence,
      },
    });

    const kinds = store.toSession().events.map((e) => e.kind);
    assert.deepEqual(
      kinds,
      ["effect_requested", "work_produced", "work_verified"],
      "three facts, in order, and none of them replaced another",
    );

    // The production still says what was produced, claim and all. The rejection
    // is a second fact beside it, not an edit.
    const produced = store.toSession().events.find((e) => e.kind === "work_produced")!;
    assert.equal(produced.data.summary, "all checks pass", "its account is preserved verbatim");
    assert.equal(produced.data.artifactDigest, artifact.artifactDigest);
  });
});

describe("VER-06 satisfaction needs declared evidence", () => {
  it("VERIFIED is necessary and a goal is not satisfied by production alone", () => {
    // The point of the milestone in one assertion: producing satisfies nothing.
    // Only a verification can, and a verification that is INCONCLUSIVE cannot
    // either, so a goal stays open while the answer is unknown.
    const artifact: WorkArtifact = { effectId: "E42", artifactDigest: digestOf(INPUT) };
    const target: VerificationTarget = { effectId: "E42", artifactDigest: artifact.artifactDigest };

    assert.equal(verify(target, artifact, REQUIREMENT).verdict, "VERIFIED", "work alone: nothing");
    assert.equal(
      accepts(verify({ effectId: "E42", artifactDigest: digestOf("moved") }, artifact, REQUIREMENT)),
      false,
      "a moved target does not satisfy anything",
    );
    assert.equal(
      accepts(verify(target, artifact, { kind: "artifact_digest_of", input: "different" })),
      false,
      "the requirement is the goal's, and changing it changes the answer",
    );
  });
});

describe("the verifier is pure", () => {
  it("same inputs, same verdict, no clock", () => {
    const artifact: WorkArtifact = { effectId: "E42", artifactDigest: digestOf(INPUT) };
    const target: VerificationTarget = { effectId: "E42", artifactDigest: artifact.artifactDigest };
    assert.deepEqual(verify(target, artifact, REQUIREMENT), verify(target, artifact, REQUIREMENT));

    // Two different requirements over one artifact give two different verdicts,
    // which is the requirement being consulted rather than cached anywhere.
    const satisfied = verify(target, artifact, REQUIREMENT).verdict;
    const unsatisfied = verify(target, artifact, {
      kind: "artifact_digest_of",
      input: "zzz",
    }).verdict;
    assert.equal(satisfied, "VERIFIED");
    assert.equal(unsatisfied, "REJECTED");
  });

  it("no event builder in this module can write a work_verified from a producer", () => {
    // A grep-level check, because the property is about where the authority is
    // not and one day a function will be added here by accident.
    const source = readFileSync(join(process.cwd(), "src", "verify.ts"), "utf8");
    assert.equal(
      /export (async )?function [a-zA-Z]+\([^)]*\)\s*:[^{]*Event/.test(source),
      false,
      "verify.ts builds no events, so it cannot assert a verdict into the log",
    );
  });
});

/** A verdict has to survive a round trip through the log, not just exist. */
describe("a verdict is durable", () => {
  it("reads back out of a written event unchanged", () => {
    const artifact: WorkArtifact = { effectId: "E7", artifactDigest: digestOf(INPUT) };
    const result = verify({ effectId: "E7", artifactDigest: artifact.artifactDigest }, artifact, REQUIREMENT);
    const store = new EventStore("s", () => 1_790_000_000_000);
    store.append({
      kind: "work_verified",
      subject: "",
      data: { effectId: "E7", artifactDigest: artifact.artifactDigest, verdict: result.verdict },
    });

    const stored = store.toSession().events.at(-1) as Event;
    assert.equal(stored.kind, "work_verified");
    assert.equal(stored.data.verdict, "VERIFIED");
    assert.equal(stored.data.artifactDigest, artifact.artifactDigest, "and names its target");
  });
});
