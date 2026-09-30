/**
 * The two verdict paths, which are not the same path.
 *
 * `verify()` is declarative: it compares a digest against a requirement the
 * request declared. `runAgainstArtifact()` executes an oracle inside the frozen
 * capture. Both end in a `Verification`, both are called "the verdict", and
 * nothing checked that they ever agree.
 *
 * Agent B found the gap while building the reliability matrix, and phrased it
 * exactly: `FALSE VERIFIED: 0` covers only one of them. It measured by running
 * both on the same artifact:
 *
 * ```text
 * verify()              REJECTED
 * runAgainstArtifact()  VERIFIED
 * ```
 *
 * That is not a bug in either function. They answer different questions, so they
 * are allowed to differ. What was missing is that nothing said so, and a
 * reliability figure computed from one path while a reader assumed both is a
 * figure about half of the system.
 *
 * So the matrix is now labelled by which path it exercised, and this file makes
 * the difference explicit rather than letting it stay implicit in a helper's
 * name.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { capture } from "../src/adapters/artifact-capture.ts";
import { runAgainstArtifact } from "../src/adapters/artifact-verifier.ts";
import { digestOf, verify, type VerificationTarget } from "../src/verify.ts";

function fixture(): { artifact: ReturnType<typeof capture>; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-paths-"));
  const ws = join(root, "ws");
  mkdirSync(ws, { recursive: true });
  writeFileSync(join(ws, "f.txt"), "contenu\n");
  const artifact = capture({ sessionId: "S", effectId: "E1", workspace: ws, root });
  return { artifact, cleanup: () => rmSyncQuiet(root) };
}

function rmSyncQuiet(dir: string): void {
  try {
    // A cleanup failure must not fail the test that proved something else, so it
    // is swallowed rather than asserted. The directories are in the approved
    // temp space.
    import("node:fs").then(({ rmSync }) => rmSync(dir, { recursive: true, force: true }));
  } catch {
    /* nothing to do */
  }
}

describe("the two verdict paths are named, and they differ by design", () => {
  it("they can disagree on one artifact, and that is a question difference", () => {
    const { artifact, cleanup } = fixture();
    const target: VerificationTarget = { effectId: "E1", artifactDigest: artifact.digest };

    // Path 1: declarative. The requirement says "this artifact must be the
    // digest of this exact input", and the input does not match the file.
    const declarative = verify(
      target,
      { effectId: "E1", artifactDigest: artifact.digest },
      { kind: "artifact_digest_of", input: "autre chose\n" },
    );
    assert.equal(declarative.verdict, "REJECTED");

    // Path 2: executed. The oracle is told to succeed, and it does.
    const executed = runAgainstArtifact({
      artifact,
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      verificationId: "V",
    });
    assert.equal(executed.verdict, "VERIFIED");

    // Same artifact, same digest, two verdicts, and both correct about their
    // own question. This is why a reliability number must name its path.
    assert.notEqual(
      declarative.verdict,
      executed.verdict,
      "the two paths answer different questions and may disagree",
    );
    assert.equal(
      declarative.target.artifactDigest,
      executed.target.artifactDigest,
      "while naming exactly the same artifact, which is what makes the difference meaningful",
    );
    cleanup();
  });

  it("both paths name the artifact they judged, and agree on that identity", () => {
    // The agreement that is actually checkable between these two paths is not
    // about the verdict, because they are asked different questions. It is about
    // the SUBJECT: both must name the same artifact and the same digest, or a
    // reader comparing two verdicts is comparing them about different things.
    //
    // The first version of this test tried to make both return VERIFIED and
    // failed, because `verify()` hashes a string while an artifact's digest is
    // the hash of the captured tree. That is not a disagreement between the
    // paths, it is a question I asked the declarative path that it was never
    // built to answer, and the failure read like a bug in one of them.
    const { artifact, cleanup } = fixture();
    const target: VerificationTarget = { effectId: "E1", artifactDigest: artifact.digest };

    const declarative = verify(
      target,
      { effectId: "E1", artifactDigest: artifact.digest },
      { kind: "artifact_digest_of", input: "contenu\n" },
    );
    const executed = runAgainstArtifact({
      artifact,
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      verificationId: "V2",
    });

    assert.deepEqual(
      { ...declarative.target },
      { ...executed.target },
      "both name the same effect and the same artifact digest",
    );
    // The executed path records a `target_digest` line because it may disagree
    // with what it expected. The declarative path does not, and should not: it
    // emits evidence for values that DIVERGED, and nothing diverged here. So the
    // check is that both carry the digest in the place their own shape keeps it,
    // which for the declarative path is the target itself.
    assert.equal(
      declarative.target.artifactDigest,
      artifact.digest,
      "the declarative path names the artifact in its target",
    );
    assert.ok(
      executed.evidence.some((e) => e.kind === "target_digest" && e.value === artifact.digest),
      "the executed path names it in its evidence, because it runs something",
    );
    cleanup();
  });

  it("a moved artifact is inconclusive on the declarative path and must be on the executed one too", () => {
    // The property both paths must share, because a caller that checked one and
    // assumed the other would inherit a silent gap.
    const { artifact, cleanup } = fixture();
    const stale: VerificationTarget = { effectId: "E1", artifactDigest: digestOf("autre chose\n") };
    assert.equal(
      verify(stale, { effectId: "E1", artifactDigest: artifact.digest }, {
        kind: "artifact_digest_of",
        input: "contenu\n",
      }).verdict,
      "INCONCLUSIVE",
      "declarative path refuses to judge a target it cannot identify",
    );

    // And the executed path says INCONCLUSIVE for an absent capture rather than
    // running anything against nothing.
    const missing = runAgainstArtifact({
      artifact: { ...artifact, location: join(artifact.location, "absent") },
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      verificationId: "V3",
    });
    assert.equal(missing.verdict, "INCONCLUSIVE", "executed path refuses the same way");
    cleanup();
  });
});
