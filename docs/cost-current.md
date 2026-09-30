# P2 current observation cost, measured

Re-measured on this machine at P15 (1b89f72), 2026-09-30. `docs/portfolio-cost.md`
measured the same thing at P2.5 and ended at 20.9 s. This file re-runs those
probes, adds the reads P7 to P15 introduced, and states what the existing guard
does and does not catch.

No line of code changed to produce this file. Every number below is an operation
count, not a duration, because the guard in `test/observation-cost.test.ts`
already argues the point and the argument is right: a wall-clock budget lets a
slow machine decide correctness.

## How the numbers were taken

Two instruments, both living outside the repository (nothing under `src/` or
`test/` was touched, and no file in the repo was modified for this measurement):

1. **A counting shim for `node:fs` and `node:child_process`**, installed through
   `module.register` and passed to child processes with `NODE_OPTIONS`. It counts
   `readFileSync`, `readdirSync`, `existsSync`, `cpSync`, `execFileSync` and
   `spawnSync`, and accumulates the bytes handed back by `readFileSync`. It
   measures what the process actually did, including inside subprocesses.
2. **The repository's own git `PATH` shim**, reused unchanged from
   `test/observation-cost.test.ts`, for the cases where only process spawns
   matter.

A prototype wrapper on `SessionStore` was used to count log reads per call site,
by recording the `chat.ts` line number in the stack.

Wall-clock numbers appear where they are the only thing that can be reported
(two unindexed sqlite scans), and are labelled as such.

## Baseline

| Measurement | P2.5 | P15, now | How |
|---|---|---|---|
| Full suite | 20.9 s | **34.4 s to 62.5 s** | `npm test`, 357 tests, 0 fail, four runs |
| Full suite without `test/loadability.test.ts` | (not measured) | **20.8 s** | one file removed |
| `test/loadability.test.ts` alone | not present | **31.9 s** | it was added at P5 |
| `test/loadability.test.ts` without `src/replay.ts` in the import set | n/a | **3.8 s** | `src/replay.ts` renamed away, measured on a throwaway copy |
| Repositories probed per portfolio observation | 45 | **45** | unchanged |
| Git subprocesses per portfolio observation | 180 | **180** | unchanged |
| One cold snapshot | 1.9 to 2.6 s | **2.9 to 3.5 s** | three runs |
| `test/frontier.test.ts` | 4.7 s | **3.3 s** | it stayed fixed |

P2.5's three fixes all still hold. The suite grew by 13.6 s at its fastest and
by 41 s at its slowest, and none of it came from the portfolio. The spread is not
noise to be averaged away: it is two unindexed sqlite scans over a 7.97 GB
database, and N1 is why the suite has them at all.

## Per critical path, before and after

"After" is the cost when the same observation happens once per decision moment
instead of once per call. It is computed from operation counts, and where a
single file is the whole cost it is measured by removing the file.

| Path | Now | Once per decision moment | What the difference is |
|---|---|---|---|
| Suite | 34.4 s to 62.5 s | **20.8 s** measured, best of four runs | `src/replay.ts` is 88 % of `loadability.test.ts`, and `loadability.test.ts` is the suite's critical path |
| `import("src/replay.ts")` | **9,711 fs ops, 153 MiB, 39 registry scans, plus two full-table sqlite scans** | 249 ops, 4 MiB, 1 scan (the sqlite scans stay) | 97 % of the filesystem work, and the whole of the wall clock beyond sqlite |
| Chat banner, one start | **249 fs ops, 248 `SKILL.md` reads, 4.0 MiB** | 248 reads if the registry is memoised per session like the portfolio is | the banner is not free, it is bounded, and the guard does not see it |
| `capabilities` asked twice | **744 `SKILL.md` reads, 8.9 MiB** | 248 reads | the registry has no session memo, unlike the portfolio |
| `durable.list()` on this machine (280 session files) | **561 fs ops: 1 readdir, 280 `existsSync`, 280 `readFileSync`** | 1 readdir for a count, 281 reads for a list | linear in files ever created, and the tests create them |
| One typed line while a goal is staged | **16 whole-log reads, 16 folds** | 5, one per line that needs a state | `readState()` is called once per affordance probe, four times per line |
| One `appendSurface` | **1 whole-log read** (`revision()` reads the file for the last sequence) | not computable without changing the store | see UNKNOWNS |
| `capture()` on a 200-file, 12.8 MiB workspace | **208 fs ops, 2 tree walks, 2 full copies, 200 reads, 12.8 MiB hashed** | 207 ops, 1 tree walk | the second walk answers a question the first already answered |
| `readCapture()` / one verification | **202 fs ops, 200 reads, 12.8 MiB re-hashed** | one re-hash per decision, not per call | repeated `runAgainstArtifact` is 202 ops each, 606 for three |

