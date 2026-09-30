/**
 * Ten attacks on one file, and the three that turned out to be already held.
 *
 * The subject is `src/adapters/session-store.ts`: the place where the event log
 * becomes bytes, and therefore the only place where two processes can disagree
 * about what happened. Everything upstream is pure and cannot be raced, so every
 * question about concurrency, crash and corruption lands here or nowhere.
 *
 * The file is organised by attack, because the attacks are what a reader needs to
 * check. Each test is named `defect_X_Y` after the attack that motivated it, so
 * a test and the defect it covers can be found from either end. The measurements
 * themselves are not repeated here.
 *
 * Three rules shape what follows.
 *
 * 1. A red test first. Every guarantee this file asserts that the store did not
 *    already hold was written before the store was changed. A test that passes
 *    before the patch is a pin rather than a proof, and says so in its own
 *    comment, because a pin that is never re-measured is how a held guarantee
 *    quietly stops being held.
 * 2. No fixture is hand built. A dead holder's lock is produced by a real
 *    process that acquires it through the store's own path and dies holding it.
 *    The lock file a test then uses is read off the filesystem, so the naming
 *    convention is derived from the module rather than restated by the test.
 * 3. A negative result is a result. Three attacks did not reproduce a defect.
 *    They are pinned here so the next person does not pay to measure them again.
 *
 * What no test here can show is the last test of the file, and it is the limit
 * that matters most: a lock whose holder died before it could write anything
 * cannot be told apart from one whose holder is alive, because the journal does
 * not record who holds it. That case is diagnosed, never recovered.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { childEnv } from "./fixtures/hermetic-env.ts";
import { SessionStore, type SessionStoreError } from "../src/adapters/session-store.ts";
import { EventStore, type Event } from "../src/core/store.ts";

/** The store, imported by every child this file starts. */
const STORE_URL = new URL("../src/adapters/session-store.ts", import.meta.url).href;
const STORE_PATH = new URL("../src/adapters/session-store.ts", import.meta.url).pathname;

const NOW = 1_790_000_000_000;

const event = (seq: number, kind: Event["kind"] = "note", text = "e"): Event => ({
  seq,
  at: NOW + seq,
  kind,
  subject: "b",
  data: { text },
});

const decision = (effectId: string): Event => ({
  seq: 0,
  at: NOW,
  kind: "effect_requested",
  subject: "g",
  data: { effect: "SpawnAgent", effectId, affordance: "APPROVE_GOAL", reads: {} },
});

/** The damage a broken line leaves, narrowed for the assertions below. */
interface LineDamage {
  why: "unreadable" | "out_of_sequence";
  line: number;
  linesAfter: number;
  claims: number | null;
}
const lineDamage = (damage: unknown): LineDamage => damage as LineDamage;

/**
 * A throwaway session root, removed however the test ends.
 *
 * A root left read only by D3 is made writable again first, because removing a
 * file needs write permission on the directory holding it.
 */
const makeRoot = (): string => mkdtempSync(join(tmpdir(), "cuesheet-adversary-"));
const dropRoot = (root: string): void => {
  try {
    chmodSync(root, 0o700);
  } catch {
    // Already gone, which is the same outcome.
  }
  rmSync(root, { recursive: true, force: true });
};
const withRoot = <T>(fn: (root: string) => T): T => {
  const root = makeRoot();
  try {
    return fn(root);
  } finally {
    dropRoot(root);
  }
};
const withRootAsync = async <T>(fn: (root: string) => Promise<T>): Promise<T> => {
  const root = makeRoot();
  try {
    return await fn(root);
  } finally {
    dropRoot(root);
  }
};

/** A journal of `events`, written the way the store writes one. */
const seed = (root: string, id: string, events: Event[]): void => {
  const store = new SessionStore({ root });
  store.create(id, []);
  for (const e of events) store.append(id, e);
};

/** The raw bytes of a journal. For damage only, never for a healthy log. */
const bytes = (root: string, id: string, content: string): void => {
  writeFileSync(join(root, `${id}.jsonl`), content);
};

const lines = (...events: Event[]): string => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

