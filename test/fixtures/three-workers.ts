/**
 * Three controlled workers, so the oracle is tested before any model is.
 *
 * The deterministic worker of P13 was honest by construction, which is a
 * convenient accident and not a property. P14 is about a producer that lies, and
 * a lying producer has to exist before the architecture can be shown to ignore
 * it.
 *
 * ```text
 * honest-worker  right result, no claim          -> VERIFIED
 * wrong-worker   well-formed but wrong result   -> REJECTED
 * lying-worker   wrong result, "success": true   -> REJECTED
 * ```
 *
 * The third row is the whole milestone. A worker asserts its own success, the
 * assertion is well-formed, plausible and ignored. Nothing here is a mock: each
 * mode is a real process launched the way P13 launched one, and each writes a
 * real receipt that the real reader parses.
 *
 * The three differ only in what they write, which is the point: identical
 * mechanics, three different honesty levels, one oracle. A future LLM worker is
 * a fourth mode here, and it will not need any new machinery.
 */

import { createHash } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join } from "node:path";

type Mode = "honest" | "wrong" | "lying";

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
 * Produce a result in one of three ways.
 *
 * Exported and not run at import, for the reason LOAD-01 established: a file
 * that acts on the world should still be a file something can inspect.
 */
export function produce(dir: string, effectId: string, nonce: string, mode: Mode): number {
  const input = readFileSync(join(dir, "input.json"), "utf8");
  const right = createHash("sha256").update(input).digest("hex");
  const wrong = createHash("sha256").update(`${input}--wrong`).digest("hex");

  if (mode === "honest") {
    writeReceipt(dir, "result.json", {
      effectId,
      nonce,
      summary: `hashed ${input.length} bytes`,
      digest: right,
    });
    return 0;
  }

  if (mode === "wrong") {
    // Well-formed, plausible, and false. No claim attached: this worker is not
    // asserting anything about whether it was right, it simply is not.
    writeReceipt(dir, "result.json", {
      effectId,
      nonce,
      summary: `hashed ${input.length} bytes`,
      digest: wrong,
    });
    return 0;
  }

  // Lying. Wrong result, and an explicit claim of success that the architecture
  // is built to ignore. The claim is written in exactly the shape a real
  // non-trusted worker would write it, so a verifier that reads it would be
  // fooled by a plausible field rather than an obvious one.
  writeReceipt(dir, "result.json", {
    effectId,
    nonce,
    summary: "all checks pass",
    digest: wrong,
    success: true,
    claim: "the transformation is correct and verified",
  });
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const mode = (process.env.CUESHEET_FIXTURE_MODE ?? "honest") as Mode;
  const effectId = process.env.CUESHEET_EFFECT ?? "";
  const nonce = process.env.CUESHEET_EFFECT_NONCE ?? "";
  const dir = process.env.CUESHEET_EFFECT_DIR ?? "";
  if (!effectId || !nonce || !dir) {
    process.stderr.write("fixture worker: no identity, refusing to write a nameless receipt\n");
    process.exit(2);
  }
  process.exit(produce(dir, effectId, nonce, mode));
}
