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
import { SkillsAdapter, type SkillListing } from "./adapters/skills.ts";
import { extractSkillRequirements } from "./core/extract.ts";
import {
  resolveCapabilities,
  type Capability,
  type CapabilityResolution,
  type Requirement,
} from "./core/capability.ts";
import { runAgentLoop, type ModelAdapter, type ToolRunner } from "./core/loop.ts";
import { EventStore } from "./core/store.ts";
import { OpenRouterAdapter } from "./adapters/openrouter.ts";
import { SessionStore } from "./adapters/session-store.ts";
import { ShellToolRunner } from "./adapters/shell.ts";

const SESSION_ROOT = join(homedir(), ".cuesheet", "sessions");
const SKILL_ROOTS = [join(homedir(), ".agents", "skills")];

/**
 * The live registry, and the limits of what was observed.
 *
 * Every caller needs both halves, because the core's `registryUnverified` is
 * the difference between "no skill is called X" and "we could not tell". A
 * helper that returned only the list would let a caller resolve requirements
 * against a registry whose own coverage it never asked about, which is the
 * defect this type was introduced to close.
 */
function liveRegistry(): SkillListing {
  return new SkillsAdapter({ roots: SKILL_ROOTS }).listCapabilities();
}

/** Resolve against the live registry, carrying its coverage into the core. */
function resolveAgainstLive(requirements: Requirement[]): CapabilityResolution {
  const listing = liveRegistry();
  return resolveCapabilities(requirements, listing.capabilities, {
    now: Date.now(),
    registryUnverified: listing.anyRootUnreadable || listing.unreadable.length > 0,
  });
}

