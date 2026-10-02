/**
 * Journey 002 — the model decision path.
 *
 * Journey 001 proved the orchestration with a scripted edit. This proves the part
 * that is genuinely missing: a real model receives a bounded objective and real
 * repository context, decides for itself what to change, and an independent
 * verifier it never saw decides whether the change is correct.
 *
 * What the harness fixes, by design: the repository, the goal, the file scope the
 * model may touch, the build, and the verifier. What it does NOT fix is the edit.
 * If the model returns garbage, the verifier says so and the journey fails.
 *
 * Usage: node scripts/ui/journey002.mjs
 *   CUESHEET_TEST_CAPSULE_IMAGE / CUESHEET_TEST_TOOL_SOCKET  for the build
 *   OPENROUTER_API_KEY / JOURNEY002_MODEL                   for the model
 *
 * A failure here is a real result about model capability, not a broken test.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, readdirSync, statSync, chmodSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");

function ensureSpawnHelper(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "spawn-helper" || name === "spawn-helper.exe") {
      const mode = statSync(p).mode;
      if ((mode & 0o111) === 0) chmodSync(p, mode | 0o755);
      continue;
    }
    if (statSync(p).isDirectory()) ensureSpawnHelper(p);
  }
}
const pnpmDir = join(repo, "node_modules", ".pnpm");
if (existsSync(pnpmDir)) for (const e of readdirSync(pnpmDir)) if (e.startsWith("node-pty")) ensureSpawnHelper(join(pnpmDir, e, "node_modules", "node-pty"));

const IMAGE = process.env.CUESHEET_TEST_CAPSULE_IMAGE;
const SOCKET = process.env.CUESHEET_TEST_TOOL_SOCKET;
const MODEL = process.env.JOURNEY002_MODEL ?? "anthropic/claude-sonnet-5.5";
const KEY = process.env.OPENROUTER_API_KEY;
const log = (m) => console.log(`  ${m}`);
let failures = 0;
const fail = (m) => { failures += 1; console.log(`  FAIL ${m}`); };

console.log("\n=== Journey 002 : a real model chooses the change ===\n");

if (!KEY) { console.log("  SKIPPED: OPENROUTER_API_KEY is not set, so there is no model to test."); process.exit(2); }
if (!IMAGE || !SOCKET) { console.log("  SKIPPED: the capsule needs CUESHEET_TEST_CAPSULE_IMAGE and CUESHEET_TEST_TOOL_SOCKET."); process.exit(2); }

/** The file the model may change, and the whole of what it is told about it. */
const TARGET = "apps/terminal/src/components/StatusBar.tsx";
const GOAL = [
  "In the terminal status bar, counts read awkwardly in the singular: it writes a plural placeholder like \"2 notification(s)\", and when there is exactly one it should read naturally as a singular.",
  "Make every count the bar can show read correctly for one and for more than one, in French, without the placeholder.",
  "A count of zero must stay hidden, exactly as it is today.",
  "Return the COMPLETE new content of the file you change.",
].join(" ");

