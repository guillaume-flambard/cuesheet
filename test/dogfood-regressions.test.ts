import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShellToolRunner } from "../src/adapters/shell.ts";
import { createProducer } from "../apps/terminal/src/producer/index.ts";
import { createStore } from "../apps/terminal/src/app/store.ts";
import type { ContextFrame, ToolRequest } from "../src/core/loop.ts";

it("an allowed declaration cannot execute another binary", async () => {
  const root = mkdtempSync(join(tmpdir(), "cuesheet-argv-"));
  try {
    const runner = new ShellToolRunner({ allow: ["cat"], roots: [root], defaultCwd: root });
    const result = await runner.run({ name: "cat", input: { argv: [process.execPath, "-e", "console.log(12345)"] } });
    assert.equal(result.exit, 126);
    assert.doesNotMatch(result.output, /^12345/m);
    const allowed = new ShellToolRunner({ allow: ["ls"], roots: [root], defaultCwd: root });
    assert.equal((await allowed.run({ name: "ls", input: { argv: ["ls", "-A"] } })).exit, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("a correction discards old text and actions, and fresh proposals use the new directive", async () => {
  const store = createStore();
  const calls: ToolRequest[] = [];
  const frames: ContextFrame[] = [];
  let release!: () => void;
  let arrived!: () => void;
  const waiting = new Promise<void>((r) => { arrived = r; });
  const gate = new Promise<void>((r) => { release = r; });
  const producer = createProducer({
    store, cwd: "/srv/project", projectsRoot: "/srv", identities: [], toolNames: ["ls", "cat"],
    model: { name: "scripted", async infer(frame) {
      frames.push(frame);
      if (frame.step === 1) {
        arrived(); await gate;
        return { text: "obsolete answer", toolCalls: [{ name: "cat", input: { path: "old" } }] };
      }
      return { text: "fresh answer", toolCalls: frame.step === 2 ? [{ name: "ls", input: { path: "." } }] : [] };
    } },
    tools: { async run(call) { calls.push(call); return { name: call.name, exit: 0, output: "" }; } },
  });
  producer.say("read the old file");
  await waiting;
  producer.say("show the directory instead");
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls.map((c) => c.name), ["ls"]);
  assert.ok(frames[1]!.directives.some((d) => d.text === "show the directory instead"));
  assert.ok(frames[0]!.directives.some((d) => d.text === "tools: ls, cat, organize_work, remember, create_skill, describe_objective, read_history"));
  assert.equal(store.get().entries.some((e) => e.kind === "cuesheet" && e.text === "obsolete answer"), false);
  assert.ok(store.get().entries.some((e) => e.kind === "cuesheet" && e.text === "fresh answer"));
  assert.equal(store.get().entries.some((e) => e.kind === "status" && e.label === "work" && e.certainty === "confirmed"), false);
});

it("a correction during a tool prevents the remaining stale calls", async () => {
  const calls: string[] = [];
  let release!: () => void;
  let arrived!: () => void;
  const waiting = new Promise<void>((r) => { arrived = r; });
  const gate = new Promise<void>((r) => { release = r; });
  const producer = createProducer({
    store: createStore(), cwd: "/srv/project", projectsRoot: "/srv", identities: [],
    model: { name: "scripted", async infer(frame) {
      return { text: "", toolCalls: frame.step === 1 ? ["ls", "cat"].map((name) => ({ name, input: {} })) : [] };
    } },
    tools: { async run(call) { calls.push(call.name); arrived(); await gate; return { name: call.name, exit: 0, output: "" }; } },
  });
  producer.say("read files"); await waiting;
  producer.say("change direction"); release();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls, ["ls"]);
});

it("the launcher keeps the caller directory rather than the application directory", () => {
  const source = readFileSync(new URL("../src/surface-cli.ts", import.meta.url), "utf8");
  assert.match(source, /cwd: process\.cwd\(\)/);
  assert.doesNotMatch(source, /cwd: TERMINAL/);
});
