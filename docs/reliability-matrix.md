# Reliability matrix: is Cuesheet right when the worker is wrong

**FALSE VERIFIED: 0.** Thirteen deterministic rows, thirteen matching their
expectation, thirteen falsifiable by a mutant that breaks Cuesheet on purpose.
The metric is not stuck at zero: under a deliberately permissive oracle it rises
to 3, on exactly the three rows whose work is wrong.

How to read the labels.

```text
observed here   run on this machine, from the command below
deterministic   no model, no network, no clock in the deciding path
falsified by    the mutant that makes this row go red, and what it removes
control         agreement with the naive harness is the expected result here
pin             nothing can make this row go red, so it is not a proof
```

```bash
node --test test/reliability-matrix.test.ts
```

This file alone: **3 pass, 1 skip, 0 fail.** The skip is L01 and its reason is in
the output.

Full suite at the time of writing: **435 pass, 1 fail, 1 skip.** The failure is
`test/typecheck-guard.test.ts`, which was already failing before this work began
and is untouched by it. The skip is this matrix's L01.

`test/llm-producer.test.ts` was being written concurrently in the same working
tree while this ran, and is green at the time of writing. Nothing in this matrix
depends on it and it does not depend on anything here.

---

## The metric, and the definition it needed

A verdict says one thing: this artifact, at this digest, satisfies this
requirement. Everything else people want from it is a different question with a
different answer, and the temptation to fold them in is where false confidence
comes from.

```text
FALSE VERIFIED   a VERIFIED whose work is not actually correct
```

The definition that would have been flattering is `a VERIFIED accompanied by any
false statement`. Row R02 is correct work with a fabricated account of how it was
done, and under that definition it would have counted against Cuesheet for
correct behaviour. It does not count, and R02 carries `accountIsFalse: yes` in its
facts so a reader can see the case rather than take the definition on trust. R02
asserts the stronger thing anyway: the fabrication is preserved verbatim in the
log and is never promoted into the fold's set of proven facts, and that second
half is what mutant `M-EVIDENCE` falsifies.

Ground truth is measured, not declared. Every row declares whether the work it
produced is genuinely correct, and every run checks that declaration by spawning
the fixture repository's own test directly in the workspace, with no capture, no
verdict and no Cuesheet anywhere in the path. A row that declared the work
correct while the workspace was red would be a false verified by construction.

---

## The results

Deterministic. No model, no network. `discriminates` is the naive harness in
`test/fixtures/unreliable/naive-harness.ts`, asked the same question on the same
bench: a competent harness carrying the ordinary shortcuts, which is what tells
the matrix whether a row is measuring a distinction anybody makes.

| id | question | what the worker did | expected | **result** | discriminates | falsified by |
|---|---|---|---|---|---|---|
| R01 | false VERIFIED | correct work, humble account | VERIFIED | **VERIFIED** | control | `M-REJECT-ALL`, `M-ABSENT-FAILED`, `M-BOTH-ORDER`, `M-EVIDENCE` |
| R02 | trusted the claim | correct work, fabricated account | VERIFIED, lie not promoted | **VERIFIED**, `proven: 0` | yes | `M-REJECT-ALL`, `M-ABSENT-FAILED`, `M-BOTH-ORDER`, `M-EVIDENCE` |
| R03 | trusted the claim | nothing done, `success: true` | REJECTED | **REJECTED** | yes | `M-ACCEPT`, `M-ABSENT-FAILED`, `M-BOTH-ORDER` |
| R04 | false VERIFIED | a real diff, in an irrelevant file | REJECTED | **REJECTED** | yes | `M-ACCEPT`, `M-ABSENT-FAILED`, `M-BOTH-ORDER` |
| R05 | unknown as failure | nothing produced, clean exit, no receipt | INCONCLUSIVE work, REJECTED artifact, goal survives | **INCONCLUSIVE / REJECTED / yes** | yes | `M-ACCEPT`, `M-ABSENT-FAILED` |
| R06 | verified the wrong artifact | capture damaged after capture | INCONCLUSIVE | **INCONCLUSIVE** | yes | `M-UNIDENTIFIED` |
| R07 | lost recoverable work | edit lands, then SIGKILL | INCONCLUSIVE work, VERIFIED artifact, process≠work | **INCONCLUSIVE / VERIFIED** | yes | `M-REJECT-ALL`, `M-ABSENT-FAILED` |
| R08 | false VERIFIED | Cuesheet dies after capture, before recording | no verdict in the log, identical on replay | **none in log, VERIFIED on replay, identical** | yes | `M-REJECT-ALL` |
| R09 | verified the wrong artifact | workspace broken after the freeze | VERIFIED, live workspace says fail | **VERIFIED** (live workspace: fail) | yes | `M-REJECT-ALL`, `M-LIVE` |
| R10 | unknown as failure | verifier missing, then verifier hangs | INCONCLUSIVE both times | **INCONCLUSIVE / INCONCLUSIVE** | yes | `M-REJECT-ALL` |
| R11 | duplicated an effect | log looks resolved, completeness unattested | no second spawn offered | **no** (`pending` unknown) | yes | `M-PENDING-FALSE` |
| R12 | false VERIFIED | stale decision races a durable fact | decision refused, fact kept | **refused / kept / `note,note,note`** | yes | `M-STALE` |
| R13 | conflated the outcomes | correct edit, two contradictory receipts | INCONCLUSIVE work, VERIFIED artifact | **INCONCLUSIVE / VERIFIED** | yes | `M-REJECT-ALL` |
| L01 | — | a real language model | — | **SKIPPED**, reason printed | — | — |

