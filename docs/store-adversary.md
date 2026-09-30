# Store adversary: ten attacks on one file

`src/adapters/session-store.ts` is the only place in this repository where two
processes can disagree about what happened. Everything upstream is pure, so
concurrency, crash and corruption have nowhere else to land. This document is
what was thrown at that one file, what each attack found, and what the code looks
like afterwards.

How to read the labels. They are the same ones `docs/threat-model.md` uses, and
they matter more than the prose around them.

```text
observed here   run on this machine, reproducible from the command shown
quoted          a measurement made earlier in this audit, accepted and not repeated
documented      read in the source, with the line named
inference       a conclusion drawn from the two above, not itself run
```

The measurements marked `quoted` are the ones this file was written against. They
were not repeated. The ones marked `observed here` are new, and each carries its
number.

**Result: one file changed, 18 tests, 15 of them red before the patch.**
Full suite 399 pass, 0 fail. 14 are named `defect_X_Y` after the attack they
cover. The other 4 are pins, of which 3 were green before the patch and one was
red for an incidental reason stated below. A pin that was never measured is a
preference, and there is no pretending otherwise.

---

## The question the patch had to make answerable

One caller, one refusal, three questions. Before the patch there was one answer
for all three, and it was `null`, which is a statement about the world.

| what a caller received | what it was told | what is true |
| --- | --- | --- |
| `null` | the journal moved | the journal moved, **or** a lock was held, **or** the disk said no |
| throw | nothing specific | a `SyntaxError` from a parse, with no reason attached |

After:

| what a caller receives | how to read it | what to do |
| --- | --- | --- |
| `null` | the journal is no longer where you read it | re-read, decide again. Nothing was written. |
| `SessionStoreError`, `reason: "journal_damaged"` | this session can commit nothing at all | not a conflict. A human has to look at the file. |
| `SessionStoreError`, `reason: "write_refused"` | the disk refused the bytes | not a conflict. Re-reading changes nothing. |
| `SessionStoreError`, `reason: "lock_unreleased"` | a lock outlived its writer and stayed | not a conflict, and the session says so by refusing to commit. |
| `lockState(id, revision)` | the journal did not move, and something holds revision r | the diagnosis for the one case nothing else can settle |

No refusal can be reported as an observation of the world, because the only
refusal that looks like one is the one that is one. That is the whole point, and
it is `HONEST FAILURE != EXPLAINED FAILURE` one level down, in the store.

---

## A1, A1b: a lock left by a holder that died

**RESULT: A1b fixed by construction. A1 diagnosed, not recovered, and it cannot
be recovered under the constraints.**

### A1b: a lock from a revision that no longer exists

`quoted`: a holder acquired the lock at revision 98, committed sequence 99, and
died before releasing. The leftover file then refused a writer committing at
revision 99, a perfectly valid commit against a current read. The refusal was for
a revision that had ceased to exist.

The lock name now carries the revision:

```text
<session>.jsonl.r<rev>.lock
```

**observed here**: `defect_A1b_a_lock_from_an_older_revision_does_not_block_a_valid_commit`.
A real child acquires the lock through the store's own `appendIfCurrent` and dies
holding it, a fact moves the journal to 2, and a commit at revision 2 lands at
sequence 3. Under the previous naming that same fixture refuses.

A lock at r can only ever contend with a writer that wanted r, so the failure
mode stops being possible rather than becoming less likely.

**The upgrade residue is a real one and it is reported, not hidden.** Every
session root on disk already holds `<session>.jsonl.lock` files written by the
naming this patch replaces. The new code never consults that name, so those files
are inert: `defect_A1b_a_lock_left_by_an_older_version_does_not_brick_a_session`
asserts that a session with one still commits, and that the old file is left
alone rather than deleted, because this store did not write it and a rule that
deletes files it did not create is the rule that loses logs.

### A1: the holder that died before it wrote anything

`quoted`: `appendIfCurrent` returns `null`, `list()` reports the session as
healthy, and the `null` is indistinguishable from a lost race. The only correct
response to a lost race is "re-read and decide again", so the caller loops
forever with no diagnostic.

