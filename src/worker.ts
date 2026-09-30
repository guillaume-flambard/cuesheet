/**
 * The first worker. Deterministic on purpose.
 *
 * This is not an agent and does not pretend to be one. Its job is to be a real
 * process that really acts, really can crash, and really leaves evidence, so
 * the runtime around it can be tested without a model's non-determinism
 * explaining any failure it sees.
 *
 * ```text
 * read input.json
 * compute a digest of what it read
 * write result.json
 * exit 0
 * ```
 *
 * WRK-02, and it is structural rather than promised. This file imports nothing
 * from the session store, from the event log, or from the core. It is handed an
 * identity in its environment and a directory to write into, and those are the
 * only two things it has. It cannot declare that a goal was met, because it has
 * no vocabulary for goals, no session, and no way to address one.
 *
 * It can bring evidence. Cuesheet reads the evidence and decides.
 */

import { createHash } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "./is-entry-point.ts";

/**
 * Write a receipt atomically: temporary name, fsync, rename.
 *
 * A reader then sees a whole receipt or none at all. A truncated `result.json`
 * is the failure this exists to make rare, because a truncated one is
 * INCONCLUSIVE and a launcher that crashes mid-write would otherwise turn a
 * completed job into an unanswerable question.
 */
function writeReceipt(dir: string, name: string, value: unknown): void {
  const target = join(dir, name);
  const tmp = `${target}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
}

/**
 * Do the work. Exported rather than called at the bottom so importing this file
 * does not run it.
 *
 * LOAD-01 exists because a module that cannot be imported is a module nothing
 * can check. A worker whose entry point doubles as its top-level statement
 * cannot be imported, and so cannot be verified by anything except running it,
 * which is the worst possible arrangement: the file that acts on the world is
 * also the only file nobody can inspect without side effects.
 */
export async function main(): Promise<number> {
  const effectId = process.env.CUESHEET_EFFECT;
  const nonce = process.env.CUESHEET_EFFECT_NONCE;
  const dir = process.env.CUESHEET_EFFECT_DIR;

  // WRK-02 starts here: a worker with no identity cannot file a receipt that
  // anyone would believe, so it refuses rather than writing a nameless one.
  if (!effectId || !nonce || !dir) {
    process.stderr.write(
      `worker: refusing to run without CUESHEET_EFFECT, CUESHEET_EFFECT_NONCE and CUESHEET_EFFECT_DIR\n`,
    );
    return 2;
  }

  try {
    const input = readFileSync(join(dir, "input.json"), "utf8");
    const digest = createHash("sha256").update(input).digest("hex");
    const summary = `${input.length} bytes, digest ${digest.slice(0, 12)}`;
    writeReceipt(dir, "result.json", { effectId, nonce, summary, digest });
    return 0;
  } catch (cause) {
    // A worker that could not do its work says so, in a receipt, rather than
    // only in an exit code. The receipt is the claim; the exit code is only a
    // fact about the process.
    writeReceipt(dir, "failure.json", {
      effectId,
      nonce,
      why: cause instanceof Error ? cause.message : String(cause),
    });
    return 1;
  }
}

// Only when run directly, so importing this module does not run a worker.
// `import.meta.url` against `process.argv[1]` is the check: the two are the same
// file exactly when this file is the entry point.
const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) {
  process.exit(await main());
}
