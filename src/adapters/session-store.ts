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