/** Every lock file in a root, so a test never assumes what a lock is called. */
const locksIn = (root: string): string[] => readdirSync(root).filter((f) => f.endsWith(".lock"));

/** The reason on a thrown store error, read through the public type. */
const reasonOf = (err: unknown): string => (err as SessionStoreError).reason;

/** The error a call produced, or `null` if it produced none. */
const caught = (fn: () => unknown): unknown => {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
};

/**
 * An oracle that does not go through the store.
 *
 * The guarantee A3 is about is a property of the bytes, so the reader here reads
 * bytes. If the check used the store's own parser, a parser bug could satisfy
 * itself, which is the shape of a test that cannot fail.
 */
const readRaw = (root: string, id: string): { seqs: number[]; unreadableAt: number } => {
  const raw = readFileSync(join(root, `${id}.jsonl`), "utf8");
  const rows = raw.split("\n").filter((line) => line.trim().length > 0);
  const seqs: number[] = [];
  for (const [index, row] of rows.entries()) {
    let seq: unknown;
    try {
      seq = (JSON.parse(row) as Event).seq;
    } catch {
      return { seqs, unreadableAt: index };
    }
    seqs.push(seq as number);
  }
  return { seqs, unreadableAt: -1 };
};

/**
 * Strand a lock the way a holder that dies strands one.
 *
 * A real child acquires the lock through the store's own `appendIfCurrent` and
 * then dies before it can release it. The crash point is the one a caller can
 * reach that the store does not control: the event's own serialization, which
 * happens after the revision check and before the write. `process.exit` does not
 * unwind the stack, so the `finally` that releases the lock never runs. That is a
 * genuine corpse, not a simulated one.
 *
 * Returns the lock file the corpse left, so the convention comes from the store.
 */
const strandLock = (root: string, id: string, expectedRevision: number): string => {
  const script = `
    const { SessionStore } = await import(process.argv[1]);
    const store = new SessionStore({ root: process.argv[2] });
    store.appendIfCurrent(process.argv[3], Number(process.argv[4]), {
      seq: 0,
      at: 1,
      kind: "note",
      subject: "holder",
      data: { text: "never serialized" },
      toJSON() { process.exit(9); },
    });
    process.exit(8);
  `;
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script, STORE_URL, root, id, String(expectedRevision)],
    { encoding: "utf8", env: childEnv({ sessions: root, home: root }) },
  );
  assert.equal(
    r.status,
    9,
    `the child must die holding the lock: 9 is the crash point, 8 means it committed anyway, ${r.status} is a failure (${r.stderr})`,
  );
  const left = locksIn(root);
  assert.equal(left.length, 1, `exactly one lock is stranded, got ${JSON.stringify(left)}`);
  return left[0]!;
};

/**
 * Four committed events and a fifth that was cut off mid write.
 *
 * The write discipline is append, fsync, then report. A process that dies
 * between the write and the fsync leaves a partial line, and the event in that
 * line was never reported as committed, so it is not a lost event: it is an
 * event that never happened. The three before it are committed and durable.
 */
const tornTail = (root: string, id = "s"): void => {
  bytes(root, id, lines(event(1), event(2), event(3)) + '{"seq":4,"at":1790000004000,"kind":"not');
};

