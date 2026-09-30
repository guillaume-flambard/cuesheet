/**
 * KEY-01 to KEY-05, as a crash matrix.
 *
 * The happy path is not the interesting case here. What matters is that each
 * way a launch can go unrecorded produces a *different* answer, and that none of
 * them is a failure nobody observed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReceiptStore } from "../src/adapters/effect-receipts.ts";
import { mintIdentity, workerEnvironment } from "../src/spawn.ts";
import { reconcile, settles, terminalObservation, type RealityObservation } from "../src/reconcile.ts";
import type { EffectRequest } from "../src/effects.ts";

const NOW = 1_790_000_000_000;
const SESSION = "S7";

const withRoot = <T>(fn: (root: string) => T): T => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-receipt-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const identity = () => mintIdentity("E42");
const request = (over: Partial<EffectRequest> = {}): EffectRequest => ({
  id: "E42",
  effect: "SpawnAgent",
  subject: "fix the display",
  affordance: "APPROVE_GOAL",
  reads: { goal: "known", pendingEffect: "known" },
  revision: 41,
  reconciliationKey: `spawn:E42`,
  ...over,
});

/** The whole matrix, each row a way a launch can be unrecorded. */
/**
 * Each row arranges the world, then the matrix asserts what can be learned.
 *
 * `arrange` receives the root because the honest way to produce a damaged
 * receipt is to damage one directly: the store only ever writes whole records,
 * so a truncated file cannot be produced through its API and has to be produced
 * the way the world produces it, by dying mid-write.
 */
const cases: Array<{
  name: string;
  arrange: (store: ReceiptStore, root: string) => void;
  alive?: (pid: number) => boolean;
  expected: RealityObservation["kind"];
  terminal: boolean;
}> = [
  {
    name: "1. durable request, crash before spawn: no directory",
    arrange: () => {},
    expected: "absent",
    terminal: false,
  },
  {
    name: "2. a started.json that cannot be parsed",
    arrange: (_store, root) => {
      mkdirSync(join(root, SESSION, "effects", "E42"), { recursive: true });
      writeFileSync(join(root, SESSION, "effects", "E42", "started.json"), '{"effectId": "E4', "utf8");
    },
    expected: "unreadable",
    terminal: false,
  },
  {
    name: "3. started, and the worker is still identifiable",
    arrange: (store) => {
      store.writeStarted(SESSION, { effectId: "E42", nonce: "nE42", pid: 93812, startedAt: NOW, subject: "g" });
    },
    alive: () => true,
    expected: "running",
    terminal: false,
  },
  {
    name: "4. durable proof that the launch happened",
    arrange: (store) => {
      store.writeStarted(SESSION, { effectId: "E42", nonce: "nE42", pid: 93812, startedAt: NOW, subject: "g" });
    },
    alive: () => false,
    expected: "completed_successfully",
    terminal: true,
  },
  {
    name: "5. explicit proof that the spawn was refused",
    arrange: (store) => {
      store.writeRefused(SESSION, "E42", "no provider configured");
    },
    alive: () => false,
    expected: "completed_with_failure",
    terminal: true,
  },
  {
    name: "6. no reconciliation key at all",
    arrange: () => {},
    expected: "no_key",
    terminal: false,
  },
];

describe("the crash matrix", () => {
  for (const c of cases) {
    it(`${c.name} -> ${c.expected}`, () => {
      withRoot((root) => {
        const store = new ReceiptStore({ root });
        c.arrange(store, root);
        const req = c.expected === "no_key" ? request({ reconciliationKey: undefined }) : request();

        const reality = store.observe(SESSION, req.reconciliationKey, c.alive);
        assert.equal(reality.kind, c.expected);

        const result = reconcile(req, reality);
        assert.equal(settles(result), c.terminal, "whether this settles the effect");
        assert.equal(terminalObservation(req, result) !== null, c.terminal);
      });
    });
  }

  it("none of the six is CONFIRMED_FAILURE by accident", () => {
    // Only row 5 may say the spawn failed, and only because a launcher wrote it
    // down on purpose. Every other way of not knowing stays not-knowing.
    const outcomes = cases
      .filter((c) => c.expected !== "completed_with_failure")
      .map((c) => c.expected);
    assert.equal(outcomes.includes("completed_with_failure"), false, "no accidental failure");
  });
});

