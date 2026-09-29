/**
 * The chat: one input surface, intentions in, the tooling serves them.
 *
 * This is the default face of `cuesheet` with no arguments. A line typed here
 * is not a command; `routeIntention` decides whether it is a question the
 * live state answers or a goal, and a goal goes through the admission gate
 * before anything is spent. The subcommands remain available in the dispatcher
 * for scripts; the chat is for the person at the keyboard.
 *
 * Three commitments, all inherited from the core rather than implemented here:
 *
 * 1. The gate is visible. Every goal prints its admission verdict before the
 *    first inference, with what is missing and what exists instead. An owner
 *    can override a block by starting the line with `!`, which is explicit
 *    human authority rather than a silent bypass.
 *
 * 2. The session survives the process. Events are persisted the moment they
 *    are appended, through the loop's onEvent, so killing this chat, closing
 *    the laptop or a crash leaves the log intact up to the last real event.
 *
 * 3. Nothing here decides. The chat prints what the state says; the routing
 *    is deterministic; the only intelligence in the surface is the model the
 *    goal runs on.
 */

import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { routeIntention } from "./core/intent.ts";
import { extractSkillRequirements } from "./core/extract.ts";
import { resolveCapabilities, type Capability } from "./core/capability.ts";
import { runAgentLoop, type ModelAdapter, type ToolRunner } from "./core/loop.ts";
import { EventStore } from "./core/store.ts";
import { OpenRouterAdapter } from "./adapters/openrouter.ts";
import { SessionStore } from "./adapters/session-store.ts";
import { ShellToolRunner } from "./adapters/shell.ts";
import { SkillsAdapter } from "./adapters/skills.ts";

const SESSION_ROOT = join(homedir(), ".cuesheet", "sessions");
const SKILL_ROOTS = [join(homedir(), ".agents", "skills")];

function liveRegistry(): Capability[] {
  return new SkillsAdapter({ roots: SKILL_ROOTS }).listCapabilities();
}

