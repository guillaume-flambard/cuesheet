/**
 * The plumbing every matrix row shares.
 *
 * The rule that produced this file is the repository's second one: a probe never
 * fabricates by hand a state that a module already knows how to construct. So
 * nothing here reimplements a launch, a capture, a receipt read or a fold. Each
 * helper below is a thin call into the production module, and the only state it
 * holds is a temporary directory and a name.
 *
 * That is what makes the matrix a measurement of Cuesheet rather than a
 * measurement of this file. If `bench()` had its own idea of how a worker
 * produces an artifact, a row could go green while Cuesheet was broken, and the
 * whole benchmark would be measuring the harness that wrote the benchmark.
 *
 * One helper does something Cuesheet does not do, and it is named
 * `workspacePasses`, because it is the ground truth and it is deliberately
 * outside the system under test: it spawns `test.mjs` directly in the live
 * workspace. It is how the matrix checks that its own declaration of which
 * workers did correct work is true, without asking Cuesheet. A row that declared
 * the work correct while the workspace was red would otherwise be a false
 * verified by construction, which is the one thing this file exists to prevent
 * even in the benchmark.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { capture, type CapturedArtifact } from "../../../src/adapters/artifact-capture.ts";
import { runAgainstArtifact, type RunOptions } from "../../../src/adapters/artifact-verifier.ts";
import { ReceiptStore } from "../../../src/adapters/effect-receipts.ts";
import { launch } from "../../../src/adapters/worker-launcher.ts";
import { EventStore, type NewEvent } from "../../../src/core/store.ts";
import { mintIdentity, type EffectIdentity } from "../../../src/spawn.ts";
import { readReceipt, workOutcomeOf, type WorkOutcome } from "../../../src/work.ts";
import type { Verification } from "../../../src/verify.ts";
import type { Fault } from "./unreliable-worker.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The deterministic worker the matrix launches. */
export const WORKER = join(HERE, "unreliable-worker.ts");
/** The workspace every row starts from: real code, one real bug, one real test. */
export const REPO = join(HERE, "..", "repo");
/** A fixed clock, so a capture carries no wall time and replays identically. */
export const FIXED_AT = 1_790_000_000_000;

export const SESSION = "S-matrix";

export interface Bench {
  root: string;
  workspace: string;
  receipts: ReceiptStore;
  identity: EffectIdentity;
  effectDir: string;
  /** Set once `runWorker` returns, so a row can assert on the process itself. */
  process: { exitCode: number | null; signal: NodeJS.Signals | null } | null;
}

export function bench(effectId: string): Bench {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-matrix-"));
  LIVE.add(root);
  const workspace = join(root, "workspace");
  cpSync(REPO, workspace, { recursive: true });
  const identity = mintIdentity(effectId);
  return {
    root,
    workspace,
    receipts: new ReceiptStore({ root }),
    identity,
    effectDir: join(root, SESSION, "effects", effectId),
    process: null,
  };
}

/**
 * Roots handed out and not yet released.
 *
 * A row that throws between `bench()` and its `cleanup()` leaves a directory
 * behind, and a benchmark that runs 13 rows against 11 mutants is exactly where
 * that goes unnoticed: nothing fails, the disk fills. Tracked here so
 * `leakedBenches` can report it, and so the safety net is not mistaken for the
 * plan. Cleaning up is the row's job.
 */
const LIVE = new Set<string>();

export function cleanup(b: Bench): void {
  rmSync(b.root, { recursive: true, force: true });
  LIVE.delete(b.root);
}

/** How many bench roots are still open. Asserted to be zero. */
export function leakedBenches(): number {
  return LIVE.size;
}

/** Remove anything still open. Returns how many it had to. */
export function sweepBenches(): number {
  const n = LIVE.size;
  for (const root of LIVE) rmSync(root, { recursive: true, force: true });
  LIVE.clear();
  return n;
}

/**
 * Start the worker for real and wait for it to stop.
 *
 * A real process, launched by the production launcher, writing into the
 * directory the production receipt store prepared. Nothing here is a function
 * call dressed up as one.
 *
 * A worker that kills itself leaves `exitCode` null and a signal, which is a
 * fact about the process and not about the work, and the two are kept in
 * separate fields precisely so a row cannot quietly read one as the other.
 */
