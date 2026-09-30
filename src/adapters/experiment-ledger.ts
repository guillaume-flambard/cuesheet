/**
 * The experiment ledger: live runs, measured, accumulated.
 *
 * The protocol is frozen. Four verbs, because three live tasks of different
 * shapes needed no fifth and one of them spent an extra read rather than asking
 * for a new capability. Nothing here adds a verb. This file only records what
 * happened, so that "after twenty tasks" becomes a checkable claim rather than an
 * intention, and so that a fifth verb has to earn its admission.
 *
 * ## What it accumulates
 *
 * ```text
 * tool calls        the protocol cost of a task
 * files observed    what the model looked at
 * files modified    what it changed
 * unsupported       names outside the vocabulary: the admission pressure
 * verdict           the independent oracle's answer
 * attribution       which boundary a failure belongs to
 * recovery          what survived a restart
 * ```
 *
 * The one that decides protocol changes is `unsupported`. Everything else is
 * there to explain it.
 *
 * ## Two layers, and neither replaces the other
 *
 * ```text
 * CONTROLLED PRODUCERS   falsification, reproducible, free
 * REAL LLM RUNS          discovery, paid, slow, unpredictable
 * ```
 *
 * The controlled producers are instruments of control. The real model is an
 * instrument of discovery: it found batched tool calls, an over-permissive tool
 * schema, and a protocol that was missing a capability, none of which any
 * scripted fixture had produced. That is not a criticism of the fixtures. It is
 * what a real model is for.
 *
 * ## Cost and honesty
 *
 * A live run costs money and time, so the ledger appends one line per run and
 * never overwrites one. A run that failed is recorded as a failure with its
 * attribution, because a ledger that only holds successes measures nothing about
 * the system under stress.
 *
 * The ledger is written next to the repository rather than into it. It is
 * evidence about a machine, and a machine's evidence is not a source file.
 */

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";

/**
 * Where the ledger lives when the caller does not say.
 *
 * PORT-02 caught the first version of this file, which had a top-level
 * `homedir()`. The rule is right for the same reason as everything else here: a
 * module that resolves a machine-specific path on import has decided something
 * about the machine before anyone asked, which is how a test ends up appending
 * to a developer's real evidence.
 *
 * `options.root` is the override, and it is what makes this portable rather
 * than merely relocated.
 */
export interface LedgerOptions {
  /** The experiments directory. The caller's layout, not this machine's. */
  readonly root?: string;
  /** An explicit file, which wins over `root`. */
  readonly path?: string;
}

function defaultLedger(options: LedgerOptions): string {
  if (options.path) return options.path;
  if (options.root) return join(options.root, "ledger.jsonl");
  return join(homedir(), ".cuesheet", "experiments", "ledger.jsonl");
}

/** One measured live run. Every field is observed, none is inferred. */
export interface RunRecord {
  /** EXP-01, EXP-05, and so on. Not a milestone: an attempt to break something. */
  readonly exp: string;
  /** A short stable name for the task shape, so repeats aggregate. */
  readonly shape: string;
  /** What the experiment was trying to establish. */
  readonly question: string;
  readonly at: number;
  /** What the producer returned. */
  readonly producer: "produced" | "failed";
  /** Which boundary a failure belongs to, when there was one. */
  readonly attribution?: "provider" | "producer" | "cuesheet" | "world";
  /** Why, when there was a failure. */
  readonly why?: string;
  /** What the model said about its own work. Never trusted, recorded verbatim. */
  readonly claim?: string;
  /** The runtime's digest of the captured artifact. */
  readonly artifactDigest?: string;
  /** The independent oracle's verdict, and which oracle produced it. */
  readonly verdict?: string;
  readonly oracle?: "runAgainstArtifact" | "verify" | "none";
  /** Tool calls, by verb. */
  readonly requested?: Record<string, number>;
  readonly honoured?: Record<string, number>;
  /** Names outside the vocabulary. The admission pressure. */
  readonly unsupported?: string[];
  readonly turns?: number;
  /** Files the artifact covers, and files the producer changed. */
  readonly covered?: string[];
  readonly modified?: string[];
  /** What a restart recovered, when the experiment was about one. */
  readonly recovered?: string;
}

/** Where the ledger lives. Overridable, so a test can use a temporary one. */
export function ledgerPath(options: LedgerOptions = {}): string {
  return process.env.CUESHEET_EXPERIMENTS ?? defaultLedger(options);
}

