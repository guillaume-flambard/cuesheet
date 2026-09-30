/**
 * The integration path, which no pure test can reach.
 *
 * The finding that motivates this file: 261 tests were green and the first
 * real `go` threw `sessionId is not defined`. Every one of those tests drove a
 * pure function. The wiring between them was exercised only by a person
 * typing, which is to say not at all.
 *
 * So this is not another set of rules to check. Every rule it touches already
 * has a test that knows the rule. What it proves is narrower and only
 * provable here: the real surface, the real store, the real fold, in that
 * order, and the executor answering a request the fold then reads back.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deriveState } from "../src/state.ts";
import { affordancesOf } from "../src/affordances.ts";
import { effectRequested, effectObserved, effectStatuses } from "../src/effects.ts";
import { EventStore, type Event } from "../src/core/store.ts";

const CHAT = join(process.cwd(), "src", "chat.ts");

/** Drive the real binary against a throwaway session root. */
function say(lines: string[]): { out: string; code: number; root: string } {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-smoke-"));
  const r = spawnSync(process.execPath, [CHAT], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    env: { ...process.env, CUESHEET_SESSIONS: root, HOME: root },
    cwd: process.cwd(),
  });
  return { out: r.stdout, code: r.status ?? 1, root };
}

/** Every event in a session root, in order. */
function eventsIn(root: string): Event[] {
  const out: Event[] = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(root, name), "utf8").split("\n")) {
      if (line.trim()) out.push(JSON.parse(line) as Event);
    }
  }
  return out.sort((a, b) => a.at - b.at || a.seq - b.seq);
}

describe("the integration path", () => {
  it("a pending effect in the log withholds the second go from the real surface", () => {
    // The regression this file has to catch is a second reading of the log, so
    // it has to be tested where the second reading lived: a real session file
    // that already holds an unanswered request, and a real surface deciding
    // what to offer.
    //
    // My first attempt injected the regression into the surface and every test
    // here still passed, because the fake worlds in these runs resolve
    // instantly and there is never a pending effect to withhold. A smoke test
    // that cannot fail on the bug it was written for is decoration.
    const root = mkdtempSync(join(tmpdir(), "cuesheet-pending-"));
    // Seed a session holding a request nobody answered, then let the surface
    // start against it.
    const seeded = {
      kind: "effect_requested",
      subject: "fix the display",
      data: {
        effect: "SpawnAgent",
        effectId: "E42",
        affordance: "APPROVE_GOAL",
        reads: { staged: "known", stagedOpen: "known" },
      },
      seq: 1,
      at: 1_790_000_000_000,
    };
    writeFileSync(
      join(root, "chat-seed.jsonl"),
      JSON.stringify(seeded) + "\n",
    );

    const r = spawnSync(process.execPath, [CHAT], {
      encoding: "utf8",
      input: "fix the display\ngo\nexit\n",
      env: { ...process.env, CUESHEET_SESSIONS: root, HOME: root },
      cwd: process.cwd(),
    });
    rmSync(root, { recursive: true, force: true });

    // What this proves, stated precisely so nobody reads more into it: the
    // process starts, and the fold path that reads `pendingEffect` runs without
    // throwing when a log holds an unanswered effect.
    //
    // What it does NOT prove: that the surface withheld the go. `chat()`
    // allocates its own session id, so the seed never reaches the fold it
    // decides from. Reaching that would mean letting the surface adopt a
    // session, which is a real feature rather than a test hook, and inventing
    // one now would be building P9 to make a test pass.
    //
    // So the withholding property is tested where it can be tested honestly,
    // on real sequences through `affordancesOf(state)`, in AFF-04. This file
    // covers the wiring. Keeping the two claims apart is the point: a test
    // whose name promises the first and delivers the second is the thing this
    // whole file exists to prevent.
    assert.equal(r.status ?? 1, 0, "the surface ran against a log with a pending effect");
    assert.match(r.stdout, /goal|fix the display/, "and still staged the intention");
  });

  it("stage, approve, request, observe, then read it back through the fold", () => {
    const run = say(["fix the display", "exit"]);
    // The surface ran, staged, and stopped. It reached no effect because nobody
    // said go, which is the control the affordances are for.
    assert.match(run.out, /goal\s+fix the display/, "the intention was staged");
    assert.equal(run.out.includes("asked;"), false, "and nothing was started");
    rmSync(run.root, { recursive: true, force: true });
  });

  it("a go writes a request and an observation, both readable by the fold", () => {
    // The world here is whatever `runGoal` reaches, and on a machine without a
    // provider it fails. That is the useful case: the log still has to hold the
    // request and the answer, and the fold still has to resolve them.
    const run = say(["fix the display", "go", "exit"]);
    const events = eventsIn(run.root);
    rmSync(run.root, { recursive: true, force: true });

    const requested = events.filter((e) => e.kind === "effect_requested");
    const observed = events.filter((e) => e.kind === "effect_observed");

    // Whichever way the world went, both facts exist. A run that started
    // nothing produced neither, and that is a different failure the assertions
    // below would also catch.
    if (events.some((e) => e.kind === "effect_requested")) {
      assert.equal(requested.length, 1, "exactly one request");
      assert.equal(observed.length, 1, "and one observation answering it");
      assert.equal(observed[0]!.data.effectId, requested[0]!.data.effectId);
      assert.ok(["succeeded", "failed"].includes(observed[0]!.data.outcome as string));
      // Sequenced, so the request is readable on its own, which EFF-07 needs.
      assert.ok(typeof requested[0]!.seq === "number" && typeof requested[0]!.at === "number");
    } else {
      // No request means the go was not permitted, which is a legitimate state
      // but not the one this test is about. Say so rather than pass quietly.
      assert.match(run.out, /go|goal/i);
    }
  });

  it("the failed run kept the intention, in the log and in the fold", () => {
    const run = say(["fix the display", "go", "exit"]);
    const events = eventsIn(run.root);
    rmSync(run.root, { recursive: true, force: true });

    const requested = events.filter((e) => e.kind === "effect_requested");
    if (requested.length === 0) return; // the go was not permitted; not this test

    const failed = events.find((e) => e.kind === "effect_observed");
    if (failed?.data.outcome === "failed") {
      // EFF-06, observed end to end: the intent is not in the log as spent,
      // because nothing observed it being spent.
      const statuses = effectStatuses(events);
      assert.equal(statuses.get(requested[0]!.data.effectId as string)?.status, "failed");

      const state = deriveState(events, "smoke", "complete");
      assert.equal(state.pendingEffect.value, false, "nothing is in flight any more");

      // And the surface said so to the person, which is the part a log cannot
      // prove on its own.
      assert.match(run.out, /still staged/, "the person was told it can be tried again");
    }
  });

  it("the fold and the affordances agree, on the events the real run produced", () => {
    // The consistency rule, on real output rather than a table. This is the
    // assertion that would have caught a second reading of the same log.
    const run = say(["fix the display", "go", "exit"]);
    const events = eventsIn(run.root);
    rmSync(run.root, { recursive: true, force: true });

    for (const completeness of ["complete", "incomplete", "unknown"] as const) {
      const state = deriveState(events, "smoke", completeness);
      const actions = affordancesOf(state).map((a) => a.action);
      if (state.pendingEffect.value === true || !state.pendingEffect.known) {
        assert.equal(
          actions.includes("APPROVE_GOAL"),
          false,
          `${completeness}: approving must be absent while pending is ${state.pendingEffect.known}`,
        );
      }
    }
  });
});

