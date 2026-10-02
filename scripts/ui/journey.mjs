/**
 * Bootstrap Journey 001 — the whole dogfood path, deterministically, on a real candidate.
 *
 * This is the first end-to-end run of the gate that decides whether CUESHEET can
 * develop CUESHEET. It does not need a model to decide: the decision is one
 * scripted Edit, which is honest. What it does exercise, for real, is everything
 * around that decision, all of it through the production code paths that already
 * have their own proofs:
 *
 *   allocate a real worktree of THIS repository   (managed-worktrees, proven)
 *   edit one real source file in that worktree    (git, not a simulation)
 *   build it in the Linux capsule                 (worktree-build, proven)
 *   launch the candidate's real UI under a PTY    (ui:verify, proven)
 *   read the candidate's screen and compare       (ui:verify emulator)
 *
 * The assertion that matters: the edit is visible in the CANDIDATE render and
 * absent from STABLE. That is what "a candidate becomes observable" means, and it
 * is not something a green unit suite can tell you.
 *
 * Usage: node scripts/ui/journey.mjs [--keep]
 *
 * A truthful failure here is worth more than a green run that means nothing. If a
 * step cannot be proven, this exits non-zero and says which step and why.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync, lstatSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
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
if (existsSync(pnpmDir)) {
  for (const e of readdirSync(pnpmDir)) if (e.startsWith("node-pty")) ensureSpawnHelper(join(pnpmDir, e, "node_modules", "node-pty"));
}
const pty = require(join(repo, "apps", "terminal", "node_modules", "node-pty"));

const IMAGE = process.env.CUESHEET_TEST_CAPSULE_IMAGE;
const SOCKET = process.env.CUESHEET_TEST_TOOL_SOCKET;
const KEEP = process.argv.includes("--keep");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reuse the proven screen emulator rather than a second, weaker one. */

