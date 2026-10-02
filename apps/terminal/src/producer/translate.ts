/**
 * Core vocabulary, translated into the surface's vocabulary. Once.
 *
 * This is the only module in the terminal app that knows what an `Event` is. It
 * imports the type and nothing else from the core, it observes nothing, and it
 * returns `Entry[]`, which is all a component is ever allowed to hold.
 *
 * The rule from `app/state.ts` is enforced here rather than merely stated:
 *
 * > The translation happens once, in `derive`, and a component cannot reach the
 * > other side.
 *
 * In V1 that was a promise with no producer behind it, so the three Entry
 * variants `action`, `status` and `failure` were declared, rendered, and never
 * constructed. `translateEvent` is that producer. A component that imports this
 * file imports a function; it does not gain the ability to read a seq number or
 * a tool result.
 *
 * ## What changed when one reply rendered three times
 *
 * `Event.seq` used to be read by nobody on this side, on purpose, so that a
 * component could not reach it. That was the right boundary and it held. But the
 * sequence was also the durable name of the event, and dropping it at the
 * projection boundary is what left one reply with no way to be recognised twice.
 *
 * So the sequence is read here, in the one module that already holds the `Event`,
 * and only its resulting string crosses. A component still cannot read a seq: it
 * can only compare two opaque names for sameness, which is all the surface ever
 * needed. See `entryId` below.
 *
 * ## Why it takes the pending map as an argument
 *
 * `runAgentLoop` appends an `action` event before it runs the tool, and an
 * `observation` event after. The observation carries the tool name, the exit
 * code and the output, but not the input. So the detail shown on screen ("read
 * router.ts") comes from the action event, and the certainty comes from the
 * observation, and only a caller holding both can say "that read succeeded".
 *
 * Holding that pairing here, as an explicit parameter, is what keeps this pure.
 * A module-level map would make it impure in a way no test could see.
 */

import type { Event } from "../../../../src/core/store.ts";
import type { LoopStop, ToolRequest } from "../../../../src/core/loop.ts";
import type { Entry, EntryBody, EntryId, Certainty } from "../app/state.ts";

/**
 * The five words this surface uses for work.
 *
 * Closed on purpose, and not because five were observed: because these are the
 * five stages a person actually cares about, and a sixth would be a log line
 * wearing a noun. Anything that does not fit keeps its own tool name, dimmed,
 * rather than being forced into a category it does not belong to.
 */
export type Verb = "read" | "inspect" | "edit" | "test" | "verify" | "other";

/** The five that mean something to a person, in the order they happen. */
export const VERBS: readonly Verb[] = ["read", "inspect", "edit", "test", "verify"];

/**
 * Which of the five a tool call is.
 *
 * Read off the request, not off the output, because the output arrives after the
 * person has already read the line and a label that changed retroactively would
 * be a lie about what was attempted. An unrecognised call is `other`: honest and
 * quiet, where inventing a category would not be.
 */
export function verbFor(request: ToolRequest): Verb {
  const name = request.name.toLowerCase();
  if (name === "finish") return "verify";
  const argv = Array.isArray(request.input.argv) ? request.input.argv.map(String) : [];
  const head = (argv[1] ?? "").toLowerCase();
  const joined = `${name} ${argv.join(" ").toLowerCase()}`;

  // Tests first: `npm test` is also a read of package.json to a naive matcher,
  // and reading the test output afterwards would invert the order.
  if (/\b(test|jest|vitest|pytest|cargo test|--test|check\b.*--typecheck)/.test(joined)) return "test";
  // `git status`, `git log`, `git diff`, `rg`, `ls` are reading the world.
  if (name === "rg" || name === "ls" || name === "cat") return "read";
  if (name === "git" && ["status", "log", "diff", "show", "branch", "remote"].includes(head)) return "inspect";
  // A type check is a claim being checked, which is the one thing this surface is
  // built to keep separate from a model's assertion about it. `build` is
  // deliberately absent: `wasm-pack build` and `cargo build` compile, and
  // calling a compile a verification would be claiming more than it established.
  if (/\b(tsc|typecheck|type-check|--noEmit)\b/.test(joined)) return "verify";
  // Writing: anything that hands a command a redirect, a patch or a package
  // name that changes something.
  if (/[>]|(^|\s)(-i|--in-place|install|add|commit|checkout|mv|cp|rm|write|apply)/.test(joined)) return "edit";
  if (name === "npm" || name === "npx" || name === "cargo" || name === "git") return "edit";
  return "other";
}

/**
 * The one detail a person needs from a tool call: the thing it touched.
 *
 * Short enough to scan without reading, which a command line is not. Returns
 * the empty string rather than a guess when nothing names a target, because a
 * fabricated filename is worse than none.
 */
