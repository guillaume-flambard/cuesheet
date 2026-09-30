/**
 * The experiment ledger, and the one claim it exists to make checkable.
 *
 * The protocol is frozen at four verbs. That decision was made from three live
 * tasks, which is a real observation and a thin basis. The reason to keep a
 * ledger is that the basis has to grow: if ten unrelated tasks all reach for
 * `search_text`, a fifth verb has earned admission, and if a hundred do not,
 * the protocol has earned the claim that it is enough.
 *
 * So the thing under test is not the arithmetic. It is whether a run that fails
 * stays in the ledger. A ledger that drops failures measures only the happy path
 * and would have reported `unsupported: none` from a single good afternoon, which
 * is exactly the number that was already believed before anyone measured
 * anything.
 *
 * ```text
 * L1  a run appends and never overwrites
 * L2  an unsupported name survives the round trip and is counted per run
 * L3  a failed run is counted as a failure, with its attribution
 * L4  the summary is a function of the ledger, not of the last run
 * L5  median reads is a median, and an empty ledger does not throw
 * L6  a malformed line is skipped rather than poisoning every later read
 * ```
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  recordRun,
  readLedger,
  summarise,
  formatSummary,
  temporaryLedger,
  type RunRecord,
} from "../src/adapters/experiment-ledger.ts";

/** A produced run with the fields a test cares about, rest defaulted. */
function run(over: Partial<RunRecord> = {}): RunRecord {
  return {
    exp: "EXP-01",
    shape: "a bug",
    question: "does this hold?",
    at: 1_700_000_000_000,
    producer: "produced",
    verdict: "VERIFIED",
    oracle: "runAgainstArtifact",
    requested: { write_file: 1 },
    honoured: { list_files: 1, read_file: 2, write_file: 1 },
    unsupported: [],
    turns: 1,
    ...over,
  };
}

describe("the ledger is a ledger: append-only, and failures stay", () => {
  it("L1 appends and never overwrites", () => {
    const path = temporaryLedger("l1");
    recordRun(run({ shape: "first" }), path);
    recordRun(run({ shape: "second" }), path);
    const rows = readLedger(path);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.shape), ["first", "second"], "order is oldest first");
  });

  it("L2 an unsupported name survives the round trip and is counted per run", () => {
    const path = temporaryLedger("l2");
    // LIVE-01, as it actually happened: the model asked for a verb this
    // protocol does not have. If that name cannot be recorded, then the
    // pressure that produced LIVE-01 is unmeasurable and the freeze of the
    // protocol is a guess.
    recordRun(run({ exp: "EXP-00", shape: "live-01", unsupported: ["ls"] }), path);
    recordRun(run({ exp: "EXP-01", shape: "later" }), path);
    const summary = summarise(readLedger(path));
    assert.equal(summary.unsupported["ls"], 1, "one run asked for it");
    assert.equal(summary.requested["write_file"], 2, "the later run still counts");
  });

  it("L3 a failed run is counted as a failure, with its attribution", () => {
    const path = temporaryLedger("l3");
    recordRun(run({ shape: "good" }), path);
    recordRun({
      exp: "EXP-03",
      shape: "provider-down",
      question: "what happens when the provider dies mid-task?",
      at: 2,
      producer: "failed",
      attribution: "provider",
      why: "503 from provider after 1 turn",
      requested: { read_file: 1 },
    }, path);
    const summary = summarise(readLedger(path));
    assert.equal(summary.runs, 2);
    assert.equal(summary.produced, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.attributions["provider"], 1);
  });

  it("L4 the summary is a function of the whole ledger, not the last run", () => {
    const path = temporaryLedger("l4");
    const one = summarise(readLedger(path));
    assert.equal(one.runs, 0, "an empty ledger reads as empty, not as a crash");

    recordRun(run({ requested: { write_file: 1 } }), path);
    const two = summarise(readLedger(path));
    recordRun(run({ requested: { write_file: 1 }, unsupported: ["grep"] }), path);
    const three = summarise(readLedger(path));

    assert.equal(two.requested["write_file"], 1);
    assert.equal(three.requested["write_file"], 2, "accumulates rather than replacing");
    assert.equal(three.unsupported["grep"], 1);
  });

  it("L5 median reads is a median, and an empty ledger does not throw", () => {
    const path = temporaryLedger("l5");
    // an even count must average the two middle values, not take the lower
    for (const n of [1, 2, 4, 9]) {
      recordRun(run({ requested: { read_file: n } }), path);
    }
    assert.equal(summarise(readLedger(path)).medianReads, 3, "(2 + 4) / 2");

    const empty = summarise(readLedger(temporaryLedger("l5-empty")));
    assert.equal(empty.medianReads, 0);
    assert.equal(empty.runs, 0);
  });

  it("L6 a malformed line is skipped rather than poisoning every later read", () => {
    const path = temporaryLedger("l6");
    recordRun(run({ shape: "before" }), path);
    // a hand edit, a truncated write, a merge artefact: whatever it was, the
    // runs after it must still be readable or one bad line loses the ledger
    appendFileSync(path, "{not json\n", "utf8");
    recordRun(run({ shape: "after" }), path);
    const rows = readLedger(path);
    assert.deepEqual(rows.map((r) => r.shape), ["before", "after"]);
  });
});

describe("the summary is readable by a person before anything is decided", () => {
  it("names the pressure in words, and says none when there is none", () => {
    const path = temporaryLedger("fmt");
    recordRun(run({ shape: "a", requested: { write_file: 1, read_file: 2 } }), path);
    const quiet = formatSummary(summarise(readLedger(path)));
    assert.match(quiet, /unsupported\s+none/);

    recordRun(run({ shape: "b", requested: { write_file: 1, read_file: 3 }, unsupported: ["search_text"] }), path);
    const loud = formatSummary(summarise(readLedger(path)));
    assert.match(loud, /search_text in 1 run\(s\)/);
    assert.match(loud, /runs=2/);
    assert.match(loud, /median read_file\s+3/);
  });

  it("a ledger written by another process is readable without being rewritten", () => {
    const path = temporaryLedger("interleave");
    recordRun(run({ shape: "mine" }), path);
    writeFileSync(path, readFileSync(path, "utf8"), "utf8"); // a no-op rewrite
    assert.equal(readLedger(path).length, 1);
  });
});
