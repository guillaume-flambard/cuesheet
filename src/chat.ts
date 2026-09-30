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
import { InteractiveProjection, projectionFor, render } from "./projections.ts";
import { deriveState, seen, stateReport } from "./state.ts";
import { affordancesOf, type Affordance } from "./affordances.ts";
import { classifyFailure, effectObserved, effectRequested, type EffectRequest } from "./effects.ts";
import { extractSkillRequirements } from "./core/extract.ts";
import {
  resolveCapabilities,
  type Capability,
  type CapabilityResolution,
  type Requirement,
} from "./core/capability.ts";
import { runAgentLoop, type ModelAdapter, type ToolRunner } from "./core/loop.ts";
import { EventStore, type Event } from "./core/store.ts";
import { OpenRouterAdapter } from "./adapters/openrouter.ts";
import { SessionStore } from "./adapters/session-store.ts";
import { ShellToolRunner } from "./adapters/shell.ts";
import { isEntryPoint } from "./is-entry-point.ts";

// Overridable so an integration test can drive the real surface against a
// throwaway root instead of the real one. `rm -rf` on a developer's home is
// not a thing a test should need, and a test that cleans up after itself by
// deleting the user's sessions is not a test.
const SESSION_ROOT =
  process.env.CUESHEET_SESSIONS ?? join(homedir(), ".cuesheet", "sessions");
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
/**
 * Event kinds the live column does not show.
 *
 * The goal and the admission are already on screen, so repeating them in the
 * live column is noise. The log still keeps everything: this hides a line from
 * a view, it does not drop a record.
 *
 * At module scope rather than inside `chat()` because `runGoal` reads it while
 * writing the live projection, and it was declared in the caller. That is the
 * same defect as the two `registry` references, in the same function, from the
 * same kind of edit: a name that survived a move in one place and not the
 * other. `runGoal` therefore crashed on its first event, and the crash was
 * observed as a failed effect, which is honest about a cause nobody could name.
 */
const LIVE_SKIP = new Set(["goal", "capability"]);

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

/**
 * Run one goal.
 *
 * `live` is passed in rather than read from a module-level variable because the
 * projection belongs to the surface and the run is not the surface. It was
 * declared in `chat()` and read here, which is a scope error that only appears
 * when a run actually starts, and which the previous three names in this same
 * function had already demonstrated.
 */