export async function runWorker(b: Bench, fault: Fault): Promise<Bench> {
  const { child } = launch(
    {
      sessionId: SESSION,
      identity: b.identity,
      receipts: b.receipts,
      script: WORKER,
      input: "make the failing test pass",
      env: { CUESHEET_UNRELIABLE_FAULT: fault, CUESHEET_WORKSPACE: b.workspace },
    },
    b.root,
  );
  const stopped = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (done) => child.on("exit", (code, signal) => done({ code, signal })),
  );
  b.process = { exitCode: stopped.code, signal: stopped.signal };
  return b;
}

/**
 * Freeze the workspace, with the runtime's own clock, not one supplied by a
 * fixture. A capture that took its time from a parameter could be made to look
 * older or newer than it is, and nothing in the matrix needs that flexibility.
 */
export function captureWorkspace(b: Bench, effectId = b.identity.effectId): CapturedArtifact {
  return capture({
    sessionId: SESSION,
    effectId,
    workspace: b.workspace,
    root: b.root,
    now: () => FIXED_AT,
  });
}

/**
 * The oracle: run the repository's own test, inside the capture.
 *
 * `command` and `args` are parameters because row R10 needs a runner that cannot
 * run and one that hangs. Everything else about the call is fixed, so a row
 * cannot accidentally verify the wrong thing by passing the wrong flag.
 */
export function verifyCaptureArtifact(
  artifact: CapturedArtifact,
  overrides: Partial<Pick<RunOptions, "command" | "args" | "timeoutMs">> = {},
): Verification {
  return runAgainstArtifact({
    artifact,
    command: overrides.command ?? process.execPath,
    args: overrides.args ?? ["test.mjs"],
    timeoutMs: overrides.timeoutMs,
    verificationId: `V-${artifact.artifactId}`,
  });
}

/**
 * What the worker left behind, read through the production reader.
 *
 * `readReceipt` takes its three primitives as parameters so the damage a receipt
 * can suffer is enumerated in one place. This wires them to a real directory and
 * changes nothing, which is the point: the matrix does not get to decide what a
 * malformed receipt means.
 */
export function workOutcomeOnDisk(b: Bench): WorkOutcome {
  const view = readReceipt(
    b.identity.effectId,
    b.identity.nonce,
    (name) => existsSync(join(b.effectDir, name)),
    (name) => {
      try {
        return readFileSync(join(b.effectDir, name), "utf8");
      } catch {
        return null;
      }
    },
    (name) => {
      try {
        return JSON.parse(readFileSync(join(b.effectDir, name), "utf8"));
      } catch {
        return undefined;
      }
    },
  );
  return workOutcomeOf(b.identity.effectId, view);
}

/** The raw receipt, for rows that need to look at the worker's own account. */
export function receiptOnDisk(b: Bench, name: string): Record<string, unknown> | null {
  const file = join(b.effectDir, name);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Ground truth, deliberately outside the system under test.
 *
 * A direct `spawnSync` of the repository's test in the live workspace. It
 * answers "is the work actually correct" with no capture, no freeze, no verdict
 * and no Cuesheet anywhere in the path, which is what makes it usable as the
 * check on the matrix's own declarations.
 */
export function workspacePasses(workspace: string): boolean {
  return spawnSync(process.execPath, ["test.mjs"], { cwd: workspace, encoding: "utf8" }).status === 0;
}

/** A store with a fixed clock, so two runs of the same row are identical. */
export function storeWith(events: readonly NewEvent[], id = "S-matrix"): EventStore {
  const store = new EventStore(id, () => FIXED_AT);
  for (const event of events) store.append(event);
  return store;
}

/** Did the log record that work was produced, and what did the worker say? */
export function productionEvent(
  effectId: string,
  artifact: CapturedArtifact,
  summary: string,
): NewEvent {
  return {
    kind: "work_produced",
    subject: `fix add() for ${effectId}`,
    data: {
      effectId,
      artifactId: artifact.artifactId,
      artifactDigest: artifact.digest,
      summary,
    },
  };
}