describe("A1: a lock left behind by a holder that died", () => {
  it("defect_A1_a_dead_holders_lock_is_reported, so a refusal is not a mystery", () => {
    // The irreducible case, and the one the fork does not claim to fix. A holder
    // acquires the lock at revision 1 and dies before it writes anything. The
    // journal is still at 1, so the lock is not an orphan, and nothing in the
    // journal can say whether the holder is alive. A writer at revision 1 is
    // refused, and on the old code that refusal is indistinguishable from a lost
    // race: null means "re-read and decide again", re-reading changes nothing,
    // and the caller loops forever with no diagnostic.
    //
    // What the patch buys is the diagnosis, not the recovery. `lockState` names
    // the revision the lock holds and where the journal actually is, so the
    // refusal can be attributed: the journal did not move, and something holds
    // revision 1. That is the difference between a conflict and a corpse, which
    // is the whole question a caller has.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));
      const lock = strandLock(root, "s", 1);

      assert.equal(
        typeof store.lockState,
        "function",
        "a store that cannot report a held lock has no answer for a caller that was refused",
      );
      const state = store.lockState("s", 1);
      assert.ok(state, "a lock this store created must be reported rather than inferred");
      assert.equal(state.revision, 1, "and it names the revision it is holding");
      assert.equal(state.journalAt, 1, "the journal did not move, which is the whole fact");
      assert.equal(state.orphaned, false, "so it is not an orphan and must not be reclaimed");
      assert.equal(
        basename(state.file),
        lock,
        "and it is the file the dead process left, which is how the naming gets derived rather than assumed",
      );

      // The refusal is unchanged, deliberately. P10's contract is that a second
      // writer is told nothing was written. What changed is that the refusal now
      // has an answer to look up.
      const refused = store.appendIfCurrent("s", 1, decision("E1"));
      assert.equal(refused, null, "nothing is written while a lock is held at this revision");
      assert.equal(store.revision("s"), 1, "and the journal did not move");
    });
  });

  it("defect_A1_an_orphaned_lock_is_reclaimed, and reclaiming it writes nothing", () => {
    // The safety argument as a test rather than as a comment. A lock naming
    // revision r is an orphan once the journal is past r, because a holder
    // commits at most once per acquisition, in r+1, and a writer that would need
    // r+1 has to pass `revision() === r`, which is false by then. Removing it
    // cannot authorise a second commit at r+1, and this asserts that: the
    // sequence 2 that already exists is still the only one.
    //
    // The orphan is reached through the store's own paths. A real holder dies
    // holding the lock, then a fact is appended, which A8 says a lock never
    // blocks. That moves the journal to 2 and leaves the lock naming a revision
    // the journal has passed.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));
      strandLock(root, "s", 1);

      const fact = store.appendFact("s", { kind: "note", subject: "w", data: { text: "observed" } });
      assert.equal(fact.seq, 2, "a fact is not blocked by a lock, which is what makes this lock an orphan");

      const refused = store.appendIfCurrent("s", 1, decision("E1"));
      assert.equal(refused, null, "a stale decision is refused, orphan or not");
      assert.deepEqual(locksIn(root), [], "and the orphan is gone, which is the reclamation");
      assert.deepEqual(
        store.read("s").map((e) => e.seq),
        [1, 2],
        "reclaiming wrote nothing: sequence 2 exists exactly once",
      );
    });
  });

  it("defect_A1_orphanhood_is_derived_from_the_journal, so a dead process cannot fake it", () => {
    // The same state as the previous test, read instead of reclaimed. Nothing in
    // this answer comes from the dead holder: the revision comes from the lock's
    // name and the journal's position comes from the log, so a process that no
    // longer exists has no way to make either of them wrong. That is the whole
    // reason the lock carries the revision rather than a PID.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));
      strandLock(root, "s", 1);
      store.appendFact("s", { kind: "note", subject: "w", data: { text: "observed" } });

      const state = store.lockState("s", 1);
      assert.ok(state, "the lock is still there, so the state of the session is still knowable");
      assert.equal(state.revision, 1, "the revision comes from the lock's name");
      assert.equal(state.journalAt, 2, "and the journal's position comes from the log itself");
      assert.equal(state.orphaned, true, "so this one is an orphan, and reclaiming it is safe");
    });
  });

  it("defect_A1b_a_lock_from_an_older_revision_does_not_block_a_valid_commit", () => {
    // A1b, which the revision in the lock's name fixes by construction. A holder
    // acquired at revision 1, committed sequence 2, and died before releasing. On
    // a lock whose name carries no revision, that leftover file blocks every later
    // writer, including one committing at revision 2 against a current read. The
    // refusal it produced was for a revision that no longer existed.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));
      strandLock(root, "s", 1);
      store.appendFact("s", { kind: "note", subject: "w", data: { text: "moved on" } });

      assert.equal(store.revision("s"), 2, "the journal is at 2 and this read is current");
      const won = store.appendIfCurrent("s", 2, decision("E2"));
      assert.ok(won, "a valid commit is not blocked by a lock left at an older revision");
      assert.equal(won.seq, 3);
      assert.deepEqual(
        store.read("s").map((e) => e.seq),
        [1, 2, 3],
        "one unbroken run",
      );
    });
  });

  it("defect_A1b_a_lock_left_by_an_older_version_does_not_brick_a_session", () => {
    // The upgrade residue, and it is the same defect as the one above seen from
    // the other side. Every session root in the world already holds locks named
    // `<session>.jsonl.lock`, written by the revision-independent naming this
    // patch replaces. If the new code consulted those names it would inherit
    // every stranded lock ever left behind. It does not: the name it takes now
    // carries a revision, and a file that carries none is a file this store did
    // not write and does not answer to.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));
      const legacy = join(root, "s.jsonl.lock");
      writeFileSync(legacy, "");

      const won = store.appendIfCurrent("s", 1, decision("E1"));
      assert.ok(won, "a lock from the old naming does not contend with anything");
      assert.equal(won.seq, 2);
      assert.equal(
        existsSync(legacy),
        true,
        "and the old file is left where it is: this store did not write it, so deleting it is not its call",
      );
      assert.equal(
        readdirSync(root).filter((f) => f.endsWith(".jsonl")).length,
        1,
        "and an old lock is not a session, so the inventory still holds one session",
      );
    });
  });
});

