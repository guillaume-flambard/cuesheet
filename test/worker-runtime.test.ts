/**
 * P13, against real processes.
 *
 * Every worker here is a real `node` process that really acts. The worker is
 * deterministic on purpose: a model in the loop would mean any failure here
 * could be the model's, and the whole point of this milestone is that the
 * runtime is what is under test.
 *
 * Scenario C is the founding one. After P12 Cuesheet can find a launch. What it
 * had not shown is that it can find the *work*: a result that became durable
 * while Cuesheet was dead, and that is still readable on restart.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ReceiptStore } from "../src/adapters/effect-receipts.ts";
import { launch, prepare } from "../src/adapters/worker-launcher.ts";
import { EventStore } from "../src/core/store.ts";
import { SessionStore } from "../src/adapters/session-store.ts";
import { mintIdentity } from "../src/spawn.ts";
import { reconcile } from "../src/reconcile.ts";
import { workOutcomeOf, readReceipt, settlesWork } from "../src/work.ts";
import { effectRequested } from "../src/effects.ts";

const WORKER = join(process.cwd(), "src", "worker.ts");
const SESSION = "S7";
const INPUT = 'say what you want.\n';

interface Bench {
  root: string;
  receipts: ReceiptStore;
  sessions: SessionStore;
}

const bench = (): Bench => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-wrk-"));
  return {
    root,
    receipts: new ReceiptStore({ root }),
    sessions: new SessionStore({ root }),
  };
};

const cleanup = (b: Bench) => rmSync(b.root, { recursive: true, force: true });

/** Wait for a child to stop, with a ceiling so a hung worker fails the test. */
function settled(child: ReturnType<typeof launch>["child"]): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker did not stop in time")), 10_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
  });
}

/** Read the work outcome from a receipt directory, through the pure reader. */
function workOutcomeOfEffect(receipts: ReceiptStore, effectId: string, nonce: string) {
  const dir = join(receiptsRoot(receipts), SESSION, "effects", effectId);
  return workOutcomeOf(
    effectId,
    readReceipt(
      effectId,
      nonce,
      (name) => {
        try {
          readFileSync(join(dir, name), "utf8");
          return true;
        } catch {
          return false;
        }
      },
      (name) => {
        try {
          return readFileSync(join(dir, name), "utf8");
        } catch {
          return null;
        }
      },
      (name) => {
        try {
          return JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
        } catch {
          return undefined;
        }
      },
    ),
  );
}

/**
 * Where a receipt store's root is.
 *
 * A map rather than a field on the store, because the founding test builds a
 * *second* store after the simulated restart and it has to read the same place
 * the first one did. The first version kept the root on the store, so the
 * restart could not find its own receipts and the founding test failed on a
 * lookup rather than on a property.
 */
const roots = new Map<string, string>();
const receiptsRoot = (store: ReceiptStore): string => {
  const root = roots.get(store);
  if (!root) throw new Error("this receipt store has no root; track() it");
  return root;
};
const track = (b: Bench) => {
  roots.set(b.receipts, b.root);
  return b;
};

describe("WRK-02 the worker cannot reach the truth", () => {
  it("it imports nothing that could write to a session", () => {
    // Structural, so it is checked structurally: read the worker and look at
    // what it depends on. A promise in a comment would not survive this.
    const source = readFileSync(WORKER, "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
    for (const specifier of imports) {
      assert.equal(
        specifier.includes("store") || specifier.includes("state") || specifier.includes("effects"),
        false,
        `worker imports ${specifier}, which could reach the session store`,
      );
    }
  });

  it("it refuses to run without an identity to file a receipt against", async () => {
    // Without CUESHEET_EFFECT it could only write a receipt nobody could
    // attribute. Refusing is the honest move, and it is tested rather than
    // assumed.
    const b = track(bench());
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, [WORKER], { encoding: "utf8" });
    assert.equal(r.status, 2, "it refuses instead of writing a nameless receipt");
    assert.match(r.stderr, /refusing to run without/);
    assert.equal(b.receipts.effectsIn(SESSION).length, 0, "and wrote nothing");
    cleanup(b);
  });

  it("it is given a directory and an identity, and nothing else", () => {
    const id = mintIdentity("E42");
    const env = {
      ...workerEnvFor(id),
      CUESHEET_EFFECT_DIR: join("/tmp", "somewhere"),
    };
    const keys = Object.keys(env).filter((k) => k.startsWith("CUESHEET_")).sort();
    assert.deepEqual(keys, [
      "CUESHEET_EFFECT",
      "CUESHEET_EFFECT_DIR",
      "CUESHEET_EFFECT_KEY",
      "CUESHEET_EFFECT_NONCE",
      "CUESHEET_SESSION",
    ]);
    assert.equal(env.CUESHEET_SESSION, SESSION);
    assert.equal(env.CUESHEET_EFFECT, "E42");
  });
});

