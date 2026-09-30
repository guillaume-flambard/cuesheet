#!/usr/bin/env bash
# The shipped build. tsc, and three layout fixups it cannot do itself, each one
# asserted before the build is allowed to succeed.
#
# Why the fixups exist, and why they are not a framework:
#
#   1. tsc has no shebang emitter. `bin` points at a file, npm runs that file
#      directly, so `dist/src/cuesheet.js` needs one.
#   2. `rewriteRelativeImportExtensions` rewrites `./x.ts` IMPORT SPECIFIERS.
#      The dispatcher table in src/cuesheet.ts holds the same filenames as
#      string DATA (`file: "cli.ts"`), and a type stripper has no idea that is a
#      path. Ten entries stay `.ts` and point at files the build never emitted.
#   3. `version()` reads package.json from `join(here, "..")`, which from
#      `dist/src/` is `dist/package.json`. The build output has to carry one.
#
# Fixup 2 is the one to argue about. The honest alternative is a one-line change
# in src/cuesheet.ts, which this script does not own. See
# docs/installability-proof.md, "The fixup that should not be here".
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
DIST="$ROOT/dist"
TS="5.9.3"
NODE_TYPES="24"

# The type checker is a build tool, not a dependency: installed with --no-save
# so package.json keeps declaring none, which test/portability.test.ts asserts.
if [ ! -x node_modules/.bin/tsc ]; then
  echo "build: installing the compiler, not saving it" >&2
  npm install --no-save --no-audit --no-fund "typescript@$TS" "@types/node@$NODE_TYPES" >&2
fi

# dist/ is removed rather than overwritten in place: a renamed or deleted
# source file leaves an orphan behind, and an orphan .js in a shipped tree is a
# file nothing checks. Scoped and asserted, because a build script is the last
# place that should hold a wide delete.
DIST="$DIST" node --input-type=module -e '
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
const target = resolve(process.env.DIST);
const expected = join(resolve(process.cwd()), "dist");
if (target !== expected) throw new Error(`refusing to remove ${target}: expected ${expected}`);
rmSync(target, { recursive: true, force: true });
'

# tsc exits 1 on type errors. It still emits, and the source has type errors
# that predate this build (docs/installability-proof.md, "The type check that
# was never run"), so the exit code is recorded rather than obeyed. The count is
# asserted by test/install.test.ts, which is where a regression in it is caught.
TS_VERSION="$TS" DIST="$DIST" node_modules/.bin/tsc -p tsconfig.build.json > "$ROOT/.typecheck.log" 2>&1 || true
TYPE_ERRORS=$(grep -c "error TS" "$ROOT/.typecheck.log" || true)
echo "build: tsc emitted dist/, $TYPE_ERRORS type errors (see .typecheck.log)" >&2

# --- fixup 1: the shebang bin needs -----------------------------------------
JS="$DIST/src/cuesheet.js"
[ -f "$JS" ] || { echo "build: $JS missing, tsc did not emit" >&2; exit 1; }
{ printf '#!/usr/bin/env node\n'; cat "$JS"; } > "$JS.tmp" && mv "$JS.tmp" "$JS"
chmod +x "$JS"

# --- fixup 2: the dispatcher's filename table, and fixup 3: dist/package.json -
# Both are one pass, and the pass verifies itself: every target the table names
# must exist in dist, or the build fails here rather than at install time.
DIST="$DIST" node --input-type=module -e '
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const dist = process.env.DIST;
const js = join(dist, "src", "cuesheet.js");

// fixup 2
const before = readFileSync(js, "utf8");
const after = before.replace(/(file:\s*")([^"]+)\.ts(")/g, "$1$2.js$3");
if (before === after) throw new Error("fixup 2 matched nothing: the dispatch table is not the shape this build was written against");
writeFileSync(js, after);

// fixup 3: the smallest package.json that makes dist/src ESM and gives
// `cuesheet version` something true to read. Generated from the root one so the
// version has a single source.
const root = JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf8"));
writeFileSync(
  join(dist, "package.json"),
  JSON.stringify({ type: "module", version: root.version, license: root.license, engines: root.engines }, null, 2) + "\n",
);

// verify: every filename the dispatcher names now exists, as JavaScript
const named = [...after.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
const missing = named.filter((f) => !existsSync(join(dist, "src", f)));
if (missing.length) throw new Error("dispatch table names files the build did not emit: " + missing.join(", "));
if (named.length === 0) throw new Error("the dispatch table parsed empty; the verification below would pass on nothing");

// verify: no EXECUTABLE TypeScript anywhere in dist, at any depth. A .d.ts is a
// declaration, not something node can be asked to run, and the oracle asks for
// declarations, so those are not what this is looking for.
const walk = (d) => readdirSync(d).flatMap((e) => {
  const p = join(d, e);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const ts = walk(dist).filter((p) => p.endsWith(".ts") && !p.endsWith(".d.ts"));
if (ts.length) throw new Error("dist still carries executable TypeScript: " + ts.map((p) => p.slice(dist.length)).join(", "));
console.error(`build: dispatcher names ${named.length} files, all present; dist carries no executable .ts`);
'

echo "build: ok" >&2