describe("D3: a refusal the disk produced is not a conflict", () => {
  it("defect_D3_a_disk_refusal_throws_instead_of_returning_null", () => {
    // `openSync(lock, "wx")` fails for every reason a filesystem has, and the
    // old code caught all of them and returned null. EACCES, ENOSPC, EMFILE and
    // EROFS all became "the journal moved", which is a statement about the
    // world. It is false, re-reading never clears it, and it is silent: the
    // caller waits for a conflict that will never arrive. The same file already
    // threw loudly when the release failed, so the asymmetry was an oversight
    // rather than a decision.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));

      // The precondition, asserted rather than assumed. A read only directory
      // produces no refusal for a privileged user, and a test that cannot fail is
      // decoration, so the machine has to prove it can produce one.
      chmodSync(root, 0o500);
      try {
        assert.throws(
          () => openSync(join(root, "probe"), "wx"),
          /EACCES/,
          "this machine must be able to produce a disk refusal, or this test proves nothing",
        );

        const thrown = caught(() => store.appendIfCurrent("s", 1, decision("E2")));
        assert.ok(thrown, "a disk refusal is not a conflict and must not be reported as one");
        assert.equal(reasonOf(thrown), "write_refused", "so the caller can tell which refusal this was");
        assert.match(String((thrown as Error).message), /EACCES/, "naming the errno rather than guessing at it");
        assert.deepEqual(
          store.read("s").map((e) => e.seq),
          [1],
          "and nothing was written",
        );
      } finally {
        chmodSync(root, 0o700);
      }

      const won = store.appendIfCurrent("s", 1, decision("E3"));
      assert.ok(won, "the refusal was transient and left no state behind");
      assert.equal(won.seq, 2);
    });
  });

  it("defect_D3_a_journal_that_cannot_be_read_carries_a_reason, not a raw errno", () => {
    // The same shape one step earlier. `appendFact` took its sequence from
    // `revision()`, which reads the file, so a journal that is not a journal
    // threw whatever node threw. A throw is loud and so better than null, but
    // with no reason attached a caller still cannot tell a broken session from a
    // busy disk. It carries one now.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));
      rmSync(join(root, "s.jsonl"));
      mkdirSync(join(root, "s.jsonl"), { recursive: true });

      const thrown = caught(() => store.appendFact("s", { kind: "note", subject: "w", data: { text: "x" } }));
      assert.ok(thrown, "a directory where the log belongs cannot be appended to");
      assert.equal(reasonOf(thrown), "journal_damaged", "this session can no longer commit, which is not a conflict");
      assert.match(String((thrown as Error).message), /journal/i);

      const attested = store.attest("s");
      assert.equal(attested.events.length, 0, "and no event is claimed from bytes that are not events");
      assert.equal(attested.damage?.why, "unreadable_file", "which is named as what it is");
    });
  });
});

