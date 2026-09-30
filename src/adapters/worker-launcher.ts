/**
 * Launching a worker, and being the only thing allowed to.
 *
 * The launcher is the boundary WRK-02 needs. It is handed an effect that has
 * already been named, it prepares the worker's directory, it starts a real
 * process, and only then does it write `started.json` because the launch is the
 * fact that receipt is about.
 *
 * Ordering matters and is not incidental:
 *
 * ```text
 * identity minted      -> Cuesheet knows what to look for, before anything runs
 * directory prepared   -> the worker can write without being told where to
 * process started      -> the world has changed
 * started.json written -> and now that fact is durable
 * ```
 *
 * A crash between the third line and the fourth leaves a launched process that
 * no receipt admits to. That window is real and P12's `NOT_FOUND` is the honest
 * answer for it, which is why `prepares` and `started` are separate steps a
 * caller can observe rather than one that either happens or does not.
 *
 * The launcher never writes to the session store. It returns; Cuesheet observes
 * and decides. A launcher that could mark a goal done would be able to lie
 * about the one thing everything else here exists to keep honest.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ReceiptStore } from "./effect-receipts.ts";
import { workerEnvironment, type EffectIdentity } from "../spawn.ts";

export interface LaunchOptions {
  /** Which session this belongs to, for the worker's environment. */
  sessionId: string;
  /** The effect that authorised this, already named and logged. */
  identity: EffectIdentity;
  /** Where receipts go. The worker is given this directory and no other. */
  receipts: ReceiptStore;
  /** The worker script to run. A real process, not a function call. */
  script: string;
  /** What the worker should read. Written as `input.json` in its directory. */
  input?: string;
  /** Node executable, overridable so a test can pin it. */
  node?: string;
  /**
   * Extra environment for the worker, merged over the inherited one.
   *
   * Adapters own what the worker must know, which is the identity. Anything
   * beyond that is configuration the caller decides, and hard-coding it here
   * would mean a new kind of worker needs a change to the launcher. The first
   * version of the fixture test failed because the mode could not be passed at
   * all and every worker ran honest, so the oracle looked like it worked.
   */
  env?: Record<string, string>;
}

export interface LaunchResult {
  /** What was launched, for a human reading a log. */
  pid: number;
  /** The worker process, detached enough to be waited on separately. */
  child: ReturnType<typeof spawn>;
}

/**
 * Prepare the worker's directory without starting anything.
 *
 * Separate from `launch` so the identity can be written down before the world
 * changes, and so a caller that crashes between preparing and launching leaves a
 * directory that P12 can honestly report as `NOT_FOUND` rather than guessing.
 */
export function prepare(
  options: Pick<LaunchOptions, "sessionId" | "identity" | "receipts" | "input">,
  root: string,
): string {
  const dir = join(root, options.sessionId, "effects", options.identity.effectId);
  mkdirSync(dir, { recursive: true });
  if (options.input !== undefined) {
    writeFileSync(join(dir, "input.json"), options.input, "utf8");
  }
  return dir;
}

/**
 * Start the worker, then record that it started.
 *
 * Returns once the process exists. It does not wait for the worker to finish:
 * liveness is a separate question, asked separately, and a launcher that waited
 * would be a launcher that had already decided the effect was over.
 */
export function launch(options: LaunchOptions, root: string): LaunchResult {
  const dir = prepare(options, root);
  const env = {
    ...process.env,
    ...options.env,
    ...workerEnvironment(options.sessionId, options.identity),
    // The worker's only writable surface. WRK-02: it is handed a directory and
    // an identity, and the session store is not reachable from either.
    CUESHEET_EFFECT_DIR: dir,
  };

  const child = spawn(options.node ?? process.execPath, [options.script], {
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });

  const pid = child.pid;
  if (typeof pid !== "number") {
    // The process never came into existence, so this is a refusal the caller
    // can record honestly rather than a launch that failed after starting.
    throw new Error(`worker for ${options.identity.effectId} did not start`);
  }

  // Written after the spawn, because it claims the spawn happened.
  options.receipts.writeStarted(options.sessionId, {
    effectId: options.identity.effectId,
    nonce: options.identity.nonce,
    pid,
    startedAt: Date.now(),
    subject: options.identity.reconciliationKey,
  });

  return { pid, child };
}

/** The worker's own environment, for a test that wants to inspect it. */
export function environmentFor(
  sessionId: string,
  identity: EffectIdentity,
  dir: string,
): Record<string, string> {
  return { ...workerEnvironment(sessionId, identity), CUESHEET_EFFECT_DIR: dir };
}
