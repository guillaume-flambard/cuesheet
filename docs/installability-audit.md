# Installability audit

Date: 2026-09-30. Commit measured: `1b89f72`. Node 24.21.0, npm 11.19.0.
Scope: measure, do not fix. Nothing outside this file was modified.

The repository already draws three lines it refuses to conflate (`README.md:49-53`):

```text
PORTABLE    the code does not depend on the machine it was written on
INSTALLABLE someone can install it without reading the source
PUBLISHABLE we are ready to promise it works on their machine
```

`test/portability.test.ts` holds PORTABLE as a test. This file asks the other
two questions with the same discipline, and answers two of them with a
measurement rather than an opinion.

## The sandbox

Everything below ran with no access to the developer's checkout, home,
registry, sessions or local paths. `npm pack --dry-run` was run in the
repository (it writes nothing, confirmed below); everything else ran in a
throwaway tree under `/tmp`.

```bash
BASE=$(mktemp -d /tmp/cuesheet-install-audit.XXXXXX)   # -> /tmp/cuesheet-install-audit.3KXAJz
mkdir -p "$BASE"/{home,home2,home3,home4,home5,home6,npm-cache,npm-prefix,out,work}
export HOME="$BASE/home"
export npm_config_cache="$BASE/npm-cache"
export npm_config_prefix="$BASE/npm-prefix"
export npm_config_registry="http://127.0.0.1:1/"     # a dead port: no registry is reachable
export npm_config_offline=true
export PATH="$BASE/npm-prefix/bin:$(dirname "$(command -v node)"):/usr/bin:/bin"
```

Isolation checks, so that the word "isolated" means something:

```bash
$ ls "$HOME/projects/tools/cuesheet"
ls: /tmp/cuesheet-install-audit.3KXAJz/home/projects/tools/cuesheet: No such file or directory

$ echo "$PATH" | grep -c "memo/.local/bin"
0 (clean)

$ command -v cuesheet
cuesheet not found
```

That third one matters: on the developer's ordinary PATH, `cuesheet` resolves
to `/Users/memo/.local/bin/cuesheet`, the hand-copied shim. Every measurement
below was taken with a PATH that cannot see it.

Writes stayed inside the fake home. `CUESHEET_SESSIONS` and `homedir()` both
resolved under `$BASE`, so the two session logs the chat produced during the
audit are the only ones it produced:

```bash
$ find "$BASE" -name "*.jsonl"
/tmp/cuesheet-install-audit.3KXAJz/home/.cuesheet/sessions/chat-qxi89dmuo35dag.jsonl
/tmp/cuesheet-install-audit.3KXAJz/home/.cuesheet/sessions/chat-166d67muo35d39.jsonl
```

The repository was not modified. `git status --porcelain` is empty, `HEAD` is
still `1b89f72`, `bin/cuesheet` line 10 is unchanged, and no `*.tgz` was left
behind.

---

## 1. Does `npm pack` work?

**MESURE** pack the repository, both as a dry run and for real, with the
registry pointed at a dead port.

**RESULTAT** OUI. The dry run lists 80 files, 178.2 kB packed, 604.3 kB
unpacked, and writes nothing. The real pack produces a valid gzip tarball.
Packing needs no network, no dependency and no build step.

**PREUVE**

```bash
$ npm pack --dry-run
npm warn gitignore-fallback No .npmignore file found, using .gitignore for file exclusion.
npm notice total files: 80
npm notice package size: 178.2 kB
npm notice unpacked size: 604.3 kB
cuesheet-0.1.0.tgz

$ ls *.tgz
zsh:1: no matches found: *.tgz          # nothing was written

$ npm pack --pack-destination "$BASE/out"
$ file "$BASE/out/cuesheet-0.1.0.tgz"
... gzip compressed data, max compression, original size modulo 2^32 667648
```

## 2. Does local installation work?

**MESURE** install the tarball, globally and locally, into the isolated
prefix, then look for the executable npm should have created.

**RESULTAT** PARTIEL. The files install cleanly. No executable is created, in
either mode, because `package.json` declares no `bin` field. There is no
`files` field either, so npm falls back to `.gitignore` and ships the whole
test suite and all of `docs/` to every consumer.

**PREUVE**

