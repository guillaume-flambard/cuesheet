/**
 * EXP-08: the live provider interrupted mid-task, at three named windows.
 *
 * A real transport was cut at each point and the observations were read
 * separately, because the trap is that they can be told apart:
 *
 * ```text
 * W1  before any write
 *     producer       failed, origin provider
 *     workspace      UNCHANGED
 *     receipt        failure.json, terminal
 *     work outcome   CONFIRMED_FAILED
 *     artifact       valid, conformance REJECTED
 *
 * W2  after the read turns, before the write
 *     producer       failed, origin provider
 *     workspace      UNCHANGED
 *     receipt        failure.json, terminal
 *     work outcome   CONFIRMED_FAILED
 *     artifact       valid, conformance REJECTED
 *
 * W3  after the write, before the receipt
 *     producer       the process died
 *     workspace      CHANGED
 *     receipt        none
 *     work outcome   INCONCLUSIVE
 *     artifact       valid, conformance VERIFIED
 * ```
 *
 * W3 is the result worth having. The code satisfies the contract, the producer
 * did not finish, and the system says `INCONCLUSIVE` rather than
 * `CONFIRMED_COMPLETE`:
 *
 * ```text
 * "I can prove this code state satisfies the contract.
 *  I cannot prove the producer had finished its work."
 * ```
 *
 * Both halves are true and neither cancels the other. Turning the VERIFIED into a
 * completed work is the laundering route EXP-03A named, and the tests below close
 * it from the direction a real run approaches it.
 *
 * W2 found a real bug. A provider that died while the read verbs were being
 * answered rejected `produce`'s promise, because the `await` sat outside the
 * `try` whose `catch` was written for exactly that and was therefore dead code.
 * The process died with no receipt at all. A scripted fake cannot find that,
 * because a fake does not fail on a turn whose number depends on how long the
 * conversation was.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { produce } from "../src/adapters/llm-producer.ts";
import { capture, verifyCapture } from "../src/adapters/artifact-capture.ts";
import { runAgainstArtifact } from "../src/adapters/artifact-verifier.ts";
import { readReceipt, workOutcomeOf } from "../src/work.ts";
import { BOAST, CORRECT_ADD, ScriptedModel, write } from "./fixtures/llm/scripted-model.ts";
import type { ModelAdapter, ModelResponse } from "../src/core/loop.ts";
import type { ProduceOptions } from "../src/adapters/llm-producer.ts";
import type { ArtifactStanding } from "../src/verify.ts";

const REPO = join(process.cwd(), "test", "fixtures", "repo");
const SESSION = "S9";

interface Bench {
  root: string;
  workspace: string;
  effectDir: string;
  effectId: string;
  nonce: string;
  cleanup(): void;
}

function bench(effectId: string): Bench {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-exp08-"));
  const workspace = join(root, "workspace");
  const effectDir = join(root, SESSION, "effects", effectId);
  cpSync(REPO, workspace, { recursive: true });
  mkdirSync(effectDir, { recursive: true });
  return { root, workspace, effectDir, effectId, nonce: `n${effectId}`, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function optionsFor(b: Bench, adapter: ModelAdapter, over: Partial<ProduceOptions> = {}): ProduceOptions {
  return {
    workspace: b.workspace,
    effectDir: b.effectDir,
    effectId: b.effectId,
    nonce: b.nonce,
    input: "add(2,3) must equal 5. Change add.mjs only.",
    adapter,
    files: { "add.mjs": readFileSync(join(b.workspace, "add.mjs"), "utf8") },
    ...over,
  };
}

/**
 * A transport that answers for `allowed` turns and then dies.
 *
 * Mirrors what a real cut does: the first turns go over the wire and come back,
 * and a later one does not. A fake that fails on turn one cannot reach W2.
 */
function dyingProvider(allowed: number): ModelAdapter {
  let turn = 0;
  const script = new ScriptedModel({
    text: "reading the file",
    toolCalls: [{ name: "read_file", input: { path: "add.mjs" } }],
  });
  return {
    name: `dies-after-${allowed}`,
    async infer(frame): Promise<ModelResponse> {
      turn += 1;
      if (turn > allowed) throw new Error(`connection reset by peer on turn ${turn}`);
      return script.infer(frame);
    },
  };
}

