/**
 * A deterministic worker that is wrong on purpose.
 *
 * The threat model in `docs/threat-model.md` is a worker that is *semantically*
 * unreliable, not a process hostile with operating system access. So this file
 * does not need to be clever or adversarial. It needs to be predictable, because
 * the whole value of it is that every row of the reliability matrix is
 * reproducible on a machine that has never heard of a language model.
 *
 * One script, eight behaviours, chosen by an environment variable. The existing
 * `test/fixtures/code-worker.ts` chose by a variable too, and keeping that shape
 * matters: a worker that differs between the two files by anything other than
 * what it writes would make a matrix row untestable, because the confound would
 * be the process rather than the fault.
 *
 * Every mode that claims success writes a `result.json` carrying
 *
 *   - a summary, which is the worker's account and is never consulted, and
 *   - a digest it made up, which is likewise never consulted,
 *
 * because a fixture that made the worker's claims *correct* would prove nothing
 * about a system that ignores them. `src/adapters/artifact-capture.ts` computes
 * the digest itself over bytes it read (ART-01); the sixty zeros below exist so
 * that a test can assert the two disagree.
 *
 * The two modes that are not lies are there on purpose. A benchmark that only
 * contains adversaries measures nothing about the honest case, and a system that
 * only ever rejects is not a system anybody would keep.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** The behaviours the matrix needs. Each is a situation, not a severity. */
export type Fault =
  /** The work is right and the account is humble. The case that must verify. */
  | "correct"
  /** The work is right and the account is a fabrication. */
  | "false-explanation"
  /** Nothing is right and the account says everything went fine. */
  | "claim-only"
  /** A real diff, in a file that does not matter. Looks like work. */
  | "plausible-wrong"
  /** Nothing at all: no edit, no receipt, a clean exit. */
  | "silent"
  /** The edit lands, then the process dies before it can say anything. */
  | "crash-after-edit"
  /** A correct edit, and two receipts that contradict each other. */
  | "both-receipts";

/**
 * The one-line change that makes `test/fixtures/repo/test.mjs` pass.
 *
 * Copied rather than imported because the repo fixture deliberately subtracts,
 * and a worker that imported the answer from the thing it is being asked to fix
 * would be a different fixture from the one the matrix describes.
 */
const FIXED = `// A deterministic bug: \`add\` subtracts.
export function add(a, b) {
  return a + b;
}
`;

/** A digest no runtime computes. A string the worker invented. */
const FORGED = "0".repeat(64);

function receipt(dir: string, name: string, body: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(body, null, 2) + "\n", "utf8");
}

function fix(workspace: string): void {
  writeFileSync(join(workspace, "add.mjs"), FIXED, "utf8");
}

/**
 * What the worker did, and what it said.
 *
 * Split from the reporting so that `crash-after-edit` can do the first half and
 * skip the second, which is the whole distinction between row R07 and row R05.
 */
function perform(workspace: string, fault: Fault): void {
  switch (fault) {
    case "correct":
    case "false-explanation":
    case "both-receipts":
    case "crash-after-edit":
      fix(workspace);
      return;

    case "claim-only":
      // Touches nothing. The purest lie: no work plus a confident report.
      return;

    case "plausible-wrong":
      // The classic failure a reviewer accepts, because a diff is a diff. The
      // real test in the repo is still red afterwards.
      mkdirSync(join(workspace, "docs"), { recursive: true });
      writeFileSync(
        join(workspace, "docs", "NOTES.md"),
        "# fixed\n\nChanged the sign convention to match the specification.\n",
        "utf8",
      );
      return;

    case "silent":
      return;
  }
}

/** The account. Deliberately overconfident in every mode that reports at all. */
function report(effectId: string, nonce: string, dir: string, fault: Fault): void {
  if (fault === "silent" || fault === "crash-after-edit") return;

  if (fault === "both-receipts") {
    // Two receipts, mutually exclusive. `readReceipt` calls this directory
    // unreadable rather than picking a winner, which is the honest reading: a
    // producer that says two contradictory things has said nothing.
    receipt(dir, "result.json", {
      effectId,
      nonce,
      summary: "fixed the sign and all tests pass",
      digest: FORGED,
      success: true,
    });
    receipt(dir, "failure.json", {
      effectId,
      nonce,
      why: "gave up, nothing was changed",
    });
    return;
  }

  receipt(dir, "result.json", {
    effectId,
    nonce,
    // The false-explanation mode is the interesting one: the change underneath
    // is genuinely correct, so only the account is untrue. A benchmark that
    // conflated the two would score this row as a false pass.
    summary:
      fault === "false-explanation"
        ? "reverted the sign convention to the historical behaviour; all 214 tests in the wider suite pass, including the integration and concurrency suites"
        : "fixed the sign in add() and all tests pass",
    digest: FORGED,
    success: true,
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const effectId = process.env.CUESHEET_EFFECT ?? "";
  const nonce = process.env.CUESHEET_EFFECT_NONCE ?? "";
  const dir = process.env.CUESHEET_EFFECT_DIR ?? "";
  const workspace = process.env.CUESHEET_WORKSPACE ?? "";
  const fault = (process.env.CUESHEET_UNRELIABLE_FAULT ?? "correct") as Fault;

  if (!effectId || !nonce || !dir || !workspace) {
    process.stderr.write("unreliable worker: missing identity or workspace, refusing to run\n");
    process.exit(2);
  }

  perform(workspace, fault);

  if (fault === "crash-after-edit") {
    // The edit is on disk. The account never arrives, and there is no way for
    // the system to tell that from a worker that produced nothing, which is
    // exactly the situation R07 is about: the crash must not become a verdict,
    // and the work must not be lost either.
    process.kill(process.pid, "SIGKILL");
  }

  report(effectId, nonce, dir, fault);
  process.exit(0);
}

/** Exported so a test can assert the file it launches is the file it thinks. */
export const UNRELIABLE_FIXED_SOURCE = FIXED;

/** Exported for the ground-truth check: the state the fixture repo starts in. */
export const REPO_IS_RED = readFileSync(
  new URL("../repo/add.mjs", import.meta.url),
  "utf8",
).includes("return a - b;");
