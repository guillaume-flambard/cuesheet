/**
 * The real chat path, which no pure test drives.
 *
 * `runGoal` referenced an identifier named `registry` twice after a commit
 * replaced `const registry = liveRegistry()` with `const listing = liveRegistry()`
 * and left two readers behind. The function no longer takes a registry at all,
 * so both lines were dead references to something that had been renamed away.
 *
 * Every run of a real goal therefore ended in:
 *
 * ```text
 * ReferenceError: registry is not defined
 * ```
 *
 * and, because the throw happened inside the effect, the effect was observed as
 * `failed` and the intention was kept. So the system was honest about a failure
 * it could not explain, which is a comfortable way for this to have stayed
 * invisible: 352 tests passed and the feature did not work.
 *
 * Found by Agent I, hunting for a knowledge a surface still held, and confirmed
 * by running the real binary in a throwaway cwd with a neutralised PATH so the
 * run cannot reach anything and has to reach the end of its own bookkeeping.
 *
 * The lesson is in the file, not only the fix: this is a name that survives a
 * rename in one place and not another. A test that greps for an identifier
 * would catch it; a test that runs the path catches it too, and the second one
 * also catches the next one.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHAT = join(process.cwd(), "src", "chat.ts");

/**
 * Drive the real chat, isolated.
 *
 * `PATH` is neutralised so no run can reach a real model, a real tool or a
 * real credential. The run must therefore fail on its own terms, and the point
 * of this file is that a failure on its own terms is a message Cuesheet wrote
 * rather than a `ReferenceError` it did not.
 */
function run(lines: string[]): { out: string; code: number } {
  const sessions = mkdtempSync(join(tmpdir(), "cuesheet-chat-sessions-"));
  const home = mkdtempSync(join(tmpdir(), "cuesheet-chat-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "cuesheet-chat-cwd-"));
  // The provider key is removed on purpose. With it present, the run reaches a
  // real model over the network, and the test takes 17 seconds and measures
  // somebody else's latency. The path under test is the one that decides
  // whether to run at all and what it says afterwards, and that path is
  // exercised completely without a provider.
  const env = { ...process.env, CUESHEET_SESSIONS: sessions, HOME: home, PATH: "/nonexistent" };
  delete env.OPENROUTER_API_KEY;
  const r = spawnSync(process.execPath, [CHAT], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    cwd,
    env,
  });
  return { out: r.stdout + r.stderr, code: r.status ?? 1 };
}

describe("the real chat path fails for reasons Cuesheet wrote", () => {
  it("a run does not end in an unexplained ReferenceError", () => {
    const r = run(["fix the failing test", "go"]);

    // The defect, exactly.
    assert.equal(
      /ReferenceError/.test(r.out),
      false,
      `the chat raised an unexplained error:\n${r.out.slice(0, 600)}`,
    );
    // And no identifier that does not exist is named at all.
    assert.equal(
      /is not defined/.test(r.out),
      false,
      `something in the chat refers to a name that does not exist:\n${r.out.slice(0, 600)}`,
    );
  });

  it("a run says why it could not run", () => {
    const r = run(["fix the failing test", "go"]);
    // With no PATH there is no provider and no tool. The acceptable outcome is a
    // sentence Cuesheet wrote. Silence would be the same lie in a different
    // shape, so silence is also a failure here.
    assert.notEqual(
      r.out.trim(),
      "",
      "the chat said nothing at all, which is not a reason",
    );
    assert.match(
      r.out,
      /request |provider|no |not |cannot|could not/i,
      `expected a sentence explaining the outcome, got:\n${r.out.slice(0, 600)}`,
    );
  });

  it("the intent survives a run that could not start", () => {
    // EFF-06 on the real path, not on a fixture. The run cannot start here, the
    // effect is observed as failed, and the intention is still staged, because
    // the person still wants it.
    const r = run(["fix the failing test", "go"]);
    assert.match(
      r.out,
      /still staged|go again|intention/i,
      `a failed run must leave the intention available:\n${r.out.slice(0, 600)}`,
    );
  });

  it("staging alone never crashes, whatever the goal", () => {
    // The cheapest smoke in the file, and the one that would have caught a
    // renamed identifier used during staging rather than during a run.
    for (const goal of ["fix the failing test", "ship it", "x"]) {
      const r = run([goal]);
      assert.equal(
        /ReferenceError/.test(r.out),
        false,
        `staging "${goal}" raised:\n${r.out.slice(0, 400)}`,
      );
    }
  });
});
