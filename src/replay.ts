/**
 * Replay: how many historical delegations would the gate have refused?
 *
 * Read-only over the OpenCode session database. It reconstructs, for each
 * session, the requirements a brief textually declared, then asks the same
 * `resolveCapabilities` the live gate uses, against the skill registry as it
 * stands today.
 *
 * What this measures, precisely: given the requirements a brief *stated*,
 * and the registry that exists *now*, would the gate have blocked? It is a
 * counterfactual, not a record of what the runtime actually saw, because the
 * runtime snapshotted its capabilities at session start and the gate did not
 * exist. The difference between "the gate would have blocked" and "an agent
 * actually failed" is the false-positive question, and it is reported as its
 * own number rather than folded into the headline.
 *
 * No database is written. Every query opens sqlite3 in -readonly.
 */

import {isEntryPoint} from "./is-entry-point.ts";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { SkillsAdapter } from "../src/adapters/skills.ts";
import { resolveCapabilities, type Requirement } from "../src/core/capability.ts";

const DB = `${process.env.HOME}/.local/share/opencode/opencode.db`;

const q = (sql: string): string =>
  execFileSync("sqlite3", ["-readonly", DB, sql], { encoding: "utf8" }).trim();

const num = (sql: string): number => Number(q(sql) || "0");

/**
 * Skill names we treat as "explicitly named by a brief". Matched as whole
 * words so `humanizer` does not match `humanizer-notes`, and read from the
 * live registry so a new skill is picked up without a code change.
 */
function registryNames(): string[] {
  const caps = new SkillsAdapter({ roots: [`${process.env.HOME}/.agents/skills`] })
    .listCapabilities().capabilities;
  return [...new Set(caps.map((c) => c.name))].sort();
}

/** A brief names a skill if the skill name appears as a whole word. */
function requirementsFrom(text: string, names: string[]): Requirement[] {
  const found: Requirement[] = [];
  for (const name of names) {
    const re = new RegExp(`(^|[^a-z0-9-])${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([^a-z0-9-]|$)`, "i");
    if (re.test(text)) {
      found.push({ kind: "skill", name });
    }
  }
  return found;
}

const LIMIT = Number(process.env.LIMIT ?? "400");
const SINCE = Number(process.env.SINCE ?? "0"); // epoch ms, 0 = all time

export function main():void {
const names = registryNames();
if (names.length === 0) {
  console.error("no skills found in the live registry; nothing to replay against");
  process.exit(1);
}

const total = num(
  `SELECT COUNT(*) FROM part WHERE json_extract(data,'$.type')='text' AND time_created >= ${SINCE};`,
);

let scanned = 0;
let withRequirements = 0;
let blocked = 0;
let ready = 0;
const blockedBy: Record<string, number> = {};
const sessionsBlocked = new Set<string>();
const examples: Array<{ session: string; name: string; text: string }> = [];

// Bound the work. The unindexed LIKE makes a full-table scan of 353k parts
// slow, so the replay walks the most recent N text parts and says so.
// Rows come back as JSON, one per line. A tab separator was tried first and
// is wrong: any brief containing a literal newline or tab is one row, and
// splitting on the separator turns one row into many.
const rows = execFileSync(
  "sqlite3",
  [
    "-readonly",
    "-json",
    DB,
    `SELECT session_id AS session, json_extract(data,'$.text') AS text
       FROM part
      WHERE json_extract(data,'$.type')='text' AND time_created >= ${SINCE}
      ORDER BY time_created DESC
      LIMIT ${LIMIT};`,
  ],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);

for (const { session, text } of JSON.parse(rows || "[]") as Array<{
  session: string;
  text: string;
}>) {
  if (!text) continue;
  scanned++;

  const reqs = requirementsFrom(text, names);
  if (reqs.length === 0) continue;
  withRequirements++;

  const caps = new SkillsAdapter({ roots: [`${process.env.HOME}/.agents/skills`] })
    .listCapabilities().capabilities;
  const resolution = resolveCapabilities(reqs, caps, { now: Date.now() });

  if (resolution.verdict === "blocked") {
    blocked++;
    sessionsBlocked.add(session);
    for (const u of resolution.resolution.unresolved) {
      blockedBy[u.requirement.name] = (blockedBy[u.requirement.name] ?? 0) + 1;
    }
    if (examples.length < 5) {
      const missing = resolution.resolution.unresolved
        .map((u) => u.requirement.name)
        .join(", ");
      examples.push({ session, name: missing, text: text.slice(0, 160) });
    }
  } else {
    ready++;
  }
}

const report = {
  scope: {
    registrySkills: names.length,
    textPartsInWindow: total,
    textPartsScanned: scanned,
    limit: LIMIT,
    sinceEpochMs: SINCE,
    database: DB,
  },
  delegationsWithDeclaredRequirements: withRequirements,
  verdict: {
    wouldBlock: blocked,
    wouldAllow: ready,
    distinctSessionsWouldBlock: sessionsBlocked.size,
  },
  blockedByRequirement: Object.fromEntries(
    Object.entries(blockedBy).sort((a, b) => b[1] - a[1]),
  ),
  examples,
  caveat:
    "Counterfactual. The gate is evaluated against the registry as it stands " +
    "now, not the registry the runtime actually had at session start. A " +
    "would-block is not proof an agent failed.",
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");

}
if(isEntryPoint(import.meta.url))main();