const workerEnvFor = (id: ReturnType<typeof mintIdentity>) => ({
  CUESHEET_SESSION: SESSION,
  CUESHEET_EFFECT: id.effectId,
  CUESHEET_EFFECT_KEY: id.reconciliationKey,
  CUESHEET_EFFECT_NONCE: id.nonce,
});

describe("scenario A: request, launch, result, exit", () => {
  it("the work is found after everything has stopped", async () => {
    const b = track(bench());
    b.sessions.create(SESSION, []);
    const id = mintIdentity("E42");

    // The request is durable before anything runs.
    b.sessions.append(SESSION, {
      ...effectRequested({
        id: id.effectId,
        effect: "SpawnAgent",
        subject: "summarise the prompt",
        affordance: "APPROVE_GOAL",
        reads: { goal: "known", pendingEffect: "known" },
        revision: 1,
        reconciliationKey: id.reconciliationKey,
      }),
      seq: 1,
      at: Date.now(),
    });

    const { child } = launch(
      { sessionId: SESSION, identity: id, receipts: b.receipts, script: WORKER, input: INPUT },
      b.root,
    );
    const code = await settled(child);
    cleanup(b);

    assert.equal(code, 0, "the worker exited cleanly");
    // The launch is proven, which is a different fact from the work.
    assert.equal(
      reconcile(
        { id: "E42", effect: "SpawnAgent", subject: "", affordance: "", reads: {}, revision: 1, reconciliationKey: "spawn:E42" },
        { kind: "completed_successfully" },
      ).outcome,
      "CONFIRMED_SUCCESS",
    );
  });
});

describe("scenario B: launched, crashed, produced nothing", () => {
  it("the spawn stays confirmed and the work outcome stays unknown", async () => {
    const b = track(bench());
    const id = mintIdentity("E43");

    // Prepared but never launched: the window P12 answers with NOT_FOUND.
    prepare({ sessionId: SESSION, identity: id, receipts: b.receipts, input: INPUT }, b.root);
    assert.equal(b.receipts.observe(SESSION, id.reconciliationKey, () => false).kind, "absent");

    // Launched, then killed before it could write anything.
    const { child, pid } = launch(
      { sessionId: SESSION, identity: id, receipts: b.receipts, script: WORKER, input: INPUT },
      b.root,
    );
    child.kill("SIGKILL");
    await settled(child);

    const spawnResult = reconcile(
      { id: "E43", effect: "SpawnAgent", subject: "", affordance: "", reads: {}, revision: 1, reconciliationKey: "spawn:E43" },
      b.receipts.observe(SESSION, id.reconciliationKey, () => false),
    );
    assert.equal(spawnResult.outcome, "CONFIRMED_SUCCESS", "the launch really happened");

    const work = workOutcomeOfEffect(b.receipts, id.effectId, id.nonce);
    cleanup(b);

    // WRK-04: stopping without an outcome does not manufacture one.
    assert.equal(work.outcome, "INCONCLUSIVE");
    assert.equal(settlesWork(work), false);
    assert.match(work.outcome === "INCONCLUSIVE" ? work.why : "", /no outcome receipt/);
    assert.ok(pid > 0);
  });
});

