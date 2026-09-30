# The first LLM worker

P15 left one sentence unspent:

> a code agent does not produce a `result.json`, it produces a workspace

P13's worker wrote a receipt. P14 made its claims powerless. P15 froze the
workspace so a verifier could only see the freeze. What was still untested is
whether replacing the *decision* inside that worker with a model changes any law
at all. This milestone is that test, and the file that makes it possible is
`src/adapters/llm-producer.ts`.

## The boundary, fixed before anything was written

```text
LLM
 ↓
untrusted producer          ← the only thing the model reaches
 ↓
workspace (mutable)
 ↓
FrozenArtifact              ← the runtime names it, by content
 ↓
independent verifier        ← runs the repository's own tests
```

and never `LLM → State`, `LLM → GoalSatisfied`, `LLM → Verification`.

The model holds no privilege that `test/fixtures/code-worker.ts` does not hold.
It is handed an identity before it runs (`workerEnvironment`), a directory it may
write, and a workspace it may change. There is no path from the producer to the
event store, to affordances, to the fold, or to the verifier: the module imports
`digestOf` from `verify.ts` and nothing else from it, and the suite asserts that
by reading the source rather than by promising it in prose.

What the producer honours from a model is one verb, `write_file`. Every other
tool call and all of the model's prose is discarded unread. That is the
mechanism, not a policy: a boast cannot become a fact if prose is never parsed.

## The four runs

`test/llm-producer.test.ts` drives these with a deterministic `ModelAdapter`
(`test/fixtures/llm/scripted-model.ts`), because a property that can only be
observed when a model misbehaves *by chance* is not a property. A real model is
exercised separately and is not load-bearing.

| run | what the model does | verdict | decided by |
| --- | --- | --- | --- |
| A1 | writes a wrong fix, claims "all tests pass" | `REJECTED` | the repo's tests |
| A2 | writes the right fix, claims "all tests pass" | `VERIFIED` | the repo's tests |
| A3 | writes the right fix, explains it as a race condition in a scheduler | `VERIFIED` | the repo's tests |
| A4 | the provider never returns | `CONFIRMED_FAILED`, origin `provider` | the failure receipt |

A3 is the run that matters most. Every sentence of that explanation is fiction:
a two-line fixture has no scheduler, no race and no mutex. The verdict is
`VERIFIED` because the bytes are right, and the fiction is stored verbatim rather
than corrected, because editing a model's account into shape would be a second
thing deciding what happened.

A4 splits into three distinct answers rather than one, because conflating them is
how a recoverable failure becomes a mystery:

```text
provider never answered        → failure receipt, origin "provider"
model answered, proposed nothing → failure receipt, origin "producer"
producer died after writing     → no receipt at all, outcome INCONCLUSIVE
```

The third is the P12 window, reached through a deliberate seam rather than
described in a comment: the workspace is really fixed and *nothing claims it*,
so the work is recoverable and the effect is unsettled. A producer that returned
without a record here would have made "I did not finish" and "I finished" look
identical from the outside.

## The claim cannot move a verdict

Proved in both directions, so that neither half can be satisfied by a constant:

```text
5 different accounts of the same correct change  → 5 identical verdicts
the same boast over wrong bytes                  → REJECTED
the same boast over right bytes                  → VERIFIED
```

The producer writes `success: true` into every result receipt, unconditionally
and including when the model proposed nothing usable, for the same reason
`code-worker.ts` does: a producer that hedged would be evaluating its own output.
The field exists so that a test can prove that whatever lands in it is powerless.

A regression was injected to check this is not an assertion of faith:
`runAgainstArtifact` was patched to read the producer's claim and return
`VERIFIED` without running anything. Three tests fell; they are named in the
falsification table below.

## Falsification

Each test was verified by breaking the thing it defends, then reverting. All
regressions were reverted; `git status` is clean of them.

| regression injected | tests that fell |
| --- | --- |
| `runAgainstArtifact` trusts `producerClaim.success` | 3: A1, two-sided invariance, loudest boast |
| `placeInWorkspace` escape guard deleted | 2: escape unit, escape at production |
| receipt filed before the `afterApply` window | 1: mid-flight death leaves no receipt |
| `FailingModel` returns a fix instead of throwing | 1: A4 provider attribution |
| producer imports `../core/store.ts` | 1: boundary scan |
| `payloadOf` no longer unwraps `input.input` | 1: provider envelope |
| `CORRECT_ADD` made incorrect | 6 |
| `WRONG_ADD` made correct | 3 |

