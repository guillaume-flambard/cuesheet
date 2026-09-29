/**
 * Report: what the shadow sensor has seen.
 *
 * Shadow mode exists to answer one question: does the admission gate refuse
 * work that would have failed, without refusing work that would have
 * succeeded? The sensor logs verdicts; this file counts them. The third
 * column of the question, the outcome, is not in this log: it lives in what
 * the session actually did, and joining the two is a separate, explicit step.
 *
 * The vocabulary is the one ADR-001 fixed, and it is deliberately not the
 * conformance suite's vocabulary. `unverified` is a first-class outcome here
 * and is never folded into allow or deny: a gate that could not read the
 * registry has said nothing, and counting its silence as a pass would be
 * exactly the conversion of an inability to observe into a fact that this
 * project exists to stop.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** One record written by the cuesheet shadow sensor. */
export interface ShadowRecord {
  v: 1;
  kind: "delegation_evaluated";
  sessionID: string;
  ts: number;
  agent?: string;
  /** Every requirement the extractor found, resolved or not. */
  requirements: Array<{ kind: string; name: string; directive: boolean }>;
  verdict: "allowed" | "would_block" | "unverified";
  /** Requirement names that did not resolve. Present when blocked. */
  missing: string[];
  /** Number of capabilities the live registry offered at evaluation time. */
  registrySize: number;
  /** True when the registry could not be read at all. */
  registryUnverified: boolean;
  /** The matched text, for audit of the extractor itself. */
  matches: Array<{ name: string; directive: boolean }>;
}

export interface ShadowCounts {
  records: number;
  malformed: number;
  noRequirements: number;
  allowed: number;
  wouldBlock: number;
  unverified: number;
  /** Requirements most often unresolvable, most frequent first. */
  missingFrequency: Array<{ name: string; count: number }>;
  /** Sessions seen, so a count can be read against its breadth. */
  distinctSessions: number;
}

export function countShadowRecords(records: ShadowRecord[]): ShadowCounts {
  const counts: ShadowCounts = {
    records: 0,
    malformed: 0,
    noRequirements: 0,
    allowed: 0,
    wouldBlock: 0,
    unverified: 0,
    missingFrequency: [],
    distinctSessions: 0,
  };

  const missing = new Map<string, number>();
  const sessions = new Set<string>();

  for (const record of records) {
    if (!record || typeof record !== "object" || record.kind !== "delegation_evaluated") {
      counts.malformed++;
      continue;
    }
    counts.records++;

    if (record.sessionID) sessions.add(record.sessionID);

    if (record.verdict === "unverified") {
      counts.unverified++;
      continue;
    }
    if (record.requirements.length === 0) {
      counts.noRequirements++;
      continue;
    }
    if (record.verdict === "would_block") {
      counts.wouldBlock++;
      for (const name of record.missing ?? []) {
        missing.set(name, (missing.get(name) ?? 0) + 1);
      }
    } else {
      counts.allowed++;
    }
  }

  counts.distinctSessions = sessions.size;
  counts.missingFrequency = [...missing.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return counts;
}

/**
 * Render the report. The outcome column is deliberately absent: a zero there
 * would be invented, and a shadow report that invents its own outcome column
 * is the same lie as a benchmark without a control arm.
 */
export function renderShadowReport(counts: ShadowCounts): string {
  const lines: string[] = [];
  const line = (s = "") => void lines.push(s);

  line("# Shadow report");
  line();
  line("Verdicts recorded by the cuesheet shadow sensor at delegation time.");
  line("The gate refused nothing: shadow mode observes, it does not enforce.");
  line();

  line("| Measure | Count |");
  line("|---|---|");
  line(`| records evaluated | ${counts.records} |`);
  line(`| malformed records skipped | ${counts.malformed} |`);
  line(`| distinct sessions | ${counts.distinctSessions} |`);
  line(`| no requirements declared | ${counts.noRequirements} |`);
  line(`| allowed | ${counts.allowed} |`);
  line(`| would block | ${counts.wouldBlock} |`);
  line(`| unverified | ${counts.unverified} |`);
  line();

  if (counts.missingFrequency.length > 0) {
    line("## Unresolvable requirements, most frequent first");
    line();
    for (const m of counts.missingFrequency.slice(0, 15)) {
      line(`- ${m.name}: ${m.count}`);
    }
    line();
  }

  line("## What this report does not say");
  line();
  line("No outcome column appears here. Whether a would-block was a real");
  line("prevented failure or a false positive is a join against what the session");
  line("actually did, and that join has not been performed. Until it is, these");
  line("numbers describe the gate's opinions, not the gate's value.");
  line();
  line("An unverified record is a gate that could not read the registry. It is");
  line("not a pass and not a refusal, and it is never folded into either.");

  return lines.join("\n");
}

/** Read the spool from disk. Missing file means no data, not an empty verdict. */
export function readShadowSpool(path = join(homedir(), ".local/share/opencode/cuesheet/shadow.ndjson")): {
  records: ShadowRecord[];
  fileExisted: boolean;
} {
  try {
    const text = readFileSync(path, "utf8");
    const records: ShadowRecord[] = [];
    for (const l of text.split("\n")) {
      if (!l.trim()) continue;
      try {
        records.push(JSON.parse(l) as ShadowRecord);
      } catch {
        records.push({ kind: "delegation_evaluated" } as unknown as ShadowRecord);
      }
    }
    return { records, fileExisted: true };
  } catch {
    return { records: [], fileExisted: false };
  }
}