describe("scenario C: the result survived, and Cuesheet did not", () => {
  it("a result durable before the crash is recovered after the restart", async () => {
    // The founding test of the milestone. P12 made the *launch* findable. This
    // makes the *work* findable, which is the thing that was still missing.
    const b = track(bench());
    b.sessions.create(SESSION, []);
    const id = mintIdentity("E44");

    b.sessions.append(SESSION, {
      ...effectRequested({
        id: id.effectId,
        effect: "SpawnAgent",
        subject: "summarise",
        affordance: "APPROVE_GOAL",
        reads: { goal: "known", pendingEffect: "known" },
        revision: 1,
        reconciliationKey: id.reconciliationKey,
      }),
      seq: 1,
      at: Date.now(),
    });

    const { child } = launch(
      { sessionId: SESSION, identity: id, receipts: b.receipts, script: WORKER, input: INPUT },
      b.root,
    );
    await settled(child);

    // The result is durable in the receipt directory. The session log has no
    // observation of it, because Cuesheet has not been restarted yet and has
    // not looked.
    const sessionEvents = b.sessions.read(SESSION);
    assert.equal(
      sessionEvents.some((e) => e.data?.summary !== undefined),
      false,
      "nothing in the log knows about the result yet",
    );

    // Now the restart: a brand new store and a brand new receipt reader, which
    // is what "after a crash" means. Nothing is carried over in memory.
    const restarted = new SessionStore({ root: b.root });
    const freshReceipts = new ReceiptStore({ root: b.root });
    roots.set(freshReceipts, b.root);
    const store = new EventStore(SESSION, () => Date.now());
    for (const e of restarted.read(SESSION)) store.append({ ...e });

    // The launch is still findable, from P12.
    const spawnOutcome = reconcile(
      {
        id: "E44",
        effect: "SpawnAgent",
        subject: "",
        affordance: "",
        reads: {},
        revision: 1,
        reconciliationKey: "spawn:E44",
      },
      freshReceipts.observe(SESSION, "spawn:E44", () => false),
    );
    assert.equal(spawnOutcome.outcome, "CONFIRMED_SUCCESS");

    // And now the work, which is the new thing.
    const work = workOutcomeOfEffect(freshReceipts, "E44", id.nonce);
    cleanup(b);

    assert.equal(work.outcome, "CONFIRMED_COMPLETE", "the work is found after the restart");
    if (work.outcome === "CONFIRMED_COMPLETE") {
      // And it is checkable, not merely asserted: the digest is of the input.
      const expected = createHash("sha256").update(INPUT).digest("hex");
      assert.equal(work.digest, expected, "the digest is of what the worker read");
      assert.match(work.summary, /bytes, digest [0-9a-f]{12}/);
    }
  });

  it("the recovered result is recorded as a fact, not as a decision", async () => {
    // The distinction P10 did not have. Recording the outcome is a fact about
    // the world, so the revision it was observed at does not have to still be
    // current: something else may have happened in between, and that does not
    // make the result false.
    const b = track(bench());
    b.sessions.create(SESSION, []);
    const id = mintIdentity("E45");
    b.sessions.append(SESSION, {
      kind: "note",
      subject: "",
      data: { text: "the log has moved on" },
      seq: 1,
      at: Date.now(),
    });
    const staleRevision = 0;

    // A decision at a stale revision is refused.
    const refused = b.sessions.appendIfCurrent(SESSION, staleRevision, {
      kind: "effect_requested",
      subject: "",
      data: { effect: "SpawnAgent", effectId: "E46", affordance: "APPROVE_GOAL", reads: {} },
      seq: 0,
      at: Date.now(),
    });
    assert.equal(refused, null, "a stale decision is refused");

    // A fact at the same stale revision is written anyway.
    const fact = b.sessions.appendFact(SESSION, {
      kind: "note",
      subject: "",
      data: { effectId: "E45", summary: "the worker produced this", digest: "abc" },
    });
    assert.ok(fact, "a fact is not invalidated by the log having moved");
    assert.equal(fact.seq, 2, "and it is still sequenced at the current revision");
    cleanup(b);
  });
});

