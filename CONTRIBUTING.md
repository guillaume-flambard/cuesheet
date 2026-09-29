# Contributing to cuesheet

cuesheet is small on purpose. It holds invariants that survived contact with real
work, and it holds nothing else. Read the [README](README.md) first: the
admission rule below is the whole contribution policy, and most pull requests
that get proposed do not satisfy it.

## Prerequisites

- **Node 22 or newer.** The floor is in `package.json` under `engines`.
- **Nothing else.** There are no dependencies and no install step.

## Set up

```bash
npm test
```

That is the whole gate. There is no build, no lint, no typecheck step, because
there is nothing to build, lint or typecheck that the test does not already
cover.

## The gate

```bash
npm test    # node --test, 11 tests
```

`npm test` green is the baseline. Do not leave it red.

## The admission rule

Nothing enters `src/core/` until it has existed as a working local solution and
produced evidence that the problem it solves recurs.

```text
real work -> friction observed -> local solution -> result observed
          -> pattern recurs -> invariant identified
          -> adapter boundary identifiable -> testable primitive -> core
```

This means the most useful contribution is usually not code. It is a description
of a real situation where an agent did the wrong thing, twice, in a way that was
not a one-off. If you can point at that, the primitive can be designed. If you
cannot, a new primitive is speculation, and speculation does not get merged
here.

Both halves of the rule matter. A primitive with no evidence is speculation. A
workaround that never gets extracted stays a trap for the next person, including
the author.

## Architectural rules

1. **`src/core/` performs no I/O.** It takes state as arguments and returns
   state. That is what makes it testable without a machine, and it is checked by
   reading the directory, not by intention.
2. **The core does not know who runs it, where their projects live, or what
   agent runtime they use.** No user names, no absolute paths, no runtime
   specifics. If a primitive needs one of those, it belongs in
   `src/adapters/`, and the adapter translates into concepts the core owns.
3. **The CLI is the only place with I/O glue.** It reads adapters and prints.
   Keep it that way.
4. **A rule is a bug that already happened.** Every rule in
   `resolveOwnership()` exists because it was observed going wrong. A new rule
   needs that story. If you cannot name the incident, it is a preference, and
   preferences do not enter core.

## What a good pull request looks like

- The failure it prevents, described concretely: what was true, what went wrong,
  how often.
- A test that fails without the change. A test that passes either way is
  documentation with a build step.
- No I/O in core, no new dependency, no absolute path.
- A note in the pull request if you believe an existing rule is now wrong. Say
  it there rather than quietly diverging.

## Deliberately not here

No graph, no scheduler, no agent runtime abstraction, no UI, no config schema.
Each waits for a primitive that needs it. A folder with nothing in it is a
promise nobody has to keep, and it is indistinguishable from a plan.

If your contribution needs one of those, open an issue describing the real work
that requires it. That is the evidence the admission rule is asking for.

## License

MIT. See [LICENSE](LICENSE).
