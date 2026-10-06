// Generates owner-capsule.mjs: the same assertions as owner.mjs, self-contained for the
// no-network, read-only node capsule (node 24, no esbuild, no node_modules).
// TypeScript is loaded by node's type stripping; a sync resolve hook maps ./x.js to ./x.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const image = process.argv[2];
if (!/^sha256:[a-f0-9]{64}$/.test(image ?? "")) { console.error("usage: build-capsule-oracle.mjs sha256:<image id>"); process.exit(2); }
const golden = readFileSync(join(here, "golden.json"), "utf8").trim();
const owner = readFileSync(join(here, "owner.mjs"), "utf8");
const body = owner.slice(owner.indexOf("const base = JSON.parse"), owner.indexOf("const results = {};"))
  .replace(/join\(root, "packages\/core\/fixtures\/audit-diff\/baseline.json"\)/, 'join(root, "packages/core/fixtures/audit-diff/baseline.json")');
const checks = owner.slice(owner.indexOf("let fails = 0"));
const script = `// cuesheet-check-v1: ${JSON.stringify({ executor: "container", image, outputs: [], temporaryStorage: "tmpfs" })}
// C02 owner oracle, capsule form. Immutable once pinned. Judges observable audit-diff output only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
const root = process.cwd();
registerHooks({ resolve(spec, ctx, next) {
  try { return next(spec, ctx); } catch (e) { if (/^\\.\\.?\\/.*\\.js$/.test(spec)) return next(spec.replace(/\\.js$/, ".ts"), ctx); throw e; }
} });
const { diffAuditDocuments, formatDeltaText, formatDeltaJson } = await import(pathToFileURL(join(root, "packages/core/src/audit-diff.ts")).href);
${body}
const results = {};
for (const c of CASES) {
  const delta = diffAuditDocuments(withCat(c.a), withCat(c.b));
  results[c.id] = { text: formatDeltaText(delta), json: formatDeltaJson(delta), scores: delta.scores };
}
const golden = ${golden};
${checks}`;
writeFileSync(join(here, "owner-capsule.mjs"), script);
console.log("owner-capsule.mjs", script.length, "bytes");