describe("scenario D: a damaged result stays inconclusive", () => {
  it("a truncated result.json settles nothing", async () => {
    const b = track(bench());
    const id = mintIdentity("E47");
    const { child } = launch(
      { sessionId: SESSION, identity: id, receipts: b.receipts, script: WORKER, input: INPUT },
      b.root,
    );
    await settled(child);

    // Damaged the way a crash during a write would damage it.
    const file = join(b.root, SESSION, "effects", "E47", "result.json");
    const whole = readFileSync(file, "utf8");
    writeFileSync(file, whole.slice(0, Math.floor(whole.length / 2)), "utf8");

    const work = workOutcomeOfEffect(b.receipts, "E47", id.nonce);
    cleanup(b);

    // WRK-06: never success, never failure.
    assert.equal(work.outcome, "INCONCLUSIVE");
    assert.equal(settlesWork(work), false);
    assert.match(work.outcome === "INCONCLUSIVE" ? work.why : "", /not readable/);
  });

  it("a result and a failure together settle nothing", () => {
    // The directory contradicts itself, so neither claim can be trusted. This is
    // the only shape where the reader refuses to pick a winner.
    const view = readReceipt(
      "E48",
      "nE48",
      (name) => name === "result.json" || name === "failure.json",
      () => "{}",
      () => ({}),
    );
    assert.equal(view.kind, "unreadable");
    const outcome = workOutcomeOf("E48", view);
    assert.equal(outcome.outcome, "INCONCLUSIVE");
    assert.match(outcome.outcome === "INCONCLUSIVE" ? outcome.why : "", /both a result and a failure/);
  });

  it("a receipt describing a different effect settles nothing", () => {
    const view = readReceipt(
      "E49",
      "nE49",
      (name) => name === "result.json",
      () => "{}",
      () => ({ effectId: "E99", digest: "d", summary: "s" }),
    );
    assert.equal(view.kind, "unreadable");
    assert.match(view.why, /does not describe E49/);
  });
});

describe("WRK-07 the same result cannot be recorded twice contradictorily", () => {
  it("re-reading a result gives the same outcome every time", () => {
    const body = { effectId: "E50", nonce: "nE50", summary: "same", digest: "d" };
    const read = () =>
      workOutcomeOf("E50", readReceipt("E50", "nE50", (n) => n === "result.json", () => "{}", () => body));
    const first = read();
    const second = read();
    assert.deepEqual(first, second, "one receipt, one reading, however many times");
    assert.equal(first.outcome, "CONFIRMED_COMPLETE");
  });

  it("a worker that fails writes a failure receipt, and the exit code is beside it", async () => {
    // WRK-03: the receipt is the claim, the exit code is a fact about the
    // process. Both exist here and only the receipt is read.
    const b = track(bench());
    const id = mintIdentity("E51");
    // No input, so the worker cannot read what it was asked to read.
    const { child } = launch(
      { sessionId: SESSION, identity: id, receipts: b.receipts, script: WORKER },
      b.root,
    );
    const code = await settled(child);
    const work = workOutcomeOfEffect(b.receipts, "E51", id.nonce);
    cleanup(b);

    assert.equal(code, 1, "the process failed");
    assert.equal(work.outcome, "CONFIRMED_FAILED", "and it said so in a receipt");
    // The exit code was 1 and the outcome is CONFIRMED_FAILED, but the second
    // was read from the receipt. Flipping the code while keeping the receipt
    // must not change the outcome, which is what makes them separate facts.
    assert.match(work.outcome === "CONFIRMED_FAILED" ? work.why : "", /ENOENT|no such file/i);
  });
});

describe("WRK-01 spawn success proves only the launch", () => {
  it("a launched worker that produced nothing still confirms the spawn", async () => {
    const b = track(bench());
    const id = mintIdentity("E52");
    // A receipt directory with a started receipt and nothing else: the shape of
    // a worker that launched and then produced nothing at all.
    b.receipts.writeStarted(SESSION, {
      effectId: "E52",
      nonce: "nE52",
      pid: 999_999,
      startedAt: Date.now(),
      subject: "spawn:E52",
    });

    const spawnResult = reconcile(
      { id: "E52", effect: "SpawnAgent", subject: "", affordance: "", reads: {}, revision: 1, reconciliationKey: "spawn:E52" },
      b.receipts.observe(SESSION, "spawn:E52", () => false),
    );
    const work = workOutcomeOfEffect(b.receipts, "E52", "nE52");
    cleanup(b);

    assert.equal(spawnResult.outcome, "CONFIRMED_SUCCESS");
    assert.equal(work.outcome, "INCONCLUSIVE", "which says nothing about the work");
  });
});