## The named list: reads added since P7

Each one is a place where the same fact is observed more than once for one
decision. Cost measured, no fix proposed here.

### N1. `src/replay.ts`: the module import is the observation

The worst number in this repository, and it is not in a surface. `replay.ts` is a
top-level script, so importing it runs it:

| Operation | Line | Frequency |
|---|---|---|
| `registryNames()` scans `~/.agents/skills` | 59 | once at import |
| `sqlite3 -readonly COUNT(*)` over the whole `part` table | 65 | once at import |
| `sqlite3 -readonly -json` over 400 text parts | 82 | once at import |
| `new SkillsAdapter(...).listCapabilities()` | **108, inside the loop** | **once per part that declares a requirement** |

Measured, same machine, only `LIMIT` varying:

| `LIMIT` | registry scans | parts declaring a requirement | fs ops | bytes read |
|---|---|---|---|---|
| 1 | 1 | 0 | 249 | 4 MiB |
| 10 | 3 | 2 | 747 | 12 MiB |
| 50 | 8 | 7 | 1,992 | 31 MiB |
| 200 | 29 | 28 | 7,221 | 113 MiB |
| 400 | 39 | 38 | 9,711 | 153 MiB |

The slope is exact: **1 registry scan and 248 fs operations per qualifying row.**
Line 59 already built that scan and threw the `Capability[]` away, keeping only
the names. Line 108 pays for the whole scan again to get the array back.

Two unindexed `sqlite3` scans remain after the loop is removed: 27.1 s with
`LIMIT=1`, 27.0 to 36.1 s at `LIMIT=400`, against a 7.97 GB `opencode.db` with
353k parts in `part`. That is the wall clock, and it is not the filesystem work.

### N2. `src/replay.ts`: importing it can kill the process

Line 60 to 63: if the registry is empty, `process.exit(1)` at module scope. On a
machine with no readable skill registry:

```
HOME=<empty> node -e 'await import(".../src/replay.ts")'   -> status 1
HOME=<empty> node -e 'for (f of allSrcModules) await import(f)'  -> status 1
```

Those are the exact shapes of `LOAD-01` and `LOAD-03` in
`test/loadability.test.ts`. On such a machine both tests fail, and the failure
message says the module "does not load", which is a claim about the code when the
cause is the developer's home directory. The guarantee the file was written for
is conditional on machine state it never names.

### N3. `src/chat.ts:387`: the same fold, four to six times per line

```ts
const readState = () => deriveState(durable.read(sessionId), sessionId, "complete");
const permits = (a: Affordance) => affordancesOf(readState()).some((x) => x.action === a);
```

`permits` is called up to four times per typed line while a goal is staged
(`APPROVE_GOAL`, `REJECT_GOAL`, `CANCEL_SESSION`, `REPLACE_GOAL`), and the
`APPROVE_GOAL` path calls `readState()` twice more for `request.revision` and
`basis`. Each call is a full `readFileSync` of the session log plus a full fold.

Measured per scenario, fresh session root each time:

| Scenario | `SessionStore.read` | of which `revision()` | wall |
|---|---|---|---|
| `exit` | 1 | 0 | 0.19 s |
| `next` | 7 | 2 | 3.5 s |
| `next` + `projects` | 11 | 2 | 2.9 s |
| stage, then exit | 7 | 2 | 0.18 s |
| stage, then ask | 12 | 3 | 0.18 s |
| stage, then cancel | 5 | 2 | 0.19 s |
| stage, then another goal | 12 | 3 | 0.18 s |
| stage, then go | 12 | 4 | 0.20 s |
| stage, then 3 more lines | **22** | 5 | 0.18 s |