export function detailFor(request: ToolRequest): string {
  const input = request.input;
  if (typeof input.path === "string" && input.path.length > 0) return input.path;
  const argv = Array.isArray(input.argv) ? input.argv.map(String) : [];
  // argv[0] is the binary, already implied by the verb. Flags are dropped.
  const positional = argv.slice(1).filter((a) => !a.startsWith("-"));
  // `git status --short` names no target: "status" is the subcommand, and the
  // verb column already says inspect. A real run printed `inspect status` and
  // that read like a file called status, so the subcommand of a known
  // subcommand-shaped tool is dropped rather than shown.
  if (isSubcommandTool(request.name)) return "";
  // Otherwise the *last* remaining argument is the target: `rg -n needle src/`
  // names its target last, and taking the first non-flag would show the needle
  // and call it a file.
  return positional[positional.length - 1] ?? "";
}

/**
 * Tools whose arguments are subcommands, not paths.
 *
 * `git status --short` and `npm run typecheck` name no file, so whatever the
 * first non-flag argument is, it is a word the verb column has already said
 * something about. A real run printed `inspect status`, which read like a file
 * called `status`, so the argument is dropped rather than shown.
 */
const SUBCOMMAND_TOOLS = new Set(["git", "npm", "npx", "cargo", "pnpm", "yarn"]);

const isSubcommandTool = (name: string): boolean => SUBCOMMAND_TOOLS.has(name.toLowerCase());

/**
 * A short, honest description of why a tool call was refused.
 *
 * The shell runner answers a refusal in prose, and a surface that prints the
 * raw line would be printing the runner's own vocabulary. These are the three
 * refusals it can actually return, each in the surface's words.
 */
function refusalOf(exit: number, output: string): string | null {
  if (exit === 126 && output.includes("refusing to run in")) return "outside the working directory";
  if (exit === 126 && output.includes("refusing to read")) return "outside the working directory";
  if (exit === 126 && output.includes("refusing executable")) return "the executable does not match the requested command";
  if (exit === 126 && output.includes("proposal was discarded")) return "instructions changed; the earlier proposal was discarded";
  if (exit === 127) return "not one of the commands Cuesheet may run";
  if (exit === 2 && output.includes("no argv supplied")) return "the call had no command in it";
  return null;
}

/** One-line summary of a tool output, for a failure a person has to act on. */
function firstLine(output: string): string {
  const line = output.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > 72 ? `${line.slice(0, 71)}…` : line;
}

/**
 * What the producer is holding between the action event and its observation.
 *
 * Public so the producer can keep one, and so a test can build one without
 * having run a tool.
 */
export interface Pending {
  readonly verb: Verb;
  readonly detail: string;
  readonly label: string;
}

/** Build the pending record for a call the loop is about to make. */
export function pendingFor(request: ToolRequest): Pending {
  const verb = verbFor(request);
  const detail = detailFor(request);
  return { verb, detail, label: verb === "other" ? request.name : verb };
}

/**
 * Translate one event into an entry, and say where it goes.
 *
 * `at` is the index the entry belongs at. `undefined` means append. A tool
 * observation settles the row its action already opened, and carries the same
 * index rather than becoming a second row: a call that showed twice, once
 * forever reading "running", would leave finished work looking unfinished for
 * the rest of the day.
 *
 * Returns `null` for anything the main view does not show, and that is the point:
 * the loop emits capability, goal, action and observation events, and the surface
 * shows the work without showing the bookkeeping.
 *
 * @param event    what the loop appended.
 * @param session  the durable session the event belongs to.
 * @param pending  the action this event settles, when it settles one.
 * @param at       the index that action opened at.
 */
export function translateEvent(event: Event, session: string, pending?: Pending, at?: number): TranslatedEntry | null {
  switch (event.kind) {
    case "action": {
      // A call the loop is about to make. Shown as `active`, which is the one
      // certainty that means "happening right now" and nothing stronger.
      if (!pending) return null;
      return {
        entry: { kind: "action", label: pending.label, detail: pending.detail, certainty: "active" },
        id: entryId(session, event),
      };
    }

    case "observation": {
      // A tool result. `data.tool` is what distinguishes it from the model's
      // own text, which arrives in the same event kind.
      const tool = event.data.tool;
      if (typeof tool !== "string") {
        const text = event.data.text;
        return typeof text === "string" && text.trim()
          ? { entry: { kind: "cuesheet", text }, id: entryId(session, event) }
          : null;
      }
      const exit = typeof event.data.exit === "number" ? event.data.exit : null;
      const output = typeof event.data.output === "string" ? event.data.output : "";
      const refusal = exit === null ? null : refusalOf(exit, output);
      if (refusal !== null) {
        return { entry: { kind: "failure", text: `${pending?.label ?? tool}: ${refusal}` }, id: entryId(session, event), at };
      }
      const certainty: Certainty = exit === 0 ? "confirmed" : "failed";
      return {
        entry: {
          kind: "action",
          label: pending?.label ?? tool,
          detail: pending?.detail ?? "",
          certainty,
        },
        id: entryId(session, event),
        at,
      };
    }

    case "evidence": {
      // The only thing in the loop that can close a goal. Shown as a status
      // entry, because "it is done" and "something was observed" are different
      // claims and the surface keeps them different.
      const claim = typeof event.data.claim === "string" ? event.data.claim : "something was observed";
      const backing = typeof event.data.backing === "string" && event.data.backing.length > 0
        ? event.data.backing
        : "";
      return {
        entry: { kind: "status", label: "observed", value: claim, certainty: backing ? "confirmed" : "unknown" },
        id: entryId(session, event),
      };
    }

    // Everything else is bookkeeping: the goal echo, the capability gate,
    // directives, notes, model selection. A person
    // working all day does not read any of it, and a surface that shows it is a
    // dashboard. `/inspect` is where the log lives.
    default:
      return null;
  }
}

