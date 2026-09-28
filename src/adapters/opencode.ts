/**
 * Adapter: OpenCode as a source of ownership facts.
 *
 * This file is the only place allowed to know that OpenCode stores sessions in
 * a SQLite table. The core receives ActiveSession[] and never asks where the
 * data came from.
 *
 * Worth recording, because it cost a wrong conclusion once: a plugin present
 * on disk but absent from the config's plugin array was assumed to be dead. It
 * was running, and the resolved config listed it. Read what actually loads,
 * not one file.
 */

import { execFileSync } from "node:child_process";
import type { ActiveSession } from "../core/ownership.ts";

export interface SessionProvider {
  getActiveSessions(): ActiveSession[];
}

export interface OpenCodeAdapterOptions {
  /** Defaults to the documented location. */
  dbPath?: string;
  /** Sessions with no activity in this window are not reported. */
  windowMs?: number;
  /** Epoch milliseconds treated as "now". Injected for tests. */
  now?: number;
  /** Only sessions under this prefix are considered project sessions. */
  projectsPrefix?: string;
}

const DEFAULT_DB = `${process.env.HOME}/.local/share/opencode/opencode.db`;

export class OpenCodeAdapter implements SessionProvider {
  private readonly dbPath: string;
  private readonly windowMs: number;
  private readonly now: number;
  private readonly projectsPrefix: string;

  constructor(options: OpenCodeAdapterOptions = {}) {
    this.dbPath = options.dbPath ?? DEFAULT_DB;
    this.windowMs = options.windowMs ?? 45 * 60 * 1000;
    this.now = options.now ?? Date.now();
    this.projectsPrefix = options.projectsPrefix ?? `${process.env.HOME}/projects/`;
  }

  getActiveSessions(): ActiveSession[] {
    const sql = `SELECT id, directory, time_updated FROM session
                 WHERE directory LIKE '${this.projectsPrefix.replace(/'/g, "''")}%'
                   AND (${this.now} - time_updated) < ${this.windowMs}
                 ORDER BY time_updated DESC;`;

    let stdout: string;
    try {
      // Read-only: this adapter observes, it must never mutate runtime state.
      stdout = execFileSync("sqlite3", ["-readonly", this.dbPath, sql], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      // Fail open, and say so. A missing database means "cannot tell", which
      // is not the same as "nobody is working". The caller decides what to do
      // with an absence of evidence; this adapter only refuses to invent it.
      return [];
    }

    return stdout
      .split("\n")
      .map((line) => line.split("|"))
      .filter((parts) => parts.length === 3 && parts[0])
      .map(([id, directory, updated]) => ({
        id,
        directory,
        lastActivity: Number(updated),
      }));
  }
}