Call sites for the 5-line case, from the stack of every `read`:

```
16  chat.ts:387   readState()          the whole log, folded
10  chat.ts:211   durable.revision()   5 calls, each of which reads the file again
 1  chat.ts:235   durable.list()       the session directory
```

So **one keystroke costs up to 6 reads of the whole log**, and the log grows
during the session. It is cheap today (a few KiB) and it is linear in both lines
and log length.

### N4. `src/chat.ts:211`: `revision()` reads the whole log for one number

```ts
const at = durable.revision(sessionId);
durable.append(sessionId, { ...event, seq: at < 0 ? 1 : at + 1, at: Date.now() });
```

`SessionStore.revision()` is `this.read(sessionId).length ? last.seq : -1`: a
whole-file read to return the last sequence number. One per append. The write
path itself is clean (4 ops, no read); it is the numbering that costs a read.

### N5. `src/chat.ts`: the registry has no memo, the portfolio has one

`liveRegistry()` is called at line 252 (the banner, every start), line 562 (every
`capabilities` question) and line 72 (every admission resolution). One scan is
249 fs ops: 1 `readdirSync` plus 248 `readFileSync` of `SKILL.md`, 4.0 MiB, 18 to
55 ms.

| Scenario | `SKILL.md` reads | bytes |
|---|---|---|
| banner only | 248 | 4.0 MiB |
| `capabilities` once | **496** | 8.0 MiB |
| `capabilities` twice | **744** | 12.0 MiB |
| `gate:` once | **496** | 8.0 MiB |

The portfolio, 45 repositories and 180 subprocesses, got a session-scoped memo at
P2.5. The registry, 248 files and 4 MiB, did not. Two observations of the same
kind, handled two ways, and the more expensive one is the one left alone.

This cost is bounded and linear in the number of skills, so it is not a
regression in the sense the portfolio read was. It is named because the guard
below cannot see it.

### N6. `src/chat.ts:235`: `list()` reads every session file to count them

Measured against directories of S synthetic sessions:

| S | ops | `existsSync` | `readFileSync` | bytes read |
|---|---|---|---|---|
| 0 | 1 | 0 | 0 | 0 |
| 1 | 3 | 1 | 1 | 0.5 KiB |
| 10 | 21 | 10 | 10 | 4.5 KiB |
| 100 | 201 | 100 | 100 | 45 KiB |
| 1,000 | 2,001 | 1,000 | 1,000 | 454 KiB |

Linear: 1 readdir plus S existence checks plus S whole-file reads, and it reads
the content to extract an event count, a timestamp and a goal. The banner only
prints `sessions N on disk`.

This machine now holds **280 session files**, so the banner pays 561 fs ops on
every start. The files are created by the tool, one per chat process, and
`test/chat.test.ts` spawns 18 of them per run without overriding
`CUESHEET_SESSIONS`, so the suite grows the directory it then reads. The count on
this machine was 10 before this measurement and 280 after it: the probes below,
the suite, and the tests all contribute.

### N7. `src/adapters/artifact-capture.ts:170` and `:183`: the workspace is walked twice

`capture()` copies the workspace to a staging directory, hashes the staging copy,
and then calls `filesUnder(workspace)` on the **live** workspace to build
`covers`. Measured:

| Workspace | `capture()` ops | `readdirSync` | `readFileSync` | bytes hashed |
|---|---|---|---|---|
| 1 file, 1 KiB | 9 | 2 | 1 | 1 KiB |
| 40 files, 2,560 KiB | 48 | 2 | 40 | 2,560 KiB |
| 200 files, 12,800 KiB | 208 | 2 | 200 | 12,800 KiB |

Two tree traversals where one would do. The hashing is 1x, not 2x, because it
reads the staging copy; the duplication is the traversal, plus the fact that
`covers` and `fileCount` come from two different directories.

