/**
 * Journey 004 — recovery: a verifier failure becomes a revised attempt.
 *
 * Stage 3 of the self-hosting trajectory, and section 18 of the autonomy spec:
 * the harness is valuable because it catches bad work, not because every run is
 * green. A failed attempt is evidence, it is kept, and the failure is fed back
 * as the next attempt's context rather than erased.
 *
 * The loop is: the model proposes an edit, the INDEPENDENT verifier judges it,
 * and if it fails the verifier's own output — not a summary written here — is
 * given back for the next attempt. Success on the first try is a legitimate
 * outcome and is reported as such; it does not prove recovery, and this journey
 * says which case actually happened.
 *
 * Usage: node scripts/ui/journey004.mjs
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

console.log("\n=== Journey 004 : a verifier failure becomes a revised attempt ===\n");

if (!KEY) { console.log("  SKIPPED: OPENROUTER_API_KEY is not set."); process.exit(2); }
if (!IMAGE || !SOCKET) { console.log("  SKIPPED: the capsule needs CUESHEET_TEST_CAPSULE_IMAGE and CUESHEET_TEST_TOOL_SOCKET."); process.exit(2); }

const TARGET = "apps/terminal/src/components/StatusBar.tsx";
const GOAL = [
  "The terminal status bar writes a plural placeholder for counts, for example \"2 notification(s)\" and it also has this problem for the read count elsewhere in the same component.",
  "Make EVERY count this component can display read naturally in French: correct for exactly one, correct for more than one, and never a placeholder like \"(s)\".",
  "A count of zero must remain hidden, exactly as today.",
  "Return the COMPLETE new content of the file.",
].join(" ");

const MAX_ATTEMPTS = 3;
const root = realpathSync(mkdtempSync(join(tmpdir(), "cs-journey004-")));
let workspace;
try {
  log("1. allocate a real candidate worktree");
  const { captureGitSnapshot, snapshotMatches } = await import(join(repo, "src/adapters/git-snapshot.ts"));
  const { allocateWorktree } = await import(join(repo, "src/adapters/managed-worktrees.ts"));
  const snapshot = await captureGitSnapshot(repo);
  const allocated = await allocateWorktree({ repository: repo, root: join(root, "workspaces"), allocation: { id: "j4", unit: "journey-004", agent: "model", objective: "journey-004", revision: 1, base: snapshot.base }, snapshot });
  if (allocated.kind !== "ready") { fail(`worktree allocation refused: ${allocated.reason ?? allocated.kind}`); throw new Error("allocation"); }
  workspace = allocated.path;
  log(`   candidate at ${workspace}`);

  const { OpenRouterAdapter } = await import(join(repo, "src/adapters/openrouter.ts"));
  const { ContainerToolRunner } = await import(join(repo, "src/adapters/container-tools.ts"));
  const adapter = new OpenRouterAdapter({ apiKey: KEY, model: MODEL, label: "journey-004", maxTokens: 8000 });
  const original = readFileSync(join(workspace, TARGET), "utf8");
  const verifierRel = join("apps", "terminal", "ui", "journal-verifier.test.ts");
  const verifierSrc = join(repo, "apps", "terminal", "ui", "journey002-verifier.test.ts");

  // The attempts are kept, in order. A failed attempt is evidence, never erased.
  const attempts = [];
  let outcome = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log(`2.${attempt} ask ${MODEL} for attempt ${attempt}`);
    // On a retry the previous verifier output is supplied VERBATIM, as the
    // failure it is, rather than a summary this file would have written.
    const priorFailure = attempts.at(-1)?.verifierOutput;
    const prompt = [
      "You are editing a TypeScript/Ink terminal UI in a repository you can read below.",
      `OBJECTIVE: ${GOAL}`,
      `You may change exactly one file: ${TARGET}.`,
      "Reply with ONLY a JSON object, no prose and no code fence: {\"path\":\"<path>\",\"content\":\"<the complete new file content>\"}",
      priorFailure ? `YOUR PREVIOUS ATTEMPT FAILED ITS INDEPENDENT VERIFIER. The verifier output is below, verbatim. Fix the cause, do not restate the same edit.\n--- verifier output ---\n${priorFailure}\n--- end ---` : "",
      "",
      `=== ${TARGET} (current candidate content) ===`,
      readFileSync(join(workspace, TARGET), "utf8"),
    ].filter(Boolean).join("\n");

    const started = Date.now();
    const reply = await adapter.infer({ goal: prompt, history: [], directives: [], evidence: [], capabilities: [], model: MODEL, step: attempt });
    log(`     replied in ${Date.now() - started} ms, ${reply.text.length} chars`);

    let edit;
    try {
      edit = JSON.parse(reply.text.slice(reply.text.indexOf("{"), reply.text.lastIndexOf("}") + 1));
    } catch {
      // A malformed reply is a FAILED ATTEMPT, not a failed journey. Section 18:
      // the harness is valuable because it catches bad work. The attempt is
      // recorded with the reason, and the reason is what the next attempt is
      // given, which is the recovery being tested.
      const empty = reply.text.trim().length === 0;
      const reason = empty
        ? "the model returned an EMPTY response, so no edit was produced"
        : `the model did not return parsable JSON. Raw reply: ${JSON.stringify(reply.text.slice(0, 400))}`;
      attempts.push({ attempt, verifierOutput: reason, editOutcome: empty ? "empty-reply" : "unparsable" });
      log(`     attempt ${attempt}: ${empty ? "EMPTY reply" : "unparsable JSON"}; the failure becomes the next context`);
      continue;
    }
    if (edit.path !== TARGET) {
      attempts.push({ attempt, verifierOutput: `the model edited ${edit.path}, outside the bounded scope ${TARGET}`, editOutcome: "scope" });
      log(`     attempt ${attempt}: edited outside the bounded scope; the failure becomes the next context`);
      continue;
    }

    writeFileSync(join(workspace, TARGET), edit.content, "utf8");
    copyFileSync(verifierSrc, join(workspace, verifierRel));

    log(`2.${attempt} build the candidate attempt`);
    const runner = new ContainerToolRunner({ allow: ["node", "npm"], roots: [workspace], defaultCwd: workspace, socket: SOCKET, image: IMAGE, timeoutMs: 180000, outputBytes: 20000 });
    const built = await runner.run({ name: "npm", input: { argv: ["npm", "run", "build"] } });
    if (built.exit !== 0) {
      // A build failure is also a verifier failure, and its output is the feedback.
      const output = built.output.slice(-1500);
      attempts.push({ attempt, verifierOutput: `the candidate did not build:\n${output}`, editOutcome: "build-failed" });
      log(`     attempt ${attempt}: build FAILED, the output becomes the next context`);
      writeFileSync(join(workspace, TARGET), original, "utf8");
      continue;
    }

    log(`2.${attempt} run the verifier the model never saw`);
    const verified = await runner.run({ name: "node", input: { argv: ["node", "apps/terminal/node_modules/tsx/dist/cli.mjs", "--test", "--test-reporter=spec", "apps/terminal/ui/journal-verifier.test.ts"] } });
    const record = { attempt, verifierOutput: verified.output.slice(-1800), editOutcome: verified.exit === 0 ? "verified" : "verifier-failed" };
    attempts.push(record);
    if (verified.exit === 0) { outcome = { attempt, record }; log(`     attempt ${attempt}: VERIFIED`); break; }
    log(`     attempt ${attempt}: verifier FAILED, its output becomes the next context`);
  }

  log("3. the record, and what actually happened");
  console.log(`     attempts: ${attempts.length} (${attempts.map((a) => `#${a.attempt}=${a.editOutcome}`).join(", ")})`);
  if (!outcome) fail("no attempt was verified within the budget; the failure history is preserved above");
  else if (attempts.length > 1 && !attempts.slice(0, -1).some((a) => a.editOutcome !== "verified")) fail("multiple attempts but none recorded a failure, so the history is incomplete");
  else if (outcome.attempt === 1) log("   verified on the first attempt: recovery was NOT exercised, and this journey does not claim it was");
  else log(`   recovery demonstrated: attempt #${outcome.attempt} succeeded after ${outcome.attempt - 1} recorded failure(s)`);

  log("4. stable must be untouched");
  if (readFileSync(join(repo, TARGET), "utf8") !== original) fail("stable source changed during the journey");
  if (!(await snapshotMatches(snapshot, repo))) fail("the original repository snapshot changed");
} catch (error) {
  if (!["allocation"].includes(error?.message)) { fail(`journey error: ${error?.message ?? error}`); }
} finally {
  if (workspace) { try { const { execFileSync } = await import("node:child_process"); execFileSync("git", ["-c", "core.hooksPath=/dev/null", "worktree", "remove", "--force", workspace], { cwd: repo, stdio: "pipe", env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }); } catch { /* gone */ } }
  rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

console.log(`\nJourney 004: ${failures === 0 ? "PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
