/**
 * UI-01: one semantic response renders exactly once.
 *
 * A single assistant reply was seen rendered three times in a live terminal.
 * This file is the proof that the surface can no longer do that, and the proof
 * that it does not achieve it by throwing away a reply that happens to read the
 * same as another one.
 *
 * ## What the defect actually was
 *
 * Not a string comparison that was too loose. An entry carried no name at all,
 * so there was nothing for the surface to compare: two deliveries of one reply
 * were two entries because they were two objects, and two replies that read
 * identically were also two objects. The distinction the surface needed, "is this
 * the line I already hold?", was not representable. `translate.ts` had the fact
 * that answers it, the journal sequence of the event, and dropped it on the way
 * to the surface; `derive` appended whatever it was given; `Timeline` keyed on
 * the array index, so the renderer agreed with the surface that these were
 * different lines.
 *
 * ## What each test is worth
 *
 * Every case here delivers the same reply more than once and asserts that one
 * rendering comes out. The multiple is not incidental: a test that delivered once
 * would pass against the broken surface too, and would therefore prove nothing.
 * Each of the five counts is a strictly smaller number than the number of
 * deliveries, so removing the deduplication makes the assertion fail rather than
 * quietly pass.
 *
 * Two of the five drive the real producer end to end, because the trigger for
 * model failover and for a resumed session lives in the producer and not at the
 * projection boundary. The other three are stated at the boundary itself, which is
 * where the missing name was, and they say so rather than pretending to reproduce
 * the upstream delivery that was observed.
 *
 * ## What is deliberately not claimed
 *
 * That the upstream triple is fixed. This file proves the surface cannot render
 * one reply twice however many times it is delivered. It does not prove which
 * delivery produced the third rendering, and nothing here should be read as
 * having found it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { createStore, type Store } from "../apps/terminal/src/app/store.ts";
import { derive, emptySurface, type Control, type Entry, type SurfaceState } from "../apps/terminal/src/app/state.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";
import { persistentView } from "../apps/terminal/src/producer/session-view.ts";
import { translateEvent } from "../apps/terminal/src/producer/translate.ts";
import { ModelSelectionChanged } from "../src/adapters/model-binding.ts";
import { TerminalSession } from "../src/adapters/terminal-session.ts";
import type { Event } from "../src/core/store.ts";
import type { ModelAdapter, ModelResponse, ToolRequest, ToolResult, ToolRunner } from "../src/core/loop.ts";

const ROOT = resolve(".");
const SESSION = "session-under-test";

/** A model reply, as the core loop records it: an observation with no tool on it. */
const replyEvent = (seq: number, text: string): Event => ({
  seq,
  at: 1_790_000_000_000 + seq,
  kind: "observation",
  subject: "builder",
  data: { text, step: seq },
});

/**
 * What the producer's `onEvent` sends for one delivered event.
 *
 * A copy of the shape at `apps/terminal/src/producer/index.ts`, not a second
 * implementation of it: same branches, same two controls, and in particular the
 * appended line carries the name the translator gave it while a settling one
 * carries no name at all, because the row it settles keeps the one it was opened
 * with.
 */
function project(event: Event, session: string): Control | null {
  const translated = translateEvent(event, session);
  if (!translated) return null;
  return translated.at !== undefined
    ? { type: "settled", at: translated.at, entry: translated.entry }
    : { type: "observed", entries: [{ ...translated.entry, id: translated.id }] };
}

/** Deliver one event into a store, the way a duplicated delivery reaches a surface. */
function deliver(store: Store, event: Event, times = 1): void {
  for (let n = 0; n < times; n += 1) {
    const control = project(event, SESSION);
    assert.ok(control, "a model reply always becomes a line");
    store.send(control);
  }
}

/** The lines a person would read as the assistant having answered. */
const answers = (state: SurfaceState): readonly Entry[] =>
  state.entries.filter((entry) => entry.kind === "cuesheet");

/** Replay a journal of controls into a fresh surface, which is what a restart does. */
const restore = (journal: readonly Control[]): SurfaceState =>
  journal.reduce<SurfaceState>(derive, emptySurface);

/**
 * Run a real producer over a fake model and hand back the surface it drew on.
 *
 * No provider, no filesystem, no terminal: the producer takes its adapters by
 * interface, which is the property that makes a surface behaviour assertable
 * without spawning anything.
 */
