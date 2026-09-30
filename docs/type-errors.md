# Type-error inventory

The build runs a type check. It emits 33 errors and asserts its own three layout
fixups, so `dist/` is complete and the entry points dispatch. This file says what
those 33 are, because "the compiler complains and the runtime is fine" stopped
being an acceptable position somewhere around the `registry is not defined`
defect, where 352 tests were green and the feature did not work.

Nothing here is fixed in bulk. A single "fix types" commit before an LLM milestone
would make every regression unattributable, and the last three waves found six
real defects that no compiler caught.

## The categories that matter

| Category | Count | Meaning | Risk |
|---|---|---|---|
| `real runtime risk` | 0 found | the compiler found a path the runtime can actually take wrongly | high, fix now |
| `stale type` | 2 | a type says something stricter than the code means, or the reverse | low, fix in passing |
| `adapter mismatch` | 5 | an adapter's declared interface does not match what it returns | medium, it hides a value |
| `test-only` | 0 | an error that exists only in a test file | none |
| `impossible state` | rest | `noUncheckedIndexedAccess` and `strictNullChecks` being strict about code that is guarded | none |

The counts below are from `.typecheck.log`, produced by `bash scripts/build.sh`.

### The two that were mine, and are now fixed

```text
src/effects.ts(323,65): TS2339: Property 'why' does not exist on type 'FailureWithOrigin'
src/adapters/artifact-capture.ts: TS4104 x2, readonly string[] into a mutable field
```

The first is the one worth reading twice. `classifyFailure` read `cause.why` when
`FailureWithOrigin` only had `Error.message`, so an attributed failure reported
`why: undefined` and **fell through to the exception-type rules** — the exact bug
the boundary check was added to prevent, reintroduced one line later.

The seventeen tests around it passed, because they built a structural stand-in
rather than an instance. A test that does not construct the thing it names will
not notice that the thing is broken. `tsc` found it in one line, and it is the
strongest argument in this file for running a type check at all: it is the only
tool in this repository that ever looked at a line no test exercised.

## Per module

| Module | Errors | Category |
|---|---|---|
| `src/adapters/frontier.ts` | 7 | adapter mismatch, and one impossible state |
| `src/adapters/shell.ts` | 5 | adapter mismatch, mostly `noUncheckedIndexedAccess` on argv |
| `src/cli-run.ts` | 5 | stale type, argv indexing under `noUncheckedIndexedAccess` |
| `src/frontier-cli.ts` | 5 | stale type, same shape |
| `src/adapters/openrouter.ts` | 3 | adapter mismatch, response body narrowing |
| `src/cli.ts` | 2 | stale type |
| `src/core/store.ts` | 1 | impossible state: a spread the guard already excludes |
| `src/core/memory.ts` | 1 | stale type |
| `src/core/intent.ts` | 1 | stale type |
| `src/core/loop.ts` | 1 | adapter mismatch |
| `src/chat.ts` | 2 | stale type |
| `src/affordances.ts` | 1 | impossible state |

## Why `strict` is on anyway

The build turns on `strict`, `noUncheckedIndexedAccess` and
`noImplicitOverride`, and emits despite the errors rather than failing. The two
settings are not decoration:

- `noUncheckedIndexedAccess` is what turned `argv[i]` into `string | undefined`,
  which is the real shape. Almost every error above is that, and almost every one
  is a place where a guard already exists and the compiler cannot see it.
- `erasableSyntaxOnly` is load-bearing in a different way: it guarantees the
  source is equivalent to what Node's type stripper produces, which is what makes
  the test suite a valid oracle for the shipped code.

Turning `strict` off would clear 30 of the 33 errors and remove the only tool
that has yet found a defect the tests missed. That is a bad trade, so the errors
stay visible.

## What would justify fixing them in one commit

Not volume. A category. When `real runtime risk` stops being empty, that error
alone gets a commit, and the rest stay. A commit that says "types" is a commit
that hides which change caused which regression, and the last two waves both
found regressions that survived because nobody could tell whose they were.