```bash
$ npm install --no-audit --no-fund "$BASE/out/cuesheet-0.1.0.tgz"
added 1 package in 452ms

$ ls node_modules/.bin
ls: node_modules/.bin: No such file or directory

$ npm install -g --no-audit --no-fund "$BASE/out/cuesheet-0.1.0.tgz"
added 1 package in 779ms

$ ls "$BASE/npm-prefix/bin"
ls: .../npm-prefix/bin: No such file or directory

$ PATH="$BASE/npm-prefix/bin:$NODEDIR:/usr/bin:/bin" command -v cuesheet
  NOT FOUND

$ node -e "const p=require('/Users/memo/projects/tools/cuesheet/package.json');
            console.log({bin:p.bin, main:p.main, exports:p.exports, files:p.files, private:p.private})"
{ bin: undefined, main: undefined, exports: undefined, files: undefined, private: true }
```

## 3. Do the public exports load?

**MESURE** import the package three ways from the installed copy, as a real
consumer would.

**RESULTAT** NON. All three fail, for two different reasons.

1. `import "cuesheet"` fails: there is no `main` and no `exports`, so Node
   falls back to `index.js`, which does not exist.
2. `import "cuesheet/src/core/ownership.ts"` fails harder. Node refuses to
   strip types from any file under `node_modules`, with
   `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
3. The `.js` specifier a JavaScript consumer would write fails with
   `ERR_MODULE_NOT_FOUND`, because nothing is compiled.

Point 2 is a wall, not a missing field. It is covered in section 4.

**PREUVE**

```bash
$ node --input-type=module -e "await import('cuesheet')"
Error: Cannot find package '.../node_modules/cuesheet/index.js'
    at legacyMainResolve (node:internal/modules/esm/resolve:202:26)

$ node --input-type=module -e "await import('cuesheet/src/core/ownership.ts')"
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently
unsupported for files under node_modules, for
"file:///.../node_modules/cuesheet/src/core/ownership.ts"
    at stripTypeScriptModuleTypes (node:internal/modules/typescript:189:11)

$ node --input-type=module -e "await import('cuesheet/src/core/ownership.js')"
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../ownership.js'
```

## 4. Does the installed CLI run at all?

**MESURE** run the installed CLI by file path, which is exactly what the shim
does, with both plausible Node flags, then unpack the same tarball outside
`node_modules` and run the identical bytes.

**RESULTAT** NON. This is the finding that decides the audit. The package
ships raw TypeScript, and npm always installs into `node_modules`, and Node
refuses to strip types under `node_modules`. The same source file, on the same
Node, in the same second, works or fails purely on the name of the parent
directory. No flag lifts the restriction.

**PREUVE**

```bash
# the installed CLI, run by path exactly as bin/cuesheet runs it
$ node node_modules/cuesheet/src/cuesheet.ts --version
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: ... for
".../node_modules/cuesheet/src/cuesheet.ts"
exit=0        # note: node exits 0 while printing this

$ node --experimental-strip-types      "$G" --version   # G = .../node_modules/cuesheet/src/cuesheet.ts
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]
$ node --experimental-transform-types  "$G" --version
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]

# same tarball, same node, unpacked OUTSIDE node_modules
$ tar -xzf "$BASE/out/cuesheet-0.1.0.tgz" -C "$BASE/work/unpacked"
$ node "$BASE/work/unpacked/package/src/cuesheet.ts" --version
0.1.0

# the controlled comparison: identical bytes, only the directory name differs
$ cp -R "$BASE/work/unpacked/package/." "$BASE/consumer/node_modules/cuesheet2/"
$ node "$BASE/consumer/node_modules/cuesheet2/src/cuesheet.ts" --version
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]
$ node "$BASE/work/unpacked/package/src/cuesheet.ts" --version
0.1.0
```

The dependency on type stripping is real, not incidental. With it disabled the
same file does not even parse:

```bash
$ node --no-experimental-strip-types src/cuesheet.ts --version
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"
$ node --experimental-strip-types src/cuesheet.ts --version
0.1.0
```

## 5. Do the CLIs find their assets?

**MESURE** ask the CLI for its version with and without `package.json` above
`src/`, and one directory deeper.

**RESULTAT** OUI, conditionally. `version()` reads `package.json` from
`join(here, "..")`, so it needs the shipped layout and resolves it relative to
the module, which means it survives being nested. Copy `src/` alone and
`--version` degrades to the string `unknown` instead of failing loudly.

**PREUVE**

```bash
$ mkdir "$BASE/work/no-pkg" && cp -R .../package/src "$BASE/work/no-pkg/"
$ (cd "$BASE/work/no-pkg" && node src/cuesheet.ts --version)
unknown
$ (cd .../package && node src/cuesheet.ts --version)
0.1.0

