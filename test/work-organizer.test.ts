import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventStore } from "../src/core/store.ts";
import { organizeWork, projectOrganization } from "../src/adapters/work-organizer.ts";
import { memoryCommand, projectMemory } from "../src/adapters/work-memory.ts";
import { TerminalSession } from "../src/adapters/terminal-session.ts";
import { createCompletionCheck } from "../src/adapters/surface-verification.ts";
import { ShellToolRunner } from "../src/adapters/shell.ts";
import { persistentView } from "../apps/terminal/src/producer/session-view.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";

test("automatic organization validates records, protects human memory and preserves model provenance", () => {
  const store = new EventStore("work", () => 0);
  memoryCommand(store, "/memory constraint preserve schema");
  const original = store.revision;
  const reject = (name: string, input: Record<string, unknown>) => {
    assert.equal(organizeWork(store, { name, input })!.exit, 2);
    assert.equal(store.revision, original);
  };
  reject("remember", { operation: "edit", id: "m-1", text: "drop schema", rationale: "easier", sources: [1] });
  reject("remember", { operation: "create", kind: "decision", text: "choice", rationale: "reason", sources: [999] });
  reject("organize_work", { phase: "done", rationale: "I say done" });
  reject("create_skill", { name: "../escape", instructions: "anything", rationale: "reuse" });
  assert.equal(organizeWork(store, { name: "remember", input: { operation: "create", kind: "question", text: "migration?", rationale: "unclear scope", sources: [1] } })!.exit, 0);
  assert.equal(projectMemory(store.toSession().events)[1]!.by, "model");
  assert.deepEqual(projectMemory(store.toSession().events)[1]!.sources, [1]);
  memoryCommand(store, "/memory edit m-2 no migration");
  assert.equal(projectMemory(store.toSession().events)[1]!.by, "human");
  assert.equal(organizeWork(store, { name: "remember", input: { operation: "edit", id: "m-2", text: "migration", rationale: "changed my mind", sources: [1] } })!.exit, 2);
  assert.equal(store.toSession().evidence.length, 0);
  organizeWork(store, { name: "organize_work", input: { phase: "spec", rationale: "Define the work", spec: "keep API", tasks: ["check API"] } });
  organizeWork(store, { name: "organize_work", input: { phase: "build", rationale: "Specification is ready" } });
  assert.equal(projectOrganization(store.toSession().events).plan!.spec, "keep API");
  assert.deepEqual(projectOrganization(store.toSession().events).plan!.tasks, ["check API"]);
  store.append({ kind: "goal", subject: "builder", data: { text: "a different request" } });
  assert.equal(projectOrganization(store.toSession().events).plan, null, "old plans do not apply to a different intention");
});

test("ordinary intent automatically produces a spec, memory, skill and verified build; restart keeps the state", async () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-autonomous-"));
  const cwd = join(root, "work"); mkdirSync(cwd);
  const oracle = join(root, "accept.mjs");
  writeFileSync(oracle, "import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';assert.equal(readFileSync('answer.txt','utf8'),'42');");
  let session: TerminalSession | undefined;
  try {
    session = new TerminalSession({ root: join(root, "sessions"), cwd });
    const store = persistentView(session);
    const frames: any[] = [];
    const shell = new ShellToolRunner({ allow: ["node"], roots: [cwd], defaultCwd: cwd });
    const producer = createProducer({ store, cwd, projectsRoot: root, identities: [], journal: session,
      toolNames: ["node"], tools: shell, verification: createCompletionCheck({ script: oracle, root: join(root, "proof") }),
      model: { name: "scripted-organizer", async infer(frame) {
        frames.push(frame);
        assert.ok(frame.directives.some(d => d.text.includes("You manage the work process automatically")));
        const call = (name: string, input: Record<string, unknown>) => ({ text: "", toolCalls: [{ name, input }] });
        if (frame.step === 1) return { text: "", toolCalls: [
          { name: "organize_work", input: { phase: "spec", rationale: "Make the deliverable precise", spec: "answer.txt contains exactly 42", tasks: ["write answer", "run independent check"] } },
          { name: "node", input: { argv: ["node", "-e", "require('fs').writeFileSync('stale','bad')"] } },
        ] };
        if (frame.step === 2) return call("remember", { operation: "create", kind: "constraint", text: "answer must be exactly 42", rationale: "Extracted from the request", sources: [frame.history.find(e => e.subject === "terminal.user")!.seq] });
        if (frame.step === 3) return call("create_skill", { name: "exact-output", instructions: "Write exact bytes without a newline, then invoke the declared check.", rationale: "Reusable exact-byte output requirement", sources: [frame.history.find(e => e.subject === "terminal.user")!.seq] });
        if (frame.step === 4) return call("node", { argv: ["node", "-e", "require('fs').writeFileSync('answer.txt','42')"] });
        return call("finish", {});
      } } });
    producer.say("Create answer.txt with exactly 42 and check the result");
    const end = Date.now() + 5000;
    while (store.get().busy && Date.now() < end) await new Promise(r => setTimeout(r, 10));
    assert.equal(store.get().busy, false);
    assert.equal(session.core.toSession().goal?.open, false);
    assert.equal(existsSync(join(cwd, "stale")), false, "a plan change requires a fresh inference before acting");
    assert.equal(readFileSync(join(cwd, "answer.txt"), "utf8"), "42");
    assert.equal(session.core.toSession().evidence.length, 1);
    assert.equal(projectOrganization(session.core.toSession().events).skills.length, 1);
    assert.equal(projectMemory(session.core.toSession().events)[0]!.by, "model");
    assert.match(frames[3].directives.at(-1).text, /exact-output/);
    const events = session.core.toSession().events;
    const evidence = events.find(e => e.kind === "evidence")!;
    assert.ok(events.filter(e => e.subject === "terminal.work" || e.subject === "terminal.memory").every(e => e.seq < evidence.seq));
    const id = session.metadata.id;
    const organization = projectOrganization(events);
    session.close(); session = new TerminalSession({ root: join(root, "sessions"), cwd, id });
    assert.deepEqual(projectOrganization(session.core.toSession().events), organization);
    assert.equal(projectMemory(session.core.toSession().events)[0]!.text, "answer must be exactly 42");
  } finally { session?.close(); rmSync(root, { recursive: true, force: true }); }
});
