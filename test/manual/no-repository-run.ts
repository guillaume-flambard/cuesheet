/**
 * A hand-run walkthrough of the claim this slice makes, with no repository.
 *
 * The case the owner cares about is a person who works for hours without opening
 * a repository at all, and a temporary worker that dies and is replaced. Both are
 * hard to see in a test's assertions, so this prints them.
 *
 * Run it:
 *
 * ```sh
 * node test/manual/no-repository-run.ts
 * ```
 *
 * It is in `test/manual/` and is not a `.test.ts`, so `npm test` does not run it
 * and nothing depends on its output. That is deliberate: this is a thing to read,
 * not a gate. The gate is `test/work-state.test.ts`, which asserts the same
 * properties without printing them.
 */

import { EventStore } from "../../src/core/store.ts";
import { projectWork } from "../../src/work-state.ts";
import { temporaryWorker } from "../../src/work-worker.ts";
import {
  CONTEXT_SOURCE_KINDS,
  describeContextSource,
  previousSessionSource,
  scratchSource,
} from "../../src/work-context.ts";

const store = new EventStore("s", () => 1000);
const log = {
  read: () => store.toSession().events,
  revision: () => store.revision,
  appendIfCurrent: (expected, event) => store.appendIfCurrent(expected, event),
};

// A person works with no repository. A scratch source is the honest description,
// and it is a source rather than an absence.
const worker = temporaryWorker(log, "w1");
const source = scratchSource("s1", "an idea about Spotlight", { at: 0, when: 1000, by: "human" });
console.log("source:", source.kind, "|", describeContextSource(source));

store.append({ kind: "goal", subject: "human", data: { id: "g1", text: "make Spotlight searchable" } });
const committed = worker.step(() => ({
  kind: "action",
  subject: "w1",
  data: { text: "index the app bundle", tool: "index" },
}));
console.log("commit with no repository in sight:", committed.outcome.kind, "at seq", committed.outcome.at);

// worker() dies here. Nothing it held survives, by design.

// A brand new worker arrives, holding no reference to the first.
const next = temporaryWorker(log, "w2");
const state = next.read();
console.log("new worker goal:", state.goals[0]!.text);
console.log("new worker decision:", state.decisions[0]!.text, "recorded at seq", state.decisions[0]!.at);
console.log("substitution source:", describeContextSource(previousSessionSource("s2", "s", { at: 0, when: 1000, by: "w2" })));
console.log("what it needed to read:", projectWork(log.read()).revision, "revision,", log.read().length, "events, no transcript");
console.log("kinds a context source can be:", CONTEXT_SOURCE_KINDS.join(", "));
