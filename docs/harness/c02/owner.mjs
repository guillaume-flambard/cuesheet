// C02 owner oracle (rebuilt 2026-10-06 for IntentLane HEAD c1f915196).
// Read-only on the target: bundles audit-diff.ts into a temp dir, never writes in the repo.
// usage: node owner.mjs <intentlane-root> [--capture]   (--capture writes golden.json, run only on pristine HEAD)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2];
const capture = process.argv.includes("--capture");
if (!root) { console.error("usage: owner.mjs <intentlane-root> [--capture]"); process.exit(2); }

const tmp = mkdtempSync(join(tmpdir(), "c02-oracle-"));
const out = join(tmp, "audit-diff.mjs");
execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, "packages/core/src/audit-diff.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`, "--log-level=error"]);
const { diffAuditDocuments, formatDeltaText, formatDeltaJson } = await import(pathToFileURL(out).href);

const base = JSON.parse(readFileSync(join(root, "packages/core/fixtures/audit-diff/baseline.json"), "utf8"));
const withCat = (v) => {
  const d = structuredClone(base);
  if (v === "absent") delete d.catalogue; else d.catalogue = { ...d.catalogue, version: v };
  return d;
};
// Warn matrix declared from the requirement, never derived from observed output.
const CASES = [
  { id: "27.0->28.0", a: "27.0", b: "28.0", warn: true, names: ["27.0", "28.0"] },
  { id: "27.0->absent", a: "27.0", b: "absent", warn: true, names: ["27.0"] },
  { id: "absent->28.0", a: "absent", b: "28.0", warn: true, names: ["28.0"] },
  { id: "absent->absent", a: "absent", b: "absent", warn: true, names: [] },
  { id: "unknown->unknown", a: "unknown", b: "unknown", warn: true, names: [] },
  { id: "27.0->27.0", a: "27.0", b: "27.0", warn: false, names: [] }
];
const MISSING = /absent|missing|unknown/i;

const results = {};
for (const c of CASES) {
  const delta = diffAuditDocuments(withCat(c.a), withCat(c.b));
  results[c.id] = { text: formatDeltaText(delta), json: formatDeltaJson(delta), scores: delta.scores };
}
const goldenPath = join(here, "golden.json");
if (capture) {
  writeFileSync(goldenPath, JSON.stringify(results, null, 2) + "\n");
  console.log("golden captured for", CASES.length, "cases");
  process.exit(0);
}
if (!existsSync(goldenPath)) { console.error("golden.json missing"); process.exit(2); }
const golden = JSON.parse(readFileSync(goldenPath, "utf8"));

let fails = 0, total = 0;
const check = (ok, msg) => { total++; if (!ok) { fails++; console.log("FAIL", msg); } };
for (const c of CASES) {
  const r = results[c.id], g = golden[c.id];
  check(r.json === g.json, `${c.id}: JSON unchanged`);
  check(JSON.stringify(r.scores) === JSON.stringify(g.scores), `${c.id}: scores unchanged`);
  const gl = g.text.split("\n"), rl = r.text.split("\n");
  // every pristine line must survive, in order, byte for byte
  let i = 0; const extra = [];
  for (const line of rl) { if (i < gl.length && line === gl[i]) i++; else extra.push(line); }
  check(i === gl.length, `${c.id}: all pristine lines preserved in order`);
  if (!c.warn) { check(extra.length === 0, `${c.id}: no warning for same known version (got ${JSON.stringify(extra)})`); continue; }
  const w = extra.filter((l) => l.trim() !== "");
  check(w.length >= 1, `${c.id}: warning present`);
  const joined = w.join("\n");
  check(/warn|not comparable|non-comparable|incomparable/i.test(joined), `${c.id}: warning says comparability is affected`);
  for (const n of c.names) check(joined.includes(n), `${c.id}: warning names version ${n}`);
  if (c.names.length < 2) check(MISSING.test(joined), `${c.id}: warning names the missing/unknown side`);
  check(w.every((l) => !/^score /.test(l)), `${c.id}: score lines not repurposed as the warning`);
}
console.log(`${total - fails}/${total} assertions pass`);
process.exit(fails ? 1 : 0);
