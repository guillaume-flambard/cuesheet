/**
 * Durable receipts for effects that were really launched.
 *
 * Not a database and not a daemon: one directory per effect, holding at most a
 * `started.json` and an `exited.json`. The reason for so little structure is
 * that this directory is the only thing that can tell a later process what
 * happened to an effect the person who asked has already forgotten.
 *
 * ```text
 * <root>/<session>/effects/<effectId>/
 *     started.json
 *     exited.json
 * ```
 *
 * Every failure mode here is a *different* answer, and keeping them apart is
 * the entire purpose:
 *
 * ```text
 * no directory at all     -> NOT_FOUND      (the world has no record; not proof of failure)
 * started.json unreadable -> INCONCLUSIVE   (a record exists and cannot be read)
 * started.json present    -> CONFIRMED_SUCCESS  (the launch happened, which is the whole contract)
 * started + pid alive     -> STILL_ACTIVE   (it happened and is still going)
 * ```
 *
 * Two rules keep this honest:
 *
 * - `started.json` is written with a temporary file and a rename, so a reader
 *   never sees a half-written record. It is either there or it is not.
 * - No path here ever returns CONFIRMED_FAILURE. A launcher that refused to
 *   start has to say so explicitly, by writing a `refused.json`, because
 *   "I found no record of it" is not the same claim as "it refused".
 */

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

import type { RealityObservation } from "../src/reconcile.ts";
import type { ExitedReceipt, StartedReceipt } from "../src/spawn.ts";

export interface ReceiptStoreOptions {
  /** Directory holding one subdirectory per session. */
  root: string;
  /**
   * Is a process with this pid running right now?
   *
   * Injected rather than reached for, because the one thing this adapter must
   * never do is call the operating system on its own and turn the answer into
   * identity. A live pid is not proof of which program it is; process ids are
   * reused. It is only ever used for STILL_ACTIVE, which is a non-terminal
   * answer, so being wrong about it withholds a decision rather than inventing
   * one.
   */
  isAlive?: (pid: number) => boolean;
}

/** A worker holding a receipt that cannot be read is not a known worker. */
export class ReceiptStore {
  private readonly root: string;
  private readonly isAlive: (pid: number) => boolean;

  constructor(options: ReceiptStoreOptions) {
    this.root = options.root;
    this.isAlive = options.isAlive ?? (() => false);
    mkdirSync(this.root, { recursive: true });
  }

  private effectDir(sessionId: string, effectId: string): string {
    // Both become path components, so both are checked rather than sanitised.
    // A rewritten path is how a receipt ends up describing a different effect.
    for (const part of [sessionId, effectId]) {
      if (!/^[A-Za-z0-9._-]+$/.test(part)) {
        throw new Error(`unsafe receipt path segment: ${JSON.stringify(part)}`);
      }
    }
    return join(this.root, sessionId, "effects", effectId);
  }