$ cp -R .../package/. "$BASE/work/deep/pkg/"
$ (cd "$BASE/work/deep/pkg" && node src/cuesheet.ts --version)
0.1.0          # nesting is fine; it is module-relative
```

A copied-`src`-only install silently answers `unknown`. That is a small
finding, and it is the only asset-lookup weakness found.

## 6. Do the minimal tests pass from an installation?

**MESURE** run the portability suite from the installed copy, then from the
same tarball unpacked outside `node_modules`.

**RESULTAT** NON from an npm install, OUI from a plain copy. Same cause as
section 4: the test files are TypeScript too, so they hit the same wall.

**PREUVE**

```bash
$ cd "$BASE/consumer/node_modules/cuesheet" && node --test "test/portability.test.ts"
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING] ... for
".../node_modules/cuesheet/test/portability.test.ts"
ℹ tests 1   ℹ pass 0   ℹ fail 1

$ cd "$BASE/work/unpacked/package" && node --test "test/portability.test.ts"
✔ PORT-01 core names no machine (2.417459ms)
✔ PORT-02 adapters take their roots from the caller (0.92625ms)
✔ PORT-03 the shim is machine-local, and says so (0.31725ms)
✔ PORT-04 a disposable home with a foreign layout (91.434625ms)
✔ PORT-05 the suite is independent of the machine it runs on (1.919084ms)
ℹ tests 20   ℹ pass 20   ℹ fail 0
```

Control, in the real checkout, unchanged by this audit: 352 pass, 0 fail.

## 7. Is there still a private shim in the package?

**MESURE** list every executable-looking entry in the tarball, then try to use
it on a machine that is not this one.

**RESULTAT** OUI. One shim, `bin/cuesheet`, ships in the tarball. It is a bash
script, not a Node script, and it points at a fixed path on one machine.

**PREUVE**

```bash
$ tar -tzf "$BASE/out/cuesheet-0.1.0.tgz" | grep -Ei "shim|/bin/|\.sh$|install"
package/bin/cuesheet

$ cat bin/cuesheet | sed -n '10p'
CUESHEET_ROOT="$HOME/projects/tools/cuesheet"

$ HOME="$BASE/home3" bash "$SHIM" --version
cuesheet: entry point not found at /tmp/cuesheet-install-audit.3KXAJz/home3/projects/tools/cuesheet

$ cp -R .../package/. "$BASE/home3/projects/tools/cuesheet/"
$ HOME="$BASE/home3" bash "$SHIM" --version
0.1.0

$ cp -R .../package "$BASE/home4/projects/tools/cuesheet-elsewhere"
$ HOME="$BASE/home4" bash "$SHIM" --version
cuesheet: entry point not found at .../home4/projects/tools/cuesheet
```

The shim works, but only when the checkout sits at exactly
`$HOME/projects/tools/cuesheet`. That is the README's install instruction
(`README.md:173-175`) stated more precisely than the README states it.

### 7b. `CUESHEET_ROOT` is not an override

`bin/cuesheet:10` is an assignment, not a default. Whatever the environment
says, line 10 overwrites it. Measured with two checkouts made distinguishable
by their version:

```bash
# shim's own checkout says 0.1.0; the other checkout says 9.9.9-DISTINCT
$ CUESHEET_ROOT="$FAKEHOME/other-copy" bash "$SHIM" --version
0.1.0                      <- env var ignored

# one character class of difference:
$ sed 's|^CUESHEET_ROOT=.*|CUESHEET_ROOT="${CUESHEET_ROOT:-$HOME/projects/tools/cuesheet}"|' ...
$ CUESHEET_ROOT="$FAKEHOME/other-copy" bash "$SHIM-portable" --version
9.9.9-DISTINCT             <- override honoured
```

The repository already knows the right idiom.
`plugin-opencode/cuesheet-shadow.ts:31` writes
`process.env["CUESHEET_ROOT"] ?? "/Users/memo/projects/tools/cuesheet"`. The
shim is the outlier.

**This is a one-line fix, and it is documented here, not applied.** It is also
not sufficient on its own, see section 8.

### 7c. The test that claims to check 7b does not bite

`test/portability.test.ts:195-203` is named "can be pointed at another
checkout through the environment". It asserts that the shim's text contains
`$HOME` or the substring `CUESHEET_ROOT`. A variable name is not a capability.

Regression injected, on a throwaway copy of the repository, never on the real
tree: line 10 was rewritten to hardcode this machine's absolute path, which is
precisely what the enclosing suite header says the test exists to catch ("This
is the one known machine-local path in the repository... It is asserted rather
than tolerated").

```bash
# shim after injection
CUESHEET_ROOT="/Users/memo/projects/tools/cuesheet"