**This one is not fixed, and the reason is the constraint, not an oversight.**

A holder that dies between taking the lock and writing leaves a lock naming
revision r while the journal is still at r. Nothing in the journal records who
holds a lock, so "the holder died" and "the holder is alive and is about to
commit" are the same observable state. Telling them apart needs exactly the
things that are forbidden here: a lease, a PID, a heartbeat, a clock. There is
no derivation available, so no derivation is invented.

What the patch does is make the state reportable, which is the difference
between a caller that loops and a caller that knows:

**observed here**: `defect_A1_a_dead_holders_lock_is_reported`. `lockState(id, r)`
returns the two numbers, `journalAt: 1` and `orphaned: false`, and the caller can
say: the journal did not move, something holds revision 1, and I cannot tell
whether that something is alive. That is a diagnosis, and it is the whole of what
is available.

### The orphan rule, and why reclaiming is safe

A lock naming r is an orphan once the journal is past r, and the argument needs
no liveness at all:

```text
a holder takes the lock at r and commits at most once, in r+1
so a second commit at r+1 needs revision() === r, which is false
so removing the file cannot authorise the second commit
```

**observed here**: `defect_A1_an_orphaned_lock_is_reclaimed` (the lock file is
gone afterwards, and the log is `[1, 2]`, so sequence 2 exists exactly once) and
`defect_A1_orphanhood_is_derived_from_the_journal` (`journalAt` is measured from
the log, so a process that no longer exists has no way to make it wrong).

The recheck after taking the lock is what refuses, and that is why the argument
holds: the test removes a file, it does not bypass a check. The loop is bounded
at 8 (`ORPHAN_RECLAIMS`) and is not a wait. Reaching the bound means the journal
was already observed past r, so the `null` it returns is a true statement rather
than an admission of defeat.

**The bound itself is unmeasured.** Nothing here forced 8 attempts, and a tighter
bound or a different strategy has no evidence behind it yet. It is stated as a
constant with its reason, not as a tuned number.

---

## D3: a refusal the disk produced, reported as a conflict

**RESULT: fixed.**

`quoted`: `openSync(lock, "wx")` on a read-only root returns `null`, which reads
as "the journal moved". `ENOSPC`, `EMFILE` and `EROFS` all become the same
silent, eternal refusal. Meanwhile the same file threw loudly when `unlinkSync`
failed at line 120, so the asymmetry was an oversight rather than a decision.

**PATCH**: `EEXIST` is the only errno that means a writer is here. Every other
one throws `SessionStoreError` with `reason: "write_refused"`, the errno in the
message and in `cause`, and a sentence saying the disk refused and nothing is
contending.

**observed here**: `defect_D3_a_disk_refusal_throws_instead_of_returning_null`.
The test asserts its own precondition, that a file really cannot be created in
the read-only directory, because a test that cannot fail is decoration and a
privileged user would otherwise get a green test that proved nothing. After the
refusal it restores the permission and commits normally, so the refusal left no
state behind.

**observed here**: `defect_D3_a_journal_that_cannot_be_read_carries_a_reason`. A
directory where the log belongs used to throw a raw `EISDIR` out of
`appendFact`. It now throws `journal_damaged`, and `attest` names it as
`unreadable_file` with the code.

**The release failure is unchanged in shape and still untested.** It threw before
and it throws now, with a reason attached. Nothing in this audit could force a
release to fail on demand without a hook in the code under test, so it is a
loud path with no test behind it. That is a gap, not a pass.

---

## A2 and A4: three durable events behind an unparseable line

**RESULT: fixed. One finding, measured twice.**

`quoted`: a torn last line makes `read()`, `revision()` and `appendFact()` all
throw. Three committed events are unreachable through any public call. And
`list()` answers `events: -1, goal: "(unreadable)"`, which is the lie in the
other direction: a total loss reported where three of four events were intact,
with a literal sitting in a field whose every other value is goal text, where a
renderer would print it as one. The docstring at line 166 promised the opposite
of what the code did.

**The rule the whole file now runs on**, applied to bytes:

```text
a line that cannot be read is not a line that was never there
a journal is attested up to the first line that stops making sense
nothing past that point is claimed, including its absence
```

`attest(id)` returns `{ events, damage }` and never throws about content. `read`
is the strict wrapper over it and throws `journal_damaged`, because a caller that
asked for every event and got three out of four has been given a wrong answer to
a question that had a right one. `list` uses `attest` and reports the measured
count with `damaged: true`.

**observed here**:

- `defect_A2_the_intact_prefix_stays_readable_and_the_damage_is_named`: 3 events
  attested, damage `unreadable` at line 4, 0 lines after it, claiming nothing.
- `defect_A4_list_reports_a_damaged_session_as_damaged, not as a lost one`:
  `events: 3`, `damaged: true`, `goal: ""`, sorted by a real timestamp.
- `defect_A2_writing_after_the_break_is_refused`: the break is not cosmetic.
  Appending after unattested bytes gives the new event a sequence something
  behind the break already claims. All three write paths refuse with
  `journal_damaged`, including a raw `append`, which is the door `chat.ts:245`
  comes through and the only one that does not ask for a sequence first.

**The torn tail is an event that never happened, and that is the reasoning, not
a guess.** The write discipline is append, fsync, then report. A process that
dies between the write and the fsync never reported the event, so nothing was
promised about it. The three before it were reported and are durable. A caller
that needs a sequence for the interrupted one is asking for a promise nobody
made.

---

## A5, A6, A7: the log stops being a contiguous run

**RESULT: all three fixed, by one rule.**

`quoted` for A5 and A7: 241 events holding 160 distinct sequences, 70 of them
duplicated. `read().length` is 241, `revision()` is 160, no diagnostic anywhere.
The replay diverges: persisted `[1, 2, 2]` comes back as `[1, 2, 3]`, so the
sequence a P10 decision compared no longer names the line on disk.

`quoted` for A6: a hole in the sequence was never cared about, never signalled,
and `list` called the session healthy.

**The rule**: a line attests if it parses and its sequence is the next one. The
first line defines where the run starts, so a journal restored from elsewhere is
not damage by being numbered from somewhere other than 1. A duplicate, a hole, a
reorder and a line with no sequence are one finding: the run breaks, and where it
breaks is a measured line, not a guess about which line went missing.

**observed here**:

- `defect_A5_a_duplicated_sequence_is_damage_named_at_the_second_line`: `[1,2]`
  attested, damage `out_of_sequence` at line 3, `claims: 2`, one line behind it
  counted.
- `defect_A6_a_missing_sequence_is_damage`: `[1,3,4]` gives `[1]`, damage at line
  2, `claims: 3`.
- `defect_A7_a_duplicated_journal_diverges_on_replay`: the test first proves the
  divergence is real by replaying `[1,2,2]` into an `EventStore` and watching it
  become `[1,2,3]`, so the damage check cannot be decoration.

**This is a new cost on the write path, and it was measured.** `append` now
attests before it writes, because it is the one door the other two paths funnel
through, and a raw `append` funnels through nothing.

```text
                before      after
200 appends     3643 us     3735 us   per append
800 appends     3629 us     3705 us   per append
3200 appends    3772 us     4046 us   per append
```

Two to seven percent, on a path where `fsyncSync` costs about 3.6 ms and the read
is noise next to it. No optimisation is proposed: there is no case that needs
one, and rule 4 is not satisfied by liking the number.

---

## A10: what a restart is told

**RESULT: 6 of 6 corrupt states are now named. The six states are mine.**

The previous session's six states were never enumerated, so this is not a
remeasurement of that finding and does not claim to be. These are six
corruptions chosen here, and the property asserted is not "every corruption is
detected", which is stronger than this format can promise. It is the one that
matters: no state is reported as a healthy journal while its sequences are not
contiguous.

**observed here**, `defect_A10_no_corrupt_state_is_reported_as_a_healthy_journal`,
6 of 6 reported damaged:

| state | attested | damage |
| --- | --- | --- |
| a torn last line | 3 events | `unreadable` at line 4, 0 after |
| a duplicated sequence | 2 events | `out_of_sequence` at line 3, claims 2 |
| a hole in the sequence | 1 event | `out_of_sequence` at line 2, claims 3 |
| a reordered pair | 1 event | `out_of_sequence` at line 2, claims 3 |
| garbage at the start | 0 events | `unreadable` at line 1, 1 after |
| an event with no sequence | 1 event | `out_of_sequence` at line 2, claims nothing |

The last row is the one worth stopping on. It is valid JSON, it parses, and it
would have been appended to the log as an event with no sequence, which is a
revision nothing can be read from. `attest` ends the run there rather than
guessing where the author meant it to be.

---

## A3, A8, A9: the three that held

Three attacks did not reproduce a defect. They are pinned here, because a pin
that is never re-measured is how a held guarantee quietly stops being held, and
because a negative result is a result.

### A8, a fact against a lock: HELD

`quoted`: a fact was appended while a lock was held, and the decision at the same
revision was correctly refused. The revision check alone carried the invariant.
The lock added nothing a fact needed.

This negative result is load bearing for the patch, because the patch moves the
revision into the lock's name and could easily have turned a fact into a
decision on the way past. `appendFact` still takes no lock, and
`defect_A8_a_fact_is_not_blocked_by_a_lock` holds a real stranded lock while it
asserts both halves: the fact is written at the current revision, the decision is
refused.

### A9, four processes on one revision: HELD

`wx` plus the revision comparison is enough, and the only honest way to test a
race is to have one.

**observed here**: `defect_A9_four_processes_racing_one_revision_produce_exactly_one_commit`
starts four real processes against one file at revision 1. Exactly one commits at
sequence 2, the log is `[1, 2]`, and the three losers are told `null`. No loser
sees an error, because a refusal a caller cannot read as a refusal is the defect
this whole file is about.

That last clause is also a design constraint the patch honours: a racing loser
gets `null`, not a throw. Turning the founding case of P10 into an exception would
have been a change to P10's contract, not a patch to the store.

### A3, a reader during an append: HELD

`quoted`: 34,267 reads in a separate process across 2,000 appends, no torn and no
partial line. The first version of that measurement used a timer that was never
busy, was thrown away, and was not reported.

**observed here**: 13,624 reads over 400 appends in the suite's own run, **0 torn
tails**, in a trimmed version with the reader being a real loop. The number moves
between runs (22,978 in the one run where the reader was not competing with the
rest of the suite) and what matters is that it is not zero and that no read ever
saw a wrong event. The oracle reads the bytes itself rather than going through the
store, so a parser bug cannot satisfy the check that is testing the parser.

The guarantee asserted is the one the format can promise, which is not "a read is
never torn" but "a read is never wrong". A reader that catches a write in flight
may see a partial last line; those are the same bytes as an interrupted write,
they are reported as damage, and they are not mistaken for an event. What must
never happen is a duplicated or out of order sequence in the middle of a log, and
that is what the test asserts on every one of those reads.

---

## SCOPE: the lock is not the only door

**RESULT: reported, not fixed. `chat.ts` was not touched.**

`documented`, `src/chat.ts:245`: `appendSurface` does its own read-then-write
with no lock at all. It reads the revision, computes `at + 1`, and appends. Two
concurrent chat surfaces, or a chat surface and anything else writing the same
file, can both read 41 and both write 42.

Locking `append` alone would not have closed it, and the reasoning is worth
keeping: two of the three authorities over a sequence are outside the adapter.
`appendIfCurrent` checks a revision the caller supplies. `appendFact` reads the
revision itself. A third caller that computes its own sequence is a third
authority, and the adapter cannot see it.

**observed here**: the store now detects the result. A duplicated sequence is
damage, so a journal `chat.ts:245` corrupted is a journal whose `revision()`
throws `journal_damaged` and whose `list` row says `damaged: true`.

**inference**, not run: a chat surface that produced such a journal used to keep
going with a corrupt log, and will now fail loudly at the next read. The direction
is the one this repository wants, and it is a new failure on a path that was
previously silent rather than correct. It is an inference because the race needs
two chat surfaces to reproduce and driving the real chat surface is not this
file's territory.