Aggregate: `FALSE VERIFIED: 0`, rows 13/13 as expected, rows no mutant can move:
**none**, non-control rows the naive harness also answers: **none**.

R01 is a declared control. A worker that tells the truth is the one case a
shortcut gets right, and a matrix containing only liars would be measuring
adversaries rather than a system. The control is asserted in both directions: if
it ever starts discriminating, the row is mislabelled and the test says so.

---

## Each row, and the regression injected to prove it bites

Every row below names the mutant that makes it go red. A mutant is a single
expression of `src/` copied to a temporary directory, rewritten so its relative
imports point at the real modules, and loaded under a unique specifier. The
repository is never modified. A mutant whose substitution no longer applies
throws rather than silently becoming a no-op, so a refactor that would quietly
un-falsify a row is a loud failure. It happened once during this work, on the
indentation of a string in `src/work.ts`.

### R01 — correct work, humble account

The control. A worker that fixes a real bug in a real fixture repository, exits
clean, and says only what it did.

Expected `CONFIRMED_COMPLETE` and `VERIFIED`, with the receipt's summary
preserved verbatim and nothing promoted to proven.

**Falsified by `M-REJECT-ALL`**, which replaces
`verdict: exit === 0 ? "VERIFIED" : "REJECTED"` in
`src/adapters/artifact-verifier.ts` with a constant `REJECTED`. The row goes red:
correct work can never be accepted. Also `M-ABSENT-FAILED` (`src/work.ts` maps an
absent receipt to `CONFIRMED_FAILED`), `M-BOTH-ORDER` (a contradictory directory
is read as a verdict) and `M-EVIDENCE` (the worker's summary becomes a proven
fact).

### R02 — correct work, fabricated account

The most important row, and the one a flattering metric would score against
Cuesheet. The change underneath is genuinely correct. The account is a
fabrication: it claims the sign convention was reverted, and that 214 tests pass
across integration and concurrency suites that do not exist.

Expected `VERIFIED`, because the verdict is about the artifact, plus
`accountPromotedToProof: no` and `proven: 0`, because the fold must not treat the
sentence as a fact.

**Falsified by `M-EVIDENCE`**, which in `src/state.ts` widens the proven
extractor to accept `work_produced` events and to read `summary` as a claim and
`effectId` as a source. The row goes red on `accountPromotedToProof: yes`. The
verdict half is falsified by `M-REJECT-ALL`.

The naive harness, asked the same question, records the worker's sentence as
`evidence` with the worker's own name as the source, and `proven` becomes
non-empty. That is one line, and it is how a fabricated account becomes something
a surface later renders without a question mark.

### R03 — nothing done, a confident success receipt

No file touched. The receipt says `success: true` and carries a digest of sixty
zeros that the worker invented.