describe("A2 and A4: a journal whose last line was cut off", () => {
  // A2 and A4 are one finding measured twice, so they are patched once. Three
  // durable events were unreachable through any public call, because `read`,
  // `revision` and `appendFact` all threw on the parse. And `list` answered
  // `events: -1, goal: "(unreadable)"`, which is the lie in the other direction:
  // a total loss reported where three of four were intact, and a string placed in
  // the goal field where every other value is goal text.

  it("defect_A2_the_intact_prefix_stays_readable_and_the_damage_is_named", () => {
    withRoot((root) => {
      tornTail(root);
      const store = new SessionStore({ root });
      assert.equal(
        typeof store.attest,
        "function",
        "a store that cannot read a damaged journal past the damage cannot report what survived",
      );

      const attested = store.attest("s");
      assert.deepEqual(
        attested.events.map((e) => e.seq),
        [1, 2, 3],
        "three committed events are durable and must stay reachable",
      );
      const damage = lineDamage(attested.damage);
      assert.equal(damage.why, "unreadable", "the bytes are not an event at all");
      assert.equal(damage.line, 4, "named at the line that broke it");
      assert.equal(damage.linesAfter, 0, "nothing follows, which is the shape a crash leaves");
      assert.equal(damage.claims, null, "and the line claims nothing, because it cannot be read");

      // A caller that asked for every event still gets told loudly, because a
      // partial answer to "every event" is a wrong answer.
      assert.throws(() => store.read("s"), /journal/i);
      assert.throws(() => store.revision("s"), /journal/i, "so a decision cannot be taken against a broken log");
    });
  });

  it("defect_A4_list_reports_a_damaged_session_as_damaged, not as a lost one", () => {
    withRoot((root) => {
      tornTail(root);
      const rows = new SessionStore({ root }).list();

      assert.equal(rows.length, 1, "the session exists, and hiding it would be the first lie");
      const row = rows[0]!;
      assert.equal(row.events, 3, "the measured count, not -1, which claimed a total loss");
      assert.equal(row.damaged, true, "damage is a fact of its own, not something a reader has to guess");
      assert.equal(row.goal, "", "an unknown goal is empty, not a string pretending to be a goal");
      assert.equal(row.lastAt, event(3).at, "sorted by a real timestamp, so the session is not buried");
    });
  });

  it("defect_A2_writing_after_the_break_is_refused, because the sequence would collide", () => {
    // The break is not cosmetic. Appending after unattested bytes would give a
    // new event a sequence something behind the break already claims, and a fact
    // is never refused for being stale, so this has to be refused for another
    // reason and to say which.
    withRoot((root) => {
      tornTail(root);
      const store = new SessionStore({ root });

      const thrown = caught(() =>
        store.appendFact("s", { kind: "note", subject: "w", data: { text: "after the break" } }),
      );
      assert.ok(thrown, "a fact after unattested bytes would claim a sequence already claimed");
      assert.equal(reasonOf(thrown), "journal_damaged", "not a conflict, and it does not pretend to be one");

      const alsoRefused = caught(() => store.appendIfCurrent("s", 3, decision("E9")));
      assert.equal(reasonOf(alsoRefused), "journal_damaged", "and a decision is refused the same way");

      // The third write path, and the only one that does not ask for a sequence
      // first. It is the door `chat.ts:245` comes through, so leaving it open
      // would let a surface write straight past a broken journal and turn the
      // damage into a duplicate sequence nobody is looking at.
      const raw = caught(() => store.append("s", event(4)));
      assert.equal(reasonOf(raw), "journal_damaged", "a raw append is refused too");
      assert.equal(
        readFileSync(join(root, "s.jsonl"), "utf8").split("\n").filter((l) => l.trim()).length,
        4,
        "and the file is exactly as it was: three events and the torn line",
      );
    });
  });
});

