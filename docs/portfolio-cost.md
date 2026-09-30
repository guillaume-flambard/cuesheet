# P2.5 portfolio cost, measured

Measured before any optimisation, on this machine, 2026-09-29. The point is not
that a suite is slow. The point is that a new capability created a concrete
cost, and the cost was never measured, so nobody knew it existed.

## The numbers

| Measurement | Value | How |
|---|---|---|
| Full suite, as measured first | **28.6 s** | `/usr/bin/time -p npm test` |
| Full suite, after the three fixes below | **20.9 s** | same |
| Full suite, with the observation counter added | **30.8 s** | 4.7 s of that is the counter |
| `test/frontier.test.ts` alone | **13.1 s** | same, isolated |
| Repositories probed | **45** | `snapshot().projects.length` |
| Git subprocesses per snapshot | **180** | 45 repos x 4 calls |
| One cold snapshot | **1.9 s to 2.6 s** | three runs, no warm-up gain |
| Portability test (foreign layout) | **82 ms** | 1 repo, so 4 calls |

`28.6 s` and not `72 s`: the earlier figure was measured with `npm test` inside
a command that also staged and committed, so the commit was inside the timing.
The honest number is 28.6 s.

## What dominates

`test/frontier.test.ts` is 13.1 s of a 28.6 s suite, so **46 % of the suite is
one file, and that file reads this machine's real portfolio**. The portability
test that builds a disposable portfolio with one repository takes 82 ms, which
is what the same code costs when it has one repository to ask about.

## Why it is not a cache problem

The obvious reading is "the same snapshot is recomputed", and that reading is
wrong here. A cold snapshot costs ~2.2 s and the second one costs the same, so
there is no warm state to lose and no cache to add. The cost is linear in
repositories: 45 of them, 4 git calls each, 180 subprocesses, 180 process
spawns.

The four calls per repository:

```ts
branch:    git rev-parse --abbrev-ref HEAD
dirty:     git status --porcelain
ahead:     git rev-list --count @{u}..HEAD
hasRemote: git remote
```

Three spawns on the same repository take 33 ms, so the cost is process spawn,
not git work. `git status` is the expensive one on a large working tree, and
`git remote` is a call whose answer almost never changes between two reads in
the same second.

## What this rules out

- **A global cache.** There is no repetition to exploit within a run. A cache
  would only help across runs, and a cached portfolio would be a portfolio that
  is confidently stale, which is the failure this repository exists to prevent.
- **Parallelising the probes.** It would help, and it is the smallest real
  change. Four calls per repo become one call per repo: `git status --porcelain
  --branch` carries the branch, and the rest is derivable. That is a change in
  what is asked, not a cache over what is asked.
- **Not measuring again after changing it.** The number above is the only one
  that means anything, and it is only meaningful against this baseline.

## The one real defect the measurement found

Not performance. `test/frontier.test.ts` calls `snapshotPortfolio()` twice, with
no arguments, so it reads the developer's live portfolio. Every assertion it
makes about "free" and "held" is therefore about the world at that moment: the
suite is not a suite of tests, it is two tests that read whatever the machine
happened to be doing. A developer with a dirty checkout gets a different suite
than a developer with a clean one, and neither failure is reported.

That is the same shape as the defects in the first five commits: a test that
passes by reading a real thing rather than by proving a claim. It is fixed by
injecting the snapshot the same way the adapter was made injectable, which the
portability test already does for a disposable layout.

## Order that follows

1. Stop reading the real portfolio in the test. The suite must be a function of
   its fixtures.
2. Then decide about 180 spawns, with the baseline above to measure against.


## What the measurement actually found

Three things, in the order they turned up, and none of them was the hypothesis
in the section above.

### 1. The tests were not tests

`test/frontier.test.ts` called `snapshotPortfolio()` with no arguments, so it
read the developer's live portfolio. Every assertion about "free" and "held"
was a claim about the world at that moment: a dirty checkout produced a
different suite than a clean one, and neither outcome failed. A suite that
passes by reading a real thing rather than by proving a claim is the same
shape as the defects in the first five commits.

Now: three tests build their own portfolio in a temporary directory, with a
dirty repo, an unpushed repo and a declared-but-absent one. The rendering
tests pass a fixture snapshot, which `buildSnapshotFrontier` already accepted.
`test/frontier.test.ts`: 13.1 s to 4.7 s, and now a function of its fixtures.

### 2. The regression was mine, and it was in the banner

I added a portfolio read to the chat header earlier the same day, so the
surface could say "16 free, 29 held, try: cd ..." instead of only complaining
that the home directory is the wrong place. That read 45 repositories on every
single start, for a greeting. `test/chat.test.ts`, which spawns a real chat per
case, went to **69 s**.

The banner now says what it can do and costs 154 ms. A test asserts the banner
does not read the portfolio, and asserts it under 5 s, because the regression
was invisible: nothing failed, the suite just got slow.

### 3. Two call sites paid for the same observation

`next` and `ownership` each called `snapshotPortfolio()`. Asking "on bosse sur
quoi" and then "projects" in one session paid 180 git subprocesses twice for
the same world, which is the repeated-spend shape exactly.

One observation per session now, shared by both consumers. Not a cache with a
TTL: a portfolio is a statement about now, and carrying one across a process
boundary would make it a statement about whenever it was taken. `chat.test.ts`:
69 s to 12.4 s.

## What is left

20.9 s, down from 28.6 s, with 180 git subprocesses per observation untouched.
The remaining cost is one honest observation of 45 real repositories, and the
next question is whether 4 git calls per repository can be fewer. `git status
--porcelain --branch` carries the branch, and `git remote` is a call whose
answer does not change between two reads in the same session. That is a change
in what is asked, not a cache over what is asked, and it is measured against
the 2.2 s baseline above.

Not doing it now. The cost is bounded, it is measured, and it is not the thing
that was broken.


## The guard is a count, not a duration

The banner was first protected by "under 5 s", which is the wrong instrument:
154 ms against a 5 s budget leaves a slow CI deciding correctness, and this
project already knows that a wall-clock target standing in for a property is
how a thing looks fine and is not.

It is now a count, in test/observation-cost.test.ts:

```text
the banner reads nothing                      0 git calls
the portfolio is read once per session       a multiple of 4, from 180
```

Counting needed a shim on `PATH` rather than a mock, because the chat spawns
git through `execFileSync` inside an adapter and there is no seam to mock
across. The shim costs about 20 ms per call and one portfolio question makes
180, so counting every chat case would have added most of a minute. It runs for
the two assertions that make the claim, and the rest of the surface is asserted
without it.

The first version failed in the useful direction: no git call means no log
file, and reading the missing file threw. The passing case was the one that
broke, which is the right way round for a zero assertion.

The count was verified to still catch the regression it was written for: putting
the banner's portfolio read back makes it fail with 180.

## Two rules this measurement produced

**A deterministic test must not silently acquire new reality.** Filesystem, `$HOME`,
global git config, network, the skill registry, the clock, the environment: a
test that reads any of them is asserting about the world rather than proving a
claim. `test/frontier.test.ts` did, for its whole life, and a dirty checkout
changed the suite without changing a line of it.

**An observation belongs to a decision moment, not to a TTL.** The portfolio is
read once per session and shared by the consumers of that session. Not a cache
with an expiry: an expiry invents freshness that nobody checked, and a portfolio
carried across a process boundary would be a statement about whenever it was
taken rather than about now. If the world changed, the session reads again.

That is the same shape the incremental work needs, and it is the smallest
version of it that is actually true today: observe once, derive many times, and
read again when the moment has passed.
