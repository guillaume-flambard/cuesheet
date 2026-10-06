// Proves the owner oracle is satisfiable and rejects wrong implementations.
// Works on a scratch copy of IntentLane core, never on the target repo.
// usage: node adversaries.mjs <intentlane-root> <scratch-dir>
import { cpSync, rmSync, mkdirSync, symlinkSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [root, scratch] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const ref = join(scratch, "ref");
rmSync(ref, { recursive: true, force: true });
mkdirSync(join(ref, "packages"), { recursive: true });
cpSync(join(root, "packages/core"), join(ref, "packages/core"), { recursive: true });
symlinkSync(join(root, "node_modules"), join(ref, "node_modules"));
const file = join(ref, "packages/core/src/audit-diff.ts");
const orig = readFileSync(file, "utf8");
const anchor = "  lines.push(\n    `summary";
if (!orig.includes(anchor)) throw new Error("anchor not found");
const vers = "  const bv = delta.baseline[0]?.catalogue?.version, cv = delta.candidate[0]?.catalogue?.version;\n";
const msg = "`warning: catalogue versions are not comparable (baseline ${bv ?? \"absent\"}, candidate ${cv ?? \"absent\"}); score changes may reflect catalogue growth`";
const variants = {
  reference: { expect: 0, code: vers + `  if (!bv || !cv || bv === "unknown" || cv === "unknown" || bv !== cv) lines.push(${msg});\n` },
  naive_inequality_only: { expect: 1, code: vers + `  if (bv !== cv) lines.push(${msg});\n` },
  always_warn: { expect: 1, code: vers + `  lines.push(${msg});\n` },
  score_tamper: { expect: 1, code: vers + `  if (!bv || !cv || bv !== cv) lines.push(${msg});\n  if (lines[1]) lines[1] = lines[1].replace("/100", "/99");\n` },
  json_tamper: { expect: 1, code: vers + `  if (!bv || !cv || bv !== cv) lines.push(${msg});\n`, json: true },
  warning_without_versions: { expect: 1, code: vers + `  if (!bv || !cv || bv !== cv) lines.push("warning: catalogue not comparable");\n` }
};
let bad = 0;
for (const [name, v] of Object.entries(variants)) {
  let s = orig.replace(anchor, v.code + anchor);
  if (v.json) s = s.replace("JSON.stringify(delta, null, 2)", "JSON.stringify({ ...delta, note: 1 }, null, 2)");
  writeFileSync(file, s);
  let code = 0, out = "";
  try { out = execFileSync("node", [join(here, "owner.mjs"), ref], { encoding: "utf8" }); }
  catch (e) { code = e.status; out = e.stdout; }
  const last = out.trim().split("\n").pop();
  const ok = code === v.expect;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "BAD "} ${name}: exit ${code} (expected ${v.expect}) ${last}`);
}
writeFileSync(file, orig);
process.exit(bad ? 1 : 0);