/**
 * Append one run. Never rewrites.
 *
 * Appending is the whole point: a ledger that overwrites cannot show a trend,
 * and the only claim worth making about a protocol is a trend.
 */
export function recordRun(run: RunRecord, path = ledgerPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(run) + "\n", "utf8");
}

/** Every recorded run, oldest first. A malformed line is skipped, not fatal. */
export function readLedger(path = ledgerPath()): RunRecord[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as RunRecord];
      } catch {
        return [];
      }
    });
}

/** The aggregate the protocol decision is actually made from. */
export interface LedgerSummary {
  readonly runs: number;
  readonly produced: number;
  readonly failed: number;
  /** Every verb name any run asked for, with totals across runs. */
  readonly requested: Record<string, number>;
  readonly honoured: Record<string, number>;
  /** Distinct names outside the vocabulary, with how many runs asked. */
  readonly unsupported: Record<string, number>;
  readonly verdicts: Record<string, number>;
  readonly attributions: Record<string, number>;
  /** Median reads per produced run, which is the exploration cost. */
  readonly medianReads: number;
}

/**
 * Summarise the ledger.
 *
 * The summary answers one question: is there a reproducible pressure for a
 * capability this repository does not have? A single run asking for `search`
 * is one occurrence of a number. A majority of unrelated tasks asking for it is
 * a signal, and this is where the two become distinguishable.
 */
export function summarise(runs: readonly RunRecord[] = readLedger()): LedgerSummary {
  const requested: Record<string, number> = {};
  const honoured: Record<string, number> = {};
  const unsupported: Record<string, number> = {};
  const verdicts: Record<string, number> = {};
  const attributions: Record<string, number> = {};
  const readCounts: number[] = [];
  let produced = 0;
  let failed = 0;

  const bump = (into: Record<string, number>, key: string | undefined) => {
    if (key === undefined) return;
    into[key] = (into[key] ?? 0) + 1;
  };

  for (const run of runs) {
    if (run.producer === "produced") produced += 1;
    else failed += 1;
    for (const [verb, n] of Object.entries(run.requested ?? {})) {
      requested[verb] = (requested[verb] ?? 0) + n;
    }
    for (const [verb, n] of Object.entries(run.honoured ?? {})) {
      honoured[verb] = (honoured[verb] ?? 0) + n;
    }
    for (const verb of run.unsupported ?? []) bump(unsupported, verb);
    bump(verdicts, run.verdict);
    bump(attributions, run.attribution);
    if (run.producer === "produced") {
      const reads = run.requested?.["read_file"] ?? 0;
      readCounts.push(reads);
    }
  }

  readCounts.sort((a, b) => a - b);
  const mid = Math.floor(readCounts.length / 2);
  const medianReads = readCounts.length === 0
    ? 0
    : readCounts.length % 2 === 1
      ? readCounts[mid]!
      : Math.round((readCounts[mid - 1]! + readCounts[mid]!) / 2);

  return { runs: runs.length, produced, failed, requested, honoured, unsupported, verdicts, attributions, medianReads };
}

/** One line a person can read before deciding anything. */
export function formatSummary(s: LedgerSummary): string {
  const verbs = Object.entries(s.requested).sort().map(([v, n]) => `${v}=${n}`).join(" ") || "(none)";
  const pressure = Object.entries(s.unsupported).sort().map(([v, n]) => `${v} in ${n} run(s)`).join(", ");
  const verdicts = Object.entries(s.verdicts).sort().map(([v, n]) => `${v}=${n}`).join(" ") || "(none)";
  return [
    `runs=${s.runs} produced=${s.produced} failed=${s.failed}`,
    `verbs requested   ${verbs}`,
    `unsupported        ${pressure || "none"}`,
    `verdicts           ${verdicts}`,
    `median read_file   ${s.medianReads}`,
  ].join("\n");
}

/**
 * A throwaway ledger path, for a test that must not touch the real one.
 *
 * The hermeticity rule applied to measurement: a test that appends to the real
 * ledger corrupts the evidence it is trying to collect, and a ledger corrupted
 * by its own tests is worse than no ledger.
 */
export function temporaryLedger(label: string): string {
  return join(mkdtempSync(`${tmpdir()}/cuesheet-ledger-${label}-`), "ledger.jsonl");
}
