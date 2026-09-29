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
src/adapters/opencode.ts  OpenCode session storage -> ActiveSession[]
src/cli.ts                reads adapters, prints. All I/O glue lives here.
test/ownership.test.ts    11 tests
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
node src/cli.ts --root ~/projects/<a> --root ~/projects/<b>
node src/cli.ts --minutes 90 --root ~/projects/<a>
```

Before a worker is briefed, its requirements can be gated:

```bash
node src/cli.ts --requirements brief.json --skill-root ~/.agents/skills
```

This resolves the capabilities the brief declares against the live skill
roots, prints a conformance-style verdict, and exits 1 when blocked (2 on a
broken invocation), so it chains into a script as a gate. The declaration
shape and the verdict lines are specified in docs/requirements.md.

## Not here yet, on purpose

No graph, no scheduler, no agent runtime abstraction, no UI, no config schema.
Each waits for a primitive that needs it. A folder with nothing in it is a
promise nobody has to keep, and it is indistinguishable from a plan.

Adding a second primitive is the next step, and it should be `drift`: detecting
that a document and a repository disagree, which cost real time before it had a
name.
