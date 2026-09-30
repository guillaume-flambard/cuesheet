/**
 * CLI: run a goal under a session that owns its own state.
 *
 * Every subcommand here is a thin shell around the core. The point of the file
 * is not convenience, it is that the loop can be driven, interrupted, resumed
 * and inspected from a terminal, which is the only way to see whether a
 * session actually survives its process.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { resolveCapabilities, type Capability } from "../src/core/capability.ts";
import { runAgentLoop, type ModelAdapter, type ToolRequest, type ToolResult } from "../src/core/loop.ts";
import { EventStore, type Event } from "../src/core/store.ts";
import { SkillsAdapter, type SkillListing } from "../src/adapters/skills.ts";
import { OpenRouterAdapter } from "../src/adapters/openrouter.ts";
import { SessionStore } from "../src/adapters/session-store.ts";
import { ShellToolRunner } from "../src/adapters/shell.ts";

const SESSION_ROOT = join(homedir(), ".cuesheet", "sessions");
const SKILL_ROOTS = [join(homedir(), ".agents", "skills")];

function fail(message: string): never {
  console.error(`cuesheet: ${message}`);
  process.exit(2);
}

function usage(): never {
  console.log(`cuesheet, a session that owns its own state

  cuesheet run <goal> --in <dir> [--session <id>] [--max-steps N]
                     [--requires <file>] [--model <id>] [--allow tool,...]

  cuesheet resume <session> --in <dir> [--max-steps N]

  cuesheet sessions
      list the sessions stored on this machine

  cuesheet inspect <session>
      replay a session log and print what the log actually shows

  cuesheet capabilities
      resolve the live skill registry, the way a delegation would

A run needs a provider. Set OPENROUTER_API_KEY; there is no local runtime on
this machine and no unauthenticated fallback, on purpose.
`);
  process.exit(2);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

/** The live registry and the limits of what was observed, never just the list. */
function liveRegistry(): SkillListing {
  return new SkillsAdapter({ roots: SKILL_ROOTS }).listCapabilities();
}

function loadRequirements(file: string): Array<{ kind: string; name: string }> {
  if (!existsSync(file)) {
    fail(`requirements file not found: ${file}`);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    requirements?: Array<{ kind: string; name: string }>;
  };
  if (!Array.isArray(parsed.requirements)) {
    fail(`${file} must be {"requirements": [{"kind": ..., "name": ...}]}`);
  }
  return parsed.requirements;
}

function newId(): string {
  return "ses_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function cmdRun(argv: string[]): Promise<number> {
  const goal = argv.find((a) => !a.startsWith("--"));
  if (!goal) fail("run needs a goal as its first argument");
  const flags = parseArgs(argv);
  const dir = flags.in ?? process.cwd();
  const maxSteps = Number(flags["max-steps"] ?? 8);
  if (!Number.isFinite(maxSteps) || maxSteps <= 0) fail("--max-steps needs a positive number");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    fail("OPENROUTER_API_KEY is not set; there is no local model runtime on this machine");
  }

  const requires = flags.requires ? loadRequirements(flags.requires) : [];
  const model = new OpenRouterAdapter({
    apiKey,
    model: flags.model ?? "anthropic/claude-sonnet-4-6",
  });

  const tools = new ShellToolRunner({
    allow: (flags.allow ?? "node,git,rg,ls,cat").split(","),
    roots: [dir],
    defaultCwd: dir,
  });

  const sessionId = flags.session ?? newId();
  const durable = new SessionStore({ root: SESSION_ROOT });
  const store = new EventStore(sessionId, () => Date.now());

  // Rehydrate an existing session so resume and run share one code path.
  for (const event of durable.read(sessionId)) {
    store.append(event);
  }

  const outcome = await runAgentLoop(store, model, tools, {
    subject: flags.subject ?? "builder",
    goal,
    requires,
    registry: liveRegistry().capabilities,
    maxSteps,
  });

  // Persist whatever the loop appended, so the session outlives this process.
  const before = durable.read(sessionId).length;
  const all = outcome.session.events;
  for (const event of all.slice(before)) {
    durable.append(sessionId, event);
  }

  printOutcome(outcome, sessionId, dir);
  return outcome.stop.reason === "blocked" ? 1 : 0;
}

