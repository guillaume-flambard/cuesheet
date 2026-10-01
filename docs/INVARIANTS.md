# Invariants

Every law this repository believes, and where it is asserted.

## How to read this file

Each entry names an invariant id, the file and the test that carries it, and what
the test actually asserts. Every citation was checked by opening the test file and
reading the assertion, not by matching the id in a comment.

Two labels are used and the difference is the whole point of the document:

- **PROVED** — a named test exists, the invariant appears in that test's title or
  body, and the assertion is there. This is not the same as "the code is correct";
  it means the claim is falsifiable today and a regression would be caught.
- **PROPOSED** — the law is stated in a source comment or in the README but no
  test carries the id. Either the property is enforced structurally (by a type or
  by the shape of an API) and needs no test, or it is genuinely untested. Each
  PROPOSED entry says which.

Ids that appear in a comment but in no test are listed together in
[Untested ids](#untested-ids) rather than being quietly dropped.

## How a test proves something

Two techniques are used and they are not interchangeable.

**By injection.** The test breaks the property and checks that a named test fails.
Examples: `VIEW-01` verified by importing `child_process` into `state.ts`;
`LOAD-01` verified by removing the `import.meta.url` guard; `WRK-04` verified by
making the failure path write a result as well.

**By construction.** The property is structural, so the test reads the code and
asserts on its shape rather than on its behaviour. Examples: `AFF-01` reads
`affordances.ts` and greps for `Date.now`; `WRK-02` reads the worker's source and
checks its import specifiers; `REC-02` asserts `reconcile.length === 2`.

A third form deserves its own warning, because it has already produced two
decorations in this repository: a test that injects the regression into a
*surface* rather than into the module, where the seeded world resolves instantly
and nothing is ever pending. Both are recorded in `EVIDENCE.md` under P8 and P9.

---

## VIEW — the state a view renders, and what a view may do to it

File: `test/state.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| VIEW-01 | `rendering performs no observation` | PROVED | `state.ts` and `projections.ts` contain none of `execFileSync`, `spawnSync`, `readFileSync`, `existsSync`, `readdirSync`, `snapshotPortfolio`, bare `new Date`, `Date.now(`, `Math.random(` |
| VIEW-01b | `the state module imports nothing that could observe` | PROVED | every relative import in `state.ts` is `./core/store.ts`, and there is no `from "node:` at all |
| VIEW-02 | `unknown stays unknown` | PROVED | `deriveState([]).goal.known === false`, `"value" in state.goal === false`, and `why` matches `/no goal/` |
| VIEW-03 | `human and machine views derive from the same state` | PROVED | both projections render `state.recent`; the machine lines parse and their `seq` values equal `state.recent`'s |
| VIEW-04 | `recent events are history, not current state` | PROVED | a trailing `observation` carrying text does not revive a subject the evidence finished; `running === 0`, `recent.length === 3` |
| VIEW-04b | `the fold is pure, so a second call agrees with the first` | PROVED | `deriveState(events)` twice, deep-equal after JSON round-trip |
| VIEW-05 | `a known value is distinguishable from an absent one` | PROVED | `seen(3).known === true`; `unknown().known === false`; `unknown("git failed").why` matches `/git failed/` |
| VIEW-06 | `pipe output carries no presentation-only state` | PROVED | no machine line has a key matching `/prompt\|staged\|message\|help/i`, and no line contains `cuesheet>` or `go?` |
| VIEW-07 | `a staged intention is in the log, so the surface need not know it` | PROVED | `deriveState([goal(1)], "s", "complete").goal.value` deep-equals `{ text, open: true }` |
| VIEW-08 | `a failed effect leaves the intention to decide` | PROVED | after request + `failed` observation, the goal is still `{ text, open: true }` and `pendingEffect.value === false` |
| VIEW-09 | `a succeeded effect spends the intention` | PROVED | after request + `succeeded`, `goal.known === false` and `why` includes `"handed"` |
| VIEW-10 | `a discarded intention does not come back as staged` | PROVED | after `goalClosed: true`, `goal.known === false` and `why` includes `"closed"` |
| VIEW-11 | `an observation naming an effect nobody requested spends nothing` | PROVED | an `effect_observed` for `E99` with no request leaves the goal open |
| VIEW-12 | `the last intention wins` | PROVED | three goals, the last one's text is the folded goal |

Unnumbered but load-bearing in the same file:

- `the human report reads a state and never a source` — `stateReport` states an
  absent goal as `goal unknown: no goal`, an empty subject list as
  `subjects none in this log`, and no claims as
  `proven nothing carries both a claim and its evidence`.
- `the fold counts only what it saw` — `events === 3`, `subjects.length === 1`,
  `running === 1`: no invented idle entry, no double count.

---

## AFF — affordances derived from the state

File: `test/affordances.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| AFF-01 | `affordances are a pure function of the state` | PROVED | source contains no clock or I/O call, every import specifier starts with `.`, and `deriveAffordances(stagedOpen)` twice deep-equals |
| AFF-02 | `an unavailable action is absent, not merely flagged` | PROVED | `APPROVE_GOAL` absent with nothing staged; no affordance carries an `enabled` or `available` key |
| AFF-03 | `rendering an affordance observes nothing` | PROVED | the `AFFORDANCE_LABEL` block contains no `git`, `registry` or `portfolio` |
| AFF-04 | `affordances are a function of the state, and of nothing else` | PROVED | a table of nine real sequences; pending known-true withholds `APPROVE_GOAL`, pending unknown withholds it, pending known-false with an open goal offers it. Both directions, so a function that never offers approving cannot pass |
| AFF-05 | `an unknown state enables nothing that mutates the intent` | PROVED | with `staged: unknown()`, only `EXIT` and `INSPECT` survive |
| AFF-06 | `an action that mutates names the precondition it read` | PROVED | every `mutates` action's `reads` keys are in `{staged, stagedOpen, hasSession}` and every value is `"known"`; `EXIT` reads `{}`; `APPROVE_GOAL` reads exactly `{ staged, stagedOpen }` |
| AFF-09 | `the two surfaces cannot disagree, because there is only one reading` | PROVED | `affordancesOf(state)` called twice on one state deep-equals, and `APPROVE_GOAL` is absent when an effect is pending |

Unnumbered in the same file:

- `the answering actions come as a set, never as a wall` — all four of
  `APPROVE_GOAL`, `REJECT_GOAL`, `REPLACE_GOAL`, `CANCEL_SESSION` present
  together.
- `a closed goal is not approvable` — `open: false` withholds `APPROVE_GOAL` but
  keeps `REPLACE_GOAL`.
- `allows() asks the same question the list answers` — including the refusal for
  an unattested log: `allows(deriveState(events, "s", "incomplete"), "APPROVE_GOAL")
  === false`.

---

## SW — the shared work state, and the rebase it must prove

Files: `test/work-state.test.ts`, `src/work-state.ts`, `src/work-context.ts`,
`src/work-worker.ts`. Spec: [SW-01-shared-work-state.md](SW-01-shared-work-state.md).

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| SW-01 | `the same events project the same state, twice` | PROVED | `projectWork` is a pure fold; two reads of one log `deepEqual`. The empty log is revision -1 and agrees with the store's own answer, CON-06 |
| SW-01 | `it reads the six event kinds the core session fold deliberately ignores` | PROVED | `effect_requested`/`effect_observed`/`work_produced`/`work_verified`/`action`/`note` all reach the state. If it only read what `toSession` reads, it would be a second reading of the same thing |
| SW-01 | `a claim is not the evidence for it` | PROVED | a model's own `observation` becomes a `Claim` and closes no goal |
| SW-01 | `a task that was never answered is asked, never failed` | PROVED | a request with no observation is `asked`. There is no `failed` in `TaskState`, so an unobserved world cannot be reported as a refusing one |
| SW-01 | `an artifact nobody checked is not checked, and not a failure` | PROVED | `work_produced` alone gives `verdict: null`, never a rejection |
| SW-01 | `a decision whose basis was not recorded says so` | PROVED | an `action` with no `against` reads back as `null`, not 0 |
| SW-02 | `a worker commits at the revision it read` | PROVED | the commit carries `against: basis` and the store's revision advanced by exactly the one event |
| SW-03 | `THE CRUX: the human bumps the revision, the commit is refused, the worker rebases and continues` | PROVED | full sequence: read at 1, a human directive lands at 2, `appendIfCurrent(1)` returns `null` and the revision stays 2, the worker re-reads, re-derives `focus Spotlight instead` from the directive it just read, and that is the only decision in the log. `"keep going on the parser"` appears nowhere |
| SW-03 | `a worker that reads a stale basis and commits is refused, and step() rebases for it` | PROVED | the same window from inside one step: `outcome.kind === "rebased"`, `from: 1`, `to: 3`, the committed decision records `against: 2`, and no event carries `against: 1` |
| SW-03 | `a log that never stops moving exhausts the budget rather than spinning` | PROVED | a producer that appends on every attempt returns `exhausted` at 3 attempts |
| SW-03 | `a producer that declines records nothing, and that is not a failure` | PROVED | `declined` is its own outcome and the revision does not move. `committed` and `exhausted` are not merged into it |
| SW-04 | `each sees the other's output through the state, and neither is given the other` | PROVED | two workers over one log; B reads A's decision from the projection, and both expose exactly `subject`, `read`, `step` |
| SW-04 | `a new worker picks up where a dead one left off, without the transcript` | PROVED | goal, decision, artifact and open question all readable from 4 events by a worker with no reference to the first |
| SW-05 | `a worker's step ends at the boundary, and what it already appended stays` | PROVED | after a `stop` directive the worker takes no further step, the only new event is the directive, and the earlier decision is intact rather than rolled back |
| SW-06 | `WORK-04 no worker-to-worker channel exists anywhere in the work layer` | PROVED | a channel vocabulary scan over the three modules with comments stripped, plus `TemporaryWorker`'s member list read off the interface. Verified to fail when a `readonly inbox: string[]` is added |
| SW-06 | `WORK-05 the work layer imports nothing that could observe` | PROVED | no `node:` import, no `homedir`/`cwd`/`env`, no `/Users/`, no `Date.now`/`Math.random` in any of the three |
| SW-06 | `WORK-07 the state carries no field that is always empty` | PROVED | `SharedWorkState` has no `contextSources` member and its key set is exactly the nine the fold produces |
| SW-06 | `WORK-06 nothing under src/core was touched by this slice` | PROVED | `work-state.ts` imports exactly one specifier, `./core/store.ts`, and constructs no store |

### What SW does not prove

Recorded rather than left to be discovered, because `docs/EVIDENCE.md:1054-1058`
lists "multi-agent runtime semantics" under NOT YET NEEDED and this slice does
not overturn that: it adds no scheduler, no coordinator and no runtime
supervision.

- **No real concurrency was observed.** The two workers are interleaved by hand
  in one process, deterministically. Cross-process contention on one file is
  covered by `test/control-revision.test.ts:154-268` and
  `test/store-adversary.test.ts`; SW adds nothing to those.
- **`SessionStore.appendIfCurrent`'s thrown refusals are unhandled.** A held lock
  and a damaged journal throw rather than return `null`
  ([store-adversary.md](store-adversary.md):437-441), and `step()` does not catch
  them. No observed failure yet says what a worker should do about a damaged
  journal, so no recovery policy was invented.
- **The rebase loop is bounded by attempts, not convergence.** Three is a budget
  a test can reach, not a proof that three suffices.
- **`SharedWorkState` carries no context sources**, because the frozen core has no
  event kind that could carry one. `WORK-07` asserts the absence so it is a
  recorded decision rather than an oversight.

---

## CON — the decision/revision boundary

Files: `test/control-revision.test.ts`, `test/affordances.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| CON-01 | `every action that reads something names the revision it read` | PROVED | an action with a non-empty `reads` has `revision === input.revision` and it is a number; an action with an empty `reads` has `revision === null` |
| CON-02 | `the revision an affordance carries is the one the fold reported` | PROVED | with a real `EventStore`: after one append `state.revision === 1` and every affordance carries 1; after a second append the revision is 2 and `APPROVE_GOAL` carries 2 |
| CON-06 | `an action that reads nothing is explicitly revision-independent` | PROVED | `EXIT.revision === null` for all three inputs, and its `reads` deep-equals `{}` |
| CON-06 | `the empty journal is revision -1, and saying 0 is a lie` | PROVED | `EventStore("s").revision === -1`, `deriveState([]).revision === -1`, and `appendIfCurrent(0, ...)` returns `null` |

The founding test of the milestone, `the founding case: two approves on the same
revision produce one effect`, is the whole property in one case: two controllers
read the same state, both find `APPROVE_GOAL`, A's `appendIfCurrent` wins, B's
returns `null`, exactly one `effect_requested` exists with `effectId === "E2"`,
`"E3"` appears nowhere, and B's re-read now withholds the action.

Supporting tests in the same file, no id:

- `a refusal leaves the journal byte-identical` — a refused append changes
  nothing and does not advance the revision.
- `the file is the thing both processes contend on` — two `SessionStore` objects
  over one root; B is refused even though it never touched A's object, and the
  file ends at revision 2, not 3.
- `a stale revision is refused on disk even when the file looks unchanged`.
- `the lock is released, so the next writer is not locked out forever` — three
  successive writes produce sequences 1, 2, 3, 4.
- `a refused append on disk leaves no lock behind`.
- `sequences start at 1 and never leave a hole` — the `at < 0 ? 1 : at + 1`
  mapping, after two real bugs where the log started at 0 and then skipped 2.
- `a folded revision equals the store's own revision for the same file` — and a
  commit against the folded revision is accepted and lands at `folded + 1`.

---

## EFF — an effect asked for, and what came back

File: `test/effects.test.ts`, with the founding scenario in
`test/effect-cycle.test.ts` and the end-to-end shape in
`test/integration-path.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| EFF-01, EFF-02 | `the log is the only writer` | PROVED | a request appended through the store gets `seq 1`, an observation `seq 2`, both at the injected timestamp |
| EFF-03 | `a request and its observation are two facts` | PROVED | two events, kinds in order, and `events[0].data.outcome === undefined`: the request asserts nothing |
| EFF-04 | `a failure never produces the state a success produces` | PROVED | a failure carries `why`; a success does not carry the failure shape |
| EFF-04b | `an observation with no request resolves nothing` | PROVED | an `effect_observed` for `E99` yields `statuses.size === 0` |
| EFF-05 | `an effect keeps the affordance and read-set that allowed it` | PROVED | `status.request.affordance === "APPROVE_GOAL"` and `status.request.reads` deep-equals `{ staged, stagedOpen }` |
| EFF-06 | `an intent survives the failure of the effect meant to carry it` | PROVED | after request + `failed`, `status === "failed"` and the log contains **zero** `goal` events: the failure did not fabricate one |
| EFF-07 | `a requested effect with no outcome stays unobserved` | PROVED | `unobservedEffects(...).length === 1`, `status === "requested"`, and not equal to `failed` or `succeeded` |
| EFF-07b | `a pending effect removes the affordance that would repeat it` | PROVED | `offered(true)` excludes `APPROVE_GOAL`; `offered(false)` includes it |

Founding scenario, `test/effect-cycle.test.ts`:

- `an intent survives its effect failing, then runs when the world agrees` — the
  surface helper records the request *before* calling the world, so a throw still
  leaves both events; the intention survives the throw, is spent on the second
  success, and the goal becomes a running subject.
- `a request with no outcome is still a request after a reload` — rebuilt from the
  log alone with no clock and no world; `status === "requested"`, not guessed in
  either direction, and the request is still auditable (affordance and read-set
  intact).
- `a pending effect does not permit a second approval of the same intent`.

End to end against the real binary, `test/integration-path.test.ts`:

- `a go writes a request and an observation, both readable by the fold` — exactly
  one of each, ids matched, both carrying `seq` and `at`.
- `the failed run kept the intention, in the log and in the fold` — the person is
  told `still staged`.
- `an unresolved intention needs an attested log; a spent one never does` —
  `[false, false, false]` across all three completeness levels.
- `an open intention needs an attested log before a second go is offered` —
  `[true, false, false]`: only a `complete` log offers the second go.

---

## REC — what happened to an effect nobody watched

File: `test/reconcile.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| REC-01 | `not-found is not failure` | PROVED | `absent` maps to `NOT_FOUND`, is not `CONFIRMED_FAILURE`, does not settle, and `terminalObservation` returns `null` |
| REC-02 | `reconcile cannot perform the effect again` | PROVED | `reconcile.length === 2`; four reconciliations append **zero** events and manufacture **zero** observations |
| REC-03 | `inconclusive stays inconclusive` | PROVED | `unreadable` and `no_key` both map to `INCONCLUSIVE`, neither settles, and neither justifies an observation |
| REC-05 | `reconciling twice cannot produce contradictory terminal outcomes` | PROVED | two contradicting observations both stay in the log in order, and the fold reads the first, so the state does not flip |
| REC-05b | `reconciliation only ever justifies the answer the evidence gives` | PROVED | success maps to `{ outcome: "succeeded" }`, failure to `{ outcome: "failed", why }`, and all five non-terminal answers to `null`. Written because a test checking one direction is not a test of the mapping |

Supporting:

- `each reality maps to exactly one result, and none is invented` — seven
  observations in, five outcomes out, and no sixth result is reachable.
- `still running settles nothing and says why`.
- `reconcile is pure, so the same evidence gives the same answer`.
- `the founding case: reload, reconcile, and stay honest` — the full sequence
  across a crash, ending with the intention spent and the status fold agreeing
  with the state fold.
- `a failed spawn, confirmed after a crash, keeps the intention` — EFF-06 across
  a restart.
- `a key that resolves to nothing is reported honestly, not as success` — the
  sentence says `does not mean it failed`.

---

## KEY — identity before effect

File: `test/spawn-receipts.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| KEY-01 | `the key exists before anything about the effect does` | PROVED | `mintIdentity("E42")` derives `reconciliationKey` from the effect id alone, with no world, process or clock involved |
| KEY-02 | `the world receives exactly this identity, by name` | PROVED | the worker's environment contains exactly the five `CUESHEET_*` keys, and `CUESHEET_EFFECT === "E42"` |
| KEY-03 | `an identity obtained after the effect is not the recovery key` | PROVED | a pid is recorded as an observation about the effect and is never the key |
| KEY-04 | `a proof of launch and a live worker are two facts` | PROVED | `observe` returns the launch proof and whether the worker answers; the caller prefers the live worker as the more recent fact |
| KEY-05 | `an effect with no key stays INCONCLUSIVE` | PROVED | a request with no `reconciliationKey` reconciles to `INCONCLUSIVE`, not to a terminal outcome |

The crash matrix is a table test, `describe("the crash matrix")`, with
`it(`${c.name} -> ${c.expected}`)`:

```text
no directory at all      -> NOT_FOUND
started.json unreadable  -> INCONCLUSIVE
started, worker alive    -> STILL_ACTIVE
started, worker gone     -> CONFIRMED_SUCCESS
refused.json             -> CONFIRMED_FAILURE
no key                   -> INCONCLUSIVE
```

and `none of the six is CONFIRMED_FAILURE by accident`, which is the assertion
that no path reaches that outcome except an explicit refusal.

Also in this file:

- `a receipt belonging to another effect is not read as this one`.
- `an exit receipt never changes what the spawn was` — a non-zero `exited.json`
  does not convert the launch into a failure.
- `an unreadable receipt is not absence`.
- `a receipt store refuses a path that would escape its root`.

---

## WRK — the first worker, and the three questions

File: `test/worker-runtime.test.ts`. Every scenario spawns a real Node process.

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| WRK-01 | `a launched worker that produced nothing still confirms the spawn` | PROVED | a `started.json` with no worker behind it still reconciles to `CONFIRMED_SUCCESS` |
| WRK-02 | `it imports nothing that could write to a session` | PROVED, with a gap | the worker's source has no import specifier containing `store`, `state` or `effects`; its only imports are `node:crypto`, `node:fs` and `node:path`. **Gap:** this is an import check, not a confinement check. See the note after the table. |
| WRK-02 | `it refuses to run without an identity to file a receipt against` | PROVED | run with no `CUESHEET_EFFECT`, it exits 2, says `refusing to run without`, and writes no receipt |
| WRK-02 | `it is given a directory and an identity, and nothing else` | PROVED | the environment key list is exactly the five expected |
| WRK-03 | `a worker that fails writes a failure receipt, and the exit code is beside it` | PROVED | exit code 1 **and** `CONFIRMED_FAILED`, where the `why` is `ENOENT`: the outcome came from the receipt, not the code |
| WRK-04 | `the spawn stays confirmed and the work outcome stays unknown` | PROVED | a `SIGKILL`ed worker leaves `CONFIRMED_SUCCESS` for the launch and `INCONCLUSIVE` (why: `no outcome receipt`) for the work |
| WRK-06 | `a truncated result.json settles nothing` | PROVED | half a `result.json` gives `INCONCLUSIVE`, never success and never failure |
| WRK-06 | `a result and a failure together settle nothing` | PROVED | the only shape where the reader refuses to pick a winner |
| WRK-06 | `a receipt describing a different effect settles nothing` | PROVED | `result.json` claiming `E99` inside `E49`'s directory is `unreadable` |
| WRK-07 | `re-reading a result gives the same outcome every time` | PROVED | two reads of one receipt deep-equal, and the outcome is `CONFIRMED_COMPLETE` both times |

And the founding test of P13, scenario C:

- `a result durable before the crash is recovered after the restart` — a brand new
  store and a brand new receipt reader find the result, and the recorded digest is
  checked against the input rather than accepted.
- `the recovered result is recorded as a fact, not as a decision` — at the same
  stale revision, a decision is refused (`null`) and a fact is written anyway,
  sequenced at the current revision. This is the `appendIfCurrent` / `appendFact`
  asymmetry, and this is its test.

### What WRK-02 does not prove

The worker's *imports* are clean. Its *reach* is not, and a comment in the launcher
overclaims the difference. `src/adapters/worker-launcher.ts:99` reads:

```ts
// The worker's only writable surface. WRK-02: it is handed a directory and
// an identity, and the session store is not reachable from either.
```

The first clause is true of what is handed. The second is true only of the path
namespace, and the same object spreads `...process.env` into the child (line 96),
so `HOME` arrives, the process runs as the launching uid, and nothing prevents it
from opening a path under the session root by name. The test cannot see this: it
reads import specifiers, and an import is not a capability.

What WRK-02 does establish is narrower and still worth having: the shipped worker
has no *code path* to the session store, so it cannot declare a goal met. What it
does not establish is that no worker could. That is a property of the OS, not of
this file, and [threat-model.md](threat-model.md) states the gap with the same
wording: "What is proven is that the path namespace is fully reachable."

This is recorded as a gap in WRK-02 rather than as a defect in the test, because
the test asserts exactly what it claims to assert. The overclaim is in the
comment, and the comment is not code.

---

## VER — the producer is not the authority

File: `test/verification.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| VER-02 | `a producer claiming success changes nothing` | PROVED | the same wrong artifact with and without a `success: true` claim is `REJECTED` both ways; the claimed run carries a `producer_claim_ignored` evidence line and the unclaimed run does not |
| VER-03 | `an artifact that moved is INCONCLUSIVE, not rejected` | PROVED | a target digest that differs yields `INCONCLUSIVE` with both `target_digest` and `actual_digest` in the evidence, and the sentence says `still unknown` |
| VER-03 | `an artifact from another effect is INCONCLUSIVE` | PROVED | a mismatched `effectId` yields `INCONCLUSIVE` and the evidence says `belongs to E-one` |
| VER-04 | `the production and the rejection are both in the history` | PROVED | the log reads `["effect_requested", "work_produced", "work_verified"]` in order; the production event still says `all checks pass`, its false claim preserved verbatim |
| VER-06 | `VERIFIED is necessary and a goal is not satisfied by production alone` | PROVED | a matching digest verifies, a moved target accepts nothing, and changing the requirement changes the answer |

The founding table test is `honest -> VERIFIED, wrong -> REJECTED, lying ->
REJECTED`: three real processes differing only in an environment variable, so
they share identical mechanics and differ only in what they write.

Supporting, no id:

- `the verifier hashes the input itself, and trusts neither side's number` — the
  expected value is recomputed in the test, so a requirement carrying a lie would
  still be checked.
- `same inputs, same verdict, no clock` — and two different requirements over one
  artifact give two different verdicts, so nothing is cached.
- `no event builder in this module can write a work_verified from a producer` — a
  grep-level check on `src/verify.ts`: no exported function returns an `Event`.
- `reads back out of a written event unchanged` — a verdict survives a round trip
  through the log.

---

## ART — the frozen artifact

File: `test/frozen-artifact.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| ART-01 | `the worker's own digest is ignored and a different one is recorded` | PROVED | the worker claimed `success: true` and a digest of sixty zeros; the recorded digest is different, is the runtime's, and the verdict came from running the code |
| ART-01 | `two captures of the same workspace share an id, different ones do not` | PROVED | content-addressing: identical content gives an identical `artifactId`, changed content does not |
| ART-02 | `the artifact is named by its content, so it cannot be renamed into existence` | PROVED | `artifactId === "A-" + digest.slice(0, 16)` and the bytes are on disk |
| ART-04 | `modifying the workspace after capture leaves the artifact alone` | PROVED | four kinds of vandalism (overwrite, replace the test file, add a directory, delete a file) leave the digest, the capture, and the verdict all unmoved |
| ART-05 | `a rejected artifact stays durable and addressable` | PROVED | a worker that touched the wrong file is `REJECTED` by the real check, and `verifyCapture` is still `true` |
| ART-06 | `a capture that is gone settles nothing` | PROVED | a deleted capture is `INCONCLUSIVE`, not `REJECTED`, and the evidence says `not on disk` |
| ART-06 | `a capture whose bytes no longer match its name settles nothing` | PROVED | `readCapture` returns `unavailable` and the verdict is `INCONCLUSIVE` |
| ART-06 | `a runner that crashes is INCONCLUSIVE, not a rejection of the work` | PROVED | a command that does not exist yields `INCONCLUSIVE` with `runner failed` in the evidence |

The founding test, `a sabotaged workspace does not change the verdict on the
capture`, is arranged so the naive answer is the plausible one: a worker fixes a
real bug in a real fixture repo, the runtime captures it, the live workspace is
then broken on purpose, and the verdict stays `VERIFIED` — while the same test
asserts the live workspace *would* have said `REJECTED`.

And `a worker that changed nothing and claimed success is rejected`: the purest
lie, no edit plus a confident report.

In `describe("the claim is narrower than the tempting one")`:

- `a capture says what it covers and what it does not` — `scope`, a non-empty
  `covers` including `add.mjs`, and a non-empty `doesNotCover` including
  `outside the declared workspace`.
- `the log records the production and the verification as two facts` — VER-04
  still holds after a rejection; the false summary survives verbatim.

---

## PORT — portability

File: `test/portability.test.ts`, 20 cases across five invariants

| Id | Tests | Status | What they assert |
|---|---|---|---|
| PORT-01 | `no source under src/core mentions an absolute user path`; `...reaches for a home directory or a working directory`; `...imports an I/O module, even as a type`; `core imports nothing outside itself`; `the core is not empty, or the test above proves nothing` | PROVED | core is free of `/Users/...`, `homedir(`, `process.cwd`, `node:{fs,child_process,os,path,process,net,http,https}`; every non-`node:` specifier starts with `.`; core has at least five modules |
| PORT-02 | `no adapter reads this machine's layout at module scope`; `a homedir default is a default, not a constant`; `the skills adapter requires its roots rather than guessing them`; `every adapter is constructible without this machine's layout` | PROVED | `frontier.ts` exports `DEFAULT_PROJECTS_ROOT` and honours `options.projectsRoot`; `skills.ts` declares `roots: string[]` |
| PORT-03 | `exists and is executable`; `hardcodes this machine's checkout, which is allowed only here`; `can be pointed at another checkout through the environment`; `the entry point it points at exists` | PROVED | the shim resolves from `CUESHEET_ROOT` and never execs `node /Users/...` |
| PORT-04 | `the core resolves ownership with a layout that is not this machine's`; `reads a portfolio that has nothing to do with this machine`; `no source in the repository carries a foreign-looking path as a constant` | PROVED | a real registry, category tree and git repo under `/tmp/.../srv/people/amina/work/projects` is read unmodified; no source embeds the test layout |
| PORT-05 | `no test reaches into this machine's real projects`; `package.json declares no dependency at all`; `a path separator is not baked into a source file`; `the repository root is discoverable from the tests, not assumed` | PROVED | zero `dependencies` and zero `devDependencies`; no string-concatenated path separators |

---

## LOAD — everything that ships has to load

File: `test/loadability.test.ts`

| Id | Test name | Status | What it asserts |
|---|---|---|---|
| LOAD-01 | `every module under src parses and imports` | PROVED | a recursive scan; every `.ts` under `src` is imported in a subprocess and exits 0 |
| LOAD-01b | `the package entry point named in the README exists and loads` | PROVED | `bin/` is non-empty and `src/cuesheet.ts` imports |
| LOAD-02 | `the CLI answers for help without observing the world` | PROVED | `--help` and `-h` exit 0, print `Subcommands:`, and stderr contains no `ENOENT`, `EACCES` or `not found` |
| LOAD-02b | `help is available for every declared subcommand` | PROVED | every name parsed out of the help text, `version` excepted, answers its own `--help` and describes itself |
| LOAD-03 | `the module surface is reachable from the entry point` | PROVED | a probe importing every discovered source by absolute URL exits 0 |

Plus `the chat entry point is what the tests have been spawning` — the 18 chat
tests spawn the chat as a process, so a path that silently stopped being a chat
would make them all pass on empty output.

---

## FOUNDATION — the core primitives, pre-P-series

These predate the P-numbering. They are listed because several later invariants
name them as their precedent.

**Ownership** — `test/ownership.test.ts`, 14 cases, `test("…")` not `it`.

| Property | Test name | Status |
|---|---|---|
| a clean project with no session is available | `a project with no session and a clean tree is available` | PROVED |
| a live session holds | `a recent session holds the project` | PROVED |
| an old session neither holds nor is discarded | `a session outside the window does not hold, but is not discarded either` | PROVED |
| a dirty tree holds without a session | `an uncommitted tree holds the project even with no session` | PROVED |
| unpushed commits hold and set `needsPush` | `unpushed commits hold the project and raise needsPush` | PROVED |
| no upstream is not an error | `a project with no upstream is not an error` | PROVED |
| only the most recent session counts | `only the most recent session is reported per project` | PROVED |
| no cross-contamination between projects | `a session in one project does not hold a sibling project` | PROVED |
| **an unobserved project is held** | `a project with no reported state is held, not released` | PROVED |
| an unreadable state is held and names the reason | `a project whose state could not be read is held, and names the failure` | PROVED |
| unobserved never appears as available | `an unobserved project never appears among the available ones` | PROVED |

The ninth row is the fourth rule and the one that was missing: a count that was
never read is not a count of zero. Its comment records that the test used to
assert the **inverse** — that an unreported project is treated as clean — which is
exactly the inference the repository exists to forbid.

**Capabilities** — `test/capability.test.ts`, the registry half of
`REGISTRY_UNVERIFIED`:

- `an empty registry blocks, and reports that it could not be verified`
- `a registry of unverified markers means absence is not evidence`
- `one verified capability makes any absence a real absence`
- `an unreadable root is not faked into a capability with a name`
- `an unreadable root is observable without a pseudo-capability, and that is the
  only way in`
- `a readable but empty root is NOT flagged unverified: that is a real absence`

The last two are the pair that matters: a root that cannot be read and a root
that is empty must produce *different* answers, and the distinction is carried by
a pseudo-capability rather than by a flag.

**Delegation gate** — `test/delegation.test.ts`, `parseRequirements` and
`preflightDelegation`, plus the CLI's exit codes: 0 ready, 1 blocked, 2 broken
invocation. Each malformed declaration is rejected with the correct shape named.

**Loop** — `test/loop.test.ts`, notably `a claim of completion does not end the
loop`, `only evidence about the goal closes it`, `a tool result is an observation,
never evidence`, `the frame is rebuilt every step from the log, never cached`.

**Memory** — `test/memory.test.ts`, notably `a zero measurement is a measurement,
not an absence` and `a condition naming nothing can never fire`.

**Store** — `test/store.test.ts`, notably `a session is the log, not a
conversation`, `an agent claiming completion closes nothing`, `evidence with empty
backing is recorded, because that absence is the finding`, and `the store performs
no I/O and never reads a clock it was not given`.

**Observation cost** — `test/observation-cost.test.ts`: `the banner reads nothing`
(0 git calls) and `the portfolio is read once per session, not once per question`.
Counted rather than timed, because 154 ms against a 5 s budget lets a slow CI
decide correctness.

---

## Untested ids

Ids that appear in a source comment with no test carrying them. Each is either
enforced structurally or genuinely open; none is claimed as PROVED.

| Id | Where it is named | Status and question |
|---|---|---|
| CON-03 | `src/core/store.ts:207` — "a refusal wrote nothing at all, which is CON-03" | **PROVED structurally, untitled.** `a refusal leaves the journal byte-identical` in `control-revision.test.ts` asserts exactly this, but the test does not carry the id. Open question: should the id be added to that test title so the reference resolves? |
| ART-03 | `src/adapters/artifact-verifier.ts:18` — "no working-directory parameter ... ART-03 enforced by the shape rather than by a review" | **PROVED structurally.** `RunOptions` (`src/adapters/artifact-verifier.ts:31`) has five fields — `artifact`, `command`, `args`, `timeoutMs`, `verificationId` — and none of them is a working directory. The only `cwd` in the module is `options.artifact.location` (line 69). Not proven by a test, and arguably not provable by one: the property is that the API *cannot express* the forbidden call. A test could grep for `cwd` in the module. Open. |
| CON-04 | nowhere | **UNRESOLVED.** Named in no file. Either a milestone planned a fourth control property that was folded into CON-01, or the numbering has a hole. Open question for the author. |
| CON-05 | nowhere | **UNRESOLVED.** Same as CON-04. |
| AFF-07 | nowhere | **UNRESOLVED.** AFF-06 is followed by AFF-09 in the test suite; 07 and 08 are absent from the repository entirely. The P7 commit body attributes the pending-withholding property to "AFF-08", which does not exist in any file. The property itself is PROVED (EFF-07b, AFF-04); only the label is lost. |
| AFF-08 | only in the P7 commit message | **UNRESOLVED**, same as above. |
| VER-01, VER-05 | nowhere | **UNRESOLVED.** VER-02..04 and VER-06 are defined; 01 and 05 are not. VER-01's property (the producer is not the authority) is PROVED by the `honest/wrong/lying` table test, which carries no id. |
| KEY-06 | nowhere | **UNRESOLVED.** KEY-01..05 are defined. |
| EFF-08 | nowhere | **UNRESOLVED.** EFF-01..07 are defined. |

Three numbering gaps, and one of them (AFF-07/AFF-08) is contradicted by a commit
message. That is recorded here rather than papered over, because an invariant id
that resolves to nothing is the same failure mode as an unknown rendered as a
fact.

---

## Structural invariants, and why some have no test

A few properties are enforced by a type or by the absence of a parameter rather
than by a runtime check. They are listed because "no test" and "not provable" are
different answers.

| Property | Mechanism | Why no test |
|---|---|---|
| `Observed<T>`'s unknown arm has no `value` | TypeScript narrowing | A test can check the value is absent at runtime (`VIEW-02` does), but the compile-time guarantee is the real one, and Node's strip-only mode does not typecheck |
| `verify.ts` cannot assert a verdict | No exported function returns an `Event` | Checked by grep, and the grep is itself the fragile part |
| `reconcile` cannot retry | Two arguments, no executor | `REC-02` asserts the arity; the rest is shape |
| `runAgainstArtifact` cannot verify a live workspace | No `cwd` parameter | See ART-03 above |
| A worker cannot declare a goal met | It has no vocabulary for goals | `WRK-02`'s import check is the proxy; see "What WRK-02 does not prove" above for the gap between that and confinement |
| Core knows no user, path or runtime | `PORT-01` | Proven by test, but by static grep, so a sufficiently creative import could evade it |

The honest summary of the static checks: `PORT-01`, `VIEW-01`, `VIEW-01b`, `AFF-01`,
`WRK-02`, `LOAD-01` and the `verify.ts` event-builder grep are all *source-text*
assertions. They are cheap, they run every commit, and they are all defeated by a
change the author does not think of as an import. No property in this repository
rests on one of them alone.