Expected `REJECTED`, with `workerClaimedSuccess: yes` and
`workerDigestHonoured: no`. The runtime's digest is what is recorded
(`src/adapters/artifact-capture.ts` computes it over bytes it read), and the
verdict comes from running the code.

**Falsified by `M-ACCEPT`**, the same line as `M-REJECT-ALL` in the other
direction. The row goes red: a false VERIFIED. Also `M-ABSENT-FAILED` and
`M-BOTH-ORDER`.

### R04 — a real diff, in a file that does not matter

The worker writes `docs/NOTES.md` about changing the sign convention. The diff
looks like work. The repository's real test is still red.

Expected `REJECTED`, with `diffWasNotEmpty: yes` so the row cannot pass by
failing to produce anything.

**Falsified by `M-ACCEPT`.**

### R05 — nothing produced, clean exit, no receipt

The purest absence: exit 0, no receipt, workspace untouched.

Expected `INCONCLUSIVE` for the work outcome, because a process stopping is not
an outcome (WRK-04). The capture of the untouched workspace is `REJECTED`,
because the test really is red. The effect stays unanswered, and the staged goal
survives (EFF-06): a refused effect spends nothing.

**Falsified by `M-ABSENT-FAILED`**, which changes `src/work.ts` so an absent
receipt becomes `CONFIRMED_FAILED`. The row goes red on `workOutcome`. Also
`M-ACCEPT` on the artifact half.

### R06 — the capture is damaged after it was taken

The worker fixes the bug. The runtime captures the workspace. The capture is then
overwritten. The live workspace is untouched and still green, which is the whole
distinction.

Expected `INCONCLUSIVE`, not `REJECTED`: a check about bytes it cannot identify
is not a criticism of the work.

**Falsified by `M-UNIDENTIFIED`**, which in
`src/adapters/artifact-verifier.ts` disables the short-circuit
`if (readable.kind === "unavailable")`. The row goes red: the check now runs
against unidentified bytes and returns `REJECTED`.

### R07 — the edit lands, then the worker is killed

`SIGKILL` after the write, before any receipt. The process is a failure by every
process measure: non-zero, signalled.

Expected `INCONCLUSIVE` for the work outcome, and `VERIFIED` for the artifact,
because the frozen capture still holds the fix and the verifier runs the test
against it. **The work is not lost, and it is not claimed either.** These are the
two questions the row exists to keep apart, and `outcomeNotTakenFromProcess`
records that the answer came from the artifact rather than from the exit.

**Falsified by `M-ABSENT-FAILED`** (the crash would become a failed worker, and
the work would be lost) and by `M-REJECT-ALL` (the recovered work could never be
accepted).

This is the row that answers "does it lose recoverable work", and the answer is
that the receipt is not the only route to a verdict.

### R08 — Cuesheet dies after the capture, before recording

The artifact is on disk. The log carries `work_produced`. Nothing recorded what
the check concluded, because the process died in the window.

Expected: the log says `work_produced` and nothing else, so nothing in it
settles the work. A store rebuilt from those events re-runs the verification and
gets the identical verdict and the identical digest.

**Falsified by `M-REJECT-ALL`**, which makes the replay return `REJECTED` and so
proves the replay half is measured rather than assumed.

The other half, that a missing `work_verified` cannot become a verdict, is
**structural**: no code path in the repository maps the absence of an event to a
verdict, so there is no line to mutate. That is the honest reason it is not
falsified by a mutant, and it is a stronger statement than a green test.

### R09 — the workspace is broken after the freeze

The worker fixes the bug, the runtime captures, and then `add.mjs` is overwritten
with a multiplication and a `NOTES.md` is added. The live test is red.

Expected `VERIFIED`, naming the capture's digest. A verifier reading the live
workspace says `REJECTED`, and that is the plausible wrong answer.

**Falsified by `M-LIVE`**, which replaces `cwd: options.artifact.location` with
the live workspace named in the environment. The row goes red. This is the one
mutant that needs a row to hand it a directory, which is why R09 sets
`CUESHEET_LIVE_WORKSPACE` itself: a test that forgot to would report a silent
no-op as a passing falsification.

An earlier version of this row also overwrote `test.mjs` with `process.exit(0)`,
which made the sabotaged workspace pass, and the row then asserted the opposite
of what it described. It is noted because the failure was silent and green.

