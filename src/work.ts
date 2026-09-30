/**
 * What the work produced, which is not what the spawn was.
 *
 * Three questions, and P12 proved they are three:
 *
 * ```text
 * Launch        was the process really started?
 * Liveness      is it running right now?
 * Work outcome  did it actually produce what was asked?
 * ```
 *
 * So the obvious encoding is wrong in both directions:
 *
 * ```text
 * exit 0 -> success      a worker can exit cleanly having produced nothing
 * exit 1 -> failure      a worker can exit badly having produced exactly what
 *                         was asked for, and the result is still a result
 * ```
 *
 * This module therefore never reads an exit code. It reads a receipt that the
 * worker wrote about its own output, which is the only place an outcome can come
 * from. WRK-04 follows: a process that stops without leaving an outcome leaves
 * the work outcome unknown, and unknown is not failure.
 *
 * The worker's exit receipt exists and is not consulted here. It is evidence
 * about the *process*, which is a different question with a different answer,
 * and reading it would quietly merge two contracts that P12 separated on purpose.
 */

/**
 * What can be known about a worker's output.
 *
 * Three states, and the absence of the third is the whole design: there is no
 * `NO_RESULT_YET` treated as failure, and no exit code as a shortcut.
 */
export type WorkOutcome =
  /** The worker left a readable result describing this effect. */
  | { readonly outcome: "CONFIRMED_COMPLETE"; readonly digest: string; readonly summary: string }
  /** The worker left a readable failure describing this effect. */
  | { readonly outcome: "CONFIRMED_FAILED"; readonly why: string }
  /**
   * Nothing usable: no receipt, an unreadable one, or one that describes a
   * different effect.
   *
   * WRK-06 in one value. A record that exists and cannot be read is not the same
   * as no record, and neither is evidence of either outcome.
   */
  | { readonly outcome: "INCONCLUSIVE"; readonly why: string };

/**
 * A receipt body, as read off disk. Never interpreted here.
 */
export interface ResultReceipt {
  effectId: string;
  nonce: string;
  /** What was produced, in terms a human can check. */
  summary: string;
  /** A content digest, so the output is verifiable rather than asserted. */
  digest: string;
}

export interface FailureReceipt {
  effectId: string;
  nonce: string;
  why: string;
}

/**
 * What a receipt directory holds.
 *
 * `read` returns a discriminated value rather than throwing, because "cannot be
 * read" is an answer here and not an error. An adapter that threw would force
 * every caller into a catch, and a caller in a catch has stopped reading.
 */
export type ReceiptView =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "result"; readonly receipt: ResultReceipt }
  | { readonly kind: "failure"; readonly receipt: FailureReceipt };

/**
 * Read one receipt slot into a view, given the three things a reader can do.
 *
 * Taking the three primitives as parameters rather than reaching for the
 * filesystem is what keeps this pure and testable: `exists`, `text` and
 * `parsed` are injected, so the damage a receipt can suffer is enumerated here
 * rather than discovered later.
 */
export function readReceipt(
  effectId: string,
  nonce: string,
  exists: (name: string) => boolean,
  text: (name: string) => string | null,
  parsed: (name: string) => unknown,
): ReceiptView {
  // A failure receipt is read first because it is the more specific claim. If
  // both exist, the directory is inconsistent and the honest answer is that
  // neither can be trusted, which the `unreadable` branch below reports.
  const hasFailure = exists("failure.json");
  const hasResult = exists("result.json");

  if (hasFailure && hasResult) {
    return {
      kind: "unreadable",
      why: `${effectId} has both a result and a failure receipt; neither can be trusted`,
    };
  }

  if (hasFailure) {
    const body = parsed("failure.json");
    if (body === undefined) {
      return { kind: "unreadable", why: `failure.json for ${effectId} is not readable` };
    }
    const receipt = body as Partial<FailureReceipt>;
    if (receipt.effectId !== effectId || typeof receipt.why !== "string") {
      return {
        kind: "unreadable",
        why: `failure.json does not describe ${effectId}`,
      };
    }
    return { kind: "failure", receipt: { effectId, nonce, why: receipt.why } };
  }

  if (!hasResult) {
    // WRK-04: nothing was produced, which is a fact about the receipts and not
    // an outcome. The work may still be running, may have died, or may have
    // exited having produced something it never recorded.
    return { kind: "absent" };
  }

  const body = parsed("result.json");
  if (body === undefined) {
    // WRK-06: the file exists and cannot be read. Merging this with `absent` is
    // what would turn a truncated receipt into a guess.
    return { kind: "unreadable", why: `result.json for ${effectId} is not readable` };
  }
  const receipt = body as Partial<ResultReceipt>;
  if (
    receipt.effectId !== effectId ||
    typeof receipt.digest !== "string" ||
    typeof receipt.summary !== "string"
  ) {
    return { kind: "unreadable", why: `result.json does not describe ${effectId}` };
  }
  return {
    kind: "result",
    receipt: {
      effectId,
      nonce: receipt.nonce ?? nonce,
      digest: receipt.digest,
      summary: receipt.summary,
    },
  };
}

/**
 * Turn a receipt view into a work outcome.
 *
 * Pure. The view is the evidence and the outcome is the reading, and keeping
 * them apart means a test can hold both and check the reading without touching
 * a filesystem.
 */
export function workOutcomeOf(effectId: string, view: ReceiptView): WorkOutcome {
  switch (view.kind) {
    case "result":
      return {
        outcome: "CONFIRMED_COMPLETE",
        digest: view.receipt.digest,
        summary: view.receipt.summary,
      };
    case "failure":
      return { outcome: "CONFIRMED_FAILED", why: view.receipt.why };
    case "absent":
      return {
        outcome: "INCONCLUSIVE",
        why: `no outcome receipt for ${effectId}; the process stopping is not an outcome`,
      };
    case "unreadable":
      return { outcome: "INCONCLUSIVE", why: view.why };
  }
}

/** True when this outcome settles the work, one way or the other. */
export function settlesWork(outcome: WorkOutcome): boolean {
  return outcome.outcome !== "INCONCLUSIVE";
}

/**
 * A sentence for a surface. The honest answer here is usually longer than a
 * status, and a surface left to invent a short one will invent a wrong one.
 */
export function describeWork(outcome: WorkOutcome): string {
  switch (outcome.outcome) {
    case "CONFIRMED_COMPLETE":
      return `produced: ${outcome.summary}`;
    case "CONFIRMED_FAILED":
      return `the worker failed: ${outcome.why}`;
    case "INCONCLUSIVE":
      return `still unknown what it produced: ${outcome.why}`;
  }
}