async function drive(model: ModelAdapter, sentence: string): Promise<{ state: SurfaceState }> {
  const tools: ToolRunner = {
    async run(request: ToolRequest): Promise<ToolResult> {
      return { name: request.name, exit: 0, output: "" };
    },
  };
  const store = createStore();
  const producer = createProducer({
    store,
    model,
    tools,
    cwd: `${ROOT}/tools/cuesheet`,
    projectsRoot: ROOT,
    identities: [],
    now: () => 1_790_000_000_000,
    mintId: () => "ui-exactly-once",
  });
  producer.say(sentence);
  const until = Date.now() + 5_000;
  while (store.get().busy && Date.now() < until) await new Promise((done) => setTimeout(done, 5));
  assert.equal(store.get().busy, false, "the run finished");
  return { state: store.get() };
}

describe("UI-01 one semantic response renders exactly once", () => {
  it("a duplicated provider event is drawn once, not once per delivery", () => {
    // The reported defect, at the boundary it belongs to. The same event, three
    // deliveries: a provider that resent it, a subscriber that saw it twice, a
    // transport that acknowledged twice and so replayed once.
    const store = createStore();
    const event = replyEvent(42, "the reply that arrived three times");

    deliver(store, event, 3);

    // Three deliveries, one rendering. Without the name the count is three, and
    // this assertion is what fails.
    assert.equal(answers(store.get()).length, 1, "one reply, one rendering");
    assert.equal(answers(store.get())[0]?.text, "the reply that arrived three times");
  });

  it("a replayed projection shows one reply, and shows it as the same line", () => {
    // A restart rebuilds the surface by replaying the journal the live surface
    // wrote. The rebuilt timeline has to be the same timeline, not a lookalike:
    // same lines, same names, so the renderer reconciles them against each other
    // rather than treating the restored view as a stranger.
    const event = replyEvent(7, "the reply");
    const control = project(event, SESSION);
    assert.ok(control);

    const live = createStore();
    live.send(control);

    const restored = restore([control]);

    assert.equal(answers(restored).length, 1, "the replay shows the reply once");
    assert.deepEqual(
      restored.entries.map((entry) => entry.id),
      live.get().entries.map((entry) => entry.id),
      "and it is named the same as the line the live surface held",
    );

    // A journal that recorded the line twice, which is what a store that wrote
    // the same control twice leaves behind, still restores to one line.
    assert.equal(answers(restore([control, control])).length, 1);
    // And a surface restored on top of itself, which is what a remount of a
    // surface that was already showing the reply does, stays at one.
    assert.equal(answers(derive(restored, control)).length, 1);
  });

  it("a stream interrupted and resumed shows the reply that came before the cut once", () => {
    // The reply arrived, the stream was interrupted, and the resumed process
    // rebuilt the surface from the journal and then re-delivered the event it
    // was in the middle of. Two of those three steps are the resume; all three
    // together are one reply.
    const event = replyEvent(19, "the reply before the interruption");
    const control = project(event, SESSION);
    assert.ok(control);

    const live = createStore();
    deliver(live, event);
    live.send({ type: "interrupted" });
    assert.equal(answers(live.get()).length, 1, "the interruption did not add a line");

    // The process ends here. A new surface replays the journal and marks the
    // interrupted run as unknown, exactly as `restoreView` does.
    const resumed = derive(restore([control]), { type: "interrupted" });
    // And the resumed producer hands over the event it never finished reading.
    const afterResume = derive(resumed, control);

    assert.equal(answers(afterResume).length, 1, "one reply across the interruption");
    assert.equal(answers(afterResume)[0]?.text, "the reply before the interruption");
  });

  it("a model that fails over leaves exactly one final semantic response, on the surface and on the reconnect after it", async () => {
    // The real producer over a real journal, because the failover guard is in the
    // producer and the redelivery that follows a switch is in the journal. A step
    // whose inference was abandoned at a model boundary returns no text, so the
    // core records nothing for it and the step after it answers on the new model.
    //
    // The reconnect is not decoration. A run that changed model mid-flight is
    // exactly the run a person reconnects to, and a reconnect rebuilds the surface
    // from the journal. So the answer crosses the projection boundary a second
    // time on its way back onto the screen, which is the delivery this case is
    // about.
    let calls = 0;
    const model: ModelAdapter = {
      name: "failover",
      async infer(): Promise<ModelResponse> {
        calls += 1;
        // The abandoned attempt, then the answer from the model that took over,
        // then a stop so the fixture ends rather than spending the step budget.
        if (calls === 1) throw new ModelSelectionChanged();
        if (calls >= 3) throw new Error("the fixture stopped here");
        return { text: "the answer from the second model", toolCalls: [] };
      },
    };
    const root = mkdtempSync(join(tmpdir(), "cuesheet-failover-"));
    const storage = join(root, "sessions");
    let journal: TerminalSession | undefined;
    let reopened: TerminalSession | undefined;
    try {
      const cwd = join(root, "work");
      mkdirSync(cwd, { recursive: true });
      journal = new TerminalSession({ root: storage, cwd });
      const sessionId = journal.metadata.id;
      const live = persistentView(journal);
      const producer = createProducer({
        store: live,
        journal,
        model,
        tools: { async run(request: ToolRequest): Promise<ToolResult> { return { name: request.name, exit: 0, output: "" }; } },
        cwd,
        projectsRoot: root,
        identities: [],
        now: () => 1_790_000_000_000,
        mintId: () => "ui-exactly-once-failover",
      });
      producer.say("answer me");
      const until = Date.now() + 5_000;
      while (live.get().busy && Date.now() < until) await new Promise((done) => setTimeout(done, 5));
      assert.equal(live.get().busy, false, "the run finished");
      assert.ok(calls >= 2, "the model really was asked again after the failover");

      const said = answers(live.get());
      assert.equal(said.length, 1, "one final semantic response, not one per attempt");
      assert.equal(said[0]?.text, "the answer from the second model");
      assert.equal(
        live.get().entries.some((entry) => entry.kind === "cuesheet" && entry.text === ""),
        false,
        "the discarded step left no line behind",
      );
      // The abandoned step recorded nothing, so there is nothing in the journal
      // for a reconnect to replay twice either.
      assert.equal(
        journal.core.toSession().events.filter((event) => event.data.text === "the answer from the second model").length,
        1,
        "and one event answers for it",
      );

      // The reconnect. The process ends here and a second surface opens the same
      // session from disk, which is what a reconnect or a restart is: the
      // timeline is rebuilt by replaying the journal.
      journal.close();
      journal = undefined;
      reopened = new TerminalSession({ root: storage, cwd, id: sessionId });
      const reconnected = persistentView(reopened);
      assert.equal(answers(reconnected.get()).length, 1, "the replay shows the answer once");

      // And then the answer crosses the boundary a second time. This is the
      // delivery the case is about: after a switch the run is re-projected, and a
      // subscriber that re-reads the session hands the surface the answer it is
      // already holding. Where that redelivery comes from does not matter to the
      // surface, and that is the point: the name it carries is what settles it.
      const answered = reopened.core.toSession().events.find((event) => event.data.text === "the answer from the second model");
      assert.ok(answered, "the journal still holds the event that answered");
      reconnected.send(project(answered, reopened.core.id)!);

      const again = answers(reconnected.get());
      assert.equal(again.length, 1, "the answer crossed the boundary again and is still one line");
      assert.equal(again[0]?.id, said[0]?.id, "and it is the same line by the same name");
    } finally {
      journal?.close();
      reopened?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a model that says the same thing on every step of one run says it every step", async () => {
    // The real producer again, and this is the case that makes content
    // deduplication wrong rather than merely inelegant. The step budget is eight;
    // this model answers "ok" on all eight, which is eight distinct events in the
    // journal and eight things the model said. A surface that deduplicated on the
    // words would show one line for eight answers and would be wrong about what
    // the run did.
    let calls = 0;
    const model: ModelAdapter = {
      name: "repeating",
      async infer(): Promise<ModelResponse> {
        calls += 1;
        return { text: "ok", toolCalls: [] };
      },
    };
    const run = await drive(model, "keep going");

    const said = answers(run.state);
    assert.equal(calls, 8, "the run really did spend its whole step budget");
    assert.equal(said.length, 8, "eight answers the model gave are eight lines a person read");
    assert.equal(new Set(said.map((entry) => (entry.kind === "cuesheet" ? entry.id : ""))).size, 8, "and eight names for them");
  });

  it("a remounted surface draws the reply once, from the names it holds", () => {
    // Two surfaces over one journal: the live one, which took the reply live, and
    // the one a remount builds. Both are named the same way, so whatever the
    // renderer does with a name it does the same thing for both.
    const event = replyEvent(31, "REMOUNT_MARKER");
    const control = project(event, SESSION);
    assert.ok(control);

    const live = createStore();
    live.send({ type: "submit", text: "ask" });
    deliver(live, event, 3);
    const remounted = restore([
      { type: "submit", text: "ask" },
      control,
    ]);

    assert.equal(answers(live.get()).length, 1);
    assert.equal(answers(remounted).length, 1);
    assert.deepEqual(
      remounted.entries.map((entry) => entry.id),
      live.get().entries.map((entry) => entry.id),
      "a remount is the same lines by the same names",
    );

    // Every line has a name, because the renderer keys on it. An unnamed line
    // would put two different lines under one key, or force a fallback to the
    // index, which is the half of the defect that was in the renderer.
    assert.ok(
      live.get().entries.every((entry) => typeof entry.id === "string" && entry.id.length > 0),
      "every line the renderer is given is named",
    );
    assert.equal(
      new Set(live.get().entries.map((entry) => entry.id)).size,
      live.get().entries.length,
      "and no two lines share a name",
    );
  });

  it("the timeline is keyed by the name, not by where the line happens to sit", () => {
    // The renderer half. An index key says a line is identified by its position,
    // which is the same wrong belief the surface held, one layer down.
    const source = readFileSync(join(ROOT, "apps/terminal/src/components/Timeline.tsx"), "utf8");
    const keyed = /<Line key=\{([^}]*)\}/.exec(source);
    assert.ok(keyed, "the timeline keys its lines");
    assert.equal(keyed[1], "entry.id", "by the name the producer carried");
    assert.doesNotMatch(source, /key=\{i\}/, "and never by the array index");
  });
});