$ node --test --test-name-pattern="PORT-03" "test/portability.test.ts"
  ✔ exists and is executable
  ✔ hardcodes this machine's checkout, which is allowed only here
  ✔ can be pointed at another checkout through the environment
  ✔ the entry point it points at exists
✔ PORT-03 the shim is machine-local, and says so
ℹ tests 4   ℹ pass 4   ℹ fail 0
```

All four pass on a shim that hardcodes `/Users/memo`. The test passes on both
the real shim, which cannot be redirected, and a strictly worse one. It
records nothing about machine-locality. This is the decoration the working
rules name in rule 3.

## 8. Is INSTALLABLE reachable by a one-line fix?

**MESURE** apply the one-line shim fix to the globally installed package and
run it.

**RESULTAT** NON. The one-line fix is real and it is not the blocker. Even
with `CUESHEET_ROOT` honoured, the installed package fails, because pointing
the shim at an npm install points it straight back into the `node_modules`
type-stripping wall of section 4.

**PREUVE**

```bash
# globally installed package, ONLY line 10 changed
CUESHEET_ROOT="${CUESHEET_ROOT:-$HOME/projects/tools/cuesheet}"

$ CUESHEET_ROOT="$BASE/npm-prefix/lib/node_modules/cuesheet" \
    bash "$GLOBAL/bin/cuesheet" --version
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]
exit=1
```

So there are two different gaps, and they are not the same size.

| Gap | Size | What it blocks |
|---|---|---|
| raw `.ts` shipped, npm installs under `node_modules` | needs a build step | any install by npm, local or global |
| no `bin` field in `package.json` | one line | the `cuesheet` command is never linked |
| `bin/cuesheet:10` uses `=` not `:-` | one line | the shim cannot be redirected |
| no `main` / `exports` | one line, plus a build | no library import surface |

The first is the only one that is not a line. Closing it means either shipping
compiled JavaScript, or an `exports` map pointing at a build output. Both are a
build step, and rule 5 of the working rules forbids adding machinery without a
real case. This audit is the real case, and it is recorded rather than acted on.

## 9. Does the README claim more than is true?

**MESURE** check each checkable claim in the README against the measurements
above. Claims that are about design intent are not falsifiable and are not
judged here.

**RESULTAT** one claim is false, two are incomplete, the rest hold.

| README | Claim | Verdict |
|---|---|---|
| `:6` | "no dependencies" | TENUE. `package.json` declares none; PORT-05 asserts it. |
| `:55-56` | "claims PORTABLE, and the claim is a test"; "twenty cases across five invariants" | TENUE. 20 tests, 5 suites, measured twice. |
| `:64-65` | PORT-04 builds a foreign layout and actually reads it | TENUE. Passes in the sandbox with no developer access. |
| `:68` | "PORT-05 no dependency is declared at all, and no test depends on this machine's real projects" | TENUE for the dependency half. The test-half assertion (`portability.test.ts:274-289`) compares `homedir()` against itself and cannot fail. Same defect shape as 7c. |
| **`:75`** | **"the test records it instead of hiding it"** | **FAUSSE.** Section 7c: the test passes on a fully hardcoded shim, and is named for a capability the shim lacks. It hides it. |
| `:76-77` | the install is machine-local, and INSTALLABLE is not claimed | TENUE, and correctly so. This is the paragraph that should have made 7c a known gap. |
| `:99-100` | "bin/cuesheet the PATH shim, copied to ~/.local/bin"; "test/ 352 tests" | TENUE. 352 pass in the checkout. But the tarball ships that shim and no `bin` field, so a consumer who installs by npm gets no command at all. |
| `:146` | a bare `cuesheet` opens the chat | TENUE. Chat opens in the sandbox. |
| `:168` | `--version` prints the version from `package.json` | TENUE, with the section 5 caveat: `unknown` if `package.json` is absent. |
| **`:173-175`** | **"copy `bin/cuesheet` to a directory on your PATH. The shim execs `src/cuesheet.ts` from this repository"** | **INCOMPLÈTE.** It execs from `$HOME/projects/tools/cuesheet`, not from wherever the reader put the repository. Section 7 measured the three cases. |
| `:177-180` | the raw entry points still work | TENUE with a caveat: `cli.ts` and `frontier-cli.ts` reject `--help` as an unknown argument / a missing file, so "works" means "runs", not "documents itself". |
| `:195-196` | a run needs `OPENROUTER_API_KEY`, no unauthenticated fallback | TENUE. `cuesheet: OPENROUTER_API_KEY is not set; there is no local model runtime on this machine`, exit 2. |
| `:156-165` | the subcommand list | INCOMPLÈTE. `resume`, `chat` and `version` exist and are not listed. |
| `:82-100` | the layout block | INCOMPLÈTE. `src/chat.ts`, the default surface, is absent from it. |

The one that matters is `:75`. The README is careful almost everywhere, and it
is careful in the very paragraph where the single false statement sits.

## 10. An unrelated defect found while measuring: a command that exits 0 having done nothing

Not an installability claim, and not mine to fix, but it came out of the
sandbox and it breaks an invariant the repository states, so it is recorded.

Five entry scripts guard their dispatcher with a string comparison between a
resolved URL and a raw path (`src/cli-run.ts:292`, `src/cli.ts:313`,
`src/chat.ts:709`, `src/frontier-cli.ts:133`, `src/worker.ts:97`):

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
```