### R10 — the verifier cannot start, and then it hangs

Two separate ways for the oracle to say nothing, both checked: a binary that does
not exist, and a runner killed by a 700 ms timeout.

Expected `INCONCLUSIVE` both times, the capture still on disk, and the healthy
check beside them still `VERIFIED`, which is the proof that nothing was decided.

**Falsified by `M-REJECT-ALL`.** The naive harness gets this wrong in the other
direction: it reads a runner that could not start as a work that failed, and
returns `REJECTED`, which is how an infrastructure hiccup becomes a defect in
somebody's code.

### R11 — a log that looks resolved, and cannot be attested

Every visible effect request is resolved. Nobody can attest that the file is the
whole log: a resumed session, a truncated write, a process that died holding a
buffered event.

Expected: `APPROVE_GOAL` is **not** offered, because `pending` is `unknown` and
not `false`. Separately, an effect whose reconciliation key the world's records
have lost is `NOT_FOUND`, which settles nothing and justifies no terminal event.

**Falsified by `M-PENDING-FALSE`**, which replaces
`if (completeness !== "complete")` with `return seen(false)` in
`src/state.ts`. The row goes red: a second spawn becomes available for a job
that may already be running.

The naive harness says `yes` on the identical log, because it defaults `pending`
to `false` when the log has nothing unresolved. That default is the exact claim
AFF-01 was written to refuse.

This row took two rewrites. The first left the effect unanswered, and the naive
harness refused a second spawn for the right reason by accident: it read the
request. The dangerous shape is the one where the log looks finished.

### R12 — a stale decision racing a durable fact

One surface derives an affordance at revision 1. Another writer appends a fact.
The first surface then tries to commit its decision against revision 1.

Expected: the decision is refused, the fact is appended unconditionally, the
journal reads `note,note,note`, and the appended fact's sequence is above the
revision the decision was made at. A decision expires; a fact does not.

**Falsified by `M-STALE`**, which deletes
`if (this.revision !== expectedRevision) return null;` from
`src/core/store.ts`. The row goes red: the stale `goal` lands in the journal.

### R13 — a correct edit and two receipts that disagree

`result.json` says everything passed. `failure.json` says nothing was changed.
Both are true, in the sense that a producer which says two contradictory things
has said nothing.

Expected `INCONCLUSIVE` for the work outcome, because the directory is
inconsistent (WRK-06), and `VERIFIED` for the artifact, because the edit is real
and the capture holds it. The work outcome and the verdict are separate questions
and the row keeps them separate.

**Falsified by `M-REJECT-ALL`.** `M-BOTH-ORDER` would also fall, by removing the
`hasFailure && hasResult` guard so the directory is read as a failure.

### L01 — a real language model

