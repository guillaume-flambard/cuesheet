# cuesheet

Invariants discovered by running a personal agent control plane, extracted once
they have survived contact with real work.

This is deliberately tiny. One primitive, eleven tests, no dependencies.

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

## Layout

```text
src/core/ownership.ts     resolveOwnership(): who may write where. No I/O.
src/core/capability.ts    resolveCapabilities(): requirements at delegation time. No I/O.
src/core/delegation.ts    preflightDelegation(): the gate, composed from the two above.
src/core/store.ts         EventStore: the append-only log a session is.
src/core/loop.ts          runAgentLoop(): observe, compile, infer, act, never trust a claim.
src/core/memory.ts        durable objects and the conditions that wake them.
src/adapters/             the only places allowed to do I/O.
src/cuesheet.ts           the installed command's dispatcher.
bin/cuesheet              the PATH shim, copied to ~/.local/bin.
test/                     137 tests
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