`import.meta.url` is a resolved realpath. `process.argv[1]` is the path as
typed. Any symlink anywhere in the path makes them differ, the guard is false,
the dispatcher never runs, and the process exits 0 with no output and no write.

```bash
$ ln -s .../cuesheet/src/cli-run.ts "$BASE/home6/cli-run.ts"
$ node "$BASE/home6/cli-run.ts" sessions list
exit=0                       # nothing printed, nothing written

$ node .../cuesheet/src/cli-run.ts sessions list      # realpath, control
chat-0321x5muo359so  events=  0  evidence=0
...

$ ln -s .../cuesheet/src/cli.ts "$BASE/home6/cli.ts"
$ node "$BASE/home6/cli.ts" --root "$PWD"
exit=0                       # ownership report, silently nothing
```

On macOS `/tmp` is a symlink to `/private/tmp`, so any script invoked through
`/tmp` hits this. A symlinked install, which is the normal shape of an
installed command, hits it too. `src/cuesheet.ts` has no such guard, which is
why `test/loadability.test.ts` never saw it, and no test in the suite invokes
these five through a symlink.

A command that exits 0 having done nothing is the one outcome the repository's
own invariant forbids: a command is never success.

## Verdict

```text
PORTABLE     PROUVE    20 tests, 5 invariants, reproduced in a sandbox
                        with no developer home, registry or sessions.
                        One weakness found: PORT-05's test-half and
                        PORT-03's second case assert substrings, not
                        capabilities, and both pass on a regressed input.

INSTALLABLE  NON PROUVE

  by npm     impossible today. Raw .ts under node_modules cannot be run
             or imported, by Node's design. Needs a build step.

  by copy    works, with one precondition the README does not state: the
             checkout must be at $HOME/projects/tools/cuesheet. Making the
             shim honour CUESHEET_ROOT is a one-line change, documented
             in 7b, not applied, and it does not by itself reach an npm
             install.

PUBLISHABLE  a separate claim, and it is further away than it looks.

  - 'private': true' is not a mechanical guard here. npm's own source
    gates it on being a workspace (lib/commands/publish.js:153,
    `if (workspace && manifest.private)`); this package declares no
    workspaces, so a bare 'npm publish' would not be stopped by that field.
    The field records intent, nothing more. Not measured end to end, by
    design: no publish was attempted.

  - the name 'cuesheet' is unowned on npm as far as this audit can tell,
    and the README's description line does not describe a CLI that can be
    installed from a registry.

  - engines says '>=22'. The package requires Node's TypeScript type
    stripping to be on by default. Only Node 24 was available here, so the
    22.x boundary is UNMEASURED, not asserted. What is measured: stripping
    is required (section 4) and nothing type-checks the types. There is no
    typecheck script and no TypeScript dependency, so a type error is
    invisible to 'npm test'.
```

### The smallest gap, named once

Not the shim. The gap is that the package ships TypeScript, and npm's only
install location is a directory Node refuses to strip types in. Everything
else on the list is a single line waiting behind it.

### Machine-local residue outside the audited boundary

One finding, recorded because it is outside what PORT-01 and PORT-02 scan.
`plugin-opencode/cuesheet-shadow.ts:32` hardcodes `SKILL_ROOTS =
["/Users/memo/.agents/skills"]` with no environment override, and lines 29 and
31 also name `/Users/memo`. PORT-01 scans `src/core`; PORT-02 scans
`src/adapters`; the leak check at `portability.test.ts:263-270` scans core and
adapters. `plugin-opencode/` is in none of them, so nothing asserts anything
about it.

Separately, `src/cli-run.ts`, `src/chat.ts`, `src/shadow-report.ts` and
`src/frontier-cli.ts` call `homedir()` and sit in `src/`, which PORT-02 also
does not cover. The entry points do honour `CUESHEET_SESSIONS`
(`chat.ts:54`, `cli-run.ts:28`), which is what kept this audit's writes inside
the sandbox.
