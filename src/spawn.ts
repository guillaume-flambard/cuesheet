/**
 * Naming an effect before anything about it exists.
 *
 * The trap this file exists to close:
 *
 * ```text
 * EffectRequested E42   durable
 * spawn()
 * PID = 93812          <- obtained after the world changed
 * crash before writing 93812
 * ```
 *
 * A PID is not a reconciliation key. It arrives too late to survive the crash
 * that makes reconciliation necessary, and worse, it is not durable identity at
 * all: the operating system reuses process ids, so a PID found tomorrow may be
 * a different program entirely. Treating one as an identity produces confident
 * answers about the wrong process.
 *
 * So the identity is minted first, from nothing but the effect's own id, and
 * both are written before the world is touched. The PID becomes an observation
 * *about* the effect, recorded next to it, never the effect's name.
 *
 * The contract for what "success" means here is deliberately narrow:
 *
 * > SpawnAgent CONFIRMED_SUCCESS means this worker, identified by E42, was
 * > really launched.
 *
 * It says nothing about the worker completing its task, nothing about the task
 * being verified, and nothing about the goal being met. Those are three further
 * facts, each needing its own event. Collapsing them now would make every later
 * question unanswerable.
 */

/** An effect's identity, decided before the effect runs. */
export interface EffectIdentity {
  /** The log's own id for the effect, e.g. `E42`. */
  effectId: string;
  /**
   * How the world will be asked about this effect later.
   *
   * Derived from the effect id alone, which is what makes it pre-addressable:
   * computing it needs no world, no process and no clock, so there is nothing
   * that can fail between minting it and writing it down.
   */
  reconciliationKey: string;
  /**
   * A value unique to this attempt, minted before the effect runs.
   *
   * The pair `effectId + nonce` is the logical identity, because a worker that
   * is re-spawned under the same effect id is a different attempt. Nothing here
   * compares a nonce to an operating system identity, because there is no
   * reliable one to compare to.
   */
  nonce: string;
}

/**
 * The key namespace for one effect kind.
 *
 * Prefixed by kind so a key is self-describing on disk: a reader holding
 * `spawn:E42` knows what sort of lookup to attempt without consulting the log.
 */
export type KeyNamespace = "spawn";

/**
 * Mint the identity of an effect, before it exists.
 *
 * Pure and total. `effectId` is the only input, so the key is available at the
 * exact moment the affordance permits the action, before `spawn()` runs.
 */
export function mintIdentity(effectId: string, namespace: KeyNamespace = "spawn"): EffectIdentity {
  return {
    effectId,
    reconciliationKey: `${namespace}:${effectId}`,
    nonce: `n${effectId}`,
  };
}

/**
 * The environment that carries the identity into the worker.
 *
 * KEY-02: the world receives exactly this identity, by name, so the worker can
 * report about itself without guessing which effect it belongs to. A worker
 * that has to infer its own effect id from an argument, a file path or the
 * order of its arguments is a worker that can attribute its receipt to the
 * wrong effect.
 */
export function workerEnvironment(
  sessionId: string,
  identity: EffectIdentity,
): Record<string, string> {
  return {
    CUESHEET_SESSION: sessionId,
    CUESHEET_EFFECT: identity.effectId,
    CUESHEET_EFFECT_KEY: identity.reconciliationKey,
    CUESHEET_EFFECT_NONCE: identity.nonce,
  };
}

/** What a launcher records once it has really started something. */
export interface StartedReceipt {
  effectId: string;
  nonce: string;
  /** Observed after the launch, so never the identity. */
  pid: number;
  startedAt: number;
  /** What was launched, in the world's terms. */
  subject: string;
}

/** What a worker records when it stops. Absent while it is still running. */
export interface ExitedReceipt {
  effectId: string;
  nonce: string;
  exitCode: number;
  exitedAt: number;
}

/**
 * Is this exit a clean stop of this effect?
 *
 * Deliberately not consulted by reconciliation. A receipt named `exited.json`
 * with a non-zero code means the worker failed at *something*, which says
 * nothing about whether it was launched. Treating it as a spawn failure would
 * invert the contract: the launch did happen, and the launch is what this
 * effect asks about.
 *
 * It exists so the next contract, about the task rather than the spawn, has
 * something to read. That contract is not written yet and is not guessed.
 */
export function exitIsClean(receipt: ExitedReceipt): boolean {
  return receipt.exitCode === 0;
}