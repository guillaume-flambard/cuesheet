/**
 * P10. The atomic boundary between judging and acting.
 *
 * The hole this closes is not a bug anybody wrote. It is what happens when two
 * surfaces both read a state and both find an action allowed:
 *
 *   A reads seq 41  -> APPROVE allowed
 *   B reads seq 41  -> APPROVE allowed
 *   A commits       -> E42 requested
 *   B commits       -> E43 requested
 *
 * Both decisions were locally valid against what each had seen. B's was wrong
 * by the time it landed. That is TOCTOU, and `pendingEffect` cannot see it,
 * because `pendingEffect` only becomes true once E42 is visible.
 *
 * The whole test is deterministic: no model, no agent, no provider, two
 * controllers and one log.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EventStore, type Event } from "../src/core/store.ts";
import { SessionStore } from "../src/adapters/session-store.ts";
import { deriveState } from "../src/state.ts";
import { affordancesOf } from "../src/affordances.ts";
import { effectRequested, type EffectRequest } from "../src/effects.ts";

const NOW = 1_790_000_000_000;
/**
 * A throwaway session root, cleaned up by removing the directory it made.
 *
 * Its own directory rather than the real one, because a test that cleans up by
 * deleting a developer's sessions is not a test.
 */
const withRoot = <T>(fn: (root: string) => T): T => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-rev-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("two controllers, one session", () => {
  it("the founding case: two approves on the same revision produce one effect", () => {
    const store = new EventStore("s", () => NOW);
    store.append({ kind: "goal", subject: "", data: { text: "fix the display", staged: true } });

    const at10 = deriveState(store.toSession().events, "s", "complete").revision;
    assert.equal(at10, 1, "the goal is at revision 1");

    // A and B both read the same state and both find approving allowed. Both
    // are right about what they saw.
    const readA = deriveState(store.toSession().events, "s", "complete");
    const readB = deriveState(store.toSession().events, "s", "complete");
    assert.equal(affordancesOf(readA).some((a) => a.action === "APPROVE_GOAL"), true);
    assert.equal(affordancesOf(readB).some((a) => a.action === "APPROVE_GOAL"), true);

    const request = (id: string): EffectRequest => ({
      id,
      effect: "SpawnAgent",
      subject: "fix the display",
      affordance: "APPROVE_GOAL",
      reads: { goal: "known", pendingEffect: "known" },
    });

    // A commits first, against the revision it read.
    const aEvent = store.appendIfCurrent(readA.revision, effectRequested(request("E2")));
    assert.ok(aEvent, "A wins, because nothing moved while it decided");
    assert.equal(aEvent.seq, 2);

    // B commits against the same revision. Its journal moved underneath it.
    const bEvent = store.appendIfCurrent(readB.revision, effectRequested(request("E3")));
    assert.equal(bEvent, null, "B is refused, and nothing was written for it");

    // Exactly one effect request exists, and E43 never happened.
    const kinds = store.toSession().events.filter((e) => e.kind === "effect_requested");
    assert.equal(kinds.length, 1, "one request, not two");
    assert.equal((kinds[0]!.data.effectId), "E2");
    assert.equal(
      store.toSession().events.some((e) => e.data.effectId === "E3"),
      false,
      "the loser's id appears nowhere",
    );

    // B re-reads. It now sees the truth, and the truth withholds the action.
    const after = deriveState(store.toSession().events, "s", "complete");
    assert.equal(after.pendingEffect.value, true, "pending, as A's request says");
    assert.equal(
      affordancesOf(after).some((a) => a.action === "APPROVE_GOAL"),
      false,
      "so B does not decide again out of a stale reading",
    );
  });

  it("a refusal leaves the journal byte-identical", () => {
    const store = new EventStore("s", () => NOW);
    store.append({ kind: "goal", subject: "", data: { text: "g", staged: true } });
    store.append({ kind: "note", subject: "", data: { text: "unrelated" } });

    const before = JSON.stringify(store.toSession().events);
    const stale = store.revision - 1;
    const refused = store.appendIfCurrent(stale, {
      kind: "effect_requested",
      subject: "g",
      data: { effect: "SpawnAgent", effectId: "E9", affordance: "APPROVE_GOAL", reads: {} },
    });

    assert.equal(refused, null);
    assert.equal(JSON.stringify(store.toSession().events), before, "nothing changed at all");
    assert.equal(store.revision, 2, "and the revision did not advance");
  });

  it("CON-06 the empty journal is revision -1, and saying 0 is a lie", () => {
    const store = new EventStore("s", () => NOW);
    assert.equal(store.revision, -1, "reading nothing is not reading revision 0");
    assert.equal(
      deriveState(store.toSession().events, "s", "complete").revision,
      -1,
      "and the fold says the same thing, rather than starting at 1",
    );

    // A surface that read nothing and claims revision 0 is refused, which is the
    // right outcome: it never observed the state it is deciding about.
    const claimed = store.appendIfCurrent(0, {
      kind: "note",
      subject: "",
      data: { text: "from someone who did not look" },
    });
    assert.equal(claimed, null);
  });

  it("a revision is the sequence, so it moves only when the log does", () => {
    const store = new EventStore("s", () => NOW);
    assert.equal(store.revision, -1, "the store and the fold agree on the empty journal");
    store.append({ kind: "note", subject: "", data: { text: "a" } });
    const fold = () => deriveState(store.toSession().events, "s", "complete").revision;
    assert.equal(fold(), 1, "and they agree once there is something");
    assert.equal(fold(), store.revision, "the fold never invents a revision of its own");

    // Reading does not move it. A fold is not a write.
    affordancesOf(deriveState(store.toSession().events, "s", "complete"));
    assert.equal(fold(), 1, "reading is not writing");
    // A refused append does not move it either.
    store.appendIfCurrent(0, { kind: "note", subject: "", data: { text: "late" } });
    assert.equal(fold(), 1, "and a refusal wrote nothing, so nothing moved");
  });
});

