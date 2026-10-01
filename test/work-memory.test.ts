import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryCommand, projectMemory } from "../src/adapters/work-memory.ts";
import { EventStore } from "../src/core/store.ts";
import { TerminalSession } from "../src/adapters/terminal-session.ts";
import { persistentView } from "../apps/terminal/src/producer/session-view.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";

test("memory mutations retain history, resolve and reopen without inventing evidence", () => {
  const store = new EventStore("memory", () => 0);
  assert.equal(memoryCommand(store, "ordinary"), null);
  assert.match(memoryCommand(store, "/memory decision keep API")!, /m-1/);
  memoryCommand(store, "/memory question migration?");
  memoryCommand(store, "/memory edit m-1 preserve public API");
  memoryCommand(store, "/memory resolve m-2 no migration required");
  assert.equal(projectMemory(store.toSession().events)[1]!.active, false);
  memoryCommand(store, "/memory edit m-2 migration after release?");
  const memory = projectMemory(store.toSession().events);
  assert.equal(memory[1]!.active, true);
  assert.equal(memory[0]!.created, 1);
  assert.equal(memory[0]!.revision, 3);
  assert.equal(store.toSession().events[0]!.data.text, "keep API");
  const revision = store.revision;
  memoryCommand(store, "/memory edit m-99 nope");
  memoryCommand(store, "/memory resolve");
  memoryCommand(store, "/memory");
  assert.equal(store.revision, revision);
  assert.equal(store.toSession().evidence.length, 0);
});

test("terminal memory survives restart, reaches replacement model, and invalidates a pending tool batch", async () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-memory-"));
  const cwd = join(root, "work"); mkdirSync(cwd);
  let journal: TerminalSession | undefined;
  try {
    journal = new TerminalSession({ root: join(root, "sessions"), cwd });
    let store = persistentView(journal);
    let calls = 0; let tools = 0; let release: ((value: any) => void) | undefined;
    let latest: any;
    const make = () => createProducer({ store, cwd, projectsRoot: root, identities: [], journal,
      model: { name: "replacement", async infer(frame) { latest = frame; calls++; if (calls === 1) return new Promise<any>(r => { release = r; }); return { text: "", toolCalls: [] }; } },
      tools: { async run(request) { tools++; return { name: request.name, exit: 0, output: "" }; } } });
    let producer = make();
    producer.say("/memory constraint preserve schema");
    assert.equal(calls, 0);
    const id = journal.metadata.id;
    journal.close(); journal = new TerminalSession({ root: join(root, "sessions"), cwd, id });
    store = persistentView(journal); producer = make();
    producer.say("repair fixture");
    assert.ok(release);
    producer.say("/memory edit m-1 preserve schema and API");
    release!({ text: "stale", toolCalls: [{ name: "node", input: { argv: ["node", "-e", "0"] } }] });
    const end = Date.now() + 3000;
    while (store.get().busy && Date.now() < end) await new Promise(r => setTimeout(r, 5));
    assert.equal(store.get().busy, false);
    assert.equal(tools, 0);
    const snapshot = latest.directives.find((d: any) => d.text.startsWith("Shared work snapshot.")).text;
    assert.match(snapshot, /preserve schema and API/);
    assert.equal(projectMemory(journal.core.toSession().events)[0]!.text, "preserve schema and API");
    assert.equal(journal.core.toSession().goal?.open, true);
  } finally { journal?.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a refused durable write publishes no successful memory record and starts no model", () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-memory-failure-"));
  let journal: TerminalSession | undefined;
  try {
    journal = new TerminalSession({ root, cwd: root });
    const store = persistentView(journal);
    let calls = 0;
    const producer = createProducer({ store, cwd: root, projectsRoot: root, identities: [], journal,
      model: { name: "unused", async infer() { calls++; return { text: "", toolCalls: [] }; } },
      tools: { async run(request) { return { name: request.name, exit: 0, output: "" }; } } });
    const path = join(root, `${journal.metadata.id}.jsonl`);
    rmSync(path); mkdirSync(path);
    producer.say("/memory decision preserve API");
    assert.equal(calls, 0);
    assert.deepEqual(projectMemory(journal.core.toSession().events), []);
    assert.ok(journal.failure);
    assert.equal(store.get().entries.some(entry => entry.kind === "status" && entry.value.includes("enregistré")), false);
  } finally { journal?.close(); rmSync(root, { recursive: true, force: true }); }
});