/** Every observation, read from disk rather than from the return value. */
function observe(b: Bench) {
  const view = readReceipt(b.effectId, b.nonce, (n) => existsSync(join(b.effectDir, n)),
    (n) => { try { return readFileSync(join(b.effectDir, n), "utf8"); } catch { return null; } },
    (n) => { try { return JSON.parse(readFileSync(join(b.effectDir, n), "utf8")); } catch { return undefined; } });
  const artifact = capture({ sessionId: SESSION, effectId: b.effectId, workspace: b.workspace, root: b.root });
  const integrity = verifyCapture(artifact) ? "holds" : "violated";
  const verdict = runAgainstArtifact({ artifact, command: process.execPath, args: ["test.mjs"], verificationId: `V-${b.effectId}` });
  return {
    work: workOutcomeOf(b.effectId, view),
    receipts: readdirSync(b.effectDir).sort(),
    integrity,
    verdict: verdict.verdict,
    standing: {
      integrity,
      temporalCoherence: "not-established",
      conformance: verdict.verdict,
    } as ArtifactStanding,
  };
}

describe("EXP-08 W1 and W2, the provider dies before anything is written", () => {
  it("W1 dies on the first turn: nothing moved, and the failure is terminal", async () => {
    const b = bench("E-W1");
    const before = readFileSync(join(b.workspace, "add.mjs"), "utf8");
    const report = await produce(optionsFor(b, dyingProvider(0)));
    const seen = observe(b);
    const after = readFileSync(join(b.workspace, "add.mjs"), "utf8");
    b.cleanup();

    assert.equal(report.kind, "failed");
    if (report.kind !== "failed") return;
    assert.equal(report.origin, "provider", "a dead transport is the provider's fault, not the model's");
    assert.equal(after, before, "and no octet moved");
    assert.deepEqual(seen.receipts, ["failure.json"], "so there is a terminal receipt to read");
    assert.equal(seen.work.outcome, "CONFIRMED_FAILED");
    assert.equal(seen.verdict, "REJECTED", "the untouched workspace cannot satisfy a fix");
  });

  it("W2 dies while the read verbs are answered: still terminal, still untouched", async () => {
    // The window that found the bug. Failing on turn 2 is failing *inside*
    // `answerReads`, and the exception used to escape `produce` entirely because
    // the `await` was outside the `try`. The process died with no receipt, which
    // is the one outcome that is never acceptable: it is indistinguishable from
    // never having attempted the work.
    const b = bench("E-W2");
    const before = readFileSync(join(b.workspace, "add.mjs"), "utf8");
    const report = await produce(optionsFor(b, dyingProvider(1)));
    const seen = observe(b);
    const after = readFileSync(join(b.workspace, "add.mjs"), "utf8");
    b.cleanup();

    assert.equal(report.kind, "failed", "a mid-conversation provider failure is a failure, not a rejection");
    if (report.kind !== "failed") return;
    assert.equal(report.origin, "provider");
    assert.match(report.why, /connection reset by peer/);
    assert.equal(after, before, "no octet moved");
    assert.deepEqual(seen.receipts, ["failure.json"], "a receipt is filed even when the death is mid-conversation");
    assert.equal(seen.work.outcome, "CONFIRMED_FAILED");
  });
});

