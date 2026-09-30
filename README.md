# cuesheet

Invariants discovered by running a personal agent control plane, extracted once
they have survived contact with real work.

This is deliberately tiny. A handful of primitives, no dependencies.

## Why it exists

A personal setup grows useful behaviour by accident. Sessions in parallel, a
dirty tree that is not abandoned work, an unpushed commit that means the job
is not done, a stale path in a routing table. Each of these started as a local
script and a sentence in a prompt. Each was then a thing that had to be
remembered, and being remembered is not a design.

The split:

```text
personal system      the proving ground, rich and specific
        |
     adapters         translate one runtime into concepts this repo owns
        |
      core            primitives with no name, no path, no user
```

The core does not know who runs it, where their projects live, or what agent
runtime they use. That is enforced by reading `src/core/`, not by intention.

## Admission rule

Nothing enters Core until it has existed as a working local solution and
produced evidence that the problem it solves recurs.

```text
real work -> friction observed -> local solution -> result observed
          -> pattern recurs -> invariant identified
          -> adapter boundary identifiable -> testable primitive -> Core
```

Both halves matter. A primitive with no evidence is speculation. A workaround
that never gets extracted stays a trap for the next person, including the
author.

## Portability

Three levels, deliberately not conflated, because claiming the third while
having the first is how a tool stops working on anyone else's machine:

```text
PORTABLE    the code does not depend on the machine it was written on
INSTALLABLE someone can install it without reading the source
PUBLISHABLE we are ready to promise it works on their machine
```

This repository claims **PORTABLE**, and the claim is a test, not a promise.
`test/portability.test.ts` holds twenty cases across five invariants:

- **PORT-01** no path, home directory, working directory, or I/O module
  appears under `src/core`, and core imports nothing but its own siblings
- **PORT-02** adapters take their roots from the caller; a `homedir()` default
  is allowed only when an option can override it
- **PORT-03** the shim is machine-local and says so; it is asserted rather
  than tolerated
- **PORT-04** a disposable layout shaped nothing like `~/Users/memo/projects`
  is built in a temporary directory and actually read
- **PORT-05** no dependency is declared at all, and no test depends on this
  machine's real projects

PORT-04 is the one that matters. It creates a registry, a category tree and a
git repository under `/tmp/.../srv/people/amina/work/projects`, and reads it
without editing a line. That is the difference between portable and claimed
portable.

The install is still machine-local: `bin/cuesheet` points at
`~/projects/tools/cuesheet`. That is INSTALLABLE-and-not-yet, and the test
records it instead of hiding it. Making the shim resolve its root from the
environment, and shipping an installer, is INSTALLABLE, which is not claimed.

## Layout

```text
src/core/ownership.ts     resolveOwnership(): who may write where. No I/O.
src/core/capability.ts    resolveCapabilities(): requirements at delegation time. No I/O.
src/core/delegation.ts    preflightDelegation(): the gate, composed from the two above.
src/core/store.ts         EventStore: the append-only log a session is.
src/core/loop.ts          runAgentLoop(): observe, compile, infer, act, never trust a claim.
src/core/memory.ts        durable objects and the conditions that wake them.
src/adapters/             the only places allowed to do I/O.
src/state.ts              the fold a view renders. Observes nothing, imports nothing that could.
src/affordances.ts        what the state permits. Pure; the surface asks and renders.
src/projections.ts        one event log, two renderings: interactive, machine.
src/cuesheet.ts           the installed command's dispatcher.
bin/cuesheet              the PATH shim, copied to ~/.local/bin.
test/                     248 tests
```

## The primitive

`resolveOwnership()` decides whether a project can accept a writer, given the
sessions an adapter reports and the project state the caller measured. It
performs no I/O, so it is fully testable without a machine.

```ts
const ownership = resolveOwnership(projects, sessions, states, { now });
const free = availableProjects(ownership);
```

Three rules, each of which is a bug that already happened:

- **A recent session holds the project.** Live owner, not history.
- **A dirty tree holds the project**, with or without a session. Uncommitted
  work means someone started and did not finish. It is never evidence that
  they abandoned it, and never an invitation to clean it up.
- **Unpushed commits hold the project** and set `needsPush`. The next action is
  then PUSH, not IMPLEMENT.

The window is an inference, not a lock: a long single step and an abandoned
session are indistinguishable from outside. The default is deliberately
conservative, because the cost of a false `available` is a corrupted checkout.

The fourth rule is the one that was missing, and it is a fourth rule because a
count that was never read is not a count of zero:

- **A project nobody looked at is held.** An adapter that could not read the
  repository reports `observed: false` with the reason, and the project is held
  on that ground alone. A project absent from the map entirely is also held.
  The earlier version defaulted an unobserved project to zero dirty files and
  zero unpushed commits, which is the one fact that authorises a second writer,
  invented from nothing. The same rule runs through the capability registry: a
  `SKILL.md` that cannot be read is reported as unreadable, never as an absent
  skill, and an unreadable root marks the resolution `registryUnverified` so a
  blocked requirement says absence is not evidence.

## Running it

```bash
npm test
```

The installed command with no arguments opens the chat: one surface, lines
typed as intentions, the tooling serves them. A question the live state can
answer (sessions, capabilities, a session's log) is answered from state;
anything else is a goal, which the admission gate evaluates before the first
inference, and which is then run and persisted event by event. A line starting
with `!` overrides a refusal explicitly, which is owner authority rather than
a bypass.

The subcommands remain for scripts and for people who know the primitive they
want:

```bash
cuesheet projects --root ~/projects/<a> --root ~/projects/<b>
cuesheet gate --requirements brief.json --skill-root ~/.agents/skills
cuesheet capabilities
cuesheet run <goal> --in <dir> --session <id>
cuesheet sessions
cuesheet inspect <session>
cuesheet frontier
```

`--help` works on the tool and on every subcommand, and `--version` prints the
version from `package.json`. `projects` also takes `--format json`, which is
what makes it usable as a sensor rather than something a human has to watch.
In that output an unobserved project's `dirtyFiles` is `null` and its
availability is `held`: never a `0` dressed up as an observation.

To install it, copy `bin/cuesheet` to a directory on your PATH. The shim execs
`src/cuesheet.ts` from this repository and is the only file that knows where
the repo lives.

The raw entry points still work and are what the shim calls: `src/cli.ts`
(ownership and the gate, flag-driven), `src/cli-run.ts` (sessions, subcommand
driven), `src/frontier-cli.ts` (frontier generation), `src/replay.ts`
(historical replay).

Before a worker is briefed, its requirements can be gated:

```bash
cuesheet gate --requirements brief.json --skill-root ~/.agents/skills
```

This resolves the capabilities the brief declares against the live skill
roots, prints a conformance-style verdict, and exits 1 when blocked (2 on a
broken invocation), so it chains into a script as a gate. The declaration
shape and the verdict lines are specified in docs/requirements.md.

A run also exists: `cuesheet run <goal> --in <dir>` starts a session that owns
its own event log, drives a model through OpenRouter, and persists every event
so the session survives its process. It needs `OPENROUTER_API_KEY`; there is
no unauthenticated fallback, on purpose. Shadow mode, which observes real
delegations without blocking them, lives in the OpenCode plugin in
`plugin-opencode/`.

## Not here yet, on purpose

No graph, no scheduler, no agent runtime abstraction, no UI, no config schema.
Each waits for a primitive that needs it. A folder with nothing in it is a
promise nobody has to keep, and it is indistinguishable from a plan.

Adding a second primitive is the next step, and it should be `drift`: detecting
that a document and a repository disagree, which cost real time before it had a
name.