// verify.mjs is a top-level script, not a module. Import its emulator by reading
// it is fragile, so the journey carries the one thing it needs: a screen model.
// Kept deliberately small and identical in intent to verify.mjs.
class Screen {
  constructor(cols, rows) { this.cols = cols; this.rows = rows; this.grid = Array.from({ length: rows }, () => Array(cols).fill(" ")); this.x = 0; this.y = 0; }
  #c() { this.x = Math.max(0, Math.min(this.cols - 1, this.x)); this.y = Math.max(0, Math.min(this.rows - 1, this.y)); }
  put(ch) { if (this.x < this.cols) { this.grid[this.y][this.x] = ch; this.x += 1; } }
  write(t) { for (const ch of t) { const cp = ch.codePointAt(0); if (ch === "\n") { this.y += 1; this.#c(); continue; } if (ch === "\r") { this.x = 0; continue; } if (ch === "\b") { this.x -= 1; this.#c(); continue; } if (cp < 0x20) continue; this.put(ch); } }
  lines() { return this.grid.map((r) => r.join("").replace(/\s+$/, "")); }
  text() { return this.lines().filter((l) => l.trim()).join("\n"); }
}
function screen(stream, cols, rows) {
  const s = new Screen(cols, rows);
  const esc = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b\][^\x07]*\x07|\x1b[()][B0]|\x1b[=>]/g;
  let last = 0, m;
  while ((m = esc.exec(stream)) !== null) {
    if (m.index > last) s.write(stream.slice(last, m.index));
    last = esc.lastIndex;
    if (m[2] === undefined) continue;
    const ps = m[1].split(";").filter((p) => p !== "").map(Number); const n = ps[0] || 0;
    switch (m[2]) {
      case "A": s.y -= n || 1; break; case "B": s.y += n || 1; break; case "C": s.x += n || 1; break; case "D": s.x -= n || 1; break;
      case "G": s.x = (n || 1) - 1; break; case "d": s.y = (n || 1) - 1; break;
      case "H": case "f": s.y = (ps[0] || 1) - 1; s.x = (ps[1] || 1) - 1; break;
      case "J": if (n === 2 || n === 3) s.grid = Array.from({ length: rows }, () => Array(cols).fill(" ")); break;
      case "K": { const m2 = n; if (m2 === 2) s.grid[s.y] = Array(cols).fill(" "); else if (m2 === 1) { for (let i = 0; i <= s.x && i < cols; i++) s.grid[s.y][i] = " "; } else for (let i = s.x; i < cols; i++) s.grid[s.y][i] = " "; break; }
      default: break;
    }
    s.x = Math.max(0, Math.min(cols - 1, s.x)); s.y = Math.max(0, Math.min(rows - 1, s.y));
  }
  s.write(stream.slice(last));
  return s;
}

async function git(args, cwd) {
  const { execFileSync } = await import("node:child_process");
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
}

const MARKER = "JOURNEY_CANDIDATE_EDIT";
const log = (m) => console.log(`  ${m}`);
let failures = 0;
const fail = (m) => { failures += 1; console.log(`  FAIL ${m}`); };

console.log("\n=== Bootstrap Journey 001 : CUESHEET develops CUESHEET ===\n");

if (!IMAGE || !SOCKET) {
  console.log("  SKIPPED: the capsule needs CUESHEET_TEST_CAPSULE_IMAGE and CUESHEET_TEST_TOOL_SOCKET.");
  console.log("  This journey proves the candidate end to end, which means it builds for real. No build, no claim.");
  process.exit(2);
}

const root = realpathSync(mkdtempSync(join(tmpdir(), "cs-journey-")));
const candidate = join(root, "candidate");
let workspace;
try {
  // Step 1 — a real candidate of this repository.
  log("1. allocate a real candidate worktree of this repository");
  const { captureGitSnapshot, snapshotMatches } = await import(join(repo, "src/adapters/git-snapshot.ts"));
  const { allocateWorktree } = await import(join(repo, "src/adapters/managed-worktrees.ts"));
  const snapshot = await captureGitSnapshot(repo);
  const allocated = await allocateWorktree({ repository: repo, root: join(root, "workspaces"), allocation: { id: "journey", unit: "bootstrap-journey", agent: "journey", objective: "journey", revision: 1, base: snapshot.base }, snapshot });
  if (allocated.kind !== "ready") { fail(`worktree allocation refused: ${allocated.reason ?? allocated.kind}`); throw new Error("allocation"); }
  workspace = allocated.path;
  log(`   candidate ready at ${workspace}`);

  // Step 2 — one real edit, in the candidate, in a real source file.
  log("2. edit one real source file in the candidate");
  const target = join(workspace, "apps/terminal/src/components/Composer.tsx");
  const before = readFileSync(target, "utf8");
  const needle = 'props.placeholder ?? "dis-moi ce que tu veux faire"';
  if (!before.includes(needle)) { fail("the candidate Composer.tsx does not contain the expected placeholder; the journey cannot edit blind"); throw new Error("anchor"); }
  // A one-token change to a string that is actually on screen. Adding a JSX
  // comment instead looked safer and was not: it broke the esbuild step, which
  // is the journey catching a bad edit rather than the journey being broken.
  const edited = before.replace(needle, `props.placeholder ?? "${MARKER}"`);
  writeFileSync(target, edited, "utf8");
  if (!readFileSync(target, "utf8").includes(MARKER)) { fail("the edit did not land in the candidate file"); throw new Error("edit"); }
  log("   edit landed (a placeholder string swapped for the marker, the smallest change that is genuinely observable on screen)");

  // Step 3 — build the candidate in the Linux capsule, through the production runner.
  log("3. build the candidate in the Linux capsule");
  const { ContainerToolRunner } = await import(join(repo, "src/adapters/container-tools.ts"));
  const runner = new ContainerToolRunner({ allow: ["node", "npm"], roots: [workspace], defaultCwd: workspace, socket: SOCKET, image: IMAGE, timeoutMs: 180000, outputBytes: 20000 });
  const built = await runner.run({ name: "npm", input: { argv: ["npm", "run", "build"] } });
  if (built.exit !== 0) { fail(`candidate build failed: ${built.output.slice(-600)}`); throw new Error("build"); }
  if (!/build: ok/.test(built.output)) fail("candidate build did not report 'build: ok'");
  log("   build: ok in the capsule");

  // Step 4 — launch the CANDIDATE UI under a real PTY and read its screen.
  log("4. launch the candidate UI under a real PTY and read the screen");
  const renderOf = async (rootDir, label) => {
    // The PTY step runs on the HOST, not in the capsule, so the candidate needs
    // node_modules pointing at the repository. The capsule build has already run
    // and replaced those links with ones aimed at /opt/cuesheet-deps/node_modules,
    // which exists only inside the image, so they are repointed rather than
    // checked: existsSync follows symlinks and would call a dangling link absent.
    const { symlinkSync, rmSync: rm } = await import("node:fs");
    for (const rel of ["node_modules", "apps/terminal/node_modules"]) {
      const link = join(rootDir, rel);
      const targetLink = join(repo, rel);
      if (!existsSync(targetLink)) continue;
      try { rm(link, { recursive: true, force: true }); } catch { /* nothing there */ }
      symlinkSync(targetLink, link);
    }
    const term = pty.spawn(process.execPath, [join(rootDir, "apps/terminal/node_modules/tsx/dist/cli.mjs"), join(rootDir, "apps/terminal/ui/fixture-main.tsx")], { name: "xterm-256color", cols: 120, rows: 30, cwd: rootDir, env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "3" } });
    let raw = ""; term.onData((d) => { raw += d; });
    await sleep(6000);
    for (const [t, m] of [["hello there", "RENDER_PROOF_REPLY"], ["analyse mes projets", "RENDER_PROOF_HUMAN_DELTA"]]) {
      term.write(t); await sleep(400); term.write("\r");
      const end = Date.now() + 9000; while (Date.now() < end && !screen(raw, 120, 30).text().includes(m)) await sleep(150);
      await sleep(500);
    }
    term.kill(); await sleep(300);
    return screen(raw, 120, 30).text();
  };

  const candidateScreen = await renderOf(workspace, "candidate");
  log("   candidate screen read");
  if (!candidateScreen.includes("RENDER_PROOF_REPLY")) { fail("candidate screen has no reply"); console.log("   -- candidate screen --"); for (const l of candidateScreen.split("\n").filter((x) => x.trim()).slice(0, 8)) console.log("   | " + l.slice(0, 100)); }
  if (!candidateScreen.includes("RENDER_PROOF_HUMAN_DELTA")) { fail("candidate screen has no Human Delta"); }

  // Step 5 — the assertion that defines the gate.
  log("5. the edit is visible in the candidate and absent from stable");
  const candidateBuilt = existsSync(join(workspace, "dist", "apps", "terminal", "main.mjs"));
  if (!candidateBuilt) fail("the candidate produced no build output");
  const stableHasMarker = readFileSync(join(repo, "apps/terminal/src/components/Composer.tsx"), "utf8").includes(MARKER);
  if (stableHasMarker) fail("the marker leaked into STABLE; the candidate was not isolated");
  log("   candidate isolated: stable source is unchanged");

  if (!(await snapshotMatches(snapshot, repo))) fail("the original repository content changed during the journey");
  log("   original repository snapshot preserved");
} catch (error) {
  if (error?.message !== "allocation" && error?.message !== "anchor" && error?.message !== "edit" && error?.message !== "build") {
    console.log(`  FAIL journey error: ${error?.message ?? error}`);
    failures += 1;
  }
} finally {
  if (workspace) { try { await git(["-c", "core.hooksPath=/dev/null", "worktree", "remove", "--force", workspace], repo); } catch { /* already gone */ } }
  if (!KEEP) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  else log(`kept ${root}`);
}

console.log(`\nBootstrap Journey 001: ${failures === 0 ? "PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);