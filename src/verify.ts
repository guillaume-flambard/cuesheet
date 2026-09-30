/**
 * Producing work, and deciding whether it counts. Never the same thing.
 *
 * The deterministic worker finished P13 with a property that is about to stop
 * being automatic: its output could be checked by recomputing a digest. An LLM
 * cannot be checked that way. It can report
 *
 * ```text
 * "I fixed the bug."        with a file that is genuinely wrong
 * "All the tests pass."     having run nothing
 * ```
 *
 * or produce a correct change with a false account of why. So the check has to
 * move out of the worker, and the only way to do that without inventing a new
 * kind of trust is to say plainly what already was true:
 *
 * > The producer of a result cannot be the authority that establishes the
 * > result satisfies the request.
 *
 * `result.json` therefore means something narrower than success:
 *
 * > this worker asserts it produced this, and here is the artifact the assertion
 * > is about.
 *
 * Verification is a separate act by a separate party, naming what it evaluated.
 * VER-03 is the load-bearing detail. A verification that says "verified" without
 * saying *which* artifact, at *which* digest, is a verdict about nothing in
 * particular, and it will still be believed later when the artifact has been
 * replaced.
 *
 * Everything here is pure. The verifier is handed an artifact and a requirement
 * the request declared, and returns a verdict plus the evidence for it. Nothing
 * reads a clock, and nothing reads the worker's opinion.
 */

import { createHash } from "node:crypto";

/**
 * What a verification is about, named exactly.
 *
 * Both halves matter. The effect says whose work this is; the digest says which
 * version of it. A verifier that names only the effect is verifying whatever
 * happens to be in that directory when it looks.
 */
export interface VerificationTarget {
  effectId: string;
  /** The digest of the artifact the verification is about. */
  artifactDigest: string;
}

/**
 * What the request said the work had to satisfy.
 *
 * One requirement kind, on purpose. A goal contract that can express an
 * arbitrary predicate needs an evaluator, and an evaluator is a place where
 * something has to be trusted. Until a second kind is genuinely needed, this
 * stays checkable by recomputation rather than by judgement.
 */
export type VerificationRequirement =
  /**
   * The artifact must be the digest of this exact input.
   *
   * The verifier hashes the input itself rather than comparing against a number
   * the worker or the goal supplied, so neither can state the answer.
   */
  | { readonly kind: "artifact_digest_of"; readonly input: string };

/**
 * What the producer asserted.
 *
 * Only `artifactDigest` is load-bearing here. The rest of this interface is the
 * producer's account of its own work, and none of it is consulted when a verdict
 * is formed. It is typed rather than dropped so the compiler can say so, and so
 * a worker that reports a `success` flag has somewhere to put it that the
 * architecture already declares powerless.
 */
export interface WorkArtifact {
  effectId: string;
  artifactDigest: string;
  /** The producer's own summary of what it did. Evidence of nothing. */
  claimedSummary?: string;
  /**
   * A producer's self-assessment, kept only so a test can prove it is ignored.
   *
   * This field existing is the point of VER-02 being testable: a lying worker
   * can write `success: true` and the verdict will still be REJECTED.
   */
  producerClaim?: { success: boolean; reason?: string };
}

/**
 * The three verdicts, and the one that is load-bearing.
 *
 * INCONCLUSIVE is not a polite middle. A verification whose target moved, or
 * whose requirement could not be evaluated, says nothing, and the third verdict
 * is what makes that expressible instead of forcing a binary.
 */
export type VerificationVerdict = "VERIFIED" | "REJECTED" | "INCONCLUSIVE";

/** One thing the verifier actually looked at. */
export interface VerificationEvidence {
  readonly kind:
    | "expected_digest"
    | "actual_digest"
    | "target_digest"
    | "producer_claim_ignored";
  readonly value: string;
}

export interface Verification {
  readonly target: VerificationTarget;
  readonly verdict: VerificationVerdict;
  readonly evidence: readonly VerificationEvidence[];
}

/** SHA256 of a string, hex. The one computation this module performs. */
export const digestOf = (input: string): string =>
  createHash("sha256").update(input).digest("hex");

/**
 * Verify an artifact against what the request required.
 *
 * Pure. Three arguments, all data, no world. The producer's own account is
 * carried in the artifact and deliberately unused except to record that it was
 * ignored, which is the only way to make VER-02 checkable rather than merely
 * asserted.
 *
 * The order of the checks is the substance of VER-03:
 *
 * ```text
 * the artifact is not the one I was asked about -> INCONCLUSIVE
 * the artifact does not satisfy the requirement -> REJECTED
 * it does                                          -> VERIFIED
 * ```
 *
 * A moved artifact is inconclusive rather than rejected, because "this is not
 * the artifact I was asked about" is a statement about the target, not about
 * the quality of the work. Rejecting it would let a verifier refuse work for
 * having been superseded, which is a different failure and an equally wrong one.
 */
export function verify(
  target: VerificationTarget,
  artifact: WorkArtifact,
  requirement: VerificationRequirement,
): Verification {
  const evidence: VerificationEvidence[] = [];

  if (artifact.effectId !== target.effectId) {
    return {
      target,
      verdict: "INCONCLUSIVE",
      evidence: [
        ...evidence,
        {
          kind: "actual_digest",
          value: `artifact belongs to ${artifact.effectId}, not ${target.effectId}`,
        },
      ],
    };
  }

  // VER-03: the artifact must still be the one that was produced. If the digest
  // moved, the verifier is looking at something else and any verdict would be
  // about that something else.
  if (artifact.artifactDigest !== target.artifactDigest) {
    return {
      target,
      verdict: "INCONCLUSIVE",
      evidence: [
        ...evidence,
        { kind: "target_digest", value: target.artifactDigest },
        { kind: "actual_digest", value: artifact.artifactDigest },
      ],
    };
  }

  if (artifact.producerClaim) {
    evidence.push({
      kind: "producer_claim_ignored",
      value: `producer asserted success=${String(artifact.producerClaim.success)}; not consulted`,
    });
  }

  const expected = digestOf(requirement.input);
  evidence.push({ kind: "expected_digest", value: expected });
  evidence.push({ kind: "actual_digest", value: artifact.artifactDigest });

  // The only thing that can produce a VERIFIED. The producer is not involved in
  // this comparison and never appears on either side of it.
  return {
    target,
    verdict: artifact.artifactDigest === expected ? "VERIFIED" : "REJECTED",
    evidence,
  };
}

/** True when this verdict settles the work as acceptable. */
export function accepts(verification: Verification): boolean {
  return verification.verdict === "VERIFIED";
}

/**
 * A sentence for a surface.
 *
 * A verification is the first thing a person will want to read, and the useful
 * part is which artifact it was about, so that is in the sentence.
 */
export function describeVerification(verification: Verification): string {
  const artifact = verification.target.artifactDigest.slice(0, 12);
  switch (verification.verdict) {
    case "VERIFIED":
      return `verified against ${artifact}`;
    case "REJECTED":
      return `rejected; ${artifact} does not satisfy what was asked`;
    case "INCONCLUSIVE":
      return `still unknown; the check was about ${artifact} and could not be made`;
  }
}
