/**
 * EXP-05B: downstream evidence may discharge an obligation without inventing the
 * observation that would have settled it.
 *
 * This is the mirror of EXP-03A, and the symmetry is the point. That experiment
 * found that an artifact on disk is not a completed work, and closed the route
 * where a post-crash capture was laundered into a success. This one covers the
 * other end of the same chain: a proven work at the downstream end is not a
 * recovered launch observation at the upstream end.
 *
 * ```text
 * EXP-03A   artefact exists        != work declared complete
 * EXP-05B   downstream evidence    != upstream observation recovered
 * ```
 *
 * Both feel like tidying. Both are wrong. The tests below put the three real cases
 * side by side, and then the two repairs that must fail.
 *
 * The founding session, from EXP-05:
 *
 * ```text
 * REQUEST      EffectRequested E42
 * LAUNCH       NOT_FOUND
 * WORK         CONFIRMED_COMPLETE
 * ARTIFACT     integrity holds
 * VERIFICATION VERIFIED
 * ```
 *
 * Expected: the historical launch stays NOT_FOUND forever, and the obligation
 * stops blocking. Never `CONFIRMED_SUCCESS`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  launchObligationStanding,
  describeObligation,
  type DownstreamEvidence,
  type ObligationStanding,
} from "../src/discharge.ts";
import { reconcile, terminalObservation, type ReconciliationResult } from "../src/reconcile.ts";
import type { WorkOutcome } from "../src/work.ts";
import type { ArtifactStanding } from "../src/verify.ts";

/** The launch as it actually came back: the channel was lost. */
const NOT_FOUND: ReconciliationResult = reconcile(
  { id: "E42", effect: "SpawnAgent", subject: "fix add()", affordance: "APPROVE_GOAL", reads: {}, revision: 1 },
  { kind: "absent" },
);

/** Work that a surviving producer filed. */
const COMPLETE: WorkOutcome = {
  outcome: "CONFIRMED_COMPLETE",
  digest: "a1b2c3",
  summary: "fixed the sign",
};

/** Work the system could not settle, which is what a crash leaves. */
const UNKNOWN: WorkOutcome = { outcome: "INCONCLUSIVE", why: "no outcome receipt; the process stopping is not an outcome" };

const INTACT: ArtifactStanding = {
  integrity: "holds",
  temporalCoherence: "not-established",
  conformance: "VERIFIED",
};

function evidence(over: Partial<DownstreamEvidence> = {}): DownstreamEvidence {
  return { work: COMPLETE, artifact: INTACT, verification: "VERIFIED", ...over };
}

describe("EXP-05B case A, strong downstream evidence discharges the obligation", () => {
  it("the historical launch is unchanged and the obligation is spent", () => {
    const standing = launchObligationStanding(NOT_FOUND, evidence());

    assert.equal(standing.standing, "DISCHARGED_BY_DOWNSTREAM_EVIDENCE");
    // The load-bearing line. The gap is carried through, not closed.
    if (standing.standing !== "DISCHARGED_BY_DOWNSTREAM_EVIDENCE") return;
    assert.equal(standing.historicalOutcome, "NOT_FOUND");
  });

  it("the input outcome is not modified by the function that read it", () => {
    const before = JSON.stringify(NOT_FOUND);
    launchObligationStanding(NOT_FOUND, evidence());
    assert.equal(JSON.stringify(NOT_FOUND), before, "reading a fact never rewrites it");
    assert.equal(NOT_FOUND.outcome, "NOT_FOUND");
  });

  it("the summary states the gap and the discharge, in that order", () => {
    const said = describeObligation(launchObligationStanding(NOT_FOUND, evidence()));
    assert.match(said, /never observed/);
    assert.match(said, /gap in the record stays/);
    assert.doesNotMatch(said, /launch succeeded|launch confirmed|resolved successfully/i);
  });
});

describe("EXP-05B case B, an artifact alone is the EXP-03A laundering route", () => {
  it("a valid artifact with an unknown work outcome does not discharge", () => {
    const standing = launchObligationStanding(NOT_FOUND, evidence({ work: UNKNOWN }));

    assert.equal(standing.standing, "BLOCKING");
    assert.match(standing.why, /INCONCLUSIVE/);
    // Case B is exactly the shape EXP-03A measured: correct digest, real bytes,
    // no provenance. If this ever discharges, that experiment's result has been
    // quietly reversed.
  });

  it("a failed work outcome does not discharge either", () => {
    const failed: WorkOutcome = { outcome: "CONFIRMED_FAILED", why: "the model proposed no usable edit" };
    const standing = launchObligationStanding(NOT_FOUND, evidence({ work: failed }));
    assert.equal(standing.standing, "BLOCKING");
  });
});