const root = realpathSync(mkdtempSync(join(tmpdir(), "cs-journey002-")));
let workspace;
try {
  // 1. A real candidate, with real repository context available to the model.
  log("1. allocate a real candidate worktree");
  const { captureGitSnapshot, snapshotMatches } = await import(join(repo, "src/adapters/git-snapshot.ts"));
  const { allocateWorktree } = await import(join(repo, "src/adapters/managed-worktrees.ts"));
  const snapshot = await captureGitSnapshot(repo);
  const allocated = await allocateWorktree({ repository: repo, root: join(root, "workspaces"), allocation: { id: "j2", unit: "journey-002", agent: "model", objective: "journey-002", revision: 1, base: snapshot.base }, snapshot });
  if (allocated.kind !== "ready") { fail(`worktree allocation refused: ${allocated.reason ?? allocated.kind}`); throw new Error("allocation"); }
  workspace = allocated.path;
  log(`   candidate at ${workspace}`);

  // 2. The model decides. It gets the goal and the file, and nothing else.
  log(`2. ask ${MODEL} to decide the change (bounded to ${TARGET})`);
  const { OpenRouterAdapter } = await import(join(repo, "src/adapters/openrouter.ts"));
  const adapter = new OpenRouterAdapter({ apiKey: KEY, model: MODEL, label: "journey-002", maxTokens: 8000 });
  const fileBody = readFileSync(join(workspace, TARGET), "utf8");
  const prompt = [
    "You are editing a TypeScript/Ink terminal UI in a repository you can read below.",
    `OBJECTIVE: ${GOAL}`,
    `You may change exactly one file: ${TARGET}.`,
    "Reply with ONLY a JSON object, no prose and no code fence: {\"path\":\"<path>\",\"content\":\"<the complete new file content>\"}",
    "The content must be the entire file, valid TypeScript, and must compile.",
    "",
    `=== ${TARGET} ===`,
    fileBody,
  ].join("\n");
  const started = Date.now();
  const reply = await adapter.infer({ goal: prompt, history: [], directives: [], evidence: [], capabilities: [], model: MODEL, step: 1 });
  const elapsed = Date.now() - started;
  log(`   model replied in ${elapsed} ms, ${reply.text.length} chars`);

  let edit;
  try {
    const first = reply.text.indexOf("{");
    const last = reply.text.lastIndexOf("}");
    edit = JSON.parse(reply.text.slice(first, last + 1));
  } catch {
    fail(`the model did not return parsable JSON. Raw reply head: ${JSON.stringify(reply.text.slice(0, 300))}`);
    throw new Error("parse");
  }
  if (typeof edit.path !== "string" || typeof edit.content !== "string") { fail("the model's JSON lacks path/content"); throw new Error("shape"); }
  if (edit.path !== TARGET) { fail(`the model edited ${edit.path}, outside the bounded scope ${TARGET}`); throw new Error("scope"); }
  log("   model chose an edit inside the allowed scope");

  // 3. Apply it to the candidate, never to stable.
  log("3. apply the edit to the candidate");
  writeFileSync(join(workspace, TARGET), edit.content, "utf8");
  if (readFileSync(join(workspace, TARGET), "utf8") === fileBody) { fail("the model returned the file unchanged"); throw new Error("nochange"); }

  // The verifier is copied in AFTER the model is done, so it could not have read it.
  const verifierDest = join(workspace, "apps", "terminal", "ui", "journal-verifier.test.ts");
  copyFileSync(join(here, "..", "..", "apps", "terminal", "ui", "journey002-verifier.test.ts"), verifierDest);
  log("   independent verifier placed in the candidate");

  // 4. Build the candidate in the capsule.
  log("4. build the candidate in the Linux capsule");
  const { ContainerToolRunner } = await import(join(repo, "src/adapters/container-tools.ts"));
  const runner = new ContainerToolRunner({ allow: ["node", "npm"], roots: [workspace], defaultCwd: workspace, socket: SOCKET, image: IMAGE, timeoutMs: 180000, outputBytes: 20000 });
  const built = await runner.run({ name: "npm", input: { argv: ["npm", "run", "build"] } });
  if (built.exit !== 0) { fail(`candidate build failed: ${built.output.slice(-800)}`); throw new Error("build"); }
  log("   build: ok");

  // 5. The independent verifier decides, not the model.
  log("5. run the verifier the model never saw");
  const verified = await runner.run({ name: "node", input: { argv: ["node", "apps/terminal/node_modules/tsx/dist/cli.mjs", "--test", "--test-reporter=spec", "apps/terminal/ui/journal-verifier.test.ts"] } });
  const passed = /^# pass /m.test(verified.output) || /ℹ pass \d+/.test(verified.output);
  const failedCount = /ℹ fail (\d+)/.exec(verified.output)?.[1] ?? "?";
  if (verified.exit !== 0) {
    fail(`the model's change does not satisfy the objective. verifier fail=${failedCount}`);
    console.log(verified.output.split("\n").filter((l) => /✖|not ok|AssertionError|does not|missing|placeholder/.test(l)).slice(0, 8).map((l) => "     | " + l.trim().slice(0, 120)).join("\n"));
  } else {
    log(`   verifier PASS (fail=${failedCount})`);
  }

  // 6. Isolation.
  log("6. stable must be untouched");
  if (readFileSync(join(repo, TARGET), "utf8") !== fileBody) fail("stable source changed during the journey");
  if (!(await snapshotMatches(snapshot, repo))) fail("the original repository snapshot changed");
} catch (error) {
  if (!["allocation", "parse", "shape", "scope", "nochange", "build"].includes(error?.message)) { fail(`journey error: ${error?.message ?? error}`); }
} finally {
  if (workspace) { try { const { execFileSync } = await import("node:child_process"); execFileSync("git", ["-c", "core.hooksPath=/dev/null", "worktree", "remove", "--force", workspace], { cwd: repo, stdio: "pipe", env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }); } catch { /* gone */ } }
  rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

console.log(`\nJourney 002: ${failures === 0 ? "PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
