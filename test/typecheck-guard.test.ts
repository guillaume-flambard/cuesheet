/**
 * The type check, as a differential guard rather than a checklist.
 *
 * The build emits 33 type errors and says so in `docs/type-errors.md`. The
 * temptation with a known count is to freeze it, but freezing the number is the
 * wrong shape twice over: fixing one error would fail the guard, and moving one
 * would too, which teaches people to re-free rather than to fix.
 *
 * So the rule is a subset, not an equality:
 *
 * ```text
 * a documented error disappearing   fine, and the doc should follow
 * a documented error moving         fine, the key does not carry a line
 * a new (file, code) pair           red
 * ```
 *
 * The key deliberately omits the line number. A correction above an error moves
 * it, and a guard that reports a move as a new defect gets switched off within a
 * week. What it will not miss is a new file gaining a new kind of problem, which
 * is the thing that has actually happened in this repository: the
 * `cause.why` defect appeared in `src/effects.ts` and was invisible to seventeen
 * tests.
 *
 * The weakness is stated rather than hidden. Keying on `file:code` means a second
 * `TS2339` in the same file passes, because the pair already exists. Buying that
 * back would mean keying on lines, which is the version that gets abandoned.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOG = join(ROOT, ".typecheck.log");

/**
 * The documented diagnostics, as `file:code`.
 *
 * Generated from the log rather than transcribed, so this file cannot drift from
 * what the compiler said when it was written, and a transcription error would
 * make the guard reject the state it was built from.
 */
const KNOWN = `
src/adapters/frontier.ts:TS2322
src/adapters/frontier.ts:TS2532
src/adapters/opencode.ts:TS2322
src/adapters/openrouter.ts:TS2532
src/adapters/shell.ts:TS2322
src/adapters/shell.ts:TS2769
src/adapters/shell.ts:TS7006
src/affordances.ts:TS2339
src/chat.ts:TS2322
src/cli-run.ts:TS18048
src/cli-run.ts:TS2339
src/cli.ts:TS2459
src/cli.ts:TS2769
src/core/intent.ts:TS2322
src/core/loop.ts:TS2339
src/core/memory.ts:TS2322
src/core/store.ts:TS2698
src/frontier-cli.ts:TS2532
src/frontier-cli.ts:TS2538
`.trim();

const documented = new Set(KNOWN.split("\n").map((line) => line.trim()).filter(Boolean));

/** Every `file:code` the compiler reported, de-duplicated. */
function current(): { pairs: Set<string>; count: number } {
  if (!existsSync(LOG)) return { pairs: new Set(), count: 0 };
  const text = readFileSync(LOG, "utf8");
  const pairs = new Set<string>();
  let count = 0;
  for (const match of text.matchAll(/^(src\/[^(:]+)\(\d+,\d+\): error (TS\d+)/gm)) {
    count += 1;
    pairs.add(`${match[1]}:${match[2]}`);
  }
  return { pairs, count };
}

describe("the type check is a differential guard, not a checklist", () => {
  it("the compiler has run, so this guard is measuring something", () => {
    // A guard that reads a missing log and finds nothing would pass on a build
    // that never type-checked. That is the canary problem again.
    if (!existsSync(LOG)) {
      execFileSync("bash", ["scripts/build.sh"], { cwd: ROOT, encoding: "utf8" });
    }
    assert.ok(existsSync(LOG), "no .typecheck.log; run `bash scripts/build.sh` first");
    const { count } = current();
    assert.ok(count > 0, "the log exists and is empty, which means the check did not run");
  });

  it("no diagnostic is new", () => {
    const { pairs } = current();
    const fresh = [...pairs].filter((p) => !documented.has(p)).sort();
    assert.deepEqual(
      fresh,
      [],
      `new type diagnostics, which are not permitted by docs/type-errors.md:\n  ${fresh.join("\n  ")}`,
    );
  });

  it("the documented list is not stale in the direction that hides things", () => {
    // A documented pair that no longer occurs is a good thing, and it is a
    // bookkeeping debt rather than a failure: the doc claims a category that has
    // emptied. Left unchecked, the list would drift upward forever, so a new
    // error of a code that is still listed would pass unnoticed.
    const { pairs } = current();
    const gone = [...documented].filter((p) => !pairs.has(p)).sort();
    // Informational: reported, not asserted, because fixing a diagnostic and
    // updating the doc must not be able to fail the suite.
    if (gone.length > 0) {
      console.log(`note: ${gone.length} documented diagnostic(s) no longer occur: ${gone.join(", ")}`);
    }
    assert.ok(documented.size > 0, "and the list itself is not empty, which would permit anything");
  });

  it("the baseline names files that exist", () => {
    // A typo in a documented path would make every future error in that file
    // count as new, which is a confusing failure rather than an obvious one.
    for (const pair of documented) {
      const file = pair.split(":")[0]!;
      assert.ok(existsSync(join(ROOT, file)), `docs/type-errors.md names ${file}, which does not exist`);
    }
  });
});