That second fact is a property question, not only a cost question: `covers` is
read from the live workspace and `digest` from the copy, so a worker that writes
between the copy and the walk makes the two disagree, and nothing checks that
they agree. I did not inject that race (it needs a concurrent writer and would
have meant writing into a workspace that did not belong to the probe), so it is
recorded as a condition, not a demonstrated defect.

### N8. `src/adapters/artifact-capture.ts:222`: every verification re-hashes everything

`readCapture()` and `verifyCapture()` are the same function with two return
shapes: `existsSync`, one `readdirSync`, and one `readFileSync` per file. One
`runAgainstArtifact` costs 202 ops and 12.8 MiB on the 200-file artifact; three
cost 606 ops and 38.4 MiB. `readCapture` at line 59 of `artifact-verifier.ts` is
the only production caller, so a flow that verifies one artifact three times pays
three full re-hashes.

## What the existing guard does and does not catch

`test/observation-cost.test.ts` was re-run unchanged: **2 tests, 2 pass**. Both
regressions were then injected, on a throwaway copy of the repository, one at a
time.

### R1, the banner reads the portfolio: caught

The exact line `docs/portfolio-cost.md` says was removed was put back:

```
✖ the banner reads nothing
  AssertionError: the banner spawned 180 git calls
  180 !== 0
```

The doc's claim that the count still bites is verified. Good.

### R2, the session memo removed: NOT caught

`observePortfolio()` was changed to re-read on every call, so "on bosse sur quoi"
then "projects" pays the observation twice.

```
measured git calls: next + projects        180 -> 360
                    next + projects + next 180 -> 540
test/observation-cost.test.ts:  2 tests, 2 pass, 0 fail
```

The test is named "the portfolio is read once per session, not once per question"
and its only assertion is:

```ts
assert.ok(counted > 0);
assert.equal(counted % 4, 0, `expected whole repository probes, got ${counted}`);
```

360 is a multiple of 4. **The test cannot fail on the regression it was written
for.** It proves the read was not half-finished. It does not prove it happened
once. This is a decoration, by the definition the context gives.

### The same claim in `test/chat.test.ts` is also a decoration

`it("a portfolio answer is not a count, and a second question does not re-read")`
asserts two regular expressions on stdout and nothing about reads. Its own comment
concedes it: "The behaviour, without the shim". The name promises the count; the
body checks the shape.

### `PORT-05` cannot fail either

`test/portability.test.ts`, `it("no test reaches into this machine's real projects")`:

```ts
if (/homedir\(\)/.test(text)) {
  assert.match(text, /homedir\(\)/, `${name} uses homedir(), which is a machine dependency`);
}
```

If the file contains `homedir()`, assert that it contains `homedir()`. Replaced on
a copy with the honest version (`offenders.push(name)`), the guard names:

```
chat.test.ts, observation-cost.test.ts, portability.test.ts
```

The first two are exactly the two files that read the real machine, and neither
is reported by the guard.

### What `test/chat.test.ts` actually costs against the real machine

One file run, children instrumented:

| Measurement | Value |
|---|---|
| Chat processes spawned | 18 |
| Real git subprocesses | **1,080** |
| Full portfolio observations | **6** |
| `readFileSync` | **12,152** |
| `readdirSync` | 67 |

`say()` at `test/chat.test.ts:19` passes no `env`, so those 18 processes run
against the developer's real `~/projects` and write into the real
`~/.cuesheet/sessions`. Six of the eighteen ask about the portfolio. This is the
defect `docs/portfolio-cost.md` section 1 fixed in `test/frontier.test.ts` and
did not fix here.

## Two live crashes on the decision path

Found by measurement, not by reading, and reproduced from a clean pipe against
the committed file at HEAD (1b89f72), so they are not in the uncommitted working
tree:

`src/chat.ts` references a bare `registry` at lines **131**, **167** and **641**.
There is no declaration of that name anywhere in the module.

```
$ printf 'gate: build a thing\nexit\n' | node src/chat.ts
cuesheet: registry is not defined
exit 1

$ printf 'open cuesheet\ngo\nexit\n' | node src/chat.ts
request Emuo3ci9h asked; the world has not answered, and it failed:
  ReferenceError: registry is not defined
```

Consequences: `gate:` is advertised in `help` and exits the process, and every
goal that reaches `runGoal` fails. Line 131 is unconditional, so the agent loop
has never run from this surface.

