/**
 * A code worker that edits a workspace.
 *
 * P13's worker wrote a receipt. A code agent does not: it edits files. This one
 * edits exactly one file with exactly one line, which is the smallest thing that
 * is really a code change, and it writes a receipt claiming the tests pass
 * without ever running them.
 *
 * The claim is deliberate. It is what a real model does when it is confident and
 * wrong, and P14 established that such a claim is powerless. This worker exists to
 * keep that true when the output is a workspace rather than a string.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Mode = "fix" | "wrong-file" | "claim-only";

/** The one-line change that makes the fixture repo's tests pass. */
const FIXED = `// A deterministic bug: \`add\` subtracts.
export function add(a, b) {
  return a + b;
}
`;

/**
 * Edit the workspace, which is not the receipt directory.
 *
 * The first version took one `dir` and used it for both, so the worker was
 * fixing `~/.cuesheet/.../effects/E44/add.mjs` and the capture of the real
 * workspace saw an untouched bug. Two tests failed and both blamed the capture
 * rather than the worker, which is a reasonable-looking mistake: ART-04 and
 * ART-02 failed for a reason that had nothing to do with either.
 */
export function edit(workspace: string, mode: Mode): void {
  if (mode === "claim-only") {
    // Changes nothing at all, and says it fixed it. The purest form of the lie:
    // no artifact, no edit, a confident report.
    return;
  }

  if (mode === "wrong-file") {
    // Plausible, and in the wrong place. The classic failure a reviewer misses
    // because the diff looks like work.
    const notes = join(workspace, "NOTES.md");
    writeFileSync(notes, "# fixed\n\nChanged the sign convention.\n", "utf8");
    return;
  }

  const file = join(workspace, "add.mjs");
  const before = readFileSync(file, "utf8");
  if (!before.includes("return a - b;")) {
    // A worker that was asked to fix something already fixed should say so
    // rather than rewrite it, and this is the shape of that refusal.
    writeFileSync(join(workspace, "add.mjs"), FIXED, "utf8");
    return;
  }
  writeFileSync(file, FIXED, "utf8");
}

/**
 * The report. It claims success in every mode, including the one where nothing
 * was touched, and it is never consulted by anything that decides.
 */
function report(effectId: string, nonce: string, dir: string): void {
  writeFileSync(
    join(dir, "result.json"),
    JSON.stringify(
      {
        effectId,
        nonce,
        summary: "fixed the sign in add() and all tests pass",
        // A digest the runtime does not and will not use. It is a string the
        // worker made up, and ART-01 is the reason it cannot matter.
        digest: "0000000000000000000000000000000000000000000000000000000000000000",
        success: true,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const effectId = process.env.CUESHEET_EFFECT ?? "";
  const nonce = process.env.CUESHEET_EFFECT_NONCE ?? "";
  const dir = process.env.CUESHEET_EFFECT_DIR ?? "";
  const workspace = process.env.CUESHEET_WORKSPACE ?? "";
  if (!effectId || !nonce || !dir || !workspace) {
    process.stderr.write("code worker: missing identity or workspace, refusing to run\n");
    process.exit(2);
  }
  const mode = (process.env.CUESHEET_WORKER_MODE ?? "fix") as Mode;
  edit(workspace, mode);
  report(effectId, nonce, dir);
  process.exit(0);
}