function newId(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

/** One line of live progress, compact enough to read while it scrolls. */
function eventLine(event: { seq: number; kind: string; data: Record<string, unknown> }): string {
  const d = event.data as { text?: unknown; tool?: unknown; exit?: unknown };
  if (event.kind === "observation" && typeof d.text === "string") {
    return `  ${event.seq}  ${String(d.text).slice(0, 96)}`;
  }
  if (event.kind === "action" && typeof d.tool === "string") {
    return `  ${event.seq}  > ${d.tool}`;
  }
  if (event.kind === "observation" && "exit" in d) {
    return `  ${event.seq}  <= ${d.tool} exit ${String(d.exit)}`;
  }
  return `  ${event.seq}  ${event.kind}`;
}

/**
 * Print an admission verdict. The labels match the shadow sensor's, so the
 * chat and the measurement speak the same language about the same gate.
 */
function printAdmission(
  verdict: "allowed" | "would_block" | "unverified",
  requirements: Array<{ name: string }>,
  missing: string[],
  registrySize: number,
): void {
  if (requirements.length === 0) {
    console.log("admission: no declared requirements, ready");
    return;
  }
  if (verdict === "unverified") {
    console.log(`admission: UNVERIFIED (registry unreadable, ${registrySize} capabilities seen)`);
    return;
  }
  if (verdict === "would_block") {
    console.log(`admission: BLOCKED, missing ${missing.join(", ")}`);
    console.log(`  (override with !goal if you meant it; the registry holds ${registrySize} capabilities)`);
    return;
  }
  console.log(`admission: allowed (${requirements.map((r) => r.name).join(", ")})`);
}

async function runGoal(
  goal: string,
  forced: boolean,
  durable: SessionStore,
  cwd: string,
): Promise<void> {
  const sessionId = newId("run");
  const requirements = extractSkillRequirements(goal).requirements;
  const registry = liveRegistry();

  let verdict: "allowed" | "would_block" | "unverified" = "allowed";
  let missing: string[] = [];

  if (requirements.length > 0) {
    const resolution = resolveCapabilities(requirements, registry, { now: Date.now() });
    verdict = resolution.registryUnverified
      ? "unverified"
      : resolution.verdict === "ready"
        ? "allowed"
        : "would_block";
    missing = resolution.resolution.unresolved.map((u) => u.requirement.name);
  }

  printAdmission(verdict, requirements, missing, registry.length);

  if (verdict === "unverified") {
    console.log("not running: absence here is not evidence, and the gate refuses to guess.");
    return;
  }
  if (verdict === "would_block" && !forced) {
    return;
  }
  if (forced && verdict === "would_block") {
    console.log("owner override: running anyway, and the override is on the record.");
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("not running: OPENROUTER_API_KEY is not set, and there is no local runtime on this machine.");
    return;
  }

  const model: ModelAdapter = new OpenRouterAdapter({
    apiKey,
    model: "anthropic/claude-sonnet-4-6",
  });
  const tools: ToolRunner = new ShellToolRunner({
    allow: ["node", "git", "rg", "ls", "cat", "npm", "npx", "cargo"],
    roots: [cwd],
    defaultCwd: cwd,
  });

  console.log(`session: ${sessionId}  (kill this any time; every event is already on disk)`);

  const store = new EventStore(sessionId, () => Date.now());
  const outcome = await runAgentLoop(store, model, tools, {
    subject: "builder",
    goal,
    requires: forced ? [] : requirements,
    registry: forced ? undefined : registry,
    maxSteps: 8,
    onEvent: (event) => {
      console.log(eventLine(event));
      // Persist the moment it happens, so the session outlives the process.
      durable.append(sessionId, event);
    },
  });

  console.log(`stop: ${outcome.stop.reason}`);
  if (outcome.stop.reason === "blocked") {
    console.log(`  missing: ${outcome.stop.missing.join(", ")}`);
  }
  console.log(`  evidence: ${outcome.session.evidence.length}, claims: ${outcome.claims.length}`);
  console.log(`  resume with: cuesheet resume ${sessionId} --in ${cwd}`);
}

/** The full chat surface. Returns the process exit code. */
export async function chat(cwd: string = process.cwd()): Promise<number> {
  const durable = new SessionStore({ root: SESSION_ROOT });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("cuesheet> ");
  let done = false;
  rl.on("SIGINT", () => {
    done = true;
    rl.close();
  });

  console.log(`cuesheet chat, in ${cwd}`);
  console.log("every line is an intention: a question the state answers, or a goal the gate admits.");
  console.log("help lists the questions. ! before a line overrides a refusal. exit leaves.");
  console.log("");

  // Iterated rather than question-per-line, and the reason cost a debugging
  // round: sequential question() calls hang after the first when input is a
  // pipe, because each call waits for a line event that already fired before
  // it was registered. The async iterator consumes every line in order, from
  // a TTY and from a script, which also makes a piped session testable.
  rl.prompt();
  for await (const line of rl) {
    const intent = routeIntention(line);

    switch (intent.kind) {
      case "empty":
        break;
      case "exit":
        done = true;
        break;
      case "help":
        console.log(
          [
            "  sessions                  every session on disk, newest first",
            "  inspect <id>              one session's log, event by event",
            "  resume <id>               what a session shows, for continuing it",
            "  capabilities              the live skill registry, as a delegation sees it",
            "  projects / held           who may write where, read from git",
            "  gate: <brief>             check a brief's requirements without running it",
            "  anything else             a goal: admitted, then run, then persisted",
            "  !goal                     the same, overriding an admission refusal",
            "  exit                      leave; running sessions keep their logs",
          ].join("\n"),
        );
        break;
      case "ownership": {
        const registry = liveRegistry();
        console.log(`live registry: ${registry.length} capabilities.`);
        console.log(
          "ownership is read per project from git state: `cuesheet projects --root <dir>`, or open the chat inside a project and run a goal.",
        );
        break;
      }
      case "capabilities": {
        const caps = liveRegistry();
        console.log(`${caps.length} capabilities in the live registry:`);
        for (const c of caps.slice(0, 30)) {
          console.log(`  ${c.name.padEnd(32)} ${c.version}`);
        }
        if (caps.length > 30) {
          console.log(`  ... and ${caps.length - 30} more`);
        }
        break;
      }
      case "sessions": {
        const all = durable.list();
        if (all.length === 0) {
          console.log("no sessions yet");
          break;
        }
        for (const s of all) {
          console.log(`  ${s.id}  events=${String(s.events).padStart(3)}  ${s.goal.slice(0, 56)}`);
        }
        break;
      }
      case "inspect": {
        const events = durable.read(intent.id as string);
        if (events.length === 0) {
          console.log(`no events for ${intent.id}`);
          break;
        }
        for (const event of events) {
          console.log(eventLine(event));
        }
        break;
      }
      case "resume": {
        const events = durable.read(intent.id as string);
        if (events.length === 0) {
          console.log(`no events for ${intent.id}`);
          break;
        }
        const store = new EventStore(intent.id as string, () => Date.now());
        for (const event of events) {
          store.append(event);
        }
        const session = store.toSession();
        console.log(`${intent.id}: ${events.length} events replayed`);
        console.log(`  goal            : ${session.goal?.text ?? "(none)"}`);
        console.log(`  goal open       : ${session.goal?.open ?? "n/a"}`);
        console.log(`  evidence        : ${session.evidence.length}`);
        console.log(`  open directives : ${session.openDirectives.length}`);
        break;
      }
      case "admission": {
        const requirements = extractSkillRequirements(intent.text).requirements;
        const registry = liveRegistry();
        const resolution = resolveCapabilities(requirements, registry, { now: Date.now() });
        const missing = resolution.resolution.unresolved.map((u) => u.requirement.name);
        printAdmission(
          resolution.registryUnverified
            ? "unverified"
            : resolution.verdict === "ready"
              ? "allowed"
              : "would_block",
          requirements,
          missing,
          registry.length,
        );
        break;
      }
      case "goal":
        await runGoal(intent.text, intent.forced, durable, cwd);
        break;
    }

    if (done) break;
    rl.prompt();
  }

  rl.close();
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  chat()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(`cuesheet: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
