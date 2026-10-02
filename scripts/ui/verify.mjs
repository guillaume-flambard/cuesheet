/**
 * Render Proof: run the real terminal in a real PTY and check what is on screen.
 *
 * A pipe is not enough. Ink refuses raw mode outside a TTY, which is the state
 * this whole command exists to exercise, so the app is launched under node-pty
 * with a controlled size.
 *
 * A plain ANSI strip is also not enough. Ink redraws by moving the cursor, so the
 * raw byte stream is a set of diffs and reading it directly reports text that was
 * erased. The emulator below applies those diffs to a character grid, which is
 * what a person actually sees. Every assertion reads the grid, never the stream.
 *
 * Usage: node scripts/ui/verify.mjs [cols] [rows]
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

/**
 * node-pty ships a `spawn-helper` binary, and npm loses its executable bit when
 * it unpacks the tarball. Without it every spawn fails with `posix_spawnp
 * failed`, which reads like a missing binary and is not one. Repairing it here
 * rather than in a setup note is the whole point of having one command: a
 * reinstall must not require anyone to remember this.
 */
function ensureSpawnHelper(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "spawn-helper" || name === "spawn-helper.exe") {
      const mode = statSync(path).mode;
      if ((mode & 0o111) === 0) chmodSync(path, mode | 0o755);
      continue;
    }
    if (statSync(path).isDirectory()) ensureSpawnHelper(path);
  }
}

const pnpmDir = join(root, "node_modules", ".pnpm");
if (existsSync(pnpmDir)) {
  for (const entry of readdirSync(pnpmDir)) {
    if (entry.startsWith("node-pty")) ensureSpawnHelper(join(pnpmDir, entry, "node_modules", "node-pty"));
  }
}

// node-pty belongs to the terminal workspace, not the repository root. The root
// package.json is asserted to declare no dependency at all, because the core is
// dependency-free, and a test enforces it. A harness is not a reason to break
// that invariant, so it loads the terminal's copy.
const pty = require(join(root, "apps", "terminal", "node_modules", "node-pty"));

/** Display width, because a tree glyph or a CJK name occupies two cells. */
const widthOf = (cp) => {
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2;
  return 1;
};

/** A character grid, driven by the subset of escapes Ink actually emits. */
class Screen {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
    this.x = 0;
    this.y = 0;
  }
  #clamp() {
    this.x = Math.max(0, Math.min(this.cols - 1, this.x));
    this.y = Math.max(0, Math.min(this.rows - 1, this.y));
  }
  put(ch) {
    if (this.x >= this.cols) return;
    this.grid[this.y][this.x] = ch;
    this.x += 1;
  }
  write(text) {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (ch === "\n") { this.y += 1; this.#clamp(); continue; }
      if (ch === "\r") { this.x = 0; continue; }
      if (ch === "\b") { this.x -= 1; this.#clamp(); continue; }
      if (ch === "\t") { this.x += 4; this.#clamp(); continue; }
      if (cp < 0x20) continue;
      this.put(ch);
    }
  }
  erase(mode) {
    if (mode === 2) { this.grid[this.y] = Array(this.cols).fill(" "); return; }
    if (mode === 1) { for (let i = 0; i <= this.x && i < this.cols; i++) this.grid[this.y][i] = " "; return; }
    for (let i = this.x; i < this.cols; i++) this.grid[this.y][i] = " ";
  }
  lines() {
    return this.grid.map((row) => row.join("").replace(/\s+$/, ""));
  }
  /** The whole visible screen, trailing blanks removed per line. */
  text() {
    return this.lines().filter((l) => l.trim()).join("\n");
  }
}

/** Feed a byte stream through the emulator, applying escapes to the grid. */
function render(stream, cols, rows) {
  const screen = new Screen(cols, rows);
  const esc = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b\][^\x07]*\x07|\x1b[()][B0]|\x1b[=>]/g;
  let last = 0;
  let m;
  const text = (s) => screen.write(s);
  while ((m = esc.exec(stream)) !== null) {
    if (m.index > last) text(stream.slice(last, m.index));
    last = esc.lastIndex;
    if (m[2] === undefined) continue;
    const params = m[1].split(";").filter((p) => p !== "").map(Number);
    const n = params[0] || 0;
    switch (m[2]) {
      case "A": screen.y -= (n || 1); break;
      case "B": screen.y += (n || 1); break;
      case "C": screen.x += (n || 1); break;
      case "D": screen.x -= (n || 1); break;
      case "G": screen.x = (n || 1) - 1; break;
      case "d": screen.y = (n || 1) - 1; break;
      case "H": case "f": screen.y = (params[0] || 1) - 1; screen.x = (params[1] || 1) - 1; break;
      case "J": if (n === 2 || n === 3) screen.grid = Array.from({ length: rows }, () => Array(cols).fill(" ")); break;
      case "K": screen.erase(n); break;
      default: break;
    }
    screen.x = Math.max(0, Math.min(cols - 1, screen.x));
    screen.y = Math.max(0, Math.min(rows - 1, screen.y));
  }
  text(stream.slice(last));
  return screen;
}

