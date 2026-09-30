# Architecture

cuesheet is a set of invariants extracted from a personal agent control plane
once they had survived contact with real work. This document describes the shape
of the system, for an engineer who has not read the conversation that produced
it.

For where each law is tested, see [INVARIANTS.md](INVARIANTS.md). For what each
milestone actually proved, and what it did not, see
[EVIDENCE.md](EVIDENCE.md).

## The chain

Everything in this repository is one loop. Each milestone added a link, and the
links are named here in the order the loop runs.

```text
  REALITY       what an adapter was able to observe about the world
     |
  EVENTS        what was recorded, append-only, once, sequenced
     |
  STATE         what the system kept: one authoritative fold over the log
     |
  AFFORDANCES   what that state permits: derived, never decided by a surface
     |
  CONTROL       a decision committed against the revision it was judged at
     |
  EFFECT REQUEST   what was asked of the world, with the read-set that allowed it
     |
  EXECUTION     a real process, named by an identity minted before it existed
     |
  OBSERVATION   what came back, or what could not be established
     |
  EVENTS        ...and the loop closes
```

The point of the chain is the shape of the arrows, not the boxes. Each arrow is
one-way and carries exactly one kind of claim:

- `REALITY -> EVENTS` is the only place a fact enters. An adapter reports what it
  saw; the core never reaches for the world.
- `EVENTS -> STATE` is a pure fold. Called twice on one log, it agrees.
- `STATE -> AFFORDANCES` is a pure function. An unavailable action is *absent*
  from the list, so no surface can render it as available.
- `AFFORDANCES -> CONTROL` is conditional on a revision, so a decision made
  against a stale state is refused rather than applied.
- `CONTROL -> EXECUTION` mints identity before the world is touched, so a crash
  between the two still leaves something findable.
- `EXECUTION -> OBSERVATION -> EVENTS` never upgrades a claim. An unobserved
  effect stays unobserved.

## The layers

Three directories, and the boundary between them is the load-bearing part of the
design. It is checked by reading `src/`, not by intention.

```text
src/core/          primitives with no name, no path, no user. No I/O, ever.
src/adapters/      the only places allowed to do I/O. Own identity, nothing else.
src/*.ts           the domain: fold, affordances, effects, reconcile, verify.
                   Pure. These import core and nothing that can observe.
```

The rule is stated in `CONTRIBUTING.md` and enforced by `PORT-01`: no module under
`src/core` mentions an absolute user path, reads a home or working directory, or
imports an I/O module, and core imports nothing outside itself. `VIEW-01b` applies
the same reasoning one level up: `src/state.ts` may import the event type and
nothing else, so "a view observes nothing" is a property of its import list rather
than of the author's discipline.

The I/O that had to exist for P15 lives in `src/adapters/artifact-verifier.ts`
and not in `src/verify.ts`, deliberately. The verdict is computed from data by
one module and the world is touched by another, so a reader can tell at a glance
which decisions were made by inspection and which needed the machine.

## Module map

Each row names the module, what it owns, and whether it can observe.

| Module | Owns | I/O |
|---|---|---|
| `src/core/store.ts` | `Event`, `EventStore`, `appendIfCurrent`, `toSession`, `revision` | no |
| `src/core/ownership.ts` | `resolveOwnership`, `availableProjects` | no |
| `src/core/capability.ts` | `resolveCapabilities`, `REGISTRY_UNVERIFIED` | no |
| `src/core/delegation.ts` | `parseRequirements`, `preflightDelegation` | no |
| `src/core/loop.ts` | `runAgentLoop` | no |
| `src/core/memory.ts` | durable objects, `evaluateWake`, `falsify`, `buildFrontier` | no |
| `src/state.ts` | `Observed<T>`, `deriveState`, `stateReport`, `pendingEffect` | no |
| `src/affordances.ts` | `deriveAffordances`, `affordancesOf`, `allows` | no |
| `src/effects.ts` | `effectRequested`, `effectObserved`, `effectStatuses` | no |
| `src/projections.ts` | `InteractiveProjection`, `MachineProjection`, `render` | no |
| `src/spawn.ts` | `mintIdentity`, `workerEnvironment`, `exitIsClean` | no |
| `src/reconcile.ts` | `reconcile`, `settles`, `terminalObservation` | no |
| `src/work.ts` | `readReceipt`, `workOutcomeOf`, `settlesWork` | no |
| `src/verify.ts` | `verify`, `accepts`, `describeVerification`, `digestOf` | no |
| `src/worker.ts` | the first worker: deterministic, cannot declare truth | writes a receipt only |
| `src/adapters/session-store.ts` | durability: `append`, `appendIfCurrent`, `appendFact` | yes |
| `src/adapters/effect-receipts.ts` | `ReceiptStore`, the six-way crash matrix | yes |
| `src/adapters/worker-launcher.ts` | `prepare`, `launch` | yes |
| `src/adapters/artifact-capture.ts` | `capture`, `digestDirectory`, `readCapture`, `COVERAGE_LIMITS` | yes |
| `src/adapters/artifact-verifier.ts` | `runAgainstArtifact` | yes |
| `src/adapters/frontier.ts` | `snapshotPortfolio` | yes |
| `src/adapters/skills.ts`, `shell.ts`, `opencode.ts`, `openrouter.ts` | registry reads, shell, runtime bindings | yes |
| `src/chat.ts`, `cli.ts`, `cli-run.ts`, `cuesheet.ts`, `frontier-cli.ts`, `replay.ts` | surfaces: read state, render, ask | yes (they are the boundary) |

