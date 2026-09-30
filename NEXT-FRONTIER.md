# NEXT-FRONTIER

Written by a read-only agent. Nothing in the repository was modified to produce
this file. Every number below was produced by running the repository's own code,
and every "test that fails today" was run.

## The question

What knowledge is still held by a surface, an adapter or a process, when it
should belong to a durable truth?

Method: read every file under `src/` and `src/core/`, `src/adapters/`, then
grep for every exported decision function and check whether anything in `src/`
calls it. Anything with no in-repo caller was read as suspect. Then the eight
areas named in the packet were hunted one at a time, and each finding was run
before being written down.

## Conclusion

No new primitive is justified.

All three admitted candidates are defects in code that already exists, and all
three live in a surface or an adapter rather than in the core. Each fix is
subtraction: read the binding that already exists, ask the core instead of
deciding a second time, read the verdict the log already carries. The admission
rule in the README is not met by any of them, and inventing a fourth primitive
to absorb them would be exactly the speculation the rule refuses.

One of the three is live and severe: the approve path of the installed surface
dies on every machine, today, with a `ReferenceError`.

---

# ACCEPTED 1: the gate is held by the surface, and the surface's copy is dead

## Real scenario

```
cd <any project>
cuesheet
fix the failing test
go
```

## Contradiction, current, with lines

`src/chat.ts:131`, `src/chat.ts:167` and `src/chat.ts:641` read an identifier
named `registry`. There is no declaration of `registry` in the module. The
function that produces it is `liveRegistry()` (`src/chat.ts:66`).

`git log -S'const registry' -- src/chat.ts` names the commit: `55a161c`, today,
"fix: the chat and the run CLI were dropping the registry's own coverage". It
replaced `const registry = liveRegistry()` with `const listing =
liveRegistry()` at three sites and left three readers behind.

Observed, running the real `src/chat.ts` as a subprocess against a throwaway
session root, in a throwaway cwd, with `OPENROUTER_API_KEY` removed:

```text
goal    fix the failing test
request Emuo37eoy asked; the world has not answered, and it failed: ReferenceError: registry is not defined
```

and the durable log that this left behind:

```json
{"kind":"effect_observed","subject":"Emuo37eoy","data":{"effectId":"Emuo37eoy","outcome":"failed","why":"registry is not defined"}}
```

Two more live paths, same defect:

- `gate: <brief>` kills the whole chat: `cuesheet: registry is not defined`
  (`src/chat.ts:641`). The process exits; the session dies with it.
- `!fix the tests`, the owner's override (`src/chat.ts:690`), kills the chat and
  leaves a session file of zero bytes. The highest-authority decision in the
  design produces no durable record at all.

## The second half, which the crash is hiding

`src/chat.ts:431-433`:

```ts
await runGoal(goal, false, durable, cwd);
appendSurface(effectObserved({ effectId: request.id, outcome: "succeeded" }));
clearIt("approved");
```

`runGoal` returns normally, without throwing, in four cases that all mean the
opposite of success: the registry is unverified (`src/chat.ts:133-136`), the
admission blocked (`137-139`), there is no provider (`145-148`), and the agent
loop stopped because it was blocked (`src/core/loop.ts:164-173`, which the chat
never inspects before writing the observation).

Proven by injecting the one missing binding into a copy of `src/chat.ts` placed
outside the repository, then running that copy:

```text
admission: no declared requirements, ready
not running: OPENROUTER_API_KEY is not set, and there is no local runtime on this machine.
```

against this durable record:

```json
{"kind":"effect_observed","subject":"Emuo3gnfj","data":{"effectId":"Emuo3gnfj","outcome":"succeeded","why":null},"seq":3}
{"kind":"evidence","subject":"","data":{"claim":"intention approved","source":"chat-vlx0c7muo3gn7z","goalClosed":true},"seq":4}
```

The stdout and the log contradict each other inside the same run. `succeeded`
was derived from the absence of an exception, and the intention was then
discarded. That contradicts EFF-01 (`src/effects.ts:19-27`), EFF-06
(`src/state.ts:167-176`, the intent survives a refusal) and the invariant that a
command is never a success. This is P7's shape, one branch above, in the same
file.

## Why 352 tests do not see it

`test/chat.test.ts` drives greetings, questions, staging, refusal and the
banner. It never drives `go` and never drives `gate:`. There is also no
`tsconfig.json` and no typecheck script (`package.json:8-11`), so an unbound
identifier is not a build failure either. Nothing in the repository can fail.

## Falsifiable tests

Both fail today.