describe("EXP-08 W3, the provider dies after the write and before the receipt", () => {
  /** A real edit on disk, then a process that dies before it can file anything. */
  async function crashAfterWrite(label: string, contents: string): Promise<Bench> {
    const b = bench(label);
    const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", contents)] });
    // The P12 window, reached the way a real run reaches it: the write succeeds
    // and the process is gone before any receipt exists.
    await assert.rejects(
      () => produce(optionsFor(b, model, { afterApply: () => { throw new Error("connection reset by peer: provider died after the write"); } })),
      /connection reset by peer/,
    );
    return b;
  }

  it("correct code, no receipt, and INCONCLUSIVE rather than complete", async () => {
    const b = await crashAfterWrite("E-W3-ok", CORRECT_ADD);
    const onDisk = readFileSync(join(b.workspace, "add.mjs"), "utf8");
    const seen = observe(b);
    b.cleanup();

    assert.equal(onDisk, CORRECT_ADD, "the work is really there");
    assert.deepEqual(seen.receipts, [], "and nothing claims it");
    // The load-bearing pair. The oracle returns VERIFIED for these bytes, and the
    // work outcome is still INCONCLUSIVE.
    assert.equal(seen.verdict, "VERIFIED", "the code satisfies the contract");
    assert.equal(seen.work.outcome, "INCONCLUSIVE", "and the system still cannot say the producer finished");
  });

  it("a VERIFIED conformance never becomes a completed work", async () => {
    const b = await crashAfterWrite("E-W3-wash", CORRECT_ADD);
    const seen = observe(b);
    b.cleanup();

    assert.equal(seen.standing.conformance, "VERIFIED");
    assert.equal(seen.standing.integrity, "holds");
    assert.equal(seen.work.outcome, "INCONCLUSIVE", "conformance is not completion");
    assert.equal(seen.standing.temporalCoherence, "not-established");
  });

  it("wrong code gives the mirror image, and INCONCLUSIVE there too", async () => {
    // INCONCLUSIVE is not a consolation prize for good work. The question "did
    // the producer finish" has the same answer when the bytes are wrong.
    const b = await crashAfterWrite("E-W3-bad", "export function add(a, b) { return a - b; }\n");
    const seen = observe(b);
    b.cleanup();

    assert.equal(seen.verdict, "REJECTED");
    assert.equal(seen.work.outcome, "INCONCLUSIVE", "unknown, and unknown for the same reason");
  });

  it("a surviving producer in the same shape ends CONFIRMED_COMPLETE, so the receipt is the difference", async () => {
    // The control. Same workspace, same edit, same oracle, one variable changed:
    // this time the producer lived to file. If the outcome did not move, the
    // outcome would be reading the disk rather than the receipt.
    const crashed = await crashAfterWrite("E-W3-ctl-a", CORRECT_ADD);
    const crashedOutcome = observe(crashed).work.outcome;
    crashed.cleanup();

    const b = bench("E-W3-ctl-b");
    await produce(optionsFor(b, new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", CORRECT_ADD)] })));
    const survived = observe(b).work.outcome;
    b.cleanup();

    assert.equal(crashedOutcome, "INCONCLUSIVE");
    assert.equal(survived, "CONFIRMED_COMPLETE", "the receipt is the whole difference");
  });
});

describe("EXP-08 the three windows as one table", () => {
  it("no interrupted window produced a completed work", async () => {
    const rows: Array<{ window: string; changed: boolean; terminal: boolean; outcome: string; conformance: string }> = [];

    for (const [label, allowed] of [["W1", 0], ["W2", 1]] as const) {
      const b = bench(`E-tbl-${label}`);
      const before = readFileSync(join(b.workspace, "add.mjs"), "utf8");
      await produce(optionsFor(b, dyingProvider(allowed)));
      const seen = observe(b);
      rows.push({
        window: label,
        changed: readFileSync(join(b.workspace, "add.mjs"), "utf8") !== before,
        terminal: seen.receipts.length > 0,
        outcome: seen.work.outcome,
        conformance: seen.verdict,
      });
      b.cleanup();
    }

    for (const [label, contents] of [["W3-ok", CORRECT_ADD], ["W3-bad", "export function add(a, b) { return a - b; }\n"]] as const) {
      const b = bench(`E-tbl-${label}`);
      const model = new ScriptedModel({ text: BOAST, toolCalls: [write("add.mjs", contents)] });
      const before = readFileSync(join(b.workspace, "add.mjs"), "utf8");
      await assert.rejects(
        () => produce(optionsFor(b, model, { afterApply: () => { throw new Error("died"); } })),
        /died/,
      );
      rows.push({
        window: label,
        changed: readFileSync(join(b.workspace, "add.mjs"), "utf8") !== before,
        terminal: readdirSync(b.effectDir).length > 0,
        outcome: observe(b).work.outcome,
        conformance: observe(b).verdict,
      });
      b.cleanup();
    }

    // Read the table before trusting it.
    assert.equal(rows[0]!.changed, false, "W1 changed nothing");
    assert.equal(rows[1]!.changed, false, "W2 changed nothing");
    assert.equal(rows[2]!.changed, true, "W3 wrote");
    assert.equal(rows[2]!.conformance, "VERIFIED", "and the code was right");
    assert.equal(rows[2]!.outcome, "INCONCLUSIVE", "and completion is still unknown");
    assert.equal(rows[3]!.conformance, "REJECTED");
    assert.equal(rows[3]!.outcome, "INCONCLUSIVE", "unknown for the same reason, not a different one");

    // The rule, over the whole table.
    for (const row of rows) {
      if (!row.terminal) {
        assert.equal(row.outcome, "INCONCLUSIVE", `${row.window}: no terminal receipt means no settled work`);
      }
    }
    assert.equal(
      rows.filter((r) => r.outcome === "CONFIRMED_COMPLETE").length,
      0,
      "and no interrupted window ever claimed a completed work",
    );
  });
});
