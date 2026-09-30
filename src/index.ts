/**
 * Cuesheet Core — the public surface of the pure, UI-agnostic state machine.
 *
 * This file is an index and nothing else. It declares no behaviour, and every
 * name below is re-exported from the module that defines it, so that a surface
 * or a package can import the vocabulary without knowing the file layout.
 *
 * The previous version of this file caused a real regression rather than a
 * cosmetic one. It imported with `.js` extensions where the whole repository
 * imports with `.ts`, and it re-exported four names that do not exist:
 * `settlesWork` and `settles` from the same module, `liveRegistry`, and
 * `satisfies`. LOAD-01 caught the first immediately; the rest were found by
 * asking the modules what they actually export.
 *
 * The lesson is worth more than the fix. An index file is the one file where a
 * plausible guess is indistinguishable from a real export until something
 * imports it, so it is written by reading the modules rather than by recalling
 * them. The boundary test that caught it is `test/loadability.test.ts`, which
 * imports every module under `src` precisely so that a file nobody imports is
 * still checked.
 */

// The state machine: what is true, and what a person may now do about it.
export { deriveState, stateReport, seen, unknown } from "./state.ts";
export { affordancesOf, type Affordance } from "./affordances.ts";

// Effects: a request and its answer are two separate facts.
export {
  classifyFailure,
  effectObserved,
  effectRequested,
  type EffectRequest,
} from "./effects.ts";

// Durable stores. The session store is the only owner of sequence numbers.
export { SessionStore } from "./adapters/session-store.ts";
export { ReceiptStore } from "./adapters/effect-receipts.ts";

// Work: what a producer did, and how that is known.
export {
  workOutcomeOf,
  readReceipt,
  settlesWork,
  describeWork,
  type WorkOutcome,
  type ReceiptView,
} from "./work.ts";

// Artifacts and the independent check. Three dimensions, kept apart.
export { capture, verifyCapture, readCapture, COVERAGE_LIMITS, type CapturedArtifact } from "./adapters/artifact-capture.ts";
export { runAgainstArtifact } from "./adapters/artifact-verifier.ts";
export {
  type Verification,
  type VerificationEvidence,
  type VerificationVerdict,
  type ArtifactStanding,
  type WorkStanding,
} from "./verify.ts";

// Reconciliation, and the discharge that never rewrites a gap.
export {
  reconcile,
  settles,
  terminalObservation,
  describe as describeReconciliation,
  type ReconciliationResult,
  type RealityObservation,
} from "./reconcile.ts";
export {
  launchObligationStanding,
  describeObligation,
  type ObligationStanding,
  type DownstreamEvidence,
} from "./discharge.ts";

// Identity and ownership, read from git rather than recalled.
export { mintIdentity, type EffectIdentity } from "./spawn.ts";
export { snapshotPortfolio, type PortfolioSnapshot, type RepoReality } from "./adapters/frontier.ts";
export { bindProject, mayApprove, describeBinding, type Binding } from "./adapters/project-binding.ts";

// The loop's vocabulary, for anything that implements a model adapter.
export type { ModelAdapter, ContextFrame, ModelResponse, ToolRequest, ToolResult } from "./core/loop.ts";
export type { Requirement, Capability } from "./core/capability.ts";