```ts
// test/chat.test.ts
it("approving evaluates the gate instead of dying", () => {
  const { out } = say(["fix the failing test", "go", "exit"], projRoot);
  assert.doesNotMatch(out, /registry is not defined/);
  const observed = readSession(chatSessionId(out)).find((e) => e.kind === "effect_observed");
  assert.doesNotMatch(String(observed?.data.why ?? ""), /registry is not defined/);
});

it("a refused run is observed as refused, and the intention survives", () => {
  const { out } = say(["fix the failing test", "go", "exit"], projRoot);  // no provider
  assert.match(out, /not running/);
  const events = readSession(chatSessionId(out));
  assert.equal(events.find((e) => e.kind === "effect_observed")?.data.outcome, "failed");
  assert.equal(events.some((e) => e.data.goalClosed === true), false, "EFF-06");
});
```

## Regression injected to prove the test bites

Added `const registry = liveRegistry();` to a copy of `src/chat.ts` outside the
repository and reran. The first test goes green and the second goes red with the
false success quoted above. Remove the binding and the first goes red again.
The pair therefore separates the two defects instead of merging them.

## Smallest fix, no new primitive

Use the listing the function already has (`liveRegistry()` at the two call
sites), and derive the observation from something other than the absence of a
throw: `runGoal` must return what the world answered, and a refusal must append
`failed` and leave the intention staged.

---

# ACCEPTED 2: who may write where is decided twice, and the copy in use omits two of the four rules

## Real scenario

A disposable portfolio, the same shape as PORT-04, built under a temporary root:

- `products/alpha`, a clean repository, with a live session inside it right now
- `tools/beta`, a clean repository, nobody in it
- `clients/gamma`, declared `kind: repo` in `PROJECTS.md`, a plain directory
  with no `.git` at all

Then ask the chat "on bosse sur quoi" and ask `cuesheet projects` at the same
instant.

## Contradiction, current, with lines

`src/adapters/frontier.ts:163-168` decides the whole question in two terms:

```ts
if (p.dirty > 0 || p.ahead > 0) { held.push(...) } else { free.push(...) }
```

`src/core/ownership.ts:158-188` decides it in four, and `src/cli.ts:242-245` is
the only caller of the core. The chat answers from the adapter
(`src/chat.ts:337-343`, `524-531`) and then **stages a goal in the first "free"
project it found** (`src/chat.ts:546-547`, `stageIt("open " + first)`), which
the person can then approve into an unattended writer.

`probe()` also invents the count that authorises a second writer:
`src/adapters/frontier.ts:91-100` returns `dirty: 0, ahead: 0` for a path with
no `.git`, and `run()` at `101-114` turns a failing git call into `""`, which
`Number("" || "0")` makes zero. That is the precise defect `src/cli.ts:125-132`
refuses to commit and that `src/core/ownership.ts:54-66` has a type for
(`observed: false`).

## Two numbers, one tree, one instant

```text
ADAPTER snapshotPortfolio -> free: ["alpha","beta","gamma"]   held: []
CORE    resolveOwnership   -> available: ["tools/beta"]
                             held: ["products/alpha  [session active 0 min ago]",
                                    "clients/gamma     [state could not be observed: git status failed: not a repository]"]
```

On this machine's real portfolio the two happen to agree today (45 projects, 16
free and 29 held in both, no live session), so the divergence is proven on a
disposable tree and is structural in the code, not currently visible in the
numbers.

## Falsifiable test, fails today

```ts
// test/frontier.test.ts, on the PORT-04 disposable layout
it("the portfolio snapshot and the core agree on who may write", () => {
  const tree = disposablePortfolio({ liveSession: "products/alpha", notARepo: ["clients/gamma"] });
  const snap = snapshotPortfolio({ projectsRoot: tree });
  const core = availableProjects(resolveOwnership(projects(tree), sessions(tree), states(tree), { now }));
  assert.deepEqual([...snap.free].sort(), core.map(name).sort());
});
```

Actual today: `["alpha","beta","gamma"]` against `["tools/beta"]`.

## Regression injected to prove the test bites

A copy of `src/` outside the repository, with `snapshotPortfolio` delegating the
decision to `resolveOwnership` and `probe` reporting its own failure:

```text
AFTER INJECTION  adapter free: ["tools/beta"]  held: ["products/alpha","clients/gamma"]
```

identical to the core. Removing only the session term leaves `gamma` wrong,
which proves the two defects are independent and that the test is not passing by
accident.

## Smallest fix, no new primitive

`snapshotPortfolio` reads git and hands the result to the core as a
`ProjectObservation`, and takes sessions as a parameter. The rule already
exists; the adapter is currently keeping a second copy of it.

