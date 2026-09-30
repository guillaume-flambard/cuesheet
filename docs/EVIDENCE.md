# Evidence

What each milestone actually proved, what it did not, and what nobody knows.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the shape of the system and
[INVARIANTS.md](INVARIANTS.md) for where each law is asserted. This file is the
one that records the failures and the gaps, because a register of only successes
is not an audit.

## The milestone numbering

Milestone numbers come from the first line of each commit body. P0 is inferred,
not stated: the P-series in the commit log is `d3e39f0` .. `1b89f72`, and
`d3e39f0` ("test: guard the banner with a count, and stop a question from eating
a goal") is the commit immediately before `49fae0f`, which is P1. There is no
file in the repository that says "P0", so the label is a reconstruction.

Baseline: `1b89f72` is **352 tests, 0 failures, 0 skipped**, ~52 s. I ran the
whole suite myself at that commit before writing anything, and the number above is
that run, not the one in the commit message. Node >= 22, zero runtime
dependencies.

**Status of the working tree at the time of writing: RED, and not because of this
document.** Another agent is mid-refactor on the five entry-point scripts
(`src/cli.ts`, `src/cli-run.ts`, `src/chat.ts`, `src/frontier-cli.ts`,
`src/worker.ts`), extracting their `import.meta.url` guard into a new
`src/is-entry-point.ts` and adding `test/entrypoint-symlink.test.ts`. While that
was in flight the suite reported failures in `cuesheet.test.ts`,
`delegation.test.ts` and the new symlink test. This file adds three Markdown
files and touches no source.

Every test file cited in `INVARIANTS.md` was re-run individually after that point
and all of them pass: state 16, affordances 13, effects 10, control-revision 10,
reconcile 11, spawn-receipts 16, worker-runtime 13, verification 10,
frozen-artifact 12, portability 20, loadability 6, effect-cycle 3, projections 11.
So the red is confined to the concurrent work, and the citations in this
register are checkable against a green suite once it lands.

## What "verified" means in this file

Three kinds, and they are not interchangeable.

- **Automated** — a named test, in the suite, asserting the property. The
  falsification method is recorded: was the test proven to bite by injecting the
  regression, or is it only asserted?
- **Manual** — verified by a person, on a real terminal, recorded in
  `test/manual/`. Honest label, and the manual file states what it does not cover.
- **Structural** — enforced by a type or by the shape of an API. Not falsifiable
  by a runtime test in the ordinary way.

Where a test was *not* proven to bite, this file says so. There are four such
cases, and three of them are defects the milestones found in their own tests.

---

## P0 — a deterministic observation cost, and a question that does not eat the goal

`d3e39f0` · *test: guard the banner with a count, and stop a question from eating a goal*

**Real problem.** The banner had a 5 s wall-clock budget protecting it, which is
the wrong instrument: 154 ms against 5 s lets a slow CI machine decide
correctness. Separately, asking `projects` while a goal was staged was answered
with `still staged`, because the staged branch treated every non-approval as a
new intention. Asking for information and losing the work on the table is a loss
with no mistake to point at.

**Law.** A deterministic test must not silently acquire new reality. An
observation belongs to a decision moment, not to a TTL.

**Primitive.** `test/observation-cost.test.ts`. A `git` shim on `PATH` that logs
and execs the real `git`, because the chat spawns it through `execFileSync`
inside an adapter and there is no seam to mock.

**Regression test.** `the banner reads nothing` (0 git calls) and `the portfolio
is read once per session, not once per question` (a multiple of 4).

**Falsification.** Injected and recorded: restoring the banner's portfolio read
makes the first test fail with 180. The helper's first version failed in the
useful direction, because no git call means no log file and reading the missing
file threw, so the passing case was the one that broke.

**Counter-example found.** A fourth defect, unrelated to the counting: the
question-eats-the-goal branch above.

**Not proven.** That 180 is the only correct number. The second test asserts
"a multiple of 4", which bounds the cost without pinning it.

**State.** Holds. Measured cost is in `docs/portfolio-cost.md` and is deliberately
not optimised: it is bounded and it is not what is broken.

---

## P1 — a staged intention changes on four things, and the prompt shows it

`49fae0f` · *feat: a staged intention changes on four things, and the prompt shows it*

**Real problem.** The rule that a staged intention changes only on APPROVE,
REJECT, REPLACE_GOAL or CANCEL_SESSION was implied by a branch order, and the
default was wrong twice in one session: once every non-approval discarded the
goal, once every non-approval refused to answer. Separately, a prompt saying only
`cuesheet>` made the user hold a pending commitment in their head.

**Law.** If cuesheet keeps an intention, the user should never have to remember
that it exists.

**Primitive.** A switch rather than a fallthrough, and the pending intention
carried in the prompt, gated on `process.stdout.isTTY`.

**Regression test.** `test/chat.test.ts`: `a question does not touch the staged
goal, in either direction`, `a new goal replaces the old one and says so`, `a
greeting does not discard or announce the staged goal`, `a banner is not a
prompt, and a prompt is not a banner`.

**Proof.** **Manual**, on a pty, recorded in
`test/manual/interactive-staged.md`. This is the honest label: a prompt written to
a pipe is transcript a script reads, so the suite cannot assert on it. The
checklist has seven steps with expected and observed columns.

**Falsification.** Found the hard way: the first version of the prompt recursed
until the stack blew, because the prompt was feeding the stream it was reading.

**Counter-example found.** Two bugs of the author's own: `capabilities` crashed
with `caps is not defined` whenever the registry had more than 30 entries, so it
only appeared on a machine with a full skills directory; and a greeting answered
`still staged`, repeating a goal the prompt already carried.

**Not proven.** The manual file states it directly: the `ok vas-y` branch ends the
session, because approving in that environment starts a real agent run, so the
rendered prompt *around* the approval path is not verified. Colour and cursor
movement are not asserted.

**State.** Holds. 212 tests at the time.

---

## P2 — one event log, two projections

`50d9ef7` · *feat: one event log, two projections, and manual evidence for the prompt*

**Real problem.** The core already had a closed event vocabulary and wrote it to
a file that nothing rendered. There were also three renderers of the same event:
`projections.ts` and a private `eventLine` in `chat.ts`.

**Law.** Two classes rather than a mode flag, because a flag is exactly where a
decoration leaks into a pipe and a script starts parsing a greeting. Neither
renderer can call the other. The machine envelope is fixed: `seq`, `at`, `type`,
`subject`, then the facts, and an absent subject is `null` rather than omitted.

**Primitive.** `src/projections.ts`: `InteractiveProjection`, `MachineProjection`,
`render`, `projectionFor`.

**Regression test.** `test/projections.test.ts`, 11 cases: `both renderings see
the same events`, `the machine rendering is one JSON object per line, and
parses`, `an event with no subject says null rather than omitting the key`,
`the mode is chosen by the caller, and the two cannot call each other`, `the
vocabulary is the core's, not a second copy of it`.

Plus `VIEW-03`, `VIEW-06` in `state.test.ts`.

**Proof.** Automated.

**Counter-example found.** The first observation rendering printed a column of
event *kinds* with no content, which is what the first user called ugly: a list
of categories rather than a log.

**Not proven.** Nothing structural, but the choice to drop `goal` and
`capability` from the live column is a property of the view, not of the record,
and it is not asserted anywhere. A test could pin the omission.

**State.** Holds. 223 tests at the time.

---

## P3 — the state a view renders, and six invariants that it observes nothing

`907c55b` · *feat: the state a view renders, and six invariants that it observes nothing*

**Real problem.** Three things a harness usually mixes were mixed: REALITY (what
was observed), STATE (what the system kept) and VIEW (what a person reads).

**Law.** A view never observes. `unknown != absent`.

**Primitive.** `src/state.ts`: `Observed<T>`, `seen`, `unknown`, `deriveState`,
`stateReport`. `Observed<T>` rather than `T | undefined`, because the difference
between "there is no such fact" and "nobody has looked" is the whole point, and an
unknown carries no `value` at all.

**Regression test.** `test/state.test.ts`, VIEW-01 through VIEW-06 at the time,
now VIEW-01..VIEW-12b's file also holds VIEW-04b.

**Falsification.** VIEW-01 and VIEW-01b were verified by breaking them: importing
`child_process` and adding a `git status` call into the fold fails both. They are
two tests because a module can observe with an import it never calls.

**Counter-example found.** Two. VIEW-04's first version put the evidence on
`tests` and expected `builder` to be done, which is not what the log said: the
fold was right and the test expressed a false intention. Recency is not state, so
an observation carrying the text "waiting for review" does not revive a subject
the evidence already finished. And the `inspect` renderer's "nothing is proven"
line is itself the fix for the third real failure: reporting what the log does
not contain instead of looking for evidence to fill the space.

**Not proven.** VIEW-01 and AFF-01 are source-text greps. They run every commit
and they are defeated by a change the author does not think of as an import.
Nothing rests on one alone, but the honest claim is "no known import", not "no
import".

**State.** Holds. 233 tests at the time.

---

## P4 — affordances derived from the state

`9109edc` · *feat: affordances derived from the state, so no surface decides what is possible*

**Real problem.** The rule that a question never discards a pending intention
lived in the branch order of an interactive loop, and got it wrong twice. A CLI,
a TUI, an API and an agent each need that rule, and none should learn it from
another.

**Law.** The interface never decides what is possible. It shows what the state
allows.

**Primitive.** `src/affordances.ts`: `deriveAffordances`, `affordancesOf`,
`allows`, `AvailableAction`. `consumed` becomes `reads` in P5.

**Regression test.** `test/affordances.test.ts`, AFF-01 through AFF-06.

**Falsification.** AFF-02 is structural rather than reviewed: an unavailable
action is *absent* from the list, not present-and-false, and no affordance carries
an `enabled` flag. AFF-05 was verified with an unknown staged intention: only
`EXIT` and `INSPECT` survive.

**Counter-example found.** Four, three of them the author's own. AFF-06's first
version skipped `EXIT` with an exemption; leaving *does* change the state, so it
has to name what it read, and the honest answer is the empty set. A `switch` was
removed and left an orphaned brace, so `chat.ts` stopped parsing. A hand-written
probe passed `observed:` where the module reads `known:`, so every input looked
unknown, and the author spent several rounds convinced the narrowing was broken
when the runtime was correct from the first version. That probe error became the
rule written into `loadability.test.ts`: *a probe must not hand-build a state the
module already knows how to build*.

**Not proven.** Nothing at the module level. The surface's use of it is P6 and P9.

**State.** Holds. 242 tests at the time. The chat suite is unchanged at 18, which
is the point: the rule moved and the behaviour did not.

---

## P5 — an action names its read-set, and every module has to load

`e211cb2` · *feat: an action names its read-set, and every module has to load*

**Real problem, part 1.** An affordance said whether it was permitted but not
which facts permitted it, so a decision was auditable only after the fact.

**Real problem, part 2.** An orphaned brace stopped `chat.ts` parsing while the
suite stayed green: every chat test spawns the chat as a process and asserts on
its output, so a file that could not be loaded produced empty output, which
matched nothing and failed nothing. The gap was not "a test missed a bug", it was
that a file that cannot be loaded had no test at all.

**Law.** `reads` names the facts consumed. A flat list, deliberately: no graph, no
invalidation, no hashing, because the shape is already enough to ask "was this
still true" and anything richer would be a second truth to keep in step.

**Primitive.** `AvailableAction.reads`; `test/loadability.test.ts` with LOAD-01,
LOAD-01b, LOAD-02, LOAD-02b, LOAD-03.

**Regression test.** `AFF-06` for the read-set; LOAD-01..LOAD-03 for loadability.

**Falsification.** LOAD-01 was verified by removing the guard from `cli.ts` and
watching it fail. Both refusal paths in P10 were verified by deleting the check.

**Counter-example found.** LOAD-01 found two real defects on its first run:
`cli-run.ts` and `cli.ts` both ran their whole dispatcher at import time with no
`import.meta.url` guard, so neither could be imported and nothing noticed,
because every caller spawns them as processes. The first version of the scan
listed `capability.ts` as a sibling of `chat.ts` and reported eight missing
modules that are all in `src/core`: the probe was measuring a layout that could
not exist.

**Not proven.** That every module under `src` is *reachable from the entry point*,
as opposed to importable. LOAD-03 imports each file by absolute URL in a loop, so
it proves importability, not reachability through the dispatcher. The test name
overstates it.

**State.** Holds. 248 tests at the time.

---

## P6 — an effect is asked for and answered, and never both at once

`4678d37` · *feat: an effect is asked for and answered, and never both at once*

**Real problem.** The surface mutated its own state when a person typed a word:
`staged = null` before `runGoal`. That is a command being taken as its own
outcome.

**Law.** Two events, never one. `effect_requested` says what was asked and carries
the affordance and read-set that allowed it. `effect_observed` says what came
back and names the request it answers. A requested effect has three states, and
the load-bearing one is `unobserved`: what a crash between the two events leaves
behind, which is neither success because nobody saw it start nor failure because
nobody saw it refuse.

**Primitive.** `src/effects.ts`: `effectRequested`, `effectObserved`,
`effectStatuses`, `unobservedEffects`, `EffectStatus`. Two new event kinds.

**Regression test.** `test/effects.test.ts` EFF-01..EFF-07; founding scenario in
`test/effect-cycle.test.ts`.

**Falsification.** Not separately recorded for this milestone. The founding
scenario is written as it was specified, and it is a real test on a real store
rather than a mocked world, so the naive answer (drop the goal on failure) fails
it.

**Counter-example found.** Four, two of them in the test itself. The first
version of the founding scenario asserted `requested` *after* an approve that had
already thrown, so it was asserting the wrong intermediate state. The surface
helper never set `staged`, so nothing was ever staged: two faults in a test whose
subject is "the intent survives". And `EFF-07`'s first smoke test was a
decoration: it injected the P8 regression into the surface and every test in the
file still passed, because the seeded worlds resolve instantly and no run ever had
a pending effect to withhold.

**Not proven.** That the *real* chat surface honours EFF-06. `effect-cycle.test.ts`
drives a hand-built `Surface`, not `chat.ts`. The end-to-end version is
`integration-path.test.ts`, added at P7, and even that file states its own limit:
`the failed run kept the intention` returns early if the go was not permitted, so
on a machine with no provider configured the assertion can be vacuous.

**State.** Holds. 261 tests at the time. No retries, no queue, no scheduler: one
effect, `SpawnAgent`, both outcomes observed.

---

## P7 — a pending effect withholds the second go

`515d2bd` · *feat: a pending effect withholds the second go, and saying so is not knowing*

**Real problem.** P7 was half-built: the effects existed and the fold was right,
but nothing consumed the pending state, so `APPROVE_GOAL` was still offered while
a spawn was in flight. The rule existed; nothing read it.

**Law.** Approving is withheld as *absence*, not as a flag, so there is nothing to
render and nothing to select. Everything else survives: a person whose spawn has
not come back must still be able to replace the goal, discard it, or leave.

**Primitive.** `AffordanceInput.pending` as a **required** `Observed<boolean>`. The
requirement is the whole mechanism: an optional one would have let every pre-P7
call site keep compiling while meaning `false`, and the double approval would have
come back without anyone touching the code that allows it.

**Regression test.** `EFF-07b` (`a pending effect removes the affordance that
would repeat it`) and `AFF-04`.

**Falsification.** A `git status` check against a real log containing E42
requested and no observation yields no `APPROVE_GOAL`, while `REJECT_GOAL`,
`REPLACE_GOAL`, `CANCEL_SESSION`, `INSPECT` and `EXIT` all remain. That is a
manual check recorded in the commit, not a test.

**Counter-example found.** Four, three of them the author's own, and the first is
the most instructive in the repository. `EFF-07b` *asserted the opposite of the
requirement*: it said approving stays available "so the second go has nothing to
do", which describes the behaviour before the affordance layer knew about
pending, written as if it were the spec. It passed, because it was true of the old
code. A test can encode the bug it was written to prevent and still be green.

The other three: `allows()` defaulted `pending` to `seen(false)`, which is the
exact claim EFF-07 forbids; `chat.ts` answered `pending: seen(false)` in the file,
a surface claiming not to have looked; and `chat.ts` referenced `sessionId` where
it does not exist, throwing `sessionId is not defined` on the first real `go`,
which 261 unit tests had not caught because they drive pure functions and the
interactive tests stopped at staging.

**Not proven.** The withholding property through the *real* surface. See P6's
note and `integration-path.test.ts`, which is explicit that it does not prove it.

**State.** Holds. 263 tests at the time.

---

## P8 — pending is a fold output, so there is one reading of the log

`2fa3802` · *feat: pending is a fold output, so there is one reading of the log*

**Real problem.** Two truths existed and both were correct:

```text
events -> deriveState()
events -> unobservedEffects() -> affordancesOf()
```

Divergent by construction, identical only by inspection. The `sessionId` bug from
P7 is what that buys: two places to read the same events, one of them exercised
only by a person typing.

**Law.** One reading. `SessionState.pendingEffect` is derived in the fold, and
`affordancesOf(state)` is a function of the state and nothing else.

**Primitive.** `pendingEffect` in the fold; `deriveState(events, id,
completeness)` with completeness required-by-default to `"unknown"`, an enum
rather than a boolean, because a boolean makes a caller write `true` or lie. The
completeness check short-circuits *first*: if the log might be missing its tail,
"no pending effect appears here" is a fact about this file, not about the session.

**Regression test.** `AFF-04`, rewritten as a table of nine real sequences rather
than a comparison of two readings, asserting both directions.

**Falsification.** Recorded as a failure: "my first smoke test injected the P8
regression into the surface and every test in the file still passed."

**Counter-example found.** The positive case in the first version of the AFF-04
table forgot that an empty log has nothing to approve, and the assertion caught
it.

**Not proven.** The claim "there is no `?? false` anywhere in this path" is
maintained by reading, not by a test. A grep-based test would be defeated by any
refactor that changes the spelling, and none was written.

**State.** Holds. 269 tests at the time.

---

## P9 — the intention is an event, so the surface stops knowing what it wants

`26bc41d` · *feat: the intention is an event, so the surface stops knowing what it wants*

**Real problem.** P8 closed one hidden reading and left the next. `staged` was
still a variable in `chat.ts`, and the affordances were handed a state whose
`goal` had been overwritten by a fabricated event sequenced 0:

```ts
const stagedState = deriveState([{ kind: "goal", ..., seq: 0, at: 0 }], ...);
affordancesOf({ ...surfaceState, goal: stagedState.goal })
```

The fold was authoritative about effects and not about the intention, so the
surface still knew something the fold did not. That is the reason this surface
needed a fake event at all.

**Law.** The fold owns "what is this session trying to do", which means it owns
the three ways that answer changes: a `succeeded` observation spends the
intention, a `failed` one does not (EFF-06, now derived rather than asserted by a
surface variable), and a closed intention is *gone* rather than marked closed.

**Primitive.** `stageIt` and `clearIt` as the only two ways the intention changes,
each one an event. `staged` becomes a cache of the log.

**Regression test.** `VIEW-07` through `VIEW-12` in `state.test.ts`; the
ordering assertion in `integration-path.test.ts`.

**Falsification.** Recorded as a failure, twice: "Injecting the splice regression
into `chat.ts` left all 18 chat tests green and all 8 integration tests green."
The splice is invisible to any test that lets the surface stage the goal itself,
because the staged variable and the log then agree, so both readers give the same
answer.

**Counter-example found.** `clearIt` took a reason and wrote an `evidence` claim
the fold does not read as a close, so a cleared intention stayed visible in the
state while the surface believed it was gone: two truths again, disagreeing. The
fix is `goalClosed: true`, and `VIEW-10` is its test. Separately, one test the
author wrote expected `[true, false, false]` for completeness and got `[false,
false, false]`: a spent intention is gone whatever anybody attests, because the
world said it started. The test was measuring the wrong thing.

**Not proven, and stated by the milestone itself.** The splice is detectable in
one direction only. `integration-path.test.ts` asserts the ordering rather than
pretending it could kill the bug directly, and its first test returns early if
the run never reached an effect:

```ts
if (!events.some((e) => e.kind === "effect_observed")) return;
```

That early return makes the test vacuous on a machine where the provider is
unavailable. It is honest about it, and it is still a test that can pass without
asserting anything.

**State.** Holds. 277 tests at the time.

---

## P10 — an affordance is judged at a revision, and committed against it

`6ab6622` · *feat: an affordance is judged at a revision, and committed against it*

**Real problem.** The last hidden knowledge left in the system was the quietest
one: "the state I read is probably still the current state."

```text
A reads seq 41  -> APPROVE allowed
B reads seq 41  -> APPROVE allowed
A commits       -> E42 requested
B commits       -> E43 requested
```

Both decisions were locally valid. `pendingEffect` cannot see it, because pending
only becomes true once E42 is visible, and by then B has already decided. Classic
TOCTOU.

**Law.** `reads` gains a `when` without gaining a graph. The commit is
`appendIfCurrent(expectedRevision, event) -> Event | null`. Null is a refusal, not
an error, and it wrote nothing at all, so the losing surface re-reads rather than
undoing.

**Primitive.** `SessionState.revision` (the sequence of the last event, `-1` for
an empty log); `revision` on every affordance that reads something;
`EventStore.appendIfCurrent` and `SessionStore.appendIfCurrent`.

**Regression test.** `test/control-revision.test.ts`, whole file, with
`the founding case: two approves on the same revision produce one effect` as the
founding test. CON-01, CON-02, CON-06 in `affordances.test.ts`.

**Falsification.** "Both refusal paths were verified by deleting the check: the
founding test and its siblings fail in memory, and the two disk tests fail on the
adapter, so neither layer is passing by accident." This is the best falsification
record in the repository.

**Counter-example found.** Two numbering bugs, both invisible to every other test
because the fold reports the last sequence whatever it is. `revision + 1` wrote a
log starting at sequence 0, because an empty log is at `-1`; the fold then
reported revision 0 while `EventStore` reported `-1` for the same journal, so the
number an affordance carried and the number the append compared against were
different numbers. Fixing that with `revision + 2` left a hole at 2. A log with a
hole is not a log you can reason about: if sequence 2 is missing, "the revision I
read" and "the revision I append at" are different numbers and the whole
guarantee is decorative. Both are now one stated mapping, `at < 0 ? 1 : at + 1`,
with `sequences start at 1 and never leave a hole` as the test.

**The revision is a number, not a state hash**, because the journal is already
sequenced. A hash would detect the same changes and would cost a pass over the
whole log to detect nothing.

**Not proven.** That the `wx` lock file is correct under contention from *other*
processes doing something other than `appendIfCurrent`. The tests use two
`SessionStore` objects in one process, and one test at a time.

**State.** Holds. 290 tests at the time.

---

## P11 — reconciliation acquires evidence, and refuses to acquire more

`fb3dc9b` · *feat: reconciliation acquires evidence, and refuses to acquire more*

**Real problem.** Not retries, not a scheduler, not general robustness. One
situation:

```text
42  EffectRequested E42
    the process really did start
43  nothing, because Cuesheet was gone
```

On restart the log says only that E42 was asked for, and five worlds are
consistent with that.

**Law.** `INCONCLUSIVE` and `NOT_FOUND` exist to stop an inference. A missing or
unreadable status is not a failure: a crashed process leaves a truncated file more
often than it leaves a clean "no", and turning that into `CONFIRMED_FAILURE` is
what lets a retry loop duplicate an effect that ran.

**Primitive.** `src/reconcile.ts`: `reconcile`, `settles`,
`terminalObservation`, `TERMINAL_RECONCILIATIONS`. Pure, two arguments, five
outcomes.

**Regression test.** `test/reconcile.test.ts`, REC-01 through REC-05b.

**Falsification.** REC-02 holds *structurally*: `reconcile` has no executor
parameter, no world handle and two arguments, so a retry would have to be written
somewhere else. The test asserts `reconcile.length === 2` and that four
reconciliations append no events at all.

**Counter-example found.** Two, and the second is the more valuable one. Turning
`unreadable` into a failure was caught immediately. Turning `CONFIRMED_SUCCESS`
into a failure was **not caught at all**, because every earlier test only ever
exercised the failure path. A test that checks one direction of a mapping is not a
test of the mapping. REC-05b now checks both directions and all five non-terminal
answers.

**Not proven, and the milestone says so.** "The suite is green at 301 and the
reconciliation module is not yet wired to a real adapter, which is deliberate. The
fake adapter in `test/reconcile.test.ts` can be wrong the way the world is wrong,
which a real process that always succeeds could not be. A real `SpawnAgent`
reconciler comes after the shape is proven, and it will be the first place
`reconciliationKey` has to be honest."

That is still true of the tree today: `reconcile` is exercised against
hand-built `RealityObservation` values and a fake adapter, not against a real
provider.

**State.** Holds. 301 tests at the time.

---

## P12 — an effect is named before it exists, so a crash can still find it

`c9df77c` · *feat: an effect is named before it exists, so a crash can still find it*

**Real problem.** The trap:

```text
EffectRequested E42   durable
spawn()
PID = 93812          <- obtained after the world changed
crash before writing 93812
```

A pid is not a reconciliation key. It arrives too late to survive the crash that
makes reconciliation necessary, and it is not identity at all: the operating
system reuses process ids, so a pid found tomorrow may be a different program.

**Law.** The identity is minted from the effect id alone, so it is computable
before `spawn()` runs and needs no world, no process and no clock. There is
nothing that can fail between minting it and writing it down.

**Primitive.** `src/spawn.ts`: `mintIdentity`, `workerEnvironment`,
`exitIsClean`. The narrow success contract:

```text
SpawnAgent CONFIRMED_SUCCESS means this worker, identified by E42,
was really launched.
```

**Regression test.** `test/spawn-receipts.test.ts`, the six-case crash matrix plus
KEY-01 through KEY-05.

**Falsification.** The crash matrix is a table with one `it()` per row, and
`none of the six is CONFIRMED_FAILURE by accident` asserts the property that
matters: no path reaches `CONFIRMED_FAILURE` except an explicit `refused.json`,
because "I found no record" and "it refused" are different claims and only one of
them is about the effect.

**Counter-example found.** A real hole found while testing: `spawn:93812` parses
as a spawn key whose effect id is a bare number, and without a shape check it
resolved to an effect that had no receipt, which is `absent`. That is how a
process id gets to masquerade as an identity, and it is now `not_applicable`.
Effect ids are minted with an `E` prefix, so requiring it costs nothing.

Also: an `exited.json` with a non-zero code does not change what the spawn was.
There is a test for exactly that, "because the tempting conversion is a non-zero
exit becoming a failed spawn, which inverts the question".

**Not proven.** That the six cases are the six ways a launch can go unrecorded. The
matrix is a model of the failure space, and a model is not an enumeration. KEY-05
also shows a case the author did not plan: a key this adapter cannot interpret
returns `not_applicable`, which is a seventh shape the matrix does not name.

**State.** Holds.

---

## P13 — a real worker, deterministic, that cannot declare the truth

`436b6a2` · *feat: a real worker, deterministic, that cannot declare the truth*

**Real problem.** There was no worker to measure the runtime against. P12 proved
that launch, liveness and work outcome are three questions, which means `exit 0 ->
success` and `exit 1 -> failure` are both wrong: a worker can exit cleanly having
produced nothing, and can exit badly having produced exactly what was asked.

**Law.** `workOutcomeOf` never reads an exit code. It reads a receipt the worker
wrote about its own output. A process that stops without leaving an outcome leaves
the work unknown, and unknown is not failure.

**Primitive.** `src/work.ts`: `readReceipt`, `workOutcomeOf`, `settlesWork`,
`WorkOutcome`. `src/worker.ts`: the first worker, which imports nothing that could
reach a session store and is handed an identity and one directory.

**Regression test.** `test/worker-runtime.test.ts`, WRK-01 through WRK-07, with
every scenario spawning a real Node process.

**Falsification.** Two injections recorded: having the failure path also write a
result breaks WRK-04, and giving the worker a `SessionStore` import breaks WRK-02.
Scenario C is the founding test: a result becomes durable, Cuesheet dies without
recording it, and a brand new store and a brand new receipt reader find it
afterwards, with the digest checked against the input rather than accepted.

**The distinction this milestone produced rather than assumed:**

```text
a decision goes stale when the state moves    appendIfCurrent(revision)
a fact does not                              appendFact(event)
```

Refusing to record an observed fact because the journal advanced would be
discarding evidence of the world on the grounds that we were busy, which is the
same mistake as the optimistic success three milestones earlier. Both are still
sequenced at the current revision: one log, one sequence, two rules. The test is
`the recovered result is recorded as a fact, not as a decision`, in scenario C.

**Counter-example found.** Three. `worker.ts` had a top-level `await main()`, and
LOAD-01 caught it: the file that acts on the world was also the only file nobody
could import, and so the only file nothing could inspect without side effects. The
first three-worker test ran every worker in honest mode, because the launcher
hard-coded what the worker could be told and there was no way to pass the mode, so
the oracle appeared to work. And a worker that fails while also writing a result
is caught by WRK-04, which is why the failure path was made to write a failure
receipt instead.

**Not proven.** That the worker is safe from anything. It is a deterministic
script with no imports beyond `node:crypto` and `node:fs`, and `WRK-02` checks the
import specifiers with a substring match. A worker is not an agent and does not
pretend to be one; nothing here says what happens when the worker *is* a model.

**State.** Holds. 330 tests at the time.

---

## P14 — the producer is not the authority, and a liar does not change that

`1591789` · *feat: the producer is not the authority, and a liar does not change that*

**Real problem.** P13's worker could be checked by recomputing a digest, which
was a convenient accident rather than a property. An LLM cannot be checked that
way: it can report "I fixed the bug" with a file that is genuinely wrong, or "all
the tests pass" having run nothing.

**Law.** The producer of a result cannot be the authority that establishes the
result satisfies the request. `result.json` means less than success: this worker
asserts it produced this, and here is the artifact the assertion is about.

**Primitive.** `src/verify.ts`: `verify`, `accepts`, `describeVerification`,
`digestOf`, and the narrow `WorkArtifact.artifactDigest` with `claimedSummary` and
`producerClaim` typed rather than dropped, so the compiler can say so.

**Regression test.** `test/verification.test.ts`, VER-02 through VER-06, with the
founding table:

```text
honest -> right result                     -> VERIFIED
wrong  -> well-formed, plausible, false     -> REJECTED
lying  -> false result and "success": true  -> REJECTED
```

**Falsification.** "Making the producer authoritative instead breaks two tests,
including VER-04's, which is the second half of the same property: the work is in
the history either way." The three workers differ only in an environment
variable, so they share identical mechanics and differ only in what they write,
which is the comparison that matters.

**Counter-example found.** The launcher could not pass the mode at all, so every
worker ran honest and the oracle appeared to work. The launcher takes an `env`
override now, and adapters own only the identity.

**VER-03's ordering is the substance**: an artifact that is not the one the target
names is `INCONCLUSIVE`, not `REJECTED`. "This is not what I was asked about" is a
statement about the target, not about the quality of the work, and rejecting it
would let a verifier refuse work for having been superseded. A test makes that
rejection deliberately and the one named for it fails.

**Not proven.** That this generalises to a worker whose output is not a string.
The single requirement kind is `artifact_digest_of`, and the milestone says why:
"A goal contract that can express an arbitrary predicate needs an evaluator, and an
evaluator is another place something has to be trusted." So P14 proves the
architecture on a check that is nearly trivial, and says so. P15 is the first
attempt at a non-trivial check.

**State.** Holds. 340 tests at the time.

---

## P15 — the artifact is frozen, so a verifier can only ever see the freeze

`1b89f72` · *feat: the artifact is frozen, so a verifier can only ever see the freeze*

**Real problem.** A code agent does not produce a `result.json`. It produces a
workspace, and a workspace is mutable:

```text
worker finishes
workspace = A
someone, or another worker, touches it
workspace = B
verifier runs the tests            <- against B
```

Verifying B lets E42 be credited with or blamed for work it never did, and the
verdict still looks entirely reasonable.

**Law.** The runtime copies the workspace once, hashes the copy, and the verifier
only ever runs there. The live workspace can be vandalised afterwards and the
verdict does not move. The digest is computed by the runtime over bytes the
runtime read, so the producer is not the authority over the identity of its own
output either.

**Primitive.** `src/adapters/artifact-capture.ts`: `capture`, `digestDirectory`,
`readCapture`, `verifyCapture`, `COVERAGE_LIMITS`, `CAPTURE_SCOPE`.
`src/adapters/artifact-verifier.ts`: `runAgainstArtifact`, which has no
working-directory parameter, so "verify whatever is there now" is not a call this
API can express. ART-03 is enforced by the shape rather than by a review.

**Regression test.** `test/frozen-artifact.test.ts`, ART-01 through ART-06.

**Falsification.** The founding test is arranged so the naive answer is the
*plausible* one: a worker fixes a real bug in a real fixture repo, the runtime
captures it, the live workspace is then broken on purpose, and the verifier must
still say `VERIFIED`. A verifier reading the workspace says `REJECTED`, which is
what a reasonable person would answer. "Changing the verifier's working directory
to `process.cwd()` breaks that test and two others, so the property bites rather
than merely reading true."

**ART-06 in three shapes:** a capture that is gone, a capture whose bytes no
longer match its own digest, and a runner that could not start or was killed. All
three are `INCONCLUSIVE`. "An oracle that reports its own crash as the work's
failure is worse than no oracle, and a check about bytes it cannot identify is not
a rejection."

**The claim stays narrower than the tempting one, and `doesNotCover` is a field
rather than a paragraph:**

```text
PROVABLE       the state of the declared workspace, after the worker finished
NOT PROVABLE   the entirety of that worker's effects on the machine
```

So the threat model is `untrusted semantically`, not `hostile process with
unrestricted OS access`. An OS sandbox stays a separate milestone for a real need.

**Counter-example found.** Two of the author's own, both of the same kind as the
last four milestones. The code worker took one `dir` and used it for both the
receipt directory and the workspace, so it was fixing a file under the receipt
store and the capture of the real workspace saw an untouched bug; ART-02 and
ART-04 failed for a reason that had nothing to do with either. And two tests
called `cleanup(b)` *above* assertions about bytes on disk, so a deleted root made
a capture look corrupted when it was simply gone. Both are now ordered, and the
ordering is commented so the next person does not reintroduce it.

**Not proven.** The largest gap in the repository, and the milestone is explicit
about it: `COVERAGE_LIMITS` lists three things the capture cannot prove, and the
test `a capture says what it covers and what it does not` only asserts that the
list is *non-empty*, not that it is accurate. There is no test that a worker
which wrote outside its declared workspace is detected, because it cannot be: the
runtime does not observe the machine. The claim is a declaration, honestly
labelled, and the field exists so a reader can see the boundary rather than infer
it.

**State.** Holds. 352 tests, 0 failures.

---

## Cross-cutting findings from this audit

Four things that are true of the repository as a whole and are not visible from
any single milestone.

**1. Seven source-text assertions carry the purity claims.** `PORT-01`,
`VIEW-01`, `VIEW-01b`, `AFF-01`, `WRK-02`, `LOAD-01` and the `verify.ts`
event-builder grep all read source and match patterns. They run every commit and
they are all defeated by a change the author does not think of as an import. The
honest claim is "no known import", not "no import". Nothing in the repository
rests on one of them alone, and that is the mitigation.

**2. Three test files can pass vacuously, and say so.** `integration-path.test.ts`
returns early in two of its six tests when the run never reached an effect;
`effect-cycle.test.ts` drives a hand-built surface, not `chat.ts`; and
`EFF-07b`'s first version asserted the opposite of its own requirement. The
first two are documented limits; the third was found and fixed. A vacuous pass
that is documented is a different thing from one that is not, and only the first
two are documented.

**3. `reconcile` is still not wired to a real adapter.** P11 says so and it is
still true. Every `RealityObservation` in the suite is hand-built. The first real
one will be the first place `reconciliationKey` has to be honest.

**4. Two event fields are written to the log and never read back.**
`effectRequested` writes `revision` and `reconciliationKey` into `event.data`
(`src/effects.ts:108-109`), and `readRequest` (`src/effects.ts:123`) reads neither
of them, so `effectStatuses(...).get(id).request` returns a request with
`revision: undefined` and `reconciliationKey: undefined`. Verified by running the
round trip:

```text
written to log : {"effect":...,"revision":41,"reconciliationKey":"spawn:E42"}
read back      : {"id":...,"affordance":...,"reads":{...}}
revision round-trips       : false
reconciliationKey survives : false
```

This is not a test failure: every current test constructs its own `EffectRequest`
object rather than reading one back from the log, so nothing observes the loss.
The field comments say a request "outlives the process that made it" and that
"a decision nobody can audit is not a record", which is the intent; the reader
does not currently deliver it. Whether this matters depends on whether the
production path is meant to reconstruct requests from the log after a restart,
which P11's founding scenario does not yet do.

**5. A comment in the launcher claims a boundary no code enforces.** Recorded here
because it is the one place where a source comment, read as a claim, is stronger
than the tests behind it. `src/adapters/worker-launcher.ts:99` says "The worker's
only writable surface. WRK-02: it is handed a directory and an identity, and the
session store is not reachable from either." The launcher spreads `...process.env`
into the child two lines earlier, so the worker inherits `HOME` and runs as the
launching uid. WRK-02 asserts that the worker's *imports* contain nothing that
could reach the store, which is true, and an import is not a capability.
[threat-model.md](threat-model.md) states the same boundary from the other side and
reaches the same conclusion: the path namespace is fully reachable, and nothing
here confines a process. The comment should be corrected; no test is missing,
because no test can assert a confinement that the runtime does not implement.

---

## What we do not know

Required section, and it is the one an audit exists for.

- **Whether any of this survives contact with a real LLM worker.** Every worker
  in the suite is a deterministic script. The threat model says `untrusted
  semantically`, and the architecture is built for it, but no LLM has ever been
  run through this chain. P14's liar is a fixture that writes a fixed string.
- **Whether a capture's `doesNotCover` list is complete.** Three entries are
  declared; nobody has enumerated the ways a worker could affect the machine.
- **Whether the `wx` lock is correct against real contention.** All tests are
  single-process, sequential.
- **Whether `reconcile`'s five outcomes are the right five for a real provider.**
  The matrix is a model of the failure space, and `not_applicable` turned out to
  be a seventh observation kind the matrix does not name.
- **What P16 will be.** The README names `drift` (a document and a repository
  disagreeing) as the next primitive, and the OS sandbox as a separate milestone
  for a real need. Neither has a problem statement yet.
- **What CON-04, CON-05, AFF-07, AFF-08, VER-01, VER-05, KEY-06 and EFF-08 were.**
  They appear in no file. AFF-07 and AFF-08 are contradicted by a commit message
  that attributes a real, PROVED property to a label that does not exist. Either
  the numbering has holes or a milestone wrote labels it did not implement.
- **Whether the milestone numbering itself is authoritative.** P0 is inferred
  from position, and no file in the repository contains the string "P0".
- **How much of the 52 s suite is real.** `chat.test.ts` and
  `observation-cost.test.ts` dominate; the costs are measured and bounded, and
  deliberately not optimised.
- **Whether `pending` is required everywhere it should be.** P7 made it a required
  parameter to stop pre-P7 call sites silently meaning `false`, and the type
  enforces it. But a caller can still pass `seen(false)` without having looked,
  and `AFF-08` was the label for that and does not exist. The type prevents the
  *default*; it cannot prevent the *lie*.
