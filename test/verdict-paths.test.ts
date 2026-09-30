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
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

describe("a verification number is named by the oracle that produced it", () => {
  it("no document states a bare FALSE VERIFIED", () => {
    // Cuesheet has two verdict paths and they can disagree on one artifact, so
    // a bare "FALSE VERIFIED: 0" is only ever true of a named population. The
    // number becomes a lie the moment a reader assumes it covers both, and the
    // reader is the only thing that makes a reliability figure mean anything.
    //
    // The rule is checked against the documents rather than trusted to them,
    // because the first version of the matrix did state it bare and the sentence
    // read perfectly well.
    const docs = join(import.meta.dirname, "..", "docs");
    const offenders: string[] = [];
    for (const name of readdirSync(docs)) {
      if (!name.endsWith(".md")) continue;
      const text = readFileSync(join(docs, name), "utf8");
      for (const line of text.split("\n")) {
        if (!/FALSE VERIFIED/i.test(line)) continue;
        // A line that names its oracle, or that is defining the vocabulary or
        // explaining the rule, is fine. A line reporting a figure without one is
        // not. The distinction is a backtick: an inline-code figure is a mention,
        // a bare one is an assertion.
        const inCode = line.includes("`");
        const reports = !inCode && /=\s*[-0-9]|:\s*0\b/.test(line);
        const namesOracle = /\[(verify|runAgainstArtifact)\]/.test(line);
        const isVocabulary = /FALSE VERIFIED\s+a VERIFIED/.test(line);
        if (reports && !namesOracle && !isVocabulary) {
          offenders.push(`${name}: ${line.trim()}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `a verification figure without its oracle:\n${offenders.join("\n")}`,
    );
  });

  it("the matrix states which path is unmeasured rather than calling it zero", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "docs", "reliability-matrix.md"), "utf8");
    // `UNMEASURED`, not `0`. An absent measurement written as zero is the exact
    // invention this project has spent fifteen milestones removing.
    assert.match(
      text,
      /FALSE_VERIFIED\[verify\]\s*=\s*UNMEASURED/,
      "the unmeasured path is named as unmeasured",
    );
    assert.match(
      text,
      /FALSE_VERIFIED\[runAgainstArtifact\]\s*=\s*0/,
      "and the measured one is named with its figure",
    );
  });
});