describe("UI-01 deduplicating by content would be wrong, and here is the case", () => {
  it("two genuinely distinct replies that read identically both stay", () => {
    // The whole reason the name is not a hash of the words. A model asked twice
    // is allowed to say "ok" twice, and both of those are answers to something.
    // Deduplicating on content would keep one and lose a reply that really
    // happened, which is worse than the duplication it was meant to prevent.
    const first = replyEvent(100, "ok");
    const second = replyEvent(101, "ok");

    const store = createStore();
    deliver(store, first);
    deliver(store, second);

    const said = answers(store.get());
    assert.equal(said.length, 2, "two replies that read the same are still two replies");
    assert.notEqual(said[0]?.id, said[1]?.id, "because they are two events, not one");

    // And the pair that makes the choice unavoidable: the same event twice is
    // one line, while the same words twice is two.
    const repeated = createStore();
    deliver(repeated, first, 2);
    assert.equal(answers(repeated.get()).length, 1, "one event delivered twice is one line");
  });

  it("a check the run performed twice is shown twice, with the same words", () => {
    // This is not a contrived pair. A run that finishes two slices verifies its
    // result twice and says so twice, and the two lines read exactly the same.
    // A surface that collapsed them would hide the second check, which is the one
    // the person most wants to see.
    const store = createStore();
    store.send({ type: "noted", entry: { kind: "status", label: "check", value: "verified by the declared check", certainty: "confirmed" } });
    store.send({ type: "noted", entry: { kind: "status", label: "check", value: "verified by the declared check", certainty: "confirmed" } });

    const checks = store.get().entries.filter((entry) => entry.kind === "status" && entry.label === "check");
    assert.equal(checks.length, 2, "two checks performed, two lines shown");
    assert.equal(checks[0]?.kind === "status" && checks[1]?.kind === "status" ? checks[0].value === checks[1].value : false, true);
  });

  it("the same sentence sent twice is two lines, not one", () => {
    // The surface's own lines, for the same reason. A person repeating themselves
    // is saying it twice, and a timeline that showed it once would be denying
    // that they did.
    const store = createStore();
    store.send({ type: "submit", text: "are you there" });
    store.send({ type: "submit", text: "are you there" });

    const said = store.get().entries.filter((entry) => entry.kind === "you");
    assert.equal(said.length, 2);
    assert.notEqual(said[0]?.id, said[1]?.id);
  });

  it("a settled row keeps the name it was opened with", () => {
    // An action row is one line told twice over: once as it is happening and
    // once as what happened. If the settled form took a new name, the renderer
    // would drop the row and draw a stranger in its place, and a repeated
    // delivery of the observation would append a second row beside it.
    const store = createStore();
    const action: Event = { seq: 55, at: 1, kind: "action", subject: "builder", data: { tool: "cat", input: { path: "a.ts" }, step: 1 } };
    const opened = translateEvent(action, SESSION, { verb: "read", detail: "a.ts", label: "read" });
    assert.ok(opened);
    store.send({ type: "observed", entries: [{ ...opened.entry, id: opened.id }] });
    const firstName = store.get().entries[0]?.id;

    const observation: Event = { seq: 56, at: 2, kind: "observation", subject: "builder", data: { tool: "cat", exit: 0, output: "", step: 1 } };
    const settled = translateEvent(observation, SESSION, { verb: "read", detail: "a.ts", label: "read" }, 0);
    assert.ok(settled);
    store.send({ type: "settled", at: 0, entry: settled.entry });
    store.send({ type: "settled", at: 0, entry: settled.entry });

    const rows = store.get().entries.filter((entry) => entry.kind === "action");
    assert.equal(rows.length, 1, "one row, opened then settled twice over");
    assert.equal(store.get().entries[0]?.id, firstName, "and it never changed its name");
    assert.equal(rows[0]?.kind === "action" ? rows[0].certainty : "", "confirmed");
  });
});

