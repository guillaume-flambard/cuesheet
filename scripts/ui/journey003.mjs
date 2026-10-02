/**
 * Journey 003 — live reinterpretation, proven in the real surface.
 *
 * Unit tests already prove the mechanism: one store, a mid-run sentence becomes
 * a directive in the shared log, no queue anywhere. What they cannot prove is
 * that the SURFACE a person is looking at behaves that way, which is what the
 * autonomy spec asks for as a first-class journey.
 *
 * The scenario: a run is held open, and a sentence is typed while it is still in
 * flight. The assertion is that the sentence appears on screen immediately, with
 * the run still running, and that no Stop was demanded first.
 *
 * Usage: node scripts/ui/journey003.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readdirSync, statSync, chmodSync } from "node:fs";

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
const pty = require(join(repo, "apps", "terminal", "node_modules", "node-pty"));

const COLS = 120, ROWS = 34;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const strip = (stream) =>
  stream
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[()][B0]/g, "")
    .replace(/\r/g, "\n");

console.log("\n=== Journey 003 : new input lands while the run is in flight ===\n");

const term = pty.spawn(
  process.execPath,
  [join(repo, "apps/terminal/node_modules/tsx/dist/cli.mjs"), join(repo, "apps/terminal/ui/fixture-main.tsx")],
  { name: "xterm-256color", cols: COLS, rows: ROWS, cwd: repo, env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "3" } },
);
let raw = "";
term.onData((d) => { raw += d; });

const waitFor = async (marker, budget = 9000) => {
  const started = Date.now();
  while (Date.now() - started < budget) {
    if (strip(raw).includes(marker)) return true;
    await sleep(120);
  }
  return strip(raw).includes(marker);
};

/** Two writes: a pty coalesces a literal and a Return into one keypress otherwise. */
const type = async (text) => { term.write(text); await sleep(450); term.write("\r"); };

let failures = 0;
const fail = (m) => { failures += 1; console.log(`  FAIL ${m}`); };
const log = (m) => console.log(`  ${m}`);

try {
  await waitFor("cuesheet");
  log("1. surface up");

  log("2. start a run that stays in flight");
  await type("long");
  if (!(await waitFor("RENDER_PROOF_LONG_RUN"))) fail("the held run never appeared, so the scenario cannot be tested");
  else log("   run is in flight");

  const before = strip(raw);
  if (!/working/.test(before)) fail("the surface does not report the run as working while it is held");

  log("3. type a new instruction WITHOUT stopping the run");
  await type("finalement ne touche pas au schema");
  const landed = await waitFor("RENDER_PROOF_LIVE_STEER");

  if (!landed) {
    fail("the sentence typed during the run never reached the surface");
  } else {
    log("   the sentence is a fact on the timeline");
  }

  const after = strip(raw);
  // The two things the spec forbids: demanding a stop first, and queueing.
  if (/\bStop\b/.test(after)) fail("the surface demanded a Stop before accepting the sentence");
  if (/file d.attente|queue|en attente de l.ex.cution/i.test(after)) fail("the surface speaks of a queue or a pending message");
  if (!after.includes("finalement ne touche pas au schema")) fail("the typed sentence is not visible verbatim");

  log("4. the input stayed usable while the run was in flight");
  term.write("encore une chose");
  await sleep(600);
  if (!strip(raw).includes("encore une chose")) fail("the composer stopped accepting input during the run");
  else log("   composer accepted a second mid-run sentence");

  term.write("\u0003");
  await sleep(400);
} finally {
  term.kill();
}

console.log(`\nJourney 003: ${failures === 0 ? "PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