**Not a regression, and still rough**: `documented`, `src/cli-run.ts:219` and
`:183` read a session through `durable.read(id)` instead of going through
`list()`. So `cuesheet sessions list` and `cuesheet inspect` on a damaged session
throw, before this patch and after it, where `list()` alone would answer. The
patch improved the message and changed nothing else about it.

---

## The tests, and the proof that they bite

18 tests. **observed here**: run against the pre-patch file, 15 are red and 3 are
green. The 3 green are the negative results below, which is what makes them pins.
The 14 `defect_` tests are each red for the symptom rather than for a missing
method wherever a symptom was available to assert. The 15th red test is the guard
at the end of the file, and it was red for a reason worth saying out loud: it
also pins the file's import list, and the pre-patch file imported
`"../src/core/store.ts"`, a path that does not resolve and is a pre-existing type
error. The patch corrected it while rewriting the import block, so the guard went
green as a side effect rather than as the object of the work.

The proof is re-injection: each mutation below was applied to the patched store
one at a time, the file was run, and the red tests were recorded.

| mutation | what was put back | tests that went red |
| --- | --- | --- |
| M1 | lock name loses the revision | `A1b` (both), the upgrade test |
| M2 | an orphaned lock is waited on, not reclaimed | `A1` orphan reclaimed |
| M3 | every errno on the lock becomes a null | `D3` disk refusal |
| M4 | `list` reports damage as a lost session | `A4`, `A10` |
| M5 | the sequence run is not checked | `A5`, `A7`, `A6`, `A10` |
| M6 | `append` stops refusing a damaged journal | `A2` writing after the break |
| M7 | `attest` reports a damaged file as an empty one | `A2` intact prefix, `A4` |
| M8 | `lockState` calls every lock an orphan | `A1` dead holder reported |
| M9 | the revision check inside the lock is removed | `A1` orphan reclaimed, `A8`, `A9` |

M6 is the one worth naming. The first run of this injection produced **zero** red
tests for it, because `appendFact` and `appendIfCurrent` both ask for a revision
before they write and so were already throwing for a different reason. The guard
was real and no test covered it. `defect_A2_writing_after_the_break_is_refused`
now also exercises a raw `append`, and M6 goes red. A test that cannot fail is
decoration, and the only way to find out is to try to break it.

M1 is the second worth naming. It breaks the naming, and the orphan test still
passes under it, because an orphan is reclaimed under either name. The test that
owns the naming is the one that asserts a valid commit is not blocked.

**Guard test, green before and after**: the last test in the file asserts the
store has no way to ask whether a process is alive (no `process.pid`, no timers)
and reaches nothing but `node:` builtins plus one type import. The limit in A1 is
only true while that holds.

---

## What was not done, and what is not known

**Not done, and deliberate.** No lease, no PID, no daemon, no dependency. The
lock stays a lock, the refusal stays non waiting, and the two write paths keep
their different meanings: a fact is never refused for being stale. `appendFact`
was not turned into a decision, and `appendIfCurrent` still returns what it
returned.

**Not known.**

- Whether 8 orphan reclamations is the right bound. No case needs more than 2.
- Whether a release can fail in a way that matters. The path is loud and has no
  test.
- What a torn tail in the middle of a file looks like. `unreadable` with lines
  after it is reported, and nothing is claimed about those lines, but no
  measurement distinguishes a mid-file tear from a mid-file overwrite.
- Whether `restore` on a damaged session is reachable from a CLI path. It
  delegates to `read` and throws, and nothing drives it.
- Whether the ten attacks are the ten attacks. Six restart states and two lock
  corpses are what this file can build. The interesting corruption is the one
  nobody thought of, which is the same sentence `test/hermeticity.test.ts` ends
  on.

**Verification.** Full suite 399 pass, 0 fail. `tsc` on the shipped build: 34
type errors before this patch, 33 after, the removed one being a pre-existing bad
import path in this same file, and none added. The suite ran 31.6s before and
30.3s to 32.0s after across four runs, so nothing measurable was added to it.