`test/integration-path.test.ts:74` is why the suite is green:

```ts
if (!events.some((e) => e.kind === "effect_observed")) return;
```

and the surrounding tests accept "the world failed" as a legitimate outcome, so a
`ReferenceError` in our own code is indistinguishable from a missing API key.
This is the shape `test/loadability.test.ts` was written for, one level down: a
surface that cannot be exercised reports nothing.

## Negative results

Recorded because they are the answer to "did something get worse".

- **The banner does not scan the portfolio.** 0 git calls on start, measured
  directly and by re-running the guard. R1 confirms the guard would notice.
- **The portfolio observation belongs to a decision moment, not a TTL.** It is a
  session-scoped value with no expiry (`src/chat.ts:336`). `next` twice and
  `next` + `projects` both cost exactly 180 git calls; a third question costs 0.
- **`docs/portfolio-cost.md:183` is wrong about the code.** It says "If the world
  changed, the session reads again." Nothing invalidates `portfolioObservation`.
  There is no re-read path inside a session. I did not demonstrate this on the
  real portfolio because doing so means making a real repository dirty.
- **No cache, no warm state.** `snapshotPortfolio()` is still 180 spawns over 45
  repositories. The linear cost P2.5 described is unchanged.
- **`test/frontier.test.ts` still does not read the real portfolio.** 3.3 s.
- **`work.ts`, `verify.ts` and `reconcile.ts` observe nothing.** `readReceipt`
  takes `exists`, `text` and `parsed` as parameters; `verify` and `reconcile` are
  functions of their arguments. 0 fs ops in all three.
- **`ReceiptStore.observe()` short-circuits.** At most 2 `existsSync` and 2
  `readFileSync` per effect, and it stops at the first answer. Reconciliation
  scans nothing it was not asked about.
- **`SessionStore.append()` does not read.** 4 fs ops: open, write, fsync, close.
- **The write path arbitrates correctly.** `appendIfCurrent` costs 9 ops and
  refuses a stale revision on disk with 5, leaving no lock. The cost of the
  guard is one read, and it buys the property P10 exists for.

## Unknowns

- What the honest cost of `revision()` per append is. The sequence number is the
  last line of the file, and the store reads the whole file for it. Any cheaper
  answer changes the store's durability contract, which is not a measurement
  question.
- Whether `covers` and `fileCount` can actually be observed to disagree. The
  condition is a concurrent writer between the copy and the walk. Not injected,
  because injecting it means writing into a workspace the probe does not own.
- Whether any real flow calls `runAgainstArtifact` more than once per artifact.
  Today there is no caller outside tests, so the repeated re-hash in N8 is a cost
  of the API shape and not yet a cost anyone pays.
- Whether the 27 s of sqlite is disk or CPU. Two full-table scans over 7.97 GB,
  measured at 27.1 s with one row scanned and 27.0 to 36.1 s with 400, so the
  scans dominate and the loop is the smaller half at `LIMIT=400`.

## Recommended, not done

Nothing in this file was implemented. In the order the numbers justify:

1. `src/replay.ts` line 108: hold the `Capability[]` that line 59 already built.
   9,711 ops to 249, 153 MiB to 4 MiB, and the suite's critical path stops being
   this file.
2. `src/replay.ts` line 60: the `process.exit(1)` at module scope, so importing a
   module cannot kill the process that imported it and LOAD-01 stops depending on
   the developer's home directory.
3. `test/observation-cost.test.ts:91`: assert an exact count, or a count that is
   not a multiple of the doubled one. The current assertion cannot fail.
4. `test/portability.test.ts` PORT-05: replace the tautology with the report that
   the tautology was hiding. It already names two offenders.
5. `src/chat.ts:387`: one fold per line, not one per affordance probe.
6. `src/chat.ts:252`: the registry memo the portfolio already has, or a decision
   that the banner's count does not need one, said out loud.
7. `src/chat.ts:235`: `list()` for a count.
8. `src/chat.ts:131`, `:167`, `:641`: the three `registry` references. Not a cost
   question, and it is first in this list only because it is first in severity.