describe("A5 and A7: two lines claiming the same sequence", () => {
  it("defect_A5_a_duplicated_sequence_is_damage_named_at_the_second_line", () => {
    // The measurement was 241 events holding 160 distinct sequences, 70 of them
    // duplicated, with `read().length` at 241 and `revision()` at 160 and no
    // diagnostic anywhere. A hole and a duplicate are one failure with a
    // different sign: the log is no longer a contiguous run, so the sequence a
    // decision compared against no longer names a line on disk.
    withRoot((root) => {
      bytes(root, "s", lines(event(1), event(2), event(2), event(3)));
      const store = new SessionStore({ root });

      const attested = store.attest("s");
      assert.deepEqual(
        attested.events.map((e) => e.seq),
        [1, 2],
        "only the run up to the break is attested, and nothing past it is claimed",
      );
      const damage = lineDamage(attested.damage);
      assert.equal(damage.why, "out_of_sequence");
      assert.equal(damage.line, 3, "named at the second line claiming 2");
      assert.equal(damage.claims, 2, "the sequence it claims, which is the evidence");
      assert.equal(damage.linesAfter, 1, "and the line behind it is counted rather than dropped");
    });
  });

  it("defect_A7_a_duplicated_journal_diverges_on_replay, which is why it is damage", () => {
    // Why a duplicate is not cosmetic, as a measurement rather than an argument.
    // A replay renumbers by position, so three persisted lines 1, 2, 2 come back
    // as 1, 2, 3: the sequence a P10 decision compared no longer names the line
    // on disk. The store handed out a log whose replay was a different log.
    withRoot((root) => {
      const persisted = [event(1), event(2), event(2)];
      bytes(root, "s", lines(...persisted));
      const store = new SessionStore({ root });

      const replayed = new EventStore("s", () => 0);
      for (const e of persisted) replayed.append({ ...e });
      assert.notDeepEqual(
        replayed.events.map((e) => e.seq),
        persisted.map((e) => e.seq),
        "the divergence this defect is about is real, so the damage check is not decoration",
      );

      assert.ok(store.attest("s").damage, "a journal whose replay diverges is not attested");
      assert.throws(() => store.read("s"), /journal/i, "so a whole log read refuses it loudly");
      assert.deepEqual(
        store.attest("s").events.map((e) => e.seq),
        [1, 2],
        "while the part that replays identically stays reachable",
      );
    });
  });
});

describe("A6: a hole in the sequence", () => {
  it("defect_A6_a_missing_sequence_is_damage, and it is named where the run opens", () => {
    // Never cared about, never signalled, and `list` called the session healthy.
    // Under the same rule as a duplicate, a hole is the same finding: the run is
    // broken, and where it breaks is a measured line, not a guess about which
    // line went missing.
    withRoot((root) => {
      bytes(root, "s", lines(event(1), event(3), event(4)));
      const attested = new SessionStore({ root }).attest("s");

      assert.deepEqual(attested.events.map((e) => e.seq), [1], "the run ends where it breaks");
      const damage = lineDamage(attested.damage);
      assert.equal(damage.why, "out_of_sequence");
      assert.equal(damage.line, 2);
      assert.equal(damage.claims, 3, "which is what skipped 2");
      assert.equal(damage.linesAfter, 1, "and the one line behind the break is counted, not dropped");
    });
  });
});

describe("A10: what a restart is told", () => {
  it("defect_A10_no_corrupt_state_is_reported_as_a_healthy_journal", () => {
    // A restart is a new process with nothing in memory, so whatever the store
    // claims is all the caller gets. The property is not "every corruption is
    // detected", which is stronger than this format can promise, but the one that
    // matters: no state is reported as a healthy journal while its sequences are
    // not contiguous. The six states are the measurement, and the count of
    // detected states is printed so a change in it is visible in the log.
    const states: Array<{ name: string; content: string }> = [
      { name: "a torn last line", content: lines(event(1), event(2), event(3)) + '{"seq":4,"kind":"not' },
      { name: "a duplicated sequence", content: lines(event(1), event(2), event(2)) },
      { name: "a hole in the sequence", content: lines(event(1), event(3)) },
      { name: "a reordered pair", content: lines(event(1), event(3), event(2)) },
      { name: "garbage at the start", content: "{not an event\n" + lines(event(1)) },
      { name: "an event with no sequence", content: lines(event(1)) + '{"at":1,"kind":"note","data":{}}\n' },
    ];

    const detected: string[] = [];
    for (const state of states) {
      withRoot((root) => {
        bytes(root, "s", state.content);
        const store = new SessionStore({ root });
        const attested = store.attest("s");
        const seqs = attested.events.map((e) => e.seq);
        assert.ok(
          seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1),
          `${state.name}: whatever is attested must be a contiguous run, got ${seqs}`,
        );

        const row = store.list()[0]!;
        assert.equal(row.damaged, attested.damage !== null, `${state.name}: list agrees with attest`);
        if (attested.damage) {
          detected.push(state.name);
          assert.equal(row.events, seqs.length, `${state.name}: a measured count, never -1`);
          assert.equal(row.goal, "", `${state.name}: nothing is invented to fill the fields`);
        }
      });
    }

    assert.equal(
      detected.length,
      states.length,
      `every state must be named rather than passed over; detected: ${detected.join("; ")}`,
    );
    console.log(`  A10 restart states: ${detected.length}/${states.length} reported damaged`);
  });
});