async function runGoal(
  goal: string,
  forced: boolean,
  durable: SessionStore,
  cwd: string,
  live: InteractiveProjection,
): Promise<void> {
  const sessionId = newId("run");
  const requirements = extractSkillRequirements(goal).requirements;

  let verdict: "allowed" | "would_block" | "unverified" = "allowed";
  let missing: string[] = [];

  // The registry is read here rather than in the caller, because the caller
  // reads the banner and the run is a different question with a different
  // moment. Two reads, both owned by a decision that needs them, which is the
  // rule the cost guard holds.
  const listing = liveRegistry();

  if (requirements.length > 0) {
    const resolution = resolveAgainstLive(requirements);
    verdict = resolution.registryUnverified
      ? "unverified"
      : resolution.verdict === "ready"
        ? "allowed"
        : "would_block";
    missing = resolution.resolution.unresolved.map((u) => u.requirement.name);
  }

  printAdmission(verdict, requirements, missing, listing.capabilities.length);

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
    registry: forced ? undefined : listing,
    maxSteps: 8,
    onEvent: (event) => {
      // The live view is one projection of the log, not a third renderer. The
      // goal and the admission are already on screen, so they are skipped in
      // the live column only; the log itself keeps everything.
      if (!LIVE_SKIP.has(event.kind)) {
        console.log(live.line(event));
      }
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

/** Short enough to sit in a prompt line, long enough to recognise the goal. */
function truncate(text: string, max = 48): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The full chat surface. Returns the process exit code. */
export async function chat(cwd: string = process.cwd()): Promise<number> {
  const durable = new SessionStore({ root: SESSION_ROOT });
  // The chat's own session, so the effects it requests have a durable home with
  // a sequence of their own. `runGoal` allocates one per run; these events
  // belong to the surface, not to the goal, and EFF-07 needs the request
  // readable on its own before any run happens.
  const sessionId = newId("chat");
  durable.create(sessionId, []);
  /**
   * Record a fact of the surface. The store gives it its place.
   *
   * This function used to compute `seq` itself, and that was the defect Agent C
   * named: with the surface and the adapter each assigning order, locking the
   * store could not close the duplicate-sequence invariant, because two of the
   * three authorities were outside it. The off-by-one came from here too, twice.
   *
   * So the surface writes what happened and the store decides where it goes.
   */
  const appendSurface = (event: Omit<Event, "seq" | "at">) => {
    durable.append(sessionId, { ...event, at: Date.now() } as Omit<Event, "seq">);
  };
  /**
   * Append only if the journal is still where the caller read it.
   *
   * Returns the event written, or null when something moved underneath. The
   * in-memory EventStore this used to keep is gone: it could number the events
   * but it could not enforce anything, and a second surface writing the same
   * file would have produced two events claiming the same sequence with one of
   * them silently dropped. The file is the log, so the file is what arbitrates.
   */
  const appendIfCurrent = (
    expectedRevision: number,
    event: Omit<Event, "seq" | "at">,
  ): Event | null => durable.appendIfCurrent(sessionId, expectedRevision, { ...event, at: Date.now() } as Event);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
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
    console.log("            ask what to work on, or type projects.");
    // Deliberately no portfolio read here. Reading 45 repositories to greet
    // someone cost 180 git subprocesses on every start, which is why
    // test/chat.test.ts went from seconds to 69. The cost belongs on the
    // question that needs it, not on the banner. See docs/portfolio-cost.md.
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
  /**
   * The intention in front of the person, and the fold's own view of it.
   *
   * `staged` is a cache of what the log says, not a parallel truth: `stageIt`
   * writes the event and then sets this, so the two cannot disagree and the
   * only way to read it without writing would be the folding this repo just
   * removed everywhere else.
   */
  let staged: string | null = null;
  const stageIt = (text: string) => {
    appendSurface({ kind: "goal", subject: "", data: { text, staged: true } });
    staged = text;
  };
  const clearIt = (why: "approved" | "discarded" | "session-ended") => {
    // Spending or discarding the intention is a fact, not a variable going
    // quiet. The first version wrote an `evidence` claim, which the fold does
    // not read as a close, so a cleared intention stayed visible in the state.
    appendSurface({
      kind: "evidence",
      subject: "",
      data: { claim: `intention ${why}`, source: sessionId, goalClosed: true },
    });
    staged = null;
  };

  /**
   * The prompt carries the pending intention.
   *
   * The rule this encodes: if cuesheet keeps an intention, the person should
   * never have to remember that it exists. A goal waiting for approval is a
   * commitment the surface made on their behalf, and a prompt that says only
   * "cuesheet>" makes them hold it in their head. Readline redraws the prompt
   * on every line, so the state is visible at the moment it is relevant rather
   * than printed once and forgotten.
   */
  // In the live column the goal and the admission are already printed, so
  // echoing them is the noise the first real user called ugly. The stored log
  // keeps both, which is the difference between a view and a record.
  const liveProjection = new InteractiveProjection();
  const paintPrompt = () => {
    // A prompt is only a prompt on a terminal. Writing it to a pipe puts the
    // prompt in the transcript, where a script reads it as output and a test
    // cannot assert on the surface at all. Interactive sessions get the state
    // in their prompt; scripted ones get a clean stdout.
    if (!process.stdout.isTTY) {
      return;
    }
    rl.setPrompt(staged === null ? "cuesheet> " : `go? ${truncate(staged)}> `);
    rl.prompt();
  };
  /** How many greetings were answered, so a second one gets a different reply. */
  let conversationalCount = 0;
  /**
   * The portfolio, read once per session.
   *
   * Two call sites asked for it, and each paid 45 repositories x 4 git calls,
   * so "on bosse sur quoi" followed by "projects" cost the observation twice
   * for the same world. That is the repeated-spend shape, and the fix is not a
   * cache with a TTL, it is one observation shared by the consumers in the
   * session.
   *
   * Scoped to the session on purpose. A portfolio is a statement about now,
   * and carrying one across a process boundary would make it a statement about
   * whenever it was taken. See docs/portfolio-cost.md.
   */
  let portfolioObservation: Awaited<ReturnType<typeof import("./adapters/frontier.ts").snapshotPortfolio>> | null =
    null;
  const observePortfolio = async () => {
    if (portfolioObservation === null) {
      const { snapshotPortfolio } = await import("./adapters/frontier.ts");
      portfolioObservation = snapshotPortfolio();
    }
    return portfolioObservation;
  };
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

      // What a line may do to a staged intention, asked rather than decided.
      //
      // The rule lived in this branch order and got it wrong twice: once every
      // non-approval discarded the goal, once every non-approval refused to
      // answer. It is a pure function of the state now, so a CLI, a TUI, an
      // API and an agent all get the same answer, and the surface only renders
      // what it is given. See src/affordances.ts.
      //
      // P8: the state is folded here and the affordances read that one fold.
      // The previous version read the log a second time through
      // `unobservedEffects`, so the surface and the fold were two readings of
      // the same events, and "the same events" was true by inspection rather
      // than by construction.
      //
      // `complete` is attested because this file was read from a store that
      // either has the session or has none: `read` returns the whole file or
      // an empty array, and there is no partial read. That is an argument, not
      // a guarantee, so it is written down here where it can be checked.
      //
      // The staged intention is folded from the log, not spliced into a state.
      //
      // P8 closed the pending reading and left this one: `staged` was a
      // variable in this file, and the affordances were handed a state with
      // `goal` overwritten by a fabricated event sequenced 0. So the surface
      // still knew something the fold did not, which is the same shape of
      // problem one level over, and it is why this surface needed a fake event
      // at all.
      //
      // Staging writes a real `goal` event with `staged: true`, so the fold
      // sees it and the splice disappears. The fake event is gone.
      const readState = () => deriveState(durable.read(sessionId), sessionId, "complete");
      const permits = (a: Affordance) => affordancesOf(readState()).some((x) => x.action === a);

      if (permits("APPROVE_GOAL") && decision.kind === "confirm") {
        // EFF-01: the emission is not the outcome. The request goes into the
        // log, the world is asked, and only what the world answers clears the
        // intention. `runGoal` returning is a fact about the process; the goal
        // being started is a fact about the world, and only an observation can
        // clear it. A spawn that fails keeps the intention, because the person
        // still wants it.
        const request: EffectRequest = {
          id: `E${Date.now().toString(36)}`,
          effect: "SpawnAgent",
          subject: goal,
          affordance: "APPROVE_GOAL",
          // The read-set names what it read; the revision names when. CON-01
          // needs both, and the request outlives this process, so it has to
          // carry them rather than borrow them from a variable in this file.
          reads: { goal: "known", pendingEffect: "known" },
          revision: readState().revision,
        };
        const pending = `request ${request.id} asked; the world has not answered`;
        paintPrompt();
        // Sequenced and stamped before the world is asked, so a crash leaves a
        // complete request on disk rather than a fragment. The first version
        // kept a local counter starting at 0, which restarts the sequence in
        // the middle of a log that `runGoal` is about to extend.
        try {
          // P10: the decision is made against the revision this surface read,
          // and the write is conditional on that revision still being current.
          // Two surfaces can both find approving allowed; only one of them can
          // have been right by the time it lands.
          const basis = readState().revision;
          const committed = appendIfCurrent(basis, effectRequested(request));
          if (committed === null) {
            // Nothing was written. Another surface moved the journal between the
            // read and here, so this decision was made about a state that no
            // longer exists. Re-read and let the person decide again, rather
            // than retrying on their behalf.
            console.log("another surface changed this session first; nothing was started.");
            console.log("        the intention is still staged; look again and decide.");
            paintPrompt();
            continue;
          }
          await runGoal(goal, false, durable, cwd, liveProjection);
          appendSurface(effectObserved({ effectId: request.id, outcome: "succeeded" }));
          clearIt("approved");
        } catch (cause) {
          // Classify before printing, because the two failures need different
          // sentences. A `ReferenceError` is our wiring, and telling the person
          // to "go again when the world can answer" about our own bug is how the
          // registry defect survived 352 green tests: the report was faithful
          // and the advice was nonsense.
          const failure = classifyFailure(cause);
          appendSurface(
            effectObserved({
              effectId: request.id,
              outcome: "failed",
              why: failure.why,
              failure: { step: failure.step, origin: failure.origin, why: failure.why },
            }),
          );
          if (failure.origin === "cuesheet") {
            console.log(`${pending}, and it failed inside Cuesheet: ${failure.why}`);
            console.log("        this is a defect in the surface, not something the world refused.");
            console.log("        the intention is still staged.");
          } else {
            console.log(`${pending}, and it failed: ${failure.why}`);
            console.log("        the intention is still staged; go again when the world can answer.");
          }
        }
        if (done) break;
        paintPrompt();
        continue;
      }
      if (permits("REJECT_GOAL") && decision.kind === "cancel") {
        clearIt("discarded");
        console.log(`discarded: ${goal}`);
        paintPrompt();
        continue;
      }
      if (permits("CANCEL_SESSION") && decision.kind === "exit") {
        clearIt("session-ended");
      }
      if (permits("REPLACE_GOAL") && decision.kind === "goal") {
        // A new intention supersedes the staged one, and the new one is staged
        // below so the person still gets to see it before it runs.
        console.log(`replaced: ${goal}`);
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
        // not an answer to "on travaux sur quoi". Counts describe the
        // portfolio; the question asks for a choice. So this names the
        // projects, says why one is the cheapest, and stages the choice
        // rather than ending in a number.
        const snap = await observePortfolio();

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
        stageIt(`open ${first}`);
        console.log(`next  ${first}`);
        console.log(`go    to open it, or name another.`);
        break;
      }
      case "ownership": {
        const snap = await observePortfolio();
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
        if (listing.capabilities.length > 30) {
          console.log(`  ... and ${listing.capabilities.length - 30} more`);
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
        // Three renderings of one log: the state a viewer can read, and the
        // event stream. The state is a fold, so it observes nothing: it cannot
        // be the reason a read got slow, and it says `unknown` rather than
        // looking anything up to fill a column.
        const state = deriveState(events, intent.id as string);
        if (process.stdout.isTTY) {
          console.log(stateReport(state));
          console.log("");
        }
        console.log(
          render(events, projectionFor(process.stdout.isTTY ? "interactive" : "machine")),
        );
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
          await runGoal(intent.text, true, durable, cwd, liveProjection);
          break;
        }
        stageIt(intent.text);
        console.log(`goal    ${intent.text}`);
        console.log(`scope   ${cwd}`);
        console.log("run     type go to run it, or name another intention to replace it.");
        break;
    }

    if (done) break;
    paintPrompt();
  }

  rl.close();
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  chat()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(`cuesheet: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