### One falsification that did not bite, and what it means

Injecting a regression into the pure `verify()` in `src/verify.ts` — making it
return `VERIFIED` whenever `producerClaim.success` is set — left this suite
**entirely green**. That is a real negative result and worth keeping.

The reason is that these runs do not go through `verify()`. They go through
`runAgainstArtifact`, which starts a process in the capture and reads its exit
code. `verify()` is the declarative path, used when a worker's whole output is a
string; it is not on the path a model takes. So the claim's powerlessness here is
not enforced by a runtime check in the verifier — it is enforced by there being
no line from a claim to a verdict. The falsification had to target
`runAgainstArtifact` to prove the guard is real, and it did.

## What the live model actually did

Measured, not assumed. Five runs of `anthropic/claude-sonnet-4-6` through
OpenRouter, each through the real capture and the real oracle:

| run | producer | verdict | note |
| --- | --- | --- | --- |
| 1 | `produced` | `VERIFIED` | kept the original comment |
| 2 | `produced` | `VERIFIED` | comment removed |
| 3 | `produced` | `VERIFIED` | replaced the comment |
| 4 | `produced` | `VERIFIED` | kept the original comment |
| 5 | `produced` | `VERIFIED` | comment removed |

5/5, ~2.6 s per call. The outputs differ, so the fixture is not being echoed back.

Two things were wrong on the first attempt and are worth recording because both
would have produced a green suite over a dead integration:

1. **The model reached for `cat` and never proposed an edit.** `openrouter.ts`
   declares `Tools: node, git, rg, ls, cat, ...`, and the model's first move was
   to read the file — which this producer cannot answer, because it has no tool
   executor. Result: `produced` nothing, `REJECTED`. Correct behaviour, useless
   integration. The repair was to show the model the contents of the file it must
   change, as `Evidence` whose `backing` names the file. The alternative repair
   was an executor, and it was rejected: an executor widens what the model can
   cause to anything it can spell in `argv`, while showing the file contents
   leaves its reach at exactly one verb.
2. **The payload was read at the wrong depth.** `openrouter.ts` hands back the
   provider's whole argument object as `input`, so a real response arrives as
   `{tool, input: {path, contents}}` and the fix was at `input.input`. Reading
   only the flat form made every stub pass and every real provider fail. Both
   shapes are now read, and a test covers each.

The live test skips explicitly when `OPENROUTER_API_KEY` is absent, and asserts
nothing about the model's competence — only that a real verdict was produced
about a real capture. A green test that did nothing is worse than a red one.

## What the model can and cannot break

It can break:

- the workspace, which is why the workspace is frozen before anything decides;
- its own usefulness, by proposing nothing, proposing the wrong thing, or
  explaining it wrongly;
- the run, by crashing after the write and before the receipt.

It cannot break:

- the verdict, which is an exit code from a process in a frozen capture;
- the identity of the artifact, which the runtime computes over bytes it read;
- the boundary, which is a one-verb allowlist plus a path resolution, and is
  asserted against the source of the module;
- attribution, which lives in `work.ts` and was written before any model existed.

## Limits, stated rather than implied

- **The coverage claim is the declared workspace, not the machine.** Unchanged
  from ART-01: a model with filesystem permission could have written outside it.
  This capture cannot see that and does not claim to.
- **One file, one verb, one fixture.** This is a producer that can change a file.
  It cannot read a repository, search it, run a test, or fix a bug that spans
  files. Those are the next measurements, not assumptions, and each one widens
  what a model can cause.
- **The model is shown what it is told it is shown.** `workspaceFiles` is
  declared by the caller, never scanned. A model asked about a file it was not
  given sees nothing of it.
- **Determinism of the model is not assumed anywhere.** The four runs use a
  scripted adapter. The live run is reported, not asserted, because asserting
  `VERIFIED` against a real model would be tuning a test to a provider.
- **Cost and latency are unmeasured here.** ~2.6 s per call on this fixture is
  one measurement on one machine, not a budget.

## Stop criterion

Not triggered. No existing module changed, and the stop criterion's own
definition of success held:

> the LLM must be architecturally boring

It is one verb, one receipt, one hash, and a provider name that appears exactly
once at the edge where a process is started.