## The vocabulary, and why the gaps in it are deliberate

`Observed<T>` (`src/state.ts:34`) is the type the whole repository rests on:

```ts
type Observed<T> = { known: true; value: T } | { known: false; why: string };
```

An unknown carries no `value` at all, so nothing can read through it and get
`undefined` dressed as a goal (`VIEW-02`). The same reasoning gives
`ProjectObservation` its `{ observed: false; reason }` arm in
`src/core/ownership.ts:64`, and `LogCompleteness` its `"unknown"` default at
`src/state.ts:103`: a boolean completeness would make a caller write `true` or
lie.

Three-state vocabularies are load-bearing rather than cautious:

- `EffectStatus` (`src/effects.ts:83`) is `requested | succeeded | failed`. The
  `requested` arm is what a crash between the two events leaves behind, and it is
  the reason `EFF-07` exists.
- `ReconciliationResult` (`src/reconcile.ts:43`) has five outcomes, and
  `NOT_FOUND` is separated from `CONFIRMED_FAILURE` because a world that forgets
  is indistinguishable from a world where it never ran.
- `VerificationVerdict` (`src/verify.ts:98`) has `INCONCLUSIVE`, and a moved
  artifact is inconclusive rather than rejected: "this is not the artifact I was
  asked about" is a statement about the target, not about the work.

Two rules about staleness, asymmetric on purpose:

```text
a decision goes stale when the state moves    appendIfCurrent(revision)
a fact does not                              appendFact(event)
```

Refusing to record an observed fact because the journal advanced would be
discarding evidence of the world on the grounds that we were busy. Both are still
sequenced at the current revision: one log, one sequence, two rules.

## The four separations that took the most work to hold

These are the properties where the history shows the naive answer winning at
least once. Each is named by its test in `INVARIANTS.md`.

**A view never observes.** `deriveState` and `deriveAffordances` are pure
functions over data. The check is static: no `Date.now`, no `new Date`, no
`execFileSync`, no `readFileSync`, no I/O import.

**Affordances are derived, not decided.** `APPROVE_GOAL` is not "allowed unless
something"; it is absent from the list when there is no staged intention, and no
affordance carries an `enabled` flag for a caller to ignore. A surface that
renders the list cannot render something that is not in it.

**A decision names when it was judged.** Every affordance that reads something
carries the `revision` it was derived at, and the commit is
`appendIfCurrent(expectedRevision, event)`. Null is a refusal that wrote nothing,
so the losing surface re-reads rather than undoing.

**The producer is not the authority.** The worker writes a receipt; Cuesheet
reads the evidence and decides. The artifact is captured and content-addressed by
the runtime, and the verifier runs inside the capture and nowhere else, so the
verdict describes the frozen bytes rather than a workspace that can still change.

## Threat model, as currently claimed

```text
the worker is semantically untrusted
```

Not: a hostile process with unrestricted OS access. `CapturedArtifact` carries a
`doesNotCover` field (`src/adapters/artifact-capture.ts:77`) listing the three
things it cannot prove, and `COVERAGE_LIMITS` sits next to the code rather than in
prose, because a limit that lives in a document is a limit nothing checks.

One distinction worth keeping straight, because the code blurs it in a comment:
the shipped worker has no *code path* to the session store (`WRK-02` checks its
imports), but nothing *confines* it. It inherits the launcher's whole
environment, including `HOME`, and runs as the launching uid. An import is not a
capability. The full statement of where the limit actually is, per platform, with
the wake condition for moving it, is in [threat-model.md](threat-model.md). An OS
sandbox remains a separate piece of work, to be built when a real need appears.

## Entry points

```text
bin/cuesheet            PATH shim; the only file that knows where the repo lives
src/cuesheet.ts         dispatcher for --help, --version and subcommands
src/chat.ts             the interactive surface (gated on process.stdout.isTTY)
src/cli.ts              ownership and the delegation gate
src/cli-run.ts          sessions, subcommand driven
src/frontier-cli.ts     frontier generation
src/replay.ts           historical replay
```

All six carry an `import.meta.url` guard, so each is importable without running
its dispatcher. `LOAD-01` checks that every module under `src` parses and imports,
recursively; it exists because an orphaned brace once stopped `chat.ts` parsing
while all 18 chat tests stayed green, since a subprocess that crashes returns an
empty string and an empty string matches nothing.

## Portability claim

Three levels, deliberately not conflated:

```text
PORTABLE    the code does not depend on the machine it was written on
INSTALLABLE someone can install it without reading the source
PUBLISHABLE we are ready to promise it works on their machine
```

The repository claims **PORTABLE**, and the claim is `test/portability.test.ts`
(20 cases across PORT-01..PORT-05). `PORT-04` is the one that matters: it builds
a registry, a category tree and a git repository under
`/tmp/.../srv/people/amina/work/projects` and reads it without editing a line.
The install is knowingly machine-local and `PORT-03` asserts that rather than
tolerating it.

## Deliberately absent

No graph, no scheduler, no agent runtime abstraction, no UI, no config schema, no
database, no daemon. Each waits for a primitive that needs it. A folder with
nothing in it is a promise nobody has to keep, and it is indistinguishable from a
plan. `package.json` declares zero dependencies and `PORT-05` fails the build if
that changes.