  /**
   * Write one receipt atomically.
   *
   * Write to a temporary name, fsync, then rename. A reader therefore sees the
   * complete record or nothing at all, and "nothing at all" is the one state
   * whose meaning is unambiguous. A truncated `started.json` would be
   * indistinguishable from a launch that never finished being recorded.
   */
  private writeAtomic(dir: string, name: string, value: unknown): void {
    mkdirSync(dir, { recursive: true });
    const target = join(dir, name);
    const tmp = `${target}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, JSON.stringify(value, null, 2) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, target);
  }

  /**
   * Record that the effect was really launched.
   *
   * Called after the launch, never before: a `started.json` that exists is a
   * claim that the world changed, and writing it first would make the receipt
   * worthless for the one case it exists to settle.
   */
  writeStarted(sessionId: string, receipt: StartedReceipt): void {
    this.writeAtomic(this.effectDir(sessionId, receipt.effectId), "started.json", receipt);
  }

  /** Record that the worker stopped. Optional, and about the task not the spawn. */
  writeExited(sessionId: string, receipt: ExitedReceipt): void {
    this.writeAtomic(this.effectDir(sessionId, receipt.effectId), "exited.json", receipt);
  }

  /**
   * Record an explicit refusal to launch.
   *
   * The only path to CONFIRMED_FAILURE, and deliberately separate from "no
   * record". A launcher that decided not to start says so here; a launcher that
   * never got the chance leaves nothing, and those are different worlds.
   */
  writeRefused(sessionId: string, effectId: string, why: string): void {
    this.writeAtomic(this.effectDir(sessionId, effectId), "refused.json", {
      effectId,
      why,
    });
  }

  /** The effect directories a session knows about. Used by tests and diagnostics. */
  effectsIn(sessionId: string): string[] {
    const dir = join(this.root, sessionId, "effects");
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  }

  /**
   * What can be learned about an effect, right now.
   *
   * KEY-04: a proof that the launch happened and the current state of the
   * worker are two different facts. This function can return both, and the
   * caller decides what the effect's outcome is, because "launched" and "still
   * running" answer different questions.
   */
  observe(
    sessionId: string,
    reconciliationKey: string | undefined,
    isAlive: (pid: number) => boolean = this.isAlive,
  ): RealityObservation {
    if (!reconciliationKey) {
      return { kind: "no_key" };
    }
    const [namespace, effectId] = splitKey(reconciliationKey);
    if (namespace !== "spawn" || !effectId || !isEffectId(effectId)) {
      // A key this adapter cannot interpret is not evidence of absence. It is
      // evidence that this adapter is the wrong one, or that somebody handed it
      // an identifier that is not an effect id.
      //
      // The shape check matters more than it looks: `spawn:93812` parses as a
      // spawn key whose effect id is a bare number, and without this it would
      // be looked up as a real effect that simply had no receipt, which is
      // `absent`. That is how a process id gets to masquerade as an identity.
      return { kind: "not_applicable", why: `no receipt adapter for ${reconciliationKey}` };
    }

    const dir = this.effectDir(sessionId, effectId);
    if (!existsSync(dir)) {
      // Not a failure. The world has no record, which is a statement about its
      // records and not about whether the spawn happened.
      return { kind: "absent" };
    }

    const refused = this.readJson(join(dir, "refused.json"));
    if (refused !== undefined && refused !== null) {
      const record = refused as { effectId?: string; why?: string };
      if (record.effectId !== effectId) {
        return {
          kind: "unreadable",
          why: `a refusal for ${String(record.effectId)} sits in the directory of ${effectId}`,
        };
      }
      return { kind: "completed_with_failure", why: record.why ?? "the launcher refused" };
    }

    const raw = this.readJson(join(dir, "started.json"));
    if (raw === null) {
      // The file is there and cannot be parsed. A record that exists and cannot
      // be read settles nothing, which is why this is not `absent`.
      return { kind: "unreadable", why: `started.json in ${dir} is not readable JSON` };
    }
    if (raw === undefined) {
      return { kind: "absent" };
    }

    const started = raw as Partial<StartedReceipt>;
    if (started.effectId !== effectId || typeof started.pid !== "number") {
      return {
        kind: "unreadable",
        why: `started.json does not describe ${effectId}`,
      };
    }

    if (isAlive(started.pid)) {
      // KEY-04 made visible: the launch is proven and the worker is running.
      // Both are returned, and the caller treats the running worker as the more
      // recent fact about whether the effect is finished.
      return { kind: "running", since: started.startedAt ?? 0 };
    }

    // The launch is proven and the worker is no longer running. That is the
    // whole contract for SpawnAgent: it was launched. Whether it finished its
    // work is a separate question, answered by `exited.json` and by nothing
    // else, and not conflated here.
    return { kind: "completed_successfully" };
  }

  /**
   * Read a receipt without deciding what it means.
   *
   * Three outcomes on purpose: the parsed value, `null` when the file exists
   * and cannot be parsed, and `undefined` when there is no file at all. Merging
   * the last two is what turns "unreadable" into "absent" and then into a
   * failure nobody observed.
   */
  private readJson(file: string): unknown {
    if (!existsSync(file)) return undefined;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (cause) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  /** Remove a session's receipts. For tests, and for a person cleaning up. */
  forgetSession(sessionId: string): void {
    rmSync(join(this.root, sessionId), { recursive: true, force: true });
  }
}

/**
 * An effect id is the shape this repository mints, and nothing else.
 *
 * A bare number is not one: `spawn:93812` is a pid wearing an effect key's
 * namespace, and accepting it would mean a process id could resolve to an
 * effect. Effect ids are written by `mintIdentity` and always carry the `E`
 * prefix, so requiring it here costs nothing and closes the masquerade.
 */
const isEffectId = (value: string): boolean => /^E[A-Za-z0-9._-]*$/.test(value);

/** `spawn:E42` becomes `["spawn", "E42"]`. A key without a colon is not one. */
function splitKey(key: string): [string, string] {
  const at = key.indexOf(":");
  if (at <= 0) return [key, ""];
  return [key.slice(0, at), key.slice(at + 1)];
}