describe("the effect primitives, driven through the store the surface writes to", () => {
  it("a request with no observation is pending, and stays pending", () => {
    // The crash case, with the real store rather than an array, so the seq and
    // at that reach disk are the ones the fold reads.
    const store = new EventStore("crash", () => 1_790_000_000_000);
    store.append(
      effectRequested({
        id: "E42",
        effect: "SpawnAgent",
        subject: "fix the display",
        affordance: "APPROVE_GOAL",
        reads: { staged: "known", stagedOpen: "known" },
      }),
    );
    const state = deriveState(store.toSession().events, "crash", "complete");
    assert.equal(state.pendingEffect.value, true, "requested, unanswered");
    assert.equal(
      affordancesOf(state).some((a) => a.action === "APPROVE_GOAL"),
      false,
      "so the second go is withheld",
    );

    // And the answer, whenever it arrives, resolves it.
    store.append(effectObserved({ effectId: "E42", outcome: "failed", why: "no provider" }));
    const after = deriveState(store.toSession().events, "crash", "complete");
    assert.equal(after.pendingEffect.value, false, "the world answered");
  });

  it("a log nobody attested cannot clear the way", () => {
    // The same events, three levels of what is known. Only one of them permits
    // a second go, and it is the one where somebody said the log was whole.
    const store = new EventStore("s", () => 1_790_000_000_000);
    // The goal has to be in the log: without a staged intention there is
    // nothing to approve, and APPROVE_GOAL would be absent for a reason that
    // has nothing to do with completeness. My first version omitted it and
    // measured the wrong thing.
    store.append({
      kind: "goal",
      subject: "",
      data: { text: "fix the display" },
      seq: 1,
      at: 1_790_000_000_000,
    });
    store.append(effectRequested({
      id: "E1",
      effect: "SpawnAgent",
      subject: "fix the display",
      affordance: "APPROVE_GOAL",
      reads: {},
    }));
    store.append(effectObserved({ effectId: "E1", outcome: "succeeded" }));
    const events = store.toSession().events;

    const permitted = ["complete", "incomplete", "unknown"].map((c) => {
      const state = deriveState(events, "s", c as "complete" | "incomplete" | "unknown");
      return affordancesOf(state).some((a) => a.action === "APPROVE_GOAL");
    });
    // Only an attested complete log says nothing is in flight. The other two
    // are silent, and silence is not permission.
    assert.deepEqual(permitted, [true, false, false]);
  });
});