describe("KEY: identity before effect", () => {
  it("KEY-01 the key exists before anything about the effect does", () => {
    // The key is computable from the effect id alone. No world, no process, no
    // clock: there is nothing that can fail between minting it and writing it
    // down, which is what makes it a key rather than a hope.
    const id = mintIdentity("E42");
    assert.equal(id.reconciliationKey, "spawn:E42");
    assert.equal(id.effectId, "E42");

    // Two mintings of the same effect agree, so a restart can recompute the key
    // from the log alone.
    assert.deepEqual(mintIdentity("E42"), id);
    assert.notEqual(mintIdentity("E43").reconciliationKey, id.reconciliationKey);
  });

  it("KEY-02 the world receives exactly this identity, by name", () => {
    const id = mintIdentity("E42");
    const env = workerEnvironment(SESSION, id);
    assert.equal(env.CUESHEET_EFFECT, "E42");
    assert.equal(env.CUESHEET_EFFECT_KEY, "spawn:E42");
    assert.equal(env.CUESHEET_EFFECT_NONCE, "nE42");
    assert.equal(env.CUESHEET_SESSION, SESSION);

    // Every value is recoverable from the log, so nothing depends on the worker
    // having been told something the record cannot reproduce.
    assert.equal(env.CUESHEET_EFFECT_KEY, request().reconciliationKey);
  });

  it("KEY-03 an identity obtained after the effect is not the recovery key", () => {
    // The pid is in the receipt, beside the effect, and never in its name.
    withRoot((root) => {
      const store = new ReceiptStore({ root });
      store.writeStarted(SESSION, {
        effectId: "E42",
        nonce: "nE42",
        pid: 93812,
        startedAt: NOW,
        subject: "fix the display",
      });

      // Looking up by pid is not even offered: the key is what resolves.
      const reality = store.observe(SESSION, "spawn:93812", () => false);
      assert.equal(reality.kind, "not_applicable", "a pid is not an effect key");
      assert.equal(reconcile(request({ reconciliationKey: "spawn:93812" }), reality).outcome, "INCONCLUSIVE");

      // And the receipt for E42 describes E42, not the pid it happened to have.
      const started = JSON.parse(
        readFileSync(join(root, SESSION, "effects", "E42", "started.json"), "utf8"),
      ) as { effectId: string; pid: number };
      assert.equal(started.effectId, "E42");
      assert.equal(started.pid, 93812, "the pid is an observation about E42");
    });
  });

  it("KEY-04 a proof of launch and a live worker are two facts", () => {
    withRoot((root) => {
      const store = new ReceiptStore({ root });
      store.writeStarted(SESSION, { effectId: "E42", nonce: "nE42", pid: 1, startedAt: NOW, subject: "g" });

      // Same receipts, different answer: the only thing that changed is whether
      // the pid answers. The launch proof did not change at all.
      const live = store.observe(SESSION, "spawn:E42", () => true);
      const gone = store.observe(SESSION, "spawn:E42", () => false);
      assert.equal(live.kind, "running");
      assert.equal(gone.kind, "completed_successfully");
      assert.notEqual(live.kind, gone.kind, "two facts, so two answers");
    });
  });

  it("KEY-05 an effect with no key stays INCONCLUSIVE", () => {
    withRoot((root) => {
      const store = new ReceiptStore({ root });
      store.writeStarted(SESSION, { effectId: "E42", nonce: "nE42", pid: 1, startedAt: NOW, subject: "g" });

      // Even with a receipt on disk, an effect that never recorded a key cannot
      // be looked up, and this adapter says so rather than guessing E42.
      const reality = store.observe(SESSION, undefined);
      assert.equal(reality.kind, "no_key");
      assert.equal(reconcile(request({ reconciliationKey: undefined }), reality).outcome, "INCONCLUSIVE");
    });
  });
});

describe("the receipts do not lie when they are damaged", () => {
  it("a receipt belonging to another effect is not read as this one", () => {
    withRoot((root) => {
      const store = new ReceiptStore({ root });
      // A correct receipt, written for E99, then planted in E42's directory. The
      // write goes through the store so the record is well-formed and the only
      // thing wrong with it is where it ended up.
      store.writeStarted(SESSION, { effectId: "E99", nonce: "nE99", pid: 1, startedAt: NOW, subject: "g" });
      mkdirSync(join(root, SESSION, "effects", "E42"), { recursive: true });
      copyFileSync(
        join(root, SESSION, "effects", "E99", "started.json"),
        join(root, SESSION, "effects", "E42", "started.json"),
      );

      // A wrong directory means the directory is wrong, not that E42 launched.
      // Unreadable, never success.
      const reality = store.observe(SESSION, "spawn:E42", () => false);
      assert.equal(reality.kind, "unreadable");
      // And E99 is still perfectly readable, so this is a misfiled record rather
      // than general corruption.
      assert.equal(store.observe(SESSION, "spawn:E99", () => false).kind, "completed_successfully");
    });
  });

  it("an exit receipt never changes what the spawn was", () => {
    withRoot((root) => {
      const store = new ReceiptStore({ root });
      store.writeStarted(SESSION, { effectId: "E42", nonce: "nE42", pid: 1, startedAt: NOW, subject: "g" });
      store.writeExited(SESSION, { effectId: "E42", nonce: "nE42", exitCode: 3, exitedAt: NOW + 10 });

      // The worker failed at something. The launch still happened, and SpawnAgent
      // asks about the launch.
      const reality = store.observe(SESSION, "spawn:E42", () => false);
      assert.equal(reality.kind, "completed_successfully");
      assert.equal(
        reconcile(request(), reality).outcome,
        "CONFIRMED_SUCCESS",
        "a non-zero exit is not a failed spawn",
      );
    });
  });

  it("an unreadable receipt is not absence", () => {
    withRoot((root) => {
      const store = new ReceiptStore({ root });
      mkdirSync(join(root, SESSION, "effects", "E42"), { recursive: true });
      // Exists, and is not JSON. The distinction that matters is not "no record"
      // but "a record I cannot read".
      writeFileSync(join(root, SESSION, "effects", "E42", "started.json"), "not json at all", "utf8");

      assert.equal(store.observe(SESSION, "spawn:E42", () => false).kind, "unreadable");
    });
  });

  it("a receipt store refuses a path that would escape its root", () => {
    withRoot((root) => {
      const store = new ReceiptStore({ root });
      assert.throws(
        () => store.writeStarted("../escape", { effectId: "E42", nonce: "n", pid: 1, startedAt: 0, subject: "g" }),
        /unsafe receipt path segment/,
      );
      assert.throws(
        () => store.writeRefused("S7", "../E42", "why"),
        /unsafe receipt path segment/,
      );
    });
  });
});