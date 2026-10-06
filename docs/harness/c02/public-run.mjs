// C02 public run driver (rebuilt 2026-10-06). Drives ONLY terminal input through a real PTY on the
// installed `cuesheet` shim. Everything it does is recorded in <run>/events.jsonl.
//
//   node public-run.mjs <run-number>       start a run; stays alive until {"quit":true}
//   append JSON lines to <run>/actions.jsonl:  {"send":"text"} {"key":"enter|esc|up|down|tab|ctrl-c"}
//                                              {"wait":ms} {"quit":true}
//   read <run>/screen.txt (xterm-rendered current screen) after each action and every 2 s.
//
// The run directory holds: a fresh clone of the actual IntentLane HEAD, a private registry
// (PROJECTS.md) that names only that clone, private sessions, the pinned owner check.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const reports = join(homedir(), "projects/_reports/cuesheet-c02-2026-10-06");
const n = process.argv[2];
if (!n || !/^\d+$/.test(n)) { console.error("usage: public-run.mjs <run-number>"); process.exit(2); }
const run = join(reports, `public-${n}`);
if (existsSync(run)) { console.error(`${run} exists; use a new number (failed runs are retained)`); process.exit(2); }
mkdirSync(run, { recursive: true });

const source = join(homedir(), "projects/products/intentlane");
const projects = join(run, "projects");
const clone = join(projects, "products/intentlane");
mkdirSync(dirname(clone), { recursive: true });
execFileSync("git", ["clone", "--quiet", "--local", source, clone]);
const head = execFileSync("git", ["-C", clone, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
writeFileSync(join(projects, "PROJECTS.md"), [
  "| Name | Path | Kind | Status | Nature | Stack |",
  "|---|---|---|---|---|---|",
  "| intentlane | products/intentlane | repo | active | tool | TypeScript / pnpm / App Intents |",
  ""].join("\n"));

const IMAGE = execFileSync("docker", ["images", "--no-trunc", "cuesheet-node-capsule:local", "--format", "{{.ID}}"], { encoding: "utf8" }).trim();
const oracle = join(here, "owner-capsule.mjs");
if (!readFileSync(oracle, "utf8").includes(IMAGE)) { console.error("owner-capsule.mjs is pinned to a different image; rebuild with build-capsule-oracle.mjs"); process.exit(2); }

const sessions = join(run, "sessions");
mkdirSync(sessions, { recursive: true });
const env = {
  ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor",
  CUESHEET_PROJECTS_ROOT: projects, CUESHEET_SESSIONS: sessions,
  CUESHEET_PROVIDER: process.env.C02_PROVIDER ?? "opencode", CUESHEET_MODEL: process.env.C02_MODEL ?? "opencode-go/gpt-5.6-luna",
  CUESHEET_VERIFY_SCRIPT: oracle,
  CUESHEET_TOOL_MODE: "container", CUESHEET_TOOL_IMAGE: IMAGE, CUESHEET_TOOL_SOCKET: join(homedir(), ".docker/run/docker.sock")
};
writeFileSync(join(run, "setup.json"), JSON.stringify({ head, source, clone, image: IMAGE, model: env.CUESHEET_MODEL, oracleSha256: execFileSync("shasum", ["-a", "256", oracle], { encoding: "utf8" }).split(" ")[0], started: new Date().toISOString() }, null, 2));

const tools = join(reports, "tools");
const pty = createRequire(join(repo, "apps/terminal/package.json"))("node-pty");
const { Terminal } = createRequire(join(tools, "package.json"))("@xterm/headless");
let cols = 120, rows = 40;
const term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 2000 });
const child = pty.spawn(join(homedir(), ".local/bin/cuesheet"), [], { cwd: run, name: "xterm-256color", cols, rows, env });
let raw = "", pending = Promise.resolve();
const events = (e) => appendFileSync(join(run, "events.jsonl"), JSON.stringify({ t: new Date().toISOString(), ...e }) + "\n");
child.onData((s) => { raw += s; appendFileSync(join(run, "terminal.ansi"), s); pending = pending.then(() => new Promise((r) => term.write(s, r))); });
child.onExit((e) => { events({ exit: e }); setTimeout(() => process.exit(0), 300); });
const screen = async () => {
  await pending;
  const buf = term.buffer.active, out = [];
  for (let y = 0; y < rows; y++) out.push(buf.getLine(buf.viewportY + y)?.translateToString(true) ?? "");
  const text = out.join("\n").replace(/\n+$/, "") + "\n";
  writeFileSync(join(run, "screen.txt"), text);
  return text;
};
const KEYS = { enter: "\r", esc: "\x1b", up: "\x1b[A", down: "\x1b[B", left: "\x1b[D", right: "\x1b[C", tab: "\t", "ctrl-c": "\x03" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const actions = join(run, "actions.jsonl");
writeFileSync(actions, "");
let offset = 0, buffered = "";
events({ ready: true, run, head });
console.log(JSON.stringify({ run, head, model: env.CUESHEET_MODEL }));
setInterval(() => { screen(); }, 2000);
(async () => {
  for (;;) {
    await sleep(300);
    const size = statSync(actions).size;
    if (size <= offset) continue;
    const chunk = await new Promise((res) => { let b = ""; createReadStream(actions, { start: offset, end: size - 1, encoding: "utf8" }).on("data", (d) => (b += d)).on("end", () => res(b)); });
    offset = size; buffered += chunk;
    const lines = buffered.split("\n"); buffered = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      let a; try { a = JSON.parse(line); } catch { events({ badAction: line }); continue; }
      events({ action: a });
      if (a.send !== undefined) child.write(a.send);
      if (a.key) child.write(KEYS[a.key] ?? "");
      if (a.wait) await sleep(a.wait);
      if (a.resize) { [cols, rows] = a.resize; term.resize(cols, rows); child.resize(cols, rows); }
      await sleep(400); await screen();
      if (a.quit) { child.kill(); await sleep(500); process.exit(0); }
    }
  }
})();