describe("A8, A9, A3: the three that held", () => {
  // Each of these three was measured and did not reproduce a defect. They are
  // pinned rather than patched, and each pin is a measurement in its own right.

  it("defect_A8_a_fact_is_not_blocked_by_a_lock, and the revision check is what carries it", () => {
    // A8 held, for a reason worth keeping: the lock was never what protected a
    // fact. The revision comparison alone did it, and the lock added nothing a
    // fact needed. This negative result is load bearing, because the patch moves
    // the revision into the lock's name and must not turn a fact into a decision
    // on the way past.
    withRoot((root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));
      strandLock(root, "s", 1);

      const fact = store.appendFact("s", { kind: "note", subject: "w", data: { text: "a real result" } });
      assert.equal(fact.seq, 2, "a fact is written while a lock is held, sequenced at the current revision");

      const refused = store.appendIfCurrent("s", 1, decision("E1"));
      assert.equal(refused, null, "the same lock refuses a decision at a stale revision");
    });
  });

  it("defect_A9_four_processes_racing_one_revision_produce_exactly_one_commit", async () => {
    // A9 held: `wx` plus the revision comparison, in four real processes rather
    // than one interleaved thread, because that is the only shape the race has.
    // The invariant is the point: one commit, one sequence 2, and every loser told
    // nothing was written. No loser may see an error, because a refusal a caller
    // cannot read as a refusal is the defect this whole file is about.
    await withRootAsync(async (root) => {
      const store = new SessionStore({ root });
      store.create("s", []);
      store.append("s", event(1));

      const script = `
        const { SessionStore } = await import(process.argv[1]);
        const store = new SessionStore({ root: process.argv[2] });
        const out = store.appendIfCurrent("s", 1, {
          seq: 0,
          at: 1,
          kind: "effect_requested",
          subject: "g",
          data: { effect: "SpawnAgent", effectId: process.argv[3], affordance: "APPROVE_GOAL", reads: {} },
        });
        process.stdout.write(JSON.stringify(out));
      `;
      const run = (id: string): Promise<string> =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ["--input-type=module", "-e", script, STORE_URL, root, id],
            { env: childEnv({ sessions: root, home: root }) },
          );
          let out = "";
          let err = "";
          child.stdout.on("data", (chunk) => (out += String(chunk)));
          child.stderr.on("data", (chunk) => (err += String(chunk)));
          child.on("error", reject);
          child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`child ${id}: ${err}`))));
        });

      const results = await Promise.all(["E1", "E2", "E3", "E4"].map(run));
      const committed = results.map((r) => JSON.parse(r) as Event | null).filter((e) => e !== null);
      assert.equal(committed.length, 1, `exactly one writer wins, got ${JSON.stringify(results)}`);
      assert.equal(committed[0]!.seq, 2, "and it is the next sequence");
      assert.deepEqual(
        new SessionStore({ root }).read("s").map((e) => e.seq),
        [1, 2],
        "one unbroken run, so nothing was written twice",
      );
      assert.equal(
        results.filter((r) => JSON.parse(r) === null).length,
        3,
        "and the three losers were told null, which is the P10 contract",
      );
    });
  });

  it("defect_A3_a_reader_during_an_append_never_sees_a_wrong_event", async () => {
    // A3 held, and it was measured properly: 34,267 reads in a separate process
    // across 2,000 appends, no torn and no partial line. The first version of
    // that measurement used a timer that was never busy, was thrown away, and
    // was not reported. This is a trimmed version with the reader being a real
    // loop.
    //
    // The guarantee asserted is the one the format can promise, which is not "a
    // read is never torn" but "a read is never wrong". A reader that catches a
    // write in flight may see a partial last line; those are the same bytes as an
    // interrupted write, they are reported as damage, and they are not mistaken
    // for an event. What must never happen is a duplicated or out of order
    // sequence in the middle of a log.
    await withRootAsync(async (root) => {
      const store = new SessionStore({ root });
      store.create("s", []);

      const appends = 400;
      const script = `
        const { SessionStore } = await import(process.argv[1]);
        const store = new SessionStore({ root: process.argv[2] });
        for (let i = 1; i <= Number(process.argv[3]); i++) {
          store.append("s", { seq: i, at: 1000 + i, kind: "note", subject: "b", data: { i } });
        }
      `;
      const writer = spawn(
        process.execPath,
        ["--input-type=module", "-e", script, STORE_URL, root, String(appends)],
        { env: childEnv({ sessions: root, home: root }) },
      );
      let writerErr = "";
      writer.stderr.on("data", (chunk) => (writerErr += String(chunk)));
      let done = false;
      const finished = new Promise<void>((resolve) =>
        writer.on("close", (code) => {
          assert.equal(code, 0, `the writer finished: ${writerErr}`);
          done = true;
          resolve();
        }),
      );

      const reader = new SessionStore({ root });
      let reads = 0;
      let torn = 0;
      while (!done) {
        // setImmediate yields, so the writer's exit can be observed. Without it
        // this loop would never let the event loop run and the test would spin on
        // a flag nothing could set.
        await new Promise((resolve) => setImmediate(resolve));
        const seen = readRaw(root, "s");
        reads += 1;
        const { seqs } = seen;
        assert.ok(
          seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1),
          `read ${reads} saw a broken run: ${seqs.slice(-6)}`,
        );
        if (seen.unreadableAt >= 0) {
          torn += 1;
          // A partial line is only legitimate at the very end, because that is
          // the only place a write in flight can be observed. Anywhere else it
          // would mean two writers interleaved, which is the corruption this
          // whole file is about.
          assert.equal(seen.unreadableAt, seqs.length, `read ${reads} saw unreadable bytes mid log`);
        }
      }
      await finished;

      assert.ok(reads > 10, `the reader must actually have run, ${reads} reads is decoration`);
      assert.deepEqual(
        reader.read("s").map((e) => e.seq),
        Array.from({ length: appends }, (_, i) => i + 1),
        "and the finished journal is one unbroken run",
      );
      console.log(`  A3 concurrent reader: ${reads} reads over ${appends} appends, ${torn} saw a torn tail`);
    });
  });
});

describe("what this file cannot show", () => {
  it("a lock whose holder died before writing is not told from one whose holder is alive", () => {
    // The honest limit, and the reason the fork is the one it is. A lock naming
    // revision r is an orphan when the journal is past r, and that derivation
    // needs nothing but the journal, so a dead process cannot make it false. A
    // holder that died before it wrote anything leaves a lock naming the revision
    // the journal is still at, and there the journal says nothing. Not a lease,
    // not a PID, not a heartbeat: each would answer the question, and each is
    // forbidden here. So the case is diagnosed, never recovered, and A1 above
    // asserts the diagnosis instead of pretending the recovery exists.
    const source = readFileSync(STORE_PATH, "utf8");
    assert.doesNotMatch(
      source,
      /process\.pid|\bsetTimeout\b|\bsetInterval\b|\bsetUnref\b/,
      "the limit above holds only while the store has no way to ask whether a process is alive",
    );
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    assert.deepEqual(
      specifiers.filter((s) => !s.startsWith("node:")),
      ["../core/store.ts"],
      "and no dependency grew to answer it: the store reaches node builtins and one type, and nothing else",
    );
  });
});