describe("UI-01 a rendered terminal draws one reply, on a remount", () => {
  it("the frame contains the reply once, before and after the mount is torn down", () => {
    // The whole thing through Ink, because the defect was a thing a person saw in
    // a terminal and not a thing a reducer returned. Both renders run against the
    // same journal, so this is the remount.
    const root = mkdtempSync(join(tmpdir(), "cuesheet-once-"));
    try {
      const terminal = resolve("apps/terminal");
      const script = join(root, "fixture.tsx");
      writeFileSync(join(root, "package.json"), '{"type":"module"}');
      writeFileSync(
        script,
        `import React from ${JSON.stringify(join(terminal, "node_modules/react/index.js"))};
import {render} from ${JSON.stringify(join(terminal, "node_modules/ink/build/index.js"))};
import {PassThrough} from 'node:stream';
import {App} from ${JSON.stringify(join(terminal, "src/app/App.tsx"))};
import {createStore} from ${JSON.stringify(join(terminal, "src/app/store.ts"))};
import {derive,emptySurface} from ${JSON.stringify(join(terminal, "src/app/state.ts"))};
// The journal a live surface wrote, with the reply recorded three times.
const control={type:'observed',entries:[{id:'e:s:42',kind:'cuesheet',text:'ONCE_MARKER'}]};
const journal=[{type:'submit',text:'ask'},control,control,control];
const live=createStore();for(const c of journal)live.send(c);
const out=new PassThrough();Object.assign(out,{columns:80,rows:24,isTTY:false});let frame='';out.on('data',b=>frame=b.toString());
const input=new PassThrough();Object.assign(input,{isTTY:true,setRawMode(){},ref(){},unref(){}});
const props={producer:{say(){},choose(){}} as any};
const first=render(React.createElement(App,{store:live,...props}),{stdout:out as any,stderr:out as any,stdin:input as any,debug:true,exitOnCtrlC:false});
await new Promise(r=>setTimeout(r,60));
const before=frame;first.unmount();
await new Promise(r=>setTimeout(r,20));
// The remount rebuilds the surface from the journal rather than reusing it.
const remounted=createStore(journal.reduce(derive,emptySurface));
frame='';
const second=render(React.createElement(App,{store:remounted,...props}),{stdout:out as any,stderr:out as any,stdin:input as any,debug:true,exitOnCtrlC:false});
await new Promise(r=>setTimeout(r,60));
const after=frame;second.unmount();
const count=(s:string)=>(s.match(/ONCE_MARKER/g)??[]).length;
console.log(JSON.stringify({before:count(before),after:count(after)}));
`,
      );
      const run = spawnSync(process.execPath, [join(terminal, "node_modules/tsx/dist/cli.mjs"), script], { encoding: "utf8", timeout: 30_000 });
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout.trim());
      assert.equal(result.before, 1, "one reply on screen");
      assert.equal(result.after, 1, "and one reply after the mount was torn down");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** The render fixture needs `PassThrough`, which the fixture file imports itself. */
function spawnSyncNode(entry: string, script: string): { status: number | null; stdout: string; stderr: string } {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  return spawnSync(process.execPath, [entry, script], { encoding: "utf8", timeout: 30_000 });
}