describe("EXP-05B case C, produced is not relied-upon", () => {
  it("intact work with an inconclusive verdict stays blocking", () => {
    const standing = launchObligationStanding(NOT_FOUND, evidence({ verification: "INCONCLUSIVE" }));
    assert.equal(standing.standing, "BLOCKING");
    assert.match(standing.why, /conformance is INCONCLUSIVE/);
  });

  it("a rejected verdict stays blocking, and is not a discharge with bad news", () => {
    // A rejection is a settlement of the contract, not of the provenance. The
    // work is known and it is known to be wrong, which is not the same as the
    // effect having been launched.
    const standing = launchObligationStanding(NOT_FOUND, evidence({ verification: "REJECTED" }));
    assert.equal(standing.standing, "BLOCKING");
  });

  it("an artifact whose own name it does not match is refused before anything else", () => {
    const standing = launchObligationStanding(
      NOT_FOUND,
      evidence({ artifact: { integrity: "violated", temporalCoherence: "not-established", conformance: "VERIFIED" } }),
    );
    assert.equal(standing.standing, "BLOCKING");
    assert.match(standing.why, /does not match its own name/);
  });
});

describe("the two repairs that must fail", () => {
  it("'downstream evidence exists, so rewrite the launch' is refused", () => {
    // The exact shape the function is built to prevent: the caller sees evidence
    // and appends `succeeded` for a launch nobody observed. The historical value
    // is an input here, so this cannot happen inside, and the test below shows
    // the reconciliation layer independently refuses to manufacture the event.
    const standing = launchObligationStanding(NOT_FOUND, evidence());
    const historical = standing.standing === "DISCHARGED_BY_DOWNSTREAM_EVIDENCE" ? standing.historicalOutcome : NOT_FOUND.outcome;
    assert.equal(historical, "NOT_FOUND", "even at full discharge, no success was manufactured");

    // And the observation factory agrees: NOT_FOUND yields no terminal event.
    const request = { id: "E42", effect: "SpawnAgent" as const, subject: "", affordance: "APPROVE_GOAL" as const, reads: {}, revision: 1 };
    assert.equal(terminalObservation(request, NOT_FOUND), null, "no event may be written for an unobserved launch");
  });

  it("'an artifact exists, so discharge' is refused, which is case B", () => {
    // Named separately because it is the more tempting of the two: it looks
    // conservative, it is not. The artifact is the one thing a crash leaves
    // behind, so using it as a discharge would make every crash self-certifying.
    const standing = launchObligationStanding(NOT_FOUND, evidence({ work: UNKNOWN }));
    assert.equal(standing.standing, "BLOCKING");
  });

  it("no evidence at all keeps the obligation blocking", () => {
    const standing = launchObligationStanding(NOT_FOUND, null);
    assert.equal(standing.standing, "BLOCKING");
    assert.match(standing.why, /nothing downstream/);
  });

  it("a settled launch has no obligation left to discharge", () => {
    // Guarding the other direction: a function that answers DISCHARGED for a
    // launch that already succeeded would be re-deciding an existing fact.
    const settled: ReconciliationResult = reconcile(
      { id: "E43", effect: "SpawnAgent", subject: "", affordance: "APPROVE_GOAL", reads: {}, revision: 1 },
      { kind: "completed_successfully" },
    );
    const standing: ObligationStanding = launchObligationStanding(settled, evidence());
    assert.equal(standing.standing, "BLOCKING");
    assert.match(standing.why, /no unresolved obligation/);
  });
});

describe("the function is narrow on purpose", () => {
  it("it answers one question and touches one obligation", () => {
    // A counterfactual worth stating: a second real case would justify
    // generalising this into a dependency mechanism. There is no second case
    // here, so it stays a function. This test exists to fail loudly if someone
    // starts treating it as a framework.
    const standing = launchObligationStanding(NOT_FOUND, evidence());
    assert.equal(Object.keys(standing).length <= 3, true);
    assert.equal("kind" in standing, false, "and it is not a polymorphic result type waiting for siblings");
  });
});
