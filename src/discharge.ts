/**
 * Discharging an obligation without inventing the observation that would have settled it.
 *
 * EXP-05 ran a real model to a real artifact, then killed the process before any
 * verification. The restart found three truths that do not contradict each other:
 *
 * ```text
 * REQUEST      EffectRequested is in the log
 * LAUNCH       NOT_FOUND          the launch channel was lost
 * WORK         CONFIRMED_COMPLETE the work is durable on disk
 * VERIFICATION VERIFIED           the work satisfies the contract
 * ```
 *
 * The temptation is to tidy that into a story. Both tiding routes are wrong, and
 * they fail in opposite directions.
 *
 * ```text
 * rewrite history   LAUNCH -> CONFIRMED_SUCCESS     forbidden, nothing observed it
 * ignore the gap     the launch never happened      forbidden, the gap is real
 * ```
 *
 * What is legitimate is narrower and more useful: the launch was asked about
 * because the work's provenance depended on it, and the work's provenance is now
 * established by other means. The obligation is spent. The question was never
 * answered.
 *
 * ```text
 * history   launch.outcome = NOT_FOUND, forever
 * control   launch.obligation = no longer blocking
 * ```
 *
 * The one property that makes this safe is that it is a *separate question*. The
 * historical outcome is an input, never an output. Nothing in this file can turn
 * `NOT_FOUND` into `CONFIRMED_SUCCESS`, because nothing in this file writes a
 * fact. If a future change makes it do that, the whole distinction is gone and
 * EXP-03A's laundering rule comes back through the other door.
 *
 * The symmetry with EXP-03A is deliberate. That experiment found that
 *
 * ```text
 * artefact exists != work declared complete
 * ```
 *
 * and this one is the mirror:
 *
 * ```text
 * downstream evidence exists != upstream observation recovered
 * ```
 *
 * Both are the same error at two ends of the same chain, and they are easy to
 * confuse because both feel like tidying.
 *
 * ## Why it is one narrow function and not a graph
 *
 * A second real case would justify generalising. Until then this answers exactly
 * one question about exactly one obligation, which is the only way to know that
 * the answer is right. A general mechanism would be a claim about dependency
 * resolution, and no such claim has been tested here.
 */

import type { ReconciliationResult } from "./reconcile.ts";
import type { WorkOutcome } from "./work.ts";
import type { ArtifactStanding } from "./verify.ts";

/**
 * Whether an unresolved obligation still blocks, and on what grounds.
 *
 * `DISCHARGED_BY_DOWNSTREAM_EVIDENCE` is a control state, not an outcome. It says
 * the system may proceed; it does not say the question was answered, and it is
 * not interchangeable with any `ReconciliationResult`.
 */
export type ObligationStanding =
  /** Still waiting on an observation nobody has. */
  | { readonly standing: "BLOCKING"; readonly why: string }
  /** Downstream evidence settles the operational question. History unchanged. */
  | {
      readonly standing: "DISCHARGED_BY_DOWNSTREAM_EVIDENCE";
      /** What the gap still is, in words, because it is still a gap. */
      readonly historicalOutcome: "NOT_FOUND";
      /** Why this is enough to stop waiting. */
      readonly by: string;
    };

/** The evidence a discharge is allowed to rest on. */
export interface DownstreamEvidence {
  /** What the work outcome says. Provenance depends on this. */
  readonly work: WorkOutcome;
  /** The standing of the artifact the work produced. */
  readonly artifact: ArtifactStanding;
  /** The conformance verdict, named so it cannot be confused with the others. */
  readonly verification: "VERIFIED" | "REJECTED" | "INCONCLUSIVE";
}

/**
 * The launch obligation, given what is now known.
 *
 * Narrow on purpose. It answers one question, for one obligation, and it takes
 * the historical outcome as read-only evidence.
 *
 * The three cases EXP-05B lays out, and what each one settles:
 *
 * ```text
 * A  work CONFIRMED_COMPLETE + integrity holds + VERIFIED   DISCHARGED
 * B  work INCONCLUSIVE       + integrity holds + VERIFIED   BLOCKING
 * C  work CONFIRMED_COMPLETE + verification INCONCLUSIVE    BLOCKING
 * ```
 *
 * Case B is the one EXP-03A earns. An artifact on its own is exactly what a
 * crashed producer leaves behind, and a capture of it has a correct digest and
 * no provenance. Letting an artifact discharge the launch would reopen the
 * laundering route that experiment closed.
 *
 * Case C is the conservative one: "the work exists" is not "the work is right",
 * and the operational question the launch was tracking was never "was anything
 * produced" but "can this be relied on". A REJECTED verdict is not a substitute
 * either, and the caller gets a reason rather than a shrug.
 */
export function launchObligationStanding(
  launch: ReconciliationResult,
  evidence: DownstreamEvidence | null,
): ObligationStanding {
  // Only an unresolved obligation can be discharged. A settled one is neither
  // blocking nor newly unblocked; it is settled, and re-deciding it here would be
  // a second source of truth for an outcome that already exists.
  if (launch.outcome !== "NOT_FOUND") {
    return {
      standing: "BLOCKING",
      why: `the launch answered ${launch.outcome}, so there is no unresolved obligation to discharge`,
    };
  }

  if (evidence === null) {
    return { standing: "BLOCKING", why: "the launch was not found and nothing downstream has been checked" };
  }

  if (evidence.work.outcome !== "CONFIRMED_COMPLETE") {
    return {
      standing: "BLOCKING",
      why: `the work outcome is ${evidence.work.outcome}, which does not establish that this effect produced it`,
    };
  }

  if (evidence.artifact.integrity !== "holds") {
    return {
      standing: "BLOCKING",
      why: "the artifact does not match its own name, so there is nothing downstream to rely on",
    };
  }

  if (evidence.verification !== "VERIFIED") {
    return {
      standing: "BLOCKING",
      why: `the work exists and is intact but its conformance is ${evidence.verification}, so the operational question is open`,
    };
  }

  // The only path to a discharge. Every one of the three preconditions is about
  // work that was actually observed, and the historical outcome is carried
  // through unchanged rather than replaced.
  return {
    standing: "DISCHARGED_BY_DOWNSTREAM_EVIDENCE",
    historicalOutcome: "NOT_FOUND",
    by: "durable work, intact artifact, and a satisfied contract were all observed directly",
  };
}

/**
 * A sentence for a surface and for a person reading a session later.
 *
 * The historical gap and the control state are both stated, in that order, and
 * the gap is never softened. A summary that says only "resolved" would be the
 * same tidy-up this file exists to prevent, one level up.
 */
export function describeObligation(standing: ObligationStanding): string {
  if (standing.standing === "BLOCKING") return standing.why;
  return (
    `the launch was never observed and never will be; the obligation is spent because ` +
    `${standing.by}. the gap in the record stays.`
  );
}
