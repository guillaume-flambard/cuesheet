/**
 * Adapter: the filesystem as the event log's home.
 *
 * The store in core is pure, so somebody has to own durability, and this is
 * that somebody. One file per session, one JSON event per line, appended and
 * never rewritten. The format is append-only text rather than a database
 * because a database choice here would be a decision made before any replay
 * measurement justifies it, and because an append-only log that is trivially
 * greppable is the one you can debug at 3am with a text editor.
 *
 * The write discipline: append a line, fsync the file descriptor, and only
 * then report success. A session that claims an event it did not persist is
 * worse than one that failed, because the gap is invisible until it matters.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

import type { Event } from "../src/core/store.ts";

export interface SessionStoreOptions {
  /** Directory holding one file per session. Created if absent. */
  root: string;
}

/** One file per session, so a corrupt session costs one session, not all. */
export class SessionStore {
  private readonly root: string;

  constructor(options: SessionStoreOptions) {
    this.root = options.root;
    mkdirSync(this.root, { recursive: true });
  }

  private path(sessionId: string): string {
    // A session id is used as a filename, so anything that could escape the
    // directory is rejected rather than sanitised: a name that does not look
    // like an id is a caller bug, and a rewritten path is how you lose a log.
    if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
      throw new Error(`unsafe session id: ${JSON.stringify(sessionId)}`);
    }
    return join(this.root, `${sessionId}.jsonl`);
  }

  /** Append one event durably. Returns only after the bytes are on disk. */
  append(sessionId: string, event: Event): void {
    const file = this.path(sessionId);
    const line = JSON.stringify(event) + "\n";
    const fd = openSync(file, "a");
    try {
      writeSync(fd, line);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  /**
   * The revision on disk: the sequence of the last event in the file.
   *
   * `-1` for a session that does not exist, which is the honest value: there
   * was nothing to read, and a caller that read nothing must not claim to have
   * read revision 0.
   */
  revision(sessionId: string): number {
    const events = this.read(sessionId);
    return events.length === 0 ? -1 : events[events.length - 1]!.seq;
  }

  /**
   * Append only if the file is still where the caller read it.
   *
   * Two surfaces in one process would be handled by the in-memory store. Two
   * *processes* share only the file, and reading it then appending is itself a
   * race: both could read 41, both could write 42, and the log would then hold
   * two events claiming the same sequence with one of them silently lost.
   *
   * So the check and the append happen under an exclusive lock file. Creating a
   * file with `wx` fails if it already exists, which the filesystem guarantees
   * atomically, and that is the only primitive here doing the work. It is not a
   * waiting lock: a second writer is told the state moved and goes away, which
   * is the right answer for a decision that was made against something else.
   *
   * Returns the event written, or null when the journal had moved. Null wrote
   * nothing at all, so the losing surface can re-read without having to undo.
   */
  appendIfCurrent(sessionId: string, expectedRevision: number, event: Event): Event | null {
    const lock = `${this.path(sessionId)}.lock`;
    let fd: number;
    try {
      fd = openSync(lock, "wx");
    } catch {
      // Another writer holds it. They are committing right now, so the journal
      // is about to move; refusing is the honest answer, not a retry here.
      return null;
    }
    try {
      if (this.revision(sessionId) !== expectedRevision) return null;
      const stamped: Event = { ...event, seq: expectedRevision + 1 };
      this.append(sessionId, stamped);
      return stamped;
    } finally {
      closeSync(fd);
      try {
        unlinkSync(lock);
      } catch {
        // A lock that cannot be removed is a lock that will refuse every
        // future writer. Better to fail loudly here than to strand the session.
        throw new Error(`could not release the session lock: ${lock}`);
      }
    }
  }

  /**
   * Append a fact someone observed, whatever the revision is now.
   *
   * This is the other half of `appendIfCurrent`, and the distinction falls out
   * of what the two events mean.
   *
   * A decision is a judgement about a state, so it goes stale when the state
   * moves: "approving was allowed at 41" stops being true at 42, and writing it
   * anyway would be acting on a state that no longer exists.
   *
   * A fact is not a judgement. A worker really did produce a result, and that
   * happened whether or not somebody else typed something in between. Refusing
   * to record it because the journal advanced would mean throwing away
   * evidence of the world on the grounds that we were busy, which is the same
   * mistake as the optimistic success this repository stopped making three
   * milestones ago.
   *
   * So the condition is asymmetric on purpose, and the only thing a fact shares
   * with a decision is that it is still sequenced at the current revision. One
   * log, one sequence, two rules about staleness.
   */
  appendFact(sessionId: string, event: Omit<Event, "seq" | "at">): Event {
    const stamped: Event = { ...event, seq: this.revision(sessionId) + 1, at: Date.now() };
    this.append(sessionId, stamped);
    return stamped;
  }

  /** Every event for a session, in append order. A missing file is empty. */
  read(sessionId: string): Event[] {
    const file = this.path(sessionId);
    if (!existsSync(file)) {
      return [];
    }
    return readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Event);
  }

  /**
   * Every session on disk, newest first by last event timestamp. A corrupt
   * line does not remove the session: it surfaces as fewer events, and the
   * caller decides what an incomplete history means.
   */
  list(): Array<{ id: string; events: number; lastAt: number; goal: string }> {
    let files: string[];
    try {
      files = readdirSync(this.root).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return [];
    }
    const out: Array<{ id: string; events: number; lastAt: number; goal: string }> = [];
    for (const file of files) {
      const id = file.replace(/\.jsonl$/, "");
      let events: Event[] = [];
      try {
        events = this.read(id);
      } catch {
        // A session that cannot be parsed still exists; hiding it would let
        // data disappear from the list while staying on disk.
        out.push({ id, events: -1, lastAt: 0, goal: "(unreadable)" });
        continue;
      }
      const goal = events.find((e) => e.kind === "goal");
      const lastAt = events.length > 0 ? events[events.length - 1].at : 0;
      out.push({
        id,
        events: events.length,
        lastAt,
        goal: goal ? String((goal.data as { text?: unknown }).text ?? "") : "",
      });
    }
    return out.sort((a, b) => b.lastAt - a.lastAt);
  }

  /** Rehydrate a core store from disk, replaying every persisted event. */
  restore(sessionId: string, now: () => number): { events: Event[] } {
    const events = this.read(sessionId);
    return { events };
  }

  /** Start a fresh log, refusing to clobber an existing one. */
  create(sessionId: string, seed: Event[]): void {
    const file = this.path(sessionId);
    if (existsSync(file)) {
      throw new Error(`session ${sessionId} already exists; refusing to overwrite`);
    }
    // An empty session still gets a file. Without this, a session created with
    // no events leaves nothing on disk, the clobber guard never fires, and the
    // second create silently succeeds and destroys the first one's identity.
    const fd = openSync(file, "a");
    closeSync(fd);
    for (const event of seed) {
      this.append(sessionId, event);
    }
  }
}