---

# ACCEPTED 3: the one fold cannot say whether work was verified, so a rejection is invisible to every surface

## Real scenario

A code worker edits a workspace. The runtime freezes it
(`src/adapters/artifact-capture.ts:140`), the oracle runs the tests against the
freeze (`src/adapters/artifact-verifier.ts:51`) and answers REJECTED. The log
records it, because the kind exists (`src/core/store.ts:64`) and P15's own test
writes that event (`test/frozen-artifact.test.ts:325-332`). A person then runs
`cuesheet inspect`, which folds the log through `deriveState`
(`src/chat.ts:601-608`).

## Contradiction, current, with lines

`deriveState` never reads `work_produced` or `work_verified` anywhere in
`src/state.ts:121-217`: `subjectStateOf` returns null for them (302-313),
`proven` reads only `evidence` (157-165), and `spent` keys on
`effect_observed succeeded` alone (170-176). So the fold reads "the intention
was handed to the world" and reports that nothing remains to decide, whether the
work was never checked or was checked and refused.

`test/verification.test.ts:255-262` (VER-06) states the opposite rule: producing
satisfies nothing, and only a verification can. The fold cannot express it.

Measured, decision-relevant fields only:

```text
no verification at all   goal: unknown "the intention was handed to the world and nothing remains to decide"
                         affordances: EXIT, INSPECT
work REJECTED by oracle goal: unknown "the intention was handed to the world and nothing remains to decide"
                         affordances: EXIT, INSPECT
differs?  false
```

## Falsifiable test, fails today

```ts
// test/satisfaction.test.ts
it("a recorded rejection is not the same session as no verification", () => {
  const decide = (evs) => {
    const s = deriveState(evs, "s", "complete");
    return { goal: s.goal, affordances: affordancesOf(s).map((a) => a.action).sort(), subjects: s.subjects, proven: s.proven };
  };
  assert.notDeepEqual(decide(mkLog(null)), decide(mkLog(workVerifiedREJECTED)));
});
```

The trap is real and worth naming: asserting on the whole `SessionState` would
pass today on `events: 3` against `events: 4` and on the `recent` tail, which is
decoration. The assertion has to be about what a surface would decide.

## Regression injected to prove the test bites

One added fold output in a copy of `src/state.ts` outside the repository, reading
the last `work_verified` verdict:

```text
AFTER  differs?  true   (goalVerified: unknown(...) against known "REJECTED")
BEFORE differs?  false
```

## Smallest fix, no new primitive

The event kind is already in the closed vocabulary and `Observed<T>` already
exists. The fold needs to read one event kind it currently ignores.

---

# OBSERVATIONS

Seen and proven, but not admitted: either the contradiction is with no claimed
invariant behind it, or the path has no production caller today.

**O1. `readRequest` drops two fields the log holds.**
`src/effects.ts:123-138` returns an `EffectRequest` without `revision` or
`reconciliationKey`, although both were written (`src/effects.ts:107-110`) and
both are declared on the type (`src/effects.ts:52`, `64`). Measured:

```text
IN THE LOG : {"effectId":"E42","reads":{},"revision":41,"reconciliationKey":"spawn:E42"}
READ BACK  : {"id":"E42","effect":"SpawnAgent","subject":"fix the display","affordance":"APPROVE_GOAL","reads":{}}
```

`test/effect-cycle.test.ts:51-59` builds a request with no `revision` either, so
the type is enforced nowhere. This is the same file ACCEPTED 1 lives in, and it
is what makes P11's "reading this record again after a restart" unserved by the
module that does the reading.

**O2. Nothing writes the reconciliation identity durably.**
`src/spawn.ts:19-20` says the key and the nonce are "written before the world is
touched". `prepare()` writes only `input.json`
(`src/adapters/worker-launcher.ts:74-84`) and `writeStarted` runs after the
spawn (116-123). The only surface that requests an effect
(`src/chat.ts:397-407`) never sets `reconciliationKey` at all. Every effect the
chat requests is therefore permanently unreconcilable: after a crash the log can
say the request exists and nothing can say how to look it up.

**O3. The nonce is not unique to an attempt.**
`src/spawn.ts:47-49` calls it "a value unique to this attempt"; line 75 makes it
`n${effectId}`, a pure function of the effect id. `readReceipt` trusts the
file's nonce for a result (`src/work.ts:149`) and overwrites it with the
caller's for a failure (`src/work.ts:121`), so the two branches disagree about
the same question. Unreachable today: no production code calls `launch()`.