**SKIPPED, and it says so in the output.** `OPENROUTER_API_KEY` is present in
this shell, and `test/real-chat-path.test.ts` sets the repository's rule: `npm
test` does not call a provider. A reliability benchmark is the worst place to
break that, because a paid non-deterministic third party would sit inside the
one loop whose entire purpose is to be reproducible.

The row is real and runs with `CUESHEET_RELIABILITY_LLM=1`. It hands the model a
`ContextFrame`, applies whatever tool call comes back, and then puts the
workspace through the same capture and verify the deterministic rows used. Its
assertion is the one that holds regardless of what the model says: the verdict
follows the workspace. The interesting output is not the verdict, it is the gap
between what the model claimed and what was found.

---

## The mutants

Ten single-expression breaks of `src/`, applied in memory.

| mutant | module | what it removes | rows it falsifies |
|---|---|---|---|
| `M-ACCEPT` | `artifact-verifier.ts` | the only `REJECTED` the oracle can produce | R03 R04 R05 |
| `M-REJECT-ALL` | `artifact-verifier.ts` | the only `VERIFIED` the oracle can produce | R01 R02 R07 R08 R09 R10 R13 |
| `M-LIVE` | `artifact-verifier.ts` | the frozen working directory (ART-04) | R09 |
| `M-UNIDENTIFIED` | `artifact-verifier.ts` | the short-circuit on an unidentifiable capture (ART-06) | R06 |
| `M-ABSENT-FAILED` | `work.ts` | unknown≠absent (WRK-04) | R01 R02 R03 R04 R05 R07 |
| `M-BOTH-ORDER` | `work.ts` | the guard on a contradictory receipt directory (WRK-06) | R01 R02 R03 R04 |
| `M-PENDING-FALSE` | `state.ts` | the unattested-log guard (EFF-07) | R11 |
| `M-STALE` | `core/store.ts` | the revision check on a decision (CON-03) | R12 |
| `M-EVIDENCE` | `state.ts` | the separation between a claim and a proven fact | R01 R02 |
| `M-READCAPTURE` | `artifact-capture.ts` | the callee's digest check | **nothing, and that is a finding** |
| `M-VERIFY-PERMISSIVE` | `verify.ts` | the comparison in the pure verifier | **nothing, and that is a finding** |

### The falsification of the falsifier

A benchmark that only ever prints green is indistinguishable from one written to
print green. So the metric is run a second time against `M-ACCEPT`, a permissive
oracle, and has to come out non-zero:

```text
FALSE VERIFIED under a deliberately permissive oracle: 3 (R03 R04 R05)
```

If that number were still 0, the metric would not be measuring what this document
says, and the table would be decoration. The mutant is then confirmed to be a
real behavioural difference rather than a relabelled import, by running one
failing artifact through both: production returns `REJECTED`, the mutant returns
`VERIFIED`.

The first version of the falsification loop was wrong in a way worth recording.
It counted a mutant as breaking a row whenever the row's expectations were
violated under it, so three rows that were already failing because of a mistake
in the row itself had all eleven mutants credited with breaking them, and the
table filled with confident nonsense. A row that does not pass cannot be broken.
The loop now skips those rows, and prints the number of bench directories a run
leaked, which must be 0.

---

## Negative results

Recorded because they are results, and because the next person should not pay to
measure them again.

**Cuesheet has two ways to reach a verdict and this matrix measures one.**
`src/verify.ts` computes a pure verdict from a digest comparison.
`src/adapters/artifact-verifier.ts` computes its own from a process exit code and
never calls `verify()`. `M-VERIFY-PERMISSIVE` makes `verify()` accept everything
and no row moves, because no row in this matrix can observe `verify()` at all.
`test/verification.test.ts` covers the pure verifier on its own terms, and this
matrix does not. Whether the two agree on the same artifact is unmeasured. That is
a coverage gap and it is the reason the mutant exists.

**`readCapture` checks the digest twice.** Both the callee and its only caller
check it, and the caller runs first, so removing the callee's check changes
nothing observable. Defence in depth rather than a hole; the property is
falsified by `M-UNIDENTIFIED`, on the line that decides.

**Five of the thirteen rows do not need a freeze to be safe.** R03, R04, R05, R11
and R12 are decided before any artifact exists, on the receipt, the fold, the
completeness attestation and the revision. They are in the matrix because the
benchmark is about the system and not only about its most famous mechanism.

**The naive harness gets R01 right.** Declared, asserted, and kept.

**Nothing here was true before the matrix existed, and nothing in `src/` was
changed.** The package declares no runtime dependency and still does; the
benchmark adds none.

---

## What this does not establish

- **One fixture repository, one bug, one oracle.** Thirteen rows over a single
  `add()` that subtracts. A different class of defect, a flaky test, or a
  workspace with a build step would exercise different code. The fault set is
  eight behaviours of one worker script.
- **No timing, no concurrency.** Every row is sequential. The TOCTOU property in
  R12 is a revision check, not two processes racing; `docs/store-adversary.md`
  covers the two-process case and this matrix does not repeat it.
- **The threat model is a semantically unreliable worker**, not a hostile
  process. A worker that lies in a receipt and edits files is the whole adversary
  here. A worker that reaches for `~/.ssh` is not modelled, and the capture's own
  `doesNotCover` field is the honest statement of that.
- **Row R08's "absence is not a verdict" is structural**, so it is argued from the
  absence of a code path rather than falsified. That is a weaker kind of evidence
  than a red test and is labelled as one.
- **One LLM row, never run.** Everything the LLM case would tell us is currently
  an expectation. The deterministic rows are the case the LLM is a variable in.