describe("two processes, one file", () => {
  const goalEvent = (seq: number) => ({
    kind: "goal" as const,
    subject: "",
    data: { text: "fix the display", staged: true },
    seq,
    at: NOW,
  });

  it("the file is the thing both processes contend on", () => {
    withRoot((root) => {
      const a = new SessionStore({ root });
      const b = new SessionStore({ root });
      a.create("s", []);
      a.append("s", goalEvent(1));

      assert.equal(a.revision("s"), 1);
      assert.equal(b.revision("s"), 1, "both see the same revision");

      // A commits against 1.
      const won = a.appendIfCurrent("s", 1, {
        kind: "effect_requested",
        subject: "fix the display",
        data: { effect: "SpawnAgent", effectId: "E2", affordance: "APPROVE_GOAL", reads: {} },
        seq: 0,
        at: NOW,
      });
      assert.ok(won, "A wrote");

      // B, holding its own store object, is refused: the file moved.
      const lost = b.appendIfCurrent("s", 1, {
        kind: "effect_requested",
        subject: "fix the display",
        data: { effect: "SpawnAgent", effectId: "E3", affordance: "APPROVE_GOAL", reads: {} },
        seq: 0,
        at: NOW,
      });
      assert.equal(lost, null, "B is refused even though it never touched A's object");

      const events = b.read("s");
      assert.equal(events.filter((e) => e.kind === "effect_requested").length, 1);
      assert.equal(b.revision("s"), 2, "and the file is at 2, not 3");
    });
  });

  it("a stale revision is refused on disk even when the file looks unchanged", () => {
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", goalEvent(1));

      const stale = store.appendIfCurrent("s", 0, {
        kind: "effect_requested",
        subject: "g",
        data: { effect: "SpawnAgent", effectId: "E9", affordance: "APPROVE_GOAL", reads: {} },
        seq: 0,
        at: NOW,
      });
      assert.equal(stale, null);
      assert.equal(store.read("s").length, 1, "still only the goal");
    });
  });

  it("the lock is released, so the next writer is not locked out forever", () => {
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", goalEvent(1));

      for (const id of ["E2", "E3", "E4"]) {
        const at = store.revision("s");
        const written = store.appendIfCurrent("s", at, {
          kind: "effect_requested",
          subject: "g",
          data: { effect: "SpawnAgent", effectId: id, affordance: "APPROVE_GOAL", reads: {} },
          seq: 0,
          at: NOW,
        });
        assert.ok(written, `${id} should not be locked out by a previous release`);
        assert.equal(written.seq, at + 1, "and the sequence continues, never restarting");
      }
      assert.deepEqual(
        store.read("s").map((e) => e.seq),
        [1, 2, 3, 4],
        "one unbroken log",
      );
    });
  });

  it("a refused append on disk leaves no lock behind", () => {
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", goalEvent(1));
      store.appendIfCurrent("s", 99, {
        kind: "note",
        subject: "",
        data: { text: "refused" },
        seq: 0,
        at: NOW,
      });
      // If the lock had leaked, this would return null and the session would be
      // permanently unwritable.
      const next = store.appendIfCurrent("s", 1, {
        kind: "note",
        subject: "",
        data: { text: "accepted" },
        seq: 0,
        at: NOW,
      });
      assert.ok(next, "the session still accepts writes after a refusal");
    });
  });
});