**O4. The worker runtime has no production caller.**
`grep -rn "mintIdentity|readReceipt|workOutcomeOf|reconcile\\(|runAgainstArtifact|capture\\(" src/`
returns definitions only. The chat names an in-process loop `SpawnAgent`
(`src/chat.ts:399`, `src/effects.ts:31`), which is not what `src/spawn.ts:24-26`
says that name means: "this worker, identified by E42, was really launched".
Twelve milestones of runtime with no caller is an admission-rule question, not
a new primitive.

**O5. A staged intention does not survive the process.**
`staged` is a variable (`src/chat.ts:277`) and the affordance branch is gated on
it (353), so the fold's knowledge of a staged intention is unreachable from the
surface. Verified: `exit` closes the staged goal (an `evidence` event with
`goalClosed`), EOF leaves it in the log, and the next process mints a new
session id (201) and opens a different log. The promise at
`src/chat.ts:296-303`, "the person should never have to remember that it exists",
is not kept across processes.

**O6. A root that does not exist disappears.**
`src/cli.ts:238-240` filters `--root` by `existsSync`, so a declared project that
is not on disk is dropped before it can be reported, against `README.md:132`:
"A project absent from the map entirely is also held".

**O7. `exited.json` has no writer** and `exitIsClean` has no caller
(`src/adapters/effect-receipts.ts:123`, `src/spawn.ts:131`).

**O8. Nothing type-checks the repository.** No `tsconfig.json`, and
`package.json:9` is `node --test`, which strips types without reading them.
This is the mechanical reason O1 and ACCEPTED 1 are invisible.

---

# NEGATIVE RESULTS

Hunted for, and already holds:

- A process id cannot resolve to an effect. `isEffectId` requires the `E`
  prefix and `observe` shape-checks the key (`src/adapters/effect-receipts.ts:165-175`,
  `257-265`); `spawn:93812` is refused, not read as an absent effect.
- A directory holding both a result and a failure receipt is `unreadable`, not a
  coin flip (`src/work.ts:102-107`).
- An unobserved project is held, and prints `?` in text and `null` in JSON
  (`src/core/ownership.ts:136-155`, `src/cli.ts:263-265`, `283-284`).
- Reconciliation cannot act: `reconcile` has no executor in scope, and
  `terminalObservation` is the only route from evidence to a terminal event
  (`src/reconcile.ts:101-102`, `160-174`).
- NOT_FOUND, STILL_ACTIVE and INCONCLUSIVE settle nothing and leave the effect
  pending (`src/reconcile.ts:137-149`, `src/state.ts:252-280`).
- The producer's account is never consulted when a verdict is formed, and a
  lying producer still gets REJECTED (`src/verify.ts:177-194`).
- The verifier cannot be handed a live workspace: there is no parameter through
  which it could be, enforced by the shape of the options
  (`src/adapters/artifact-verifier.ts:31-51`).
- Two captures of identical content converge on one artifact id, and since the
  digest covers paths and bytes as well as content, the second capture's `covers`
  is identical, so the ART-02 early return is not a false attribution.
- A refused append leaves the journal byte-identical, advances no revision and
  leaves no lock behind (`test/control-revision.test.ts:100-116`, `243-266`).
- Receipts are written atomically in both writers: temporary name, fsync, rename
  (`src/worker.ts:37-48`, `src/adapters/effect-receipts.ts:97-109`).
- The core imports no path, no I/O module and nothing but its own siblings
  (PORT-01), and no test reads this machine's real projects.
- Baseline at P15 is 352 pass, 0 fail, 68 suites, unchanged by this document.

---

# UNKNOWNS

- Whether ACCEPTED 1 is the only live defect on the approve path. It is the
  first one. Behind it sit a loop the chat cannot see, a second session the chat
  never folds, and the false success proven above.
- Whether anything outside this repository calls `snapshotPortfolio` with
  sessions. Nothing in-repo does, and the signature has no parameter for it.
- Whether the loop's own `blocked` stop is reachable from the chat once the
  binding exists: the gate runs twice, once in the surface and once in the loop,
  and the surface's copy has never executed.
- Whether a forced override is meant to leave a durable trace. Today it leaves
  nothing, and that is an owner decision, not an execution choice.
- Whether `work_verified` is meant to be written by the runtime or by a verifier
  process. The kind exists, no builder does, and the answer changes who is
  allowed to append it.

# NEXT DEPENDENCY

None for the three admitted fixes. Each one is a deletion of a duplicate, not a
new primitive.

One thing is genuinely the owner's: whether an override (`!`) and a refusal must
leave a durable trace, and if so which event kind carries it. That is a decision
about authority, not about execution, and it is the only thing here I am not
entitled to settle.