const strip = (stream, cols, rows) => render(stream, cols, rows).text();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Smallest interval that lets the child paint after an input. */
const PAINT = 900;

async function drive(cols, rows) {
  const term = pty.spawn(
    process.execPath,
    [join(root, "apps/terminal/node_modules/tsx/dist/cli.mjs"), join(root, "apps/terminal/ui/fixture-main.tsx")],
    { name: "xterm-256color", cols, rows, cwd: root, env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "3", NO_COLOR: "" } },
  );
  let raw = "";
  term.onData((d) => { raw += d; });

  const waitFor = async (marker, budget = 8000) => {
    const started = Date.now();
    while (Date.now() - started < budget) {
      if (strip(raw, cols, rows).includes(marker)) return true;
      await sleep(120);
    }
    return strip(raw, cols, rows).includes(marker);
  };

  await waitFor("cuesheet");
  const shots = {};
  const sent = [
    { type: "hello there", marker: "RENDER_PROOF_REPLY" },
    { type: "analyse mes projets", marker: "RENDER_PROOF_HUMAN_DELTA" },
    { type: "laisse Kollio", marker: "RENDER_PROOF_PROVEN" },
  ];
  for (const step of sent) {
    // The text and the Enter go in two writes, and this is not a style choice.
    // A pty coalesces whatever is pending into one read, and Ink parses one read
    // as one keypress: "hello there\r" arrives as a single key whose sequence is
    // the whole string, so `return` is false and nothing is ever submitted. The
    // pause forces the literal and the Return to be delivered separately, which
    // is what a person typing produces.
    term.write(step.type);
    await sleep(500);
    term.write("\r");
    await waitFor(step.marker, 9000);
    await sleep(PAINT);
    shots[step.marker] = strip(raw, cols, rows);
  }
  term.kill();
  await sleep(200);
  return { shots, raw };
}


const SIZES = [[80, 24], [120, 30], [160, 50], [240, 70]];

const only = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const sizes = only.length === 2 ? [[only[0], only[1]]] : SIZES;

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`  FAIL ${msg}`); };

for (const [cols, rows] of sizes) {
  console.log(`\n=== ${cols}x${rows} ===`);
  let result;
  try {
    result = await drive(cols, rows);
  } catch (error) {
    fail(`launch: ${error.message}`);
    continue;
  }
  const { shots, raw } = result;
  const final = shots["RENDER_PROOF_PROVEN"] ?? "";
  // Count in the EMULATED SCREEN, never in the byte stream. Ink repaints on every
  // state change, so a single line appears once per repaint in the raw output and
  // counting there reports the number of frames, not the number of lines.
  const greeting = shots["RENDER_PROOF_REPLY"] ?? "";
  const replies = (greeting.match(/RENDER_PROOF_REPLY/g) ?? []).length;
  if (replies !== 1) fail(`exactly-once: RENDER_PROOF_REPLY rendered ${replies} times, expected 1`);

  // Each marker must be on screen at the step that emitted it. Later steps are
  // checked on their own frame, because the timeline viewport can legitimately
  // scroll an early line away on a short terminal.
  for (const [marker, shot] of Object.entries(shots)) {
    if (!shot.includes(marker)) fail(`marker not on screen when emitted: ${marker}`);
  }

  const visible = render(raw, cols, rows);
  for (const [i, line] of visible.lines().entries()) {
    if (line.length > cols) fail(`horizontal corruption at row ${i}: ${line.length} > ${cols}`);
  }
  if (visible.text().includes("\uFFFD")) fail("broken Unicode in the final frame");

  const hasInput = final.includes("›") || /dis-moi|Ask or do/.test(final);
  if (!hasInput) fail("the input line is not reachable on the final frame");

  console.log(`  markers ok, reply x${replies} on the greeting frame, input ${hasInput ? "visible" : "MISSING"}`);
  console.log("  final frame:");
  for (const line of visible.lines().filter((l) => l.trim()).slice(0, 8)) {
    console.log(`    | ${line.slice(0, Math.min(cols, 100))}`);
  }
}

console.log(`\nRender Proof: ${failures === 0 ? "PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