describe("the surface writes one unbroken log", () => {
  it("sequences start at 1 and never leave a hole", () => {
    // Both mistakes in one place. The surface numbered its own appends with
    // `revision + 1`, which makes the first event sequence 0 because an empty
    // log is at revision -1, and with `revision + 2` after fixing that, which
    // leaves a hole at 2. Neither showed up in any other test, because every
    // other test reads the log through the fold, and the fold reports the last
    // sequence whatever it is.
    //
    // A log with a hole is not a log you can reason about. If sequence 2 is
    // missing, then "the revision I read" and "the revision I append at" are
    // two different numbers, and the whole P10 guarantee is decorative.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      assert.equal(store.revision("s"), -1, "an empty session is at -1");

      // What the surface does, stated once: next sequence is 1 when empty.
      const appendLike = (event: Omit<Event, "seq" | "at">) => {
        const at = store.revision("s");
        store.append("s", { ...event, seq: at < 0 ? 1 : at + 1, at: NOW } as Event);
      };

      appendLike({ kind: "goal", subject: "", data: { text: "g", staged: true } });
      appendLike({ kind: "note", subject: "", data: { text: "b" } });
      appendLike({ kind: "note", subject: "", data: { text: "c" } });

      assert.deepEqual(
        store.read("s").map((e) => e.seq),
        [1, 2, 3],
        "one, two, three: no zero to start and no gap after",
      );
    });
  });

  it("a folded revision equals the store's own revision for the same file", () => {
    // The guarantee P10 rests on: the number the affordance carries is the
    // number the append will compare against. If those two could differ, a
    // commit would be refused for reasons that have nothing to do with the
    // world moving, which is the confusing failure mode rather than the safe
    // one.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", {
        kind: "goal",
        subject: "",
        data: { text: "g", staged: true },
        seq: 1,
        at: NOW,
      });

      const folded = deriveState(store.read("s"), "s", "complete").revision;
      assert.equal(folded, store.revision("s"), "same log, same revision");

      // And a commit against the folded revision is accepted.
      const written = store.appendIfCurrent("s", folded, {
        kind: "effect_requested",
        subject: "g",
        data: { effect: "SpawnAgent", effectId: "E2", affordance: "APPROVE_GOAL", reads: {} },
        seq: 0,
        at: NOW,
      });
      assert.ok(written, "which is the whole point of carrying it");
      assert.equal(written.seq, folded + 1, "and it lands at the next sequence");
    });
  });
});