function newId(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

/** One line of live progress, compact enough to read while it scrolls. */
function eventLine(
  event: { seq: number; kind: string; data: Record<string, unknown> },
  live = false,
): string {
  // In live view the goal and the admission are already on screen; echoing
  // them again was part of the noise the first real user flagged as ugly.
  if (live && (event.kind === "goal" || event.kind === "capability")) {
    return "";
  }
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

  let verdict: "allowed" | "would_block" | "unverified" = "allowed";
  let missing: string[] = [];

  if (requirements.length > 0) {
    const resolution = resolveAgainstLive(requirements);
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
      const line = eventLine(event, true);
      if (line) console.log(line);
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

  const inHome = cwd === homedir() || cwd === homedir() + "/";
  const sessions = durable.list();
  console.log("cuesheet chat");
  console.log(`  here      ${cwd}`);
  if (inHome) {
    // Say what this surface can do from here, not only what it cannot. The
    // previous line told the person they were in the wrong place and stopped,
    // which is a complaint dressed as a welcome: the portfolio view answers
    // from here, and it is the first thing anyone asks.
    console.log(
      "            home directory. goals need a project, but the portfolio answers from here.",
    );
    try {
      const { snapshotPortfolio } = await import("./adapters/frontier.ts");
      const snap = snapshotPortfolio();
      const hint = snap.free[0];
      console.log(
        `            ${snap.free.length} free, ${snap.held.length} held.` +
          (hint ? ` try: cd ${hint} && cuesheet` : ""),
      );
    } catch {
      // The portfolio is a convenience here, not a prerequisite. A surface
      // that cannot read it must still start.
    }
  }
  const listing = liveRegistry();
  console.log(
    `  registry  ${listing.capabilities.length} capabilities` +
      (listing.unreadable.length > 0
        ? `, ${listing.unreadable.length} unreadable (absence is not evidence)`
        : ""),
  );
  console.log(`  sessions  ${sessions.length} on disk`);
  console.log("");
  console.log("say what you want. a goal is staged and runs when you type go. help lists the questions.");
  console.log("");

  // Iterated rather than question-per-line, and the reason cost a debugging
  // round: sequential question() calls hang after the first when input is a
  // pipe, because each call waits for a line event that already fired before
  // it was registered. The async iterator consumes every line in order, from
  // a TTY and from a script, which also makes a piped session testable.
  rl.prompt();
  let staged: string | null = null;
  /** How many greetings were answered, so a second one gets a different reply. */
  let conversationalCount = 0;
  for await (const line of rl) {
    // A staged goal waits for an explicit approval. This is the confirmation
    // that was missing when a bare "hello ?" consumed an entire agent budget:
    // the user sees what would run, where, and decides with one word.
    //
    // The decision is routed rather than matched here, because the router is
    // the tested place for that knowledge. It used to be a four-word list in
    // this file, so "ok go", "ok vas-y", "lance" and "fais-le" all discarded
    // the goal the person was approving, which is worse than not asking.
    if (staged !== null) {
      const goal = staged;
      const decision = routeIntention(line);
      // Only an approval or a refusal consumes the staged goal. Anything else
      // is a new intention, and the goal stays on the table, because
      // discarding work on a stray keystroke is its own kind of loss.
      if (decision.kind === "confirm") {
        staged = null;
        await runGoal(goal, false, durable, cwd);
        if (done) break;
        rl.prompt();
        continue;
      }
      if (decision.kind === "cancel") {
        staged = null;
        console.log(`discarded: ${goal}`);
        rl.prompt();
        continue;
      }
      if (decision.kind !== "empty" && decision.kind !== "exit") {
        console.log(`still staged: ${goal}`);
        console.log("        go to run it, or name a new intention and it stays there.");
        rl.prompt();
        continue;
      }
      // Leaving is always leaving. A staged goal must not hold the process
      // open, so exit and an empty line both fall through with the goal
      // dropped rather than silently carried into a session that is closing.
      if (decision.kind === "exit") {
        staged = null;
      }
    }

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
      case "conversational":
        // Not one constant for every greeting. Two greetings in a row used to
        // print the same line twice, which reads as a hang. The de-duplication
        // counts greetings rather than comparing their text, because "hey"
        // then "hello" is a repetition even though the words differ.
        conversationalCount++;
        if (conversationalCount > 1) {
          console.log("still here. type help, or name a goal.");
        } else {
          console.log(
            "hey. I answer state questions and run goals that pass admission. type help for the list.",
          );
        }
        break;
      case "next": {
        // The inventory answer was "free to write: 17", which is true and is
        // not an answer to "on travaille sur quoi". Counts describe the
        // portfolio; the question asks for a choice. So this names the
        // projects, says why one is the cheapest, and stages the choice
        // rather than ending in a number.
        const { snapshotPortfolio } = await import("./adapters/frontier.ts");
        const snap = snapshotPortfolio();

        if (snap.held.length > 0) {
          console.log(`held        ${snap.held.length}`);
          for (const p of snap.held.slice(0, 5)) {
            console.log(`  ${p}`);
          }
          if (snap.held.length > 5) {
            console.log(`  ... and ${snap.held.length - 5} more`);
          }
          console.log("");
          console.log("held means someone is in it or left work behind, so it is not a candidate now.");
          console.log("");
        }

        if (snap.free.length === 0) {
          console.log(`nothing free to write: all ${snap.held.length} projects are held.`);
          console.log("  held is not an error: wait, or use an isolated worktree.");
          break;
        }

        console.log(`free to write  ${snap.free.length}`);
        for (const p of snap.free.slice(0, 8)) {
          console.log(`  ${p}`);
        }
        if (snap.free.length > 8) {
          console.log(`  ... and ${snap.free.length - 8} more`);
        }
        console.log("");
        if (snap.presentButUndeclared.length > 0) {
          console.log(
            `not in the registry: ${snap.presentButUndeclared.join(", ")}`,
          );
          console.log("");
        }
        // A recommendation, not a menu. The first is offered as the default so
        // the next word can be "go", which is cheaper than a decision.
        const first = snap.free[0]!;
        staged = `open ${first}`;
        console.log(`next  ${first}`);
        console.log(`go    to open it, or name another.`);
        break;
      }
      case "ownership": {
        const { snapshotPortfolio } = await import("./adapters/frontier.ts");
        const snap = snapshotPortfolio();
        console.log(`free to write : ${snap.free.length}`);
        console.log(`held          : ${snap.held.length}${snap.held.length > 0 ? ` (${snap.held.slice(0, 6).join(", ")}${snap.held.length > 6 ? ", ..." : ""})` : ""}`);
        if (snap.declaredButMissing.length > 0) {
          console.log(`declared but not on disk: ${snap.declaredButMissing.join(", ")}`);
        }
        break;
      }
      case "capabilities": {
        const listing = liveRegistry();
        console.log(`${listing.capabilities.length} capabilities in the live registry:`);
        for (const c of listing.capabilities.slice(0, 30)) {
          console.log(`  ${c.name.padEnd(32)} ${c.version}`);
        }
        // Counted, not silently absent: a folder that looks like a skill and
        // whose manifest cannot be read is neither resolved nor proven missing.
        for (const u of listing.unreadable) {
          console.log(`  ${u.folder.padEnd(32)} UNREADABLE: ${u.reason}`);
        }
        if (listing.anyRootUnreadable) {
          console.log("  at least one skill root could not be read: absence is not evidence");
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
        const resolution = resolveAgainstLive(requirements);
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
        // The home directory is a warning with teeth. The header says so, and
        // this is where that promise has to hold: a goal staged in ~ is a goal
        // an agent will run against the whole home tree, which is the one
        // checkout in this setup that must never receive an unattended writer.
        // The refusal is the same shape as the admission one, and `!` is the
        // owner's explicit override in both cases.
        if (inHome && !intent.forced) {
          // A refusal that reads like a policy error is the wrong answer to a
          // line that does not look like work at all. Two different problems
          // were arriving here: "do this task", which needs a project scope,
          // and "this is broken", which needs the surface itself. Saying
          // "your line is out of scope" to someone saying "c'est quoi cette
          // merde" answers neither.
          const looksLikeWork = /\b(fix|add|write|build|create|make|update|remove|refactor|test|debug|implement|ship|commit)\b/i.test(
            intent.text,
          );
          if (looksLikeWork) {
            console.log(`refused ${intent.text}`);
            console.log(
              "scope   " +
                cwd +
                " is your home directory, not a project. scoped work needs a project directory.",
            );
            console.log(
              "        open cuesheet inside one, or prefix the line with ! to run it here anyway.",
            );
  } else {
    console.log(`not a goal: ${intent.text}`);
    console.log(
      `scope   ${cwd}, your home directory, so nothing here can run a goal. that is the whole limit.`,
    );
    // Answer a complaint about the surface with the surface's own state. The
    // alternative was "cd into a project", which is true and is not an
    // answer to "this is ugly and broken".
    console.log(
      `state   ${listing.capabilities.length} capabilities, ` +
        `${listing.unreadable.length} unreadable, ${sessions.length} sessions on disk, ${inHome ? "no project" : "project scope"}.`,
    );
    console.log(
      "        what it can do: help, capabilities, sessions, projects for the portfolio view. goals need a project.",
    );
  }
          break;
        }
        if (intent.forced) {
          await runGoal(intent.text, true, durable, cwd);
          break;
        }
        staged = intent.text;
        console.log(`goal    ${intent.text}`);
        console.log(`scope   ${cwd}`);
        console.log("run     type go to run it. anything else discards it. ! before a line runs it past a refusal.");
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