/**
 * The name a translated line carries.
 *
 * `Event.seq` is the answer, and it was sitting here the whole time. It is
 * assigned once by `appendEvent`, it never changes, and no two events in a
 * session share it, which is exactly what is needed to recognise the second
 * delivery of one event as the line already on screen.
 *
 * The session is part of the name because a sequence is only unique inside one:
 * `e:<session>:<seq>` says both which session and which event, so a resumed
 * session cannot mistake a sequence of its own for a sequence of another.
 *
 * Deliberately not a hash of the text. The text is the thing being decided
 * about; a name derived from it could not tell one reply from a second reply
 * that reads the same, and would hide a genuine repeat rather than a repeated
 * delivery of the same one.
 *
 * The boundary this module holds is unchanged by reading it. The sequence is
 * still a producer-side fact: it is named here, in a module no component
 * imports, and what reaches the surface is a string.
 */
function entryId(session: string, event: Event): EntryId {
  return `e:${session}:${event.seq}`;
}

/** One translated entry: what it reads, the name it carries, and the row it replaces. */
export interface TranslatedEntry {
  /** The line, with no name attached. It names itself through `id`. */
  readonly entry: EntryBody;
  /**
   * Which line this is.
   *
   * Carried beside the body rather than inside it so that a settling translation
   * can be handed to the surface without a name to be ignored: the row it settles
   * keeps the name it was opened with.
   */
  readonly id: EntryId;
  /** The index an earlier action opened, when this entry settles it. */
  readonly at?: number;
}

/**
 * What happened when the loop stopped, in the surface's four words.
 *
 * `runAgentLoop` returns one of three stops and they must not be blurred:
 * a closed goal is established, a spent budget is not, and a blocked run says
 * what was missing rather than pretending to have worked.
 *
 * `run` is the identity of the run that stopped, which is what the line is named
 * after. One run stops once, so one run names one stop line, and a stop delivered
 * a second time is recognised as the same line rather than drawn beside itself.
 */
export function entryForStop(stop: LoopStop, run: EntryId): Entry[] {
  const id = `r:${run}:stop`;
  if (stop.reason === "goal-closed") {
    const steps = stop.steps;
    return [{ id, kind: "status", label: "work", value: `settled in ${steps} step${steps === 1 ? "" : "s"}`, certainty: "confirmed" }];
  }
  if (stop.reason === "budget-exhausted") {
    return [{ id, kind: "status", label: "work", value: `still open after ${stop.steps} steps`, certainty: "unknown" }];
  }
  // Blocked. The three stops are different facts and the surface says which one
  // it was: a run that could not start is not a run that failed to finish.
  return stop.missing.length > 0
    ? [{ id, kind: "failure", text: `it could not start: ${stop.missing.join(", ")}` }]
    : [{ id, kind: "failure", text: "it could not start." }];
}

/**
 * The one line a person sees when a sentence needs a project and none defended
 * itself, and the person asked for the list anyway.
 *
 * Not "name a project", and not "not a goal". The sentence was an intention and
 * the scope is the directory they are standing in; this says so and offers the
 * portfolio rather than handing the question back.
 *
 * `id` is named by the caller because the caller is what knows which question is
 * being answered, and the same sentence about the same portfolio asked twice is
 * two questions.
 */
export function entryForPortfolio(count: number, held: number, id: EntryId): Entry[] {
  if (count === 0) {
    return [{ id, kind: "cuesheet", text: `Nothing in the portfolio is free to write to right now (${held} held).` }];
  }
  return [
    { id, kind: "cuesheet", text: `Working in the directory you are in. ${count} project${count === 1 ? " is" : "s are"} free if you want another.` },
  ];
}