function printOutcome(
  outcome: Awaited<ReturnType<typeof runAgentLoop>>,
  sessionId: string,
  dir: string,
): void {
  console.log(`session: ${sessionId}`);
  console.log(`  goal      : ${outcome.session.goal?.text ?? "(none)"}`);
  console.log(`  events    : ${outcome.session.events.length}`);
  console.log(`  evidence  : ${outcome.session.evidence.length}`);
  console.log(`  claims    : ${outcome.claims.length} (a claim is not evidence)`);

  if (outcome.session.evidence.length > 0) {
    console.log("\nevidence:");
    for (const e of outcome.session.evidence) {
      console.log(`  - ${e.claim}  [backing: ${e.backing || "none recorded"}]`);
    }
  }

  console.log(`\nstop: ${outcome.stop.reason}`);
  if (outcome.stop.reason === "blocked") {
    console.log(`  missing: ${outcome.stop.missing.join(", ")}`);
  }
  console.log(`\nresume with: cuesheet resume ${sessionId} --in ${dir}`);
}

async function cmdResume(argv: string[]): Promise<number> {
  const sessionId = argv.find((a) => !a.startsWith("--"));
  if (!sessionId) fail("resume needs a session id");
  const flags = parseArgs(argv);
  const dir = flags.in ?? process.cwd();
  const durable = new SessionStore({ root: SESSION_ROOT });
  const events = durable.read(sessionId);
  if (events.length === 0) fail(`no events for session ${sessionId}`);

  const store = new EventStore(sessionId, () => Date.now());
  for (const event of events) {
    store.append(event);
  }
  const session = store.toSession();

  console.log(`session: ${sessionId}   replayed ${events.length} events`);
  console.log(`  goal       : ${session.goal?.text ?? "(none)"}`);
  console.log(`  goal open  : ${session.goal?.open ?? "n/a"}`);
  console.log(`  evidence   : ${session.evidence.length}`);
  console.log(`  open directives : ${session.openDirectives.length}`);
  for (const [subject, binding] of session.models) {
    console.log(`  model ${subject} : ${binding.model}`);
  }
  return 0;
}

function cmdSessions(): number {
  const durable = new SessionStore({ root: SESSION_ROOT });
  const dir = SESSION_ROOT;
  if (!existsSync(dir)) {
    console.log("no sessions yet");
    return 0;
  }
  const files = execFileSync("ls", [dir], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    console.log("no sessions yet");
    return 0;
  }
  for (const file of files) {
    const id = file.replace(/\.jsonl$/, "");
    const events = durable.read(id);
    const goal = events.find((e) => e.kind === "goal");
    const evidence = events.filter((e) => e.kind === "evidence").length;
    console.log(
      `${id}  events=${String(events.length).padStart(3)}  evidence=${evidence}  ${String(goal?.data.text ?? "").slice(0, 60)}`,
    );
  }
  return 0;
}

function cmdInspect(argv: string[]): number {
  const sessionId = argv[0];
  if (!sessionId) fail("inspect needs a session id");
  const durable = new SessionStore({ root: SESSION_ROOT });
  const events: Event[] = durable.read(sessionId);
  if (events.length === 0) fail(`no events for session ${sessionId}`);

  console.log(`${sessionId}: ${events.length} events\n`);
  for (const event of events) {
    const data = JSON.stringify(event.data);
    const preview = data.length > 90 ? `${data.slice(0, 90)}...` : data;
    console.log(`  ${String(event.seq).padStart(3)}  ${event.kind.padEnd(12)} ${event.subject.padEnd(10)} ${preview}`);
  }
  return 0;
}

function cmdCapabilities(): number {
  const listing = liveRegistry();
  const caps = listing.capabilities;
  console.log(`${caps.length} capabilities in the live registry\n`);
  for (const c of caps.slice(0, 40)) {
    console.log(`  ${c.name.padEnd(34)} ${c.version}`);
  }
  if (caps.length > 40) {
    console.log(`  ... and ${caps.length - 40} more`);
  }
  // A folder that looks like a skill and cannot be read is not a capability
  // and not a proven absence, so it is named rather than omitted.
  for (const u of listing.unreadable) {
    console.log(`  ${u.folder.padEnd(34)} UNREADABLE: ${u.reason}`);
  }
  if (listing.anyRootUnreadable) {
    console.log("\n  at least one root could not be read: absence is not evidence");
  }
  return 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "run":
      return cmdRun(rest);
    case "resume":
      return cmdResume(rest);
    case "sessions":
      return cmdSessions();
    case "inspect":
      return cmdInspect(rest);
    case "capabilities":
      return cmdCapabilities();
    default:
      return usage();
  }
}

/**
 * Run only when this file is the program, not when it is imported.
 *
 * The other two entry scripts in this repository already carry this guard.
 * Without it, importing `cli-run.ts` runs the whole command dispatcher against
 * whatever `process.argv` happens to be, which is why it could not be loaded
 * by test/loadability.test.ts and why nothing noticed: every caller spawns it
 * as a process, so the missing guard was invisible from the outside.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(`cuesheet: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
